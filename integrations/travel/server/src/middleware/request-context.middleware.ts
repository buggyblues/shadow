import type { MiddlewareHandler } from 'hono'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import {
  requestContextFromHeaders,
  requestContextFromLaunchIntrospection,
  requestContextFromOAuthSession,
} from '../security/actor.js'
import { travelAppSessions } from '../security/app-session.js'
import { TRAVEL_OAUTH_SESSION_COOKIE } from '../security/oauth.js'
import type { IdentityService } from '../services/identity.service.js'
import type { RequestContext, TravelHonoEnv } from '../types.js'

function cookieValue(headers: Headers, name: string) {
  const cookies = headers.get('cookie')
  if (!cookies) return undefined
  for (const cookie of cookies.split(';')) {
    const [key, ...rawValue] = cookie.trim().split('=')
    if (key === name) return rawValue.join('=')
  }
  return undefined
}

export async function createTravelRequestContextFromHeaders(input: {
  headers: Headers
  identityService?: IdentityService
  method?: string
  requestId?: string
  startedAt?: string
}): Promise<RequestContext> {
  const requestId = input.requestId ?? input.headers.get('x-request-id') ?? createId('req')
  const startedAt = input.startedAt ?? nowIso()
  const cookie = cookieValue(input.headers, TRAVEL_OAUTH_SESSION_COOKIE)
  const session = input.identityService ? await input.identityService.readSession(cookie) : null
  const method = input.method?.toUpperCase() ?? 'GET'
  const appSession = await travelAppSessions.authorizedSession({
    cookieHeader: input.headers.get('cookie'),
    csrfToken: input.headers.get('x-space-app-csrf'),
    requireCsrf: method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS',
  })
  const launchContext = appSession
    ? requestContextFromLaunchIntrospection({
        launch: appSession.launch,
        launchToken: appSession.launchToken,
        session,
        requestId,
        startedAt,
      })
    : null
  const resolved =
    launchContext ??
    (session
      ? requestContextFromOAuthSession({ session, requestId, startedAt })
      : requestContextFromHeaders({
          headers: input.headers,
          requestId,
          startedAt,
        }))
  return resolved
}

export function requestContextMiddleware(
  identityService?: IdentityService,
): MiddlewareHandler<TravelHonoEnv> {
  return async (c, next) => {
    const startedAt = performance.now()
    const context = await createTravelRequestContextFromHeaders({
      headers: c.req.raw.headers,
      identityService,
      method: c.req.method,
    })
    if (
      c.req.path !== '/api/shadow/session' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
      travelAppSessions.hasSessionCookie(c.req.header('cookie')) &&
      !context.auth.launchAuthenticated
    ) {
      return c.json({ ok: false, error: 'invalid_app_session' }, 401)
    }
    const authDuration = performance.now() - startedAt
    c.set('requestContext', context)
    await next()
    const totalDuration = performance.now() - startedAt
    c.header('x-request-id', context.requestId)
    c.header(
      'server-timing',
      `auth;dur=${authDuration.toFixed(1)}, handler;dur=${Math.max(
        0,
        totalDuration - authDuration,
      ).toFixed(1)}, total;dur=${totalDuration.toFixed(1)}`,
    )
  }
}
