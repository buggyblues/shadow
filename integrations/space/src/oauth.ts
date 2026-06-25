import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  normalizeShadowServerAppAvatarUrl,
  type ShadowServerAppActorRef,
  shadowServerAppApiBaseUrl,
  shadowServerAppPublicBaseUrl,
} from '@shadowob/sdk'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

const SPACE_OAUTH_SESSION_COOKIE = 'space_oauth_session'

export interface SpaceOAuthProfile {
  id: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface SpaceOAuthSession {
  profile: SpaceOAuthProfile
  scope: string
  expiresAt: number
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function publicBaseUrl() {
  return trimTrailingSlash(process.env.SHADOWOB_APP_PUBLIC_BASE_URL ?? 'http://localhost:4217')
}

function shadowApiBaseUrl() {
  return shadowServerAppApiBaseUrl(process.env)
}

function shadowWebBaseUrl() {
  return shadowServerAppPublicBaseUrl(process.env)
}

function normalizeShadowAvatarUrl(value: unknown) {
  return normalizeShadowServerAppAvatarUrl(value, process.env)
}

function oauthRedirectUri() {
  return process.env.SPACE_OAUTH_REDIRECT_URI ?? `${publicBaseUrl()}/shadow/oauth/callback`
}

export function spaceOauthConfig() {
  const clientId = process.env.SPACE_OAUTH_CLIENT_ID
  const clientSecret = process.env.SPACE_OAUTH_CLIENT_SECRET
  return clientId && clientSecret
    ? {
        configured: true as const,
        clientId,
        clientSecret,
        redirectUri: oauthRedirectUri(),
        scope: process.env.SPACE_OAUTH_SCOPE ?? 'user:read',
      }
    : { configured: false as const }
}

function cookieSecret() {
  return (
    process.env.SPACE_OAUTH_COOKIE_SECRET ??
    process.env.SERVER_APP_SECRET ??
    process.env.SPACE_OAUTH_CLIENT_SECRET ??
    'space-local-oauth-cookie-secret'
  )
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function sign(value: string) {
  return createHmac('sha256', cookieSecret()).update(value).digest('base64url')
}

function encodeSignedJson(value: unknown) {
  const body = base64Url(JSON.stringify(value))
  return `${body}.${sign(body)}`
}

function decodeSignedJson<T>(value: string | undefined): T | null {
  if (!value) return null
  const [body, signature] = value.split('.')
  if (!body || !signature) return null
  const expected = sign(body)
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

function safeReturnTo(value: string | undefined) {
  if (!value) return '/shadow/server'
  try {
    const parsed = new URL(value, 'http://space.local')
    if (parsed.origin !== 'http://space.local') return '/shadow/server'
    if (!parsed.pathname.startsWith('/shadow/server')) return '/shadow/server'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/shadow/server'
  }
}

function createOauthState(returnTo: string, options: { popup?: boolean } = {}) {
  return encodeSignedJson({
    nonce: randomBytes(16).toString('base64url'),
    returnTo,
    popup: options.popup === true,
    expiresAt: Date.now() + 10 * 60 * 1000,
  })
}

function readOauthSession(cookie: string | undefined) {
  const session = decodeSignedJson<SpaceOAuthSession>(cookie)
  if (!session || session.expiresAt <= Date.now()) return null
  return session
}

function compactOauthProfile(profile: SpaceOAuthProfile): SpaceOAuthProfile {
  return {
    id: String(profile.id),
    username: profile.username ? String(profile.username).slice(0, 120) : null,
    displayName: profile.displayName ? String(profile.displayName).slice(0, 160) : null,
    avatarUrl: normalizeShadowAvatarUrl(profile.avatarUrl),
  }
}

function oauthAuthorizeUrl(returnTo: string, options: { popup?: boolean } = {}) {
  const config = spaceOauthConfig()
  if (!config.configured) return null
  const url = new URL('/app/oauth/authorize', shadowWebBaseUrl())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', createOauthState(returnTo, options))
  return url.toString()
}

function oauthPopupCompletePage(returnTo: string) {
  const fallback = JSON.stringify(returnTo)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Space OAuth Complete</title>
  </head>
  <body>
    <p>Authorization complete. You can close this window.</p>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'space.oauth.completed' }, '*');
        }
      } catch (_) {}
      window.close();
      setTimeout(function () {
        window.location.replace(${fallback});
      }, 800);
    </script>
  </body>
</html>`
}

export function readSpaceOAuthSession(c: Context) {
  const session = readOauthSession(getCookie(c, SPACE_OAUTH_SESSION_COOKIE))
  if (!session) deleteCookie(c, SPACE_OAUTH_SESSION_COOKIE, { path: '/' })
  return session
}

export function spaceActorFromOAuthSession(session: SpaceOAuthSession): ShadowServerAppActorRef {
  const displayName =
    session.profile.displayName?.trim() ||
    session.profile.username?.trim() ||
    `user:${session.profile.id.slice(0, 8)}`
  return {
    kind: 'user',
    id: session.profile.id,
    userId: session.profile.id,
    buddyAgentId: null,
    ownerId: session.profile.id,
    displayName,
    avatarUrl: session.profile.avatarUrl ?? null,
  }
}

export function oauthSessionPayload(c: Context) {
  const returnTo = safeReturnTo(c.req.query('return_to'))
  const popup = c.req.query('popup') === '1'
  const session = readSpaceOAuthSession(c)
  return {
    configured: spaceOauthConfig().configured,
    authenticated: Boolean(session),
    profile: session?.profile ?? null,
    authorizeUrl: session ? null : oauthAuthorizeUrl(returnTo, { popup }),
  }
}

export function startSpaceOAuth(c: Context) {
  const returnTo = safeReturnTo(c.req.query('return_to'))
  const authorizeUrl = oauthAuthorizeUrl(returnTo, { popup: c.req.query('popup') === '1' })
  if (!authorizeUrl) return c.text('Space OAuth is not configured.', 503)
  return c.redirect(authorizeUrl, 302)
}

export async function completeSpaceOAuth(c: Context) {
  const code = c.req.query('code')
  const error = c.req.query('error')
  const state = decodeSignedJson<{ returnTo?: string; expiresAt?: number; popup?: boolean }>(
    c.req.query('state'),
  )
  if (error) return c.text(`Authorization denied: ${error}`, 401)
  if (!state?.returnTo || !state.expiresAt || state.expiresAt <= Date.now()) {
    return c.text('Invalid OAuth state.', 400)
  }
  if (!code) return c.text('Missing OAuth code.', 400)
  const config = spaceOauthConfig()
  if (!config.configured) return c.text('Space OAuth is not configured.', 503)

  const tokenResponse = await fetch(`${shadowApiBaseUrl()}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  })
  if (!tokenResponse.ok) return c.text('OAuth token exchange failed.', 401)
  const token = (await tokenResponse.json()) as {
    access_token: string
    expires_in: number
    scope: string
  }

  const userInfoResponse = await fetch(`${shadowApiBaseUrl()}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userInfoResponse.ok) return c.text('OAuth userinfo failed.', 401)
  const profile = compactOauthProfile((await userInfoResponse.json()) as SpaceOAuthProfile)
  const expiresAt = Date.now() + Math.max(60, token.expires_in) * 1000
  const session: SpaceOAuthSession = {
    profile,
    scope: token.scope,
    expiresAt,
  }
  setCookie(c, SPACE_OAUTH_SESSION_COOKIE, encodeSignedJson(session), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.max(60, token.expires_in),
  })
  if (state.popup === true) return c.html(oauthPopupCompletePage(safeReturnTo(state.returnTo)))
  return c.redirect(safeReturnTo(state.returnTo), 302)
}
