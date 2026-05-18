import { createHash } from 'node:crypto'
import type { Context, Next } from 'hono'
import type { AppContainer } from '../container'
import type { Actor } from '../security/actor'

export interface OAuthTokenPayload {
  tokenId: string
  userId: string
  appId: string
  appClientId?: string
  scope: string
}

declare module 'hono' {
  interface ContextVariableMap {
    oauthToken: OAuthTokenPayload
    actor: Actor
  }
}

function parseScopes(scope: string | null | undefined): string[] {
  return (scope ?? '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Middleware that validates OAuth opaque access tokens (oat_xxx).
 * Sets `c.get('oauthToken')` with the resolved token payload.
 */
export function createOAuthAuthMiddleware(container: AppContainer) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ ok: false, error: 'Missing access token' }, 401)
    }
    const tokenValue = authHeader.slice(7)

    const oauthAppDao = container.resolve('oauthAppDao')
    const tokenHash = createHash('sha256').update(tokenValue).digest('hex')
    const token = await oauthAppDao.findAccessTokenByHash(tokenHash)

    if (!token) {
      return c.json({ ok: false, error: 'Invalid access token' }, 401)
    }
    if (new Date() > token.expiresAt) {
      return c.json({ ok: false, error: 'Access token expired' }, 401)
    }
    const app = await oauthAppDao.findById(token.appId)
    if (!app || !app.isActive) {
      return c.json({ ok: false, error: 'Invalid OAuth app' }, 401)
    }

    const payload = {
      tokenId: token.id,
      userId: token.userId,
      appId: token.appId,
      appClientId: app.clientId,
      scope: token.scope,
    }

    c.set('oauthToken', payload)
    c.set('actor', {
      kind: 'oauth',
      userId: payload.userId,
      appId: payload.appId,
      appClientId: payload.appClientId,
      tokenId: payload.tokenId,
      scopes: parseScopes(payload.scope),
    })

    await next()
  }
}

/**
 * Middleware factory that checks if the OAuth token has the required scopes.
 * Must be used after `oauthAuthMiddleware`.
 */
export function oauthScopeMiddleware(requiredScopes: string[]) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const token = c.get('oauthToken')
    if (!token) {
      return c.json({ ok: false, error: 'Missing OAuth context' }, 401)
    }

    const grantedScopes = parseScopes(token.scope)
    const hasAllScopes = requiredScopes.every((s) => grantedScopes.includes(s))
    if (!hasAllScopes) {
      return c.json(
        { ok: false, error: 'insufficient_scope', code: 'FORBIDDEN', required: requiredScopes },
        403,
      )
    }

    await next()
  }
}
