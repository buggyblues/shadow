import nodeCrypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import nodePath from 'node:path'
import type { ShadowChannelPolicy, ShadowMessage } from '@shadowob/sdk'
import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import type { ReplyPayload } from 'openclaw/plugin-sdk'
import { createChannelReplyPipeline } from 'openclaw/plugin-sdk/channel-reply-pipeline'
import type { OpenClawConfig, PluginRuntime } from 'openclaw/plugin-sdk/core'
import type {
  AgentChainMetadata,
  ShadowAccountConfig,
  ShadowPolicyConfig,
  ShadowRuntimeLogger,
  ShadowSlashCommand,
} from '../types.js'
import { buildInteractiveResponseContext } from './interactive-response.js'
import { getDataDir } from './paths.js'
import { deliverShadowReply } from './reply-delivery.js'
import { resolveSessionStore } from './session.js'
import {
  formatSlashCommandPrompt,
  matchShadowSlashCommand,
  sendSlashCommandInteractivePrompt,
} from './slash-commands.js'
import { createTypingCallbacks } from './typing.js'

export async function processShadowMessage(params: {
  message: ShadowMessage
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: ShadowRuntimeLogger
  core: PluginRuntime
  botUserId: string
  botUsername: string
  agentId: string | null
  channelPolicies: Map<string, ShadowChannelPolicy>
  channelServerMap: Map<
    string,
    { serverId: string; serverSlug: string; serverName: string; channelName: string }
  >
  slashCommands: ShadowSlashCommand[]
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
    slashCommands,
    socket,
  } = params
  const cfg = config as OpenClawConfig

  const senderLabel = message.author?.username ?? message.authorId

  if (message.authorId === botUserId) {
    runtime.log?.(`[msg] Skipping own message ${message.id}`)
    return
  }

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

  const interactiveResponseContext = await buildInteractiveResponseContext({
    message,
    client: mediaClient,
    runtime,
    slashCommands,
  })

  const slashCommandMatch = matchShadowSlashCommand(cleanBody, slashCommands)
  if (slashCommandMatch) {
    runtime.log?.(
      `[slash] Matched /${slashCommandMatch.invokedName} -> /${slashCommandMatch.command.name}`,
    )
  } else if (cleanBody.trim().startsWith('/')) {
    runtime.log?.(`[slash] Unknown slash command in message ${message.id}; treating as text`)
  }

  const triggerChain = (message as { metadata?: { agentChain?: AgentChainMetadata } }).metadata
    ?.agentChain

  if (
    slashCommandMatch?.command.interaction &&
    !slashCommandMatch.args.trim() &&
    !interactiveResponseContext.text
  ) {
    await sendSlashCommandInteractivePrompt({
      match: slashCommandMatch,
      messageId: message.id,
      channelId,
      threadId: message.threadId ?? undefined,
      client: mediaClient,
      runtime,
      agentId,
      botUserId,
      agentChain: triggerChain,
    })
    return
  }

  const baseBodyForAgent = slashCommandMatch
    ? formatSlashCommandPrompt(cleanBody, slashCommandMatch)
    : cleanBody
  const bodyForAgent = interactiveResponseContext.text
    ? `${interactiveResponseContext.text}\n\nUser message:\n${baseBodyForAgent}`
    : baseBodyForAgent
  const body = core.channel.reply.formatAgentEnvelope({
    channel: 'Shadow',
    from: senderName,
    timestamp: new Date(message.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: bodyForAgent,
  })

  const serverInfo = channelServerMap.get(channelId)
  const escapedBotUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionRegex = new RegExp(`@${escapedBotUsername}(?:\\s|$)`, 'i')
  const wasMentioned = mentionRegex.test(message.content)

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyForAgent,
    RawBody: rawBody,
    CommandBody: slashCommandMatch?.args ?? cleanBody,
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
    ...(slashCommandMatch
      ? {
          SlashCommand: `/${slashCommandMatch.command.name}`,
          SlashCommandName: slashCommandMatch.command.name,
          SlashCommandInvokedName: slashCommandMatch.invokedName,
          SlashCommandArgs: slashCommandMatch.args,
          ...(slashCommandMatch.command.description
            ? { SlashCommandDescription: slashCommandMatch.command.description }
            : {}),
          ...(slashCommandMatch.command.packId
            ? { SlashCommandPackId: slashCommandMatch.command.packId }
            : {}),
          ...(slashCommandMatch.command.sourcePath
            ? { SlashCommandSourcePath: slashCommandMatch.command.sourcePath }
            : {}),
          ...(slashCommandMatch.command.body
            ? { SlashCommandDefinition: slashCommandMatch.command.body }
            : {}),
        }
      : {}),
    ...(account.buddyName ? { BuddyName: account.buddyName } : {}),
    ...(account.buddyId ? { BuddyId: account.buddyId } : {}),
    ...(account.buddyDescription ? { BuddyDescription: account.buddyDescription } : {}),
    ...(message.threadId ? { ThreadId: message.threadId } : {}),
    ...(message.replyToId ? { ReplyToId: message.replyToId } : {}),
    ...interactiveResponseContext.fields,
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

  try {
    const dispatchAgentId = route.agentId || agentId
    if (!dispatchAgentId) {
      runtime.error?.(`[msg] Cannot dispatch ${message.id}: no OpenClaw agent resolved`)
      socket.updateActivity(channelId, null)
      return
    }
    const replyPipeline = createChannelReplyPipeline({
      cfg,
      agentId: dispatchAgentId,
      channel: 'shadowob',
      accountId,
      typingCallbacks: typingCbs,
    })
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        ...replyPipeline,
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
            agentId: dispatchAgentId,
            botUserId,
          })
        },
        onError: (err, info) => {
          runtime.error?.(
            `[msg] Reply delivery failed for ${message.id} (${info.kind}): ${String(err)}`,
          )
        },
      },
    })

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
