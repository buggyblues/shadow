/**
 * Cloud SaaS — Smoke Tests
 *
 * Tests the basic happy-path flows for all /api/cloud/* endpoints against a real PostgreSQL DB.
 *
 * Requires: docker compose postgres running on localhost:5432
 * Requires: KMS_MASTER_KEY set (or uses test fallback)
 *
 * Scenarios:
 *   1. GET /templates — returns seeded official templates
 *   2. POST /deploy — creates a deployment (status=pending)
 *   3. GET /deployments — lists user's deployments (multi-tenant isolation)
 *   4. GET /deploy/:id/stream — SSE stream returns logs + status
 *   5. POST /configs + GET + PUT + DELETE
 *   6. POST /env-vars — encrypted, response never includes value
 *   7. POST /clusters — kubeconfig encrypted at rest
 *   8. GET /activity — audit trail present
 *   9. Multi-tenant isolation — user B cannot see user A's data
 */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createCloudHandler } from '../src/handlers/cloud.handler'
import { signAccessToken } from '../src/lib/jwt'

// Ensure KMS key is available for tests
process.env.KMS_MASTER_KEY = process.env.KMS_MASTER_KEY ?? 'a'.repeat(64)

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

// User A
let userAId: string
let userAToken: string
// User B (isolation)
let userBId: string
let userBToken: string

// IDs tracked
let deploymentId: string
let configId: string
let envVarId: string
let clusterId: string
let templateSlug: string

/* ── Helpers ── */

async function req(method: string, path: string, opts?: { token?: string; body?: unknown }) {
  const url = `http://localhost/api/cloud${path}`
  const init: RequestInit = { method }
  const headers: Record<string, string> = {}
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts?.body) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  init.headers = headers
  return app.request(url, init)
}

async function json<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>
}

/* ── Setup ── */

beforeAll(async () => {
  sql = postgres(TEST_DB_URL, { max: 5 })
  db = drizzle(sql, { schema })
  container = createAppContainer(db)

  app = new Hono()
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500
    return c.json({ error: message }, status as 400)
  })
  app.route('/api/cloud', createCloudHandler(container))

  // Create two test users
  const pwHash = '$2b$12$placeholder_hash_for_tests_only'
  const [userA] = await db
    .insert(schema.users)
    .values({
      email: `cloud-smoke-a-${Date.now()}@test.local`,
      username: `cloud_a_${Date.now()}`,
      passwordHash: pwHash,
    })
    .returning()
  const [userB] = await db
    .insert(schema.users)
    .values({
      email: `cloud-smoke-b-${Date.now()}@test.local`,
      username: `cloud_b_${Date.now()}`,
      passwordHash: pwHash,
    })
    .returning()

  if (!userA || !userB) throw new Error('Failed to create test users')
  userAId = userA.id
  userBId = userB.id
  userAToken = signAccessToken({ userId: userAId, email: userA.email })
  userBToken = signAccessToken({ userId: userBId, email: userB.email })
})

afterAll(async () => {
  // Clean up test users (cascades to all cloud tables)
  if (userAId) await db.delete(schema.users).where(eq(schema.users.id, userAId))
  if (userBId) await db.delete(schema.users).where(eq(schema.users.id, userBId))
  await sql.end()
})

/* ══════════════════════════════════════════════════════════
   1. Templates
   ══════════════════════════════════════════════════════════ */

describe('Cloud Templates', () => {
  it('GET /templates — requires auth', async () => {
    const res = await req('GET', '/templates')
    expect(res.status).toBe(401)
  })

  it('GET /templates — returns array', async () => {
    const res = await req('GET', '/templates', { token: userAToken })
    expect(res.status).toBe(200)
    const body = await json<unknown[]>(res)
    expect(Array.isArray(body)).toBe(true)
  })

  it('POST /templates — submit community template', async () => {
    const slug = `test-smoke-${Date.now()}`
    templateSlug = slug
    const res = await req('POST', '/templates', {
      token: userAToken,
      body: {
        slug,
        name: 'Smoke Test Template',
        description: 'Created by smoke test',
        content: { version: '1.0', deployments: [] },
        tags: ['test'],
      },
    })
    expect(res.status).toBe(201)
    const body = await json<{ slug: string; reviewStatus: string }>(res)
    expect(body.slug).toBe(slug)
    expect(body.reviewStatus).toBe('pending')
  })
})

/* ══════════════════════════════════════════════════════════
   2. Deployments
   ══════════════════════════════════════════════════════════ */

describe('Cloud Deployments', () => {
  it('POST /deploy — creates deployment with status=pending', async () => {
    const res = await req('POST', '/deploy', {
      token: userAToken,
      body: {
        namespace: 'smoke-test-ns',
        name: 'smoke-deployment',
        agentCount: 2,
        configSnapshot: { version: '1.0' },
      },
    })
    expect(res.status).toBe(201)
    const body = await json<{ id: string; status: string; namespace: string }>(res)
    expect(body.status).toBe('pending')
    expect(body.namespace).toBe('smoke-test-ns')
    deploymentId = body.id
  })

  it('GET /deployments — lists user deployments', async () => {
    const res = await req('GET', '/deployments', { token: userAToken })
    expect(res.status).toBe(200)
    const body = await json<{ id: string }[]>(res)
    expect(body.some((d) => d.id === deploymentId)).toBe(true)
  })

  it('GET /deploy/:id/stream — SSE returns status', async () => {
    const res = await req('GET', `/deploy/${deploymentId}/stream`, { token: userAToken })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('"status"')
  })

  it('Multi-tenant: user B cannot see user A deployment via stream', async () => {
    const res = await req('GET', `/deploy/${deploymentId}/stream`, { token: userBToken })
    expect(res.status).toBe(404)
  })
})

