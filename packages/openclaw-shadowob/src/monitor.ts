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

import nodeCrypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import nodeOs from 'node:os'
import nodePath from 'node:path'
import type { ShadowChannelPolicy, ShadowMessage, ShadowRemoteConfig } from '@shadowob/sdk'
import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import type { ReplyPayload } from 'openclaw/plugin-sdk'
import type {
  CreateTypingCallbacksParams,
  TypingCallbacks,
} from 'openclaw/plugin-sdk/channel-reply-pipeline'
import type { OpenClawConfig, PluginRuntime } from 'openclaw/plugin-sdk/core'
import { getShadowRuntime } from './runtime.js'
import type { AgentChainMetadata, ShadowAccountConfig, ShadowPolicyConfig } from './types.js'

/**
 * Resolve the OpenClaw data directory.
 * Prefers OPENCLAW_DATA_DIR env var (set by desktop gateway), falls back to ~/.openclaw.
 */
async function getDataDir(): Promise<string> {
  const dataDir = process.env.OPENCLAW_DATA_DIR
  return dataDir || nodePath.join(nodeOs.homedir(), '.openclaw')
}

export type ShadowMonitorOptions = {
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  abortSignal: AbortSignal
}

export type ShadowMonitorResult = {
  stop: () => void
}

function resolveSessionStore(cfg: OpenClawConfig): string | undefined {
  const raw = (cfg as { session?: { store?: unknown } }).session?.store
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const pathValue = (raw as { path?: unknown }).path
    if (typeof pathValue === 'string') return pathValue
  }
  return undefined
}

// ─── Typing Keepalive ─────────────────────────────────────────────────────

