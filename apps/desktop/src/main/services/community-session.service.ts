import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, net } from 'electron'
import {
  COMMUNITY_AUTH_TOKENS_FROM_STORAGE_SCRIPT,
  type CommunityAuthTokens,
  DESKTOP_COMMUNITY_AUTH_REQUIRED,
  normalizeCommunityAccessToken,
} from '../../shared/community-auth'
import { desktopSettingsService } from './desktop-settings.service'
import { loggerService } from './logger.service'
import { windowService } from './window.service'

export type CommunityAuthSnapshotReason =
  | 'startup'
  | 'storage'
  | 'sync'
  | 'login'
  | 'refresh'
  | 'logout'
  | 'settings'
  | 'revoked'

type StoredCommunitySession = CommunityAuthTokens & {
  updatedAt: number
}

type CommunityInteractiveAuthOpener = (
  redirect?: string | null,
) => void | boolean | Promise<void | boolean>

type PersistedCommunityAuth = {
  version: 1
  sessions: Record<string, StoredCommunitySession>
}

type PersistedCommunityAuthFile = {
  version?: unknown
  encoding?: unknown
  sessions?: Record<string, Partial<StoredCommunitySession> | null | undefined>
}

const COMMUNITY_AUTH_FILE = 'desktop-community-auth.json'
const COMMUNITY_AUTH_UPDATED_EVENT = 'shadow:desktop-community-auth-updated'
const AUTH_POLL_INTERVAL_MS = 800
const DEFAULT_INTERACTIVE_AUTH_TIMEOUT_MS = 120_000
const REFRESH_REJECTION_COOLDOWN_MS = 30_000

let sessions: Record<string, StoredCommunitySession> | null = null
let communityTokenRefreshPromise: Promise<string> | null = null
let communityInteractiveAuthPromise: Promise<string> | null = null
let communityInteractiveAuthOpener: CommunityInteractiveAuthOpener | null = null
let lastRefreshRejection: { refreshToken: string; rejectedAt: number; status: number } | null = null
const clearedSessionOrigins = new Set<string>()
const pendingWindowAuthWrites = new WeakMap<
  BrowserWindow,
  {
    tokens: Partial<CommunityAuthTokens>
    reason: CommunityAuthSnapshotReason
  }
>()

function authFilePath(): string {
  return join(app.getPath('userData'), COMMUNITY_AUTH_FILE)
}

function activeCommunityOrigin(): string {
  return desktopSettingsService.resolveDesktopServerBaseUrl(
    desktopSettingsService.readSettingsSync(),
  )
}

function communityLogUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    return `${url.origin}${url.pathname}`
  } catch {
    return rawUrl.split('?')[0] ?? rawUrl
  }
}

function emptyTokens(): CommunityAuthTokens {
  return { accessToken: '', refreshToken: '' }
}

function normalizeCommunityAuthTokens(tokens: unknown): CommunityAuthTokens {
  const record = tokens && typeof tokens === 'object' ? (tokens as Record<string, unknown>) : {}
  return {
    accessToken: normalizeCommunityAccessToken(record.accessToken),
    refreshToken: normalizeCommunityAccessToken(record.refreshToken),
  }
}

function loadSessions(): Record<string, StoredCommunitySession> {
  if (sessions) return sessions
  const path = authFilePath()
  if (!existsSync(path)) {
    sessions = {}
    return sessions
  }
  try {
    const persisted = JSON.parse(readFileSync(path, 'utf8')) as PersistedCommunityAuthFile
    const next: Record<string, StoredCommunitySession> = {}
    if (persisted.encoding === 'safeStorage') {
      loggerService.write(
        'warn',
        'community.auth',
        'ignored legacy safeStorage community auth file',
        { path },
      )
      sessions = next
      return sessions
    }
    for (const [origin, session] of Object.entries(persisted.sessions ?? {})) {
      if (!session) continue
      const accessToken = normalizeCommunityAccessToken(session?.accessToken)
      const refreshToken = normalizeCommunityAccessToken(session?.refreshToken)
      if (!accessToken && !refreshToken) continue
      next[origin] = {
        accessToken,
        refreshToken,
        updatedAt: Number.isFinite(session?.updatedAt) ? Number(session.updatedAt) : Date.now(),
      }
    }
    sessions = next
  } catch (error) {
    loggerService.write('warn', 'community.auth', 'failed to load persisted community auth', {
      path,
      error: error instanceof Error ? error.message : String(error),
    })
    sessions = {}
  }
  return sessions
}

