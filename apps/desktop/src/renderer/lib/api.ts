// Desktop API wrapper — patches navigation for hash-based routing in Electron
import { queryClient } from '@web/lib/query-client'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

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
    let errorMessage = `Request failed (${response.status})`
    if (typeof body === 'object' && body !== null) {
      const b = body as Record<string, unknown>
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
    throw Object.assign(new Error(errorMessage), {
      status: response.status,
    })
  }

  return response.json() as Promise<T>
}
