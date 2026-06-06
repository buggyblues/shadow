export type ShadowBuddyTaskIdentity = {
  botUserId: string
  botAgentId?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizedAgentId(identity: ShadowBuddyTaskIdentity) {
  const value = identity.botAgentId?.trim()
  return value && value.length > 0 ? value : null
}

export function isTerminalShadowTaskStatus(status: unknown) {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'canceled' ||
    status === 'transferred'
  )
}

export function taskCardTargetsBuddy(card: unknown, identity: ShadowBuddyTaskIdentity) {
  if (!isRecord(card)) return false
  const assignee = isRecord(card.assignee) ? card.assignee : null
  if (!assignee) return false
  if (assignee.userId === identity.botUserId) return true
  const agentId = normalizedAgentId(identity)
  return Boolean(agentId && assignee.agentId === agentId)
}

export function isActiveTaskCardForBuddy(card: unknown, identity: ShadowBuddyTaskIdentity) {
  if (!isRecord(card)) return false
  return (
    card.kind === 'task' &&
    !isTerminalShadowTaskStatus(card.status) &&
    taskCardTargetsBuddy(card, identity)
  )
}
