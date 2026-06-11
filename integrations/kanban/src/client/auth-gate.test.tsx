import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { KanbanOAuthSession } from './api.js'
import { AuthGate, canAuthorizeKanbanOAuth, hasKanbanBoardAccess } from './components/auth-gate.js'

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
  it('does not grant board access without an authenticated OAuth session', () => {
    expect(
      hasKanbanBoardAccess({
        configured: true,
        required: true,
        authenticated: false,
        reason: 'oauth_required',
        subject: 'owner-user',
        profile: null,
        authorizeUrl: 'https://shadow.test/oauth',
        launch,
      }),
    ).toBe(false)
  })

  it('renders a configuration gate when OAuth is required but missing', () => {
    const session: KanbanOAuthSession = {
      configured: false,
      required: true,
      authenticated: false,
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
    expect(html).toContain('Planner Buddy')
    expect(html).toContain('Connect Shadow')
  })
})
