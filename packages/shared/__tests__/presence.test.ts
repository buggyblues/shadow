import { describe, expect, it } from 'vitest'
import { normalizeBuddyPresenceStatus, normalizeUserStatus } from '../src/types'

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
})
