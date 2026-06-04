/**
 * Cloud SaaS Integration Tests
 *
 * Tests the core SaaS user journey against a real PostgreSQL database:
 *   1. Browse template store (GET /api/cloud-saas/templates) → returns official templates
 *   2. Get wallet balance (GET /api/cloud-saas/wallet) → returns initial balance
 *   3. Fork a template (POST /api/cloud-saas/templates/:slug/fork)
 *   4. Deploy a template (POST /api/cloud-saas/deployments) → queues a time-billed deployment
 *   5. View wallet transactions (GET /api/cloud-saas/wallet/transactions)
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import * as cloudRuntime from '@shadowob/cloud'
import {
  attachCloudSaasProvisionState,
  CLOUD_SAAS_RUNTIME_KEY,
  type DeployFromSnapshotOptions,
  type DeployResult,
  extractCloudSaasRuntime,
  prepareCloudSaasConfigSnapshot,
  type ServiceContainer,
} from '@shadowob/cloud'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { Hono } from 'hono'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { createAgentHandler } from '../src/handlers/agent.handler'
import { createCloudSaasHandler } from '../src/handlers/cloud-saas.handler'
import {
  createCloudHourlyBillingReferenceId,
  processCloudDeploymentQueueOnce,
} from '../src/lib/cloud-deployment-processor'
import { signAccessToken, signAgentToken } from '../src/lib/jwt'
import { closeRedisClient } from '../src/lib/redis'

const cloudRuntimeMocks = vi.hoisted(() => ({
  applyKubernetesManifestAsync: vi.fn(async () => undefined),
  createVolumeSnapshotBackupAsync: vi.fn(async () => undefined),
  deleteNamespace: vi.fn(() => undefined),
  deleteKubernetesResourceAsync: vi.fn(async () => undefined),
  execInPodAsync: vi.fn(async () => ({
    exitCode: 0,
    stdout: Buffer.from('fake-archive').toString('base64'),
    stderr: '',
  })),
  execInPodWithInputAsync: vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' })),
  getPvcVolumeSnapshotCapability: vi.fn(async () => ({
    storageClassName: 'standard',
    provisioner: 'rancher.io/local-path',
    isCsi: false,
    volumeSnapshotClassName: null,
  })),
  isPvcBackedByCsiProvisioner: vi.fn(async () => false),
  isVolumeSnapshotApiAvailable: vi.fn(async () => false),
  listManagedNamespaces: vi.fn(() => []),
  listPodsAsync: vi.fn(async () => []),
  namespaceExists: vi.fn(() => false),
  restorePvcFromVolumeSnapshot: vi.fn(async () => undefined),
  scaleAgentSandboxAsync: vi.fn(async () => undefined),
  waitForAgentSandboxPaused: vi.fn(async () => undefined),
  waitForAgentSandboxReady: vi.fn(async () => undefined),
  waitForPodReadyAsync: vi.fn(async () => undefined),
  waitForVolumeSnapshotReady: vi.fn(async () => undefined),
}))

vi.mock('@shadowob/cloud', async () => {
  const actual = await vi.importActual<typeof import('@shadowob/cloud')>('@shadowob/cloud')
  return {
    ...actual,
    ...cloudRuntimeMocks,
  }
})

process.env.KMS_MASTER_KEY = process.env.KMS_MASTER_KEY ?? 'a'.repeat(64)
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:16379'

vi.mock('../src/lib/ssrf', () => ({
  assertSafeHttpUrl: async (rawUrl: string) => new URL(rawUrl),
}))

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
    use: [{ plugin: 'model-provider' }],
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

function createFakeCloudWorkerContainer(): ServiceContainer {
  return {
    deploymentRuntime: {
      deployFromSnapshot: async (options: DeployFromSnapshotOptions): Promise<DeployResult> => {
        options.onStackReady?.({ cancel: async () => {} })
        options.onOutput?.('[test] fake pulumi deploy output\n')
        return {
          namespace: options.namespace,
          agentCount: 1,
          config: options.configSnapshot as DeployResult['config'],
          provisionState: {
            provisionedAt: new Date().toISOString(),
            namespace: options.namespace,
            plugins: {
              shadowob: {
                servers: {
                  main: 'server-from-provision-state',
                },
              },
            },
          },
        }
      },
      destroy: async () => {},
    },
  } as unknown as ServiceContainer
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

async function waitForDeploymentStatus(id: string, expectedStatus: string, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs
  let latest: { status: string; errorMessage?: string | null } | null = null

  while (Date.now() < deadline) {
    const detailRes = await req('GET', `/api/cloud-saas/deployments/${id}`)
    if (detailRes.status !== 200) {
      throw new Error(`Failed to fetch deployment ${id}: ${detailRes.status}`)
    }
    latest = (await detailRes.json()) as { status: string; errorMessage?: string | null }
    if (latest.status === expectedStatus) return latest
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  throw new Error(
    `Timed out waiting for deployment ${id} to become ${expectedStatus}; latest=${latest?.status ?? 'unknown'}`,
  )
}

async function waitForBackupStatus(backupId: string, expectedStatus: string, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs
  let latest: string | null = null

  while (Date.now() < deadline) {
    const [backup] = await db
      .select({ status: schema.cloudDeploymentBackups.status })
      .from(schema.cloudDeploymentBackups)
      .where(eq(schema.cloudDeploymentBackups.id, backupId))
      .limit(1)
    latest = backup?.status ?? null
    if (latest === expectedStatus) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  throw new Error(
    `Timed out waiting for backup ${backupId} to become ${expectedStatus}; latest=${latest ?? 'unknown'}`,
  )
}

function jsonModelResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockDiyCloudModel() {
  process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY = 'test-key'
  process.env.SHADOW_DIY_CLOUD_GENERATOR_BASE_URL = 'https://model.test/v1'
  process.env.SHADOW_DIY_CLOUD_GENERATOR_MODEL = 'test-tool-agent'
  const dsl = {
    title: '客服知识库空间',
    description: '读取资料、回答常见问题，并提示缺失资料的客服知识库空间。',
    space: {
      servers: [
        {
          name: '客服知识库',
          channels: [
            { name: '资料库', purpose: '收集客服文档' },
            { name: '常见问题', purpose: '沉淀 FAQ' },
            { name: '人工升级', purpose: '记录需要人工处理的问题' },
          ],
        },
      ],
    },
    buddies: [
      {
        name: '客服知识库 Buddy',
        role: '读取文档、回答 FAQ，并标记缺失资料。',
        systemPrompt: '你是客服知识库 Buddy。优先依据资料回答问题，缺少资料时明确标记并建议补充。',
        skills: ['知识库整理', 'FAQ 回答', '缺口识别'],
        channelBindings: ['资料库', '常见问题', '人工升级'],
      },
    ],
    integrations: [],
    guidebook: {
      summary: '一个用于客服文档沉淀和 FAQ 回答的知识库空间。',
      beforeDeploy: ['准备客服文档和常见问题列表。'],
      howToUse: ['把文档放进资料库频道，再让 Buddy 整理 FAQ。'],
      reviewNotes: ['未选择 Figma，因为需求不涉及设计文件。'],
    },
    review: {
      assumptions: ['客服资料会由用户部署后补充。'],
      risks: [],
      openQuestions: [],
    },
    score: 88,
  }
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      call += 1
      if (call === 1) {
        return jsonModelResponse({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'search-plugins',
                    type: 'function',
                    function: {
                      name: 'search_plugins',
                      arguments: JSON.stringify({ query: '客服 知识库 FAQ 文档', limit: 8 }),
                    },
                  },
                  {
                    id: 'search-templates',
                    type: 'function',
                    function: {
                      name: 'search_templates',
                      arguments: JSON.stringify({ query: 'support knowledge base faq', limit: 5 }),
                    },
                  },
                  {
                    id: 'validate',
                    type: 'function',
                    function: {
                      name: 'validate_template_dsl',
                      arguments: JSON.stringify({ selectedPluginIds: [], dsl }),
                    },
                  },
                ],
              },
            },
          ],
        })
      }
      return jsonModelResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                intent: '搭建客服知识库 Buddy，读取文档、回答常见问题，并提示缺失资料',
                selectedPluginIds: [],
                rejectedPluginIds: ['figma'],
                selectedTemplateSlugs: ['google-workspace-buddy'],
                dsl,
                decisions: [
                  {
                    title: '不选择 Figma',
                    selected: 'shadowob',
                    rationale: '用户需要客服知识库能力，不涉及设计稿或 Figma 文件。',
                    evidence: ['用户输入包含客服、知识库、FAQ'],
                    rejectedOptions: ['figma'],
                    confidence: 0.9,
                  },
                ],
                assumptions: ['客服资料会在部署后补充。'],
                score: 88,
              }),
            },
          },
        ],
      })
    }),
  )
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

/* ── Setup ── */

beforeAll(async () => {
  sql = postgres(TEST_DB_URL)
  db = drizzle(sql, { schema }) as Database
  container = createAppContainer(db)
  app = new Hono()
    .route('/api/cloud-saas', createCloudSaasHandler(container))
    .route('/api/agents', createAgentHandler(container))

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
  await db.insert(schema.inviteCodes).values({
    code: `E2E-${randomUUID().slice(0, 12)}`,
    createdBy: userId,
    usedBy: userId,
    usedAt: new Date(),
    note: 'Cloud SaaS e2e membership',
  })

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
      content: {
        agents: [{ role: 'worker', model: 'gpt-4o-mini' }],
        version: 1,
      },
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
  await closeRedisClient()
})

/* ══════════════════════════════════════════════════════════
   Tests
   ══════════════════════════════════════════════════════════ */

