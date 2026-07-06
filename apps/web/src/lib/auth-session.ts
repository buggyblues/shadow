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

type CurrentUserResult =
  | { status: 'authenticated'; user: AuthenticatedUser }
  | { status: 'unauthorized'; code?: string }
  | { status: 'unavailable' }

type TokenRefreshResult =
  | { status: 'refreshed'; tokens: StoredTokens }
  | { status: 'auth-failed'; code?: string }
  | { status: 'unavailable' }

let validationPromise: Promise<AuthenticatedUser | null> | null = null
let desktopAuthStateListenerInstalled = false
let cachedAuthenticatedSession: { accessToken: string; user: AuthenticatedUser } | null = null

export const AUTH_ME_QUERY_KEY = ['me'] as const

const TERMINAL_SESSION_ERROR_CODES = new Set([
  'SESSION_REVOKED',
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REVOKED',
])

export class AuthSessionUnavailableError extends Error {
  status = 503
  code = 'AUTH_SESSION_UNAVAILABLE'

  constructor() {
    super('Authentication session is temporarily unavailable')
    this.name = 'AuthSessionUnavailableError'
  }
}

export function isAuthSessionUnavailableError(
  error: unknown,
): error is AuthSessionUnavailableError {
  return error instanceof AuthSessionUnavailableError
}

function isAuthPath(pathname: string) {
  return pathname.startsWith('/app/login') || pathname.startsWith('/app/register')
}

function authStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function cacheAuthenticatedSession(user: AuthenticatedUser, accessToken: string) {
  cachedAuthenticatedSession = { accessToken, user }
  queryClient.setQueryData(AUTH_ME_QUERY_KEY, user)
}

function markAuthenticated(user: AuthenticatedUser, accessToken: string) {
  syncDesktopCommunityAuthToken(accessToken, undefined, 'sync')
  useAuthStore.setState({ user, accessToken, isAuthenticated: true })
  cacheAuthenticatedSession(user, accessToken)
}

function isCurrentAuthenticatedSession(accessToken: string): boolean {
  const state = useAuthStore.getState()
  return Boolean(state.isAuthenticated && state.user && state.accessToken === accessToken)
}

function cachedAuthenticatedUserForToken(accessToken: string): AuthenticatedUser | null {
  if (!accessToken) return null
  if (cachedAuthenticatedSession?.accessToken !== accessToken) return null
  useAuthStore.setState({
    user: cachedAuthenticatedSession.user,
    accessToken,
    isAuthenticated: true,
  })
  queryClient.setQueryData(AUTH_ME_QUERY_KEY, cachedAuthenticatedSession.user)
  return cachedAuthenticatedSession.user
}

export function getCachedAuthenticatedUser(): AuthenticatedUser | null {
  const state = useAuthStore.getState()
  const accessToken = authStorage()?.getItem('accessToken') ?? state.accessToken ?? ''
  return cachedAuthenticatedUserForToken(accessToken)
}

export function hasStoredAuthSession(): boolean {
  const state = useAuthStore.getState()
  const storage = authStorage()
  return Boolean(
    storage?.getItem('accessToken') ||
      storage?.getItem('refreshToken') ||
      state.accessToken ||
      state.isAuthenticated,
  )
}

function isTerminalSessionErrorCode(code?: string) {
  return Boolean(code && TERMINAL_SESSION_ERROR_CODES.has(code))
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type') ?? ''
  return contentType.includes('application/json')
    ? response.json().catch(() => ({}))
    : response.text().catch(() => '')
}

function readErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const code = (body as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

async function fetchCurrentUser(accessToken: string): Promise<CurrentUserResult> {
  try {
    const response = await fetch(getApiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (response.status === 401) {
      return { status: 'unauthorized', code: readErrorCode(await readResponseBody(response)) }
    }
    if (!response.ok) return { status: 'unavailable' }
    return { status: 'authenticated', user: (await response.json()) as AuthenticatedUser }
  } catch {
    return { status: 'unavailable' }
  }
}

async function refreshStoredTokens(): Promise<TokenRefreshResult> {
  const refreshToken = await readRefreshTokenForRefresh()
  if (!refreshToken) return { status: 'auth-failed' }

  try {
    const response = await fetch(getApiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      if (response.status >= 500 || response.status === 404) return { status: 'unavailable' }
      const code = readErrorCode(await readResponseBody(response))
      return response.status === 401 || isTerminalSessionErrorCode(code)
        ? { status: 'auth-failed', code }
        : { status: 'unavailable' }
    }
    const data = (await response.json()) as StoredTokens
    authStorage()?.setItem('accessToken', data.accessToken)
    authStorage()?.setItem('refreshToken', data.refreshToken)
    syncDesktopCommunityAuthToken(data.accessToken, data.refreshToken, 'refresh')
    return { status: 'refreshed', tokens: data }
  } catch {
    return { status: 'unavailable' }
  }
}

async function readRefreshTokenForRefresh(): Promise<string> {
  const storage = authStorage()
  const storedRefreshToken = storage?.getItem('refreshToken') ?? ''
  if (storedRefreshToken) return storedRefreshToken

  const desktopTokens = await readDesktopCommunityAuthTokens()
  if (desktopTokens.accessToken) storage?.setItem('accessToken', desktopTokens.accessToken)
  if (desktopTokens.refreshToken) storage?.setItem('refreshToken', desktopTokens.refreshToken)
  return desktopTokens.refreshToken
}

export function clearAuthenticatedSession(options?: {
  redirectToLogin?: boolean
  redirect?: string
  syncDesktop?: boolean
  desktopReason?: Extract<DesktopCommunityAuthSyncReason, 'logout' | 'revoked'>
}) {
  cachedAuthenticatedSession = null
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
  }
  if (desktopTokens.refreshToken) storage?.setItem('refreshToken', desktopTokens.refreshToken)
  if (desktopTokens.accessToken || desktopTokens.refreshToken) {
    return {
      accessToken: desktopTokens.accessToken,
      refreshToken: desktopTokens.refreshToken || storage?.getItem('refreshToken') || '',
    }
  }

  // A login can complete while an earlier route guard is waiting on the desktop bridge.
  // Re-read browser storage before reporting an empty session so that stale guards do not
  // clear a newly-applied login.
  return {
    accessToken: storage?.getItem('accessToken') ?? '',
    refreshToken: storage?.getItem('refreshToken') ?? '',
  }
}

async function validateStoredSession(): Promise<AuthenticatedUser | null> {
  const { accessToken, refreshToken } = await readStoredOrDesktopTokens()
  if (!accessToken) {
    if (refreshToken) {
      const refreshed = await refreshStoredTokens()
      if (refreshed.status === 'refreshed') {
        const refreshedUser = await fetchCurrentUser(refreshed.tokens.accessToken)
        if (refreshedUser.status === 'authenticated') {
          markAuthenticated(refreshedUser.user, refreshed.tokens.accessToken)
          return refreshedUser.user
        }
        if (refreshedUser.status === 'unavailable') throw new AuthSessionUnavailableError()
      }
      if (refreshed.status === 'unavailable') throw new AuthSessionUnavailableError()
      clearAuthenticatedSession({ syncDesktop: true, desktopReason: 'revoked' })
      return null
    }
    const state = useAuthStore.getState()
    const currentAccessToken = authStorage()?.getItem('accessToken') ?? state.accessToken ?? ''
    if (currentAccessToken) return state.user
    clearAuthenticatedSession()
    return null
  }

  const cachedUser = cachedAuthenticatedUserForToken(accessToken)
  if (cachedUser) return cachedUser

  const currentUser = await fetchCurrentUser(accessToken)
  if (currentUser.status === 'authenticated') {
    markAuthenticated(currentUser.user, accessToken)
    return currentUser.user
  }
  if (currentUser.status === 'unavailable') {
    const existingUser = useAuthStore.getState().user
    if (existingUser) return existingUser
    throw new AuthSessionUnavailableError()
  }
  if (isTerminalSessionErrorCode(currentUser.code)) {
    clearAuthenticatedSession({ syncDesktop: true, desktopReason: 'revoked' })
    return null
  }

  const refreshed = await refreshStoredTokens()
  if (refreshed.status === 'auth-failed') {
    clearAuthenticatedSession({ syncDesktop: true, desktopReason: 'revoked' })
    return null
  }
  if (refreshed.status === 'unavailable') {
    const existingUser = useAuthStore.getState().user
    if (existingUser) return existingUser
    throw new AuthSessionUnavailableError()
  }

  const refreshedUser = await fetchCurrentUser(refreshed.tokens.accessToken)
  if (refreshedUser.status === 'authenticated') {
    markAuthenticated(refreshedUser.user, refreshed.tokens.accessToken)
    return refreshedUser.user
  }
  if (refreshedUser.status === 'unauthorized') {
    if (isTerminalSessionErrorCode(refreshedUser.code) || refreshed.status === 'refreshed') {
      clearAuthenticatedSession({ syncDesktop: true, desktopReason: 'revoked' })
      return null
    }
  }
  throw new AuthSessionUnavailableError()
}

export function ensureAuthenticatedSession(): Promise<AuthenticatedUser | null> {
  const cachedUser = getCachedAuthenticatedUser()
  if (cachedUser) return Promise.resolve(cachedUser)

  validationPromise ??= validateStoredSession().finally(() => {
    validationPromise = null
  })
  return validationPromise
}

export function applyAuthenticatedSession(session: AuthenticatedSession) {
  useChatStore.getState().setActiveServer(null)
  queryClient.removeQueries()
  queryClient.clear()
  useAuthStore.getState().setAuth(session.user, session.accessToken, session.refreshToken)
  cacheAuthenticatedSession(session.user, session.accessToken)
}

export function installDesktopCommunityAuthStateListener(): void {
  if (desktopAuthStateListenerInstalled || typeof window === 'undefined') return
  desktopAuthStateListenerInstalled = true
  window.addEventListener(DESKTOP_COMMUNITY_AUTH_UPDATED_EVENT, (event) => {
    const detail =
      event instanceof CustomEvent && detailIsAuthUpdate(event.detail) ? event.detail : null
    if (!detail) return
    if (!detail.authenticated || !detail.accessToken) {
      if (detail.reason !== 'logout' && detail.reason !== 'revoked') return
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
