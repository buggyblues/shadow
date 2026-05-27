import type { MessageCardStatus } from './message.types'

export const BUDDY_INBOX_TOPIC_PREFIX = 'shadow:buddy-inbox:' as const

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

export function canTransitionTaskMessageCardStatus(from: MessageCardStatus, to: MessageCardStatus) {
  const allowed = TASK_MESSAGE_CARD_STATUS_TRANSITIONS[from] as readonly MessageCardStatus[]
  return allowed.includes(to)
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

export const DEFAULT_BUDDY_INBOX_ADMISSION_POLICY: BuddyInboxAdmissionPolicy = {
  defaultMode: 'allow',
  rules: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
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
