import type {
  ShadowBuddyInboxSummary,
  ShadowChannelPolicy,
  ShadowMessage,
  ShadowMessageCard,
  ShadowMessageCopilotContext,
  ShadowServerAppIntegration,
} from '@shadowob/sdk'
import { isMessageCopilotContext, ShadowClient, ShadowSocket } from '@shadowob/sdk'
import type { ReplyPayload } from 'openclaw/plugin-sdk'
import { createChannelReplyPipeline } from 'openclaw/plugin-sdk/channel-reply-pipeline'
import type { OpenClawConfig, PluginRuntime } from 'openclaw/plugin-sdk/core'
import {
  formatShadowMentionsForAgent,
  getShadowMessageMentions,
  mentionContextFields,
  mentionedBuddyIds,
  mentionsTargetServerApp,
  mentionTargetsBuddy,
} from '../mentions.js'
import type {
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
import { taskCardTargetsBuddy } from './task-card-routing.js'
import {
  loadShadowThreadBindings,
  resolveShadowThreadBinding,
  upsertShadowThreadBinding,
} from './thread-bindings.js'
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
    task?: Record<string, unknown> & {
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

type BuddyThreadCoordination = {
  rootMessageId: string
  threadId: string
  buddyUserIds: string[]
  reactionEmoji: string
}

export const OPENCLAW_RUNTIME_REPLY_PROGRESS_NOTE =
  'OpenClaw runtime delivered a reply; awaiting explicit task completion'

export function openClawRuntimeReplyProgressUpdate() {
  return {
    status: 'running' as const,
    note: OPENCLAW_RUNTIME_REPLY_PROGRESS_NOTE,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function formatJsonContext(label: string, value: unknown, maxLength = 5000) {
  if (value === undefined || value === null) return ''
  let text: string
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  const bounded = text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
  return `${label}:\n${bounded}`
}

function buddyDiscussionThreadName(content: string) {
  const preview = content.replace(/\s+/g, ' ').trim().slice(0, 80)
  return preview || 'Buddy discussion'
}

function reactionUserIds(group: unknown): string[] {
  if (!isRecord(group)) return []
  const value = Array.isArray(group.userIds)
    ? group.userIds
    : Array.isArray(group.users)
      ? group.users
      : []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

async function coordinateBuddyThreadFirstReply(params: {
  client: ShadowClient
  message: ShadowMessage
  buddyUserId: string
  runtime: ShadowRuntimeLogger
}): Promise<
  { ok: true; coordination: BuddyThreadCoordination } | { ok: false; reason: string } | null
> {
  if (params.message.threadId) return null
  const buddyUserIds = mentionedBuddyIds(getShadowMessageMentions(params.message))
  if (buddyUserIds.length < 2 || !buddyUserIds.includes(params.buddyUserId)) return null

  try {
    const thread = await params.client.ensureMessageThread(params.message.id, {
      name: buddyDiscussionThreadName(params.message.content),
    })
    const reactionEmoji = '\u{1F44C}'
    await params.client.addReaction(params.message.id, reactionEmoji)
    const reactions = await params.client.getReactions(params.message.id)
    const group = reactions.find((item) => item.emoji === reactionEmoji)
    const firstBuddyUserId = reactionUserIds(group).find((userId) => buddyUserIds.includes(userId))
    if (firstBuddyUserId !== params.buddyUserId) {
      return {
        ok: false,
        reason: `[multi-buddy] ${params.buddyUserId} is not first ${reactionEmoji} reactor for ${params.message.id}`,
      }
    }
    return {
      ok: true,
      coordination: {
        rootMessageId: params.message.id,
        threadId: thread.id,
        buddyUserIds,
        reactionEmoji,
      },
    }
  } catch (error) {
    params.runtime.error?.(
      `[multi-buddy] Failed coordinating thread reaction for ${params.message.id}: ${String(error)}`,
    )
    return {
      ok: false,
      reason: `[multi-buddy] reaction coordination failed (${params.message.id})`,
    }
  }
}

function formatBuddyThreadCoordinationPrompt(coordination: BuddyThreadCoordination | null) {
  if (!coordination) return ''
  return [
    'Shadow multi-Buddy Thread context:',
    `- Root message id: ${coordination.rootMessageId}`,
    `- Thread id: ${coordination.threadId}`,
    `- Coordination reaction: ${coordination.reactionEmoji}`,
    '- You are the first mentioned Buddy that sent the coordination reaction, so give one concise first reply in this Thread.',
    '- Other mentioned Buddies will remain silent after their reaction.',
    '- Do not send acknowledgement-only text such as "I agree" or "no extra input".',
  ].join('\n')
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

function findRuntimeTaskCard(
  message: ShadowMessage,
  identity: { buddyUserId: string; buddyId?: string | null },
) {
  const cards = message.metadata?.cards
  if (!Array.isArray(cards)) return null
  return (
    cards.find(
      (card): card is RuntimeTaskCard =>
        isRuntimeTaskCard(card) &&
        taskCardTargetsBuddy(card, identity) &&
        !isTerminalTaskStatus(card.status),
    ) ?? null
  )
}

function findTargetedRuntimeTaskCard(
  message: ShadowMessage,
  identity: { buddyUserId: string; buddyId?: string | null },
) {
  const cards = message.metadata?.cards
  if (!Array.isArray(cards)) return null
  return (
    cards.find(
      (card): card is RuntimeTaskCard =>
        isRuntimeTaskCard(card) && taskCardTargetsBuddy(card, identity),
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

function taskData(card: RuntimeTaskCard) {
  return isRecord(card.data?.task) ? card.data.task : null
}

function taskRuntimeBinding(card: RuntimeTaskCard) {
  const task = taskData(card)
  return isRecord(task?.runtimeBinding) ? task.runtimeBinding : null
}

function taskReplyThreadId(card: RuntimeTaskCard) {
  return stringValue(taskData(card)?.threadId)
}

function taskParentTaskRef(message: ShadowMessage, card: RuntimeTaskCard) {
  const threadId = taskReplyThreadId(card)
  if (!threadId) return null
  return {
    messageId: message.id,
    cardId: card.id,
    channelId: message.channelId,
    threadId,
  }
}

async function recoverRuntimeTaskCardForThread(params: {
  client: ShadowClient
  message: ShadowMessage
  buddyUserId: string
  buddyId?: string | null
  runtime: ShadowRuntimeLogger
}) {
  const { client, message, buddyUserId, buddyId, runtime } = params
  if (!message.threadId) return null

  try {
    const thread = await client.getThread(message.threadId)
    if (thread.channelId !== message.channelId) return null
    const parentMessage = await client.getMessage(thread.parentMessageId)
    const card = findRuntimeTaskCard(parentMessage, { buddyUserId, buddyId })
    if (!card || taskReplyThreadId(card) !== message.threadId) return null
    return { message: parentMessage, card }
  } catch (err) {
    runtime.log?.(
      `[task] Could not recover task context for thread ${message.threadId}: ${String(err)}`,
    )
    return null
  }
}

function formatTaskContextPack(task: Record<string, unknown> | null) {
  const contextPack = isRecord(task?.contextPack) ? task.contextPack : null
  const items = Array.isArray(contextPack?.items) ? contextPack.items : []
  const lines = items
    .slice(-12)
    .map((item, index) => {
      if (!isRecord(item)) return null
      const text = stringValue(item.text) ?? stringValue(item.summary)
      if (!text) return null
      const fields = [
        `${index + 1}. ${stringValue(item.kind) ?? 'context'}`,
        stringValue(item.messageId) ? `message=${stringValue(item.messageId)}` : '',
        stringValue(item.authorId) ? `author=${stringValue(item.authorId)}` : '',
        stringValue(item.createdAt) ? `at=${stringValue(item.createdAt)}` : '',
      ].filter(Boolean)
      return `${fields.join(' ')}\n${text}`
    })
    .filter((line): line is string => Boolean(line))
  if (lines.length === 0) return ''

  const omitted = Array.isArray(contextPack?.omitted)
    ? contextPack.omitted
        .map((item) => (isRecord(item) ? stringValue(item.reason) : undefined))
        .filter((reason): reason is string => Boolean(reason))
    : []

  return [
    'Task context pack (recent conversation before task creation):',
    ...lines,
    omitted.length > 0 ? `Omitted context: ${omitted.join('; ')}` : '',
    'Use the context pack when answering the task. Do not claim the task has no prior context unless the context pack is empty.',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatTaskDetails(card: RuntimeTaskCard) {
  const binding = taskRuntimeBinding(card)
  const taskCard = isRecord(binding?.taskCard) ? binding.taskCard : null
  return [
    formatJsonContext('Task app', card.app),
    formatJsonContext('Task source', card.source),
    formatJsonContext('Task requirements', card.requirements),
    formatJsonContext('Task output contract', card.outputContract),
    formatJsonContext('Task privacy', card.privacy),
    formatJsonContext('Task structured card context', taskCard, 7000),
  ]
    .filter(Boolean)
    .join('\n')
}

function formatTaskStatusControl(message: ShadowMessage, card: RuntimeTaskCard) {
  const task = taskData(card)
  const binding = taskRuntimeBinding(card)
  const runningCommand =
    stringValue(binding?.runningCommand) ??
    `shadowob inbox update ${message.id} ${card.id} --status running --note "Started" --json`
  const completedCommand =
    stringValue(binding?.completedCommand) ??
    `shadowob inbox update ${message.id} ${card.id} --status completed --note "<short result>" --json`
  const failedCommand =
    stringValue(binding?.failedCommand) ??
    `shadowob inbox update ${message.id} ${card.id} --status failed --note "<reason>" --json`
  const threadId = stringValue(task?.threadId) ?? stringValue(binding?.threadId)

  return [
    'Shadow Task status control:',
    stringValue(binding?.instruction) ??
      'Update Shadow task status with shadowob inbox update. Send ordinary discussion to the task thread.',
    'Task replies and comments are discussion, not Inbox status transitions.',
    'The Shadow Task Card status is controlled only by Shadow Inbox task APIs/CLI/UI.',
    'Do not use any domain App command to mark this Shadow Task Card running, completed, failed, canceled, or transferred.',
    'Apps may be used only for the domain work requested by the task body, not for Shadow Task Card status.',
    'Task replies and comments alone do not complete or reopen the task card.',
    threadId ? `Send ordinary task discussion replies to Shadow thread id: ${threadId}.` : '',
    `When starting work, update the task card: ${runningCommand}`,
    `When the work is complete, update the task card: ${completedCommand}`,
    `If the work cannot be completed, update the task card: ${failedCommand}`,
    'After updating status, reply with the concrete result and any next action.',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatTaskDelegationControl(message: ShadowMessage, card: RuntimeTaskCard) {
  const parentTask = taskParentTaskRef(message, card)
  if (!parentTask) return ''
  const parentTaskJson = JSON.stringify(parentTask)
  return [
    'Shadow delegated task routing:',
    'When delegating sub-work to another Buddy Inbox from this task, include this parent task reference so the result returns to this task thread.',
    `Parent task JSON: ${parentTaskJson}`,
    `Example: shadowob inbox enqueue --server "<current-server-id-or-slug>" --agent "<target-agent-id>" --title "<subtask-title>" --body "<subtask-body>" --parent-task-json '${parentTaskJson}' --json`,
    'Do not ask the worker Buddy to report back by free-form channel text; task completion will be routed back through this parent task thread.',
  ].join('\n')
}

function taskCardPrompt(message: ShadowMessage, card: RuntimeTaskCard) {
  const task = taskData(card)
  const workspaceId = stringValue(task?.workspaceId)
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
    formatTaskDetails(card),
    claimId
      ? [
          'When calling Shadow App commands for this task, bind the call with:',
          `--task-message-id ${message.id} --task-card-id ${card.id} --task-claim-id ${claimId}`,
        ].join('\n')
      : '',
    formatTaskContextPack(task),
    formatTaskStatusControl(message, card),
    formatTaskDelegationControl(message, card),
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
  copilot: boolean
}

const MAX_SERVER_APPS_IN_CONTEXT = 8
const MAX_BUDDY_INBOXES_IN_CONTEXT = 12

export type BuddyInboxDirectoryDescriptor = {
  agentId: string
  ownerId: string
  displayName: string | null
  username: string | null
  status: string | null
  channelId: string | null
  channelName: string | null
  canManage: boolean
  current: boolean
  serverId: string | null
  serverSlug: string | null
  serverName: string | null
}

function promptValue(value: string | null | undefined, fallback = 'unknown') {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 160) : fallback
}

function buddyInboxDirectoryFields(entries: BuddyInboxDirectoryDescriptor[], truncated: boolean) {
  if (entries.length === 0) return {}
  return {
    ServerBuddyInboxCount: entries.length,
    ServerBuddyInboxDirectoryTruncated: truncated,
    ServerBuddyInboxes: entries,
    ServerBuddyInboxSummary: entries
      .map((entry) => {
        const label = entry.displayName || entry.username || entry.agentId
        return `${label}(${entry.agentId}${entry.current ? ', current' : ''}, status=${entry.status ?? 'unknown'})`
      })
      .join(', '),
  }
}

function toBuddyInboxDescriptor(
  inbox: ShadowBuddyInboxSummary,
  currentAgentId: string | null | undefined,
): BuddyInboxDirectoryDescriptor | null {
  if (!inbox.agent?.id) return null
  return {
    agentId: inbox.agent.id,
    ownerId: inbox.agent.ownerId,
    displayName: inbox.agent.user?.displayName ?? null,
    username: inbox.agent.user?.username ?? null,
    status: inbox.agent.status ?? null,
    channelId: inbox.channel?.id ?? null,
    channelName: inbox.channel?.name ?? null,
    canManage: inbox.canManage,
    current: Boolean(currentAgentId && inbox.agent.id === currentAgentId),
    serverId: inbox.server?.id ?? null,
    serverSlug: inbox.server?.slug ?? null,
    serverName: inbox.server?.name ?? null,
  }
}

function formatBuddyInboxDirectoryEntry(entry: BuddyInboxDirectoryDescriptor) {
  const label = promptValue(entry.displayName || entry.username || entry.agentId)
  const parts = [
    `agentId=${entry.agentId}`,
    `current=${entry.current ? 'true' : 'false'}`,
    `status=${promptValue(entry.status)}`,
    entry.channelId ? `inboxChannelId=${entry.channelId}` : 'inboxChannelId=none',
    entry.channelName ? `inboxChannel=#${promptValue(entry.channelName)}` : '',
    `canManage=${entry.canManage ? 'true' : 'false'}`,
  ].filter(Boolean)
  return `- ${label}: ${parts.join(', ')}`
}

export function formatBuddyInboxDirectoryContext(params: {
  entries: BuddyInboxDirectoryDescriptor[]
  serverRef: string
  truncated?: boolean
}) {
  if (params.entries.length === 0) return ''
  return [
    'Shadow server Buddy Inbox directory:',
    `Server reference: ${params.serverRef}`,
    ...params.entries.map(formatBuddyInboxDirectoryEntry),
    params.truncated ? `Only the first ${params.entries.length} Buddy Inboxes are listed.` : '',
    '',
    'These are descriptor-only Buddy Inbox entries for the current server. They do not include Inbox message content.',
    'Remote config monitored channels describe this Buddy runtime, not the full server Buddy directory. Do not infer that only one Buddy exists from monitored channels.',
    'Delegate work by enqueueing a task card through the mounted Shadow CLI, for example: `shadowob inbox enqueue --server "<current-server-id-or-slug>" --agent "<target-agent-id>" --title "<task-title>" --body "<task-body>" --json`.',
    'When delegating from an active Shadow Inbox task, include the current parent task reference with `--parent-task-json` as shown in the task routing instructions.',
    '`canManage` only means admin-management permission for the current actor. It is not the delivery/collaboration capability; use Inbox admission results from enqueue/pending commands to handle authorization.',
    'For execution work, prefer peer Buddies with relevant status/capability when available, and keep coordination state in Apps or task cards instead of writing directly into peer Inbox channels.',
  ]
    .filter(Boolean)
    .join('\n')
}

async function buildBuddyInboxDirectoryContext(params: {
  client: ShadowClient
  currentAgentId: string | null
  runtime: ShadowRuntimeLogger
  serverInfo: ChannelServerInfo | undefined
}): Promise<{ prompt: string; fields: Record<string, unknown> }> {
  if (!params.serverInfo) return { prompt: '', fields: {} }

  const serverRef = params.serverInfo.serverSlug || params.serverInfo.serverId
  try {
    const inboxes = await params.client.listServerBuddyInboxes(serverRef)
    if (!Array.isArray(inboxes) || inboxes.length === 0) return { prompt: '', fields: {} }
    const entries = inboxes
      .map((inbox) => toBuddyInboxDescriptor(inbox, params.currentAgentId))
      .filter((entry): entry is BuddyInboxDirectoryDescriptor => entry !== null)
    const limited = entries.slice(0, MAX_BUDDY_INBOXES_IN_CONTEXT)
    const truncated = entries.length > limited.length
    return {
      prompt: formatBuddyInboxDirectoryContext({ entries: limited, serverRef, truncated }),
      fields: buddyInboxDirectoryFields(limited, truncated),
    }
  } catch (err) {
    params.runtime.error?.(
      `[buddy-inbox] Failed listing Buddy Inboxes for ${params.serverInfo.serverId}: ${String(err)}`,
    )
    return { prompt: '', fields: {} }
  }
}

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
  const flags = [ref.mentioned ? 'mentioned=true' : '', ref.copilot ? 'copilot=true' : ''].filter(
    Boolean,
  )
  const app = ref.app
  if (!app) {
    return `- ${ref.label}: appKey=${ref.appKey}, server=${ref.server}${flags.length > 0 ? `, ${flags.join(', ')}` : ''}`
  }
  return [
    `- ${app.name}: appKey=${app.appKey}, server=${ref.server}, defaultPermissions=${app.defaultPermissions.join(',') || 'none'}, defaultApproval=${app.defaultApprovalMode}${flags.length > 0 ? `, ${flags.join(', ')}` : ''}`,
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
  copilotContext?: ShadowMessageCopilotContext | null
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
          copilot: false,
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
      copilot: existing?.copilot ?? false,
    })
  }

  const copilotContext = params.copilotContext
  if (copilotContext?.appKey) {
    const server =
      params.serverInfo?.serverId ?? copilotContext.serverId ?? copilotContext.serverSlug
    if (server) {
      const serverLabel =
        copilotContext.serverSlug ??
        params.serverInfo?.serverSlug ??
        copilotContext.serverId ??
        params.serverInfo?.serverId ??
        server
      const key = `${server}:${copilotContext.appKey}`
      const existing = appRefs.get(key)
      const installedApp =
        existing?.app ?? installedApps.find((app) => app.appKey === copilotContext.appKey)
      appRefs.set(key, {
        ...existing,
        appKey: copilotContext.appKey,
        server: existing?.server ?? serverLabel,
        label: existing?.label ?? copilotContext.appName ?? copilotContext.appKey,
        app: installedApp,
        mentioned: existing?.mentioned ?? false,
        copilot: true,
      })
    }
  }
  if (appRefs.size === 0) return { prompt: '', fields: {} }

  const refs = Array.from(appRefs.values())
    .sort(
      (a, b) => Number(b.copilot) - Number(a.copilot) || Number(b.mentioned) - Number(a.mentioned),
    )
    .slice(0, MAX_SERVER_APPS_IN_CONTEXT)
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
    'Shadow Apps available in this server:',
    ...refs.map(formatInstalledServerAppSummary),
    '',
    'Use these apps when the user asks natural-language questions or tasks that match an installed app name, description, or command capability. Do not wait for the user to say a CLI command or explicitly mention the app.',
    'Operate Apps through the mounted Shadow CLI only so Shadow can bind the Buddy identity, app grants, approval prompts, and policy: run `shadowob app discover --server "<current-server-id-or-slug>" --json` when needed, then `shadowob app call "<appKey>" <command> --server "<current-server-id-or-slug>" --channel-id "<current-channel-id>" --json-input \'<raw-command-input-json>\' --json`. Do not use curl, fetch, raw HTTP routes, or SDK calls for App commands.',
    'Shadow App command approvals are system permission prompts, not chat interactive dialogs. Never send a Shadow interactive form/buttons/approval message as a substitute for App command approval, and never call the App approval endpoint yourself as a Buddy. If the CLI returns SERVER_APP_COMMAND_APPROVAL_REQUIRED, tell the user that Shadow opened the approval popup, then stop until a person confirms and asks you to retry.',
    loaded.length > 0 ? 'Injected Shadow App Skills:' : '',
    ...loaded,
  ]
    .filter(Boolean)
    .join('\n')

  return { prompt, fields: serverAppContextFields(installedApps) }
}

function getMessageCopilotContext(message: ShadowMessage): ShadowMessageCopilotContext | null {
  const context = message.metadata?.copilotContext
  return isMessageCopilotContext(context) ? context : null
}

function formatCopilotContextForAgent(context: ShadowMessageCopilotContext | null) {
  if (!context) return ''
  const appLabel = promptValue(context.appName, context.appKey)
  return [
    'Shadow Copilot app context:',
    `Current app: ${appLabel}`,
    `App key: ${context.appKey}`,
    context.serverAppId ? `Server app id: ${context.serverAppId}` : '',
    context.appId ? `Catalog app id: ${context.appId}` : '',
    context.serverSlug ? `Server slug: ${context.serverSlug}` : '',
    context.serverId ? `Server id: ${context.serverId}` : '',
    context.channelId ? `Copilot channel id: ${context.channelId}` : '',
    context.channelKind ? `Copilot channel kind: ${context.channelKind}` : '',
    'Treat this as the active app surface for the user message. Use injected Shadow App Skills and the Shadow CLI app command flow when the app capabilities match the request.',
  ]
    .filter(Boolean)
    .join('\n')
}

function copilotContextFields(context: ShadowMessageCopilotContext | null) {
  if (!context) return {}
  return {
    CopilotMode: 'server_app',
    CopilotAppKey: context.appKey,
    CopilotAppName: context.appName ?? null,
    CopilotServerAppId: context.serverAppId ?? null,
    CopilotCatalogAppId: context.appId ?? null,
    CopilotServerId: context.serverId ?? null,
    CopilotServerSlug: context.serverSlug ?? null,
    CopilotChannelId: context.channelId ?? null,
    CopilotChannelKind: context.channelKind ?? null,
  }
}

export async function processShadowMessage(params: {
  message: ShadowMessage
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: ShadowRuntimeLogger
  core: PluginRuntime
  buddyUserId: string
  buddyUsername: string
  agentId: string | null
  channelPolicies: Map<string, ShadowChannelPolicy>
  channelServerMap: Map<string, ChannelServerInfo>
  slashCommands: ShadowSlashCommand[]
  socket: ShadowSocket
}): Promise<void> {
  const {
    account,
    accountId,
    config,
    runtime,
    core,
    buddyUserId,
    buddyUsername,
    agentId,
    channelPolicies,
    channelServerMap,
    slashCommands,
    socket,
  } = params
  let { message } = params
  const cfg = config as OpenClawConfig
  const channelId = message.channelId
  const mediaClient = new ShadowClient(account.serverUrl, account.token)
  const boundThreadBinding = message.threadId
    ? resolveShadowThreadBinding(await loadShadowThreadBindings(accountId), {
        agentId,
        threadId: message.threadId,
      })
    : null
  const boundTaskSessionKey =
    boundThreadBinding?.sessionKey.includes(':task:') === true
      ? boundThreadBinding.sessionKey
      : undefined
  const recoveredTaskContext =
    message.threadId && !boundTaskSessionKey && message.authorId !== buddyUserId
      ? await recoverRuntimeTaskCardForThread({
          client: mediaClient,
          message,
          buddyUserId,
          buddyId: agentId,
          runtime,
        })
      : null

  const preflight = evaluateShadowMessagePreflight({
    message,
    buddyUserId,
    buddyId: agentId,
    buddyUsername,
    channelPolicies,
    runtime,
    isRuntimeTaskThread: Boolean(boundTaskSessionKey || recoveredTaskContext),
  })
  if (!preflight.ok) {
    runtime.log?.(preflight.reason)
    return
  }

  const { senderLabel } = preflight

  const targetedTaskCard = findTargetedRuntimeTaskCard(message, {
    buddyUserId,
    buddyId: agentId,
  })
  if (targetedTaskCard && isTerminalTaskStatus(targetedTaskCard.status)) {
    runtime.log?.(
      `[task] Skipping terminal task card ${targetedTaskCard.id} (${targetedTaskCard.status}) for message ${message.id}`,
    )
    return
  }

  runtime.log?.(
    `[msg] Processing message from ${senderLabel}: "${message.content.slice(0, 80)}" (${message.id})`,
  )

  let runtimeTaskCard = findRuntimeTaskCard(message, { buddyUserId, buddyId: agentId })
  const serverInfoForTaskQueue = channelServerMap.get(channelId)
  if (
    runtimeTaskCard &&
    !message.threadId &&
    agentId &&
    serverInfoForTaskQueue &&
    (runtimeTaskCard.status === 'queued' ||
      ((runtimeTaskCard.status === 'claimed' || runtimeTaskCard.status === 'running') &&
        taskClaimExpired(runtimeTaskCard)))
  ) {
    const serverRef = serverInfoForTaskQueue.serverSlug || serverInfoForTaskQueue.serverId
    let claimedMessage: ShadowMessage | null = null
    let claimedTaskCard: RuntimeTaskCard | null = null
    try {
      const claimed = await mediaClient.claimNextInboxTask(serverRef, agentId, {
        ttlSeconds: 3600,
        note: 'OpenClaw runtime claimed task',
      })
      claimedMessage = claimed.message
      claimedTaskCard = claimed.card && isRuntimeTaskCard(claimed.card) ? claimed.card : null
    } catch (err) {
      runtime.error?.(
        `[task] Failed claiming next Inbox task for ${agentId} on ${serverRef}: ${String(err)}`,
      )
      return
    }

    if (!claimedMessage || !claimedTaskCard) {
      runtime.log?.(
        `[task] No claimable Inbox task for ${agentId} on ${serverRef}; skipping message ${message.id}`,
      )
      return
    }

    const selectedCurrentMessage =
      claimedMessage.id === message.id && claimedTaskCard.id === runtimeTaskCard.id
    if (!selectedCurrentMessage) {
      runtime.log?.(
        `[task] Claim queue selected task card ${claimedTaskCard.id} from message ${claimedMessage.id}; deferring ${runtimeTaskCard.id} from message ${message.id}`,
      )
      await processShadowMessage({ ...params, message: claimedMessage })
      return
    }

    message = claimedMessage
    runtimeTaskCard = claimedTaskCard
  }

  const buddyThreadCoordination = await coordinateBuddyThreadFirstReply({
    client: mediaClient,
    message,
    buddyUserId,
    runtime,
  })
  if (buddyThreadCoordination && !buddyThreadCoordination.ok) {
    runtime.log?.(buddyThreadCoordination.reason)
    return
  }
  const buddyThread =
    buddyThreadCoordination?.ok === true ? buddyThreadCoordination.coordination : null
  const effectiveThreadId = message.threadId ?? buddyThread?.threadId

  const senderName = message.author?.displayName ?? message.author?.username ?? 'Unknown'
  const senderUsername = message.author?.username ?? ''
  const senderId = message.authorId
  const rawBody = message.content
  const chatType = effectiveThreadId ? 'thread' : 'channel'

  const peerId = effectiveThreadId ? `${channelId}:thread:${effectiveThreadId}` : channelId
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: 'shadowob',
    accountId,
    peer: { kind: 'group', id: peerId },
  })

  runtime.log?.(`[routing] Resolved agent: ${route.agentId} (account ${accountId})`)

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

  const structuredMentions = getShadowMessageMentions(message)

  if (
    slashCommandMatch?.command.interaction &&
    !slashCommandMatch.args.trim() &&
    !interactiveResponseContext.text
  ) {
    await sendSlashCommandInteractivePrompt({
      match: slashCommandMatch,
      messageId: message.id,
      channelId,
      threadId: effectiveThreadId ?? undefined,
      client: mediaClient,
      runtime,
      agentId,
      buddyUserId,
    })
    return
  }

  const baseBodyForAgent =
    slashCommandMatch && !slashCommandPassThrough
      ? formatSlashCommandPrompt(cleanBody, slashCommandMatch)
      : cleanBody
  const commandBody = slashCommandPassThrough ? cleanBody : (slashCommandMatch?.args ?? cleanBody)
  const ownerAllowFrom = resolveOwnerAllowFrom(preflight.policyConfig)
  const mentionContext = formatShadowMentionsForAgent(structuredMentions)
  const serverInfo = channelServerMap.get(channelId)
  const copilotContext = getMessageCopilotContext(message)
  const copilotPrompt = formatCopilotContextForAgent(copilotContext)
  const channelLabel = serverInfo ? `#${serverInfo.channelName}` : `channel:${channelId}`
  const conversationLabel = serverInfo ? `${serverInfo.serverName} ${channelLabel}` : peerId
  const messageBodyForAgent = interactiveResponseContext.text || baseBodyForAgent
  const client = new ShadowClient(account.serverUrl, account.token)
  const serverAppContext = await buildServerAppSkillsContext({
    mentions: structuredMentions,
    client,
    serverInfo,
    runtime,
    copilotContext,
  })
  const buddyInboxContext = await buildBuddyInboxDirectoryContext({
    client,
    currentAgentId: agentId,
    runtime,
    serverInfo,
  })
  const buddyThreadCoordinationContext = formatBuddyThreadCoordinationPrompt(buddyThread)
  const viewerCommerceContext = await buildCommerceViewerContextForAgent({
    account,
    client,
    viewerUserId: senderId,
  })
  const channelConversationGuard = [
    'Shadow channel conversation guard:',
    '- For ordinary channel chat and Buddy-to-Buddy replies, answer directly in one concise message.',
    '- Do not run terminal commands or Shadow CLI only to inspect channel history or send channel messages; the channel reply pipeline already handles delivery.',
    '- Do not recap or summarize the exchange unless the user explicitly asks for a recap.',
    '- Use tools only when the user asks for work that truly requires a tool, App, file, code, or external operation.',
  ].join('\n')
  const boundTaskThreadPrompt = boundTaskSessionKey
    ? [
        'Shadow Inbox task follow-up:',
        `Task thread id: ${message.threadId}`,
        'Continue the existing task session for this thread. Ordinary replies should stay in this task thread.',
      ].join('\n')
    : ''
  const bodyForAgent = [
    buildChannelContextForAgent(serverInfo, channelId),
    channelConversationGuard,
    buddyThreadCoordinationContext,
    buildCommerceContextForAgent(account),
    viewerCommerceContext,
    mentionContext,
    copilotPrompt,
    buddyInboxContext.prompt,
    serverAppContext.prompt,
    runtimeTaskCard ? taskCardPrompt(message, runtimeTaskCard) : '',
    recoveredTaskContext
      ? taskCardPrompt(recoveredTaskContext.message, recoveredTaskContext.card)
      : '',
    boundTaskThreadPrompt,
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

  const escapedBuddyUsername = buddyUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionRegex = new RegExp(`@${escapedBuddyUsername}(?:\\s|$)`, 'i')
  const wasMentioned =
    Boolean(runtimeTaskCard) ||
    Boolean(boundTaskSessionKey) ||
    Boolean(recoveredTaskContext) ||
    mentionTargetsBuddy({ mentions: structuredMentions, buddyUserId, buddyUsername }) ||
    mentionsTargetServerApp(structuredMentions) ||
    Boolean(slashCommandMatch) ||
    mentionRegex.test(message.content)

  const runtimeTaskThreadId = runtimeTaskCard
    ? taskReplyThreadId(runtimeTaskCard)
    : boundTaskSessionKey || recoveredTaskContext
      ? (message.threadId ?? undefined)
      : undefined
  const taskSessionKey = runtimeTaskCard
    ? `${route.sessionKey}:task:${runtimeTaskCard.id}`
    : (boundTaskSessionKey ??
      (recoveredTaskContext
        ? `${route.sessionKey}:task:${recoveredTaskContext.card.id}`
        : route.sessionKey))
  const activeTaskContext = runtimeTaskCard
    ? { message, card: runtimeTaskCard }
    : recoveredTaskContext
  const parentTaskForDelegation = activeTaskContext
    ? taskParentTaskRef(activeTaskContext.message, activeTaskContext.card)
    : null
  const parentTaskJson = parentTaskForDelegation
    ? JSON.stringify(parentTaskForDelegation)
    : undefined
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
    ...copilotContextFields(copilotContext),
    ...buddyInboxContext.fields,
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
    BuddyUserId: buddyUserId,
    BuddyUsername: buddyUsername,
    ...(runtimeTaskCard
      ? {
          TaskCardId: runtimeTaskCard.id,
          TaskCardTitle: runtimeTaskCard.title,
          TaskCardStatus: runtimeTaskCard.status,
          TaskCardPriority: runtimeTaskCard.priority,
        }
      : {}),
    ...(parentTaskForDelegation
      ? {
          ParentTaskMessageId: parentTaskForDelegation.messageId,
          ParentTaskCardId: parentTaskForDelegation.cardId,
          ParentTaskChannelId: parentTaskForDelegation.channelId,
          ParentTaskThreadId: parentTaskForDelegation.threadId,
          ParentTaskJson: parentTaskJson,
          ShadowParentTaskJson: parentTaskJson,
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
    ...(effectiveThreadId ? { ThreadId: effectiveThreadId } : {}),
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
  const bindingThreadId = effectiveThreadId ?? runtimeTaskThreadId
  if (route.agentId && bindingSessionKey) {
    await upsertShadowThreadBinding({
      accountId,
      agentId: route.agentId,
      sessionKey: bindingSessionKey,
      channelId,
      ...(bindingThreadId ? { threadId: bindingThreadId } : {}),
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
            threadId: buddyThread?.threadId ?? runtimeTaskThreadId ?? message.threadId ?? undefined,
            replyToId: message.id,
            target: buddyThread || runtimeTaskThreadId || message.threadId ? 'thread' : 'main',
            client,
            runtime,
            agentId: dispatchAgentId,
            buddyUserId,
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
        .updateTaskCard(message.id, runtimeTaskCard.id, openClawRuntimeReplyProgressUpdate())
        .catch((err) => {
          runtime.error?.(
            `[task] Failed recording task card ${runtimeTaskCard?.id} reply progress: ${String(err)}`,
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
