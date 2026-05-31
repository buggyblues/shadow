export const DESKTOP_COMMUNITY_AUTH_REQUIRED = 'AUTH_REQUIRED'
export const DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT = 'shadow:desktop-community-auth-required'

const ACCESS_TOKEN_STORAGE_KEYS = ['accessToken', 'shadowAccessToken', 'shadow:accessToken']
const ACCESS_TOKEN_CONTAINER_KEYS = [
  'auth',
  'auth-storage',
  'shadow-auth',
  'shadow:auth',
  'shadow:auth-storage',
]
const MAX_TOKEN_SEARCH_DEPTH = 4
const MAX_TOKEN_SEARCH_KEYS = 80

export class DesktopCommunityAuthRequiredError extends Error {
  readonly code = DESKTOP_COMMUNITY_AUTH_REQUIRED

  constructor() {
    super(DESKTOP_COMMUNITY_AUTH_REQUIRED)
    this.name = 'DesktopCommunityAuthRequiredError'
  }
}

export function communityErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

export function isCommunityAuthRequiredError(error: unknown) {
  return communityErrorMessage(error).includes(DESKTOP_COMMUNITY_AUTH_REQUIRED)
}

export function communityRequestStateFromError(error: unknown): 'auth' | 'error' {
  return isCommunityAuthRequiredError(error) ? 'auth' : 'error'
}

export function normalizeCommunityAuthError(error: unknown) {
  if (!isCommunityAuthRequiredError(error)) return error
  return new DesktopCommunityAuthRequiredError()
}

export function normalizeCommunityAccessToken(token: unknown): string {
  return typeof token === 'string' ? token.trim() : ''
}

function extractTokenFromValue(value: unknown, depth = 0): string {
  if (!value || depth > MAX_TOKEN_SEARCH_DEPTH) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return ''
    try {
      return extractTokenFromValue(JSON.parse(trimmed) as unknown, depth + 1)
    } catch {
      return ''
    }
  }
  if (typeof value !== 'object') return ''

  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_TOKEN_SEARCH_KEYS)) {
      const token = extractTokenFromValue(item, depth + 1)
      if (token) return token
    }
    return ''
  }

  const record = value as Record<string, unknown>
  const directToken = normalizeCommunityAccessToken(record.accessToken)
  if (directToken) return directToken

  for (const item of Object.values(record).slice(0, MAX_TOKEN_SEARCH_KEYS)) {
    const token = extractTokenFromValue(item, depth + 1)
    if (token) return token
  }
  return ''
}

export function readCommunityAccessTokenFromStorage(
  getItem: (key: string) => string | null | undefined,
): string {
  for (const key of ACCESS_TOKEN_STORAGE_KEYS) {
    const token = normalizeCommunityAccessToken(getItem(key))
    if (token) return token
  }

  for (const key of ACCESS_TOKEN_CONTAINER_KEYS) {
    const token = extractTokenFromValue(getItem(key))
    if (token) return token
  }

  return ''
}

export function readCommunityAccessTokenFromStorageRecord(
  entries: Iterable<readonly [string, unknown]>,
): string {
  const byKey = new Map<string, unknown>()
  let count = 0
  for (const [key, value] of entries) {
    if (count >= MAX_TOKEN_SEARCH_KEYS) break
    byKey.set(key, value)
    count += 1
  }

  const directToken = readCommunityAccessTokenFromStorage((key) => {
    const value = byKey.get(key)
    return typeof value === 'string' ? value : null
  })
  if (directToken) return directToken

  for (const value of byKey.values()) {
    const token = extractTokenFromValue(value)
    if (token) return token
  }
  return ''
}

export function communityAccessTokenFromAuthorizationHeader(header: unknown): string {
  const value = normalizeCommunityAccessToken(header)
  const match = /^bearer\s+(.+)$/i.exec(value)
  return normalizeCommunityAccessToken(match?.[1])
}

export const COMMUNITY_ACCESS_TOKEN_FROM_STORAGE_SCRIPT = `(() => {
  const directKeys = ${JSON.stringify(ACCESS_TOKEN_STORAGE_KEYS)}
  const containerKeys = ${JSON.stringify(ACCESS_TOKEN_CONTAINER_KEYS)}
  const maxDepth = ${MAX_TOKEN_SEARCH_DEPTH}
  const maxKeys = ${MAX_TOKEN_SEARCH_KEYS}
  const normalize = (value) => (typeof value === 'string' ? value.trim() : '')
  const extract = (value, depth = 0) => {
    if (!value || depth > maxDepth) return ''
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return ''
      try {
        return extract(JSON.parse(trimmed), depth + 1)
      } catch {
        return ''
      }
    }
    if (typeof value !== 'object') return ''
    if (Array.isArray(value)) {
      for (const item of value.slice(0, maxKeys)) {
        const token = extract(item, depth + 1)
        if (token) return token
      }
      return ''
    }
    const direct = normalize(value.accessToken)
    if (direct) return direct
    for (const item of Object.values(value).slice(0, maxKeys)) {
      const token = extract(item, depth + 1)
      if (token) return token
    }
    return ''
  }

  try {
    for (const key of directKeys) {
      const token = normalize(localStorage.getItem(key))
      if (token) return token
    }
    for (const key of containerKeys) {
      const token = extract(localStorage.getItem(key))
      if (token) return token
    }
    for (let index = 0; index < Math.min(localStorage.length, maxKeys); index += 1) {
      const key = localStorage.key(index)
      const token = key ? extract(localStorage.getItem(key)) : ''
      if (token) return token
    }
  } catch {
    return ''
  }
  return ''
})()`
