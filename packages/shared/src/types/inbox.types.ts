import type {
  MessageCard,
  MessageCardSource,
  MessageCardStatus,
  MessageMetadata,
  MessageReferenceCard,
  TaskMessageCard,
  TaskMessageOutputContract,
  TaskMessagePrivacy,
  TaskMessageRequirements,
} from './message.types'

export const BUDDY_INBOX_TOPIC_PREFIX = 'shadow:buddy-inbox:' as const
export const BUDDY_INBOX_DELIVERY_PERMISSION = 'buddy_inbox:deliver' as const
export const BUDDY_INBOX_PLATFORM_PERMISSIONS = [BUDDY_INBOX_DELIVERY_PERMISSION] as const

export type BuddyInboxPlatformPermission = (typeof BUDDY_INBOX_PLATFORM_PERMISSIONS)[number]

export function isBuddyInboxPlatformPermission(
  value: unknown,
): value is BuddyInboxPlatformPermission {
  return (
    typeof value === 'string' &&
    BUDDY_INBOX_PLATFORM_PERMISSIONS.includes(value as BuddyInboxPlatformPermission)
  )
}

export function buddyInboxTopic(agentId: string) {
  return `${BUDDY_INBOX_TOPIC_PREFIX}${agentId}`
}

export function parseBuddyInboxAgentId(topic: string | null | undefined) {
  if (!topic?.startsWith(BUDDY_INBOX_TOPIC_PREFIX)) return null
  const agentId = topic.slice(BUDDY_INBOX_TOPIC_PREFIX.length).trim()
  return agentId || null
}

export function isBuddyInboxTopic(topic: string | null | undefined) {
  return parseBuddyInboxAgentId(topic) !== null
}

export const TASK_MESSAGE_CARD_STATUSES = [
  'queued',
  'claimed',
  'running',
  'completed',
  'failed',
  'canceled',
  'transferred',
] as const satisfies readonly MessageCardStatus[]

export const TERMINAL_TASK_MESSAGE_CARD_STATUSES = [
  'completed',
  'failed',
  'canceled',
  'transferred',
] as const satisfies readonly MessageCardStatus[]

export const TASK_MESSAGE_CARD_STATUS_TRANSITIONS = {
  queued: ['queued', 'claimed', 'running', 'completed', 'failed', 'canceled'],
  claimed: ['claimed', 'running', 'completed', 'failed', 'canceled'],
  running: ['running', 'completed', 'failed', 'canceled'],
  completed: ['completed'],
  failed: ['failed', 'transferred'],
  canceled: ['canceled'],
  transferred: ['transferred'],
} as const satisfies Record<MessageCardStatus, readonly MessageCardStatus[]>

export function isTerminalTaskMessageCardStatus(status: MessageCardStatus) {
  return TERMINAL_TASK_MESSAGE_CARD_STATUSES.includes(
    status as (typeof TERMINAL_TASK_MESSAGE_CARD_STATUSES)[number],
  )
}

export function isTaskMessageCardStatus(value: unknown): value is MessageCardStatus {
  return (
    typeof value === 'string' &&
    TASK_MESSAGE_CARD_STATUSES.includes(value as (typeof TASK_MESSAGE_CARD_STATUSES)[number])
  )
}

export function canTransitionTaskMessageCardStatus(from: MessageCardStatus, to: MessageCardStatus) {
  const allowed = TASK_MESSAGE_CARD_STATUS_TRANSITIONS[from] as readonly MessageCardStatus[]
  return allowed.includes(to)
}

export type BuddyInboxViewMode = 'chat' | 'tasks'
export type BuddyInboxTaskFilter = 'all' | 'open' | 'done'

