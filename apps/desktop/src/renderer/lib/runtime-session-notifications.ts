import {
  type RuntimeSessionPetActivity,
  type RuntimeSessionPetReaction,
  type RuntimeSessionState,
  runtimeSessionPetReactionForState,
  runtimeSessionStateLooksActive,
} from '@shadowob/shared/types'

export const RUNTIME_SESSION_SETTLE_MS = 10_000

export type RuntimeSessionForNotification = {
  runtimeId: string
  instanceId: string
  sessionId: string
  title?: string | null
  lastActivityAt?: string | null
  state: RuntimeSessionState
  petReaction?: RuntimeSessionPetReaction
  petActivity?: RuntimeSessionPetActivity
}

export type RuntimeSessionNotificationTracker = {
  lastActivityAt: string
  changedAt: number
  notifiedLastActivityAt: string | null
}

export function runtimeSessionKey(session: RuntimeSessionForNotification): string {
  return `${session.runtimeId}:${session.instanceId}:${session.sessionId}`
}

export function runtimeSessionLooksActive(session: RuntimeSessionForNotification): boolean {
  return runtimeSessionStateLooksActive(session.state)
}

export function runtimeSessionReaction(
  session: RuntimeSessionForNotification,
): RuntimeSessionPetReaction {
  return session.petReaction ?? runtimeSessionPetReactionForState(session.state)
}

function runtimeSessionReactionLooksBusy(reaction: RuntimeSessionPetReaction): boolean {
  return (
    reaction === 'thinking' ||
    reaction === 'working' ||
    reaction === 'editing' ||
    reaction === 'running' ||
    reaction === 'testing' ||
    reaction === 'waiting'
  )
}

export function runtimeSessionReactionIsVisible(
  session: RuntimeSessionForNotification,
  now: number,
  visibleMs: number,
): boolean {
  const reaction = runtimeSessionReaction(session)
  if (reaction === 'idle') return false
  if (runtimeSessionLooksActive(session)) return true
  if (runtimeSessionReactionLooksBusy(reaction)) return false

  const lastActivityAt = session.lastActivityAt
  const lastActivityMs = lastActivityAt ? Date.parse(lastActivityAt) : Number.NaN
  return Number.isFinite(lastActivityMs) && now - lastActivityMs <= visibleMs
}

export function evaluateRuntimeSessionNotification({
  session,
  tracker,
  now,
  startedAt,
  settleMs = RUNTIME_SESSION_SETTLE_MS,
}: {
  session: RuntimeSessionForNotification
  tracker: RuntimeSessionNotificationTracker | undefined
  now: number
  startedAt: number
  settleMs?: number
}): { tracker: RuntimeSessionNotificationTracker; notify: boolean } | null {
  const lastActivityAt = session.lastActivityAt
  const lastActivityMs = lastActivityAt ? Date.parse(lastActivityAt) : Number.NaN
  if (!lastActivityAt || !Number.isFinite(lastActivityMs)) return null

  const isBaselineActivity = lastActivityMs < startedAt - 1000
  let nextTracker = tracker
  if (!nextTracker || nextTracker.lastActivityAt !== lastActivityAt) {
    nextTracker = {
      lastActivityAt,
      changedAt: now,
      notifiedLastActivityAt: isBaselineActivity ? lastActivityAt : null,
    }
  }

  if (nextTracker.notifiedLastActivityAt === lastActivityAt) {
    return { tracker: nextTracker, notify: false }
  }

  if (isBaselineActivity) {
    nextTracker.notifiedLastActivityAt = lastActivityAt
    return { tracker: nextTracker, notify: false }
  }

  if (runtimeSessionLooksActive(session)) return { tracker: nextTracker, notify: false }

  const quietEnough = now - lastActivityMs >= settleMs || now - nextTracker.changedAt >= settleMs
  if (!quietEnough) return { tracker: nextTracker, notify: false }

  nextTracker.notifiedLastActivityAt = lastActivityAt
  return { tracker: nextTracker, notify: true }
}
