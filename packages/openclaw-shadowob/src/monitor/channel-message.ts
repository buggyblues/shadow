import type { ShadowChannelPolicy, ShadowMessage } from '@shadowob/sdk'
import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import type { ReplyPayload } from 'openclaw/plugin-sdk'
import { createChannelReplyPipeline } from 'openclaw/plugin-sdk/channel-reply-pipeline'
import type { OpenClawConfig, PluginRuntime } from 'openclaw/plugin-sdk/core'
import {
  formatShadowMentionsForAgent,
  getShadowMessageMentions,
  mentionContextFields,
  mentionTargetsBot,
} from '../mentions.js'
import type {
  AgentChainMetadata,
  ShadowAccountConfig,
  ShadowRuntimeLogger,
  ShadowSlashCommand,
} from '../types.js'
import {
  buildCommerceContextForAgent,
  buildCommerceViewerContextForAgent,
  commerceContextFields,
} from './commerce-context.js'
import { buildInteractiveResponseContext } from './interactive-response.js'
import { resolveShadowInboundMediaContext } from './media.js'
import { evaluateShadowMessagePreflight } from './preflight.js'
import { deliverShadowReply } from './reply-delivery.js'
import { resolveSessionStore } from './session.js'
import {
  formatSlashCommandPrompt,
  matchShadowSlashCommand,
  sendSlashCommandInteractivePrompt,
} from './slash-commands.js'
import { upsertShadowThreadBinding } from './thread-bindings.js'
import { createTypingCallbacks } from './typing.js'
import { reportShadowUsageSnapshot } from './usage-reporting.js'

type ChannelServerInfo = {
  serverId: string
  serverSlug: string
  serverName: string
  channelName: string
}

