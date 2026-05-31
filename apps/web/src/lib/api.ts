import { getApiUrl } from './api-url'
import { currentAppRedirect } from './auth-redirect'
import { clearAuthenticatedSession } from './auth-session'
import { syncDesktopCommunityAuthToken } from './desktop-community-auth'

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

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

function isAuthEntryEndpoint(path: string) {
  return (
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/register') ||
    path.includes('/auth/email/') ||
    path.includes('/auth/password-reset/') ||
    path.endsWith('/auth/google/id-token')
  )
}

function deviceNameHeader() {
  return typeof navigator !== 'undefined' ? navigator.platform || 'Shadow Web' : 'Shadow Web'
}

function clearAuthState() {
  clearAuthenticatedSession({
    redirectToLogin: true,
    redirect: currentAppRedirect(),
  })
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null
  try {
    const res = await fetch(getApiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shadow-device-name': deviceNameHeader(),
      },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { accessToken: string; refreshToken: string }
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    syncDesktopCommunityAuthToken(data.accessToken, data.refreshToken)
    return data.accessToken
  } catch {
    return null
  }
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

export async function fetchApiResponse(path: string, options?: RequestInit): Promise<Response> {
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
    'x-shadow-device-name': deviceNameHeader(),
    ...((options?.headers as Record<string, string>) ?? {}),
  }

  let response = await fetch(getApiUrl(path), {
    ...options,
    headers,
  })

  // Auto-refresh on 401 (skip auth entry endpoints)
  if (response.status === 401 && !isAuthEntryEndpoint(path)) {
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = refreshAccessToken().finally(() => {
        isRefreshing = false
        refreshPromise = null
      })
    }
    const newToken = await refreshPromise
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`
      response = await fetch(getApiUrl(path), {
        ...options,
        headers,
      })
    } else {
      // Refresh failed — clear auth state and redirect to login
      clearAuthState()
    }
  }

  // Refresh may succeed but token can still be unauthorized (revoked/expired server-side).
  if (response.status === 401 && !isAuthEntryEndpoint(path)) {
    clearAuthState()
  }

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') ?? ''
    const body = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => '')
    throw buildApiError(response, body)
  }

  return response
}

// Generic fetch helper
export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchApiResponse(path, options)

  return response.json() as Promise<T>
}
