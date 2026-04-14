import { createHash } from 'node:crypto'
import type { Context, Next } from 'hono'
import type { AppContainer } from '../container'
import { type JwtPayload, verifyToken } from '../lib/jwt'

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  // If user was already resolved by a prior middleware (e.g. PAT), skip
  try {
    const existing = c.get('user')
    if (existing) {
      await next()
      return
    }
  } catch {
    // not set yet, continue
  }

  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ ok: false, error: 'Unauthorized: Missing or invalid token' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyToken(token)
    c.set('user', payload)
    await next()
  } catch {
    return c.json({ ok: false, error: 'Unauthorized: Invalid or expired token' }, 401)
  }
}

/**
 * Global middleware that resolves PAT (pat_xxx) tokens before authMiddleware runs.
 * Sets c.set('user') with a JwtPayload-compatible object so authMiddleware will skip.
 */
export function createPatMiddleware(container: AppContainer) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer pat_')) {
      await next()
      return
    }

    const tokenValue = authHeader.slice(7)
    const apiTokenDao = container.resolve('apiTokenDao')
    const tokenHash = createHash('sha256').update(tokenValue).digest('hex')
    const token = await apiTokenDao.findByHash(tokenHash)

    if (!token) {
      return c.json({ ok: false, error: 'Unauthorized: Invalid API token' }, 401)
    }

    if (token.expiresAt && new Date() > token.expiresAt) {
      return c.json({ ok: false, error: 'Unauthorized: API token expired' }, 401)
    }

    // Update last used timestamp (fire and forget)
    apiTokenDao.updateLastUsed(token.id).catch(() => {})

    // Set user context compatible with JwtPayload
    c.set('user', { userId: token.userId } as JwtPayload)

    await next()
  }
}
