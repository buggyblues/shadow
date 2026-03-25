import Constants from 'expo-constants'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { queryClient } from './query-client'

export const API_BASE = Constants.expoConfig?.extra?.apiBase ?? 'https://shadowob.com'

/** Resolve a media path (e.g. `/shadow/uploads/...`) to a full URL */
export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

async function clearAuthState() {
  await Promise.all([
    SecureStore.deleteItemAsync('accessToken'),
    SecureStore.deleteItemAsync('refreshToken'),
  ])
  queryClient.removeQueries()
  queryClient.clear()
  router.replace('/(auth)/login')
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync('refreshToken')
  if (!refreshToken) return null
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { accessToken: string; refreshToken: string }
    await SecureStore.setItemAsync('accessToken', data.accessToken)
    await SecureStore.setItemAsync('refreshToken', data.refreshToken)
    return data.accessToken
  } catch {
    return null
  }
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await SecureStore.getItemAsync('accessToken')
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

  // Auto-refresh on 401
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
      await clearAuthState()
    }
  }

  // Refresh token may succeed but still be invalid/revoked on retry.
  if (response.status === 401 && !path.includes('/auth/')) {
    await clearAuthState()
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
