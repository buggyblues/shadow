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

import type { ShadowChannelPolicy, ShadowMessage, ShadowRemoteConfig } from '@shadowob/sdk'
import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import { getShadowRuntime } from './runtime.js'
import type {
  CreateTypingCallbacksParams,
  OpenClawConfig,
  PluginRuntime,
  ReplyPayload,
  ShadowAccountConfig,
  TypingCallbacks,
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

// ─── Typing Keepalive ─────────────────────────────────────────────────────

/**
 * Creates typing callbacks with a keepalive loop that periodically re-emits
 * the typing indicator so it stays visible during long AI processing.
 */
function createTypingCallbacks(params: CreateTypingCallbacksParams): TypingCallbacks {
  const {
    start,
    stop,
    onStartError,
    onStopError,
    keepaliveIntervalMs = 3000,
    maxDurationMs = 120_000,
  } = params

  let keepaliveTimer: ReturnType<typeof setInterval> | null = null
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer)
      keepaliveTimer = null
    }
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = null
    }
  }

  return {
    onReplyStart: async () => {
      try {
        await start()
      } catch (err) {
        onStartError(err)
        return
      }

      // Re-emit typing on an interval so the indicator stays visible
      keepaliveTimer = setInterval(async () => {
        try {
          await start()
        } catch (err) {
          onStartError(err)
        }
      }, keepaliveIntervalMs)

      // Safety: auto-stop after max duration
      maxDurationTimer = setTimeout(() => {
        cleanup()
        stop?.().catch((err) => onStopError?.(err))
      }, maxDurationMs)
    },
    onIdle: () => {
      cleanup()
    },
    onCleanup: () => {
      cleanup()
      stop?.().catch((err) => onStopError?.(err))
    },
  }
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
  socket: ShadowSocket
}): Promise<void> {
  const {
    message,
    account,
    accountId,
    config,
    runtime,
    core,
    botUserId,
    botUsername,
    channelPolicies,
    channelServerMap,
    socket,
  } = params
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
      runtime.log?.(
        `[msg] mentionOnly policy — no @${botUsername} mention found, skipping (${message.id})`,
      )
      return
    }
    runtime.log?.(
      `[msg] mentionOnly policy — @${botUsername} mentioned, processing (${message.id})`,
    )
  }

  // Custom policy: replyToUsers — only reply to specific users
  const policyConfig = policy?.config as
    | { replyToUsers?: string[]; keywords?: string[] }
    | undefined
  if (policyConfig?.replyToUsers?.length) {
    const allowedUsers = policyConfig.replyToUsers.map((u) => u.toLowerCase())
    const senderUser = (message.author?.username ?? '').toLowerCase()
    if (!allowedUsers.includes(senderUser)) {
      runtime.log?.(
        `[msg] replyToUsers policy — sender "${senderUser}" not in allowed list, skipping (${message.id})`,
      )
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
    ...(serverInfo
      ? {
          ServerId: serverInfo.serverId,
          ServerSlug: serverInfo.serverSlug,
          ServerName: serverInfo.serverName,
        }
      : {}),
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

  // Build typing callbacks: emit typing indicator during AI processing
  const typingCbs = createTypingCallbacks({
    start: async () => {
      socket.sendTyping(channelId)
    },
    onStartError: (err) => {
      runtime.error?.(`[typing] Failed to send typing indicator: ${String(err)}`)
    },
  })

  // Emit activity: thinking
  socket.updateActivity(channelId, 'thinking')
  // Start typing indicator
  typingCbs.onReplyStart().catch(() => {})

  try {
    if (core.channel.reply.createReplyDispatcherWithTyping) {
      // Use typing-aware dispatcher when available
      const { markDispatchIdle, markRunComplete } =
        core.channel.reply.createReplyDispatcherWithTyping({
          typingCallbacks: typingCbs,
          deliver: async (payload: ReplyPayload) => {
            socket.updateActivity(channelId, 'working')
            await deliverShadowReply({
              payload,
              channelId,
              threadId: message.threadId ?? undefined,
              replyToId: message.id,
              client,
              runtime,
            })
          },
        })

      // Feed through a standard dispatch call that uses the typed dispatcher
      await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          deliver: async (payload: ReplyPayload) => {
            socket.updateActivity(channelId, 'working')
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

      markDispatchIdle()
      markRunComplete()
    } else {
      // Fallback: use standard dispatcher without typing integration
      await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          deliver: async (payload: ReplyPayload) => {
            // Emit activity: working (during reply delivery)
            socket.updateActivity(channelId, 'working')
            // Re-emit typing during delivery
            socket.sendTyping(channelId)

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
    }

    // Emit activity: ready (after reply sent)
    socket.updateActivity(channelId, 'ready')
  } catch (err) {
    runtime.error?.(`[msg] AI dispatch failed for message ${message.id}: ${String(err)}`)
    socket.updateActivity(channelId, null)
    throw err
  } finally {
    // Stop typing keepalive
    typingCbs.onCleanup?.()
    // Auto-clear activity after 3 seconds
    setTimeout(() => {
      socket.updateActivity(channelId, null)
    }, 3000)
  }
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
 * Process an incoming DM message and dispatch to the AI pipeline.
 * Similar to processShadowMessage but for direct messages.
 */
async function processShadowDmMessage(params: {
  dmMessage: {
    id: string
    content: string
    dmChannelId: string
    channelId: string
    authorId: string
    senderId: string
    receiverId: string
    author?: {
      id: string
      username: string
      displayName?: string
      avatarUrl?: string
      isBot?: boolean
    }
    createdAt: string
  }
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  core: PluginRuntime
  botUserId: string
  botUsername: string
  socket: ShadowSocket
}): Promise<void> {
  const { dmMessage, account, accountId, config, runtime, core, botUserId, socket } = params
  const cfg = config as OpenClawConfig

  const senderLabel = dmMessage.author?.username ?? dmMessage.senderId

  // Skip own messages
  if (dmMessage.senderId === botUserId || dmMessage.authorId === botUserId) {
    runtime.log?.(`[dm] Skipping own DM message ${dmMessage.id}`)
    return
  }
  // Skip messages from other bots
  if (dmMessage.author?.isBot) {
    runtime.log?.(`[dm] Skipping bot DM from ${senderLabel} (${dmMessage.id})`)
    return
  }

  runtime.log?.(
    `[dm] Processing DM from ${senderLabel}: "${dmMessage.content.slice(0, 80)}" (${dmMessage.id})`,
  )

  const senderName = dmMessage.author?.displayName ?? dmMessage.author?.username ?? 'Unknown'
  const senderUsername = dmMessage.author?.username ?? ''
  const senderId = dmMessage.senderId
  const rawBody = dmMessage.content
  const dmChannelId = dmMessage.dmChannelId

  // 1. Resolve agent route — use dmChannelId for session isolation
  const peerId = `dm:${dmChannelId}`
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: 'shadowob',
    accountId,
    peer: {
      kind: 'private',
      id: peerId,
    },
  })

  // 2. Build envelope
  const body = core.channel.reply.formatAgentEnvelope({
    channel: 'Shadow DM',
    from: senderName,
    timestamp: new Date(dmMessage.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: rawBody,
  })

  // 3. Build and finalize MsgContext for DM
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `shadowob:user:${senderId}`,
    To: `shadowob:dm:${dmChannelId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: 'dm',
    ConversationLabel: peerId,
    SenderName: senderName,
    SenderId: senderId,
    SenderUsername: senderUsername,
    Provider: 'shadowob',
    Surface: 'shadowob',
    MessageSid: dmMessage.id,
    WasMentioned: true, // Always "mentioned" in DM
    OriginatingChannel: 'shadowob',
    OriginatingTo: `shadowob:dm:${dmChannelId}`,
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
      runtime.error?.(`Failed updating DM session meta: ${String(err)}`)
    },
  })

  // 5. Dispatch to AI + deliver reply via DM
  runtime.log?.(`[dm] Dispatching to AI pipeline for DM message ${dmMessage.id}`)
  const client = new ShadowClient(account.serverUrl, account.token)

  // Build typing callbacks for DM channel
  const typingCbs = createTypingCallbacks({
    start: async () => {
      socket.sendTyping(dmChannelId)
    },
    onStartError: (err) => {
      runtime.error?.(`[dm-typing] Failed to send typing indicator: ${String(err)}`)
    },
  })

  // Start typing indicator
  typingCbs.onReplyStart().catch(() => {})

  try {
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        deliver: async (payload: ReplyPayload) => {
          // Re-emit typing during delivery
          socket.sendTyping(dmChannelId)

          await deliverShadowDmReply({
            payload,
            dmChannelId,
            client,
            runtime,
          })
        },
      },
    })
  } catch (err) {
    runtime.error?.(`[dm] AI dispatch failed for DM message ${dmMessage.id}: ${String(err)}`)
    throw err
  } finally {
    // Stop typing keepalive
    typingCbs.onCleanup?.()
  }
}

/**
 * Deliver a reply to a Shadow DM channel.
 */
async function deliverShadowDmReply(params: {
  payload: ReplyPayload
  dmChannelId: string
  client: ShadowClient
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
}): Promise<void> {
  const { payload, dmChannelId, client, runtime } = params

  try {
    if (!payload.text && !(payload.mediaUrl || payload.mediaUrls?.length)) {
      runtime.error?.('[dm-reply] No text or media in DM reply payload')
      return
    }

    const text = payload.text ?? ''
    runtime.log?.(`[dm-reply] Sending DM reply to channel ${dmChannelId}: "${text.slice(0, 80)}"`)

    if (text) {
      await client.sendDmMessage(dmChannelId, text)
      runtime.log?.(`[dm-reply] DM reply delivered successfully`)
    }

    // Upload media if present
    const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean) as string[]
    if (mediaUrls.length > 0 && !text) {
      // Send placeholder for media-only
      await client.sendDmMessage(dmChannelId, '\u200B')
    }

    runtime.log?.(`[dm-reply] DM reply delivered successfully`)
  } catch (err) {
    runtime.error?.(`[dm-reply] Failed to send DM reply: ${String(err)}`)
  }
}

/**
 * Session cache — persists remote config to disk so restart recovery is faster.
 * Saves to ~/.openclaw/shadow/session-cache-<accountId>.json
 */
async function getSessionCachePath(accountId: string): Promise<string> {
  // @ts-expect-error node:path available at runtime
  const nodePath = await import('node:path')
  // @ts-expect-error node:os available at runtime
  const nodeOs = await import('node:os')
  return nodePath.join(nodeOs.homedir(), '.openclaw', 'shadow', `session-cache-${accountId}.json`)
}

async function saveSessionCache(
  accountId: string,
  data: { remoteConfig: ShadowRemoteConfig; botUserId: string; botUsername: string },
): Promise<void> {
  try {
    // @ts-expect-error node:fs/promises available at runtime
    const fsPromises = await import('node:fs/promises')
    // @ts-expect-error node:path available at runtime
    const nodePath = await import('node:path')
    const cachePath = await getSessionCachePath(accountId)
    await fsPromises.mkdir(nodePath.dirname(cachePath), { recursive: true })
    await fsPromises.writeFile(cachePath, JSON.stringify(data), 'utf-8')
  } catch {
    /* non-critical */
  }
}

async function loadSessionCache(
  accountId: string,
): Promise<{ remoteConfig: ShadowRemoteConfig; botUserId: string; botUsername: string } | null> {
  try {
    // @ts-expect-error node:fs/promises available at runtime
    const fsPromises = await import('node:fs/promises')
    const cachePath = await getSessionCachePath(accountId)
    const raw = await fsPromises.readFile(cachePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
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
  const channelServerMap = new Map<
    string,
    { serverId: string; serverSlug: string; serverName: string }
  >()
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

      // Persist to disk for restart recovery
      void saveSessionCache(accountId, { remoteConfig, botUserId, botUsername: me.username })
    } catch (err) {
      runtime.error?.(`[config] Failed to fetch remote config: ${String(err)}`)

      // Try to load from cached session
      const cached = await loadSessionCache(accountId)
      if (cached) {
        runtime.log?.('[config] Loaded session from cache — using cached config')
        remoteConfig = cached.remoteConfig
        for (const server of remoteConfig.servers) {
          for (const ch of server.channels) {
            channelPolicies.set(ch.id, ch.policy)
            channelServerMap.set(ch.id, {
              serverId: server.id,
              serverSlug: server.slug ?? server.id,
              serverName: server.name,
            })
            if (ch.policy.listen) {
              allChannelIds.push(ch.id)
            }
          }
        }
        runtime.log?.(`[config] Restored ${allChannelIds.length} channel(s) from cache`)
      } else {
        runtime.log?.('[config] No cached session — falling back to monitoring no channels')
      }
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

  const socket = new ShadowSocket({
    serverUrl: account.serverUrl,
    token: account.token,
    transports: ['websocket', 'polling'],
  })

  socket.onConnect(() => {
    runtime.log?.(`[ws] Connected (sid=${socket.raw.id})`)
    // Join all monitored channel rooms
    if (allChannelIds.length === 0) {
      runtime.log?.('[ws] No channels to join — allChannelIds is empty')
    }
    for (const chId of allChannelIds) {
      runtime.log?.(`[ws] Emitting channel:join for ${chId}`)
      socket.joinChannel(chId).then((ack) => {
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

  socket.onConnectError((err) => {
    runtime.error?.(`[ws] Connection error: ${err.message}`)
  })

  socket.onDisconnect((reason) => {
    runtime.log?.(`[ws] Disconnected: ${reason}`)
  })

  socket.raw.io.on('reconnect', (attempt: number) => {
    runtime.log?.(`[ws] Reconnected after ${attempt} attempt(s)`)
  })

  socket.raw.io.on('reconnect_attempt', (attempt: number) => {
    runtime.log?.(`[ws] Reconnect attempt #${attempt}`)
  })

  // Listen for server:joined — bot added to a new server, refresh channels
  socket.on('server:joined', async (data: { serverId: string; agentId?: string }) => {
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
              socket.joinChannel(ch.id).then((ack) => {
                if (ack?.ok) {
                  runtime.log?.(`[ws] ✓ Joined new channel room ${ch.id}`)
                }
              })
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
    (data: {
      agentId: string
      serverId?: string
      channelId?: string | null
      mentionOnly?: boolean
      reply?: boolean
      config?: Record<string, unknown>
    }) => {
      if (data.agentId !== agentId) return
      if (!data.channelId) return
      const mentionOnly = data.mentionOnly ?? false
      runtime.log?.(
        `[ws] Received agent:policy-changed for channel ${data.channelId}: mentionOnly=${mentionOnly}, reply=${data.reply}, config=${JSON.stringify(data.config ?? {})}`,
      )
      const existing = channelPolicies.get(data.channelId)
      if (existing) {
        channelPolicies.set(data.channelId, {
          ...existing,
          mentionOnly,
          reply: data.reply ?? existing.reply,
          config: data.config ?? existing.config,
        })
      } else {
        channelPolicies.set(data.channelId, {
          listen: true,
          reply: data.reply ?? true,
          mentionOnly,
          config: data.config ?? {},
        })
      }
    },
  )

  // Listen for channel:member-added — bot added to a channel, join its room
  socket.on('channel:member-added', (data: { channelId: string; serverId?: string }) => {
    runtime.log?.(
      `[ws] Received channel:member-added: channel ${data.channelId} in server ${data.serverId}`,
    )
    if (!channelPolicies.has(data.channelId)) {
      const defaultPolicy: ShadowChannelPolicy = {
        listen: true,
        reply: true,
        mentionOnly: false,
        config: {},
      }
      channelPolicies.set(data.channelId, defaultPolicy)
      allChannelIds.push(data.channelId)
    }
    socket.joinChannel(data.channelId).then((ack) => {
      if (ack?.ok) {
        runtime.log?.(`[ws] ✓ Joined channel room ${data.channelId} after member-added`)
      }
    })
  })

  // Listen for channel:member-removed — bot removed from a channel, leave its room
  socket.on('channel:member-removed', (data: { channelId: string; serverId?: string }) => {
    runtime.log?.(
      `[ws] Received channel:member-removed: channel ${data.channelId} in server ${data.serverId}`,
    )
    channelPolicies.delete(data.channelId)
    const idx = allChannelIds.indexOf(data.channelId)
    if (idx !== -1) allChannelIds.splice(idx, 1)
    socket.leaveChannel(data.channelId)
    runtime.log?.(`[ws] Left channel room ${data.channelId} after member-removed`)
  })

  // Listen for DM messages (relayed to bot's user room by the server)
  socket.on(
    'dm:message:new',
    (dmMessage: {
      id: string
      content: string
      dmChannelId: string
      channelId: string
      authorId: string
      senderId: string
      receiverId: string
      author?: {
        id: string
        username: string
        displayName?: string
        avatarUrl?: string
        isBot?: boolean
      }
      createdAt: string
    }) => {
      const senderLabel = dmMessage.author?.username ?? dmMessage.senderId
      runtime.log?.(
        `[ws] ← dm:message:new from ${senderLabel} in DM ${dmMessage.dmChannelId}: "${dmMessage.content?.slice(0, 60)}" (${dmMessage.id})`,
      )

      if (stopped) {
        runtime.log?.('[ws] Monitor stopped, ignoring DM message')
        return
      }

      // Retry-aware DM message processing
      const processWithRetry = async (attempt = 0) => {
        try {
          await processShadowDmMessage({
            dmMessage,
            account,
            accountId,
            config,
            runtime,
            core,
            botUserId,
            botUsername: me.username,
            socket,
          })
        } catch (err) {
          const MAX_RETRIES = 2
          runtime.error?.(`[ws] DM processing failed (attempt ${attempt + 1}): ${String(err)}`)
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
            return processWithRetry(attempt + 1)
          }
          runtime.error?.(
            `[ws] DM permanently failed after ${MAX_RETRIES + 1} attempts: ${dmMessage.id}`,
          )
        }
      }
      void processWithRetry()
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

    // Retry-aware message processing
    const processWithRetry = async (attempt = 0) => {
      try {
        await processShadowMessage({
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
        })
      } catch (err) {
        const MAX_RETRIES = 2
        runtime.error?.(`[ws] Message processing failed (attempt ${attempt + 1}): ${String(err)}`)
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          return processWithRetry(attempt + 1)
        }
        runtime.error?.(
          `[ws] Message permanently failed after ${MAX_RETRIES + 1} attempts: ${message.id}`,
        )
      }
    }
    void processWithRetry()
  })

  // Start the socket connection after all listeners are registered
  socket.connect()

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