function createTypingCallbacks(params: CreateTypingCallbacksParams): TypingCallbacks {
  const {
    start,
    stop,
    onStartError,
    onStopError,
    keepaliveIntervalMs = 2000,
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

      keepaliveTimer = setInterval(async () => {
        try {
          await start()
        } catch (err) {
          onStartError(err)
        }
      }, keepaliveIntervalMs)

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

// ─── Process Channel Message ──────────────────────────────────────────────
async function processShadowMessage(params: {
  message: ShadowMessage
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  core: PluginRuntime
  botUserId: string
  botUsername: string
  agentId: string | null
  channelPolicies: Map<string, ShadowChannelPolicy>
  channelServerMap: Map<
    string,
    { serverId: string; serverSlug: string; serverName: string; channelName: string }
  >
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
    agentId,
    channelPolicies,
    channelServerMap,
    socket,
  } = params
  const cfg = config as OpenClawConfig

  const senderLabel = message.author?.username ?? message.authorId

  if (message.authorId === botUserId) {
    runtime.log?.(`[msg] Skipping own message ${message.id}`)
    return
  }

  // Bot message handling with replyToBuddy policy
  let isProcessingBuddyMessage = false
  if (message.author?.isBot) {
    const policy = channelPolicies.get(message.channelId)
    const policyConfig = policy?.config as ShadowPolicyConfig | undefined

    if (!policyConfig?.replyToBuddy) {
      runtime.log?.(
        `[msg] Skipping bot message from ${senderLabel} (replyToBuddy=false) (${message.id})`,
      )
      return
    }

    const maxDepth = policyConfig.maxBuddyChainDepth ?? 3
    const chainMeta = (message as { metadata?: { agentChain?: AgentChainMetadata } }).metadata
      ?.agentChain
    if (chainMeta) {
      if (chainMeta.depth >= maxDepth) {
        runtime.log?.(
          `[msg] Buddy chain depth ${chainMeta.depth} >= max ${maxDepth}, stopping loop (${message.id})`,
        )
        return
      }

      if (chainMeta.participants?.includes(botUserId)) {
        runtime.log?.(
          `[msg] Already in buddy chain [${chainMeta.participants.join(', ')}], skipping to prevent loop (${message.id})`,
        )
        return
      }

      const senderAgentId = message.author?.id
      if (senderAgentId && policyConfig.buddyBlacklist?.includes(senderAgentId)) {
        runtime.log?.(
          `[msg] Sender agent ${senderAgentId} is in blacklist, skipping (${message.id})`,
        )
        return
      }

      if (
        senderAgentId &&
        policyConfig.buddyWhitelist?.length &&
        !policyConfig.buddyWhitelist.includes(senderAgentId)
      ) {
        runtime.log?.(
          `[msg] Sender agent ${senderAgentId} not in whitelist, skipping (${message.id})`,
        )
        return
      }
    }

    isProcessingBuddyMessage = true
    runtime.log?.(
      `[msg] Processing bot message from ${senderLabel} (replyToBuddy=true) (${message.id})`,
    )
  }

  const channelId = message.channelId
  const policy = channelPolicies.get(channelId)

  if (policy && !policy.listen) {
    runtime.log?.(`[msg] Policy blocks listen for channel ${channelId}, skipping`)
    return
  }

  if (policy && !policy.reply) {
    runtime.log?.(`[msg] Policy blocks reply for channel ${channelId}, skipping (${message.id})`)
    return
  }

  // If mentionOnly, check for @mention using bot username
  let wasMentionedExplicitly = false
  if (policy?.mentionOnly) {
    const escapedUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const mentionRegex = new RegExp(`@${escapedUsername}(?:\\s|$)`, 'i')
    wasMentionedExplicitly = mentionRegex.test(message.content)
    if (!wasMentionedExplicitly) {
      runtime.log?.(
        `[msg] mentionOnly policy — no @${botUsername} mention found, skipping (${message.id})`,
      )
      return
    }
    runtime.log?.(
      `[msg] mentionOnly policy — @${botUsername} mentioned, processing (${message.id})`,
    )
  }

  const policyConfig = policy?.config as ShadowPolicyConfig | undefined
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

  if (policyConfig?.keywords?.length) {
    const lowerContent = message.content.toLowerCase()
    const matched = policyConfig.keywords.some((kw) => lowerContent.includes(kw.toLowerCase()))
    if (!matched) {
      runtime.log?.(`[msg] keywords policy — no matching keyword found, skipping (${message.id})`)
      return
    }
    runtime.log?.(`[msg] keywords policy — keyword matched, processing (${message.id})`)
  }

  // Smart reply: skip if message is targeting someone else
  const smartReplyEnabled = policyConfig?.smartReply !== false
  if (smartReplyEnabled && !isProcessingBuddyMessage && !wasMentionedExplicitly) {
    const mentionPattern = /@([a-zA-Z0-9_\-\u4e00-\u9fa5]+)/g
    const allMentions = message.content.match(mentionPattern) || []
    const mentionsWithoutSelf = allMentions.filter((m) => {
      const mentionedUser = m.slice(1).toLowerCase()
      return mentionedUser !== botUsername.toLowerCase()
    })

    if (allMentions.length > 0 && mentionsWithoutSelf.length === allMentions.length) {
      runtime.log?.(
        `[msg] Smart reply: message @mentions others (${allMentions.join(', ')}) but not @${botUsername}, skipping (${message.id})`,
      )
      return
    }

    const replyToData = (message as { replyTo?: { authorId?: string } }).replyTo
    if (replyToData?.authorId && replyToData.authorId !== botUserId) {
      const selfMentioned = allMentions.some((m) => {
        const mentionedUser = m.slice(1).toLowerCase()
        return mentionedUser === botUsername.toLowerCase()
      })
      if (!selfMentioned) {
        runtime.log?.(
          `[msg] Smart reply: message is a reply to another user (${replyToData.authorId}), not this Buddy, skipping (${message.id})`,
        )
        return
      }
    }
  }

  runtime.log?.(
    `[msg] Processing message from ${senderLabel}: "${message.content.slice(0, 80)}" (${message.id})`,
  )

  const senderName = message.author?.displayName ?? message.author?.username ?? 'Unknown'
  const senderUsername = message.author?.username ?? ''
  const senderId = message.authorId
  const rawBody = message.content
  const chatType = message.threadId ? 'thread' : 'channel'

  const peerId = message.threadId ? `${channelId}:thread:${message.threadId}` : channelId
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: 'shadowob',
    accountId,
    peer: { kind: 'group', id: peerId },
  })

  runtime.log?.(`[routing] Resolved agent: ${route.agentId} (account ${accountId})`)

  const body = core.channel.reply.formatAgentEnvelope({
    channel: 'Shadow',
    from: senderName,
    timestamp: new Date(message.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: rawBody,
  })

  // Extract media URLs from attachments and inline markdown
  const attachmentUrls = (message.attachments ?? []).map((a) => a.url).filter(Boolean)
  const markdownMediaRegex = /!?\[[^\]]*\]\(([^)]+)\)/g
  const markdownUrls: string[] = []
  for (const mdMatch of rawBody.matchAll(markdownMediaRegex)) {
    const url = mdMatch[1]!
    if (url.startsWith('/') && url.includes('/uploads/')) {
      markdownUrls.push(url)
    } else if (url.startsWith('http')) {
      markdownUrls.push(url)
    }
  }

  const allRawUrls = [...new Set([...attachmentUrls, ...markdownUrls])]

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
    const dataDir = await getDataDir()
    const mediaDir = nodePath.join(dataDir, 'media', 'inbound')
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

  const mediaCtx: Record<string, unknown> = {}
  if (localMediaPaths.length > 0) {
    mediaCtx.MediaPath = localMediaPaths[0]
    mediaCtx.MediaPaths = localMediaPaths
    mediaCtx.MediaUrl = resolvedMediaUrls[0]
    mediaCtx.MediaUrls = resolvedMediaUrls
    mediaCtx.MediaType = localMediaTypes[0]
    mediaCtx.MediaTypes = localMediaTypes
  }

  let cleanBody = rawBody
  if (localMediaPaths.length > 0) {
    cleanBody = rawBody
      .replace(/!?\[[^\]]*\]\([^)]*\/uploads\/[^)]+\)/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim()
    if (!cleanBody) cleanBody = '[Media attached]'
  }

  const serverInfo = channelServerMap.get(channelId)
  const escapedBotUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionRegex = new RegExp(`@${escapedBotUsername}(?:\\s|$)`, 'i')
  const wasMentioned = mentionRegex.test(message.content)

  const triggerChain = (message as { metadata?: { agentChain?: AgentChainMetadata } }).metadata
    ?.agentChain

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
    ...(serverInfo
      ? {
          ServerId: serverInfo.serverId,
          ServerSlug: serverInfo.serverSlug,
          ServerName: serverInfo.serverName,
          ChannelName: serverInfo.channelName,
        }
      : {}),
    BotUserId: botUserId,
    BotUsername: botUsername,
    AgentId: route.agentId,
    ChannelId: channelId,
    ...(message.threadId ? { ThreadId: message.threadId } : {}),
    ...(message.replyToId ? { ReplyToId: message.replyToId } : {}),
    ...mediaCtx,
  })

  const storePath = core.channel.session.resolveStorePath(resolveSessionStore(cfg), {
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

  if (policy && !policy.reply) {
    runtime.log?.(`[msg] Policy blocks reply for channel ${channelId}, skipping dispatch`)
    return
  }

  runtime.log?.(`[msg] Dispatching to AI pipeline for message ${message.id}`)
  const client = new ShadowClient(account.serverUrl, account.token)

  const typingCbs = createTypingCallbacks({
    start: async () => {
      socket.sendTyping(channelId)
    },
    onStartError: (err) => {
      runtime.error?.(`[typing] Failed to send typing indicator: ${String(err)}`)
    },
  })

  socket.updateActivity(channelId, 'thinking')
  typingCbs.onReplyStart().catch(() => {})

  try {
    if (core.channel.reply.createReplyDispatcherWithTyping) {
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
              agentChain: triggerChain,
              agentId,
              botUserId,
            })
          },
        })

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
              agentChain: triggerChain,
              agentId,
              botUserId,
            })
          },
        },
      })

      markDispatchIdle()
      markRunComplete()
    } else {
      await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          deliver: async (payload: ReplyPayload) => {
            socket.updateActivity(channelId, 'working')
            socket.sendTyping(channelId)

            await deliverShadowReply({
              payload,
              channelId,
              threadId: message.threadId ?? undefined,
              replyToId: message.id,
              client,
              runtime,
              agentChain: triggerChain,
              agentId,
              botUserId,
            })
          },
        },
      })
    }

    socket.updateActivity(channelId, 'ready')
  } catch (err) {
    runtime.error?.(`[msg] AI dispatch failed for message ${message.id}: ${String(err)}`)
    socket.updateActivity(channelId, null)
    throw err
  } finally {
    typingCbs.onCleanup?.()
    setTimeout(() => {
      socket.updateActivity(channelId, null)
    }, 3000)
  }
}

