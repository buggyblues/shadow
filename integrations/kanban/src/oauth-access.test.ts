import { describe, expect, it } from 'vitest'
import {
  decodeSignedJson,
  encodeSignedJson,
  KANBAN_OAUTH_SESSION_MAX_AGE_SECONDS,
  kanbanOAuthAccessStatus,
  kanbanOAuthSessionMaxAgeSeconds,
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

  it('uses a persistent OAuth session cookie lifetime independent of the access token', () => {
    expect(kanbanOAuthSessionMaxAgeSeconds()).toBe(KANBAN_OAUTH_SESSION_MAX_AGE_SECONDS)
    expect(kanbanOAuthSessionMaxAgeSeconds('120')).toBe(120)
    expect(kanbanOAuthSessionMaxAgeSeconds('10')).toBe(60)
    expect(kanbanOAuthSessionMaxAgeSeconds('not-a-number')).toBe(
      KANBAN_OAUTH_SESSION_MAX_AGE_SECONDS,
    )
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
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'oauth_required',
      subject: 'owner-user',
    })
  })

  it('allows standard runtime access with a valid launch when OAuth is optional', () => {
    const status = kanbanOAuthAccessStatus({
      configured: false,
      required: false,
      launch: launchForBuddyOwner,
      session: null,
    })

    expect(status).toMatchObject({
      authenticated: true,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: null,
      subject: 'owner-user',
    })
  })

  it('keeps optional OAuth unbound when the cookie belongs to a different launch owner', () => {
    const status = kanbanOAuthAccessStatus({
      configured: true,
      required: false,
      launch: launchForBuddyOwner,
      session: {
        profile: { id: 'different-owner', displayName: 'Other User' },
        scope: 'user:read',
        expiresAt: 9_999_999_999_999,
      },
    })

    expect(status).toMatchObject({
      authenticated: true,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: null,
      subject: 'owner-user',
    })
  })

  it('still requires a Shadow launch when local commands are disabled', () => {
    const status = kanbanOAuthAccessStatus({
      configured: false,
      required: false,
      launch: null,
      session: null,
    })

    expect(status).toMatchObject({
      authenticated: false,
      launchAuthenticated: false,
      oauthAuthenticated: false,
      reason: 'launch_required',
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
    ).toMatchObject({
      authenticated: true,
      launchAuthenticated: true,
      oauthAuthenticated: true,
      reason: null,
    })
    expect(
      kanbanOAuthAccessStatus({
        configured: true,
        required: true,
        launch: launchForBuddyOwner,
        session: buddyRuntimeSession,
      }),
    ).toMatchObject({
      authenticated: false,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'oauth_identity_mismatch',
    })
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
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'oauth_not_configured',
    })
  })
})
