import { describe, expect, it } from 'vitest'
import {
  evaluateRuntimeSessionNotification,
  type RuntimeSessionForNotification,
  runtimeSessionReactionIsVisible,
} from '../src/renderer/lib/runtime-session-notifications'

const baseNow = Date.parse('2026-06-01T05:30:00.000Z')

function session(
  patch: Partial<RuntimeSessionForNotification> = {},
): RuntimeSessionForNotification {
  return {
    runtimeId: 'opencode',
    instanceId: 'database',
    sessionId: 'ses_test',
    title: '你好',
    lastActivityAt: new Date(baseNow - 11_000).toISOString(),
    state: 'unknown',
    ...patch,
  }
}

describe('runtime session notifications', () => {
  it('notifies a first-seen quiet OpenCode session updated after watcher start', () => {
    const result = evaluateRuntimeSessionNotification({
      session: session(),
      tracker: undefined,
      now: baseNow,
      startedAt: baseNow - 60_000,
    })

    expect(result?.notify).toBe(true)
    expect(result?.tracker.notifiedLastActivityAt).toBe(session().lastActivityAt)
  })

  it('baselines old sessions without notifying', () => {
    const result = evaluateRuntimeSessionNotification({
      session: session(),
      tracker: undefined,
      now: baseNow,
      startedAt: baseNow,
    })

    expect(result?.notify).toBe(false)
    expect(result?.tracker.notifiedLastActivityAt).toBe(session().lastActivityAt)
  })

  it('does not notify active sessions even when their last activity is quiet', () => {
    const result = evaluateRuntimeSessionNotification({
      session: session({ state: 'running' }),
      tracker: undefined,
      now: baseNow,
      startedAt: baseNow - 60_000,
    })

    expect(result?.notify).toBe(false)
    expect(result?.tracker.notifiedLastActivityAt).toBeNull()
  })

  it('deduplicates repeated scans after notifying once', () => {
    const first = evaluateRuntimeSessionNotification({
      session: session(),
      tracker: undefined,
      now: baseNow,
      startedAt: baseNow - 60_000,
    })
    const second = evaluateRuntimeSessionNotification({
      session: session(),
      tracker: first?.tracker,
      now: baseNow + 12_000,
      startedAt: baseNow - 60_000,
    })

    expect(first?.notify).toBe(true)
    expect(second?.notify).toBe(false)
  })

  it('waits for a changed session to settle, then notifies once', () => {
    const activeUpdate = session({
      lastActivityAt: new Date(baseNow - 2_000).toISOString(),
    })
    const first = evaluateRuntimeSessionNotification({
      session: activeUpdate,
      tracker: undefined,
      now: baseNow,
      startedAt: baseNow - 60_000,
    })
    const settled = evaluateRuntimeSessionNotification({
      session: activeUpdate,
      tracker: first?.tracker,
      now: baseNow + 9_000,
      startedAt: baseNow - 60_000,
    })

    expect(first?.notify).toBe(false)
    expect(settled?.notify).toBe(true)
  })

  it('does not show busy bubbles for non-active historical sessions', () => {
    const recentWorking = session({
      lastActivityAt: new Date(baseNow - 1_000).toISOString(),
      state: 'unknown',
      petReaction: 'working',
      petActivity: { kind: 'working' },
    })

    expect(runtimeSessionReactionIsVisible(recentWorking, baseNow, 45_000)).toBe(false)
  })

  it('keeps active runtime sessions visible for pet bubbles', () => {
    expect(runtimeSessionReactionIsVisible(session({ state: 'running' }), baseNow, 45_000)).toBe(
      true,
    )
  })

  it('allows recent terminal reactions to be visible briefly', () => {
    expect(
      runtimeSessionReactionIsVisible(
        session({
          lastActivityAt: new Date(baseNow - 1_000).toISOString(),
          state: 'completed',
          petReaction: 'success',
          petActivity: { kind: 'success' },
        }),
        baseNow,
        45_000,
      ),
    ).toBe(true)
  })
})