export interface BuddyInboxViewMessage {
  id: string
  replyToId?: string | null
  metadata?: Pick<MessageMetadata, 'cards'> | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isTaskReplyNotificationCard(card: MessageCard) {
  return isRecord(card.data) && card.data.taskReplyNotification === true
}

export function isMessageReferenceCard(card: MessageCard): card is MessageReferenceCard {
  return (
    card?.kind === 'message_reference' &&
    typeof card.title === 'string' &&
    isRecord(card.target) &&
    typeof card.target.channelId === 'string' &&
    typeof card.target.messageId === 'string'
  )
}

export function getBuddyInboxTaskCards(message: BuddyInboxViewMessage): TaskMessageCard[] {
  const cards = message.metadata?.cards
  if (!Array.isArray(cards)) return []
  return cards.filter(
    (card): card is TaskMessageCard =>
      card?.kind === 'task' &&
      typeof card.id === 'string' &&
      isTaskMessageCardStatus(card.status) &&
      !isTaskReplyNotificationCard(card),
  )
}

export function hasBuddyInboxTaskCard(message: BuddyInboxViewMessage) {
  return getBuddyInboxTaskCards(message).length > 0
}

function hasBuddyInboxTaskReplyNotificationCard(message: BuddyInboxViewMessage) {
  const cards = message.metadata?.cards
  return Array.isArray(cards) && cards.some(isTaskReplyNotificationCard)
}

export function getBuddyInboxTaskStatuses(message: BuddyInboxViewMessage): MessageCardStatus[] {
  return getBuddyInboxTaskCards(message).map((card) => card.status)
}

export function buddyInboxMessageMatchesTaskFilter(
  message: BuddyInboxViewMessage,
  filter: BuddyInboxTaskFilter,
) {
  const statuses = getBuddyInboxTaskStatuses(message)
  if (statuses.length === 0) return false
  if (filter === 'all') return true
  if (filter === 'done') return statuses.every((status) => isTerminalTaskMessageCardStatus(status))
  return statuses.some((status) => !isTerminalTaskMessageCardStatus(status))
}

export function getBuddyInboxTaskMessageIds(messages: readonly BuddyInboxViewMessage[]) {
  const ids = new Set<string>()
  for (const message of messages) {
    if (hasBuddyInboxTaskCard(message)) ids.add(message.id)
  }
  return ids
}

export function isBuddyInboxTaskReply(
  message: BuddyInboxViewMessage,
  taskMessageIds: ReadonlySet<string>,
) {
  return Boolean(message.replyToId && taskMessageIds.has(message.replyToId))
}

export function buildBuddyInboxViewMessages<TMessage extends BuddyInboxViewMessage>(
  messages: readonly TMessage[],
  options: {
    isInboxChannel: boolean
    mode?: BuddyInboxViewMode
    taskFilter?: BuddyInboxTaskFilter
  },
) {
  if (!options.isInboxChannel) return [...messages]

  const taskMessageIds = getBuddyInboxTaskMessageIds(messages)
  const taskFilter = options.taskFilter ?? 'all'
  return messages.filter((message) => {
    if (isBuddyInboxTaskReply(message, taskMessageIds)) return false
    if (hasBuddyInboxTaskReplyNotificationCard(message)) return false
    if (!hasBuddyInboxTaskCard(message)) return taskFilter === 'all'
    return buddyInboxMessageMatchesTaskFilter(message, taskFilter)
  })
}

export type BuddyInboxAdmissionMode = 'allow' | 'deny' | 'first_time' | 'every_time'
export type BuddyInboxAdmissionSubjectKind = 'user' | 'agent' | 'server_app' | 'system'

export interface BuddyInboxAdmissionRule {
  subjectKind: BuddyInboxAdmissionSubjectKind
  subjectId?: string
  appKey?: string
  mode: BuddyInboxAdmissionMode
  approved?: boolean
  note?: string
  createdAt?: string
  updatedAt?: string
}

export interface BuddyInboxAdmissionPolicy {
  defaultMode: BuddyInboxAdmissionMode
  rules: BuddyInboxAdmissionRule[]
}

export interface BuddyInboxAdmissionPendingTask {
  title: string
  body?: string
  priority?: 'low' | 'normal' | 'medium' | 'high'
  idempotencyKey?: string
  source?: MessageCardSource
  requirements?: TaskMessageRequirements
  outputContract?: TaskMessageOutputContract
  privacy?: TaskMessagePrivacy
  data?: Record<string, unknown>
}

export interface BuddyInboxAdmissionPendingDelivery {
  id: string
  serverId: string
  channelId: string
  agentId: string
  mode: Exclude<BuddyInboxAdmissionMode, 'allow' | 'deny'>
  subject: {
    kind: BuddyInboxAdmissionSubjectKind
    id?: string
    appKey?: string
    label?: string
  }
  task: BuddyInboxAdmissionPendingTask
  requestedBy: MessageCardSource
  requestedAt: string
  updatedAt?: string
}

export const DEFAULT_BUDDY_INBOX_ADMISSION_POLICY: BuddyInboxAdmissionPolicy = {
  defaultMode: 'allow',
  rules: [],
}

function parseAdmissionMode(value: unknown, fallback: BuddyInboxAdmissionMode) {
  if (value === 'allow' || value === 'deny' || value === 'first_time' || value === 'every_time') {
    return value
  }
  if (value === undefined || value === null) return fallback
  throw new Error('Invalid Buddy Inbox admission mode')
}

function parseSubjectKind(value: unknown) {
  if (value === 'user' || value === 'agent' || value === 'server_app' || value === 'system') {
    return value
  }
  throw new Error('Invalid Buddy Inbox admission subject kind')
}

function parseOptionalString(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`Invalid Buddy Inbox admission ${field}`)
  }
  return value
}

