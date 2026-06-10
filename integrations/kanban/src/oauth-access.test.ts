import { describe, expect, it } from 'vitest'
import {
  decodeSignedJson,
  encodeSignedJson,
  kanbanOAuthAccessStatus,
  readKanbanOAuthSession,
  type ShadowLaunchIntrospection,
} from './oauth-access.js'

const launchForBuddyOwner: ShadowLaunchIntrospection = {
  active: true,
  shadow: {
    serverId: 'server-1',
    serverAppId: 'app-1',
    appKey: 'kanban',
    actor: {
      kind: 'agent',
      userId: 'buddy-runtime-user',
      ownerId: 'owner-user',
      buddyAgentId: 'agent-1',
      profile: {
        id: 'buddy-runtime-user',
        displayName: 'Planner Buddy',
        avatarUrl: null,
      },
    },
  },
}

describe('Kanban OAuth access model', () => {
  it('signs OAuth session cookies and rejects tampered secrets', () => {
    const session = {
      profile: { id: 'owner-user', displayName: 'Owner User' },
      scope: 'user:read',
      expiresAt: 9_999_999_999_999,
    }
    const cookie = encodeSignedJson(session, 'secret-a')

    expect(readKanbanOAuthSession(cookie, 'secret-a')?.profile.id).toBe('owner-user')
    expect(decodeSignedJson(cookie, 'secret-b')).toBeNull()
  })

  it('requires OAuth before runtime access when the launch is valid but no session exists', () => {
    const status = kanbanOAuthAccessStatus({
      configured: true,
      required: true,
      launch: launchForBuddyOwner,
      session: null,
    })

    expect(status).toMatchObject({
      authenticated: false,
      reason: 'oauth_required',
      subject: 'owner-user',
    })
  })

  it('matches Buddy launches against the inherited owner user, not the runtime Buddy user', () => {
    const ownerSession = {
      profile: { id: 'owner-user', displayName: 'Owner User' },
      scope: 'user:read',
      expiresAt: 9_999_999_999_999,
    }
    const buddyRuntimeSession = {
      profile: { id: 'buddy-runtime-user', displayName: 'Planner Buddy' },
      scope: 'user:read',
      expiresAt: 9_999_999_999_999,
    }

    expect(
      kanbanOAuthAccessStatus({
        configured: true,
        required: true,
        launch: launchForBuddyOwner,
        session: ownerSession,
      }),
    ).toMatchObject({ authenticated: true, reason: null })
    expect(
      kanbanOAuthAccessStatus({
        configured: true,
        required: true,
        launch: launchForBuddyOwner,
        session: buddyRuntimeSession,
      }),
    ).toMatchObject({ authenticated: false, reason: 'oauth_identity_mismatch' })
  })

  it('blocks runtime access when OAuth is required but not configured', () => {
    const status = kanbanOAuthAccessStatus({
      configured: false,
      required: true,
      launch: launchForBuddyOwner,
      session: null,
    })

    expect(status).toMatchObject({
      authenticated: false,
      reason: 'oauth_not_configured',
    })
  })
})
