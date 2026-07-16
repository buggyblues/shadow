import { describe, expect, it } from 'vitest'
import {
  createCurrentActorMember,
  normalizeSpaceMembers,
} from '../client/features/plan/api/trips.js'

const bootstrap = {
  actor: {
    displayName: 'Admin',
    userId: 'user_admin',
  },
}

describe('Space-scoped travel members', () => {
  it('never manufactures fallback travelers', () => {
    expect(createCurrentActorMember(bootstrap)).toEqual([
      expect.objectContaining({ displayName: 'Admin', userId: 'user_admin', current: true }),
    ])
    expect(normalizeSpaceMembers(bootstrap, []).map((member) => member.displayName)).toEqual([
      'Admin',
    ])
  })

  it('keeps current-Space humans and excludes Buddy identities', () => {
    const members = normalizeSpaceMembers(bootstrap, [
      { displayName: 'Admin', role: 'owner', userId: 'user_admin' },
      { displayName: 'Trip collaborator', role: 'traveler', userId: 'user_collaborator' },
      { displayName: 'Planner Buddy', isBuddy: true, userId: 'buddy_user' },
      { displayName: 'Bot account', isBot: true, userId: 'bot_user' },
      { displayName: 'Remote outsider', kind: 'buddy', userId: 'remote_user' },
    ])

    expect(members.map((member) => member.displayName)).toEqual(['Admin', 'Trip collaborator'])
    expect(members.find((member) => member.current)?.userId).toBe('user_admin')
  })
})