describe('Cloud SaaS — template store', () => {
  it('POST /api/cloud-saas/diy/runs creates a run and streams V2 events', async () => {
    const previousKey = process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY
    const previousBaseUrl = process.env.SHADOW_DIY_CLOUD_GENERATOR_BASE_URL
    const previousModel = process.env.SHADOW_DIY_CLOUD_GENERATOR_MODEL
    mockDiyCloudModel()

    try {
      const createRes = await req('POST', '/api/cloud-saas/diy/runs', {
        prompt: '帮我搭一个客服知识库 Buddy，能读取文档、回答常见问题，并提示缺失资料',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
      })
      expect(createRes.status).toBe(201)
      const createBody = (await createRes.json()) as { runId: string; expiresAt: string }
      expect(createBody.runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      expect(Date.parse(createBody.expiresAt)).toBeGreaterThan(Date.now())

      const res = await req(
        'GET',
        `/api/cloud-saas/diy/runs/${encodeURIComponent(createBody.runId)}/stream`,
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/event-stream')

      const body = await res.text()
      expect(body).toContain('event: run.created')
      expect(body).toContain('event: step.created')
      expect(body).toContain('event: decision')
      expect(body).toContain('event: draft.completed')
      expect(body).not.toContain('docsExcerpt')
      expect(body).not.toContain('Failed query')

      const draftBlock = body
        .split('\n\n')
        .find((block) => block.startsWith('event: draft.completed\n'))
      expect(draftBlock).toBeTruthy()
      const dataLine = draftBlock?.split('\n').find((line) => line.startsWith('data: '))
      const payload = JSON.parse(dataLine!.slice('data: '.length)) as {
        draft: {
          agentOutputs: Array<{ step: string; result: unknown; reasons: unknown[]; raw?: unknown }>
          agentReport: { pluginDecisions: unknown[]; templateDecisions: unknown[] }
          validation: { valid: boolean }
          steps: Array<{ id: string }>
        }
      }
      expect(payload.draft.validation.valid).toBe(true)
      expect(payload.draft.agentOutputs.map((output) => output.step)).toEqual([
        'think',
        'search',
        'generate',
        'validate',
        'review',
      ])
      expect(payload.draft.agentOutputs.every((output) => output.result && !output.raw)).toBe(true)
      expect(payload.draft.agentReport.pluginDecisions.length).toBeGreaterThan(0)
      expect(payload.draft.agentReport.templateDecisions.length).toBeGreaterThan(0)
      expect(payload.draft.steps.map((step) => step.id)).toEqual([
        'think',
        'search',
        'generate',
        'validate',
        'review',
      ])

      const decisionBlocks = body
        .split('\n\n')
        .filter((block) => block.startsWith('event: decision\n'))
      expect(
        decisionBlocks.some((block) => {
          const line = block.split('\n').find((item) => item.startsWith('data: '))
          if (!line) return false
          const event = JSON.parse(line.slice('data: '.length)) as { basis?: unknown }
          return Boolean(event.basis)
        }),
      ).toBe(true)

      const runRes = await req(
        'GET',
        `/api/cloud-saas/diy/runs/${encodeURIComponent(createBody.runId)}`,
      )
      expect(runRes.status).toBe(200)
      const runBody = (await runRes.json()) as {
        run: { status: string; draft?: { validation: { valid: boolean } } }
        events: unknown[]
      }
      expect(runBody.run.status).toBe('completed')
      expect(runBody.events.length).toBeGreaterThan(0)
      expect(runBody.run.draft?.validation.valid).toBe(true)

      const replayRes = await req(
        'GET',
        `/api/cloud-saas/diy/runs/${encodeURIComponent(createBody.runId)}/stream`,
      )
      expect(replayRes.status).toBe(200)
      const replayBody = await replayRes.text()
      expect(replayBody).toContain('event: draft.completed')

      const feedbackRes = await req(
        'POST',
        `/api/cloud-saas/diy/runs/${encodeURIComponent(createBody.runId)}/feedback`,
        {
          feedback: '把知识库入口改成客服值班台，并补充人工升级流程',
        },
      )
      expect(feedbackRes.status).toBe(201)
      const feedbackBody = (await feedbackRes.json()) as { runId: string; sourceRunId: string }
      expect(feedbackBody.sourceRunId).toBe(createBody.runId)
      expect(feedbackBody.runId).not.toBe(createBody.runId)
    } finally {
      restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_API_KEY', previousKey)
      restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_BASE_URL', previousBaseUrl)
      restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_MODEL', previousModel)
      vi.unstubAllGlobals()
    }
  })

  it('GET /api/cloud-saas/diy/runs/:runId/stream closes with structured failure events', async () => {
    const previousKey = process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY
    const previousBaseUrl = process.env.SHADOW_DIY_CLOUD_GENERATOR_BASE_URL
    const previousModel = process.env.SHADOW_DIY_CLOUD_GENERATOR_MODEL
    process.env.SHADOW_DIY_CLOUD_GENERATOR_API_KEY = 'test-key'
    process.env.SHADOW_DIY_CLOUD_GENERATOR_BASE_URL = 'https://model.test/v1'
    process.env.SHADOW_DIY_CLOUD_GENERATOR_MODEL = 'test-tool-agent'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('model unavailable')
      }),
    )

    try {
      const createRes = await req('POST', '/api/cloud-saas/diy/runs', {
        prompt: 'Build a growth space that monitors competitors and connects Google Drive',
        locale: 'en',
        timezone: 'America/Los_Angeles',
      })
      expect(createRes.status).toBe(201)
      const createBody = (await createRes.json()) as { runId: string }

      const res = await req(
        'GET',
        `/api/cloud-saas/diy/runs/${encodeURIComponent(createBody.runId)}/stream`,
      )
      expect(res.status).toBe(200)
      const body = await res.text()

      expect(body).toContain('event: run.failed')
      expect(body).not.toContain('ERR_INCOMPLETE_CHUNKED_ENCODING')
      const failedBlock = body
        .split('\n\n')
        .find((block) => block.startsWith('event: run.failed\n'))
      expect(failedBlock).toBeTruthy()
      const dataLine = failedBlock?.split('\n').find((line) => line.startsWith('data: '))
      const payload = JSON.parse(dataLine!.slice('data: '.length)) as {
        error: string
        retryable: boolean
      }
      expect(payload.error).toContain('model unavailable')
      expect(payload.retryable).toBe(true)

      const runRes = await req(
        'GET',
        `/api/cloud-saas/diy/runs/${encodeURIComponent(createBody.runId)}`,
      )
      expect(runRes.status).toBe(200)
      const runBody = (await runRes.json()) as { run: { status: string; error: string } }
      expect(runBody.run.status).toBe('failed')
      expect(runBody.run.error).toContain('model unavailable')
    } finally {
      restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_API_KEY', previousKey)
      restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_BASE_URL', previousBaseUrl)
      restoreEnv('SHADOW_DIY_CLOUD_GENERATOR_MODEL', previousModel)
      vi.unstubAllGlobals()
    }
  })

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
      const history = (await historyRes.json()) as Array<{
        namespace: string
        name: string
      }>
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

  it('keeps latest failed runtime deployments visible for diagnosis', async () => {
    const namespace = uniqueName('e2e-list-failed-visible')
    try {
      await db.insert(schema.cloudDeployments).values({
        userId,
        namespace,
        name: `${namespace}-agent`,
        status: 'failed',
        errorMessage: 'orphaned-by-cluster',
        agentCount: 1,
        configSnapshot: makeConfigSnapshot('failed-runtime-secret'),
        createdAt: new Date('2099-01-03T00:00:00.000Z'),
        updatedAt: new Date('2099-01-03T00:00:00.000Z'),
      })

      const res = await req('GET', '/api/cloud-saas/deployments?limit=100&offset=0')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Array<{
        namespace: string
        status: string
        errorMessage?: string | null
      }>
      expect(body.find((row) => row.namespace === namespace)).toMatchObject({
        namespace,
        status: 'failed',
        errorMessage: 'orphaned-by-cluster',
      })
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })
})

