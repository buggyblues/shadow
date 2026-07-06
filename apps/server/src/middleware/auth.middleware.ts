import { createHash } from 'node:crypto'
import type { Context, Next } from 'hono'
import type { AppContainer } from '../container'
import { type JwtPayload, verifyToken } from '../lib/jwt'
import { type Actor, actorFromAuthenticatedUser } from '../security/actor'

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthenticatedUser
    actor: Actor
  }
}

export type AuthenticatedUser = JwtPayload & {
  tokenKind?: 'jwt' | 'pat'
  tokenId?: string
  scopes?: string[]
  expiresAt?: string | null
  agentId?: string
  ownerId?: string
}

function parseScopes(scope: string | null | undefined): string[] {
  return (scope ?? '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isReadMethod(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function patAllowsMethod(user: AuthenticatedUser, method: string) {
  if (user.tokenKind !== 'pat') return true
  const scopes = user.scopes ?? []
  if (scopes.includes('*') || scopes.includes('admin:*')) return true
  if (isReadMethod(method)) {
    return scopes.some((scope) => scope === 'user:read' || scope.endsWith(':read'))
  }
  return scopes.some((scope) => {
    if (scope === 'user:read' || scope.endsWith(':read')) return false
    return scope.length > 0
  })
}

function enforcePatScope(c: Context, user: AuthenticatedUser): Response | null {
  if (patAllowsMethod(user, c.req.method)) return null
  return c.json(
    {
      ok: false,
      error: 'Forbidden: API token scope does not allow this operation',
      code: 'INSUFFICIENT_PAT_SCOPE',
    },
    403,
  )
}

function setAuthenticatedContext(c: Context, user: AuthenticatedUser) {
  c.set('user', user)
  c.set('actor', actorFromAuthenticatedUser(user))
}

async function resolveDaoCall<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return (await fn()) ?? null
  } catch {
    return null
  }
}

async function findAgentForToken(
  container: AppContainer,
  tokenValue: string,
  tokenHash: string,
  payload?: JwtPayload | null,
) {
  const agentDao = container.resolve('agentDao')
  const byId = payload?.agentId
    ? await resolveDaoCall(async () => {
        const agent = await agentDao.findById(payload.agentId!)
        return agent?.userId === payload.userId ? agent : null
      })
    : null
  return (
    byId ??
    (await resolveDaoCall(() => agentDao.findByTokenHash(tokenHash))) ??
    (payload?.typ === 'agent'
      ? await resolveDaoCall(() => agentDao.findByUserId(payload.userId))
      : null) ??
    (await resolveDaoCall(() => agentDao.findByLastToken(tokenValue)))
  )
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
  // If user was already resolved by a prior middleware (e.g. PAT), skip
  try {
    const existing = c.get('user')
    if (existing) {
      const denied = enforcePatScope(c, existing)
      if (denied) return denied
      c.set('actor', actorFromAuthenticatedUser(existing))
      await next()
      return
    }
  } catch {
    // not set yet, continue
  }

  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      {
        ok: false,
        error: 'Unauthorized: Missing or invalid token',
        code: 'AUTH_TOKEN_MISSING',
      },
      401,
    )
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyToken(token, ['access', 'agent'])
    setAuthenticatedContext(c, { ...payload, tokenKind: 'jwt' })
    await next()
  } catch {
    return c.json(
      {
        ok: false,
        error: 'Unauthorized: Invalid or expired token',
        code: 'ACCESS_TOKEN_INVALID',
      },
      401,
    )
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
      return c.json(
        { ok: false, error: 'Unauthorized: Invalid API token', code: 'PAT_TOKEN_INVALID' },
        401,
      )
    }

    if (token.expiresAt && new Date() > token.expiresAt) {
      return c.json(
        { ok: false, error: 'Unauthorized: API token expired', code: 'PAT_TOKEN_EXPIRED' },
        401,
      )
    }

    // Update last used timestamp (fire and forget)
    apiTokenDao.updateLastUsed(token.id).catch(() => {})

    setAuthenticatedContext(c, {
      userId: token.userId,
      tokenKind: 'pat',
      tokenId: token.id,
      scopes: parseScopes(token.scope),
      expiresAt: token.expiresAt?.toISOString?.() ?? null,
    })

    await next()
  }
}

/**
 * Compatibility fallback for previously deployed agents.
 *
 * Agent tokens are signed JWTs, but older deployments can keep running with a token signed by a
 * rotated JWT secret. New tokens are stored as hashes; legacy plaintext lastToken entries are only
 * accepted as a migration fallback when normal JWT verification would fail.
 */
export function createStoredAgentTokenMiddleware(container: AppContainer) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ') || authHeader.startsWith('Bearer pat_')) {
      await next()
      return
    }

    const tokenValue = authHeader.slice(7)
    const tokenHash = createHash('sha256').update(tokenValue).digest('hex')
    let verifiedPayload: JwtPayload | null = null
    try {
      verifiedPayload = verifyToken(tokenValue, ['access', 'agent'])
    } catch {
      // Fall through to the stored opaque token lookup.
    }

    if (verifiedPayload) {
      const user = await container
        .resolve('userDao')
        .findById(verifiedPayload.userId)
        .catch(() => null)
      if (verifiedPayload.typ === 'agent') {
        const agent = await findAgentForToken(container, tokenValue, tokenHash, verifiedPayload)
        if (agent) {
          setAuthenticatedContext(c, {
            ...verifiedPayload,
            userId: agent.userId,
            typ: 'agent',
            tokenKind: 'jwt',
            agentId: agent.id,
            ownerId: agent.ownerId,
            scopes: verifiedPayload.scopes ?? ['rental:usage:write'],
          })
          await next()
          return
        }
      }
      if (user) {
        if (verifiedPayload.typ === 'access' && verifiedPayload.sessionId) {
          const session = await container
            .resolve('userSessionDao')
            .findById(verifiedPayload.sessionId)
            .catch(() => null)
          if (!session || session.userId !== verifiedPayload.userId || session.revokedAt) {
            return c.json(
              {
                ok: false,
                error: 'Unauthorized: Session revoked',
                code: 'SESSION_REVOKED',
              },
              401,
            )
          }
        }
        await next()
        return
      }
    }

    const agent = await findAgentForToken(container, tokenValue, tokenHash, verifiedPayload)
    if (agent) {
      setAuthenticatedContext(c, {
        userId: agent.userId,
        typ: 'agent',
        tokenKind: 'jwt',
        agentId: agent.id,
        ownerId: agent.ownerId,
        scopes: ['rental:usage:write'],
      })
    }

    await next()
  }
}
