/**
 * Shadow message monitor — connects to Shadow's Socket.IO gateway and
 * processes incoming messages through the OpenClaw inbound pipeline.
 *
 * Server/channel configuration is fetched remotely from the Shadow API
 * via GET /api/agents/:id/config. Policies (listen, reply, mentionOnly)
 * are applied per-channel.
 *
 * Pipeline steps:
 *   1. resolveAgentRoute()
 *   2. formatAgentEnvelope()
 *   3. finalizeInboundContext()
 *   4. recordInboundSession()
 *   5. dispatchReplyWithBufferedBlockDispatcher()
 */

import { io as connectSocket, type Socket } from 'socket.io-client'
import { getShadowRuntime } from './runtime.js'
import { ShadowClient } from './shadow-client.js'
import type {
  OpenClawConfig,
  PluginRuntime,
  ReplyPayload,
  ShadowAccountConfig,
  ShadowChannelPolicy,
  ShadowMessage,
  ShadowRemoteConfig,
} from './types.js'

export type ShadowMonitorOptions = {
  account: ShadowAccountConfig
  accountId: string
  config: unknown // OpenClawConfig
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  abortSignal: AbortSignal
}

export type ShadowMonitorResult = {
  stop: () => void
}

/**
 * Process an incoming Shadow message and dispatch to the AI pipeline.
 */
