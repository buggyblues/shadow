import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

/**
 * OAuth callback page — receives tokens from URL hash after external OAuth login
 * URL: /oauth-callback#access_token=xxx&refresh_token=xxx&redirect=/app
 */
export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const redirect = params.get('redirect') ?? '/app/settings'

    if (!accessToken || !refreshToken) {
      navigate({ to: '/login' })
      return
    }

    // Fetch user profile with the token and set auth state
    fetchApi<{
      id: string
      email: string
      username: string
      displayName: string | null
      avatarUrl: string | null
    }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((user) => {
        setAuth(user, accessToken, refreshToken)
        // Clear hash from URL before navigating
        window.history.replaceState(null, '', window.location.pathname)
        // redirect is a full URL (not a router path), so use location
        window.location.href = redirect.startsWith('/') ? redirect : '/app/'
      })
      .catch(() => {
        navigate({ to: '/login' })
      })
  }, [navigate, setAuth])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-tertiary">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary text-sm">正在登录...</p>
      </div>
    </div>
  )
}
