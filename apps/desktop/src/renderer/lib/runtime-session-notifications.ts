export const RUNTIME_SESSION_SETTLE_MS = 10_000

export type RuntimeSessionForNotification = {
  runtimeId: string
  instanceId: string
  sessionId: string
  title?: string | null
  lastActivityAt?: string | null
  state:
    | 'idle'
    | 'running'
    | 'streaming'
    | 'waiting_for_approval'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'stopped'
    | 'unknown'
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
  return (
    session.state === 'running' ||
    session.state === 'streaming' ||
    session.state === 'waiting_for_approval' ||
    session.state === 'blocked'
  )
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
