import type { ShadowChannelPolicy, ShadowMessage } from '@shadowob/sdk'
import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import type { ReplyPayload } from 'openclaw/plugin-sdk'
import { createChannelReplyPipeline } from 'openclaw/plugin-sdk/channel-reply-pipeline'
import type { OpenClawConfig, PluginRuntime } from 'openclaw/plugin-sdk/core'
import type {
  AgentChainMetadata,
  ShadowAccountConfig,
  ShadowRuntimeLogger,
  ShadowSlashCommand,
} from '../types.js'
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
  const serverInfo = channelServerMap.get(channelId)
  const channelContextLines = serverInfo
    ? [
        `Shadow server: ${serverInfo.serverName} (${serverInfo.serverSlug})`,
        `Shadow channel: #${serverInfo.channelName}`,
      ]
    : [`Shadow channel ID: ${channelId}`]
  const bodyWithChannelContext = `${channelContextLines.join('\n')}\n\n${baseBodyForAgent}`
  const bodyForAgent = interactiveResponseContext.text
    ? `${interactiveResponseContext.text}\n\nUser message:\n${bodyWithChannelContext}`
    : bodyWithChannelContext
  const body = core.channel.reply.formatAgentEnvelope({
    channel: 'Shadow',
    from: senderName,
    timestamp: new Date(message.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: bodyForAgent,
  })

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
  const client = new ShadowClient(account.serverUrl, account.token)

  const typingCbs = createTypingCallbacks({
    start: async () => {
      socket.updateActivity(channelId, 'thinking')
    },
    onStartError: (err) => {
      runtime.error?.(`[activity] Failed to publish thinking status: ${String(err)}`)
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
