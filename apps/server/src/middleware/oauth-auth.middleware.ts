import { createHash } from 'node:crypto'
import type { Context, Next } from 'hono'
import type { AppContainer } from '../container'

export interface OAuthTokenPayload {
  tokenId: string
  userId: string
  appId: string
  scope: string
}

declare module 'hono' {
  interface ContextVariableMap {
    oauthToken: OAuthTokenPayload
  }
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

    c.set('oauthToken', {
      tokenId: token.id,
      userId: token.userId,
      appId: token.appId,
      scope: token.scope,
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

    const grantedScopes = token.scope.split(' ')
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