function saveSessions(): void {
  const current = loadSessions()
  const persisted: PersistedCommunityAuth = {
    version: 1,
    sessions: Object.fromEntries(
      Object.entries(current).map(([origin, session]) => [
        origin,
        {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          updatedAt: session.updatedAt,
        },
      ]),
    ),
  }
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(authFilePath(), JSON.stringify(persisted, null, 2), 'utf8')
}

function activeStoredTokens(): CommunityAuthTokens {
  const session = loadSessions()[activeCommunityOrigin()]
  return session
    ? { accessToken: session.accessToken, refreshToken: session.refreshToken }
    : emptyTokens()
}

function isPassiveSnapshot(reason?: CommunityAuthSnapshotReason): boolean {
  return reason === 'startup' || reason === 'storage'
}

function rememberActiveTokens(
  tokens: Partial<CommunityAuthTokens>,
  options: { passive?: boolean } = {},
): CommunityAuthTokens {
  const origin = activeCommunityOrigin()
  if (options.passive && clearedSessionOrigins.has(origin)) return activeStoredTokens()
  const current = activeStoredTokens()
  const incomingAccessToken = normalizeCommunityAccessToken(tokens.accessToken)
  const incomingRefreshToken = normalizeCommunityAccessToken(tokens.refreshToken)
  const accessToken =
    options.passive && current.accessToken
      ? current.accessToken
      : incomingAccessToken || current.accessToken
  const refreshToken =
    options.passive && current.refreshToken
      ? current.refreshToken
      : incomingRefreshToken || current.refreshToken
  if (!accessToken && !refreshToken) return emptyTokens()
  const next = { accessToken, refreshToken }
  loadSessions()[origin] = { ...next, updatedAt: Date.now() }
  clearedSessionOrigins.delete(origin)
  if (!options.passive && refreshToken) lastRefreshRejection = null
  saveSessions()
  loggerService.write('debug', 'community.auth', 'stored community auth snapshot', {
    origin,
    hasAccessToken: Boolean(next.accessToken),
    hasRefreshToken: Boolean(next.refreshToken),
    passive: Boolean(options.passive),
    changedAccessToken: Boolean(incomingAccessToken && incomingAccessToken !== current.accessToken),
    changedRefreshToken: Boolean(
      incomingRefreshToken && incomingRefreshToken !== current.refreshToken,
    ),
  })
  return next
}

function clearActiveTokens(token?: string | null): boolean {
  const current = activeStoredTokens()
  const normalizedToken = normalizeCommunityAccessToken(token)
  if (normalizedToken && normalizedToken !== current.accessToken) return false
  const origin = activeCommunityOrigin()
  clearedSessionOrigins.add(origin)
  const currentSessions = loadSessions()
  if (!currentSessions[origin]) return false
  delete currentSessions[origin]
  saveSessions()
  loggerService.write('info', 'community.auth', 'cleared community auth tokens', {
    origin,
    tokenMatched: Boolean(normalizedToken),
  })
  return true
}

function clearActiveAccessToken(token?: string | null): boolean {
  const current = activeStoredTokens()
  const normalizedToken = normalizeCommunityAccessToken(token)
  if (normalizedToken && normalizedToken !== current.accessToken) return false
  if (!current.accessToken && !current.refreshToken) return false
  loadSessions()[activeCommunityOrigin()] = {
    accessToken: '',
    refreshToken: current.refreshToken,
    updatedAt: Date.now(),
  }
  saveSessions()
  loggerService.write('info', 'community.auth', 'cleared community access token', {
    origin: activeCommunityOrigin(),
    tokenMatched: Boolean(normalizedToken),
    keptRefreshToken: Boolean(current.refreshToken),
  })
  return true
}

function markCommunityAuthNeedsInteraction(status?: number): void {
  const current = activeStoredTokens()
  if (current.refreshToken) {
    lastRefreshRejection = {
      refreshToken: current.refreshToken,
      rejectedAt: Date.now(),
      status: status ?? 0,
    }
  }
  if (clearActiveAccessToken(current.accessToken)) {
    void syncCommunityAuthStateToOpenWindows('refresh')
  }
}

