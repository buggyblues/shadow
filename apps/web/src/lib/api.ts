import { getApiUrl } from './api-url'
import { currentAppRedirect } from './auth-redirect'
import { clearAuthenticatedSession } from './auth-session'
import {
  readDesktopCommunityAuthTokens,
  syncDesktopCommunityAuthToken,
} from './desktop-community-auth'
import i18n from './i18n'
import { requestInviteCodeForApiError } from './invite-code-gate'

export class ApiError extends Error {
  status: number
  code?: string
  capability?: string
  membership?: unknown
  requiredAmount?: number
  balance?: number
  shortfall?: number
  nextAction?: string
  params?: Record<string, unknown>

  constructor(
    message: string,
    input: {
      status: number
      code?: string
      capability?: string
      membership?: unknown
      requiredAmount?: number
      balance?: number
      shortfall?: number
      nextAction?: string
      params?: Record<string, unknown>
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = input.status
    this.code = input.code
    this.capability = input.capability
    this.membership = input.membership
    this.requiredAmount = input.requiredAmount
    this.balance = input.balance
    this.shortfall = input.shortfall
    this.nextAction = input.nextAction
    this.params = input.params
  }
}

function getTestFetchApiMock():
  | ((path: string, options?: RequestInit) => Promise<unknown> | unknown)
  | null {
  const candidate = (globalThis as { __SHADOW_FETCH_API_MOCK__?: unknown })
    .__SHADOW_FETCH_API_MOCK__
  return typeof candidate === 'function'
    ? (candidate as (path: string, options?: RequestInit) => Promise<unknown> | unknown)
    : null
}

type TokenRefreshResult =
  | { status: 'refreshed'; accessToken: string }
  | { status: 'auth-failed' }
  | { status: 'unavailable' }

let isRefreshing = false
let refreshPromise: Promise<TokenRefreshResult> | null = null

const TERMINAL_AUTH_ERROR_CODES = new Set([
  'SESSION_REVOKED',
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REVOKED',
])

function isAuthEntryEndpoint(path: string) {
  return (
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/register') ||
    path.includes('/auth/email/') ||
    path.includes('/auth/password-reset/') ||
    path.endsWith('/auth/google/id-token')
  )
}

function isInviteRedeemEndpoint(path: string) {
  return path.endsWith('/membership/redeem-invite')
}

function deviceNameHeader() {
  return typeof navigator !== 'undefined' ? navigator.platform || 'Shadow Web' : 'Shadow Web'
}

function clearAuthState(options: { syncDesktop?: boolean } = {}) {
  clearAuthenticatedSession({
    redirectToLogin: true,
    redirect: currentAppRedirect(),
    syncDesktop: options.syncDesktop ?? true,
    desktopReason: 'revoked',
  })
}

function isTerminalAuthError(error: ApiError) {
  return error.status === 401 && Boolean(error.code && TERMINAL_AUTH_ERROR_CODES.has(error.code))
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type') ?? ''
  return contentType.includes('application/json')
    ? response.json().catch(() => ({}))
    : response.text().catch(() => '')
}

async function refreshAccessToken(): Promise<TokenRefreshResult> {
  const refreshToken = await readRefreshTokenForRefresh()
  if (!refreshToken) return { status: 'auth-failed' }
  try {
    const res = await fetch(getApiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shadow-device-name': deviceNameHeader(),
      },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      if (res.status >= 500 || res.status === 404) return { status: 'unavailable' }
      const error = buildApiError(res, await readResponseBody(res))
      return error.status === 401 || isTerminalAuthError(error)
        ? { status: 'auth-failed' }
        : { status: 'unavailable' }
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string }
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    syncDesktopCommunityAuthToken(data.accessToken, data.refreshToken, 'refresh')
    return { status: 'refreshed', accessToken: data.accessToken }
  } catch {
    return { status: 'unavailable' }
  }
}

async function readRefreshTokenForRefresh(): Promise<string> {
  const storedRefreshToken = localStorage.getItem('refreshToken') ?? ''
  if (storedRefreshToken) return storedRefreshToken

  const desktopTokens = await readDesktopCommunityAuthTokens()
  if (desktopTokens.accessToken) localStorage.setItem('accessToken', desktopTokens.accessToken)
  if (desktopTokens.refreshToken) localStorage.setItem('refreshToken', desktopTokens.refreshToken)
  return desktopTokens.refreshToken
}

