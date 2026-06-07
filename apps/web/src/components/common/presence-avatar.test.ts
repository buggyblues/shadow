import { describe, expect, it } from 'vitest'
import { normalizeBuddyAgentPresenceStatus } from './presence-avatar'

describe('normalizeBuddyAgentPresenceStatus', () => {
  it('treats a running agent as online only when its heartbeat is fresh', () => {
    const nowMs = Date.now()
    const freshHeartbeat = new Date(nowMs - 30_000).toISOString()
    const staleHeartbeat = new Date(nowMs - 120_000).toISOString()

    expect(
      normalizeBuddyAgentPresenceStatus({ agentStatus: 'running', lastHeartbeat: freshHeartbeat }),
    ).toBe('online')
    expect(
      normalizeBuddyAgentPresenceStatus({ agentStatus: 'running', lastHeartbeat: staleHeartbeat }),
    ).toBe('offline')
    expect(
      normalizeBuddyAgentPresenceStatus({
        agentStatus: 'running',
        lastHeartbeat: staleHeartbeat,
        busy: true,
      }),
    ).toBe('busy')
  })

  it('preserves explicit buddy and user presence statuses', () => {
    expect(normalizeBuddyAgentPresenceStatus({ agentStatus: 'busy' })).toBe('busy')
    expect(normalizeBuddyAgentPresenceStatus({ agentStatus: 'idle' })).toBe('idle')
    expect(normalizeBuddyAgentPresenceStatus({ userStatus: 'online' })).toBe('online')
  })
})