export function normalizeBuddyInboxAdmissionPolicy(value: unknown): BuddyInboxAdmissionPolicy {
  if (value === undefined || value === null) return { ...DEFAULT_BUDDY_INBOX_ADMISSION_POLICY }
  if (!isRecord(value)) throw new Error('Invalid Buddy Inbox admission policy')

  const defaultMode = parseAdmissionMode(value.defaultMode, 'allow')
  const rawRules = value.rules
  if (rawRules !== undefined && !Array.isArray(rawRules)) {
    throw new Error('Invalid Buddy Inbox admission rules')
  }
  const rules = (rawRules ?? []).slice(0, 100).map((entry): BuddyInboxAdmissionRule => {
    if (!isRecord(entry)) throw new Error('Invalid Buddy Inbox admission rule')
    return {
      subjectKind: parseSubjectKind(entry.subjectKind),
      subjectId: parseOptionalString(entry.subjectId, 'subjectId', 160),
      appKey: parseOptionalString(entry.appKey, 'appKey', 120),
      mode: parseAdmissionMode(entry.mode, defaultMode),
      ...(entry.approved === true ? { approved: true } : {}),
      note: parseOptionalString(entry.note, 'note', 500),
      createdAt: parseOptionalString(entry.createdAt, 'createdAt', 64),
      updatedAt: parseOptionalString(entry.updatedAt, 'updatedAt', 64),
    }
  })

  return { defaultMode, rules }
}

export function buddyInboxAdmissionRuleKey(rule: BuddyInboxAdmissionRule) {
  return [rule.subjectKind, rule.subjectId ?? '', rule.appKey ?? ''].join(':')
}

function parsePendingTask(value: unknown): BuddyInboxAdmissionPendingTask {
  if (!isRecord(value)) throw new Error('Invalid Buddy Inbox pending task')
  const title = parseOptionalString(value.title, 'task.title', 180)
  if (!title) throw new Error('Invalid Buddy Inbox pending task title')
  const body = parseOptionalString(value.body, 'task.body', 8000)
  const priority = value.priority
  if (
    priority !== undefined &&
    priority !== 'low' &&
    priority !== 'normal' &&
    priority !== 'medium' &&
    priority !== 'high'
  ) {
    throw new Error('Invalid Buddy Inbox pending task priority')
  }
  const idempotencyKey = parseOptionalString(value.idempotencyKey, 'task.idempotencyKey', 240)
  const source = isRecord(value.source) ? (value.source as unknown as MessageCardSource) : undefined
  const requirements = isRecord(value.requirements)
    ? (value.requirements as unknown as TaskMessageRequirements)
    : undefined
  const outputContract = isRecord(value.outputContract)
    ? (value.outputContract as unknown as TaskMessageOutputContract)
    : undefined
  const privacy = isRecord(value.privacy)
    ? (value.privacy as unknown as TaskMessagePrivacy)
    : undefined
  const data = isRecord(value.data) ? value.data : undefined
  return {
    title,
    ...(body ? { body } : {}),
    ...(priority ? { priority } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(source ? { source } : {}),
    ...(requirements ? { requirements } : {}),
    ...(outputContract ? { outputContract } : {}),
    ...(privacy ? { privacy } : {}),
    ...(data ? { data } : {}),
  }
}

export function normalizeBuddyInboxAdmissionPendingDeliveries(
  value: unknown,
): BuddyInboxAdmissionPendingDelivery[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('Invalid Buddy Inbox pending deliveries')
  return value.slice(0, 100).map((entry): BuddyInboxAdmissionPendingDelivery => {
    if (!isRecord(entry)) throw new Error('Invalid Buddy Inbox pending delivery')
    const id = parseOptionalString(entry.id, 'pending.id', 80)
    const serverId = parseOptionalString(entry.serverId, 'pending.serverId', 160)
    const channelId = parseOptionalString(entry.channelId, 'pending.channelId', 160)
    const agentId = parseOptionalString(entry.agentId, 'pending.agentId', 160)
    const mode = parseAdmissionMode(entry.mode, 'first_time')
    if (mode !== 'first_time' && mode !== 'every_time') {
      throw new Error('Invalid Buddy Inbox pending mode')
    }
    if (!isRecord(entry.subject)) throw new Error('Invalid Buddy Inbox pending subject')
    if (!isRecord(entry.requestedBy)) throw new Error('Invalid Buddy Inbox pending requester')
    if (!id || !serverId || !channelId || !agentId) {
      throw new Error('Invalid Buddy Inbox pending delivery identifiers')
    }
    const requestedAt = parseOptionalString(entry.requestedAt, 'pending.requestedAt', 64)
    if (!requestedAt) throw new Error('Invalid Buddy Inbox pending requestedAt')
    return {
      id,
      serverId,
      channelId,
      agentId,
      mode,
      subject: {
        kind: parseSubjectKind(entry.subject.kind),
        id: parseOptionalString(entry.subject.id, 'subject.id', 160),
        appKey: parseOptionalString(entry.subject.appKey, 'subject.appKey', 120),
        label: parseOptionalString(entry.subject.label, 'subject.label', 160),
      },
      task: parsePendingTask(entry.task),
      requestedBy: entry.requestedBy as unknown as MessageCardSource,
      requestedAt,
      updatedAt: parseOptionalString(entry.updatedAt, 'pending.updatedAt', 64),
    }
  })
}
