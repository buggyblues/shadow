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

import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { attachCloudSaasProvisionState, extractCloudSaasRuntime } from '@shadowob/cloud'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createCloudSaasHandler } from '../src/handlers/cloud-saas.handler'
import { signAccessToken } from '../src/lib/jwt'

process.env.KMS_MASTER_KEY = process.env.KMS_MASTER_KEY ?? 'a'.repeat(64)

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@127.0.0.1:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let app: Hono

let userId: string
let token: string
let officialTemplateSlug: string
let invalidOfficialTemplateSlug: string

function uniqueName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

function makeConfigSnapshot(secret = 'super-secret'): Record<string, unknown> {
  return {
    version: '1',
    deployments: {
      agents: [
        {
          id: 'agent-1',
          runtime: 'docker',
          envVars: {
            OPENAI_API_KEY: secret,
          },
        },
      ],
      secrets: {
        API_KEY: secret,
      },
      publicMetadata: {
        displayName: 'E2E Agent',
      },
    },
    apiKey: secret,
  }
}

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
  const createdUser = user!
  userId = createdUser.id
  token = signAccessToken({
    userId: createdUser.id,
    email: createdUser.email,
    username: createdUser.username,
  })

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
      content: makeConfigSnapshot('official-template-secret'),
      tags: ['test'],
      category: 'test',
      baseCost: 0,
    })
    .returning()
  officialTemplateSlug = tmpl!.slug

  const [invalidTemplate] = await db
    .insert(schema.cloudTemplates)
    .values({
      slug: `e2e-invalid-official-${Date.now()}`,
      name: 'E2E Invalid Official Template',
      description: 'Invalid deploy config template for integration tests',
      source: 'official',
      reviewStatus: 'approved',
      content: { agents: [{ role: 'worker', model: 'gpt-4o-mini' }], version: 1 },
      tags: ['test'],
      category: 'test',
      baseCost: 0,
    })
    .returning()
  invalidOfficialTemplateSlug = invalidTemplate!.slug
})

