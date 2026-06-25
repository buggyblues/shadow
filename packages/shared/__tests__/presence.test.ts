import { describe, expect, it } from 'vitest'
import {
  applyPresenceChangeToRuntime,
  getBuddyPresenceExpiresAt,
  normalizeBuddyPresenceStatus,
  normalizeUserStatus,
  resolvePresenceStatus,
} from '../src/types'

describe('presence helpers', () => {
  it('normalizes persisted user status values', () => {
    expect(normalizeUserStatus('online')).toBe('online')
    expect(normalizeUserStatus('idle')).toBe('idle')
    expect(normalizeUserStatus('dnd')).toBe('dnd')
    expect(normalizeUserStatus('offline')).toBe('offline')
    expect(normalizeUserStatus('busy')).toBe('offline')
    expect(normalizeUserStatus(null)).toBe('offline')
  })

  it('supports derived busy status for Buddy runtime presence', () => {
    expect(normalizeBuddyPresenceStatus('online', { busy: true })).toBe('busy')
    expect(normalizeBuddyPresenceStatus('busy')).toBe('busy')
    expect(normalizeBuddyPresenceStatus('idle')).toBe('idle')
    expect(normalizeBuddyPresenceStatus('unknown')).toBe('offline')
  })

  it('resolves Buddy runtime status from agent heartbeat freshness', () => {
    const nowMs = Date.parse('2026-06-10T10:00:00.000Z')
    const freshHeartbeat = '2026-06-10T09:59:30.000Z'
    const staleHeartbeat = '2026-06-10T09:57:00.000Z'

    expect(
      resolvePresenceStatus({
        isBot: true,
        agentStatus: 'running',
        lastHeartbeat: freshHeartbeat,
        nowMs,
      }),
    ).toBe('online')
    expect(
      resolvePresenceStatus({
        isBot: true,
        agentStatus: 'running',
        lastHeartbeat: staleHeartbeat,
        nowMs,
      }),
    ).toBe('offline')
    expect(resolvePresenceStatus({ userStatus: 'dnd', nowMs })).toBe('dnd')
    expect(resolvePresenceStatus({ userStatus: 'online', busy: true, nowMs })).toBe('busy')
  })

  it('does not use stale bot user status as Buddy online state', () => {
    expect(
      resolvePresenceStatus({
        isBot: true,
        userStatus: 'online',
        agentStatus: 'stopped',
        lastHeartbeat: null,
      }),
    ).toBe('offline')
    expect(
      resolvePresenceStatus({
        isBot: true,
        userStatus: 'online',
        agentStatus: 'running',
        lastHeartbeat: null,
      }),
    ).toBe('offline')
    expect(resolvePresenceStatus({ isBot: true, userStatus: 'online' })).toBe('offline')
  })

  it('derives Buddy heartbeat expiry timestamps', () => {
    expect(getBuddyPresenceExpiresAt('2026-06-10T09:59:30.000Z')).toBe('2026-06-10T10:01:00.000Z')
    expect(getBuddyPresenceExpiresAt(null)).toBeNull()
    expect(getBuddyPresenceExpiresAt('not-a-date')).toBeNull()
  })

  it('applies presence changes to user and Buddy runtime fields', () => {
    expect(
      applyPresenceChangeToRuntime(
        { userStatus: 'offline', isBot: false },
        { userId: 'u1', status: 'online' },
        { observedAt: '2026-06-10T10:00:00.000Z' },
      ),
    ).toEqual({ userStatus: 'online' })

    expect(
      applyPresenceChangeToRuntime(
        { userStatus: 'offline', isBot: true, agentStatus: 'running', lastHeartbeat: null },
        { userId: 'b1', status: 'online', agentId: 'a1' },
        { observedAt: '2026-06-10T10:00:00.000Z' },
      ),
    ).toEqual({
      userStatus: 'online',
      agentStatus: 'running',
      lastHeartbeat: '2026-06-10T10:00:00.000Z',
    })

    expect(
      applyPresenceChangeToRuntime(
        {
          userStatus: 'online',
          isBot: true,
          agentStatus: 'running',
          lastHeartbeat: '2026-06-10T10:00:00.000Z',
        },
        { userId: 'b1', status: 'offline', agentId: 'a1', agentStatus: 'stopped' },
      ),
    ).toEqual({
      userStatus: 'offline',
      agentStatus: 'stopped',
      lastHeartbeat: null,
    })

    expect(
      applyPresenceChangeToRuntime(
        { userStatus: 'offline', isBot: true, agentStatus: null, lastHeartbeat: null },
        { userId: 'b1', status: 'online' },
        { observedAt: '2026-06-10T10:00:00.000Z' },
      ),
    ).toEqual({
      userStatus: 'online',
      agentStatus: null,
      lastHeartbeat: null,
    })
  })
})
