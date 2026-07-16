import type { MiddlewareHandler } from 'hono'
import { unauthorized } from '../lib/errors.js'
import { travelLocalActorAllowed } from '../security/oauth.js'
import type { RequestContext, TravelHonoEnv } from '../types.js'

export function assertTravelRequestAuthenticated(ctx: RequestContext) {
  const allowLocal = travelLocalActorAllowed()
  if (ctx.local && !allowLocal) throw unauthorized()
  if (ctx.launch && ctx.auth.launchAuthenticated) return
  if (ctx.launch) throw unauthorized(ctx.auth.reason ?? 'launch_required')
  if (ctx.auth.oauthRequired && !ctx.auth.authenticated) {
    throw unauthorized(ctx.auth.reason ?? 'oauth_required')
  }
}

export const authMiddleware: MiddlewareHandler<TravelHonoEnv> = async (c, next) => {
  assertTravelRequestAuthenticated(c.get('requestContext'))
  await next()
}
