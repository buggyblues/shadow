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
import { deliverShadowDmReply } from './reply-delivery.js'
import { resolveSessionStore } from './session.js'
import { formatSlashCommandPrompt, matchShadowSlashCommand } from './slash-commands.js'
import { createTypingCallbacks } from './typing.js'

export type ShadowDmMessage = {
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

export async function processShadowDmMessage(params: {
  dmMessage: ShadowDmMessage
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: ShadowRuntimeLogger
  core: PluginRuntime
  botUserId: string
  botUsername: string
  shadowAgentId: string | null
  slashCommands: ShadowSlashCommand[]
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
    slashCommands,
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

  const slashCommandMatch = matchShadowSlashCommand(bodyWithAttachments, slashCommands)
  if (slashCommandMatch) {
    runtime.log?.(
      `[slash] Matched DM /${slashCommandMatch.invokedName} -> /${slashCommandMatch.command.name}`,
    )
  } else if (bodyWithAttachments.trim().startsWith('/')) {
    runtime.log?.(`[slash] Unknown DM slash command in message ${dmMessage.id}; treating as text`)
  }

  const bodyForAgent = slashCommandMatch
    ? formatSlashCommandPrompt(bodyWithAttachments, slashCommandMatch)
    : bodyWithAttachments

  const body = core.channel.reply.formatAgentEnvelope({
    channel: 'Shadow DM',
    from: senderName,
    timestamp: new Date(dmMessage.createdAt).getTime(),
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: bodyForAgent,
  })

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyForAgent,
    RawBody: rawBody,
    CommandBody: slashCommandMatch?.args ?? rawBody,
    From: `shadowob:user:${senderId}`,
    To: `shadowob:dm:${dmChannelId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: 'direct',
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

  try {
    const dispatchAgentId = route.agentId || shadowAgentId
    if (!dispatchAgentId) {
      runtime.error?.(`[dm] Cannot dispatch ${dmMessage.id}: no OpenClaw agent resolved`)
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
          await deliverShadowDmReply({
            payload,
            dmChannelId,
            replyToId: dmMessage.id,
            client,
            runtime,
            agentChain: triggerChain,
            agentId: dispatchAgentId,
            botUserId,
          })
        },
        onError: (err, info) => {
          runtime.error?.(
            `[dm] Reply delivery failed for ${dmMessage.id} (${info.kind}): ${String(err)}`,
          )
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
