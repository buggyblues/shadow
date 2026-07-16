import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppContainer } from '../container.js'
import { ok } from '../lib/json.js'
import { travelAppSessions } from '../security/app-session.js'
import {
  compactTravelOAuthProfile,
  decodeSignedJson,
  safeOAuthReturnTo,
  TRAVEL_OAUTH_SESSION_COOKIE,
  type TravelOAuthSession,
  travelCookieSecret,
  travelLocalActorAllowed,
  travelOAuthAuthorizeUrl,
  travelOAuthConfig,
  travelOAuthRequired,
  travelOAuthSessionMaxAgeSeconds,
  travelPublicBaseUrl,
  travelShadowApiBaseUrl,
} from '../security/oauth.js'
import type { TravelHonoEnv } from '../types.js'

interface OAuthSpace {
  id: string
  name: string
  slug?: string | null
  iconUrl?: string | null
}

function sessionCookieOptions(maxAge: number) {
  const secure = travelPublicBaseUrl().startsWith('https://')
  return {
    httpOnly: true,
    sameSite: secure ? ('None' as const) : ('Lax' as const),
    secure,
    path: '/',
    maxAge,
  }
}

async function oauthSpaces(accessToken: string | null | undefined): Promise<OAuthSpace[]> {
  if (!accessToken) return []
  const response = await fetch(`${travelShadowApiBaseUrl()}/api/oauth/servers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(4_000),
  }).catch(() => null)
  if (!response?.ok) return []
  const payload = await response.json().catch(() => [])
  return Array.isArray(payload) ? (payload as OAuthSpace[]) : []
}

export function createOAuthHandler(container: AppContainer) {
  const app = new Hono<TravelHonoEnv>()

  app.get('/api/oauth/session', async (c) => {
    const returnTo = safeOAuthReturnTo(c.req.query('return_to'))
    const popup = c.req.query('popup') === '1'
    const embedded = c.req.query('embedded') === '1'
    const config = travelOAuthConfig()
    const cookie = getCookie(c, TRAVEL_OAUTH_SESSION_COOKIE)
    const session = await container.identityService.readSession(cookie)
    if (!session) deleteCookie(c, TRAVEL_OAUTH_SESSION_COOKIE, { path: '/' })

    const requestContext = c.get('requestContext')
    const launchAuthenticated = requestContext.auth.launchAuthenticated
    const authenticated = launchAuthenticated || Boolean(session?.serverId)
    const oauthAuthenticated = authenticated && session?.authSource === 'oauth'
    const reason = authenticated
      ? null
      : session
        ? 'space_required'
        : embedded
          ? 'launch_required'
          : travelOAuthRequired()
            ? config.configured
              ? 'oauth_required'
              : 'oauth_not_configured'
            : null
    const canAuthorize =
      Boolean(config.configured) &&
      !embedded &&
      !oauthAuthenticated &&
      reason !== 'space_required' &&
      !launchAuthenticated
    const spaces = reason === 'space_required' ? await oauthSpaces(session?.oauthAccessToken) : []

    return c.json(
      ok({
        configured: config.configured,
        required: travelOAuthRequired(),
        authenticated: authenticated || (!embedded && travelLocalActorAllowed() && !session),
        launchAuthenticated,
        oauthAuthenticated,
        reason,
        subject: launchAuthenticated ? requestContext.actor.id : (session?.profile.id ?? null),
        profile: launchAuthenticated
          ? {
              id: requestContext.actor.id,
              username: requestContext.actor.username ?? null,
              displayName: requestContext.actor.displayName ?? null,
              avatarUrl: requestContext.actor.avatarUrl ?? null,
            }
          : (session?.profile ?? null),
        authSource: launchAuthenticated ? 'launch' : (session?.authSource ?? null),
        serverId: launchAuthenticated ? requestContext.serverId : (session?.serverId ?? null),
        spaces,
        authorizeUrl: canAuthorize ? travelOAuthAuthorizeUrl(returnTo, { popup }) : null,
        launch: launchAuthenticated
          ? {
              active: true,
              serverId: requestContext.serverId,
              appKey: requestContext.launch?.appKey,
            }
          : null,
      }),
    )
  })

  app.post('/api/shadow/session', async (c) => {
    const result = await travelAppSessions.exchange({
      authorizationHeader: c.req.header('authorization'),
      cookieHeader: c.req.header('cookie'),
      requestUrl: c.req.url,
    })
    if (result.ok) c.header('Set-Cookie', result.setCookie)
    return c.json(result.body, result.status)
  })

  app.get('/api/shadow/events', async (c) => {
    const response = await travelAppSessions.eventStream({
      cookieHeader: c.req.header('cookie'),
      lastEventId: c.req.header('last-event-id'),
    })
    return response ?? c.json({ ok: false, error: 'session_required' }, 401)
  })

  app.post('/api/oauth/space', async (c) => {
    const cookie = getCookie(c, TRAVEL_OAUTH_SESSION_COOKIE)
    const session = await container.identityService.readSession(cookie)
    if (!session?.oauthAccessToken) return c.json({ ok: false, error: 'oauth_required' }, 401)
    const body = (await c.req.json().catch(() => null)) as { serverId?: unknown } | null
    const serverId = typeof body?.serverId === 'string' ? body.serverId.trim() : ''
    const spaces = await oauthSpaces(session.oauthAccessToken)
    if (!spaces.some((space) => space.id === serverId)) {
      return c.json({ ok: false, error: 'space_not_available' }, 403)
    }
    const updated = await container.identityService.bindSessionToServer(cookie, serverId)
    if (!updated) return c.json({ ok: false, error: 'session_expired' }, 401)
    return c.json(ok({ authenticated: true, serverId }))
  })

  app.get('/shadow/oauth/start', (c) => {
    const authorizeUrl = travelOAuthAuthorizeUrl(safeOAuthReturnTo(c.req.query('return_to')), {
      popup: c.req.query('popup') === '1',
    })
    if (!authorizeUrl) return c.text('Travel OAuth is not configured.', 503)
    return c.redirect(authorizeUrl, 302)
  })

  app.get('/shadow/oauth/callback', async (c) => {
    const code = c.req.query('code')
    const error = c.req.query('error')
    const state = decodeSignedJson<{
      returnTo?: string
      expiresAt?: number
      popup?: boolean
    }>(c.req.query('state'), travelCookieSecret())

    if (error) {
      const returnTo =
        state?.returnTo && state.expiresAt && state.expiresAt > Date.now()
          ? safeOAuthReturnTo(state.returnTo)
          : '/shadow/server'
      const redirectUrl = new URL(returnTo, 'http://travel.local')
      redirectUrl.searchParams.set('oauth_error', error)
      return c.redirect(`${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`, 302)
    }
    if (!state?.returnTo || !state.expiresAt || state.expiresAt <= Date.now()) {
      return c.text('Invalid OAuth state.', 400)
    }
    if (!code) return c.text('Missing OAuth code.', 400)

    const config = travelOAuthConfig()
    if (!config.configured) return c.text('Travel OAuth is not configured.', 503)

    const tokenResponse = await fetch(`${travelShadowApiBaseUrl()}/api/oauth/token`, {
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

    const userInfoResponse = await fetch(`${travelShadowApiBaseUrl()}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
    if (!userInfoResponse.ok) return c.text('OAuth userinfo failed.', 401)

    const profile = compactTravelOAuthProfile(
      (await userInfoResponse.json()) as TravelOAuthSession['profile'],
    )
    const spaces = token.scope.split(/\s+/).includes('servers:read')
      ? await oauthSpaces(token.access_token)
      : []
    const configuredServerId = process.env.TRAVEL_STANDALONE_SERVER_ID?.trim()
    const serverId =
      (configuredServerId && spaces.some((space) => space.id === configuredServerId)
        ? configuredServerId
        : null) ?? (spaces.length === 1 ? spaces[0]?.id : null)
    const sessionMaxAgeSeconds = travelOAuthSessionMaxAgeSeconds()
    const issued = await container.identityService.issueSession(
      profile,
      token.scope,
      sessionMaxAgeSeconds,
      {
        authSource: 'oauth',
        serverId,
        oauthAccessToken: token.access_token,
        oauthAccessTokenExpiresAt: Date.now() + token.expires_in * 1_000,
      },
    )
    setCookie(
      c,
      TRAVEL_OAUTH_SESSION_COOKIE,
      issued.token,
      sessionCookieOptions(sessionMaxAgeSeconds),
    )

    return c.redirect(safeOAuthReturnTo(state.returnTo), 302)
  })

  app.post('/api/oauth/logout', async (c) => {
    await container.identityService.revokeSession(getCookie(c, TRAVEL_OAUTH_SESSION_COOKIE))
    deleteCookie(c, TRAVEL_OAUTH_SESSION_COOKIE, { path: '/' })
    return c.json(ok({ loggedOut: true }))
  })

  return app
}
