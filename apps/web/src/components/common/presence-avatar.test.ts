import { describe, expect, it } from 'vitest'
import { normalizeBuddyAgentPresenceStatus } from './presence-avatar'

describe('normalizeBuddyAgentPresenceStatus', () => {
  it('treats a running agent as online unless there is active work', () => {
    expect(normalizeBuddyAgentPresenceStatus({ agentStatus: 'running' })).toBe('online')
    expect(normalizeBuddyAgentPresenceStatus({ agentStatus: 'running', busy: true })).toBe('busy')
  })

  it('preserves explicit buddy and user presence statuses', () => {
    expect(normalizeBuddyAgentPresenceStatus({ agentStatus: 'busy' })).toBe('busy')
    expect(normalizeBuddyAgentPresenceStatus({ agentStatus: 'idle' })).toBe('idle')
    expect(normalizeBuddyAgentPresenceStatus({ userStatus: 'online' })).toBe('online')
  })
})
