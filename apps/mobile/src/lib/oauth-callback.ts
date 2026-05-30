import * as SecureStore from 'expo-secure-store'
import { fetchApi } from './api'

export type OAuthCallbackParams = {
  accessToken?: string
  refreshToken?: string
  oauth?: string
  provider?: string
  error?: string
}

type OAuthUser = {
  id: string
  email: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

type SetAuth = (user: OAuthUser, accessToken: string, refreshToken: string) => void

function readFirst(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
  return typeof value === 'string' ? value : undefined
}

export function normalizeOAuthCallbackParams(
  input: Record<string, unknown> | null | undefined,
): OAuthCallbackParams {
  if (!input) return {}
  return {
    accessToken: readFirst(input.accessToken) ?? readFirst(input.access_token),
    refreshToken: readFirst(input.refreshToken) ?? readFirst(input.refresh_token),
    oauth: readFirst(input.oauth),
    provider: readFirst(input.provider),
    error: readFirst(input.error),
  }
}

export function parseOAuthCallbackUrl(url: string): OAuthCallbackParams {
  const values: Record<string, string> = {}

  const collect = (raw: string | undefined) => {
    if (!raw) return
    const normalized = raw.startsWith('?') || raw.startsWith('#') ? raw.slice(1) : raw
    const queryStart = normalized.indexOf('?')
    const query = queryStart >= 0 ? normalized.slice(queryStart + 1) : normalized
    const params = new URLSearchParams(query)
    params.forEach((value, key) => {
      values[key] = value
    })
  }

  const [withoutHash, hash] = url.split('#')
  const queryStart = withoutHash?.indexOf('?') ?? -1
  collect(queryStart >= 0 ? withoutHash?.slice(queryStart + 1) : undefined)
  collect(hash)

  return normalizeOAuthCallbackParams(values)
}

export function isOAuthCallbackUrl(url: string | null | undefined) {
  return Boolean(url?.includes('oauth-callback'))
}

export async function completeOAuthCallback(
  params: OAuthCallbackParams,
  setAuth: SetAuth,
): Promise<'authenticated' | 'linked' | 'missing'> {
  if (params.error) {
    throw new Error(params.error)
  }

  if (params.oauth === 'linked') {
    return 'linked'
  }

  if (!params.accessToken || !params.refreshToken) {
    return 'missing'
  }

  await SecureStore.setItemAsync('accessToken', params.accessToken)
  await SecureStore.setItemAsync('refreshToken', params.refreshToken)

  const user = await fetchApi<OAuthUser>('/api/auth/me', {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  })

  setAuth(user, params.accessToken, params.refreshToken)
  return 'authenticated'
}

export async function completeOAuthCallbackUrl(url: string, setAuth: SetAuth) {
  return completeOAuthCallback(parseOAuthCallbackUrl(url), setAuth)
}
