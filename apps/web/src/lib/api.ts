import { queryClient } from './query-client'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

function getApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  if (API_BASE) return `${API_BASE}${path}`

  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString()
  }

  return path
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

function clearAuthState() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  // Clear query cache to prevent stale data on next session
  queryClient.removeQueries()
  queryClient.clear()
  // Redirect to login page if not already there (full reload clears all in-memory state)
  if (
    !window.location.pathname.startsWith('/app/login') &&
    !window.location.pathname.startsWith('/app/register')
  ) {
    window.location.href = '/app/login'
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

// Generic fetch helper
export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const testMock = getTestFetchApiMock()
  if (testMock) {
    return (await testMock(path, options)) as T
  }

  const token = localStorage.getItem('accessToken')
  const isFormData = options?.body instanceof FormData
  const headers: Record<string, string> = {
    ...(options?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) ?? {}),
  }

  let response = await fetch(getApiUrl(path), {
    ...options,
    headers,
  })

  // Auto-refresh on 401 (skip for login/register endpoints only)
  if (
    response.status === 401 &&
    !path.endsWith('/auth/login') &&
    !path.endsWith('/auth/register')
  ) {
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

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    let errorMessage = `Request failed (${response.status})`
    if (typeof body === 'object' && body !== null) {
      const b = body as Record<string, unknown>
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
    }
    throw Object.assign(new Error(errorMessage), {
      status: response.status,
    })
  }

  return response.json() as Promise<T>
}
