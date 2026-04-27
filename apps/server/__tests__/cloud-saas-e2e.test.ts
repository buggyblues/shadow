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
import { extractCloudSaasRuntime } from '@shadowob/cloud'
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

  it('stores provider profiles and injects the selected profile during deploy', async () => {
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
    const profileBody = (await profileRes.json()) as { profile: { id: string; providerId: string } }
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
      configSnapshot: {
        ...makeConfigSnapshot('provider-profile-secret'),
        use: [{ plugin: 'model-provider', options: { profileId: profileBody.profile.id } }],
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
    expect(JSON.parse(runtime.SHADOW_PROVIDER_PROFILE_MODELS_JSON)).toMatchObject([
      {
        providerId: 'anthropic',
        profileId: profileBody.profile.id,
        models: [
          {
            id: 'claude-profile-model',
            tags: ['default', 'reasoning'],
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    ])
  })

  it('refreshes provider models and resolves Manifest-style routing policy', async () => {
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
        },
        envVars: { OPENAI_API_KEY: 'mock-openai-key' },
      })
      expect(profileRes.status).toBe(200)
      const profileBody = (await profileRes.json()) as { profile: { id: string } }

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
        },
        envVars: { GOOGLE_AI_API_KEY: 'mock-gemini-key' },
      })
      expect(geminiProfileRes.status).toBe(200)
      const geminiProfileBody = (await geminiProfileRes.json()) as { profile: { id: string } }
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

      const routingRes = await req('GET', '/api/cloud-saas/provider-routing')
      expect(routingRes.status).toBe(200)
      const routingBody = (await routingRes.json()) as {
        policy: {
          defaultRoute: { selector: string; fallbacks: string[] }
          complexity: { reasoning: { selector: string; primary?: string; fallbacks: string[] } }
        }
        models: Array<{ ref: string; id: string }>
      }
      const fastRef = routingBody.models.find((model) => model.id === 'mock-fast-mini')?.ref
      const reasoningRef = routingBody.models.find((model) => model.id === 'mock-reasoning-r1')?.ref
      expect(fastRef).toBe(`${profileBody.profile.id}/mock-fast-mini`)
      expect(reasoningRef).toBe(`${profileBody.profile.id}/mock-reasoning-r1`)

      const policy = {
        ...routingBody.policy,
        defaultRoute: {
          selector: 'fast',
          primary: fastRef,
          fallbacks: reasoningRef ? [reasoningRef] : [],
        },
        complexity: {
          ...routingBody.policy.complexity,
          reasoning: {
            selector: 'reasoning',
            primary: reasoningRef,
            fallbacks: fastRef ? [fastRef] : [],
          },
        },
        limits: {
          requestsPerMinute: 30,
          concurrentRequests: 3,
          monthlyBudgetUsd: 25,
        },
        fallback: {
          enabled: true,
          statusCodes: [429, 500, 502, 503],
        },
        rules: [
          {
            id: 'rule-tokens-day',
            metric: 'tokens',
            threshold: 123,
            period: 'day',
            blockRequests: false,
            enabled: true,
            triggered: 0,
          },
        ],
        enabled: true,
      }
      const saveRoutingRes = await req('PUT', '/api/cloud-saas/provider-routing', { policy })
      expect(saveRoutingRes.status).toBe(200)

      const savedRoutingRes = await req('GET', '/api/cloud-saas/provider-routing')
      expect(savedRoutingRes.status).toBe(200)
      const savedRoutingBody = (await savedRoutingRes.json()) as {
        policy: { rules: Array<{ id: string; metric: string; threshold: number; period: string }> }
      }
      expect(savedRoutingBody.policy.rules[0]).toMatchObject({
        id: 'rule-tokens-day',
        metric: 'tokens',
        threshold: 123,
        period: 'day',
      })

      const resolveFastRes = await req('POST', '/api/cloud-saas/provider-routing/resolve', {
        selector: 'default',
      })
      expect(resolveFastRes.status).toBe(200)
      const resolveFastBody = (await resolveFastRes.json()) as {
        resolved: { model: { ref: string }; fallbacks: Array<{ ref: string }> }
      }
      expect(resolveFastBody.resolved.model.ref).toBe(fastRef)
      expect(resolveFastBody.resolved.fallbacks[0]?.ref).toBe(reasoningRef)

      const resolveReasoningRes = await req('POST', '/api/cloud-saas/provider-routing/resolve', {
        selector: 'reasoning',
      })
      expect(resolveReasoningRes.status).toBe(200)
      const resolveReasoningBody = (await resolveReasoningRes.json()) as {
        resolved: { model: { ref: string }; fallbacks: Array<{ ref: string }> }
      }
      expect(resolveReasoningBody.resolved.model.ref).toBe(reasoningRef)
      expect(resolveReasoningBody.resolved.fallbacks[0]?.ref).toBe(fastRef)
    } finally {
      await new Promise<void>((resolve) => modelServer.close(() => resolve()))
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

  it('GET /api/cloud-saas/deployments/costs and /:id/costs return Shrimp billing summaries', async () => {
    const namespace = uniqueName('e2e-costs-ns')
    const createRes = await req('POST', '/api/cloud-saas/deployments', {
      namespace,
      name: uniqueName('e2e-costs-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: makeConfigSnapshot('cost-secret'),
    })

    expect(createRes.status).toBe(201)
    const deployment = (await createRes.json()) as { id: string; monthlyCost: number | null }

    const namespaceCostsRes = await req('GET', `/api/cloud-saas/deployments/${deployment.id}/costs`)
    expect(namespaceCostsRes.status).toBe(200)
    const namespaceCosts = (await namespaceCostsRes.json()) as {
      namespace: string
      billingAmount: number | null
      billingUnit: string
      agents: Array<{ billingAmount: number | null; billingUnit: string }>
    }
    expect(namespaceCosts.namespace).toBe(namespace)
    expect(namespaceCosts.billingUnit).toBe('shrimp')
    expect(namespaceCosts.billingAmount).toBe(deployment.monthlyCost)
    expect(Array.isArray(namespaceCosts.agents)).toBe(true)
    expect(namespaceCosts.agents.length).toBeGreaterThan(0)
    expect(namespaceCosts.agents.every((agent) => agent.billingUnit === 'shrimp')).toBe(true)

    const overviewRes = await req('GET', '/api/cloud-saas/deployments/costs')
    expect(overviewRes.status).toBe(200)
    const overview = (await overviewRes.json()) as {
      billingUnit: string
      namespaces: Array<{ namespace: string; billingUnit: string; billingAmount: number | null }>
    }
    expect(overview.billingUnit).toBe('shrimp')
    const matchingNamespace = overview.namespaces.find((item) => item.namespace === namespace)
    expect(matchingNamespace).toBeDefined()
    expect(matchingNamespace?.billingUnit).toBe('shrimp')
    expect(matchingNamespace?.billingAmount).toBe(deployment.monthlyCost)
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
    const cancelBody = (await cancelRes.json()) as { ok: boolean; status: string }
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
