import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  normalizeShadowSpaceAppAvatarUrl,
  type ShadowSpaceAppCommandContext,
  type ShadowSpaceAppLaunchIntrospection,
  shadowSpaceAppApiBaseUrl,
  shadowSpaceAppPublicBaseUrl,
} from '@shadowob/sdk'

export const TRAVEL_OAUTH_SESSION_COOKIE = 'travel_oauth_session'
export const TRAVEL_OAUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400

export interface TravelOAuthProfile {
  id: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface TravelOAuthSession {
  profile: TravelOAuthProfile
  scope: string
  expiresAt: number
  authSource: 'launch' | 'oauth'
  serverId: string | null
  spaceAppId?: string | null
  appKey?: string | null
  channelId?: string | null
  launchActor?: {
    kind: string
    userId?: string | null
    buddyAgentId?: string | null
    ownerId?: string | null
  } | null
  launchToken?: string | null
  launchExpiresAt?: number | null
  oauthAccessToken?: string | null
  oauthAccessTokenExpiresAt?: number | null
}

export type TravelOAuthAccessReason =
  | 'launch_required'
  | 'space_required'
  | 'oauth_identity_mismatch'
  | 'oauth_not_configured'
  | 'oauth_required'

export interface TravelOAuthAccessStatus {
  configured: boolean
  required: boolean
  authenticated: boolean
  launchAuthenticated: boolean
  oauthAuthenticated: boolean
  reason: TravelOAuthAccessReason | null
  subject: string | null
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function travelPublicBaseUrl() {
  return trimTrailingSlash(
    process.env.TRAVEL_PUBLIC_BASE_URL ??
      process.env.SHADOWOB_APP_PUBLIC_BASE_URL ??
      `http://localhost:${Number(process.env.PORT ?? 4224)}`,
  )
}

export function travelShadowApiBaseUrl() {
  return shadowSpaceAppApiBaseUrl(process.env)
}

export function travelShadowWebBaseUrl() {
  return shadowSpaceAppPublicBaseUrl(process.env)
}

export function travelOAuthRedirectUri() {
  return process.env.TRAVEL_OAUTH_REDIRECT_URI ?? `${travelPublicBaseUrl()}/shadow/oauth/callback`
}

export function travelOAuthConfig() {
  const clientId = process.env.TRAVEL_OAUTH_CLIENT_ID
  const clientSecret = process.env.TRAVEL_OAUTH_CLIENT_SECRET
  return clientId && clientSecret
    ? {
        configured: true as const,
        clientId,
        clientSecret,
        redirectUri: travelOAuthRedirectUri(),
        scope: process.env.TRAVEL_OAUTH_SCOPE ?? 'user:read servers:read',
      }
    : { configured: false as const }
}

export function travelOAuthRequired() {
  return process.env.TRAVEL_REQUIRE_OAUTH === 'true'
}

export function travelCookieSecret() {
  return (
    process.env.TRAVEL_OAUTH_COOKIE_SECRET ??
    process.env.SPACE_APP_SECRET ??
    process.env.TRAVEL_OAUTH_CLIENT_SECRET ??
    'travel-local-oauth-cookie-secret'
  )
}

export function encodeSignedJson(value: unknown, secret: string) {
  const body = base64Url(JSON.stringify(value))
  return `${body}.${sign(body, secret)}`
}

export function decodeSignedJson<T>(value: string | undefined, secret: string): T | null {
  if (!value) return null
  const [body, signature] = value.split('.')
  if (!body || !signature) return null
  const expected = sign(body, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function travelOAuthSessionMaxAgeSeconds(
  raw = process.env.TRAVEL_OAUTH_COOKIE_MAX_AGE_SECONDS,
) {
  if (!raw) return TRAVEL_OAUTH_SESSION_MAX_AGE_SECONDS
  const value = Number(raw)
  if (!Number.isFinite(value)) return TRAVEL_OAUTH_SESSION_MAX_AGE_SECONDS
  return Math.max(60, Math.floor(value))
}

export function travelLocalActorAllowed() {
  if (process.env.TRAVEL_ALLOW_LOCAL_ACTOR === 'true') return true
  if (process.env.TRAVEL_ALLOW_LOCAL_ACTOR === 'false') return false
  return process.env.NODE_ENV !== 'production'
}

export function compactTravelOAuthProfile(profile: TravelOAuthProfile): TravelOAuthProfile {
  return {
    id: String(profile.id),
    username: profile.username ? String(profile.username).slice(0, 120) : null,
    displayName: profile.displayName ? String(profile.displayName).slice(0, 160) : null,
    avatarUrl: normalizeShadowSpaceAppAvatarUrl(profile.avatarUrl, process.env),
  }
}

export function safeOAuthReturnTo(value: string | undefined) {
  if (!value) return '/shadow/server'
  try {
    const parsed = new URL(value, 'http://travel.local')
    if (parsed.origin !== 'http://travel.local') return '/shadow/server'
    if (!parsed.pathname.startsWith('/shadow/server')) return '/shadow/server'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/shadow/server'
  }
}

export function createOAuthState(returnTo: string, options: { popup?: boolean } = {}) {
  return encodeSignedJson(
    {
      nonce: randomBytes(16).toString('base64url'),
      returnTo,
      popup: options.popup === true,
      expiresAt: Date.now() + 10 * 60 * 1000,
    },
    travelCookieSecret(),
  )
}

export function travelOAuthAuthorizeUrl(returnTo: string, options: { popup?: boolean } = {}) {
  const config = travelOAuthConfig()
  if (!config.configured) return null
  const url = new URL('/app/oauth/authorize', travelShadowWebBaseUrl())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', createOAuthState(returnTo, options))
  return url.toString()
}

export function launchOAuthSubject(launch: ShadowSpaceAppLaunchIntrospection | null | undefined) {
  const actor = launch?.shadow?.actor
  return actor?.ownerId ?? actor?.userId ?? null
}

export function sessionMatchesLaunch(
  session: TravelOAuthSession | null | undefined,
  launch: ShadowSpaceAppLaunchIntrospection | null | undefined,
) {
  const subject = launchOAuthSubject(launch)
  return Boolean(session?.profile.id && subject && session.profile.id === subject)
}

export function travelOAuthAccessStatus(input: {
  configured: boolean
  required: boolean
  session: TravelOAuthSession | null
  launch: ShadowSpaceAppLaunchIntrospection | null
}): TravelOAuthAccessStatus {
  const subject = launchOAuthSubject(input.launch)
  const launchAuthenticated = Boolean(input.launch?.shadow)
  if (!launchAuthenticated) {
    const oauthAuthenticated = Boolean(input.configured && input.session?.serverId)
    if (!input.required) {
      return {
        configured: input.configured,
        required: false,
        authenticated: input.session ? Boolean(input.session.serverId) : true,
        launchAuthenticated: false,
        oauthAuthenticated,
        reason: input.session && !input.session.serverId ? 'space_required' : null,
        subject: input.session?.profile.id ?? null,
      }
    }
    if (!input.configured) {
      return {
        configured: false,
        required: true,
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        reason: 'oauth_not_configured',
        subject: null,
      }
    }
    if (!input.session) {
      return {
        configured: true,
        required: true,
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        reason: 'oauth_required',
        subject: null,
      }
    }
    if (!input.session.serverId) {
      return {
        configured: input.configured,
        required: input.required,
        authenticated: false,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        reason: 'space_required',
        subject: input.session.profile.id,
      }
    }
    return {
      configured: input.configured,
      required: input.required,
      authenticated: true,
      launchAuthenticated: false,
      oauthAuthenticated: true,
      reason: null,
      subject: input.session.profile.id,
    }
  }

  const oauthAuthenticated = Boolean(
    input.configured && input.session && sessionMatchesLaunch(input.session, input.launch),
  )
  if (!subject) {
    return {
      configured: input.configured,
      required: true,
      authenticated: false,
      launchAuthenticated,
      oauthAuthenticated: false,
      reason: 'launch_required',
      subject: null,
    }
  }
  return {
    configured: input.configured,
    required: input.required,
    authenticated: true,
    launchAuthenticated,
    oauthAuthenticated,
    reason: null,
    subject,
  }
}

export function launchFromCommandContext(
  context: ShadowSpaceAppCommandContext,
): ShadowSpaceAppLaunchIntrospection {
  return {
    active: true,
    shadow: {
      ...context,
      serverId: context.serverId,
      spaceAppId: context.spaceAppId,
      appKey: context.appKey,
      actor: context.actor,
    },
  }
}

export function launchSummary(launch: ShadowSpaceAppLaunchIntrospection | null) {
  if (!launch?.shadow) return null
  const actor = launch.shadow.actor
  return {
    active: true,
    serverId: launch.shadow.serverId,
    appKey: launch.shadow.appKey,
    actor: {
      kind: actor.kind,
      userId: actor.userId ?? null,
      buddyAgentId: actor.buddyAgentId ?? null,
      ownerId: actor.ownerId ?? null,
      displayName: actor.profile?.displayName ?? null,
      avatarUrl: actor.profile?.avatarUrl ?? null,
    },
  }
}
