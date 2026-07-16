import { describe, expect, it } from 'vitest'
import { hasTravelAccess } from '../client/components/auth-gate.js'
import { requestContextFromLaunchIntrospection } from '../server/src/security/actor.js'
import { travelOAuthAccessStatus } from '../server/src/security/oauth.js'

describe('Travel OAuth gate', () => {
  it('honors an explicitly authenticated local launch session', () => {
    expect(
      hasTravelAccess({
        authenticated: true,
        authorizeUrl: null,
        configured: false,
        launchAuthenticated: true,
        oauthAuthenticated: false,
        profile: null,
        reason: null,
        required: false,
      }),
    ).toBe(true)
  })

  it('accepts a verified Space App launch without a second OAuth round trip', () => {
    expect(
      travelOAuthAccessStatus({
        configured: true,
        required: true,
        session: null,
        launch: {
          active: true,
          shadow: {
            protocol: 'shadow.space-app/1',
            serverId: 'space_1',
            spaceAppId: 'app_1',
            appKey: 'travel',
            actor: { kind: 'user', userId: 'user_1' },
          },
        },
      }),
    ).toMatchObject({
      authenticated: true,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: null,
      subject: 'user_1',
    })
  })

  it('still requires OAuth for standalone access when configured as required', () => {
    expect(
      travelOAuthAccessStatus({
        configured: true,
        required: true,
        session: null,
        launch: null,
      }),
    ).toMatchObject({
      authenticated: false,
      launchAuthenticated: false,
      oauthAuthenticated: false,
      reason: 'oauth_required',
    })
  })

  it('uses the launch actor when a stale standalone session belongs to another user', () => {
    const context = requestContextFromLaunchIntrospection({
      launch: {
        active: true,
        shadow: {
          protocol: 'shadow.space-app/1',
          serverId: 'space_1',
          spaceAppId: 'app_1',
          appKey: 'travel',
          actor: { kind: 'user', userId: 'user_1' },
        },
      },
      session: {
        profile: { id: 'stale_user' },
        scope: 'user:read',
        expiresAt: Date.now() + 60_000,
      },
      requestId: 'request_1',
      startedAt: '2026-07-13T00:00:00.000Z',
    })

    expect(context).toMatchObject({
      actor: { userId: 'user_1' },
      auth: {
        authenticated: true,
        launchAuthenticated: true,
        oauthAuthenticated: false,
      },
      serverId: 'space_1',
    })
  })
})