// ─── Reply Delivery ───────────────────────────────────────────────────────

async function deliverShadowReply(params: {
  payload: ReplyPayload
  channelId: string
  threadId?: string
  replyToId?: string
  client: ShadowClient
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  agentChain?: AgentChainMetadata
  agentId: string | null
  botUserId: string
}): Promise<void> {
  const {
    payload,
    channelId,
    threadId,
    replyToId,
    client,
    runtime,
    agentChain,
    agentId,
    botUserId,
  } = params

  try {
    if (!payload.text && !(payload.mediaUrl || payload.mediaUrls?.length)) {
      runtime.error?.('[reply] No text or media in reply payload')
      return
    }

    const text = payload.text ?? ''
    runtime.log?.(`[reply] Sending reply to channel ${channelId}: "${text.slice(0, 80)}"`)

    const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean) as string[]
    const newAgentChain: AgentChainMetadata | undefined = agentId
      ? {
          agentId,
          depth: (agentChain?.depth ?? 0) + 1,
          participants: [...(agentChain?.participants ?? []), botUserId].filter(
            Boolean,
          ) as string[],
          startedAt: agentChain?.startedAt ?? Date.now(),
          rootMessageId: agentChain?.rootMessageId ?? replyToId,
        }
      : undefined

    let sentMessage: ShadowMessage | null = null
    if (text || mediaUrls.length > 0) {
      const contentToSend = text || '\u200B'
      if (threadId) {
        sentMessage = await client.sendToThread(threadId, contentToSend)
      } else {
        sentMessage = await client.sendMessage(channelId, contentToSend, {
          replyToId,
          metadata: newAgentChain ? { agentChain: newAgentChain } : undefined,
        })
      }
      runtime.log?.(
        `[reply] Message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}${newAgentChain ? ` [chain depth: ${newAgentChain.depth}]` : ''}`,
      )
    }

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

// ─── Process DM Message ───────────────────────────────────────────────────

async function processShadowDmMessage(params: {
  dmMessage: {
    id: string
    content: string
    dmChannelId: string
    channelId: string
    authorId: string
    senderId: string
    receiverId: string
    replyToId?: string | null
    attachments?: { id: string; filename: string; url: string; contentType: string; size: number }[]
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
  shadowAgentId: string | null
  socket: ShadowSocket
}): Promise<void> {
  const {
    dmMessage,
    account,
    accountId,
    config,
    runtime,
    core,
    botUserId,
    botUsername,
    shadowAgentId,
    socket,
  } = params
  const cfg = config as OpenClawConfig

  const senderLabel = dmMessage.author?.username ?? dmMessage.senderId

  if (dmMessage.senderId === botUserId || dmMessage.authorId === botUserId) {
    runtime.log?.(`[dm] Skipping own DM message ${dmMessage.id}`)
    return
  }
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

  const attachments = dmMessage.attachments ?? []
  let bodyWithAttachments = rawBody
  if (attachments.length > 0) {
    const attachmentLines = attachments.map(
      (a) => `[Attachment: ${a.filename} (${a.contentType}): ${a.url}]`,
    )
    bodyWithAttachments = rawBody
      ? `${rawBody}\n${attachmentLines.join('\n')}`
      : attachmentLines.join('\n')
  }

  const peerId = `dm:${dmChannelId}`
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: 'shadowob',
    accountId,
    peer: { kind: 'direct', id: peerId },
  })

  runtime.log?.(`[routing] DM resolved agent: ${route.agentId} (account ${accountId})`)

  const body = core.channel.reply.formatAgentEnvelope({
    channel: 'Shadow DM',
    from: senderName,
    timestamp: new Date(dmMessage.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: bodyWithAttachments,
  })

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyWithAttachments,
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
    WasMentioned: true,
    OriginatingChannel: 'shadowob',
    OriginatingTo: `shadowob:dm:${dmChannelId}`,
    BotUserId: botUserId,
    BotUsername: botUsername,
    AgentId: route.agentId,
    ChannelId: dmChannelId,
  })

  const storePath = core.channel.session.resolveStorePath(resolveSessionStore(cfg), {
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

  runtime.log?.(`[dm] Dispatching to AI pipeline for DM message ${dmMessage.id}`)
  const client = new ShadowClient(account.serverUrl, account.token)
  const triggerChain = (dmMessage as { metadata?: { agentChain?: AgentChainMetadata } }).metadata
    ?.agentChain

  const typingCbs = createTypingCallbacks({
    start: async () => {
      socket.sendDmTyping(dmChannelId)
    },
    onStartError: (err) => {
      runtime.error?.(`[dm-typing] Failed to send typing indicator: ${String(err)}`)
    },
  })

  typingCbs.onReplyStart().catch(() => {})

  try {
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        deliver: async (payload: ReplyPayload) => {
          socket.sendDmTyping(dmChannelId)
          await deliverShadowDmReply({
            payload,
            dmChannelId,
            replyToId: dmMessage.id,
            client,
            runtime,
            agentChain: triggerChain,
            agentId: shadowAgentId,
            botUserId,
          })
        },
      },
    })
  } catch (err) {
    runtime.error?.(`[dm] AI dispatch failed for DM message ${dmMessage.id}: ${String(err)}`)
    throw err
  } finally {
    typingCbs.onCleanup?.()
  }
}