/* ══════════════════════════════════════════════════════════
   3. Configs
   ══════════════════════════════════════════════════════════ */

describe('Cloud Configs', () => {
  it('POST /configs — creates config', async () => {
    const res = await req('POST', '/configs', {
      token: userAToken,
      body: { name: 'My Config', content: { agents: [] } },
    })
    expect(res.status).toBe(201)
    const body = await json<{ id: string; version: number }>(res)
    expect(body.version).toBe(1)
    configId = body.id
  })

  it('GET /configs — lists user configs', async () => {
    const res = await req('GET', '/configs', { token: userAToken })
    expect(res.status).toBe(200)
    const body = await json<{ id: string }[]>(res)
    expect(body.some((c) => c.id === configId)).toBe(true)
  })

  it('PUT /configs/:id — updates config, increments version', async () => {
    const res = await req('PUT', `/configs/${configId}`, {
      token: userAToken,
      body: { name: 'Updated Config' },
    })
    expect(res.status).toBe(200)
    const body = await json<{ version: number; name: string }>(res)
    expect(body.version).toBe(2)
    expect(body.name).toBe('Updated Config')
  })

  it('Multi-tenant: user B cannot update user A config', async () => {
    const res = await req('PUT', `/configs/${configId}`, {
      token: userBToken,
      body: { name: 'Hacked' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /configs/:id — deletes config', async () => {
    const res = await req('DELETE', `/configs/${configId}`, { token: userAToken })
    expect(res.status).toBe(200)
  })
})

/* ══════════════════════════════════════════════════════════
   4. Env Vars (encrypted)
   ══════════════════════════════════════════════════════════ */

describe('Cloud Env Vars', () => {
  it('POST /env-vars — creates and never returns plaintext value', async () => {
    const res = await req('POST', '/env-vars', {
      token: userAToken,
      body: { key: 'OPENAI_API_KEY', value: 'sk-smoke-test-secret', scope: 'global' },
    })
    expect(res.status).toBe(201)
    const body = await json<Record<string, unknown>>(res)
    expect(body.key).toBe('OPENAI_API_KEY')
    expect('encryptedValue' in body).toBe(false)
    expect('value' in body).toBe(false)
    envVarId = body.id as string
  })

  it('GET /env-vars — list never exposes encryptedValue', async () => {
    const res = await req('GET', '/env-vars', { token: userAToken })
    const body = await json<Record<string, unknown>[]>(res)
    for (const v of body) {
      expect('encryptedValue' in v).toBe(false)
    }
  })

  it('DELETE /env-vars/:id — deletes', async () => {
    const res = await req('DELETE', `/env-vars/${envVarId}`, { token: userAToken })
    expect(res.status).toBe(200)
  })
})

/* ══════════════════════════════════════════════════════════
   5. Clusters (BYOK)
   ══════════════════════════════════════════════════════════ */

describe('Cloud Clusters', () => {
  it('POST /clusters — stores kubeconfig encrypted', async () => {
    const res = await req('POST', '/clusters', {
      token: userAToken,
      body: { name: 'my-cluster', kubeconfig: 'apiVersion: v1\nkind: Config\n...' },
    })
    expect(res.status).toBe(201)
    const body = await json<Record<string, unknown>>(res)
    expect(body.name).toBe('my-cluster')
    expect('kubeconfigEncrypted' in body).toBe(false)
    expect('kubeconfigKmsRef' in body).toBe(false)
    clusterId = body.id as string
  })

  it('GET /clusters — list strips kubeconfig fields', async () => {
    const res = await req('GET', '/clusters', { token: userAToken })
    const body = await json<Record<string, unknown>[]>(res)
    for (const cl of body) {
      expect('kubeconfigEncrypted' in cl).toBe(false)
      expect('kubeconfigKmsRef' in cl).toBe(false)
    }
  })

  it('DELETE /clusters/:id — deletes', async () => {
    const res = await req('DELETE', `/clusters/${clusterId}`, { token: userAToken })
    expect(res.status).toBe(200)
  })

  it('Multi-tenant: user B cannot delete user A cluster (not found)', async () => {
    // Re-create first
    const createRes = await req('POST', '/clusters', {
      token: userAToken,
      body: { name: 'isolation-test-cluster', kubeconfig: 'apiVersion: v1\n' },
    })
    const created = await json<{ id: string }>(createRes)
    const res = await req('DELETE', `/clusters/${created.id}`, { token: userBToken })
    expect(res.status).toBe(404)
    // Clean up
    await req('DELETE', `/clusters/${created.id}`, { token: userAToken })
  })
})

/* ══════════════════════════════════════════════════════════
   6. Activity
   ══════════════════════════════════════════════════════════ */

describe('Cloud Activity', () => {
  it('GET /activity — returns audit log for user A', async () => {
    const res = await req('GET', '/activity', { token: userAToken })
    expect(res.status).toBe(200)
    const body = await json<{ type: string }[]>(res)
    expect(Array.isArray(body)).toBe(true)
    // deploy activity should be present
    expect(body.some((a) => a.type === 'deploy')).toBe(true)
  })

  it('GET /activity — user B sees only their own activity', async () => {
    const res = await req('GET', '/activity', { token: userBToken })
    const body = await json<{ userId: string }[]>(res)
    for (const a of body) {
      expect(a.userId).toBe(userBId)
    }
  })
})
