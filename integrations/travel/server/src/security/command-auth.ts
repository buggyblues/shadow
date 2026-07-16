import { extractShadowSpaceAppBearerToken, parseShadowSpaceAppCommandRequest } from '@shadowob/sdk'
import { unauthorized } from '../lib/errors.js'
import { nowIso } from '../lib/time.js'
import type { TravelContext } from '../types.js'
import { requestContextFromCommandContext } from './actor.js'
import { travelLocalActorAllowed, travelShadowApiBaseUrl } from './oauth.js'

export class CommandSecurity {
  async requestContextForCommand(c: TravelContext, commandName: string) {
    const bearerToken = extractShadowSpaceAppBearerToken(c.req.header('authorization'))
    const allowLocal = travelLocalActorAllowed()

    if (bearerToken) {
      const parsed = await parseShadowSpaceAppCommandRequest({
        authorizationHeader: c.req.header('authorization'),
        expectedCommand: commandName,
        requestInput: {},
        shadowBaseUrl: travelShadowApiBaseUrl(),
      })
      if (!parsed.ok) throw unauthorized(parsed.error)
      const ctx = requestContextFromCommandContext({
        context: parsed.envelope.context,
        session: null,
        requestId: c.get('requestContext').requestId,
        startedAt: nowIso(),
      })
      ctx.auth = {
        authenticated: true,
        launchAuthenticated: false,
        oauthAuthenticated: false,
        oauthConfigured: ctx.auth.oauthConfigured,
        oauthRequired: ctx.auth.oauthRequired,
        reason: null,
      }
      if (ctx.launch) {
        Object.defineProperty(ctx.launch, 'token', {
          value: bearerToken,
          enumerable: false,
          configurable: false,
          writable: false,
        })
      }
      return ctx
    }

    const ctx = c.get('requestContext')
    if (ctx.auth.oauthRequired && !ctx.auth.authenticated) {
      throw unauthorized(ctx.auth.reason ?? 'oauth_required')
    }
    if (ctx.local && !allowLocal) throw unauthorized('Missing Space App launch context')
    return ctx
  }
}