async function deliverShadowDmReply(params: {
  payload: ReplyPayload
  dmChannelId: string
  replyToId?: string
  client: ShadowClient
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  agentChain?: AgentChainMetadata
  agentId: string | null
  botUserId: string
}): Promise<void> {
  const { payload, dmChannelId, replyToId, client, runtime, agentChain, agentId, botUserId } =
    params

  try {
    if (!payload.text && !(payload.mediaUrl || payload.mediaUrls?.length)) {
      runtime.error?.('[dm-reply] No text or media in DM reply payload')
      return
    }

    const text = payload.text ?? ''
    runtime.log?.(`[dm-reply] Sending DM reply to channel ${dmChannelId}: "${text.slice(0, 80)}"`)

    const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean) as string[]
    const newAgentChain: AgentChainMetadata | undefined = agentId
      ? {
          agentId,
          depth: (agentChain?.depth ?? 0) + 1,
          participants: [...(agentChain?.participants ?? []), botUserId].filter(
            Boolean,
          ) as string[],
          startedAt: agentChain?.startedAt ?? Date.now(),
          rootMessageId: agentChain?.rootMessageId ?? replyToId,
        }
      : undefined

    let sentMessage: ShadowMessage | null = null
    if (text || mediaUrls.length > 0) {
      const contentToSend = text || '\u200B'
      sentMessage = await client.sendDmMessage(dmChannelId, contentToSend, {
        replyToId,
        metadata: newAgentChain ? { agentChain: newAgentChain } : undefined,
      })
      runtime.log?.(
        `[dm-reply] DM message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}${newAgentChain ? ` [chain depth: ${newAgentChain.depth}]` : ''}`,
      )
    }

    if (mediaUrls.length > 0) {
      const messageId = sentMessage?.id
      for (const mediaUrl of mediaUrls) {
        try {
          runtime.log?.(`[dm-reply] Uploading media: ${mediaUrl}`)
          await client.uploadMediaFromUrl(mediaUrl, messageId)
          runtime.log?.(`[dm-reply] Media uploaded successfully`)
        } catch (err) {
          runtime.error?.(`[dm-reply] Failed to upload media ${mediaUrl}: ${String(err)}`)
        }
      }
    }

    runtime.log?.(`[dm-reply] DM reply delivered successfully`)
  } catch (err) {
    runtime.error?.(`[dm-reply] Failed to send DM reply: ${String(err)}`)
  }
}

