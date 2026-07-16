import { fetchApi } from './api'

export interface BridgeOAuthAuthorizeInfo {
  appId: string
  appName: string
  appLogoUrl: string | null
  homepageUrl: string | null
  scope: string
  redirectUri: string
  state?: string
}

export interface BridgeOAuthRequestInput {
  authorizeUrl: string
}

export function isShadowOAuthAuthorizeUrl(value: string, origin = window.location.origin) {
  try {
    const url = new URL(value)
    return (
      url.origin === origin &&
      (url.pathname === '/app/oauth/authorize' || url.pathname === '/oauth/authorize')
    )
  } catch {
    return false
  }
}

export function shadowOAuthAuthorizeApiPath(authorizeUrl: string) {
  const url = new URL(authorizeUrl)
  const params = new URLSearchParams({
    response_type: url.searchParams.get('response_type') ?? 'code',
    client_id: url.searchParams.get('client_id') ?? '',
    redirect_uri: url.searchParams.get('redirect_uri') ?? '',
    scope: url.searchParams.get('scope') ?? 'user:read',
  })
  const state = url.searchParams.get('state')
  if (state) params.set('state', state)
  return `/api/oauth/authorize?${params.toString()}`
}

export function oauthStateFromAuthorizeUrl(authorizeUrl: string) {
  return new URL(authorizeUrl).searchParams.get('state') ?? undefined
}

function authorizePayload(authorizeUrl: string, scope: string) {
  const url = new URL(authorizeUrl)
  return {
    clientId: url.searchParams.get('client_id'),
    redirectUri: url.searchParams.get('redirect_uri'),
    scope,
    state: url.searchParams.get('state') ?? undefined,
  }
}

export async function loadBridgeOAuthAuthorizeInfo(
  input: BridgeOAuthRequestInput,
): Promise<BridgeOAuthAuthorizeInfo> {
  const appInfo = await fetchApi<BridgeOAuthAuthorizeInfo>(
    shadowOAuthAuthorizeApiPath(input.authorizeUrl),
  )
  return {
    ...appInfo,
    state: oauthStateFromAuthorizeUrl(input.authorizeUrl),
  }
}

export async function silentAuthorizeBridgeOAuth(input: { authorizeUrl: string; scope: string }) {
  return fetchApi<{ redirectUrl: string }>('/api/oauth/authorize/silent', {
    method: 'POST',
    body: JSON.stringify(authorizePayload(input.authorizeUrl, input.scope)),
  })
}

export async function approveBridgeOAuth(input: { authorizeUrl: string; scope: string }) {
  return fetchApi<{ redirectUrl: string }>('/api/oauth/authorize', {
    method: 'POST',
    body: JSON.stringify(authorizePayload(input.authorizeUrl, input.scope)),
  })
}