afterAll(async () => {
  // Clean up test data
  if (officialTemplateSlug || invalidOfficialTemplateSlug) {
    await db
      .delete(schema.cloudTemplates)
      .where(like(schema.cloudTemplates.slug, 'e2e-%'))
      .catch(() => {})
  }
  if (userId) {
    await db
      .delete(schema.users)
      .where(eq(schema.users.id, userId))
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

  it('GET /api/cloud-saas/templates excludes approved templates with invalid deploy config', async () => {
    const res = await req('GET', '/api/cloud-saas/templates')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ slug: string }>
    const found = body.find((t) => t.slug === invalidOfficialTemplateSlug)
    expect(found).toBeUndefined()
  })

  it('GET /api/cloud-saas/templates/:slug returns template detail', async () => {
    const res = await req('GET', `/api/cloud-saas/templates/${officialTemplateSlug}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { slug: string; reviewStatus: string }
    expect(body.slug).toBe(officialTemplateSlug)
    expect(body.reviewStatus).toBe('approved')
  })

  it('GET /api/cloud-saas/templates/:slug rejects undeployable approved templates', async () => {
    const res = await req('GET', `/api/cloud-saas/templates/${invalidOfficialTemplateSlug}`)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('not deployable')
  })
})

describe('Cloud SaaS — wallet', () => {
  it('GET /api/cloud-saas/wallet returns wallet with positive balance', async () => {
    const res = await req('GET', '/api/cloud-saas/wallet')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { balance: number }
    expect(body.balance).toBeGreaterThan(0)
  })

  it('GET /api/cloud-saas/wallet/transactions returns paginated transactions', async () => {
    const res = await req('GET', '/api/cloud-saas/wallet/transactions')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      transactions: unknown[]
      total: number
      limit: number
      offset: number
    }
    expect(Array.isArray(body.transactions)).toBe(true)
    expect(body.total).toBeGreaterThanOrEqual(0)
    expect(body.limit).toBeGreaterThan(0)
    expect(body.offset).toBe(0)
  })
})

describe('Cloud SaaS — env vars', () => {
  it('GET /api/cloud-saas/global-envvars tolerates unreadable legacy values', async () => {
    const [legacyUser] = await db
      .insert(schema.users)
      .values({
        email: `saas-legacy-env-${Date.now()}@example.com`,
        displayName: 'Legacy Env User',
        username: uniqueName('saas-legacy-env'),
        passwordHash: 'test-hash',
      })
      .returning()
    const legacyUserId = legacyUser!.id
    const legacyToken = signAccessToken({
      userId: legacyUserId,
      email: legacyUser!.email,
      username: legacyUser!.username,
    })

    try {
      await db.insert(schema.cloudEnvVars).values({
        userId: legacyUserId,
        scope: 'global',
        key: 'BROKEN_LEGACY_KEY',
        encryptedValue: 'not-valid-ciphertext',
      })

      const listRes = await req('GET', '/api/cloud-saas/global-envvars', undefined, legacyToken)
      expect(listRes.status).toBe(200)
      const listBody = (await listRes.json()) as {
        envVars: Array<{ key: string }>
      }
      expect(listBody.envVars.some((entry) => entry.key === 'BROKEN_LEGACY_KEY')).toBe(true)

      const getRes = await req(
        'GET',
        '/api/cloud-saas/global-envvars/BROKEN_LEGACY_KEY',
        undefined,
        legacyToken,
      )
      expect(getRes.status).toBe(422)
    } finally {
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, legacyUserId))
        .catch(() => {})
    }
  })
})

describe('Cloud SaaS — deployment listing', () => {
  it('GET /api/cloud-saas/deployments returns newest records first', async () => {
    const namespace = uniqueName('e2e-list-order')
    try {
      await db.insert(schema.cloudDeployments).values([
        {
          userId,
          namespace,
          name: `${namespace}-old`,
          status: 'failed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('old-secret'),
          createdAt: new Date('2099-01-01T00:00:00.000Z'),
          updatedAt: new Date('2099-01-01T00:00:00.000Z'),
        },
        {
          userId,
          namespace,
          name: `${namespace}-new`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('new-secret'),
          createdAt: new Date('2099-01-02T00:00:00.000Z'),
          updatedAt: new Date('2099-01-02T00:00:00.000Z'),
        },
      ])

      const res = await req('GET', '/api/cloud-saas/deployments?limit=2&offset=0')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Array<{
        namespace: string
        name: string
      }>
      expect(body[0]).toMatchObject({ namespace, name: `${namespace}-new` })

      const historyRes = await req(
        'GET',
        '/api/cloud-saas/deployments?includeHistory=1&limit=10&offset=0',
      )
      expect(historyRes.status).toBe(200)
      const history = (await historyRes.json()) as Array<{ namespace: string; name: string }>
      expect(history.filter((row) => row.namespace === namespace).map((row) => row.name)).toEqual([
        `${namespace}-new`,
        `${namespace}-old`,
      ])
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })
})

describe('Cloud SaaS — create a community template', () => {
  it('POST /api/cloud-saas/templates creates a draft community template', async () => {
    const slug = uniqueName('e2e-community-template')
    const res = await req('POST', '/api/cloud-saas/templates', {
      slug,
      name: 'E2E Community Template',
      description: 'Created by integration test',
      content: makeConfigSnapshot('template-secret'),
      tags: ['test'],
      category: 'test',
      baseCost: 0,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      slug: string
      source: string
      reviewStatus: string
    }
    expect(body.source).toBe('community')
    expect(body.reviewStatus).toBe('draft')
    expect(body.slug).toBe(slug)
  })
})

describe('Cloud SaaS — deployment + billing', () => {
  it('POST /api/cloud-saas/deployments injects Shadow runtime defaults and saved global env vars', async () => {
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    const previousShadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
    const previousShadowProvisionUrl = process.env.SHADOW_PROVISION_URL

    process.env.SHADOW_SERVER_URL = 'http://server.test:3002'
    process.env.SHADOW_AGENT_SERVER_URL = 'http://agent.test:3002'
    delete process.env.SHADOW_PROVISION_URL

    try {
      const saveEnvRes = await req('PUT', '/api/cloud-saas/global-envvars', {
        key: 'OPENAI_API_KEY',
        value: 'saved-openai-key',
      })
      expect(saveEnvRes.status).toBe(200)

      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace: uniqueName('e2e-runtime-defaults-ns'),
        name: uniqueName('e2e-runtime-defaults-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: makeConfigSnapshot('runtime-default-secret'),
        envVars: {
          OPENAI_API_KEY: '__SAVED__',
        },
      })

      expect(createRes.status).toBe(201)
      const deployment = (await createRes.json()) as { id: string }
      const [stored] = await db
        .select()
        .from(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.id, deployment.id))
        .limit(1)

      const runtime = extractCloudSaasRuntime(stored?.configSnapshot).envVars
      expect(runtime.SHADOW_SERVER_URL).toBe('http://server.test:3002')
      expect(runtime.SHADOW_AGENT_SERVER_URL).toBe('http://agent.test:3002')
      expect(runtime.SHADOW_USER_TOKEN).toBe(token)
      expect(runtime.OPENAI_API_KEY).toBe('saved-openai-key')
    } finally {
      if (previousShadowServerUrl === undefined) {
        delete process.env.SHADOW_SERVER_URL
      } else {
        process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      }
      if (previousShadowAgentServerUrl === undefined) {
        delete process.env.SHADOW_AGENT_SERVER_URL
      } else {
        process.env.SHADOW_AGENT_SERVER_URL = previousShadowAgentServerUrl
      }
      if (previousShadowProvisionUrl === undefined) {
        delete process.env.SHADOW_PROVISION_URL
      } else {
        process.env.SHADOW_PROVISION_URL = previousShadowProvisionUrl
      }
    }
  })

  it('POST /api/cloud-saas/deployments auto-injects saved provider env vars for model-provider templates', async () => {
    const baseUrl = 'https://compatible.example.test/v1'
    const modelId = 'qwen3.6-plus'

    const saveBaseUrlRes = await req('PUT', '/api/cloud-saas/global-envvars', {
      key: 'OPENAI_COMPATIBLE_BASE_URL',
      value: baseUrl,
    })
    expect(saveBaseUrlRes.status).toBe(200)

    const saveApiKeyRes = await req('PUT', '/api/cloud-saas/global-envvars', {
      key: 'OPENAI_COMPATIBLE_API_KEY',
      value: 'saved-compatible-key',
    })
    expect(saveApiKeyRes.status).toBe(200)

    const saveModelRes = await req('PUT', '/api/cloud-saas/global-envvars', {
      key: 'OPENAI_COMPATIBLE_MODEL_ID',
      value: modelId,
    })
    expect(saveModelRes.status).toBe(200)

    const saveDeepSeekRes = await req('PUT', '/api/cloud-saas/global-envvars', {
      key: 'DEEPSEEK_API_KEY',
      value: 'saved-deepseek-key',
    })
    expect(saveDeepSeekRes.status).toBe(200)

    const createRes = await req('POST', '/api/cloud-saas/deployments', {
      namespace: uniqueName('e2e-provider-env-ns'),
      name: uniqueName('e2e-provider-env-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: {
        ...makeConfigSnapshot('provider-runtime-secret'),
        use: [{ plugin: 'model-provider' }],
      },
    })

    expect(createRes.status).toBe(201)
    const deployment = (await createRes.json()) as { id: string }
    const [stored] = await db
      .select()
      .from(schema.cloudDeployments)
      .where(eq(schema.cloudDeployments.id, deployment.id))
      .limit(1)

    const runtime = extractCloudSaasRuntime(stored?.configSnapshot).envVars
    expect(runtime.OPENAI_COMPATIBLE_BASE_URL).toBe(baseUrl)
    expect(runtime.OPENAI_COMPATIBLE_API_KEY).toBe('saved-compatible-key')
    expect(runtime.OPENAI_COMPATIBLE_MODEL_ID).toBe(modelId)
    expect(runtime.DEEPSEEK_API_KEY).toBe('saved-deepseek-key')
  })

  it('stores provider profiles and injects selected real provider env during deploy', async () => {
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    process.env.SHADOW_SERVER_URL = 'http://server.test:3002'

    try {
      const catalogsRes = await req('GET', '/api/cloud-saas/provider-catalogs')
      expect(catalogsRes.status).toBe(200)
      const catalogs = (await catalogsRes.json()) as {
        providers: Array<{ provider: { id: string } }>
      }
      const providerIds = catalogs.providers.map((entry) => entry.provider.id)
      expect(providerIds).toContain('anthropic')
      expect(providerIds).toContain('qwen')
      expect(providerIds).toContain('minimax')
      expect(providerIds).toContain('moonshot')
      expect(providerIds).toContain('zai')

      const profileRes = await req('PUT', '/api/cloud-saas/provider-profiles', {
        providerId: 'anthropic',
        name: 'Anthropic Test',
        config: {
          baseUrl: 'https://anthropic-proxy.example.test',
          models: [
            {
              id: 'claude-profile-model',
              name: 'Claude Profile Model',
              tags: ['default', 'reasoning'],
              contextWindow: 200000,
              maxTokens: 8192,
            },
          ],
        },
        envVars: { ANTHROPIC_API_KEY: 'profile-anthropic-key' },
      })
      expect(profileRes.status).toBe(200)
      const profileBody = (await profileRes.json()) as {
        profile: { id: string; providerId: string }
      }
      expect(profileBody.profile.providerId).toBe('anthropic')

      const listRes = await req('GET', '/api/cloud-saas/provider-profiles')
      expect(listRes.status).toBe(200)
      const listBody = (await listRes.json()) as {
        profiles: Array<{ id: string; envVars: unknown[] }>
      }
      expect(
        listBody.profiles.find((profile) => profile.id === profileBody.profile.id)?.envVars,
      ).toHaveLength(1)

      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace: uniqueName('e2e-provider-profile-ns'),
        name: uniqueName('e2e-provider-profile-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        envVars: {
          ANTHROPIC_API_KEY: 'stale-explicit-key',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1',
        },
        configSnapshot: {
          ...makeConfigSnapshot('provider-profile-secret'),
          use: [
            {
              plugin: 'model-provider',
              options: { profileId: profileBody.profile.id },
            },
          ],
        },
      })

      expect(createRes.status).toBe(201)
      const deployment = (await createRes.json()) as { id: string }
      const [stored] = await db
        .select()
        .from(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.id, deployment.id))
        .limit(1)

      const runtime = extractCloudSaasRuntime(stored?.configSnapshot).envVars
      expect(runtime.ANTHROPIC_API_KEY).toBe('profile-anthropic-key')
      expect(runtime.ANTHROPIC_BASE_URL).toBe('https://anthropic-proxy.example.test')
      expect(runtime.OPENAI_COMPATIBLE_BASE_URL).toBeUndefined()
      expect(runtime.OPENAI_COMPATIBLE_API_KEY).toBeUndefined()
      expect(runtime.OPENAI_COMPATIBLE_MODEL_ID).toBeUndefined()
      const modelSets = JSON.parse(runtime.SHADOW_PROVIDER_PROFILE_MODELS_JSON ?? '[]') as Array<{
        providerId: string
        profileId: string
        models: Array<{ id: string; tags?: string[] }>
      }>
      expect(modelSets).toEqual([
        {
          providerId: 'anthropic',
          profileId: profileBody.profile.id,
          models: [
            expect.objectContaining({
              id: 'claude-profile-model',
              tags: ['default', 'reasoning'],
            }),
          ],
        },
      ])
    } finally {
      if (previousShadowServerUrl === undefined) {
        delete process.env.SHADOW_SERVER_URL
      } else {
        process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      }
    }
  })

  it('tests anthropic-compatible profiles through a configured model when model listing is unavailable', async () => {
    const providerServer = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://mock.local')
      if (url.pathname === '/apps/anthropic/models') {
        expect(request.headers['x-api-key']).toBe('mock-anthropic-key')
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'models endpoint unavailable' }))
        return
      }
      if (url.pathname === '/apps/anthropic/messages') {
        expect(request.method).toBe('POST')
        expect(request.headers['x-api-key']).toBe('mock-anthropic-key')
        expect(request.headers['anthropic-version']).toBe('2023-06-01')
        let body = ''
        request.on('data', (chunk) => {
          body += chunk
        })
        request.on('end', () => {
          const parsed = JSON.parse(body) as { model: string }
          expect(parsed.model).toBe('qwen3.6-plus')
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(
            JSON.stringify({
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'ok' }],
            }),
          )
        })
        return
      }

      response.writeHead(404)
      response.end()
    })
    await new Promise<void>((resolve) => providerServer.listen(0, '127.0.0.1', resolve))

    try {
      const address = providerServer.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const profileRes = await req('PUT', '/api/cloud-saas/provider-profiles', {
        providerId: 'anthropic',
        name: 'Anthropic Compatible Gateway',
        config: {
          baseUrl: `http://127.0.0.1:${port}/apps/anthropic`,
          apiFormat: 'anthropic',
          authType: 'api_key',
          models: [{ id: 'qwen3.6-plus', tags: ['default'] }],
        },
        envVars: { ANTHROPIC_API_KEY: 'mock-anthropic-key' },
      })
      expect(profileRes.status).toBe(200)
      const profileBody = (await profileRes.json()) as {
        profile: { id: string }
      }

      const testRes = await req(
        'POST',
        `/api/cloud-saas/provider-profiles/${profileBody.profile.id}/test`,
      )
      expect(testRes.status).toBe(200)
      const testBody = (await testRes.json()) as { ok: boolean; status?: number; message: string }
      expect(testBody).toMatchObject({
        ok: true,
        status: 200,
        message: 'Connection succeeded',
      })
    } finally {
      await new Promise<void>((resolve) => providerServer.close(() => resolve()))
    }
  })

  it('refreshes provider models and deploys the profile selected by model tag', async () => {
    const modelServer = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://mock.local')
      if (url.pathname === '/v1/models') {
        expect(request.headers.authorization).toBe('Bearer mock-openai-key')
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            data: [
              { id: 'mock-fast-mini', object: 'model' },
              { id: 'mock-reasoning-r1', object: 'model' },
            ],
          }),
        )
        return
      }
      if (url.pathname === '/gemini/models') {
        expect(url.searchParams.get('key')).toBe('mock-gemini-key')
        expect(request.headers.authorization).toBeUndefined()
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            models: [{ name: 'models/gemini-2.0-flash', inputTokenLimit: 1_048_576 }],
          }),
        )
        return
      }

      response.writeHead(404)
      response.end()
    })
    await new Promise<void>((resolve) => modelServer.listen(0, '127.0.0.1', resolve))

    try {
      const address = modelServer.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const baseUrl = `http://127.0.0.1:${port}/v1`
      const profileRes = await req('PUT', '/api/cloud-saas/provider-profiles', {
        providerId: 'openai',
        name: 'Mock OpenAI Gateway',
        config: {
          baseUrl,
          apiFormat: 'openai',
          authType: 'api_key',
          models: [{ id: 'seed-model', tags: ['default'] }],
        },
        envVars: { OPENAI_API_KEY: 'mock-openai-key' },
      })
      expect(profileRes.status).toBe(200)
      const profileBody = (await profileRes.json()) as {
        profile: { id: string }
      }

      const refreshRes = await req(
        'POST',
        `/api/cloud-saas/provider-profiles/${profileBody.profile.id}/models/refresh`,
      )
      expect(refreshRes.status).toBe(200)
      const refreshBody = (await refreshRes.json()) as {
        ok: boolean
        models: Array<{ id: string; tags: string[] }>
      }
      expect(refreshBody.ok).toBe(true)
      expect(refreshBody.models.map((model) => model.id)).toEqual([
        'mock-fast-mini',
        'mock-reasoning-r1',
      ])
      expect(refreshBody.models[0]?.tags).toContain('fast')
      expect(refreshBody.models[1]?.tags).toContain('reasoning')

      const geminiProfileRes = await req('PUT', '/api/cloud-saas/provider-profiles', {
        providerId: 'gemini',
        name: 'Mock Gemini Gateway',
        config: {
          baseUrl: `http://127.0.0.1:${port}/gemini`,
          authType: 'api_key',
          models: [{ id: 'models/gemini-seed', tags: ['default'] }],
        },
        envVars: { GOOGLE_AI_API_KEY: 'mock-gemini-key' },
      })
      expect(geminiProfileRes.status).toBe(200)
      const geminiProfileBody = (await geminiProfileRes.json()) as {
        profile: { id: string }
      }
      const geminiRefreshRes = await req(
        'POST',
        `/api/cloud-saas/provider-profiles/${geminiProfileBody.profile.id}/models/refresh`,
      )
      expect(geminiRefreshRes.status).toBe(200)
      const geminiRefreshBody = (await geminiRefreshRes.json()) as {
        ok: boolean
        models: Array<{ id: string; tags: string[]; contextWindow?: number }>
        profile: { config: { apiFormat?: string } }
      }
      expect(geminiRefreshBody.ok).toBe(true)
      expect(geminiRefreshBody.profile.config.apiFormat).toBe('gemini')
      expect(geminiRefreshBody.models[0]).toMatchObject({
        id: 'gemini-2.0-flash',
        contextWindow: 1_048_576,
      })
      expect(geminiRefreshBody.models[0]?.tags).toContain('fast')

      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace: uniqueName('e2e-provider-selector-ns'),
        name: uniqueName('e2e-provider-selector-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: {
          ...makeConfigSnapshot('provider-selector-secret'),
          use: [
            {
              plugin: 'model-provider',
              options: { profileId: profileBody.profile.id, selector: 'reasoning' },
            },
          ],
        },
      })
      expect(createRes.status).toBe(201)
      const deployment = (await createRes.json()) as { id: string }
      const [stored] = await db
        .select()
        .from(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.id, deployment.id))
        .limit(1)
      const runtime = extractCloudSaasRuntime(stored?.configSnapshot).envVars
      expect(runtime.OPENAI_API_KEY).toBe('mock-openai-key')
      expect(runtime.OPENAI_COMPATIBLE_BASE_URL).toBeUndefined()
      const modelSets = JSON.parse(runtime.SHADOW_PROVIDER_PROFILE_MODELS_JSON ?? '[]') as Array<{
        providerId: string
        profileId: string
        models: Array<{ id: string; tags?: string[] }>
      }>
      expect(modelSets).toEqual([
        {
          providerId: 'openai',
          profileId: profileBody.profile.id,
          models: [
            expect.objectContaining({ id: 'mock-fast-mini', tags: ['fast'] }),
            expect.objectContaining({ id: 'mock-reasoning-r1', tags: ['reasoning'] }),
          ],
        },
      ])
    } finally {
      await new Promise<void>((resolve) => modelServer.close(() => resolve()))
    }
  })

  it('GET /api/cloud-saas/provider-profiles ignores unreadable legacy provider values', async () => {
    const [legacyUser] = await db
      .insert(schema.users)
      .values({
        email: `saas-legacy-provider-${Date.now()}@example.com`,
        displayName: 'Legacy Provider User',
        username: uniqueName('saas-legacy-provider'),
        passwordHash: 'test-hash',
      })
      .returning()
    const legacyUserId = legacyUser!.id
    const legacyToken = signAccessToken({
      userId: legacyUserId,
      email: legacyUser!.email,
      username: legacyUser!.username,
    })

    try {
      await db.insert(schema.cloudEnvVars).values([
        {
          userId: legacyUserId,
          scope: 'provider:legacy-bad-profile',
          key: 'SHADOW_PROVIDER_ID',
          encryptedValue: 'not-valid-ciphertext',
        },
      ])

      const res = await req('GET', '/api/cloud-saas/provider-profiles', undefined, legacyToken)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        profiles: unknown[]
      }
      expect(body.profiles).toEqual([])
    } finally {
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, legacyUserId))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments deducts coins, creates deployment, and redacts config secrets', async () => {
    // Get balance before
    const walletBefore = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }

    const namespace = uniqueName('e2e-test-ns')
    const configSnapshot = makeConfigSnapshot('deploy-secret')

    const res = await req('POST', '/api/cloud-saas/deployments', {
      namespace,
      name: uniqueName('e2e-test-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot,
      envVars: {
        SHADOW_USER_TOKEN: 'runtime-only-secret',
      },
    })
    expect(res.status).toBe(201)
    const deployment = (await res.json()) as {
      id: string
      saasMode: boolean
      configSnapshot: {
        apiKey?: string
        deployments?: {
          secrets?: Record<string, string>
          publicMetadata?: { displayName?: string }
        }
        __shadowobRuntime?: unknown
      }
    }
    expect(deployment.saasMode).toBe(true)
    expect(deployment.configSnapshot.__shadowobRuntime).toBeUndefined()
    expect(deployment.configSnapshot.apiKey).toBe('[REDACTED]')
    expect(deployment.configSnapshot.deployments?.secrets?.API_KEY).toBe('[REDACTED]')
    expect(deployment.configSnapshot.deployments?.publicMetadata?.displayName).toBe('E2E Agent')

    const detailRes = await req('GET', `/api/cloud-saas/deployments/${deployment.id}`)
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()) as typeof deployment
    expect(detail.configSnapshot.__shadowobRuntime).toBeUndefined()
    expect(detail.configSnapshot.deployments?.secrets?.API_KEY).toBe('[REDACTED]')

    // Balance should decrease
    const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }
    expect(walletAfter.balance).toBeLessThan(walletBefore.balance)

    // Transaction should appear
    const txRes = await req('GET', '/api/cloud-saas/wallet/transactions')
    const txBody = (await txRes.json()) as {
      transactions: Array<{ type: string; referenceType?: string }>
    }
    const deployTx = txBody.transactions.find((tx) => tx.referenceType === 'cloud_deploy')
    expect(deployTx).toBeDefined()
  })

  it('GET /api/cloud-saas/deployments/costs and /:id/costs return token usage summaries', async () => {
    const namespace = uniqueName('e2e-costs-ns')
    const createRes = await req('POST', '/api/cloud-saas/deployments', {
      namespace,
      name: uniqueName('e2e-costs-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: makeConfigSnapshot('cost-secret'),
    })

    expect(createRes.status).toBe(201)
    const deployment = (await createRes.json()) as { id: string }

    const namespaceCostsRes = await req('GET', `/api/cloud-saas/deployments/${deployment.id}/costs`)
    expect(namespaceCostsRes.status).toBe(200)
    const namespaceCosts = (await namespaceCostsRes.json()) as {
      namespace: string
      billingAmount: number | null
      billingUnit: string
      agents: Array<{ billingAmount: number | null; billingUnit: string }>
    }
    expect(namespaceCosts.namespace).toBe(namespace)
    expect(namespaceCosts.billingUnit).toBe('usd')
    expect(namespaceCosts.billingAmount).toBe(null)
    expect(Array.isArray(namespaceCosts.agents)).toBe(true)
    expect(namespaceCosts.agents.length).toBeGreaterThan(0)
    expect(namespaceCosts.agents.every((agent) => agent.billingUnit === 'usd')).toBe(true)

    const overviewRes = await req('GET', '/api/cloud-saas/deployments/costs')
    expect(overviewRes.status).toBe(200)
    const overview = (await overviewRes.json()) as {
      billingUnit: string
      namespaces: Array<{
        namespace: string
        billingUnit: string
        billingAmount: number | null
      }>
    }
    expect(overview.billingUnit).toBe('usd')
    const matchingNamespace = overview.namespaces.find((item) => item.namespace === namespace)
    expect(matchingNamespace).toBeDefined()
    expect(matchingNamespace?.billingUnit).toBe('usd')
    expect(matchingNamespace?.billingAmount).toBe(null)
  })

  it('POST /api/cloud-saas/deployments/:id/redeploy creates a durable history entry without charging again', async () => {
    const namespace = uniqueName('e2e-redeploy-ns')
    const walletBefore = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }

    try {
      const [existing] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('redeploy-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
        })
        .returning()

      const redeployRes = await req('POST', `/api/cloud-saas/deployments/${existing!.id}/redeploy`)
      expect(redeployRes.status).toBe(201)
      const redeployed = (await redeployRes.json()) as {
        id: string
        namespace: string
        status: string
      }
      expect(redeployed.id).not.toBe(existing!.id)
      expect(redeployed.namespace).toBe(namespace)
      expect(redeployed.status).toBe('pending')

      const historyRes = await req(
        'GET',
        '/api/cloud-saas/deployments?includeHistory=1&limit=10&offset=0',
      )
      const history = (await historyRes.json()) as Array<{ id: string; namespace: string }>
      expect(history.filter((row) => row.namespace === namespace).map((row) => row.id)).toContain(
        existing!.id,
      )
      expect(history.filter((row) => row.namespace === namespace).map((row) => row.id)).toContain(
        redeployed.id,
      )

      const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
        balance: number
      }
      expect(walletAfter.balance).toBe(walletBefore.balance)
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('guards deployment instances by namespace and preserves provision state on redeploy', async () => {
    const namespace = uniqueName('e2e-instance-ns')
    const provisionState = {
      provisionedAt: '2026-04-28T00:00:00.000Z',
      namespace,
      plugins: {
        shadowob: {
          servers: { main: 'server-1' },
          channels: { general: 'channel-1' },
          buddies: {
            'strategy-buddy': {
              agentId: 'agent-1',
              userId: 'bot-user-1',
              token: 'agent-token-1',
            },
          },
        },
      },
    }

    try {
      const [existing] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: attachCloudSaasProvisionState(
            makeConfigSnapshot('redeploy-state-secret'),
            provisionState,
          ),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
        })
        .returning()

      const duplicateRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: `${namespace}-duplicate`,
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: makeConfigSnapshot('duplicate-secret'),
      })
      expect(duplicateRes.status).toBe(409)

      const redeployRes = await req('POST', `/api/cloud-saas/deployments/${existing!.id}/redeploy`)
      expect(redeployRes.status).toBe(201)
      const redeployed = (await redeployRes.json()) as { id: string }
      const [storedRedeploy] = await db
        .select()
        .from(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.id, redeployed.id))
        .limit(1)

      const runtime = extractCloudSaasRuntime(storedRedeploy?.configSnapshot)
      expect(runtime.provisionState?.plugins.shadowob).toEqual(provisionState.plugins.shadowob)

      const redeployAgainRes = await req(
        'POST',
        `/api/cloud-saas/deployments/${existing!.id}/redeploy`,
      )
      expect(redeployAgainRes.status).toBe(409)

      const destroyOldRes = await req('DELETE', `/api/cloud-saas/deployments/${existing!.id}`)
      expect(destroyOldRes.status).toBe(409)
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments/:id/cancel marks a pending deployment as cancelling', async () => {
    const createRes = await req('POST', '/api/cloud-saas/deployments', {
      namespace: uniqueName('e2e-cancel-ns'),
      name: uniqueName('e2e-cancel-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: makeConfigSnapshot('cancel-secret'),
    })

    expect(createRes.status).toBe(201)
    const deployment = (await createRes.json()) as { id: string }

    const cancelRes = await req('POST', `/api/cloud-saas/deployments/${deployment.id}/cancel`)
    expect(cancelRes.status).toBe(200)
    const cancelBody = (await cancelRes.json()) as {
      ok: boolean
      status: string
    }
    expect(cancelBody.ok).toBe(true)
    expect(cancelBody.status).toBe('cancelling')

    const detailRes = await req('GET', `/api/cloud-saas/deployments/${deployment.id}`)
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()) as { status: string }
    expect(detail.status).toBe('cancelling')
  })

  it('POST /api/cloud-saas/deployments rejects invalid config without charging wallet', async () => {
    const walletBefore = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }

    const res = await req('POST', '/api/cloud-saas/deployments', {
      namespace: uniqueName('e2e-invalid-ns'),
      name: uniqueName('e2e-invalid-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: {
        version: '1',
        deployments: {
          agents: [],
        },
      },
    })

    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Invalid configSnapshot')

    const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }
    expect(walletAfter.balance).toBe(walletBefore.balance)
  })

  it('POST /api/cloud-saas/deployments rejects undeployable templates before charging wallet', async () => {
    const walletBefore = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }

    const res = await req('POST', '/api/cloud-saas/deployments', {
      namespace: uniqueName('e2e-invalid-template-ns'),
      name: uniqueName('e2e-invalid-template-deploy'),
      templateSlug: invalidOfficialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: makeConfigSnapshot('valid-runtime-secret'),
    })

    expect(res.status).toBe(422)
    const body = (await res.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('not deployable')

    const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }
    expect(walletAfter.balance).toBe(walletBefore.balance)
  })
})
