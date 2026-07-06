import { Spinner } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { routerPathFromRedirect, webRedirectFromRouterPath } from '../lib/auth-redirect'
import { type AuthenticatedUser, applyAuthenticatedSession } from '../lib/auth-session'

/**
 * OAuth callback page — receives tokens from URL hash after external OAuth login
 * URL: /oauth-callback#access_token=xxx&refresh_token=xxx&redirect=/app
 */
export function OAuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const redirect = params.get('redirect') ?? webRedirectFromRouterPath()
    const inviteCode = params.get('invite_code') ?? params.get('inviteCode')

    if (!accessToken || !refreshToken) {
      navigate({ to: '/login' })
      return
    }

    // Fetch user profile with the token and set auth state
    fetchApi<AuthenticatedUser>('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (user) => {
        applyAuthenticatedSession({ user, accessToken, refreshToken })
        if (inviteCode?.trim()) {
          await fetchApi('/api/membership/redeem-invite', {
            method: 'POST',
            body: JSON.stringify({ code: inviteCode.trim() }),
          }).catch(() => null)
        }
        // Clear hash from URL before navigating
        window.history.replaceState(null, '', window.location.pathname)
        navigate({ to: routerPathFromRedirect(redirect), replace: true })
      })
      .catch(() => {
        navigate({ to: '/login' })
      })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-tertiary">
      <div className="text-center">
        <Spinner size="md" className="mx-auto mb-4" />
        <p className="text-text-secondary text-sm">{t('auth.authenticating')}</p>
      </div>
    </div>
  )
}