// ─── Session Cache ────────────────────────────────────────────────────────

async function getSessionCachePath(accountId: string): Promise<string> {
  const dataDir = await getDataDir()
  return nodePath.join(dataDir, 'shadow', `session-cache-${accountId}.json`)
}

async function saveSessionCache(
  accountId: string,
  data: { remoteConfig: ShadowRemoteConfig; botUserId: string; botUsername: string },
): Promise<void> {
  try {
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
    const cachePath = await getSessionCachePath(accountId)
    const raw = await fsPromises.readFile(cachePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ─── Main Monitor ─────────────────────────────────────────────────────────

export async function monitorShadowProvider(
  options: ShadowMonitorOptions,
): Promise<ShadowMonitorResult> {
  const { account, accountId, config, runtime, abortSignal } = options

  const core = getShadowRuntime()
  let stopped = false

  const client = new ShadowClient(account.serverUrl, account.token)
  const me = await client.getMe()
  const botUserId = me.id

  runtime.log?.(`Shadow bot connected as ${me.username} (${botUserId})`)

  const agentId = account.agentId ?? me.agentId ?? null
  if (!agentId) {
    runtime.error?.(
      '[config] Cannot resolve agentId — heartbeat and remote config will be unavailable',
    )
  } else {
    runtime.log?.(`[config] Resolved agentId: ${agentId}`)
  }

  let remoteConfig: ShadowRemoteConfig | null = null
  const channelPolicies = new Map<string, ShadowChannelPolicy>()
  const channelServerMap = new Map<
    string,
    { serverId: string; serverSlug: string; serverName: string; channelName: string }
  >()
  const allChannelIds: string[] = []

  if (agentId) {
    try {
      remoteConfig = await client.getAgentConfig(agentId)
      runtime.log?.(`[config] Fetched remote config: ${remoteConfig.servers.length} server(s)`)

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
            channelName: ch.name,
          })
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
      void saveSessionCache(accountId, { remoteConfig, botUserId, botUsername: me.username })
    } catch (err) {
      runtime.error?.(`[config] Failed to fetch remote config: ${String(err)}`)

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
              channelName: ch.name,
            })
            if (ch.policy.listen) allChannelIds.push(ch.id)
          }
        }
        runtime.log?.(`[config] Restored ${allChannelIds.length} channel(s) from cache`)
      } else {
        runtime.log?.('[config] No cached session — falling back to monitoring no channels')
      }
    }
  }

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
    void sendHeartbeat()
    heartbeatInterval = setInterval(sendHeartbeat, 30_000)
  }

  runtime.log?.(`[ws] Connecting to Shadow WebSocket at ${account.serverUrl}`)

  const socket = new ShadowSocket({
    serverUrl: account.serverUrl,
    token: account.token,
    transports: ['websocket', 'polling'],
  })

  socket.onConnect(() => {
    runtime.log?.(`[ws] Connected (sid=${socket.raw.id})`)
    if (allChannelIds.length === 0) {
      runtime.log?.('[ws] No channels to join — allChannelIds is empty')
    }
    for (const chId of allChannelIds) {
      runtime.log?.(`[ws] Emitting channel:join for ${chId}`)
      socket.joinChannel(chId).then((ack) => {
        if (ack?.ok) runtime.log?.(`[ws] ✓ Joined channel room ${chId} (server confirmed)`)
        else runtime.log?.(`[ws] channel:join for ${chId} — no ack received (older server?)`)
      })
    }
    runtime.log?.(
      `[ws] Emitted channel:join for ${allChannelIds.length} channel(s), listening for messages`,
    )

    ;(async () => {
      try {
        const dmChannels = await client.listDmChannels()
        for (const ch of dmChannels) {
          socket.joinDmChannel(ch.id)
          runtime.log?.(`[ws] Joined DM room dm:${ch.id}`)
        }
        runtime.log?.(`[ws] Joined ${dmChannels.length} DM channel room(s)`)
      } catch (err) {
        runtime.error?.(`[ws] Failed to join DM rooms: ${String(err)}`)
      }
    })()
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

  socket.on('server:joined', async (data: { serverId: string; agentId?: string }) => {
    if (!agentId) return
    runtime.log?.(`[ws] Received server:joined for server ${data.serverId} — refreshing channels`)
    try {
      const updatedConfig = await client.getAgentConfig(agentId)
      runtime.log?.(`[config] Refreshed config: ${updatedConfig.servers.length} server(s)`)
      for (const server of updatedConfig.servers) {
        for (const ch of server.channels) {
          channelServerMap.set(ch.id, {
            serverId: server.id,
            serverSlug: server.slug ?? server.id,
            serverName: server.name,
            channelName: ch.name,
          })
          if (!channelPolicies.has(ch.id)) {
            channelPolicies.set(ch.id, ch.policy)
            if (ch.policy.listen) {
              allChannelIds.push(ch.id)
              runtime.log?.(`[config] New channel: #${ch.name} (${ch.id}) — joining`)
              socket.joinChannel(ch.id).then((ack) => {
                if (ack?.ok) runtime.log?.(`[ws] ✓ Joined new channel room ${ch.id}`)
              })
            }
          } else {
            channelPolicies.set(ch.id, ch.policy)
          }
        }
      }
      remoteConfig = updatedConfig
    } catch (err) {
      runtime.error?.(`[config] Failed to refresh config after server:joined: ${String(err)}`)
    }
  })

  socket.on(
    'channel:created',
    async (data: { id: string; name: string; serverId: string; type: string }) => {
      runtime.log?.(
        `[ws] Received channel:created: #${data.name} (${data.id}) in server ${data.serverId} — ignoring (bot must be explicitly added)`,
      )
    },
  )

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
      if (ack?.ok) runtime.log?.(`[ws] ✓ Joined channel room ${data.channelId} after member-added`)
    })
  })

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

  const processedDmIds = new Set<string>()
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
      replyToId?: string | null
      attachments?: {
        id: string
        filename: string
        url: string
        contentType: string
        size: number
      }[]
      author?: {
        id: string
        username: string
        displayName?: string
        avatarUrl?: string
        isBot?: boolean
      }
      createdAt: string
    }) => {
      if (processedDmIds.has(dmMessage.id)) {
        runtime.log?.(`[ws] Skipping duplicate dm:message:new ${dmMessage.id}`)
        return
      }
      processedDmIds.add(dmMessage.id)
      if (processedDmIds.size > 500) {
        const first = processedDmIds.values().next().value
        if (first) processedDmIds.delete(first)
      }

      const senderLabel = dmMessage.author?.username ?? dmMessage.senderId
      runtime.log?.(
        `[ws] ← dm:message:new from ${senderLabel} in DM ${dmMessage.dmChannelId}: "${dmMessage.content?.slice(0, 60)}" (${dmMessage.id})`,
      )

      if (stopped) {
        runtime.log?.('[ws] Monitor stopped, ignoring DM message')
        return
      }

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
            shadowAgentId: agentId,
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

  socket.on('message:new', (message: ShadowMessage) => {
    const senderLabel = message.author?.username ?? message.authorId
    runtime.log?.(
      `[ws] ← message:new from ${senderLabel} in channel ${message.channelId}: "${message.content?.slice(0, 60)}" (${message.id})`,
    )

    if (stopped) {
      runtime.log?.('[ws] Monitor stopped, ignoring message')
      return
    }

    if (allChannelIds.length > 0 && !allChannelIds.includes(message.channelId)) {
      runtime.log?.(`[ws] Message from unmonitored channel ${message.channelId}, ignoring`)
      return
    }

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
          agentId,
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

  socket.connect()

  const stop = () => {
    runtime.log?.('[lifecycle] Stopping Shadow monitor...')
    stopped = true
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    socket.disconnect()
    runtime.log?.('[lifecycle] Shadow monitor stopped')
  }

  abortSignal.addEventListener('abort', stop, { once: true })

  await new Promise<void>((resolve) => {
    if (abortSignal.aborted) {
      resolve()
      return
    }
    abortSignal.addEventListener('abort', () => resolve(), { once: true })
  })

  return { stop }
}
