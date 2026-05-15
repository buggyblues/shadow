// Desktop API wrapper — patches navigation for hash-based routing in Electron
import { queryClient } from '@web/lib/query-client'

const configuredApiBase = import.meta.env.VITE_API_BASE ?? ''

const API_BASE = (() => {
  const hasRemoteBase =
    typeof configuredApiBase === 'string' && configuredApiBase.startsWith('http')
  if (!hasRemoteBase || typeof window === 'undefined') {
    return configuredApiBase
  }

  const { protocol, hostname } = window.location
  const isLocalDesktopDevHost =
    protocol === 'http:' && ['localhost', '127.0.0.1'].includes(hostname)
  const isAppProtocol = protocol === 'app:'

  return isLocalDesktopDevHost || isAppProtocol ? '' : configuredApiBase
})()

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

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

function clearAuthState() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  queryClient.removeQueries()
  queryClient.clear()
  // Use hash-based navigation for Electron
  const currentHash = window.location.hash || ''
  if (!currentHash.includes('/login') && !currentHash.includes('/register')) {
    window.location.hash = '/login'
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { accessToken: string; refreshToken: string }
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    return data.accessToken
  } catch {
    return null
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

function buildApiError(response: Response, body: unknown): ApiError {
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
    ...((options?.headers as Record<string, string>) ?? {}),
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401 && !path.includes('/auth/')) {
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
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      })
    } else {
      clearAuthState()
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw buildApiError(response, body)
  }

  return response
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchApiResponse(path, options)
  return response.json() as Promise<T>
}
