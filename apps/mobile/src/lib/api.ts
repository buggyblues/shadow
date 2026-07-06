import Constants from 'expo-constants'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import i18n from '../i18n'
import { queryClient } from './query-client'
import { getApiBaseUrl, getCachedApiBaseUrl } from './server-url'

export {
  API_BASE,
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  getCachedApiBaseUrl,
  normalizeApiBaseUrl,
  resetApiBaseUrl,
  setApiBaseUrl,
} from './server-url'

export class ApiError extends Error {
  status: number
  code?: string
  capability?: string
  membership?: unknown
  params?: Record<string, unknown>

  constructor(
    message: string,
    input: {
      status: number
      code?: string
      capability?: string
      membership?: unknown
      params?: Record<string, unknown>
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = input.status
    this.code = input.code
    this.capability = input.capability
    this.membership = input.membership
    this.params = input.params
  }
}

/** Resolve a media path (e.g. `/shadow/uploads/...`) to a full URL */
export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${getCachedApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`
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

async function clearAuthState() {
  await Promise.all([
    SecureStore.deleteItemAsync('accessToken'),
    SecureStore.deleteItemAsync('refreshToken'),
  ])
  queryClient.removeQueries()
  queryClient.clear()
  router.replace('/(auth)/login')
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

function buildApiError(response: Response, body: unknown) {
  let errorMessage = `Request failed (${response.status})`
  let code: string | undefined
  let capability: string | undefined
  let membership: unknown
  let params: Record<string, unknown> | undefined
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>
    if (typeof b.code === 'string') code = b.code
    if (b.params && typeof b.params === 'object' && !Array.isArray(b.params)) {
      params = b.params as Record<string, unknown>
    }
    if (typeof b.capability === 'string') capability = b.capability
    if ('membership' in b) membership = b.membership
    if (typeof b.detail === 'string') {
      errorMessage = b.detail
    } else if (typeof b.error === 'string') {
      errorMessage = b.error
    } else if (
      b.error &&
      typeof b.error === 'object' &&
      Array.isArray((b.error as { issues?: unknown }).issues)
    ) {
      const issues = (b.error as { issues: { message: string }[] }).issues
      errorMessage = issues.map((i) => i.message).join('; ')
    } else if (typeof b.message === 'string') {
      errorMessage = b.message
    }
  }
  return new ApiError(errorMessage, {
    status: response.status,
    code,
    capability,
    membership,
    params,
  })
}

async function refreshAccessToken(): Promise<TokenRefreshResult> {
  const refreshToken = await SecureStore.getItemAsync('refreshToken')
  if (!refreshToken) return { status: 'auth-failed' }
  try {
    const apiBase = await getApiBaseUrl()
    const res = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shadow-device-name': Constants.expoConfig?.name ?? 'Shadow Mobile',
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
    await SecureStore.setItemAsync('accessToken', data.accessToken)
    await SecureStore.setItemAsync('refreshToken', data.refreshToken)
    return { status: 'refreshed', accessToken: data.accessToken }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const apiBase = await getApiBaseUrl()
  const token = await SecureStore.getItemAsync('accessToken')
  const isFormData = options?.body instanceof FormData
  const headers: Record<string, string> = {
    ...(options?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Accept-Language': i18n.language || 'zh-CN',
    'x-shadow-device-name': Constants.expoConfig?.name ?? 'Shadow Mobile',
    ...((options?.headers as Record<string, string>) ?? {}),
  }

  let response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  })

  let refreshResult: TokenRefreshResult | null = null

  // Auto-refresh on 401
  if (response.status === 401 && !path.includes('/auth/')) {
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
      response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers,
      })
    }
  }

  if (!response.ok) {
    const apiError = buildApiError(response, await readResponseBody(response))
    if (
      response.status === 401 &&
      !path.includes('/auth/') &&
      (refreshResult?.status === 'auth-failed' || isTerminalAuthError(apiError))
    ) {
      await clearAuthState()
    }
    throw apiError
  }

  return response.json() as Promise<T>
}