function buildChannelContextForAgent(info: ChannelServerInfo | undefined, channelId: string) {
  if (!info) return `Shadow channel id: ${channelId}`
  return [
    `Shadow server: ${info.serverName}`,
    `Shadow server slug: ${info.serverSlug}`,
    `Shadow channel: #${info.channelName}`,
    `Shadow channel id: ${channelId}`,
  ].join('\n')
}

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
  channelServerMap: Map<string, ChannelServerInfo>
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

  const preflight = evaluateShadowMessagePreflight({
    message,
    botUserId,
    botUsername,
    channelPolicies,
    runtime,
  })
  if (!preflight.ok) {
    runtime.log?.(preflight.reason)
    return
  }

  const { senderLabel } = preflight
  const channelId = message.channelId

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

  const mediaClient = new ShadowClient(account.serverUrl, account.token)
  const mediaContext = await resolveShadowInboundMediaContext({
    account,
    message,
    rawBody,
    runtime,
  })
  const cleanBody = mediaContext.cleanBody

  const interactiveResponseContext = await buildInteractiveResponseContext({
    message,
    client: mediaClient,
    runtime,
    slashCommands,
  })

  const slashCommandMatch = matchShadowSlashCommand(cleanBody, slashCommands)
  const slashCommandPassThrough = slashCommandMatch?.command.dispatch === 'passthrough'
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

  const baseBodyForAgent =
    slashCommandMatch && !slashCommandPassThrough
      ? formatSlashCommandPrompt(cleanBody, slashCommandMatch)
      : cleanBody
  const structuredMentions = getShadowMessageMentions(message)
  const mentionContext = formatShadowMentionsForAgent(structuredMentions)
  const serverInfo = channelServerMap.get(channelId)
  const channelLabel = serverInfo ? `#${serverInfo.channelName}` : `channel:${channelId}`
  const conversationLabel = serverInfo ? `${serverInfo.serverName} ${channelLabel}` : peerId
  const messageBodyForAgent = interactiveResponseContext.text || baseBodyForAgent
  const client = new ShadowClient(account.serverUrl, account.token)
  const viewerCommerceContext = await buildCommerceViewerContextForAgent({
    account,
    client,
    viewerUserId: senderId,
  })
  const bodyForAgent = [
    buildChannelContextForAgent(serverInfo, channelId),
    buildCommerceContextForAgent(account),
    viewerCommerceContext,
    mentionContext,
    messageBodyForAgent,
  ]
    .filter(Boolean)
    .join('\n\n')
  const body = core.channel.reply.formatAgentEnvelope({
    channel: serverInfo ? `Shadow ${channelLabel}` : 'Shadow',
    from: senderName,
    timestamp: new Date(message.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: bodyForAgent,
  })

  const escapedBotUsername = botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionRegex = new RegExp(`@${escapedBotUsername}(?:\\s|$)`, 'i')
  const wasMentioned =
    mentionTargetsBot({ mentions: structuredMentions, botUserId, botUsername }) ||
    mentionRegex.test(message.content)

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyForAgent,
    RawBody: rawBody,
    CommandBody: slashCommandPassThrough ? cleanBody : (slashCommandMatch?.args ?? cleanBody),
    From: `shadowob:user:${senderId}`,
    To: `shadowob:channel:${channelId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    ConversationLabel: conversationLabel,
    SenderName: senderName,
    SenderId: senderId,
    SenderUsername: senderUsername,
    Provider: 'shadowob',
    Surface: 'shadowob',
    MessageSid: message.id,
    WasMentioned: wasMentioned,
    ...mentionContextFields(structuredMentions),
    OriginatingChannel: 'shadowob',
    OriginatingTo: `shadowob:channel:${channelId}`,
    ...(serverInfo
      ? {
          ServerId: serverInfo.serverId,
          ServerSlug: serverInfo.serverSlug,
          ServerName: serverInfo.serverName,
          ChannelName: serverInfo.channelName,
          ChannelLabel: channelLabel,
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
    ...commerceContextFields(account),
    ...(message.threadId ? { ThreadId: message.threadId } : {}),
    ...(message.replyToId ? { ReplyToId: message.replyToId } : {}),
    ...interactiveResponseContext.fields,
    ...mediaContext.fields,
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

  const bindingSessionKey =
    typeof ctxPayload.SessionKey === 'string' ? ctxPayload.SessionKey : route.sessionKey
  if (route.agentId && bindingSessionKey) {
    await upsertShadowThreadBinding({
      accountId,
      agentId: route.agentId,
      sessionKey: bindingSessionKey,
      channelId,
      ...(message.threadId ? { threadId: message.threadId } : {}),
      messageId: message.id,
    }).catch((err) => {
      runtime.error?.(`[session] Failed updating thread binding: ${String(err)}`)
    })
  }

  runtime.log?.(`[msg] Dispatching to AI pipeline for message ${message.id}`)

  const typingCbs = createTypingCallbacks({
    start: async () => {
      socket.sendTyping(channelId)
    },
    stop: async () => {
      socket.sendTyping(channelId, false)
    },
    onStartError: (err) => {
      runtime.error?.(`[typing] Failed to send typing indicator: ${String(err)}`)
    },
    onStopError: (err) => {
      runtime.error?.(`[typing] Failed to clear typing indicator: ${String(err)}`)
    },
    maxDurationMs: 120_000,
  })

  socket.updateActivity(channelId, 'thinking')
  const activityTimeout = setTimeout(() => {
    runtime.log?.(`[activity] Clearing stale activity for message ${message.id}`)
    socket.updateActivity(channelId, null)
  }, 120_000)

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
    const dispatchStartedAt = Date.now()
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      replyOptions: {
        sourceReplyDeliveryMode: 'automatic',
      },
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
    await reportShadowUsageSnapshot({
      client,
      shadowAgentId: agentId,
      openClawAgentId: dispatchAgentId,
      sessionKey: bindingSessionKey,
      runtime,
      sinceMs: dispatchStartedAt,
    }).catch((err) => {
      runtime.error?.(`[usage] Failed to report usage snapshot for ${message.id}: ${String(err)}`)
    })

    socket.updateActivity(channelId, 'ready')
  } catch (err) {
    runtime.error?.(`[msg] AI dispatch failed for message ${message.id}: ${String(err)}`)
    socket.updateActivity(channelId, null)
    throw err
  } finally {
    clearTimeout(activityTimeout)
    typingCbs.onCleanup?.()
    setTimeout(() => {
      socket.updateActivity(channelId, null)
    }, 3000)
  }
}
