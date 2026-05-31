import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'
import { getApiUrl } from './api-url'
import { syncDesktopCommunityAuthToken } from './desktop-community-auth'
import { queryClient } from './query-client'
import { disconnectSocket } from './socket'

export type AuthenticatedUser = {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status?: string
  membership?: {
    status: string
    tier?: {
      id: string
      level: number
      label: string
      capabilities: string[]
    }
    level?: number
    isMember: boolean
    memberSince?: string | null
    inviteCodeId?: string | null
    capabilities: string[]
  }
}

export type AuthenticatedSession = {
  user: AuthenticatedUser
  accessToken: string
  refreshToken: string
}

type StoredTokens = {
  accessToken: string
  refreshToken: string
}

let validationPromise: Promise<AuthenticatedUser | null> | null = null

function isAuthPath(pathname: string) {
  return pathname.startsWith('/app/login') || pathname.startsWith('/app/register')
}

function markAuthenticated(user: AuthenticatedUser, accessToken: string) {
  syncDesktopCommunityAuthToken(accessToken)
  useAuthStore.setState({ user, accessToken, isAuthenticated: true })
  queryClient.setQueryData(['me'], user)
}

async function fetchCurrentUser(accessToken: string): Promise<AuthenticatedUser | null> {
  const response = await fetch(getApiUrl('/api/auth/me'), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (response.status === 401) return null
  if (!response.ok) throw new Error(`Failed to validate session (${response.status})`)
  return (await response.json()) as AuthenticatedUser
}

async function refreshStoredTokens(): Promise<StoredTokens | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null

  const response = await fetch(getApiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) return null
  const data = (await response.json()) as StoredTokens
  localStorage.setItem('accessToken', data.accessToken)
  localStorage.setItem('refreshToken', data.refreshToken)
  syncDesktopCommunityAuthToken(data.accessToken)
  return data
}

export function clearAuthenticatedSession(options?: {
  redirectToLogin?: boolean
  redirect?: string
}) {
  if (typeof window !== 'undefined') {
    disconnectSocket()
  }
  useAuthStore.getState().logout()

  if (
    options?.redirectToLogin &&
    typeof window !== 'undefined' &&
    !isAuthPath(window.location.pathname)
  ) {
    const redirect = options.redirect ?? `${window.location.pathname}${window.location.search}`
    window.location.href = `/app/login?redirect=${encodeURIComponent(redirect)}`
  }
}

async function validateStoredSession(): Promise<AuthenticatedUser | null> {
  const accessToken = localStorage.getItem('accessToken')
  if (!accessToken) {
    clearAuthenticatedSession()
    return null
  }

  try {
    const currentUser = await fetchCurrentUser(accessToken)
    if (currentUser) {
      markAuthenticated(currentUser, accessToken)
      return currentUser
    }

    const refreshed = await refreshStoredTokens()
    if (!refreshed) {
      clearAuthenticatedSession()
      return null
    }

    const refreshedUser = await fetchCurrentUser(refreshed.accessToken)
    if (!refreshedUser) {
      clearAuthenticatedSession()
      return null
    }

    markAuthenticated(refreshedUser, refreshed.accessToken)
    return refreshedUser
  } catch {
    const existingUser = useAuthStore.getState().user
    if (existingUser) return existingUser
    clearAuthenticatedSession()
    return null
  }
}

export function ensureAuthenticatedSession(): Promise<AuthenticatedUser | null> {
  validationPromise ??= validateStoredSession().finally(() => {
    validationPromise = null
  })
  return validationPromise
}

export function applyAuthenticatedSession(session: AuthenticatedSession) {
  useAuthStore.getState().setAuth(session.user, session.accessToken, session.refreshToken)
  useChatStore.getState().setActiveServer(null)
  queryClient.removeQueries()
  queryClient.clear()
}