function buildApiError(response: Response, body: unknown) {
  let errorMessage = `Request failed (${response.status})`
  let code: string | undefined
  let capability: string | undefined
  let membership: unknown
  let requiredAmount: number | undefined
  let balance: number | undefined
  let shortfall: number | undefined
  let nextAction: string | undefined
  let params: Record<string, unknown> | undefined
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>
    if (typeof b.code === 'string') code = b.code
    if (b.params && typeof b.params === 'object' && !Array.isArray(b.params)) {
      params = b.params as Record<string, unknown>
    }
    if (typeof b.capability === 'string') capability = b.capability
    if ('membership' in b) membership = b.membership
    if (typeof b.requiredAmount === 'number') requiredAmount = b.requiredAmount
    if (typeof b.balance === 'number') balance = b.balance
    if (typeof b.shortfall === 'number') shortfall = b.shortfall
    if (typeof b.nextAction === 'string') nextAction = b.nextAction
    if (typeof b.detail === 'string') {
      // Beta: show server error detail for easier debugging
      errorMessage = b.detail
    } else if (typeof b.error === 'string') {
      errorMessage = b.error
    } else if (
      b.error &&
      typeof b.error === 'object' &&
      Array.isArray((b.error as { issues?: unknown }).issues)
    ) {
      // Zod validation error
      const issues = (b.error as { issues: { message: string }[] }).issues
      errorMessage = issues.map((i) => i.message).join('; ')
    } else if (typeof b.message === 'string') {
      errorMessage = b.message
    }
  } else if (typeof body === 'string' && body) {
    errorMessage = body
  }

  return new ApiError(errorMessage, {
    status: response.status,
    code,
    capability,
    membership,
    requiredAmount,
    balance,
    shortfall,
    nextAction,
    params,
  })
}

async function fetchApiResponseInternal(
  path: string,
  options: RequestInit | undefined,
  context: { inviteRetry?: boolean } = {},
): Promise<Response> {
  const testMock = getTestFetchApiMock()
  if (testMock) {
    const payload = await testMock(path, options)
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = localStorage.getItem('accessToken')
  const isFormData = options?.body instanceof FormData
  const headers: Record<string, string> = {
    ...(options?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Accept-Language': i18n.language || 'zh-CN',
    'x-shadow-device-name': deviceNameHeader(),
    ...((options?.headers as Record<string, string>) ?? {}),
  }

  let response = await fetch(getApiUrl(path), {
    ...options,
    headers,
  })

  let refreshResult: TokenRefreshResult | null = null

  // Auto-refresh on 401 (skip auth entry endpoints)
  if (response.status === 401 && !isAuthEntryEndpoint(path)) {
    if (!isRefreshing || !refreshPromise) {
      isRefreshing = true
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false
        refreshPromise = null
      })
    }
    const pendingRefresh = refreshPromise
    refreshResult = await pendingRefresh
    if (refreshResult.status === 'refreshed') {
      headers.Authorization = `Bearer ${refreshResult.accessToken}`
      response = await fetch(getApiUrl(path), {
        ...options,
        headers,
      })
    }
  }

  if (!response.ok) {
    const apiError = buildApiError(response, await readResponseBody(response))
    if (
      response.status === 401 &&
      !isAuthEntryEndpoint(path) &&
      (refreshResult?.status === 'auth-failed' || isTerminalAuthError(apiError))
    ) {
      clearAuthState()
    }
    if (
      apiError.code === 'INVITE_REQUIRED' &&
      !context.inviteRetry &&
      !isInviteRedeemEndpoint(path)
    ) {
      try {
        await requestInviteCodeForApiError({
          error: apiError,
          path,
          method: options?.method?.toUpperCase() ?? 'GET',
        })
        return fetchApiResponseInternal(path, options, { inviteRetry: true })
      } catch {
        throw apiError
      }
    }
    throw apiError
  }

  return response
}

export async function fetchApiResponse(path: string, options?: RequestInit): Promise<Response> {
  return fetchApiResponseInternal(path, options)
}

// Generic fetch helper
export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchApiResponse(path, options)

  return response.json() as Promise<T>
}
