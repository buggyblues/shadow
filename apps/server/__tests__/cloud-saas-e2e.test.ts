/**
 * Cloud SaaS Integration Tests
 *
 * Tests the core SaaS user journey against a real PostgreSQL database:
 *   1. Browse template store (GET /api/cloud-saas/templates) → returns official templates
 *   2. Get wallet balance (GET /api/cloud-saas/wallet) → returns initial balance
 *   3. Fork a template (POST /api/cloud-saas/templates/:slug/fork)
 *   4. Deploy a template (POST /api/cloud-saas/deployments) → deducts coins
 *   5. View wallet transactions (GET /api/cloud-saas/wallet/transactions) → has deploy record
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createCloudSaasHandler } from '../src/handlers/cloud-saas.handler'
import { signAccessToken } from '../src/lib/jwt'

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@127.0.0.1:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

let userId: string
let token: string
let officialTemplateSlug: string

/* ── Helper ── */
async function req(method: string, path: string, body?: unknown, authToken = token) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return app.request(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/* ── Setup ── */

beforeAll(async () => {
  sql = postgres(TEST_DB_URL)
  db = drizzle(sql, { schema }) as Database
  container = createAppContainer(db)
  app = new Hono().route('/api/cloud-saas', createCloudSaasHandler(container))

  // Create test user
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `saas-test-${Date.now()}@example.com`,
      displayName: 'SaaS Test User',
      username: `saas-test-${Date.now()}`,
      passwordHash: 'test-hash',
    })
    .returning()
  userId = user!.id
  token = await signAccessToken({ userId })

  // Create wallet for test user
  await db.insert(schema.wallets).values({ userId, balance: 50000 }).onConflictDoNothing()

  // Seed an official template for tests
  const [tmpl] = await db
    .insert(schema.cloudTemplates)
    .values({
      slug: `e2e-official-${Date.now()}`,
      name: 'E2E Official Template',
      description: 'Integration test official template',
      source: 'official',
      reviewStatus: 'approved',
      content: { agents: [{ role: 'worker', model: 'gpt-4o-mini' }], version: 1 },
      tags: ['test'],
      category: 'test',
      baseCost: 0,
    })
    .returning()
  officialTemplateSlug = tmpl!.slug
})

afterAll(async () => {
  // Clean up test data
  if (officialTemplateSlug) {
    await db
      .delete(schema.cloudTemplates)
      .where(schema.cloudTemplates.slug.like(`e2e-official-%`))
      .catch(() => {})
  }
  if (userId) {
    await db
      .delete(schema.users)
      .where(schema.users.id.eq(userId))
      .catch(() => {})
  }
  await sql.end()
})

/* ══════════════════════════════════════════════════════════
   Tests
   ══════════════════════════════════════════════════════════ */

describe('Cloud SaaS — template store', () => {
  it('GET /api/cloud-saas/templates returns approved templates', async () => {
    const res = await req('GET', '/api/cloud-saas/templates')
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(Array.isArray(body)).toBe(true)
    // All returned templates must be approved
    for (const t of body as Array<{ reviewStatus: string }>) {
      expect(t.reviewStatus).toBe('approved')
    }
  })

  it('GET /api/cloud-saas/templates includes our seeded official template', async () => {
    const res = await req('GET', '/api/cloud-saas/templates')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ slug: string }>
    const found = body.find((t) => t.slug === officialTemplateSlug)
    expect(found).toBeDefined()
  })

  it('GET /api/cloud-saas/templates/:slug returns template detail', async () => {
    const res = await req('GET', `/api/cloud-saas/templates/${officialTemplateSlug}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { slug: string; reviewStatus: string }
    expect(body.slug).toBe(officialTemplateSlug)
    expect(body.reviewStatus).toBe('approved')
  })
})

describe('Cloud SaaS — wallet', () => {
  it('GET /api/cloud-saas/wallet returns wallet with positive balance', async () => {
    const res = await req('GET', '/api/cloud-saas/wallet')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { balance: number; userId: string }
    expect(body.userId).toBe(userId)
    expect(body.balance).toBeGreaterThan(0)
  })

  it('GET /api/cloud-saas/wallet/transactions returns array', async () => {
    const res = await req('GET', '/api/cloud-saas/wallet/transactions')
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })
})

describe('Cloud SaaS — fork a community template', () => {
  it('POST /api/cloud-saas/templates/:slug/fork creates a pending template', async () => {
    const res = await req('POST', `/api/cloud-saas/templates/${officialTemplateSlug}/fork`)
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      slug: string
      source: string
      reviewStatus: string
    }
    expect(body.source).toBe('community')
    expect(body.reviewStatus).toBe('pending')
    expect(body.slug).not.toBe(officialTemplateSlug)
  })
})

describe('Cloud SaaS — deployment + billing', () => {
  it('POST /api/cloud-saas/deployments deducts coins and creates deployment', async () => {
    // Get balance before
    const walletBefore = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }

    const res = await req('POST', '/api/cloud-saas/deployments', {
      namespace: 'e2e-test-ns',
      name: 'e2e-test-deploy',
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
    })
    expect(res.status).toBe(201)
    const deployment = (await res.json()) as { id: string; saasMode: boolean }
    expect(deployment.saasMode).toBe(true)

    // Balance should decrease
    const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }
    expect(walletAfter.balance).toBeLessThan(walletBefore.balance)

    // Transaction should appear
    const txRes = await req('GET', '/api/cloud-saas/wallet/transactions')
    const txList = (await txRes.json()) as Array<{ type: string; deployRefId?: string }>
    const deployTx = txList.find((tx) => tx.type === 'cloud_deploy')
    expect(deployTx).toBeDefined()
  })
})
