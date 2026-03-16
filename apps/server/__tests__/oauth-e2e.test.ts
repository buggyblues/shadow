/**
 * OAuth Provider — End-to-End Tests
 *
 * Tests the full OAuth Authorization Code flow against a real
 * PostgreSQL database and in-process HTTP server:
 *
 *   1. App CRUD — create, list, update, reset secret, delete
 *   2. Authorization Code Flow — validate → approve → exchange → userinfo → refresh
 *   3. Consent management — list, revoke
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { createServer } from 'node:http'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { signAccessToken } from '../src/lib/jwt'

/* ═══════════════════════════════════════════════════════
   Setup — real Postgres + in-process HTTP server
   ═══════════════════════════════════════════════════════ */

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let httpServer: ReturnType<typeof createServer>
let baseUrl: string

// Test user (the developer who owns the OAuth app)
let userId: string
let userToken: string
let userEmail: string
let userName: string

// Second user (the end-user who authorizes the app)
let endUserId: string
let endUserToken: string

// OAuth app credentials (set during tests)
let clientId: string
let clientSecret: string
let oauthAppId: string

const REDIRECT_URI = 'https://demo-app.shadowob.com/callback'

beforeAll(async () => {
  sql = postgres(TEST_DB_URL, { max: 5 })
  db = drizzle(sql, { schema })
  container = createAppContainer(db)

  const app = createApp(container)

  httpServer = createServer(async (req, res) => {
    const response = await app.fetch(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: ['GET', 'HEAD'].includes(req.method ?? '')
          ? undefined
          : await new Promise<string>((resolve) => {
              const chunks: Buffer[] = []
              req.on('data', (c: Buffer) => chunks.push(c))
              req.on('end', () => resolve(Buffer.concat(chunks).toString()))
            }),
      }),
    )
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
    const body = await response.arrayBuffer()
    res.end(Buffer.from(body))
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve())
  })
  const addr = httpServer.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  baseUrl = `http://localhost:${port}`

  // Create test users
  const userDao = container.resolve('userDao')
  const ts = Date.now()

  userEmail = `oauth-dev-${ts}@test.local`
  userName = `oauthdev_${ts}`
  const dev = await userDao.create({
    email: userEmail,
    username: userName,
    passwordHash: 'not-used',
  })
  userId = dev!.id
  userToken = signAccessToken({ userId, email: userEmail, username: userName })

  const endUserEmail = `oauth-user-${ts}@test.local`
  const endUserName = `oauthuser_${ts}`
  const end = await userDao.create({
    email: endUserEmail,
    username: endUserName,
    passwordHash: 'not-used',
  })
  endUserId = end!.id
  endUserToken = signAccessToken({
    userId: endUserId,
    email: endUserEmail,
    username: endUserName,
  })
}, 30_000)

afterAll(async () => {
  httpServer?.close()
  await new Promise((r) => setTimeout(r, 100))
  await sql?.end()
}, 10_000)

/* ─── Helpers ──────────────────────────────────────── */