async function readAuthTokensFromWindow(win: BrowserWindow | null): Promise<CommunityAuthTokens> {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isLoading()) {
    return emptyTokens()
  }
  try {
    const tokens = (await win.webContents.executeJavaScript(
      COMMUNITY_AUTH_TOKENS_FROM_STORAGE_SCRIPT,
      true,
    )) as unknown
    const normalizedTokens = normalizeCommunityAuthTokens(tokens)
    if (normalizedTokens.accessToken || normalizedTokens.refreshToken) {
      return rememberActiveTokens(normalizedTokens, { passive: true })
    }
    return normalizedTokens
  } catch {
    return emptyTokens()
  }
}

async function readAuthTokensFromOpenWindows(): Promise<CommunityAuthTokens> {
  let refreshToken = ''
  for (const win of BrowserWindow.getAllWindows()) {
    const tokens = await readAuthTokensFromWindow(win)
    if (tokens.accessToken) return tokens
    refreshToken ||= tokens.refreshToken
  }
  return { accessToken: '', refreshToken }
}

function shouldWriteCommunityAuthToWindow(win: BrowserWindow): boolean {
  try {
    const url = new URL(win.webContents.getURL())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function writeCommunityAuthTokensToWindow(
  win: BrowserWindow,
  tokens: Partial<CommunityAuthTokens>,
  reason: CommunityAuthSnapshotReason,
): Promise<void> {
  if (
    win.isDestroyed() ||
    win.webContents.isDestroyed() ||
    !shouldWriteCommunityAuthToWindow(win)
  ) {
    return
  }
  if (win.webContents.isLoading()) {
    const alreadyPending = pendingWindowAuthWrites.has(win)
    pendingWindowAuthWrites.set(win, { tokens, reason })
    if (alreadyPending) {
      loggerService.write('debug', 'community.auth', 'coalesced pending window auth write', {
        reason,
        url: communityLogUrl(win.webContents.getURL()),
      })
    }
    if (!alreadyPending) {
      win.webContents.once('did-finish-load', () => {
        const pending = pendingWindowAuthWrites.get(win)
        pendingWindowAuthWrites.delete(win)
        if (pending) {
          void writeCommunityAuthTokensToWindow(win, pending.tokens, pending.reason)
        }
      })
    }
    return
  }
  const accessToken = normalizeCommunityAccessToken(tokens.accessToken)
  const refreshToken = normalizeCommunityAccessToken(tokens.refreshToken)
  const script = `(() => {
    try {
      const accessToken = ${JSON.stringify(accessToken)}
      const refreshToken = ${JSON.stringify(refreshToken)}
      const reason = ${JSON.stringify(reason)}
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      else localStorage.removeItem('accessToken')
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      else localStorage.removeItem('refreshToken')
      window.dispatchEvent(new CustomEvent(${JSON.stringify(COMMUNITY_AUTH_UPDATED_EVENT)}, {
        detail: { accessToken, refreshToken, authenticated: Boolean(accessToken), reason },
      }))
    } catch {}
  })()`
  await win.webContents.executeJavaScript(script, true).catch(() => undefined)
}

async function syncCommunityAuthStateToOpenWindows(
  reason: CommunityAuthSnapshotReason = 'sync',
): Promise<void> {
  const tokens = activeStoredTokens()
  await Promise.all(
    BrowserWindow.getAllWindows().map((win) =>
      writeCommunityAuthTokensToWindow(win, tokens, reason),
    ),
  )
}

function rememberCommunityAuthSnapshot(
  tokens: Partial<CommunityAuthTokens>,
  options: { reason?: CommunityAuthSnapshotReason } = {},
): void {
  const accessToken = normalizeCommunityAccessToken(tokens.accessToken)
  const refreshToken = normalizeCommunityAccessToken(tokens.refreshToken)
  if (accessToken || refreshToken) {
    rememberActiveTokens(
      { accessToken, refreshToken },
      { passive: isPassiveSnapshot(options.reason) },
    )
    void syncCommunityAuthStateToOpenWindows(options.reason ?? 'sync')
    return
  }
  if (options.reason === 'logout') {
    clearActiveTokens()
    void syncCommunityAuthStateToOpenWindows('logout')
  }
}

function rememberCommunityAccessToken(token: string | null | undefined): void {
  const normalizedToken = normalizeCommunityAccessToken(token)
  if (!normalizedToken) return
  rememberActiveTokens({ accessToken: normalizedToken })
}

function forgetCommunityAccessToken(token?: string | null): void {
  if (clearActiveAccessToken(token)) {
    void syncCommunityAuthStateToOpenWindows('refresh')
  }
}

function forgetCommunityAuthTokens(token?: string | null): void {
  if (clearActiveTokens(token)) {
    void syncCommunityAuthStateToOpenWindows('revoked')
  }
}

async function readCommunityAuthTokens(): Promise<CommunityAuthTokens> {
  const storedTokens = activeStoredTokens()
  if (storedTokens.accessToken) return storedTokens

  const mainTokens = await readAuthTokensFromWindow(windowService.getMainWindow())
  if (mainTokens.accessToken) return mainTokens

  const authWindowTokens = await readAuthTokensFromWindow(windowService.getConnectorAuthWindow())
  if (authWindowTokens.accessToken) return authWindowTokens

  const openWindowTokens = await readAuthTokensFromOpenWindows()
  if (openWindowTokens.accessToken) return openWindowTokens

  return {
    accessToken: storedTokens.accessToken,
    refreshToken:
      storedTokens.refreshToken ||
      mainTokens.refreshToken ||
      authWindowTokens.refreshToken ||
      openWindowTokens.refreshToken,
  }
}

function readStoredCommunityAuthTokens(): CommunityAuthTokens {
  return activeStoredTokens()
}

async function readCommunityAccessToken(): Promise<string> {
  return (await readCommunityAuthTokens()).accessToken
}

function communityApiUrl(path: string): string {
  return `${desktopSettingsService.resolveDesktopServerBaseUrl(
    desktopSettingsService.readSettingsSync(),
  )}${path}`
}

async function refreshCommunityAccessTokenOnce(): Promise<string> {
  const tokens = await readCommunityAuthTokens()
  if (!tokens.refreshToken) {
    loggerService.write('warn', 'community.auth', 'cannot refresh community access token', {
      origin: activeCommunityOrigin(),
      hasRefreshToken: false,
    })
    return ''
  }
  if (
    lastRefreshRejection?.refreshToken === tokens.refreshToken &&
    Date.now() - lastRefreshRejection.rejectedAt < REFRESH_REJECTION_COOLDOWN_MS
  ) {
    loggerService.write('warn', 'community.auth', 'skipping recently rejected refresh token', {
      origin: activeCommunityOrigin(),
      status: lastRefreshRejection.status,
      rejectedAgeMs: Date.now() - lastRefreshRejection.rejectedAt,
    })
    return ''
  }

  const response = await net.fetch(communityApiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })

  if (!response.ok) {
    loggerService.write('warn', 'community.auth', 'community token refresh failed', {
      origin: activeCommunityOrigin(),
      status: response.status,
      hasRefreshToken: true,
    })
    if (response.status === 401 || response.status === 403) {
      markCommunityAuthNeedsInteraction(response.status)
    }
    return ''
  }

  const payload = normalizeCommunityAuthTokens(await response.json().catch(() => ({})))
  if (!payload.accessToken) {
    loggerService.write(
      'warn',
      'community.auth',
      'community token refresh returned no access token',
      {
        origin: activeCommunityOrigin(),
        hasRefreshToken: Boolean(payload.refreshToken || tokens.refreshToken),
      },
    )
    return ''
  }
  const next = rememberActiveTokens(payload)
  await syncCommunityAuthStateToOpenWindows('refresh')
  loggerService.write('info', 'community.auth', 'community token refresh succeeded', {
    origin: activeCommunityOrigin(),
    hasRefreshToken: Boolean(next.refreshToken),
  })
  return next.accessToken
}

async function refreshCommunityAccessToken(): Promise<string> {
  communityTokenRefreshPromise ??= refreshCommunityAccessTokenOnce().finally(() => {
    communityTokenRefreshPromise = null
  })
  return communityTokenRefreshPromise
}

async function requestCommunityInteractiveAuth(
  options: { timeoutMs?: number; redirect?: string | null } = {},
): Promise<string> {
  const existingToken = await readCommunityAccessToken()
  if (existingToken) return existingToken
  communityInteractiveAuthPromise ??= (async () => {
    loggerService.write('info', 'community.auth', 'requesting interactive community auth', {
      origin: activeCommunityOrigin(),
      redirect: options.redirect ?? null,
    })
    windowService.showConnectorAuthWindow(options.redirect ?? undefined)
    try {
      await communityInteractiveAuthOpener?.(options.redirect ?? null)
    } catch (error) {
      loggerService.write('warn', 'community.auth', 'interactive auth opener failed', {
        origin: activeCommunityOrigin(),
        error: error instanceof Error ? error.message : String(error),
      })
    }
    const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_INTERACTIVE_AUTH_TIMEOUT_MS)
    while (Date.now() < deadline) {
      const token = await readCommunityAccessToken()
      if (token) {
        loggerService.write('info', 'community.auth', 'interactive community auth completed', {
          origin: activeCommunityOrigin(),
        })
        return token
      }
      await new Promise((resolve) => setTimeout(resolve, AUTH_POLL_INTERVAL_MS))
    }
    loggerService.write('warn', 'community.auth', 'interactive community auth timed out', {
      origin: activeCommunityOrigin(),
    })
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  })().finally(() => {
    communityInteractiveAuthPromise = null
  })
  return communityInteractiveAuthPromise
}