async function processShadowMessage(params: {
  message: ShadowMessage
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  core: PluginRuntime
  botUserId: string
  botUsername: string
  channelPolicies: Map<string, ShadowChannelPolicy>
  channelServerMap: Map<string, { serverId: string; serverSlug: string; serverName: string }>
  socket: Socket
}): Promise<void> {
  const { message, account, accountId, config, runtime, core, botUserId, botUsername, channelPolicies, channelServerMap, socket } =
    params
  const cfg = config as OpenClawConfig

  const senderLabel = message.author?.username ?? message.authorId

  // Skip own messages
  if (message.authorId === botUserId) {
    runtime.log?.(`[msg] Skipping own message ${message.id}`)
    return
  }
  // Skip messages from other bots
  if (message.author?.isBot) {
    runtime.log?.(`[msg] Skipping bot message from ${senderLabel} (${message.id})`)
    return
  }

  const channelId = message.channelId

  // Look up channel policy
  const policy = channelPolicies.get(channelId)

  // If policy exists and listen is false, skip
  if (policy && !policy.listen) {
    runtime.log?.(`[msg] Policy blocks listen for channel ${channelId}, skipping`)
    return
  }

  // If reply is false (disabled/silent mode), skip
  if (policy && !policy.reply) {
    runtime.log?.(`[msg] Policy blocks reply for channel ${channelId}, skipping (${message.id})`)
    return
  }

  // If mentionOnly, check for @mention using bot username
  if (policy?.mentionOnly) {
    const escapedUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const mentionRegex = new RegExp(`@${escapedUsername}(?:\\s|$)`, 'i')
    const wasMentioned = mentionRegex.test(message.content)
    if (!wasMentioned) {
      runtime.log?.(`[msg] mentionOnly policy — no @${botUsername} mention found, skipping (${message.id})`)
      return
    }
    runtime.log?.(`[msg] mentionOnly policy — @${botUsername} mentioned, processing (${message.id})`)
  }

  // Custom policy: replyToUsers — only reply to specific users
  const policyConfig = policy?.config as { replyToUsers?: string[]; keywords?: string[] } | undefined
  if (policyConfig?.replyToUsers?.length) {
    const allowedUsers = policyConfig.replyToUsers.map((u) => u.toLowerCase())
    const senderUser = (message.author?.username ?? '').toLowerCase()
    if (!allowedUsers.includes(senderUser)) {
      runtime.log?.(`[msg] replyToUsers policy — sender "${senderUser}" not in allowed list, skipping (${message.id})`)
      return
    }
  }

  // Custom policy: keywords — only reply when message contains any keyword
  if (policyConfig?.keywords?.length) {
    const lowerContent = message.content.toLowerCase()
    const matched = policyConfig.keywords.some((kw) => lowerContent.includes(kw.toLowerCase()))
    if (!matched) {
      runtime.log?.(`[msg] keywords policy — no matching keyword found, skipping (${message.id})`)
      return
    }
    runtime.log?.(`[msg] keywords policy — keyword matched, processing (${message.id})`)
  }

  runtime.log?.(
    `[msg] Processing message from ${senderLabel}: "${message.content.slice(0, 80)}" (${message.id})`,
  )

  const senderName = message.author?.displayName ?? message.author?.username ?? 'Unknown'
  const senderUsername = message.author?.username ?? ''
  const senderId = message.authorId
  const rawBody = message.content
  const chatType = message.threadId ? 'thread' : 'channel'

  // 1. Resolve agent route — use threadId as sub-conversation for session isolation
  const peerId = message.threadId ? `${channelId}:thread:${message.threadId}` : channelId
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: 'shadowob',
    accountId,
    peer: {
      kind: 'group',
      id: peerId,
    },
  })

  // 2. Build envelope
  const body = core.channel.reply.formatAgentEnvelope({
    channel: 'Shadow',
    from: senderName,
    timestamp: new Date(message.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: rawBody,
  })

  // Extract media URLs from attachments AND from inline markdown images/files
  const attachmentUrls = (message.attachments ?? []).map((a) => a.url).filter(Boolean)

  // Parse markdown for image/file URLs: ![alt](url) and [name](url)
  const markdownMediaRegex = /!?\[[^\]]*\]\(([^)]+)\)/g
  const markdownUrls: string[] = []
  for (const mdMatch of rawBody.matchAll(markdownMediaRegex)) {
    const url = mdMatch[1]!
    // Only include media paths (uploads), not arbitrary links
    if (url.startsWith('/') && url.includes('/uploads/')) {
      markdownUrls.push(url)
    } else if (url.startsWith('http')) {
      markdownUrls.push(url)
    }
  }

  // Merge and deduplicate
  const allRawUrls = [...new Set([...attachmentUrls, ...markdownUrls])]

  // Download media files to local paths for the AI pipeline.
  // OpenClaw's AI reads images/files from MediaPath (local absolute paths),
  // not from MediaUrl (HTTP URLs). We download each file and save locally.
  const mediaClient = new ShadowClient(account.serverUrl, account.token)
  const localMediaPaths: string[] = []
  const localMediaTypes: string[] = []
  const resolvedMediaUrls: string[] = []

  const inferMimeType = (filename: string, headerType?: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      pdf: 'application/pdf',
    }
    return map[ext] ?? headerType ?? 'application/octet-stream'
  }

  if (allRawUrls.length > 0) {
    // Dynamic imports for fs/path (available at Node.js runtime)
    // @ts-expect-error node:fs/promises available at runtime
    const fsPromises = await import('node:fs/promises')
    // @ts-expect-error node:path available at runtime
    const nodePath = await import('node:path')
    // @ts-expect-error node:os available at runtime
    const nodeOs = await import('node:os')
    // @ts-expect-error node:crypto available at runtime
    const nodeCrypto = await import('node:crypto')

    // Save to ~/.openclaw/media/inbound/ (matches OpenClaw convention)
    const mediaDir = nodePath.join(nodeOs.homedir(), '.openclaw', 'media', 'inbound')
    await fsPromises.mkdir(mediaDir, { recursive: true })

    for (const rawUrl of allRawUrls) {
      try {
        const downloaded = await mediaClient.downloadFile(rawUrl)
        const uuid = nodeCrypto.randomUUID()
        const ext = nodePath.extname(downloaded.filename) || '.bin'
        const safeBase = downloaded.filename
          .replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, '_')
          .slice(0, 100)
        const localFilename = `${safeBase}---${uuid}${ext.startsWith('.') ? '' : '.'}${ext}`
        const localPath = nodePath.join(mediaDir, localFilename)
        await fsPromises.writeFile(localPath, new Uint8Array(downloaded.buffer))

        localMediaPaths.push(localPath)
        localMediaTypes.push(inferMimeType(downloaded.filename, downloaded.contentType))

        const baseUrl = account.serverUrl.replace(/\/$/, '')
        resolvedMediaUrls.push(rawUrl.startsWith('/') ? `${baseUrl}${rawUrl}` : rawUrl)

        runtime.log?.(
          `[media] Downloaded ${rawUrl} → ${localPath} (${downloaded.buffer.byteLength} bytes)`,
        )
      } catch (err) {
        runtime.error?.(`[media] Failed to download ${rawUrl}: ${String(err)}`)
      }
    }
  }

  // Build media context fields following OpenClaw convention.
  // MediaPath/MediaPaths = local file paths (primary, used by AI pipeline)
  // MediaUrl/MediaUrls = HTTP URLs (supplementary)
  const mediaCtx: Record<string, unknown> = {}
  if (localMediaPaths.length > 0) {
    mediaCtx.MediaPath = localMediaPaths[0]
    mediaCtx.MediaPaths = localMediaPaths
    mediaCtx.MediaUrl = resolvedMediaUrls[0]
    mediaCtx.MediaUrls = resolvedMediaUrls
    mediaCtx.MediaType = localMediaTypes[0]
    mediaCtx.MediaTypes = localMediaTypes
  }

  // Strip markdown image/file syntax from the text body sent to the AI agent.
  // The images are already provided via MediaPath — no need to send the raw markdown.
  let cleanBody = rawBody
  if (localMediaPaths.length > 0) {
    cleanBody = rawBody
      .replace(/!?\[[^\]]*\]\([^)]*\/uploads\/[^)]+\)/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim()
    // If nothing is left after stripping, set a sensible default
    if (!cleanBody) {
      cleanBody = '[Media attached]'
    }
  }

  // 3. Build and finalize MsgContext
  // Resolve server context from channel → server mapping
  const serverInfo = channelServerMap.get(channelId)
  const escapedBotUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionRegex = new RegExp(`@${escapedBotUsername}(?:\\s|$)`, 'i')
  const wasMentioned = mentionRegex.test(message.content)

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: cleanBody,
    RawBody: rawBody,
    CommandBody: cleanBody,
    From: `shadowob:user:${senderId}`,
    To: `shadowob:channel:${channelId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    ConversationLabel: peerId,
    SenderName: senderName,
    SenderId: senderId,
    SenderUsername: senderUsername,
    Provider: 'shadowob',
    Surface: 'shadowob',
    MessageSid: message.id,
    WasMentioned: wasMentioned,
    OriginatingChannel: 'shadowob',
    OriginatingTo: `shadowob:channel:${channelId}`,
    // Server context — allows the AI agent to know which server it's operating in
    ...(serverInfo ? {
      ServerId: serverInfo.serverId,
      ServerSlug: serverInfo.serverSlug,
      ServerName: serverInfo.serverName,
    } : {}),
    ...(message.threadId ? { ThreadId: message.threadId } : {}),
    ...(message.replyToId ? { ReplyToId: message.replyToId } : {}),
    ...mediaCtx,
  })

  // 4. Record session
  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  })
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`Failed updating session meta: ${String(err)}`)
    },
  })

  // 5. Check reply policy before dispatching
  if (policy && !policy.reply) {
    runtime.log?.(`[msg] Policy blocks reply for channel ${channelId}, skipping dispatch`)
    return
  }

  // 6. Dispatch to AI + deliver reply
  runtime.log?.(`[msg] Dispatching to AI pipeline for message ${message.id}`)
  const client = new ShadowClient(account.serverUrl, account.token)

  // Emit activity: thinking
  socket.emit('presence:activity', { channelId, activity: 'thinking' })

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      deliver: async (payload: ReplyPayload) => {
        // Emit activity: working (during reply delivery)
        socket.emit('presence:activity', { channelId, activity: 'working' })

        await deliverShadowReply({
          payload,
          channelId,
          threadId: message.threadId ?? undefined,
          replyToId: message.id,
          client,
          runtime,
        })
      },
    },
  })

  // Emit activity: ready (after reply sent)
  socket.emit('presence:activity', { channelId, activity: 'ready' })

  // Auto-clear activity after 3 seconds
  setTimeout(() => {
    socket.emit('presence:activity', { channelId, activity: null })
  }, 3000)
}

/**
 * Deliver a reply to a Shadow channel.
 */
async function deliverShadowReply(params: {
  payload: ReplyPayload
  channelId: string
  threadId?: string
  replyToId?: string
  client: ShadowClient
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
}): Promise<void> {
  const { payload, channelId, threadId, replyToId, client, runtime } = params

  try {
    if (!payload.text && !(payload.mediaUrl || payload.mediaUrls?.length)) {
      runtime.error?.('[reply] No text or media in reply payload')
      return
    }

    const text = payload.text ?? ''

    runtime.log?.(`[reply] Sending reply to channel ${channelId}: "${text.slice(0, 80)}"`)

    // Collect media URLs first so we know whether media is present
    const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean) as string[]

    // Send the text message first (or a placeholder if media-only)
    let sentMessage: ShadowMessage | null = null
    // Always create a message when we have media so attachments can be linked
    if (text || mediaUrls.length > 0) {
      const contentToSend = text || '\u200B' // zero-width space placeholder for media-only
      if (threadId) {
        sentMessage = await client.sendToThread(threadId, contentToSend)
      } else {
        sentMessage = await client.sendMessage(channelId, contentToSend, { replyToId })
      }
      runtime.log?.(
        `[reply] Message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}`,
      )
    }

    // Upload media files and attach to the message
    if (mediaUrls.length > 0) {
      const messageId = sentMessage?.id
      for (const mediaUrl of mediaUrls) {
        try {
          runtime.log?.(`[reply] Uploading media: ${mediaUrl}`)
          await client.uploadMediaFromUrl(mediaUrl, messageId)
          runtime.log?.(`[reply] Media uploaded successfully`)
        } catch (err) {
          runtime.error?.(`[reply] Failed to upload media ${mediaUrl}: ${String(err)}`)
        }
      }
    }

    runtime.log?.(`[reply] Reply delivered successfully`)
  } catch (err) {
    runtime.error?.(`[reply] Failed to send reply: ${String(err)}`)
  }
}

/**
 * Main monitor provider for Shadow.
 *
 * Connects to Shadow's Socket.IO gateway and listens for incoming messages.
 * Server/channel info and policies are fetched from the Shadow API.
 */
export async function monitorShadowProvider(
  options: ShadowMonitorOptions,
): Promise<ShadowMonitorResult> {
  const { account, accountId, config, runtime, abortSignal } = options

  const core = getShadowRuntime()
  let stopped = false

  // Probe the bot user to get its ID + agentId
  const client = new ShadowClient(account.serverUrl, account.token)
  const me = await client.getMe()
  const botUserId = me.id

  runtime.log?.(`Shadow bot connected as ${me.username} (${botUserId})`)

  // Resolve agentId: prefer account config, fall back to /api/auth/me response
  const agentId = account.agentId ?? me.agentId ?? null
  if (!agentId) {
    runtime.error?.(
      '[config] Cannot resolve agentId — heartbeat and remote config will be unavailable',
    )
  } else {
    runtime.log?.(`[config] Resolved agentId: ${agentId}`)
  }

  // Fetch remote config (servers, channels, policies)
  let remoteConfig: ShadowRemoteConfig | null = null
  const channelPolicies = new Map<string, ShadowChannelPolicy>()
  const channelServerMap = new Map<string, { serverId: string; serverSlug: string; serverName: string }>()
  const allChannelIds: string[] = []

  if (agentId) {
    try {
      remoteConfig = await client.getAgentConfig(agentId)
      runtime.log?.(`[config] Fetched remote config: ${remoteConfig.servers.length} server(s)`)

      // Build channel → policy map and channel → server map
      for (const server of remoteConfig.servers) {
        runtime.log?.(
          `[config] Server "${server.name}" (${server.id}) — ${server.channels.length} channel(s)`,
        )
        for (const ch of server.channels) {
          channelPolicies.set(ch.id, ch.policy)
          channelServerMap.set(ch.id, {
            serverId: server.id,
            serverSlug: server.slug ?? server.id,
            serverName: server.name,
          })
          // Only join channels where listen is enabled
          if (ch.policy.listen) {
            allChannelIds.push(ch.id)
            runtime.log?.(
              `[config]   ✓ #${ch.name} (${ch.id}) — listen=true reply=${ch.policy.reply} mentionOnly=${ch.policy.mentionOnly}`,
            )
          } else {
            runtime.log?.(`[config]   ✗ #${ch.name} (${ch.id}) — listen=false, skipping`)
          }
        }
      }

      runtime.log?.(
        `[config] Monitoring ${allChannelIds.length} channel(s) across ${remoteConfig.servers.length} server(s)`,
      )
    } catch (err) {
      runtime.error?.(`[config] Failed to fetch remote config: ${String(err)}`)
      runtime.log?.('[config] Falling back to monitoring no channels — add agent to servers first')
    }
  }

  // Start heartbeat reporting
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  if (agentId) {
    const sendHeartbeat = async () => {
      try {
        await client.sendHeartbeat(agentId!)
        runtime.log?.('[heartbeat] Heartbeat sent')
      } catch (err) {
        runtime.error?.(`[heartbeat] Heartbeat failed: ${String(err)}`)
      }
    }
    // Send initial heartbeat
    void sendHeartbeat()
    // Then every 30 seconds
    heartbeatInterval = setInterval(sendHeartbeat, 30_000)
  }

  // Connect to Shadow Socket.IO
  runtime.log?.(`[ws] Connecting to Shadow WebSocket at ${account.serverUrl}`)

  const socket: Socket = connectSocket(account.serverUrl, {
    auth: { token: account.token },
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    runtime.log?.(
      `[ws] Connected (transport=${socket.io.engine?.transport?.name}, sid=${socket.id})`,
    )
    // Join all monitored channel rooms
    if (allChannelIds.length === 0) {
      runtime.log?.('[ws] No channels to join — allChannelIds is empty')
    }
    for (const chId of allChannelIds) {
      runtime.log?.(`[ws] Emitting channel:join for ${chId}`)
      socket.emit('channel:join', { channelId: chId }, (ack: { ok: boolean } | undefined) => {
        if (ack?.ok) {
          runtime.log?.(`[ws] ✓ Joined channel room ${chId} (server confirmed)`)
        } else {
          runtime.log?.(`[ws] channel:join for ${chId} — no ack received (older server?)`)
        }
      })
    }
    runtime.log?.(
      `[ws] Emitted channel:join for ${allChannelIds.length} channel(s), listening for messages`,
    )
  })

  socket.on('connect_error', (err) => {
    runtime.error?.(`[ws] Connection error: ${err.message}`)
  })

  socket.on('disconnect', (reason) => {
    runtime.log?.(`[ws] Disconnected: ${reason}`)
  })

  socket.io.on('reconnect', (attempt) => {
    runtime.log?.(`[ws] Reconnected after ${attempt} attempt(s)`)
  })

  socket.io.on('reconnect_attempt', (attempt) => {
    runtime.log?.(`[ws] Reconnect attempt #${attempt}`)
  })

  // Listen for server:joined — bot added to a new server, refresh channels
  socket.on('server:joined', async (data: { serverId: string; agentId: string }) => {
    if (!agentId) return
    runtime.log?.(`[ws] Received server:joined for server ${data.serverId} — refreshing channels`)

    try {
      const updatedConfig = await client.getAgentConfig(agentId)
      runtime.log?.(`[config] Refreshed config: ${updatedConfig.servers.length} server(s)`)

      // Rebuild channel policies and join new channels
      for (const server of updatedConfig.servers) {
        for (const ch of server.channels) {
          channelServerMap.set(ch.id, {
            serverId: server.id,
            serverSlug: server.slug ?? server.id,
            serverName: server.name,
          })
          if (!channelPolicies.has(ch.id)) {
            channelPolicies.set(ch.id, ch.policy)
            if (ch.policy.listen) {
              allChannelIds.push(ch.id)
              runtime.log?.(`[config] New channel: #${ch.name} (${ch.id}) — joining`)
              socket.emit(
                'channel:join',
                { channelId: ch.id },
                (ack: { ok: boolean } | undefined) => {
                  if (ack?.ok) {
                    runtime.log?.(`[ws] ✓ Joined new channel room ${ch.id}`)
                  }
                },
              )
            }
          } else {
            // Update policy if changed
            channelPolicies.set(ch.id, ch.policy)
          }
        }
      }
      remoteConfig = updatedConfig
    } catch (err) {
      runtime.error?.(`[config] Failed to refresh config after server:joined: ${String(err)}`)
    }
  })

  // Listen for channel:created — new channel added to a server the bot is in
  // With channel member isolation, bots don't auto-join new channels.
  // This event is only sent to non-bot members now, but guard anyway.
  socket.on(
    'channel:created',
    async (data: { id: string; name: string; serverId: string; type: string }) => {
      runtime.log?.(
        `[ws] Received channel:created: #${data.name} (${data.id}) in server ${data.serverId} — ignoring (bot must be explicitly added)`,
      )
    },
  )

  // Listen for agent:policy-changed — update channel policy in real-time
  socket.on(
    'agent:policy-changed',
    (data: { agentId: string; serverId: string; channelId: string; mentionOnly: boolean; reply?: boolean; config?: Record<string, unknown> }) => {
      if (data.agentId !== agentId) return
      runtime.log?.(
        `[ws] Received agent:policy-changed for channel ${data.channelId}: mentionOnly=${data.mentionOnly}, reply=${data.reply}, config=${JSON.stringify(data.config ?? {})}`,
      )
      const existing = channelPolicies.get(data.channelId)
      if (existing) {
        channelPolicies.set(data.channelId, {
          ...existing,
          mentionOnly: data.mentionOnly,
          reply: data.reply ?? existing.reply,
          config: data.config ?? existing.config,
        })
      } else {
        channelPolicies.set(data.channelId, {
          listen: true,
          reply: data.reply ?? true,
          mentionOnly: data.mentionOnly,
          config: data.config ?? {},
        })
      }
    },
  )

  // Listen for channel:member-added — bot added to a channel, join its room
  socket.on(
    'channel:member-added',
    (data: { channelId: string; serverId: string }) => {
      runtime.log?.(
        `[ws] Received channel:member-added: channel ${data.channelId} in server ${data.serverId}`,
      )
      if (!channelPolicies.has(data.channelId)) {
        const defaultPolicy: ShadowChannelPolicy = { listen: true, reply: true, mentionOnly: false, config: {} }
        channelPolicies.set(data.channelId, defaultPolicy)
        allChannelIds.push(data.channelId)
      }
      socket.emit(
        'channel:join',
        { channelId: data.channelId },
        (ack: { ok: boolean } | undefined) => {
          if (ack?.ok) {
            runtime.log?.(`[ws] ✓ Joined channel room ${data.channelId} after member-added`)
          }
        },
      )
    },
  )

  // Listen for channel:member-removed — bot removed from a channel, leave its room
  socket.on(
    'channel:member-removed',
    (data: { channelId: string; serverId: string }) => {
      runtime.log?.(
        `[ws] Received channel:member-removed: channel ${data.channelId} in server ${data.serverId}`,
      )
      channelPolicies.delete(data.channelId)
      const idx = allChannelIds.indexOf(data.channelId)
      if (idx !== -1) allChannelIds.splice(idx, 1)
      socket.emit('channel:leave', { channelId: data.channelId })
      runtime.log?.(`[ws] Left channel room ${data.channelId} after member-removed`)
    },
  )

  // Listen for new messages
  socket.on('message:new', (message: ShadowMessage) => {
    const senderLabel = message.author?.username ?? message.authorId
    runtime.log?.(
      `[ws] ← message:new from ${senderLabel} in channel ${message.channelId}: "${message.content?.slice(0, 60)}" (${message.id})`,
    )

    if (stopped) {
      runtime.log?.('[ws] Monitor stopped, ignoring message')
      return
    }

    // Filter: only process messages from monitored channels
    if (allChannelIds.length > 0 && !allChannelIds.includes(message.channelId)) {
      runtime.log?.(`[ws] Message from unmonitored channel ${message.channelId}, ignoring`)
      return
    }

    // Fire-and-forget: process message without blocking
    void processShadowMessage({
      message,
      account,
      accountId,
      config,
      runtime,
      core,
      botUserId,
      botUsername: me.username,
      channelPolicies,
      channelServerMap,
      socket,
    }).catch((err) => {
      runtime.error?.(`[ws] Message processing failed: ${String(err)}`)
    })
  })

  const stop = () => {
    runtime.log?.('[lifecycle] Stopping Shadow monitor...')
    stopped = true
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    socket.disconnect()
    runtime.log?.('[lifecycle] Shadow monitor stopped')
  }

  abortSignal.addEventListener('abort', stop, { once: true })

  // Keep the monitor alive — return a Promise that resolves only when aborted.
  // Without this, the gateway framework sees startAccount() resolve immediately
  // and triggers an auto-restart loop.
  await new Promise<void>((resolve) => {
    if (abortSignal.aborted) {
      resolve()
      return
    }
    abortSignal.addEventListener('abort', () => resolve(), { once: true })
  })

  return { stop }
}