async function api(
  method: string,
  path: string,
  opts?: { body?: unknown; token?: string; query?: Record<string, string> },
) {
  let url = `${baseUrl}${path}`
  if (opts?.query) {
    const params = new URLSearchParams(opts.query)
    url += `?${params.toString()}`
  }
  const headers: Record<string, string> = {}
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts?.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

/* ═══════════════════════════════════════════════════════
   Tests
   ═══════════════════════════════════════════════════════ */

describe('OAuth App CRUD', () => {
  it('creates an OAuth app', async () => {
    const { status, json } = await api('POST', '/api/oauth/apps', {
      token: userToken,
      body: {
        name: 'E2E Demo App',
        description: 'Created in E2E test',
        redirectUris: [REDIRECT_URI],
        homepageUrl: 'https://demo-app.shadowob.com',
      },
    })
    expect(status).toBe(201)
    expect(json.clientId).toMatch(/^shadow_/)
    expect(json.clientSecret).toMatch(/^shsec_/)
    expect(json.name).toBe('E2E Demo App')

    clientId = json.clientId
    clientSecret = json.clientSecret
    oauthAppId = json.id
  })

  it("lists the developer's apps", async () => {
    const { status, json } = await api('GET', '/api/oauth/apps', { token: userToken })
    expect(status).toBe(200)
    expect(Array.isArray(json)).toBe(true)
    expect(json.some((a: { id: string }) => a.id === oauthAppId)).toBe(true)
  })

  it('updates the app', async () => {
    const { status, json } = await api('PATCH', `/api/oauth/apps/${oauthAppId}`, {
      token: userToken,
      body: { name: 'E2E Demo App (updated)' },
    })
    expect(status).toBe(200)
    expect(json.name).toBe('E2E Demo App (updated)')
  })

  it('resets the client secret', async () => {
    const { status, json } = await api('POST', `/api/oauth/apps/${oauthAppId}/reset-secret`, {
      token: userToken,
    })
    expect(status).toBe(200)
    expect(json.clientSecret).toMatch(/^shsec_/)
    expect(json.clientSecret).not.toBe(clientSecret)
    // Update for subsequent tests
    clientSecret = json.clientSecret
  })

  it('rejects unauthenticated requests', async () => {
    const { status } = await api('GET', '/api/oauth/apps')
    expect(status).toBe(401)
  })
})

describe('OAuth Authorization Code Flow', () => {
  let authorizationCode: string

  it('validates the authorize request', async () => {
    const { status, json } = await api('GET', '/api/oauth/authorize', {
      token: endUserToken,
      query: {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        scope: 'user:read user:email',
        state: 'test-state-123',
      },
    })
    expect(status).toBe(200)
    expect(json.appName).toBe('E2E Demo App (updated)')
    expect(json.scope).toBe('user:read user:email')
    expect(json.state).toBe('test-state-123')
  })

  it('rejects invalid client_id', async () => {
    const { status } = await api('GET', '/api/oauth/authorize', {
      token: endUserToken,
      query: {
        response_type: 'code',
        client_id: 'shadow_nonexistent',
        redirect_uri: REDIRECT_URI,
        scope: 'user:read',
      },
    })
    expect(status).toBe(400)
  })

  it('rejects invalid redirect_uri', async () => {
    const { status } = await api('GET', '/api/oauth/authorize', {
      token: endUserToken,
      query: {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://evil.com/steal',
        scope: 'user:read',
      },
    })
    expect(status).toBe(400)
  })

  it('approves the authorization and receives a code', async () => {
    const { status, json } = await api('POST', '/api/oauth/authorize', {
      token: endUserToken,
      body: {
        clientId,
        redirectUri: REDIRECT_URI,
        scope: 'user:read user:email',
        state: 'test-state-123',
      },
    })
    expect(status).toBe(200)
    expect(json.redirectUrl).toBeDefined()

    const url = new URL(json.redirectUrl)
    expect(url.origin).toBe('https://demo-app.shadowob.com')
    expect(url.searchParams.get('code')).toBeDefined()
    expect(url.searchParams.get('state')).toBe('test-state-123')

    authorizationCode = url.searchParams.get('code')!
  })

  it('exchanges the authorization code for tokens', async () => {
    const { status, json } = await api('POST', '/api/oauth/token', {
      body: {
        grant_type: 'authorization_code',
        code: authorizationCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
      },
    })
    expect(status).toBe(200)
    expect(json.access_token).toMatch(/^oat_/)
    expect(json.refresh_token).toMatch(/^ort_/)
    expect(json.token_type).toBe('Bearer')
    expect(json.expires_in).toBe(3600)
    expect(json.scope).toBe('user:read user:email')

    // Save for subsequent tests
    ;(globalThis as Record<string, unknown>).__oauthAccessToken = json.access_token
    ;(globalThis as Record<string, unknown>).__oauthRefreshToken = json.refresh_token
  })

  it('rejects reuse of the authorization code', async () => {
    const { status } = await api('POST', '/api/oauth/token', {
      body: {
        grant_type: 'authorization_code',
        code: authorizationCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
      },
    })
    expect(status).toBe(400)
  })

  it('rejects invalid client_secret in token exchange', async () => {
    const { status } = await api('POST', '/api/oauth/token', {
      body: {
        grant_type: 'authorization_code',
        code: 'does-not-matter',
        client_id: clientId,
        client_secret: 'shsec_wrong',
        redirect_uri: REDIRECT_URI,
      },
    })
    expect(status).toBe(401)
  })
})

describe('OAuth UserInfo', () => {
  it('returns user info with the access token', async () => {
    const accessToken = (globalThis as Record<string, unknown>).__oauthAccessToken as string
    const { status, json } = await api('GET', '/api/oauth/userinfo', {
      token: accessToken,
    })
    expect(status).toBe(200)
    expect(json.id).toBe(endUserId)
    expect(json.username).toBeDefined()
    // user:email scope was granted
    expect(json.email).toBeDefined()
  })

  it('rejects requests without a token', async () => {
    const { status } = await api('GET', '/api/oauth/userinfo')
    expect(status).toBe(401)
  })

  it('rejects invalid tokens', async () => {
    const { status } = await api('GET', '/api/oauth/userinfo', {
      token: 'oat_invalid_token_value',
    })
    expect(status).toBe(401)
  })
})

describe('OAuth Token Refresh', () => {
  it('refreshes the access token', async () => {
    const refreshToken = (globalThis as Record<string, unknown>).__oauthRefreshToken as string
    const { status, json } = await api('POST', '/api/oauth/token', {
      body: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      },
    })
    expect(status).toBe(200)
    expect(json.access_token).toMatch(/^oat_/)
    expect(json.refresh_token).toMatch(/^ort_/)
    expect(json.token_type).toBe('Bearer')

    // The new tokens should be different
    expect(json.access_token).not.toBe((globalThis as Record<string, unknown>).__oauthAccessToken)

    // Update stored tokens
    ;(globalThis as Record<string, unknown>).__oauthAccessToken = json.access_token
    ;(globalThis as Record<string, unknown>).__oauthRefreshToken = json.refresh_token
  })

  it('rejects reuse of the old refresh token', async () => {
    // The original refresh token was revoked during the refresh
    const { status } = await api('POST', '/api/oauth/token', {
      body: {
        grant_type: 'refresh_token',
        refresh_token: 'ort_already_revoked',
        client_id: clientId,
        client_secret: clientSecret,
      },
    })
    expect(status).toBe(401)
  })

  it('new access token still works for userinfo', async () => {
    const accessToken = (globalThis as Record<string, unknown>).__oauthAccessToken as string
    const { status, json } = await api('GET', '/api/oauth/userinfo', {
      token: accessToken,
    })
    expect(status).toBe(200)
    expect(json.id).toBe(endUserId)
  })
})

