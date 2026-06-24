export const WEBSITE_AUTH_STATUS_EVENT = 'shadow:website-auth-status'

const AUTH_STATUS_STORAGE_KEY = 'shadow:website-auth-status'
const AUTH_STATUS_TTL_MS = 5 * 60 * 1000

export type WebsiteAuthUser = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export type WebsiteAuthStatus = {
  authenticated: boolean
  checkedAt: number
  user: WebsiteAuthUser | null
}

export function hasKnownAuthSession() {
  if (typeof window === 'undefined') return false
  if (window.localStorage.getItem('accessToken') && window.localStorage.getItem('refreshToken')) {
    return true
  }
  const status = readWebsiteAuthStatus()
  return Boolean(
    status?.authenticated &&
      Date.now() - status.checkedAt >= 0 &&
      Date.now() - status.checkedAt < AUTH_STATUS_TTL_MS,
  )
}

export function readWebsiteAuthStatus(): WebsiteAuthStatus | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(AUTH_STATUS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WebsiteAuthStatus>
    if (typeof parsed.authenticated !== 'boolean' || typeof parsed.checkedAt !== 'number') {
      return null
    }
    if (Date.now() - parsed.checkedAt < 0 || Date.now() - parsed.checkedAt >= AUTH_STATUS_TTL_MS) {
      return null
    }
    return {
      authenticated: parsed.authenticated,
      checkedAt: parsed.checkedAt,
      user: normalizeAuthUser(parsed.user),
    }
  } catch {
    return null
  }
}

export function writeWebsiteAuthStatus(authenticated: boolean, user?: WebsiteAuthUser | null) {
  if (typeof window === 'undefined') return
  const status: WebsiteAuthStatus = {
    authenticated,
    checkedAt: Date.now(),
    user: authenticated ? (user ?? null) : null,
  }
  window.sessionStorage.setItem(AUTH_STATUS_STORAGE_KEY, JSON.stringify(status))
  window.dispatchEvent(new CustomEvent(WEBSITE_AUTH_STATUS_EVENT, { detail: status }))
}

function normalizeAuthUser(value: unknown): WebsiteAuthUser | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.username !== 'string') return null
  return {
    id: record.id,
    username: record.username,
    displayName: typeof record.displayName === 'string' ? record.displayName : null,
    avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : null,
  }
}
