import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { KanbanOAuthSession } from './api.js'
import {
  AuthGate,
  canAuthorizeKanbanOAuth,
  hasKanbanBoardAccess,
  shouldAutoAuthorizeKanbanOAuth,
} from './components/auth-gate.js'

const launch = {
  active: true,
  serverId: 'server-1',
  appKey: 'kanban',
  actor: {
    kind: 'agent',
    userId: 'buddy-runtime-user',
    ownerId: 'owner-user',
    buddyAgentId: 'agent-1',
    displayName: 'Planner Buddy',
    avatarUrl: null,
  },
}

describe('AuthGate', () => {
  it('grants board access for the standard launch-session path without OAuth binding', () => {
    expect(
      hasKanbanBoardAccess({
        configured: false,
        required: false,
        authenticated: true,
        launchAuthenticated: true,
        oauthAuthenticated: false,
        reason: null,
        subject: 'owner-user',
        profile: null,
        authorizeUrl: null,
        launch,
      }),
    ).toBe(true)
  })

  it('does not grant board access when the launch context is missing', () => {
    expect(
      hasKanbanBoardAccess({
        configured: false,
        required: false,
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        reason: 'launch_required',
        subject: null,
        profile: null,
        authorizeUrl: null,
        launch: null,
      }),
    ).toBe(false)
  })

  it('does not grant board access without an authenticated OAuth session', () => {
    expect(
      hasKanbanBoardAccess({
        configured: true,
        required: true,
        authenticated: false,
        launchAuthenticated: true,
        oauthAuthenticated: false,
        reason: 'oauth_required',
        subject: 'owner-user',
        profile: null,
        authorizeUrl: 'https://shadow.test/oauth',
        launch,
      }),
    ).toBe(false)
  })

  it('allows optional OAuth binding without auto-opening the OAuth dialog', () => {
    const session: KanbanOAuthSession = {
      configured: true,
      required: false,
      authenticated: true,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: null,
      subject: 'owner-user',
      profile: null,
      authorizeUrl: 'https://shadow.test/oauth',
      launch,
    }

    expect(canAuthorizeKanbanOAuth(session)).toBe(true)
    expect(shouldAutoAuthorizeKanbanOAuth(session)).toBe(false)
  })

  it('auto-opens OAuth only when it blocks board access', () => {
    expect(
      shouldAutoAuthorizeKanbanOAuth({
        configured: true,
        required: true,
        authenticated: false,
        launchAuthenticated: true,
        oauthAuthenticated: false,
        reason: 'oauth_required',
        subject: 'owner-user',
        profile: null,
        authorizeUrl: 'https://shadow.test/oauth',
        launch,
      }),
    ).toBe(true)
  })

  it('renders a configuration gate when OAuth is required but missing', () => {
    const session: KanbanOAuthSession = {
      configured: false,
      required: true,
      authenticated: false,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'oauth_not_configured',
      subject: 'owner-user',
      profile: null,
      authorizeUrl: null,
      launch,
    }

    const html = renderToStaticMarkup(
      <AuthGate
        error={null}
        loading={false}
        oauthPopupOpen={false}
        session={session}
        onAuthorize={() => {}}
        onRefresh={() => {}}
      />,
    )

    expect(html).toContain('Kanban OAuth setup is pending')
    expect(html).not.toContain('Connect Shadow')
  })

  it('does not offer OAuth when the launch context is missing', () => {
    const session: KanbanOAuthSession = {
      configured: true,
      required: true,
      authenticated: false,
      launchAuthenticated: false,
      oauthAuthenticated: false,
      reason: 'launch_required',
      subject: null,
      profile: null,
      authorizeUrl: 'https://shadow.test/oauth',
      launch: null,
    }

    const html = renderToStaticMarkup(
      <AuthGate
        error={null}
        loading={false}
        oauthPopupOpen={false}
        session={session}
        onAuthorize={() => {}}
        onRefresh={() => {}}
      />,
    )

    expect(canAuthorizeKanbanOAuth(session)).toBe(false)
    expect(html).toContain('Refresh Shadow to reopen Kanban')
    expect(html).not.toContain('Connect Shadow')
  })

  it('renders the Buddy owner mismatch gate with a retry action', () => {
    const session: KanbanOAuthSession = {
      configured: true,
      required: true,
      authenticated: false,
      launchAuthenticated: true,
      oauthAuthenticated: false,
      reason: 'oauth_identity_mismatch',
      subject: 'owner-user',
      profile: null,
      authorizeUrl: 'https://shadow.test/oauth',
      launch,
    }

    const html = renderToStaticMarkup(
      <AuthGate
        error={null}
        loading={false}
        oauthPopupOpen={false}
        session={session}
        onAuthorize={() => {}}
        onRefresh={() => {}}
      />,
    )

    expect(html).toContain('OAuth identity does not match')
    expect(html).toContain('Connect Shadow')
    expect(html).not.toContain('Planner Buddy')
    expect(html).not.toContain('server-1')
  })
})