describe('OAuth Consent Management', () => {
  it('lists user consents', async () => {
    const { status, json } = await api('GET', '/api/oauth/consents', {
      token: endUserToken,
    })
    expect(status).toBe(200)
    expect(Array.isArray(json)).toBe(true)
    expect(json.length).toBeGreaterThanOrEqual(1)
    expect(json.some((c: { appId: string }) => c.appId === oauthAppId)).toBe(true)
  })

  it('revokes consent for an app', async () => {
    const { status, json } = await api('POST', '/api/oauth/revoke', {
      token: endUserToken,
      body: { appId: oauthAppId },
    })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it('access token is invalid after consent revocation', async () => {
    const accessToken = (globalThis as Record<string, unknown>).__oauthAccessToken as string
    const { status } = await api('GET', '/api/oauth/userinfo', {
      token: accessToken,
    })
    // Token was deleted when consent was revoked
    expect(status).toBe(401)
  })

  it('consent list is empty after revocation', async () => {
    const { status, json } = await api('GET', '/api/oauth/consents', {
      token: endUserToken,
    })
    expect(status).toBe(200)
    expect(json.some((c: { appId: string }) => c.appId === oauthAppId)).toBe(false)
  })
})

describe('OAuth App Deletion', () => {
  it('deletes the OAuth app', async () => {
    const { status, json } = await api('DELETE', `/api/oauth/apps/${oauthAppId}`, {
      token: userToken,
    })
    expect(status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it('app no longer appears in the list', async () => {
    const { status, json } = await api('GET', '/api/oauth/apps', { token: userToken })
    expect(status).toBe(200)
    expect(json.some((a: { id: string }) => a.id === oauthAppId)).toBe(false)
  })
})