describe('Cloud SaaS — deployment state consistency', () => {
  it('keeps create, duplicate create, cancel, detail, and current list in one consistent state', async () => {
    const namespace = uniqueName('e2e-state-create')

    try {
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: `${namespace}-agent`,
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: makeConfigSnapshot('state-create-secret'),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as {
        id: string
        namespace: string
        status: string
      }
      expect(created).toMatchObject({ namespace, status: 'pending' })

      const pendingDetailRes = await req('GET', `/api/cloud-saas/deployments/${created.id}`)
      expect(pendingDetailRes.status).toBe(200)
      const pendingDetail = (await pendingDetailRes.json()) as {
        id: string
        status: string
      }
      expect(pendingDetail).toMatchObject({
        id: created.id,
        status: 'pending',
      })

      const pendingListRes = await req('GET', '/api/cloud-saas/deployments?limit=100&offset=0')
      expect(pendingListRes.status).toBe(200)
      const pendingList = (await pendingListRes.json()) as Array<{
        id: string
        namespace: string
        status: string
      }>
      expect(pendingList.filter((row) => row.namespace === namespace)).toEqual([
        expect.objectContaining({ id: created.id, status: 'pending' }),
      ])

      const duplicateRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: `${namespace}-duplicate`,
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: makeConfigSnapshot('state-duplicate-secret'),
      })
      expect(duplicateRes.status).toBe(409)

      const cancelRes = await req('POST', `/api/cloud-saas/deployments/${created.id}/cancel`)
      expect(cancelRes.status).toBe(200)
      const cancelled = (await cancelRes.json()) as {
        ok: boolean
        status: string
      }
      expect(cancelled).toMatchObject({ ok: true, status: 'failed' })

      const cancelledDetailRes = await req('GET', `/api/cloud-saas/deployments/${created.id}`)
      expect(cancelledDetailRes.status).toBe(200)
      const cancelledDetail = (await cancelledDetailRes.json()) as {
        id: string
        status: string
        errorMessage: string | null
      }
      expect(cancelledDetail).toMatchObject({
        id: created.id,
        status: 'failed',
        errorMessage: 'cancelled by user',
      })

      const cancelledListRes = await req('GET', '/api/cloud-saas/deployments?limit=100&offset=0')
      expect(cancelledListRes.status).toBe(200)
      const cancelledList = (await cancelledListRes.json()) as Array<{
        id: string
        namespace: string
        status: string
      }>
      expect(cancelledList.some((row) => row.namespace === namespace)).toBe(false)

      const historyRes = await req(
        'GET',
        '/api/cloud-saas/deployments?includeHistory=1&limit=100&offset=0',
      )
      expect(historyRes.status).toBe(200)
      const history = (await historyRes.json()) as Array<{
        id: string
        namespace: string
      }>
      expect(history.filter((row) => row.namespace === namespace).map((row) => row.id)).toEqual([
        created.id,
      ])
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('claims an unblocked pending deployment through the worker and keeps API state consistent', async () => {
    const namespace = uniqueName('e2e-state-worker')
    const walletBefore = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }

    try {
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: `${namespace}-agent`,
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: makeConfigSnapshot('state-worker-secret'),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as {
        id: string
        namespace: string
        status: string
      }
      expect(created).toMatchObject({ namespace, status: 'pending' })

      const tick = await processCloudDeploymentQueueOnce({
        database: db,
        container: createFakeCloudWorkerContainer(),
        reconcile: false,
        deploymentIds: [created.id],
      })
      expect(tick.pending).toBe(1)

      const detailRes = await req('GET', `/api/cloud-saas/deployments/${created.id}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as {
        id: string
        namespace: string
        status: string
        agentCount: number
        shadowServerId?: string | null
        blockedBy?: unknown
      }
      expect(detail).toMatchObject({
        id: created.id,
        namespace,
        status: 'deployed',
        agentCount: 1,
        shadowServerId: 'server-from-provision-state',
      })
      expect(detail.blockedBy).toBeNull()

      const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
        balance: number
      }
      expect(walletAfter.balance).toBe(walletBefore.balance - 1)

      const txRes = await req('GET', '/api/cloud-saas/wallet/transactions')
      const txBody = (await txRes.json()) as {
        transactions: Array<{ amount: number; referenceId?: string; referenceType?: string }>
      }
      expect(
        txBody.transactions.find(
          (tx) => tx.referenceType === 'cloud_hourly' && tx.referenceId === created.id,
        ),
      ).toMatchObject({ amount: -1 })

      const logs = await db
        .select()
        .from(schema.cloudDeploymentLogs)
        .where(eq(schema.cloudDeploymentLogs.deploymentId, created.id))
      expect(logs.some((log) => log.message.includes('[queue] Deployment queued'))).toBe(true)
      expect(logs.some((log) => log.message.includes('Starting deployment'))).toBe(true)
      expect(logs.some((log) => log.message.includes('fake pulumi deploy output'))).toBe(true)
      expect(logs.some((log) => log.message.includes('Deployment complete'))).toBe(true)
      expect(logs.some((log) => log.message.includes('first hourly runtime unit'))).toBe(true)
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('interrupts an active deploy when DELETE queues destroy for the same deployment', async () => {
    const namespace = uniqueName('e2e-state-destroy-active')
    let resolveDeployStarted: (() => void) | undefined
    const deployStarted = new Promise<void>((resolve) => {
      resolveDeployStarted = resolve
    })
    let stackCancelCalls = 0
    let destroyCalls = 0
    const slowContainer = {
      deploymentRuntime: {
        deployFromSnapshot: async (options: DeployFromSnapshotOptions): Promise<DeployResult> => {
          options.onStackReady?.({
            cancel: async () => {
              stackCancelCalls += 1
            },
          })
          options.onOutput?.('[test] fake slow deploy output\n')
          resolveDeployStarted?.()

          const deadline = Date.now() + 1_500
          while (!options.isCancelled?.()) {
            if (Date.now() > deadline) {
              throw new Error('timed out waiting for destroy cancellation')
            }
            await new Promise((resolve) => setTimeout(resolve, 10))
          }

          return {
            namespace: options.namespace,
            agentCount: 1,
            config: options.configSnapshot as DeployResult['config'],
          }
        },
        destroy: async () => {
          destroyCalls += 1
        },
      },
    } as unknown as ServiceContainer

    try {
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: `${namespace}-agent`,
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: makeConfigSnapshot('state-destroy-active-secret'),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as {
        id: string
        namespace: string
        status: string
      }
      expect(created).toMatchObject({ namespace, status: 'pending' })

      const tick = processCloudDeploymentQueueOnce({
        database: db,
        container: slowContainer,
        reconcile: false,
        deploymentIds: [created.id],
      })
      await deployStarted

      const destroyRes = await req('DELETE', `/api/cloud-saas/deployments/${created.id}`)
      expect(destroyRes.status).toBe(200)
      const destroyBody = (await destroyRes.json()) as {
        ok: boolean
        taskId: string
        status: string
      }
      expect(destroyBody).toMatchObject({
        ok: true,
        taskId: created.id,
        status: 'destroying',
      })

      await tick

      const detailRes = await req('GET', `/api/cloud-saas/deployments/${created.id}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as {
        status: string
        errorMessage?: string | null
      }
      expect(detail).toMatchObject({ status: 'destroyed', errorMessage: null })
      expect(stackCancelCalls).toBe(1)
      expect(destroyCalls).toBe(1)

      const logs = await db
        .select()
        .from(schema.cloudDeploymentLogs)
        .where(eq(schema.cloudDeploymentLogs.deploymentId, created.id))
      expect(
        logs.some((log) =>
          log.message.includes('Signal sent to in-progress operation so destroy can proceed'),
        ),
      ).toBe(true)
      expect(
        logs.some((log) => log.message.includes('Cancelled active deploy so destroy can proceed')),
      ).toBe(true)
      expect(logs.some((log) => log.message.includes('Starting destroy'))).toBe(true)
      expect(logs.some((log) => log.message.includes('Destroy complete'))).toBe(true)
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('keeps destroy as a durable current task while the old deployment remains queryable history', async () => {
    const namespace = uniqueName('e2e-state-destroy')
    const deployedAt = new Date(Date.now() - 60_000)

    try {
      const [current] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('state-destroy-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
          createdAt: deployedAt,
          updatedAt: deployedAt,
        })
        .returning()
      expect(current).toBeDefined()

      const destroyRes = await req('DELETE', `/api/cloud-saas/deployments/${current!.id}`)
      expect(destroyRes.status).toBe(200)
      const destroyBody = (await destroyRes.json()) as {
        ok: boolean
        taskId: string
        status: string
      }
      expect(destroyBody.ok).toBe(true)
      expect(destroyBody.taskId).toBe(current!.id)
      expect(destroyBody.status).toBe('destroying')

      const currentListRes = await req('GET', '/api/cloud-saas/deployments?limit=100&offset=0')
      expect(currentListRes.status).toBe(200)
      const currentList = (await currentListRes.json()) as Array<{
        id: string
        namespace: string
        status: string
      }>
      expect(currentList.filter((row) => row.namespace === namespace)).toEqual([
        expect.objectContaining({
          id: destroyBody.taskId,
          status: 'destroying',
        }),
      ])

      const historyRes = await req(
        'GET',
        '/api/cloud-saas/deployments?includeHistory=1&limit=100&offset=0',
      )
      expect(historyRes.status).toBe(200)
      const history = (await historyRes.json()) as Array<{
        id: string
        namespace: string
        status: string
      }>
      expect(history.filter((row) => row.namespace === namespace).map((row) => row.id)).toEqual([
        current!.id,
      ])

      const destroyDetailRes = await req('GET', `/api/cloud-saas/deployments/${destroyBody.taskId}`)
      expect(destroyDetailRes.status).toBe(200)
      const destroyDetail = (await destroyDetailRes.json()) as {
        id: string
        namespace: string
        status: string
      }
      expect(destroyDetail).toMatchObject({
        id: destroyBody.taskId,
        namespace,
        status: 'destroying',
      })

      const secondDestroyRes = await req('DELETE', `/api/cloud-saas/deployments/${current!.id}`)
      expect(secondDestroyRes.status).toBe(200)
      const secondDestroy = (await secondDestroyRes.json()) as {
        ok: boolean
        taskId: string
      }
      expect(secondDestroy).toMatchObject({
        ok: true,
        taskId: destroyBody.taskId,
      })

      const redeployOldRes = await req(
        'POST',
        `/api/cloud-saas/deployments/${current!.id}/redeploy`,
      )
      expect(redeployOldRes.status).toBe(422)

      const logs = await db
        .select()
        .from(schema.cloudDeploymentLogs)
        .where(eq(schema.cloudDeploymentLogs.deploymentId, destroyBody.taskId))
      expect(logs.some((log) => log.message.includes('Queued Pulumi destroy'))).toBe(true)
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('records the blocking task when destroy is queued behind an older active operation', async () => {
    const namespace = uniqueName('e2e-state-blocked-destroy')
    const blockerAt = new Date(Date.now() - 120_000)
    const deployedAt = new Date(Date.now() - 60_000)

    try {
      const [blocker] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-blocker`,
          status: 'deploying',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('state-blocker-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
          createdAt: blockerAt,
          updatedAt: blockerAt,
        })
        .returning()
      const [current] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-current`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('state-blocked-destroy-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
          createdAt: deployedAt,
          updatedAt: deployedAt,
        })
        .returning()

      const destroyRes = await req('DELETE', `/api/cloud-saas/deployments/${current!.id}`)
      expect(destroyRes.status).toBe(200)
      const destroyBody = (await destroyRes.json()) as {
        taskId: string
        status: string
      }
      expect(destroyBody.status).toBe('destroying')
      expect(destroyBody.taskId).toBe(current!.id)

      const logs = await db
        .select()
        .from(schema.cloudDeploymentLogs)
        .where(eq(schema.cloudDeploymentLogs.deploymentId, destroyBody.taskId))
      expect(
        logs.some((log) => log.message.includes('[queue]') && log.message.includes(blocker!.id)),
      ).toBe(true)

      const detailRes = await req('GET', `/api/cloud-saas/deployments/${destroyBody.taskId}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as {
        id: string
        blockedBy?: { id: string; status: string; namespace: string } | null
      }
      expect(detail.blockedBy).toMatchObject({
        id: blocker!.id,
        status: 'deploying',
        namespace,
      })

      const currentListRes = await req('GET', '/api/cloud-saas/deployments?limit=100&offset=0')
      expect(currentListRes.status).toBe(200)
      const currentList = (await currentListRes.json()) as Array<{
        id: string
        namespace: string
        status: string
      }>
      expect(currentList.filter((row) => row.namespace === namespace)).toEqual([
        expect.objectContaining({
          id: destroyBody.taskId,
          status: 'destroying',
        }),
      ])
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('cancels a stale active blocker without waiting for the namespace operation lock', async () => {
    const namespace = uniqueName('e2e-state-cancel-blocker')
    const blockerAt = new Date(Date.now() - 120_000)
    const currentAt = new Date(Date.now() - 60_000)

    try {
      const [blocker] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-blocker`,
          status: 'deploying',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('cancel-blocker-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
          createdAt: blockerAt,
          updatedAt: blockerAt,
        })
        .returning()
      const [current] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-current`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('cancel-blocker-current-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
          createdAt: currentAt,
          updatedAt: currentAt,
        })
        .returning()

      const destroyRes = await req('DELETE', `/api/cloud-saas/deployments/${current!.id}`)
      expect(destroyRes.status).toBe(200)
      const destroyBody = (await destroyRes.json()) as { taskId: string }

      const cancelBlockerRes = await req(
        'POST',
        `/api/cloud-saas/deployments/${blocker!.id}/cancel`,
      )
      expect(cancelBlockerRes.status).toBe(200)
      const cancelBlocker = (await cancelBlockerRes.json()) as {
        ok: boolean
        status: string
      }
      expect(cancelBlocker).toMatchObject({ ok: true, status: 'failed' })

      const blockerDetailRes = await req('GET', `/api/cloud-saas/deployments/${blocker!.id}`)
      expect(blockerDetailRes.status).toBe(200)
      const blockerDetail = (await blockerDetailRes.json()) as {
        status: string
        errorMessage: string | null
      }
      expect(blockerDetail).toMatchObject({
        status: 'failed',
        errorMessage: 'cancelled by user',
      })

      const destroyDetailRes = await req('GET', `/api/cloud-saas/deployments/${destroyBody.taskId}`)
      expect(destroyDetailRes.status).toBe(200)
      const destroyDetail = (await destroyDetailRes.json()) as {
        status: string
        blockedBy?: { id: string } | null
      }
      expect(destroyDetail.status).toBe('destroying')
      expect(destroyDetail.blockedBy).toBeNull()

      const cancelDestroyRes = await req(
        'POST',
        `/api/cloud-saas/deployments/${destroyBody.taskId}/cancel`,
      )
      expect(cancelDestroyRes.status).toBe(200)
      const cancelDestroy = (await cancelDestroyRes.json()) as {
        ok: boolean
        status: string
      }
      expect(cancelDestroy.ok).toBe(true)
      expect(['cancelling', 'failed']).toContain(cancelDestroy.status)

      const cancelledDestroy = await waitForDeploymentStatus(destroyBody.taskId, 'failed')
      expect(cancelledDestroy.errorMessage).toBe('cancelled by user')

      const redeployRes = await req('POST', `/api/cloud-saas/deployments/${current!.id}/redeploy`)
      expect(redeployRes.status).toBe(201)
      const redeployed = (await redeployRes.json()) as { namespace: string; status: string }
      expect(redeployed).toMatchObject({ namespace, status: 'pending' })
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('cancels a queued task so it no longer contributes to namespace deadlock', async () => {
    const namespace = uniqueName('e2e-state-cancel-queued')
    const blockerAt = new Date(Date.now() - 120_000)
    const queuedAt = new Date(Date.now() - 60_000)

    try {
      const [blocker] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-blocker`,
          status: 'deploying',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('cancel-queued-blocker-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
          createdAt: blockerAt,
          updatedAt: blockerAt,
        })
        .returning()
      const [queued] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-queued`,
          status: 'pending',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('cancel-queued-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
          createdAt: queuedAt,
          updatedAt: queuedAt,
        })
        .returning()

      const queuedDetailRes = await req('GET', `/api/cloud-saas/deployments/${queued!.id}`)
      expect(queuedDetailRes.status).toBe(200)
      const queuedDetail = (await queuedDetailRes.json()) as {
        blockedBy?: { id: string; status: string } | null
      }
      expect(queuedDetail.blockedBy).toMatchObject({ id: blocker!.id, status: 'deploying' })

      const cancelQueuedRes = await req('POST', `/api/cloud-saas/deployments/${queued!.id}/cancel`)
      expect(cancelQueuedRes.status).toBe(200)
      const cancelQueued = (await cancelQueuedRes.json()) as {
        ok: boolean
        status: string
      }
      expect(cancelQueued).toMatchObject({ ok: true, status: 'failed' })

      const cancelledQueuedRes = await req('GET', `/api/cloud-saas/deployments/${queued!.id}`)
      expect(cancelledQueuedRes.status).toBe(200)
      const cancelledQueued = (await cancelledQueuedRes.json()) as {
        status: string
        errorMessage: string | null
        blockedBy?: unknown
      }
      expect(cancelledQueued).toMatchObject({
        status: 'failed',
        errorMessage: 'cancelled by user',
      })
      expect(cancelledQueued.blockedBy).toBeNull()
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('hides destroyed namespaces from the current list without breaking history or detail lookup', async () => {
    const namespace = uniqueName('e2e-state-destroyed')

    try {
      const [destroyed] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'destroyed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('state-destroyed-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
        })
        .returning()

      const currentListRes = await req('GET', '/api/cloud-saas/deployments?limit=100&offset=0')
      expect(currentListRes.status).toBe(200)
      const currentList = (await currentListRes.json()) as Array<{
        namespace: string
      }>
      expect(currentList.some((row) => row.namespace === namespace)).toBe(false)

      const historyRes = await req(
        'GET',
        '/api/cloud-saas/deployments?includeHistory=1&limit=100&offset=0',
      )
      expect(historyRes.status).toBe(200)
      const history = (await historyRes.json()) as Array<{
        id: string
        namespace: string
        status: string
      }>
      expect(history.filter((row) => row.namespace === namespace)).toEqual([
        expect.objectContaining({ id: destroyed!.id, status: 'destroyed' }),
      ])

      const detailRes = await req('GET', `/api/cloud-saas/deployments/${destroyed!.id}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as { id: string; status: string }
      expect(detail).toMatchObject({ id: destroyed!.id, status: 'destroyed' })
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('keeps deployment logs readable after destroyed pods disappear', async () => {
    const namespace = uniqueName('e2e-destroyed-logs')
    const k8sGateway = container.resolve('kubernetesOpsGateway')
    const listPodsSpy = vi.spyOn(k8sGateway, 'listPods').mockResolvedValue([])
    const readPodLogsSpy = vi
      .spyOn(k8sGateway, 'readPodLogs')
      .mockRejectedValue(new Error('pods not found'))

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'destroyed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('destroyed-logs-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
        })
        .returning()

      await db.insert(schema.cloudDeploymentLogs).values([
        {
          deploymentId: deployment!.id,
          level: 'info',
          message: 'Starting destroy: stale pod test',
        },
        {
          deploymentId: deployment!.id,
          level: 'info',
          message: 'Destroy complete!',
        },
      ])

      const podsRes = await req('GET', `/api/cloud-saas/deployments/${deployment!.id}/pods`)
      expect(podsRes.status).toBe(200)
      await expect(podsRes.json()).resolves.toEqual({ pods: [] })

      const logsRes = await req(
        'GET',
        `/api/cloud-saas/deployments/${deployment!.id}/logs/history?pod=stale-pod&limit=20`,
      )
      expect(logsRes.status).toBe(200)
      const logs = (await logsRes.json()) as {
        lines: string[]
        warning?: string
      }
      expect(logs.lines).toContain('[INFO] Destroy complete!')
      expect(logs.warning).toContain('pods not found')
    } finally {
      listPodsSpy.mockRestore()
      readPodLogsSpy.mockRestore()
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

  it('lets the author read env refs and deploy their own draft template', async () => {
    const slug = uniqueName('e2e-owned-draft-template')
    const namespace = uniqueName('e2e-owned-draft-ns')
    let otherUserId: string | null = null

    try {
      const createRes = await req('POST', '/api/cloud-saas/templates', {
        slug,
        name: 'E2E Owned Draft Template',
        description: 'Draft template owned by integration test user',
        content: makeConfigSnapshot('${env:OPENAI_API_KEY}'),
        tags: ['test'],
        category: 'test',
        baseCost: 0,
      })
      expect(createRes.status).toBe(201)

      const detailRes = await req('GET', `/api/cloud-saas/templates/${slug}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as {
        slug: string
        reviewStatus: string
        authorId: string
      }
      expect(detail).toMatchObject({
        slug,
        reviewStatus: 'draft',
        authorId: userId,
      })

      const envRefsRes = await req('GET', `/api/cloud-saas/templates/${slug}/env-refs`)
      expect(envRefsRes.status).toBe(200)
      const envRefs = (await envRefsRes.json()) as { requiredEnvVars: string[] }
      expect(envRefs.requiredEnvVars).toContain('OPENAI_API_KEY')

      const deployRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: `${namespace}-agent`,
        templateSlug: slug,
        resourceTier: 'lightweight',
        configSnapshot: makeConfigSnapshot('owned-draft-secret'),
      })
      expect(deployRes.status).toBe(201)
      const deployment = (await deployRes.json()) as {
        namespace: string
        templateSlug: string
        status: string
      }
      expect(deployment).toMatchObject({
        namespace,
        templateSlug: slug,
        status: 'pending',
      })

      const [otherUser] = await db
        .insert(schema.users)
        .values({
          email: `saas-other-template-${Date.now()}@example.com`,
          displayName: 'Other Template User',
          username: uniqueName('saas-other-template'),
          passwordHash: 'test-hash',
        })
        .returning()
      otherUserId = otherUser!.id
      const otherToken = signAccessToken({
        userId: otherUser!.id,
        email: otherUser!.email,
        username: otherUser!.username,
      })

      const otherDetailRes = await req(
        'GET',
        `/api/cloud-saas/templates/${slug}`,
        undefined,
        otherToken,
      )
      expect(otherDetailRes.status).toBe(404)

      const otherDeployRes = await req(
        'POST',
        '/api/cloud-saas/deployments',
        {
          namespace: uniqueName('e2e-other-owned-draft-ns'),
          name: 'other-owned-draft-agent',
          templateSlug: slug,
          resourceTier: 'lightweight',
          configSnapshot: makeConfigSnapshot('other-draft-secret'),
        },
        otherToken,
      )
      expect(otherDeployRes.status).toBe(404)
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
      if (otherUserId) {
        await db
          .delete(schema.users)
          .where(eq(schema.users.id, otherUserId))
          .catch(() => {})
      }
    }
  })
})

describe('Cloud SaaS — deployment + billing', () => {
  it('POST /api/cloud-saas/deployments/:id/backups falls back to object archive when PVC is not CSI-backed', async () => {
    const namespace = uniqueName('e2e-backup-pvc-driver-ns')
    vi.mocked(cloudRuntime.isVolumeSnapshotApiAvailable).mockResolvedValueOnce(true)
    vi.mocked(cloudRuntime.getPvcVolumeSnapshotCapability).mockResolvedValueOnce({
      storageClassName: 'standard',
      provisioner: 'rancher.io/local-path',
      isCsi: false,
      volumeSnapshotClassName: null,
    })
    const putObjectSpy = vi
      .spyOn(container.resolve('mediaService'), 'putPrivateObject')
      .mockResolvedValueOnce()

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: 'agent-1',
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('backup-pvc-driver-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
        })
        .returning()

      const res = await req('POST', `/api/cloud-saas/deployments/${deployment!.id}/backups`, {})
      expect(res.status).toBe(202)
      const body = (await res.json()) as {
        ok: boolean
        backup: { id: string; driver: string; pvcName: string; objectKey: string | null }
      }
      expect(body.ok).toBe(true)
      expect(body.backup.driver).toBe('restic')
      expect(body.backup.pvcName).toBe('openclaw-data-agent-1')
      expect(body.backup.objectKey).toContain(`/agent-1/`)
      expect(cloudRuntime.isVolumeSnapshotApiAvailable).toHaveBeenCalled()
      expect(cloudRuntime.getPvcVolumeSnapshotCapability).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace,
          pvcName: 'openclaw-data-agent-1',
        }),
      )
      await waitForBackupStatus(body.backup.id, 'succeeded')
    } finally {
      putObjectSpy.mockRestore()
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments/:id/backups rejects explicit VolumeSnapshot when PVC is not CSI-backed', async () => {
    const namespace = uniqueName('e2e-backup-snapshot-pvc-ns')
    vi.mocked(cloudRuntime.isVolumeSnapshotApiAvailable).mockResolvedValueOnce(true)
    vi.mocked(cloudRuntime.getPvcVolumeSnapshotCapability).mockResolvedValueOnce({
      storageClassName: 'standard',
      provisioner: 'rancher.io/local-path',
      isCsi: false,
      volumeSnapshotClassName: null,
    })

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: 'agent-1',
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('backup-snapshot-pvc-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
        })
        .returning()

      const res = await req('POST', `/api/cloud-saas/deployments/${deployment!.id}/backups`, {
        driver: 'volumeSnapshot',
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { ok: boolean; error: string }
      expect(body).toEqual({
        ok: false,
        error:
          'PVC "openclaw-data-agent-1" is not backed by a CSI StorageClass that supports VolumeSnapshot',
      })
      expect(cloudRuntime.isVolumeSnapshotApiAvailable).toHaveBeenCalled()
      expect(cloudRuntime.getPvcVolumeSnapshotCapability).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace,
          pvcName: 'openclaw-data-agent-1',
        }),
      )
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments/:id/backups passes the resolved VolumeSnapshotClass to snapshot creation', async () => {
    const namespace = uniqueName('e2e-backup-snapshot-class-ns')
    vi.mocked(cloudRuntime.isVolumeSnapshotApiAvailable).mockResolvedValueOnce(true)
    vi.mocked(cloudRuntime.getPvcVolumeSnapshotCapability).mockResolvedValueOnce({
      storageClassName: 'csi-hostpath-sc',
      provisioner: 'hostpath.csi.k8s.io',
      isCsi: true,
      volumeSnapshotClassName: 'csi-hostpath-snapclass',
    })

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: 'agent-1',
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('backup-snapshot-class-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
        })
        .returning()

      const res = await req('POST', `/api/cloud-saas/deployments/${deployment!.id}/backups`, {})
      expect(res.status).toBe(202)
      const body = (await res.json()) as {
        ok: boolean
        backup: { id: string; driver: string; snapshotName: string | null }
      }
      expect(body.ok).toBe(true)
      expect(body.backup.driver).toBe('volumeSnapshot')
      await waitForBackupStatus(body.backup.id, 'succeeded')
      expect(cloudRuntime.createVolumeSnapshotBackupAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace,
          pvcName: 'openclaw-data-agent-1',
          snapshotName: body.backup.snapshotName,
          volumeSnapshotClassName: 'csi-hostpath-snapclass',
        }),
      )
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments/:id/restore rejects historical deployment instances', async () => {
    const namespace = uniqueName('e2e-restore-history-ns')
    const now = new Date()

    try {
      const [historical] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent-old`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('restore-history-old-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
          createdAt: new Date(now.getTime() - 60_000),
          updatedAt: new Date(now.getTime() - 60_000),
        })
        .returning()
      await db.insert(schema.cloudDeployments).values({
        userId,
        namespace,
        name: `${namespace}-agent-current`,
        status: 'deployed',
        agentCount: 1,
        configSnapshot: makeConfigSnapshot('restore-history-current-secret'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        monthlyCost: 0,
        hourlyCost: 1,
        saasMode: true,
        createdAt: now,
        updatedAt: now,
      })

      const res = await req('POST', `/api/cloud-saas/deployments/${historical!.id}/restore`, {})
      expect(res.status).toBe(409)
      const body = (await res.json()) as { ok: boolean; error: string }
      expect(body).toEqual({
        ok: false,
        error: 'Cannot restore a historical deployment instance',
      })
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments/:id/restore rejects active deployment states', async () => {
    const namespace = uniqueName('e2e-restore-active-ns')

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'resuming',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('restore-active-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
        })
        .returning()

      const res = await req('POST', `/api/cloud-saas/deployments/${deployment!.id}/restore`, {})
      expect(res.status).toBe(422)
      const body = (await res.json()) as { ok: boolean; error: string }
      expect(body).toEqual({
        ok: false,
        error: 'Cannot restore deployment in status "resuming"',
      })
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments/:id/restore rejects non-succeeded backups', async () => {
    const namespace = uniqueName('e2e-restore-backup-status-ns')

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: 'agent-1',
          status: 'paused',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('restore-backup-status-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
        })
        .returning()
      const [backup] = await db
        .insert(schema.cloudDeploymentBackups)
        .values({
          userId,
          deploymentId: deployment!.id,
          namespace,
          agentId: 'agent-1',
          sandboxName: 'agent-1',
          pvcName: 'openclaw-data-agent-1',
          driver: 'restic',
          objectKey: 'backups/test-running.tar.gz',
          status: 'running',
        })
        .returning()

      const res = await req('POST', `/api/cloud-saas/deployments/${deployment!.id}/restore`, {
        backupId: backup!.id,
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { ok: boolean; error: string }
      expect(body).toEqual({
        ok: false,
        error: 'Cannot restore backup in status "running"',
      })
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments/:id/restore returns 409 when a namespace operation is locked', async () => {
    const namespace = uniqueName('e2e-restore-lock-ns')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const lockSpy = vi.spyOn(deploymentDao, 'tryAcquireOperationLock').mockResolvedValueOnce(false)

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: 'agent-1',
          status: 'paused',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('restore-lock-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          saasMode: true,
        })
        .returning()
      const [backup] = await db
        .insert(schema.cloudDeploymentBackups)
        .values({
          userId,
          deploymentId: deployment!.id,
          namespace,
          agentId: 'agent-1',
          sandboxName: 'agent-1',
          pvcName: 'openclaw-data-agent-1',
          driver: 'restic',
          objectKey: 'backups/test-lock.tar.gz',
          status: 'succeeded',
        })
        .returning()

      const res = await req('POST', `/api/cloud-saas/deployments/${deployment!.id}/restore`, {
        backupId: backup!.id,
      })
      expect(res.status).toBe(409)
      const body = (await res.json()) as { ok: boolean; error: string }
      expect(body).toEqual({
        ok: false,
        error: 'Another deployment operation is already running in this namespace',
      })
    } finally {
      lockSpy.mockRestore()
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

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
      expect(runtime.SHADOW_USER_TOKEN).toBeUndefined()
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

  it('POST /api/cloud-saas/deployments accepts direct template env refs', async () => {
    const slug = uniqueName('e2e-direct-env')
    const directEnvKey = 'CODE_TRAINER_MANIFEST_URL'
    const directEnvValue = 'https://trainer.example.test/.well-known/shadow-app.json'

    try {
      await db.insert(schema.cloudTemplates).values({
        slug,
        name: 'E2E Direct Env Template',
        description: 'Template with a direct env ref outside plugin auth fields',
        source: 'official',
        reviewStatus: 'approved',
        content: {
          version: '1',
          name: slug,
          deployments: {
            namespace: slug,
            agents: [
              {
                id: 'agent-1',
                runtime: 'docker',
                env: {
                  [directEnvKey]: `\${env:${directEnvKey}}`,
                },
                configuration: {},
              },
            ],
          },
        },
        tags: ['test'],
        category: 'test',
        baseCost: 0,
      })

      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace: uniqueName('e2e-direct-env-ns'),
        name: uniqueName('e2e-direct-env-deploy'),
        templateSlug: slug,
        resourceTier: 'lightweight',
        configSnapshot: {},
        envVars: {
          [directEnvKey]: directEnvValue,
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
      expect(runtime[directEnvKey]).toBe(directEnvValue)
    } finally {
      await db
        .delete(schema.cloudTemplates)
        .where(eq(schema.cloudTemplates.slug, slug))
        .catch(() => {})
    }
  })

  it('POST /api/cloud-saas/deployments persists deployment locale and timezone context', async () => {
    const createRes = await req('POST', '/api/cloud-saas/deployments', {
      namespace: uniqueName('e2e-runtime-context-ns'),
      name: uniqueName('e2e-runtime-context-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: makeConfigSnapshot('runtime-context-secret'),
      runtimeContext: {
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
      },
    })

    expect(createRes.status).toBe(201)
    const deployment = (await createRes.json()) as {
      id: string
      configSnapshot: { __shadowobRuntime?: unknown }
    }
    expect(deployment.configSnapshot.__shadowobRuntime).toBeUndefined()

    const [stored] = await db
      .select()
      .from(schema.cloudDeployments)
      .where(eq(schema.cloudDeployments.id, deployment.id))
      .limit(1)

    const runtime = extractCloudSaasRuntime(stored?.configSnapshot)
    expect(runtime.context).toEqual({
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
    })
    expect(runtime.configSnapshot?.locale).toBe('zh-CN')
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

    const createRes = await req('POST', '/api/cloud-saas/deployments', {
      namespace: uniqueName('e2e-provider-env-ns'),
      name: uniqueName('e2e-provider-env-deploy'),
      templateSlug: officialTemplateSlug,
      resourceTier: 'lightweight',
      configSnapshot: {
        ...makeConfigSnapshot('provider-runtime-secret'),
        use: [{ plugin: 'model-provider' }],
        [CLOUD_SAAS_RUNTIME_KEY]: {
          modelProviderMode: 'custom',
        },
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
    expect(runtime.DEEPSEEK_API_KEY).toBeUndefined()
  })

  it('POST /api/cloud-saas/deployments defaults model-provider templates to official proxy when configured', async () => {
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    const previousModel = process.env.SHADOW_MODEL_PROXY_MODEL
    const previousProxyEnabled = process.env.SHADOW_MODEL_PROXY_ENABLED
    const previousUpstreamBaseUrl = process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    const previousUpstreamApiKey = process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
    process.env.SHADOW_SERVER_URL = 'http://shadow.test'
    process.env.SHADOW_MODEL_PROXY_MODEL = 'deepseek-v4-flash'
    process.env.SHADOW_MODEL_PROXY_ENABLED = 'true'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = 'https://model.example/v1'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = 'official-upstream-secret'

    try {
      const saveBaseUrlRes = await req('PUT', '/api/cloud-saas/global-envvars', {
        key: 'OPENAI_COMPATIBLE_BASE_URL',
        value: 'https://stale-compatible.example.test/v1',
      })
      expect(saveBaseUrlRes.status).toBe(200)

      const saveApiKeyRes = await req('PUT', '/api/cloud-saas/global-envvars', {
        key: 'OPENAI_COMPATIBLE_API_KEY',
        value: 'stale-compatible-key',
      })
      expect(saveApiKeyRes.status).toBe(200)

      const namespace = uniqueName('e2e-official-default-provider-ns')
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: uniqueName('e2e-official-default-provider-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: {
          ...makeConfigSnapshot('official-default-provider-secret'),
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
      expect(runtime.SHADOW_MODEL_PROVIDER_ID).toBe('shadow-official')
      expect(runtime.OPENAI_COMPATIBLE_BASE_URL).toBe('http://shadow.test/api/ai/v1')
      expect(runtime.OPENAI_COMPATIBLE_API_KEY).toMatch(/^smp_/)
      expect(runtime.OPENAI_COMPATIBLE_API_KEY).not.toBe('stale-compatible-key')
      expect(runtime.OPENAI_COMPATIBLE_MODEL_ID).toBe('deepseek-v4-flash')
      expect(runtime.ANTHROPIC_COMPATIBLE_BASE_URL).toBe('http://shadow.test/api/ai/anthropic')
      expect(runtime.ANTHROPIC_COMPATIBLE_API_KEY).toMatch(/^smp_/)
      expect(runtime.ANTHROPIC_COMPATIBLE_MODEL_ID).toBe('deepseek-v4-flash')
      expect(runtime.OPENAI_API_KEY).toBeUndefined()
    } finally {
      if (previousShadowServerUrl === undefined) delete process.env.SHADOW_SERVER_URL
      else process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      if (previousModel === undefined) delete process.env.SHADOW_MODEL_PROXY_MODEL
      else process.env.SHADOW_MODEL_PROXY_MODEL = previousModel
      if (previousProxyEnabled === undefined) delete process.env.SHADOW_MODEL_PROXY_ENABLED
      else process.env.SHADOW_MODEL_PROXY_ENABLED = previousProxyEnabled
      if (previousUpstreamBaseUrl === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = previousUpstreamBaseUrl
      if (previousUpstreamApiKey === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = previousUpstreamApiKey
    }
  })

  it('POST /api/cloud-saas/deployments injects official proxy env for official model mode', async () => {
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    const previousModel = process.env.SHADOW_MODEL_PROXY_MODEL
    const previousProxyEnabled = process.env.SHADOW_MODEL_PROXY_ENABLED
    const previousUpstreamBaseUrl = process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    const previousUpstreamApiKey = process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
    process.env.SHADOW_SERVER_URL = 'http://shadow.test'
    process.env.SHADOW_MODEL_PROXY_MODEL = 'deepseek-v4-flash'
    process.env.SHADOW_MODEL_PROXY_ENABLED = 'true'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = 'https://model.example/v1'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = 'official-upstream-secret'

    try {
      const namespace = uniqueName('e2e-official-provider-ns')
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: uniqueName('e2e-official-provider-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: {
          ...makeConfigSnapshot('official-provider-secret'),
          use: [{ plugin: 'model-provider' }],
          [CLOUD_SAAS_RUNTIME_KEY]: {
            modelProviderMode: 'official',
          },
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
      expect(runtime.SHADOW_MODEL_PROVIDER_ID).toBe('shadow-official')
      expect(runtime.OPENAI_COMPATIBLE_BASE_URL).toBe('http://shadow.test/api/ai/v1')
      expect(runtime.OPENAI_COMPATIBLE_API_KEY).toMatch(/^smp_/)
      expect(runtime.OPENAI_COMPATIBLE_API_KEY).not.toBe('user-supplied-key')
      expect(runtime.OPENAI_COMPATIBLE_MODEL_ID).toBe('deepseek-v4-flash')
      expect(runtime.ANTHROPIC_COMPATIBLE_BASE_URL).toBe('http://shadow.test/api/ai/anthropic')
      expect(runtime.ANTHROPIC_COMPATIBLE_API_KEY).toMatch(/^smp_/)
      expect(runtime.ANTHROPIC_COMPATIBLE_MODEL_ID).toBe('deepseek-v4-flash')
      expect(runtime.DEEPSEEK_API_KEY).toBeUndefined()
    } finally {
      if (previousShadowServerUrl === undefined) delete process.env.SHADOW_SERVER_URL
      else process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      if (previousModel === undefined) delete process.env.SHADOW_MODEL_PROXY_MODEL
      else process.env.SHADOW_MODEL_PROXY_MODEL = previousModel
      if (previousProxyEnabled === undefined) delete process.env.SHADOW_MODEL_PROXY_ENABLED
      else process.env.SHADOW_MODEL_PROXY_ENABLED = previousProxyEnabled
      if (previousUpstreamBaseUrl === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = previousUpstreamBaseUrl
      if (previousUpstreamApiKey === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = previousUpstreamApiKey
    }
  })

  it('POST /api/cloud-saas/deployments uses pod-reachable Shadow URL for official proxy config', async () => {
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    const previousShadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
    const previousModel = process.env.SHADOW_MODEL_PROXY_MODEL
    const previousProxyEnabled = process.env.SHADOW_MODEL_PROXY_ENABLED
    const previousUpstreamBaseUrl = process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    const previousUpstreamApiKey = process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
    process.env.SHADOW_SERVER_URL = 'http://host.lima.internal:3002'
    process.env.SHADOW_AGENT_SERVER_URL = 'https://shadow.example.com'
    process.env.SHADOW_MODEL_PROXY_MODEL = 'deepseek-v4-flash'
    process.env.SHADOW_MODEL_PROXY_ENABLED = 'true'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = 'https://model.example/v1'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = 'official-upstream-secret'

    try {
      const namespace = uniqueName('e2e-official-pod-url-ns')
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace,
        name: uniqueName('e2e-official-pod-url-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: {
          ...makeConfigSnapshot('official-pod-url-secret'),
          use: [{ plugin: 'model-provider' }],
          [CLOUD_SAAS_RUNTIME_KEY]: {
            modelProviderMode: 'official',
          },
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
      expect(runtime.OPENAI_COMPATIBLE_BASE_URL).toBe('https://shadow.example.com/api/ai/v1')
      expect(runtime.OPENAI_COMPATIBLE_API_KEY).toMatch(/^smp_/)
    } finally {
      if (previousShadowServerUrl === undefined) delete process.env.SHADOW_SERVER_URL
      else process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      if (previousShadowAgentServerUrl === undefined) delete process.env.SHADOW_AGENT_SERVER_URL
      else process.env.SHADOW_AGENT_SERVER_URL = previousShadowAgentServerUrl
      if (previousModel === undefined) delete process.env.SHADOW_MODEL_PROXY_MODEL
      else process.env.SHADOW_MODEL_PROXY_MODEL = previousModel
      if (previousProxyEnabled === undefined) delete process.env.SHADOW_MODEL_PROXY_ENABLED
      else process.env.SHADOW_MODEL_PROXY_ENABLED = previousProxyEnabled
      if (previousUpstreamBaseUrl === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = previousUpstreamBaseUrl
      if (previousUpstreamApiKey === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = previousUpstreamApiKey
    }
  })

  it('POST /api/cloud-saas/deployments rejects official model mode with only internal Shadow URL', async () => {
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    const previousShadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
    const previousProxyEnabled = process.env.SHADOW_MODEL_PROXY_ENABLED
    const previousUpstreamBaseUrl = process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    const previousUpstreamApiKey = process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
    process.env.SHADOW_SERVER_URL = 'http://host.lima.internal:3002'
    delete process.env.SHADOW_AGENT_SERVER_URL
    process.env.SHADOW_MODEL_PROXY_ENABLED = 'true'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = 'https://model.example/v1'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = 'official-upstream-secret'

    try {
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace: uniqueName('e2e-official-internal-url-ns'),
        name: uniqueName('e2e-official-internal-url-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: {
          ...makeConfigSnapshot('official-internal-url-secret'),
          use: [{ plugin: 'model-provider' }],
          [CLOUD_SAAS_RUNTIME_KEY]: {
            modelProviderMode: 'official',
          },
        },
      })

      expect(createRes.status).toBe(503)
      const body = (await createRes.json()) as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toContain('SHADOW_AGENT_SERVER_URL')
      expect(body.error).toContain('SHADOW_SERVER_URL is internal-only')
    } finally {
      if (previousShadowServerUrl === undefined) delete process.env.SHADOW_SERVER_URL
      else process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      if (previousShadowAgentServerUrl === undefined) delete process.env.SHADOW_AGENT_SERVER_URL
      else process.env.SHADOW_AGENT_SERVER_URL = previousShadowAgentServerUrl
      if (previousProxyEnabled === undefined) delete process.env.SHADOW_MODEL_PROXY_ENABLED
      else process.env.SHADOW_MODEL_PROXY_ENABLED = previousProxyEnabled
      if (previousUpstreamBaseUrl === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = previousUpstreamBaseUrl
      if (previousUpstreamApiKey === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = previousUpstreamApiKey
    }
  })

  it('POST /api/cloud-saas/deployments rejects official model mode when upstream provider env is missing', async () => {
    const previousShadowServerUrl = process.env.SHADOW_SERVER_URL
    const previousModelProxyEnabled = process.env.SHADOW_MODEL_PROXY_ENABLED
    const previousUpstreamBaseUrl = process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    const previousUpstreamApiKey = process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
    process.env.SHADOW_SERVER_URL = 'http://shadow.test'
    process.env.SHADOW_MODEL_PROXY_ENABLED = 'true'
    delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY

    try {
      const createRes = await req('POST', '/api/cloud-saas/deployments', {
        namespace: uniqueName('e2e-official-provider-missing-ns'),
        name: uniqueName('e2e-official-provider-missing-deploy'),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        configSnapshot: {
          ...makeConfigSnapshot('official-provider-missing-secret'),
          use: [{ plugin: 'model-provider' }],
          [CLOUD_SAAS_RUNTIME_KEY]: {
            modelProviderMode: 'official',
          },
        },
      })

      expect(createRes.status).toBe(503)
      const body = (await createRes.json()) as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toContain('SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL')
      expect(body.error).toContain('SHADOW_MODEL_PROXY_UPSTREAM_API_KEY')
    } finally {
      if (previousShadowServerUrl === undefined) delete process.env.SHADOW_SERVER_URL
      else process.env.SHADOW_SERVER_URL = previousShadowServerUrl
      if (previousModelProxyEnabled === undefined) delete process.env.SHADOW_MODEL_PROXY_ENABLED
      else process.env.SHADOW_MODEL_PROXY_ENABLED = previousModelProxyEnabled
      if (previousUpstreamBaseUrl === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = previousUpstreamBaseUrl
      if (previousUpstreamApiKey === undefined)
        delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY
      else process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = previousUpstreamApiKey
    }
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
      const testBody = (await testRes.json()) as {
        ok: boolean
        status?: number
        message: string
      }
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
        expect(url.searchParams.get('key')).toBeNull()
        expect(request.headers['x-goog-api-key']).toBe('mock-gemini-key')
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
              options: {
                profileId: profileBody.profile.id,
                selector: 'reasoning',
              },
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
            expect.objectContaining({
              id: 'mock-reasoning-r1',
              tags: ['reasoning'],
            }),
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

  it('POST /api/cloud-saas/deployments creates a time-billed deployment and redacts config secrets', async () => {
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
    })
    expect(res.status).toBe(201)
    const deployment = (await res.json()) as {
      id: string
      saasMode: boolean
      monthlyCost: number | null
      hourlyCost: number
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
    expect(deployment.monthlyCost).toBe(0)
    expect(deployment.hourlyCost).toBe(1)
    expect(deployment.configSnapshot.__shadowobRuntime).toBeUndefined()
    expect(deployment.configSnapshot.apiKey).toBe('[REDACTED]')
    expect(deployment.configSnapshot.deployments?.secrets?.API_KEY).toBe('[REDACTED]')
    expect(deployment.configSnapshot.deployments?.publicMetadata?.displayName).toBe('E2E Agent')

    const detailRes = await req('GET', `/api/cloud-saas/deployments/${deployment.id}`)
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()) as typeof deployment
    expect(detail.configSnapshot.__shadowobRuntime).toBeUndefined()
    expect(detail.configSnapshot.deployments?.secrets?.API_KEY).toBe('[REDACTED]')

    const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }
    expect(walletAfter.balance).toBe(walletBefore.balance)

    const txRes = await req('GET', '/api/cloud-saas/wallet/transactions')
    const txBody = (await txRes.json()) as {
      transactions: Array<{ type: string; referenceType?: string }>
    }
    const deployTx = txBody.transactions.find((tx) => tx.referenceType === 'cloud_deploy')
    expect(deployTx).toBeUndefined()
  })

  it('worker bills deployed Cloud SaaS runtime hourly with 15-minute precision', async () => {
    const namespace = uniqueName('e2e-hourly-billing-ns')
    const walletBefore = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }

    try {
      const [deployment] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('hourly-billing-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 0,
          hourlyCost: 1,
          lastHourlyBilledAt: new Date(Date.now() - 60 * 60 * 1000),
          saasMode: true,
        })
        .returning()

      await processCloudDeploymentQueueOnce({
        database: db,
        container: createFakeCloudWorkerContainer(),
        reconcile: false,
        deploymentIds: [deployment!.id],
      })

      const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
        balance: number
      }
      expect(walletAfter.balance).toBe(walletBefore.balance - 1)

      const [updated] = await db
        .select()
        .from(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.id, deployment!.id))
        .limit(1)
      const hourlyReferenceId = createCloudHourlyBillingReferenceId(
        deployment!.id,
        updated!.lastHourlyBilledAt!,
      )

      const txRes = await req('GET', '/api/cloud-saas/wallet/transactions')
      const txBody = (await txRes.json()) as {
        transactions: Array<{ amount: number; referenceId?: string; referenceType?: string }>
      }
      expect(
        txBody.transactions.find(
          (tx) => tx.referenceType === 'cloud_hourly' && tx.referenceId === hourlyReferenceId,
        ),
      ).toMatchObject({ amount: -1 })

      expect(updated!.lastHourlyBilledAt!.getTime()).toBeGreaterThan(
        deployment!.lastHourlyBilledAt!.getTime(),
      )
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
    }
  })

  it('GET /api/cloud-saas/deployments/costs and /:id/costs return token usage summaries', async () => {
    const namespace = uniqueName('e2e-costs-ns')
    const agentService = container.resolve('agentService')
    const agent = await agentService.create({
      name: 'E2E Usage Buddy',
      username: uniqueName('e2e-usage-buddy'),
      kernelType: 'openclaw',
      config: {},
      ownerId: userId,
    })
    const botUser = agent.botUser
    const agentToken = signAgentToken({
      userId: botUser.id,
      email: botUser.email,
      username: botUser.username,
    })

    const usageRes = await req(
      'POST',
      `/api/agents/${agent.id}/usage-snapshot`,
      {
        source: 'openclaw-trajectory',
        model: 'qwen3.6-plus',
        totalUsd: 0.12,
        inputTokens: 100,
        outputTokens: 45,
        cacheReadTokens: 10,
        cacheWriteTokens: 20,
        totalTokens: 175,
        providers: [
          {
            provider: 'anthropic',
            amountUsd: 0.12,
            usageLabel: 'qwen3.6-plus',
            inputTokens: 100,
            outputTokens: 45,
            totalTokens: 175,
          },
        ],
        generatedAt: new Date().toISOString(),
      },
      agentToken,
    )
    expect(usageRes.status).toBe(200)

    const ownerUsageRes = await req('POST', `/api/agents/${agent.id}/usage-snapshot`, {
      source: 'openclaw-trajectory',
      totalTokens: 1,
    })
    expect(ownerUsageRes.status).toBe(403)

    const provisionState = {
      provisionedAt: new Date().toISOString(),
      namespace,
      plugins: {
        shadowob: {
          buddies: {
            'strategy-buddy': {
              agentId: agent.id,
              userId: botUser.id,
              token: agentToken,
            },
          },
        },
      },
    }

    const [deployment] = await db
      .insert(schema.cloudDeployments)
      .values({
        userId,
        namespace,
        name: uniqueName('e2e-costs-deploy'),
        status: 'deployed',
        agentCount: 1,
        configSnapshot: attachCloudSaasProvisionState(
          {
            ...makeConfigSnapshot('cost-secret'),
            use: [
              {
                plugin: 'shadowob',
                options: {
                  buddies: [{ id: 'strategy-buddy', name: 'Strategy Buddy' }],
                  bindings: [
                    {
                      targetId: 'strategy-buddy',
                      targetType: 'buddy',
                      agentId: 'agent-1',
                    },
                  ],
                },
              },
            ],
          },
          provisionState,
        ),
        templateSlug: officialTemplateSlug,
        resourceTier: 'lightweight',
        monthlyCost: 500,
        saasMode: true,
      })
      .returning()

    const namespaceCostsRes = await req(
      'GET',
      `/api/cloud-saas/deployments/${deployment!.id}/costs`,
    )
    expect(namespaceCostsRes.status).toBe(200)
    const namespaceCosts = (await namespaceCostsRes.json()) as {
      namespace: string
      billingAmount: number | null
      billingUnit: string
      totalTokens: number | null
      agents: Array<{
        billingAmount: number | null
        billingUnit: string
        source: string
        totalTokens: number | null
      }>
    }
    expect(namespaceCosts.namespace).toBe(namespace)
    expect(namespaceCosts.billingUnit).toBe('usd')
    expect(namespaceCosts.billingAmount).toBe(0.12)
    expect(namespaceCosts.totalTokens).toBe(175)
    expect(Array.isArray(namespaceCosts.agents)).toBe(true)
    expect(namespaceCosts.agents.length).toBeGreaterThan(0)
    expect(namespaceCosts.agents.every((agent) => agent.billingUnit === 'usd')).toBe(true)
    expect(namespaceCosts.agents[0]?.source).toBe('telemetry')

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
    expect(matchingNamespace?.billingAmount).toBe(0.12)
  })

  it('POST /api/cloud-saas/deployments/:id/redeploy creates a durable history entry without an upfront charge', async () => {
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
      const history = (await historyRes.json()) as Array<{
        id: string
        namespace: string
      }>
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
      expect(
        runtime.provisionState?.plugins.shadowob.buddies['strategy-buddy'].token,
      ).toBeUndefined()
      expect(runtime.envVars.SHADOW_USER_TOKEN).toBeUndefined()

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

  it('refreshes model-provider runtime credentials when redeploying', async () => {
    const namespace = uniqueName('e2e-redeploy-provider-ns')
    const provisionState = {
      provisionedAt: '2026-04-30T00:00:00.000Z',
      namespace,
      plugins: {
        shadowob: {
          buddies: {
            'strategy-buddy': {
              agentId: 'strategy-buddy',
              userId: 'bot-user-1',
              token: 'bot-token-1',
            },
          },
        },
      },
    }

    try {
      const profileRes = await req('PUT', '/api/cloud-saas/provider-profiles', {
        providerId: 'anthropic',
        name: `Redeploy Provider ${namespace}`,
        config: {
          baseUrl: 'https://anthropic-redeploy.example.test',
          models: [{ id: 'claude-redeploy-model', tags: ['default'] }],
        },
        envVars: { ANTHROPIC_API_KEY: 'fresh-redeploy-anthropic-key' },
      })
      expect(profileRes.status).toBe(200)
      const profileBody = (await profileRes.json()) as { profile: { id: string } }
      const baseConfig = {
        ...makeConfigSnapshot('redeploy-provider-secret'),
        use: [
          {
            plugin: 'model-provider',
            options: { profileId: profileBody.profile.id },
          },
        ],
      }
      const staleSnapshot = attachCloudSaasProvisionState(
        prepareCloudSaasConfigSnapshot(baseConfig, {
          SHADOW_USER_TOKEN: 'stale-user-token',
          SHADOW_SERVER_URL: 'http://stale-shadow.local',
          ANTHROPIC_API_KEY: 'stale-anthropic-key',
          ANTHROPIC_BASE_URL: 'https://stale-anthropic.example.test',
        }),
        provisionState,
      )

      const [existing] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: staleSnapshot,
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
        })
        .returning()

      const redeployRes = await req('POST', `/api/cloud-saas/deployments/${existing!.id}/redeploy`)
      expect(redeployRes.status).toBe(201)
      const redeployed = (await redeployRes.json()) as { id: string }
      const [storedRedeploy] = await db
        .select()
        .from(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.id, redeployed.id))
        .limit(1)

      const runtime = extractCloudSaasRuntime(storedRedeploy?.configSnapshot)
      expect(runtime.envVars.SHADOW_USER_TOKEN).toBeUndefined()
      expect(runtime.envVars.SHADOW_SERVER_URL).not.toBe('http://stale-shadow.local')
      expect(runtime.envVars.ANTHROPIC_API_KEY).toBe('fresh-redeploy-anthropic-key')
      expect(runtime.envVars.ANTHROPIC_BASE_URL).toBe('https://anthropic-redeploy.example.test')
      expect(
        runtime.provisionState?.plugins.shadowob.buddies['strategy-buddy'].token,
      ).toBeUndefined()
    } finally {
      await db
        .delete(schema.cloudDeployments)
        .where(eq(schema.cloudDeployments.namespace, namespace))
        .catch(() => {})
    }
  })

  it('DELETE /api/cloud-saas/deployments/:id turns the current deployment into a durable Pulumi destroy task', async () => {
    const namespace = uniqueName('e2e-destroy-ns')

    try {
      const [existing] = await db
        .insert(schema.cloudDeployments)
        .values({
          userId,
          namespace,
          name: `${namespace}-agent`,
          status: 'deployed',
          agentCount: 1,
          configSnapshot: makeConfigSnapshot('destroy-secret'),
          templateSlug: officialTemplateSlug,
          resourceTier: 'lightweight',
          monthlyCost: 500,
          saasMode: true,
        })
        .returning()

      const destroyRes = await req('DELETE', `/api/cloud-saas/deployments/${existing!.id}`)
      expect(destroyRes.status).toBe(200)
      const destroyBody = (await destroyRes.json()) as {
        ok: boolean
        taskId: string
        status: string
      }
      expect(destroyBody.ok).toBe(true)
      expect(destroyBody.taskId).toBe(existing!.id)
      expect(destroyBody.status).toBe('destroying')

      const detailRes = await req('GET', `/api/cloud-saas/deployments/${destroyBody.taskId}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as {
        id: string
        namespace: string
        status: string
        configSnapshot: unknown
      }
      expect(detail.id).toBe(destroyBody.taskId)
      expect(detail.namespace).toBe(namespace)
      expect(detail.status).toBe('destroying')
      expect(detail.configSnapshot).toBeTruthy()

      const logs = await db
        .select()
        .from(schema.cloudDeploymentLogs)
        .where(eq(schema.cloudDeploymentLogs.deploymentId, destroyBody.taskId))
      expect(logs.some((log) => log.message.includes('Queued Pulumi destroy'))).toBe(true)
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
    expect(cancelBody.status).toBe('failed')

    const detailRes = await req('GET', `/api/cloud-saas/deployments/${deployment.id}`)
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()) as { status: string; errorMessage: string | null }
    expect(detail).toMatchObject({ status: 'failed', errorMessage: 'cancelled by user' })
  })

  it('POST /api/cloud-saas/deployments ignores client-tampered configSnapshot', async () => {
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

    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      configSnapshot: { deployments?: { agents?: unknown[] } }
    }
    expect(body.configSnapshot.deployments?.agents).toHaveLength(1)

    const walletAfter = (await (await req('GET', '/api/cloud-saas/wallet')).json()) as {
      balance: number
    }
    expect(walletAfter.balance).toBe(walletBefore.balance)
  })

  it('POST /api/cloud-saas/deployments rejects undeployable templates before queueing runtime billing', async () => {
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
