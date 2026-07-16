import { apiGet, apiPost } from './api-client.js'
import { travelShadowSpaceApp } from './shadow-host.js'

export interface TravelOAuthSessionStatus {
  configured: boolean
  required: boolean
  authenticated: boolean
  launchAuthenticated: boolean
  oauthAuthenticated: boolean
  reason:
    | 'launch_required'
    | 'space_required'
    | 'oauth_identity_mismatch'
    | 'oauth_not_configured'
    | 'oauth_required'
    | null
  profile: {
    id: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  authorizeUrl: string | null
  authSource: 'launch' | 'oauth' | null
  serverId: string | null
  spaces: Array<{ id: string; name: string; slug?: string | null; iconUrl?: string | null }>
}

export function getTravelOAuthSession() {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return apiGet<TravelOAuthSessionStatus>('/api/oauth/session', {
    return_to: returnTo,
    embedded: travelShadowSpaceApp.bridgeAvailable() ? 1 : 0,
  })
}

export async function authorizeTravelOAuth(authorizeUrl: string) {
  const result = await travelShadowSpaceApp.authorizeOAuth({ authorizeUrl })
  if (!result.opened) window.location.assign(result.redirectUrl ?? authorizeUrl)
  return result
}

export function selectTravelSpace(serverId: string) {
  return apiPost<{ authenticated: boolean; serverId: string }>('/api/oauth/space', { serverId })
}
