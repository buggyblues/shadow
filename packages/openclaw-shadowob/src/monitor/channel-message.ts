import type {
  ShadowChannelPolicy,
  ShadowMessage,
  ShadowMessageCard,
  ShadowServerAppIntegration,
} from '@shadowob/sdk'
import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import type { ReplyPayload } from 'openclaw/plugin-sdk'
import { createChannelReplyPipeline } from 'openclaw/plugin-sdk/channel-reply-pipeline'
import type { OpenClawConfig, PluginRuntime } from 'openclaw/plugin-sdk/core'
import {
  formatShadowMentionsForAgent,
  getShadowMessageMentions,
  mentionContextFields,
  mentionsTargetServerApp,
  mentionTargetsBot,
} from '../mentions.js'
import type {
  AgentChainMetadata,
  ShadowAccountConfig,
  ShadowPolicyConfig,
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

type RuntimeTaskCard = ShadowMessageCard & {
  id: string
  kind: 'task'
  title: string
  body?: string
  status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'canceled' | 'transferred'
  priority?: string
  assignee?: {
    userId?: string
    agentId?: string
    label?: string
  }
  source?: Record<string, unknown>
  data?: Record<string, unknown> & {
    task?: {
      workspaceId?: string
    }
  }
  claim?: {
    id?: string
    actor?: {
      userId?: string
      agentId?: string
      label?: string
    }
    expiresAt?: string
  }
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

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function isRuntimeTaskCard(card: ShadowMessageCard): card is RuntimeTaskCard {
  return (
    card.kind === 'task' &&
    typeof card.id === 'string' &&
    typeof card.title === 'string' &&
    typeof card.status === 'string'
  )
}

function isTerminalTaskStatus(status: RuntimeTaskCard['status']) {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'canceled' ||
    status === 'transferred'
  )
}

function taskClaimExpired(card: RuntimeTaskCard) {
  if (!card.claim?.expiresAt) return true
  return new Date(card.claim.expiresAt).getTime() <= Date.now()
}

function findRuntimeTaskCard(message: ShadowMessage, botUserId: string) {
  const cards = message.metadata?.cards
  if (!Array.isArray(cards)) return null
  return (
    cards.find(
      (card): card is RuntimeTaskCard =>
        isRuntimeTaskCard(card) &&
        card.assignee?.userId === botUserId &&
        !isTerminalTaskStatus(card.status),
    ) ?? null
  )
}

function findTaskCardById(message: ShadowMessage | null, cardId: string) {
  const cards = message?.metadata?.cards
  if (!Array.isArray(cards)) return null
  return (
    cards.find((card): card is RuntimeTaskCard => isRuntimeTaskCard(card) && card.id === cardId) ??
    null
  )
}

function taskCardPrompt(message: ShadowMessage, card: RuntimeTaskCard) {
  const workspaceId =
    card.data?.task && typeof card.data.task.workspaceId === 'string'
      ? card.data.task.workspaceId
      : undefined
  const claimId = typeof card.claim?.id === 'string' ? card.claim.id : undefined
  return [
    'Shadow Inbox task:',
    `Task message id: ${message.id}`,
    `Task card id: ${card.id}`,
    claimId ? `Task claim id: ${claimId}` : '',
    workspaceId ? `Task workspace id: ${workspaceId}` : '',
    `Task status: ${card.status}`,
    `Task title: ${card.title}`,
    card.priority ? `Task priority: ${card.priority}` : '',
    card.body ? `Task body:\n${card.body}` : '',
    card.source ? `Task source: ${JSON.stringify(card.source)}` : '',
    claimId
      ? [
          'When calling Shadow Server App commands for this task, bind the call with:',
          `--task-message-id ${message.id} --task-card-id ${card.id} --task-claim-id ${claimId}`,
        ].join('\n')
      : '',
    'When you complete useful work for this task, reply with the concrete result and any next action.',
  ]
    .filter(Boolean)
    .join('\n')
}

function isSenderCommandAuthorized(policyConfig: ShadowPolicyConfig | undefined, senderId: string) {
  const triggerUserIds = normalizeStringList(
    policyConfig?.allowedTriggerUserIds ?? policyConfig?.triggerUserIds,
  )
  if (triggerUserIds.length > 0) return triggerUserIds.includes(senderId)

  const ownerId = typeof policyConfig?.ownerId === 'string' ? policyConfig.ownerId.trim() : ''
  if (ownerId && ownerId === senderId) return true

  const activeTenantIds = normalizeStringList(policyConfig?.activeTenantIds)
  return activeTenantIds.includes(senderId)
}

function resolveOwnerAllowFrom(policyConfig: ShadowPolicyConfig | undefined) {
  const ownerId = typeof policyConfig?.ownerId === 'string' ? policyConfig.ownerId.trim() : ''
  return ownerId ? [ownerId] : undefined
}

type ServerAppPromptRef = {
  appKey: string
  server: string
  label: string
  app?: ShadowServerAppIntegration
  mentioned: boolean
}

const MAX_SERVER_APPS_IN_CONTEXT = 8

function serverAppCommandSummary(app: ShadowServerAppIntegration) {
  return app.manifest.commands
    .slice(0, 6)
    .map(
      (command) =>
        `${command.name}(${command.action}, permission=${command.permission}, approval=${command.approvalMode ?? app.defaultApprovalMode})`,
    )
    .join('; ')
}

function formatInstalledServerAppSummary(ref: ServerAppPromptRef) {
  const app = ref.app
  if (!app) {
    return `- ${ref.label}: appKey=${ref.appKey}, server=${ref.server}${ref.mentioned ? ', mentioned=true' : ''}`
  }
  return [
    `- ${app.name}: appKey=${app.appKey}, server=${ref.server}, defaultPermissions=${app.defaultPermissions.join(',') || 'none'}, defaultApproval=${app.defaultApprovalMode}`,
    app.description ? `  description=${app.description}` : '',
    `  commands=${serverAppCommandSummary(app)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function serverAppContextFields(apps: ShadowServerAppIntegration[]) {
  if (apps.length === 0) return {}
  return {
    ServerApps: apps.map((app) => ({
      id: app.id,
      serverId: app.serverId,
      appKey: app.appKey,
      name: app.name,
      description: app.description,
      defaultPermissions: app.defaultPermissions,
      defaultApprovalMode: app.defaultApprovalMode,
      commands: app.manifest.commands.map((command) => ({
        name: command.name,
        title: command.title,
        description: command.description,
        permission: command.permission,
        action: command.action,
        dataClass: command.dataClass,
        approvalMode: command.approvalMode ?? app.defaultApprovalMode,
      })),
    })),
    ServerAppSummary: apps.map((app) => `${app.name} (${app.appKey})`).join(', '),
  }
}

async function buildServerAppSkillsContext(params: {
  mentions: ReturnType<typeof getShadowMessageMentions>
  client: ShadowClient
  serverInfo: ChannelServerInfo | undefined
  runtime: ShadowRuntimeLogger
}): Promise<{ prompt: string; fields: Record<string, unknown> }> {
  const appRefs = new Map<string, ServerAppPromptRef>()
  const installedApps: ShadowServerAppIntegration[] = []

  if (params.serverInfo) {
    const server = params.serverInfo.serverSlug || params.serverInfo.serverId
    try {
      const apps = await params.client.listServerApps(params.serverInfo.serverId)
      for (const app of apps.filter((item) => item.status !== 'disabled')) {
        installedApps.push(app)
        appRefs.set(`${params.serverInfo.serverId}:${app.appKey}`, {
          appKey: app.appKey,
          server,
          label: app.name,
          app,
          mentioned: false,
        })
      }
    } catch (err) {
      params.runtime.error?.(
        `[server-app] Failed listing apps for ${params.serverInfo.serverId}: ${String(err)}`,
      )
    }
  }

  for (const mention of params.mentions) {
    if (mention.kind !== 'app') continue
    const appKey = mention.appKey ?? mention.targetId
    const server = mention.serverId ?? mention.serverSlug ?? params.serverInfo?.serverId
    if (!appKey || !server) continue
    const key = `${server}:${appKey}`
    const existing = appRefs.get(key)
    appRefs.set(key, {
      ...existing,
      appKey,
      server,
      label: mention.label || mention.sourceToken || mention.token || appKey,
      mentioned: true,
    })
  }
  if (appRefs.size === 0) return { prompt: '', fields: {} }

  const refs = Array.from(appRefs.values()).slice(0, MAX_SERVER_APPS_IN_CONTEXT)
  const documents = await Promise.all(
    refs.map(async (ref) => {
      try {
        const skill = await params.client.getServerAppSkills(ref.server, ref.appKey)
        return [
          `## ${ref.label}`,
          `Server reference: ${ref.server}`,
          `App key: ${ref.appKey}`,
          '',
          skill.markdown,
        ].join('\n')
      } catch (err) {
        params.runtime.error?.(
          `[server-app] Failed loading skills for ${ref.appKey} on ${ref.server}: ${String(err)}`,
        )
        return ''
      }
    }),
  )

  const loaded = documents.filter(Boolean)
  const prompt = [
    'Shadow Server Apps available in this server:',
    ...refs.map(formatInstalledServerAppSummary),
    '',
    'Use these apps when the user asks natural-language questions or tasks that match an installed app name, description, or command capability. Do not wait for the user to say a CLI command or explicitly mention the app.',
    'Operate server apps through the mounted Shadow CLI only so Shadow can bind the Buddy identity, app grants, approval prompts, and policy: run `shadowob app discover --server "<current-server-id-or-slug>" --json` when needed, then `shadowob app call "<appKey>" <command> --server "<current-server-id-or-slug>" --channel-id "<current-channel-id>" --json-input \'<raw-command-input-json>\' --json`. Do not use curl, fetch, raw HTTP routes, or SDK calls for server-app commands.',
    'Shadow App command approvals are system permission prompts, not chat interactive dialogs. Never send a Shadow interactive form/buttons/approval message as a substitute for App command approval, and never call the App approval endpoint yourself as a Buddy. If the CLI returns SERVER_APP_COMMAND_APPROVAL_REQUIRED, tell the user that Shadow opened the approval popup, then stop until a person confirms and asks you to retry.',
    loaded.length > 0 ? 'Injected Shadow Server App Skills:' : '',
    ...loaded,
  ]
    .filter(Boolean)
    .join('\n')

  return { prompt, fields: serverAppContextFields(installedApps) }
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
  let runtimeTaskCard = findRuntimeTaskCard(message, botUserId)
  if (
    runtimeTaskCard &&
    (runtimeTaskCard.status === 'queued' ||
      ((runtimeTaskCard.status === 'claimed' || runtimeTaskCard.status === 'running') &&
        taskClaimExpired(runtimeTaskCard)))
  ) {
    try {
      const claimed = await mediaClient.claimTaskCard(message.id, runtimeTaskCard.id, {
        ttlSeconds: 3600,
        note: 'OpenClaw runtime claimed task',
      })
      runtimeTaskCard = findTaskCardById(claimed, runtimeTaskCard.id) ?? runtimeTaskCard
    } catch (err) {
      runtime.error?.(`[task] Failed claiming task card ${runtimeTaskCard.id}: ${String(err)}`)
      return
    }
  }
  if (runtimeTaskCard && runtimeTaskCard.status === 'claimed') {
    await mediaClient
      .updateTaskCard(message.id, runtimeTaskCard.id, {
        status: 'running',
        note: 'OpenClaw runtime started work',
      })
      .then((updated) => {
        runtimeTaskCard = findTaskCardById(updated, runtimeTaskCard!.id) ?? runtimeTaskCard
      })
      .catch((err) => {
        runtime.error?.(
          `[task] Failed marking task card ${runtimeTaskCard?.id} running: ${String(err)}`,
        )
      })
  }
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
  const commandBody = slashCommandPassThrough ? cleanBody : (slashCommandMatch?.args ?? cleanBody)
  const ownerAllowFrom = resolveOwnerAllowFrom(preflight.policyConfig)
  const structuredMentions = getShadowMessageMentions(message)
  const mentionContext = formatShadowMentionsForAgent(structuredMentions)
  const serverInfo = channelServerMap.get(channelId)
  const channelLabel = serverInfo ? `#${serverInfo.channelName}` : `channel:${channelId}`
  const conversationLabel = serverInfo ? `${serverInfo.serverName} ${channelLabel}` : peerId
  const messageBodyForAgent = interactiveResponseContext.text || baseBodyForAgent
  const client = new ShadowClient(account.serverUrl, account.token)
  const serverAppContext = await buildServerAppSkillsContext({
    mentions: structuredMentions,
    client,
    serverInfo,
    runtime,
  })
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
    serverAppContext.prompt,
    runtimeTaskCard ? taskCardPrompt(message, runtimeTaskCard) : '',
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
    mentionsTargetServerApp(structuredMentions) ||
    Boolean(slashCommandMatch) ||
    mentionRegex.test(message.content)

  const taskSessionKey = runtimeTaskCard
    ? `${route.sessionKey}:task:${runtimeTaskCard.id}`
    : route.sessionKey
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: bodyForAgent,
    RawBody: rawBody,
    CommandBody: commandBody,
    BodyForCommands: commandBody,
    CommandAuthorized: isSenderCommandAuthorized(preflight.policyConfig, senderId),
    CommandSource: 'text',
    From: `shadowob:user:${senderId}`,
    To: `shadowob:channel:${channelId}`,
    SessionKey: taskSessionKey,
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
    ...serverAppContext.fields,
    OriginatingChannel: 'shadowob',
    OriginatingTo: `shadowob:channel:${channelId}`,
    NativeChannelId: channelId,
    ...(ownerAllowFrom ? { OwnerAllowFrom: ownerAllowFrom } : {}),
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
    ...(runtimeTaskCard
      ? {
          TaskCardId: runtimeTaskCard.id,
          TaskCardTitle: runtimeTaskCard.title,
          TaskCardStatus: runtimeTaskCard.status,
          TaskCardPriority: runtimeTaskCard.priority,
        }
      : {}),
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

    if (runtimeTaskCard) {
      await client
        .updateTaskCard(message.id, runtimeTaskCard.id, {
          status: 'completed',
          note: 'OpenClaw runtime completed reply dispatch',
        })
        .catch((err) => {
          runtime.error?.(
            `[task] Failed marking task card ${runtimeTaskCard?.id} completed: ${String(err)}`,
          )
        })
    }

    socket.updateActivity(channelId, 'ready')
  } catch (err) {
    runtime.error?.(`[msg] AI dispatch failed for message ${message.id}: ${String(err)}`)
    if (runtimeTaskCard) {
      await client
        .updateTaskCard(message.id, runtimeTaskCard.id, {
          status: 'failed',
          note: `OpenClaw runtime failed: ${String(err)}`.slice(0, 4000),
        })
        .catch((updateErr) => {
          runtime.error?.(
            `[task] Failed marking task card ${runtimeTaskCard?.id} failed: ${String(updateErr)}`,
          )
        })
    }
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