function withCommunityAuthorization(
  options: RequestInit,
  token: string,
): RequestInit & { headers: Record<string, string> } {
  return {
    ...options,
    headers: {
      ...((options.headers as Record<string, string> | undefined) ?? {}),
      Authorization: `Bearer ${token}`,
    },
  }
}

async function fetchCommunityUrlWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = await readCommunityAccessToken()
  if (!token) token = await refreshCommunityAccessToken()
  if (!token) {
    loggerService.write('warn', 'community.auth', 'community request requires authorization', {
      url: communityLogUrl(url),
      hasAccessToken: false,
    })
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  }

  let response = await net.fetch(url, withCommunityAuthorization(options, token))
  if (response.status === 401 || response.status === 403) {
    loggerService.write('warn', 'community.auth', 'community request rejected; refreshing token', {
      url: communityLogUrl(url),
      status: response.status,
    })
    const refreshedToken = await refreshCommunityAccessToken()
    if (refreshedToken) {
      token = refreshedToken
      response = await net.fetch(url, withCommunityAuthorization(options, token))
    }
  }
  if (response.status === 401 || response.status === 403) {
    loggerService.write(
      'warn',
      'community.auth',
      'community request still unauthorized after refresh',
      {
        url: communityLogUrl(url),
        status: response.status,
      },
    )
    forgetCommunityAccessToken(token)
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  }
  return response
}

function fetchCommunityWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
  return fetchCommunityUrlWithAuth(communityApiUrl(path), options)
}

function resetCommunityAuthStoreForTests(): void {
  sessions = null
  communityTokenRefreshPromise = null
  communityInteractiveAuthPromise = null
  communityInteractiveAuthOpener = null
  lastRefreshRejection = null
  clearedSessionOrigins.clear()
}

export class CommunitySessionService {
  syncAuthStateToOpenWindows(reason: CommunityAuthSnapshotReason = 'sync'): Promise<void> {
    return syncCommunityAuthStateToOpenWindows(reason)
  }

  rememberAuthSnapshot(
    tokens: Partial<CommunityAuthTokens>,
    options: { reason?: CommunityAuthSnapshotReason } = {},
  ): void {
    rememberCommunityAuthSnapshot(tokens, options)
  }

  rememberAccessToken(token: string | null | undefined): void {
    rememberCommunityAccessToken(token)
  }

  forgetAccessToken(token?: string | null): void {
    forgetCommunityAccessToken(token)
  }

  forgetAuthTokens(token?: string | null): void {
    forgetCommunityAuthTokens(token)
  }

  readAuthTokens(): Promise<CommunityAuthTokens> {
    return readCommunityAuthTokens()
  }

  readStoredAuthTokens(): CommunityAuthTokens {
    return readStoredCommunityAuthTokens()
  }

  readAccessToken(): Promise<string> {
    return readCommunityAccessToken()
  }

  refreshAccessToken(): Promise<string> {
    return refreshCommunityAccessToken()
  }

  requestInteractiveAuth(options?: {
    timeoutMs?: number
    redirect?: string | null
  }): Promise<string> {
    return requestCommunityInteractiveAuth(options)
  }

  setInteractiveAuthOpener(opener: CommunityInteractiveAuthOpener | null): void {
    communityInteractiveAuthOpener = opener
  }

  fetchUrlWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    return fetchCommunityUrlWithAuth(url, options)
  }

  fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
    return fetchCommunityWithAuth(path, options)
  }

  resetForTests(): void {
    resetCommunityAuthStoreForTests()
  }
}

export const communitySessionService = new CommunitySessionService()
