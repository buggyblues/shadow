import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import {
  createOAuthAuthMiddleware,
  oauthScopeMiddleware,
} from '../src/middleware/oauth-auth.middleware'

/* ─── Helpers ─────────────────────────────────────────── */

function createMockContainer(tokenResult: unknown) {
  return {
    resolve: vi.fn().mockReturnValue({
      findAccessTokenByHash: vi.fn().mockResolvedValue(tokenResult),
    }),
  } as any
}

function buildApp(container: any, requiredScopes?: string[]) {
  const app = new Hono()
  const authMiddleware = createOAuthAuthMiddleware(container)

  if (requiredScopes) {
    app.get('/test', authMiddleware, oauthScopeMiddleware(requiredScopes), (c) =>
      c.json({ ok: true, token: c.get('oauthToken') }),
    )
  } else {
    app.get('/test', authMiddleware, (c) => c.json({ ok: true, token: c.get('oauthToken') }))
  }

  return app
}

async function doRequest(app: Hono, token?: string) {
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await app.request('/test', { headers })
  const json = await res.json()
  return { status: res.status, json }
}

/* ═══════════════════════════════════════════════════════
   createOAuthAuthMiddleware
   ═══════════════════════════════════════════════════════ */

describe('createOAuthAuthMiddleware', () => {
  it('rejects request without Authorization header', async () => {
    const app = buildApp(createMockContainer(null))
    const { status, json } = await doRequest(app)
    expect(status).toBe(401)
    expect(json.error).toBe('Missing access token')
  })

  it('rejects non-Bearer Authorization header', async () => {
    const container = createMockContainer(null)
    const app = new Hono()
    app.get('/test', createOAuthAuthMiddleware(container), (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })
    expect(res.status).toBe(401)
  })

  it('rejects invalid token', async () => {
    const app = buildApp(createMockContainer(null))
    const { status, json } = await doRequest(app, 'oat_invalid')
    expect(status).toBe(401)
    expect(json.error).toBe('Invalid access token')
  })

  it('rejects expired token', async () => {
    const app = buildApp(
      createMockContainer({
        id: 't1',
        userId: 'u1',
        appId: 'app-1',
        scope: 'user:read',
        expiresAt: new Date(Date.now() - 60_000), // expired
      }),
    )
    const { status, json } = await doRequest(app, 'oat_expired')
    expect(status).toBe(401)
    expect(json.error).toBe('Access token expired')
  })

  it('sets oauthToken context on valid token', async () => {
    const app = buildApp(
      createMockContainer({
        id: 't1',
        userId: 'u1',
        appId: 'app-1',
        scope: 'user:read servers:read',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    )
    const { status, json } = await doRequest(app, 'oat_valid')
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.token).toEqual({
      tokenId: 't1',
      userId: 'u1',
      appId: 'app-1',
      scope: 'user:read servers:read',
    })
  })

  it('hashes the token before looking it up', async () => {
    const findFn = vi.fn().mockResolvedValue({
      id: 't1',
      userId: 'u1',
      appId: 'app-1',
      scope: 'user:read',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const container = {
      resolve: vi.fn().mockReturnValue({ findAccessTokenByHash: findFn }),
    } as any
    const app = buildApp(container)

    await doRequest(app, 'oat_test_token')
    const expectedHash = createHash('sha256').update('oat_test_token').digest('hex')
    expect(findFn).toHaveBeenCalledWith(expectedHash)
  })
})

/* ═══════════════════════════════════════════════════════
   oauthScopeMiddleware
   ═══════════════════════════════════════════════════════ */

describe('oauthScopeMiddleware', () => {
  it('passes when token has required scopes', async () => {
    const app = buildApp(
      createMockContainer({
        id: 't1',
        userId: 'u1',
        appId: 'app-1',
        scope: 'user:read servers:read',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      ['servers:read'],
    )
    const { status, json } = await doRequest(app, 'oat_valid')
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it('rejects when token lacks required scopes', async () => {
    const app = buildApp(
      createMockContainer({
        id: 't1',
        userId: 'u1',
        appId: 'app-1',
        scope: 'user:read',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      ['servers:read'],
    )
    const { status, json } = await doRequest(app, 'oat_valid')
    expect(status).toBe(403)
    expect(json.error).toBe('insufficient_scope')
    expect(json.required).toEqual(['servers:read'])
  })

  it('requires ALL specified scopes', async () => {
    const app = buildApp(
      createMockContainer({
        id: 't1',
        userId: 'u1',
        appId: 'app-1',
        scope: 'user:read servers:read',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      ['servers:read', 'servers:write'],
    )
    const { status, json } = await doRequest(app, 'oat_valid')
    expect(status).toBe(403)
    expect(json.error).toBe('insufficient_scope')
  })

  it('returns 401 if oauthToken is missing from context', async () => {
    const app = new Hono()
    // Apply scope middleware WITHOUT auth middleware first
    app.get('/test', oauthScopeMiddleware(['user:read']), (c) => c.json({ ok: true }))

    const res = await app.request('/test')
    const json = await res.json()
    expect(res.status).toBe(401)
    expect(json.error).toBe('Missing OAuth context')
  })
})
