import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'
import { getApiUrl } from './api-url'
import { currentAppRedirect } from './auth-redirect'
import {
  DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT,
  type DesktopCommunityAuthSyncReason,
  readDesktopCommunityAuthTokens,
  syncDesktopCommunityAuthToken,
} from './desktop-community-auth'
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
let desktopAuthStateListenerInstalled = false

function isAuthPath(pathname: string) {
  return pathname.startsWith('/app/login') || pathname.startsWith('/app/register')
}

function authStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function markAuthenticated(user: AuthenticatedUser, accessToken: string) {
  syncDesktopCommunityAuthToken(accessToken, undefined, 'sync')
  useAuthStore.setState({ user, accessToken, isAuthenticated: true })
  queryClient.setQueryData(['me'], user)
}

function isCurrentAuthenticatedSession(accessToken: string): boolean {
  const state = useAuthStore.getState()
  return Boolean(state.isAuthenticated && state.user && state.accessToken === accessToken)
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
  const refreshToken = authStorage()?.getItem('refreshToken')
  if (!refreshToken) return null

  const response = await fetch(getApiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) return null
  const data = (await response.json()) as StoredTokens
  authStorage()?.setItem('accessToken', data.accessToken)
  authStorage()?.setItem('refreshToken', data.refreshToken)
  syncDesktopCommunityAuthToken(data.accessToken, data.refreshToken, 'refresh')
  return data
}

export function clearAuthenticatedSession(options?: {
  redirectToLogin?: boolean
  redirect?: string
  syncDesktop?: boolean
  desktopReason?: Extract<DesktopCommunityAuthSyncReason, 'logout' | 'revoked'>
}) {
  if (typeof window !== 'undefined') {
    disconnectSocket()
  }
  useAuthStore.getState().logout({
    syncDesktop: options?.syncDesktop ?? false,
    desktopReason: options?.desktopReason,
  })

  if (
    options?.redirectToLogin &&
    typeof window !== 'undefined' &&
    !isAuthPath(window.location.pathname)
  ) {
    const redirect = options.redirect ?? `${window.location.pathname}${window.location.search}`
    window.location.href = `/app/login?redirect=${encodeURIComponent(redirect)}`
  }
}

async function readStoredOrDesktopTokens(): Promise<StoredTokens> {
  const storage = authStorage()
  const storedAccessToken = storage?.getItem('accessToken') ?? ''
  const storedRefreshToken = storage?.getItem('refreshToken') ?? ''
  if (storedAccessToken) {
    if (!storedRefreshToken) {
      const desktopTokens = await readDesktopCommunityAuthTokens()
      if (desktopTokens.refreshToken) storage?.setItem('refreshToken', desktopTokens.refreshToken)
      return {
        accessToken: storedAccessToken,
        refreshToken: desktopTokens.refreshToken || storedRefreshToken,
      }
    }
    return { accessToken: storedAccessToken, refreshToken: storedRefreshToken }
  }

  const desktopTokens = await readDesktopCommunityAuthTokens()
  if (desktopTokens.accessToken) {
    storage?.setItem('accessToken', desktopTokens.accessToken)
    if (desktopTokens.refreshToken) storage?.setItem('refreshToken', desktopTokens.refreshToken)
  }
  if (desktopTokens.accessToken) return desktopTokens

  // A login can complete while an earlier route guard is waiting on the desktop bridge.
  // Re-read browser storage before reporting an empty session so that stale guards do not
  // clear a newly-applied login.
  return {
    accessToken: storage?.getItem('accessToken') ?? '',
    refreshToken: storage?.getItem('refreshToken') ?? '',
  }
}

async function validateStoredSession(): Promise<AuthenticatedUser | null> {
  const { accessToken } = await readStoredOrDesktopTokens()
  if (!accessToken) {
    const state = useAuthStore.getState()
    const currentAccessToken = authStorage()?.getItem('accessToken') ?? state.accessToken ?? ''
    if (currentAccessToken) return state.user
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
      clearAuthenticatedSession({ syncDesktop: true, desktopReason: 'revoked' })
      return null
    }

    const refreshedUser = await fetchCurrentUser(refreshed.accessToken)
    if (!refreshedUser) {
      clearAuthenticatedSession({ syncDesktop: true, desktopReason: 'revoked' })
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

export function installDesktopCommunityAuthStateListener(): void {
  if (desktopAuthStateListenerInstalled || typeof window === 'undefined') return
  desktopAuthStateListenerInstalled = true
  window.addEventListener(DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT, (event) => {
    const detail =
      event instanceof CustomEvent && detailIsAuthUpdate(event.detail) ? event.detail : null
    if (!detail) return
    if (!detail.authenticated || !detail.accessToken) {
      clearAuthenticatedSession({
        redirectToLogin: true,
        redirect: currentAppRedirect(),
        syncDesktop: false,
      })
      return
    }
    const alreadyAuthenticated = isCurrentAuthenticatedSession(detail.accessToken)
    authStorage()?.setItem('accessToken', detail.accessToken)
    if (detail.refreshToken) authStorage()?.setItem('refreshToken', detail.refreshToken)
    if (alreadyAuthenticated) return
    void ensureAuthenticatedSession()
  })
}

function detailIsAuthUpdate(value: unknown): value is {
  accessToken: string
  refreshToken?: string
  authenticated: boolean
  reason?: string
} {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.authenticated === 'boolean' &&
    (typeof record.accessToken === 'string' || record.accessToken === undefined) &&
    (typeof record.refreshToken === 'string' || record.refreshToken === undefined)
  )
}
