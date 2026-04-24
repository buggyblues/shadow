/**
 * SaaS API adapter — maps saasApi shape to the dashboard `api` shape
 * for the subset of endpoints used by shared packages/ui pages.
 *
 * Pages that use LOCAL-ONLY features (doctor, validate, images, runtimes,
 * config, deploy-tasks, etc.) are NOT included in the web-saas router and
 * therefore never call those methods.
 *
 * Only the intersection of shared pages is wired here.
 */

import type { CloudApiClient } from '@shadowob/cloud-ui/lib/api-context'
import { BASE, type ResourceTier, type SaasDeployment, saasApi } from './api'

type WalletApiExtension = {
  wallet: {
    get: () => Promise<{ balance: number }>
    transactions: (params?: { limit?: number; offset?: number }) => Promise<{
      transactions: Array<{
        id: string
        type: string
        amount: number
        balanceAfter: number
        referenceId: string | null
        referenceType: string | null
        note: string | null
        createdAt: string
      }>
      total: number
      limit: number
      offset: number
    }>
  }
}

type Deployment = Awaited<ReturnType<CloudApiClient['deployments']['list']>>[number]
type Pod = Awaited<ReturnType<CloudApiClient['deployments']['pods']>>[number]
type EnvVarListEntry = Awaited<ReturnType<CloudApiClient['env']['list']>>['envVars'][number]
type TemplateCategoryId =
  | 'devops'
  | 'security'
  | 'support'
  | 'research'
  | 'monitoring'
  | 'business'
  | 'demo'
type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced'

type SaasTemplate = Awaited<ReturnType<typeof saasApi.templates.list>>[number]
type TemplateDeployments = {
  namespace?: string
  agents?: Array<Record<string, unknown>>
}

const deploymentCacheByNamespace = new Map<string, SaasDeployment>()
const deploymentCacheById = new Map<string, SaasDeployment>()

function syncDeploymentCache(rows: SaasDeployment[]) {
  for (const row of rows) {
    deploymentCacheByNamespace.set(row.namespace, row)
    deploymentCacheById.set(row.id, row)
  }
}

async function listSaasDeployments(): Promise<SaasDeployment[]> {
  const rows = await saasApi.deployments.list()
  syncDeploymentCache(rows)
  return rows.filter(
    (row) =>
      row.status === 'pending' ||
      row.status === 'deploying' ||
      row.status === 'cancelling' ||
      row.status === 'deployed' ||
      row.status === 'destroying',
  )
}

async function resolveDeploymentByNamespace(namespace: string): Promise<SaasDeployment | null> {
  const cached = deploymentCacheByNamespace.get(namespace)
  if (cached) return cached

  const rows = await listSaasDeployments()
  return rows.find((row) => row.namespace === namespace) ?? null
}

function getDeploymentAgentEntries(
  deployment: SaasDeployment,
): Array<{ name: string; replicas: number }> {
  const deployments = deployment.configSnapshot?.deployments as TemplateDeployments | undefined
  const agents = Array.isArray(deployments?.agents) ? deployments.agents : []
  const mapped = agents
    .map((agent: Record<string, unknown>) => {
      const name = typeof agent?.id === 'string' ? agent.id : null
      if (!name) return null

      return {
        name,
        replicas:
          typeof agent?.replicas === 'number' &&
          Number.isFinite(agent.replicas) &&
          agent.replicas > 0
            ? agent.replicas
            : 1,
      }
    })
    .filter((entry): entry is { name: string; replicas: number } => Boolean(entry))

  if (mapped.length > 0) return mapped

  return [{ name: deployment.name, replicas: Math.max(deployment.agentCount ?? 1, 1) }]
}

function expandDeploymentRows(deployment: SaasDeployment): Deployment[] {
  return getDeploymentAgentEntries(deployment).map((agent) => ({
    name: agent.name,
    namespace: deployment.namespace,
    ready:
      deployment.status === 'deployed'
        ? `${agent.replicas}/${agent.replicas}`
        : `0/${agent.replicas}`,
    upToDate: String(agent.replicas),
    available: deployment.status === 'deployed' ? String(agent.replicas) : '0',
    age: deployment.createdAt,
  }))
}

function filterPodsByAgent(
  pods: Array<{
    name: string
    status: string
    ready: string
    restarts: number
    age: string
    containers: string[]
  }>,
  agent?: string,
): Pod[] {
  const filtered =
    agent && agent.length > 0
      ? pods.filter(
          (pod) =>
            pod.name.includes(agent) ||
            pod.containers.some(
              (containerName) => containerName === agent || containerName.includes(agent),
            ),
        )
      : pods

  return (filtered.length > 0 ? filtered : pods).map((pod) => ({
    name: pod.name,
    ready: pod.ready,
    status: pod.status,
    restarts: String(pod.restarts),
    age: pod.age,
  }))
}

function getTemplateMeta(template: SaasTemplate) {
  const deployments = template.content?.deployments as TemplateDeployments | undefined
  const agents = Array.isArray(deployments?.agents) ? deployments.agents : []
  return {
    namespace: typeof deployments?.namespace === 'string' ? deployments.namespace : template.slug,
    agentCount: agents.length,
    overview:
      typeof template.description === 'string' && template.description.trim().length > 0
        ? [template.description.trim()]
        : [],
    features: Array.isArray(template.tags) ? template.tags : [],
  }
}

function buildTemplateCategories(rows: SaasTemplate[]) {
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))] as string[]
  return categories.map((category) => ({
    id: category as TemplateCategoryId,
    label: category,
    emoji: '☁️',
    description: category,
  }))
}

function slugifyTemplateName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Helper to map a SaasTemplate to the dashboard TemplateCatalogSummary shape
function toTemplateSummary(t: SaasTemplate) {
  const meta = getTemplateMeta(t)
  return {
    name: t.slug,
    namespace: meta.namespace,
    description: t.description ?? '',
    teamName: 'Shadow Cloud',
    agentCount: meta.agentCount,
    tags: Array.isArray(t.tags) ? t.tags : [],
    category: (t.category as TemplateCategoryId) ?? 'demo',
    emoji: '☁️',
    featured: t.source === 'official',
    popularity: t.deployCount,
    difficulty: (t.category === 'advanced'
      ? 'advanced'
      : t.category === 'intermediate'
        ? 'intermediate'
        : 'beginner') as TemplateDifficulty,
    estimatedDeployTime: '5 min',
    overview: meta.overview,
    features: meta.features,
    highlights: meta.features.slice(0, 3),
  }
}

// Helper to map a SaasTemplate to the myTemplates list shape
function toMyTemplate(t: SaasTemplate) {
  return {
    name: t.slug,
    slug: t.slug,
    templateSlug: t.source === 'official' ? t.slug : null,
    content: t.content,
    version: 1,
    updatedAt: t.updatedAt,
    reviewStatus: t.reviewStatus as 'draft' | 'pending' | 'approved' | 'rejected' | undefined,
    reviewNote: t.reviewNote ?? null,
    source: t.source as 'official' | 'community' | undefined,
  }
}

const now = () => new Date().toISOString()

// Build a partial override that matches CloudApiClient shape
// for the saas-relevant subset, falling back to the local `api`
// for anything not reachable from the web-saas router.
export const saasApiAdapter: CloudApiClient & WalletApiExtension = {
  health: async () => ({ status: 'ok', timestamp: now() }),

  // ── Community (StorePage uses api.community.catalog) ─────────────────────
  community: {
    getSettings: () =>
      Promise.resolve({
        baseUrl: 'https://shadowob.com',
        oauthConnected: false,
        hasToken: false,
      }),
    putSettings: () => Promise.resolve({ ok: true }),
    oauthInit: () => Promise.resolve({ url: '' }),
    catalog: (_locale: string) =>
      saasApi.templates.list().then((rows) => ({
        source: 'community' as const,
        templates: rows.map(toTemplateSummary),
        categories: buildTemplateCategories(rows),
      })),
    publish: (name: string, _data?: unknown) =>
      saasApi.templates
        .submit(name)
        .then(() => ({ ok: true, result: null }))
        .catch((err: unknown) => {
          if (err instanceof Error && err.message.includes(': 422')) {
            return { ok: true, result: null }
          }
          throw err
        }),
  },

  // ── Templates ────────────────────────────────────────────────────────────
  templates: {
    list: () =>
      saasApi.templates.list().then((rows) =>
        rows.map((t) => ({
          name: t.slug,
          namespace: getTemplateMeta(t).namespace,
          description: t.description ?? '',
          teamName: 'Shadow Cloud',
          agentCount: getTemplateMeta(t).agentCount,
          tags: t.tags ?? [],
        })),
      ),
    catalog: (_locale: string) =>
      saasApi.templates.list().then((rows) => ({
        templates: rows.map(toTemplateSummary),
        categories: buildTemplateCategories(rows),
      })),
    listByLocale: (_locale: string) =>
      saasApi.templates.list().then((rows) =>
        rows.map((t) => ({
          name: t.slug,
          namespace: getTemplateMeta(t).namespace,
          description: t.description ?? '',
          teamName: 'Shadow Cloud',
          agentCount: getTemplateMeta(t).agentCount,
          tags: t.tags ?? [],
        })),
      ),
    detail: async (name: string, _locale: string) => {
      const [template, envRefs] = await Promise.all([
        saasApi.templates.get(name),
        saasApi.templates.envRefs(name).catch(() => ({ template: name, requiredEnvVars: [] })),
      ])
      return {
        template: {
          ...toTemplateSummary(template),
          file: `${template.slug}.template.json`,
          lastUpdated: template.updatedAt,
          useCases: Array.isArray(template.tags) ? template.tags : [],
          requirements: [],
          requiredEnvVars: envRefs.requiredEnvVars,
        },
      }
    },
    get: (name: string) => saasApi.templates.get(name).then((t) => t.content),
    envRefs: (name: string) => saasApi.templates.envRefs(name),
  },

  // ── My Templates (user-owned templates in SaaS = community submissions) ──
  myTemplates: {
    list: () => saasApi.templates.mine().then((rows) => rows.map(toMyTemplate)),
    get: (name: string) =>
      saasApi.templates.mineOne(name).then((t) => ({
        name: t.slug,
        slug: t.slug,
        templateSlug: t.slug,
        content: t.content,
        version: 1,
        reviewStatus: t.reviewStatus as 'draft' | 'pending' | 'approved' | 'rejected' | undefined,
        reviewNote: t.reviewNote ?? null,
        source: t.source as 'official' | 'community' | undefined,
      })),
    save: (name: string, content: unknown, _templateSlug?: string) =>
      saasApi.templates
        .update(name, { content: content as Record<string, unknown> })
        .then(() => ({ ok: true })),
    fork: (sourceTemplate: string, newName?: string) =>
      saasApi.templates
        .get(sourceTemplate)
        .then((t) =>
          saasApi.templates.create({
            slug: newName ?? `${t.slug}-copy-${Date.now()}`,
            name: newName ?? `${t.name} (Copy)`,
            description: t.description ?? undefined,
            content: t.content,
            tags: t.tags ?? [],
            category: t.category ?? undefined,
          }),
        )
        .then((t) => ({ name: t.slug, slug: t.slug })),
    delete: (name: string) => saasApi.templates.delete(name),
    versions: (_name: string) =>
      Promise.resolve({ current: 1, versions: [{ version: 1, createdAt: now(), current: true }] }),
    restoreVersion: (_name: string, _version: number) =>
      Promise.resolve({ ok: true, restoredVersion: _version }),
    share: (name: string) =>
      saasApi.templates.mineOne(name).then((t) => ({
        name: t.slug,
        templateSlug: t.source === 'official' ? t.slug : null,
        version: 1,
        content: t.content,
        sharedAt: now(),
      })),
    import: (data: { name: string; content: unknown; templateSlug?: string }) =>
      saasApi.templates
        .create({
          slug: data.name,
          name: data.name,
          content: data.content as Record<string, unknown>,
        })
        .then((t) => ({ ok: true, name: t.slug })),
    importGit: (data: { url: string; name?: string; path?: string; branch?: string }) =>
      saasApi.templates
        .create({
          slug: slugifyTemplateName(data.name ?? data.url.split('/').pop() ?? `git-${Date.now()}`),
          name: data.name ?? data.url.split('/').pop() ?? 'Imported Template',
          description: `Imported from ${data.url}`,
          content: {
            version: '1.0',
            name: data.name ?? data.url.split('/').pop() ?? 'Imported Template',
            metadata: {
              git: {
                url: data.url,
                path: data.path,
                branch: data.branch,
              },
            },
            deployments: {
              namespace:
                slugifyTemplateName(
                  data.name ?? data.url.split('/').pop() ?? 'imported-template',
                ) || 'imported-template',
              agents: [],
            },
          },
        })
        .then((template) => ({ ok: true, name: template.slug, source: data.url })),
  },

  // ── Deployments ──────────────────────────────────────────────────────────
  deployments: {
    list: () => listSaasDeployments().then((rows) => rows.flatMap(expandDeploymentRows)),
    namespaces: () =>
      listSaasDeployments().then((rows) => {
        const ns = [...new Set(rows.map((d) => d.namespace))]
        return { configured: ns, discovered: [], all: ns }
      }),
    scale: async (namespace: string, _id: string, agentCount: number) => {
      const deployment = await resolveDeploymentByNamespace(namespace)
      if (!deployment) return { ok: true }
      const updated = await saasApi.deployments.scale(deployment.id, agentCount)
      syncDeploymentCache([updated])
      return { ok: true }
    },
    costs: () => saasApi.deployments.costs(),
    namespaceCosts: async (namespace: string) => {
      const deployment = await resolveDeploymentByNamespace(namespace)
      if (!deployment) {
        return {
          namespace,
          totalUsd: null,
          billingAmount: null,
          billingUnit: 'shrimp' as const,
          totalTokens: null,
          agents: [],
          availableAgents: 0,
          unavailableAgents: 0,
          generatedAt: now(),
        }
      }

      return saasApi.deployments.namespaceCosts(deployment.id)
    },
    pods: async (namespace: string, agent: string) => {
      const deployment = await resolveDeploymentByNamespace(namespace)
      if (!deployment) return []
      const response = await saasApi.deployments.pods(deployment.id).catch(() => ({ pods: [] }))
      return filterPodsByAgent(response.pods, agent)
    },
    logsUrl: (namespace: string, agent: string) => {
      const deployment = deploymentCacheByNamespace.get(namespace)
      if (!deployment) {
        return `${BASE}/deployments/${encodeURIComponent(namespace)}/logs`
      }
      return `${BASE}/deployments/${encodeURIComponent(deployment.id)}/pod-logs?agent=${encodeURIComponent(agent)}`
    },
    logsHistory: async (namespace: string, agent: string, page = 1, limit = 200) => {
      const deployment = await resolveDeploymentByNamespace(namespace)
      if (!deployment) {
        return {
          namespace,
          agent,
          podName: agent,
          page,
          limit,
          lines: [],
          hasMore: false,
        }
      }

      return saasApi.deployments.logsHistory(deployment.id, { agent, page, limit })
    },
    env: {
      list: async (namespace: string, mode: 'effective' | 'scoped' = 'effective') => {
        const [deployment, globalEnv] = await Promise.all([
          resolveDeploymentByNamespace(namespace),
          saasApi.globalEnvVars.list(),
        ])
        const scopedVars = deployment ? await saasApi.envvars.list(deployment.id) : []
        const scopedEntries: EnvVarListEntry[] = scopedVars.map((variable) => ({
          scope: deployment?.id ?? namespace,
          key: variable.key,
          maskedValue: '****',
          isSecret: true,
          groupName: variable.groupName ?? 'default',
        }))

        if (mode === 'scoped') {
          return {
            namespace,
            scope: deployment?.id ?? namespace,
            mode,
            envVars: scopedEntries,
          }
        }

        const fallbackEntries = globalEnv.envVars
          .filter((variable) => !scopedEntries.some((entry) => entry.key === variable.key))
          .map((variable) => ({
            scope: 'global',
            key: variable.key,
            maskedValue: variable.maskedValue,
            isSecret: variable.isSecret,
            groupName: variable.groupName,
          }))

        return {
          namespace,
          scope: deployment?.id ?? namespace,
          mode,
          envVars: [...scopedEntries, ...fallbackEntries],
        }
      },
      getOne: async (namespace: string, key: string) => {
        const deployment = await resolveDeploymentByNamespace(namespace)
        if (deployment) {
          try {
            return await saasApi.envvars.getOne(deployment.id, key)
          } catch {
            // fall through to global env for effective-mode fallback entries
          }
        }

        return saasApi.globalEnvVars.getOne(key)
      },
      upsert: async (namespace: string, key: string, value: string) => {
        const deployment = await resolveDeploymentByNamespace(namespace)
        if (!deployment) return { ok: true }
        await saasApi.envvars.update(deployment.id, [{ key, value }])
        return { ok: true }
      },
      delete: async (namespace: string, key: string) => {
        const deployment = await resolveDeploymentByNamespace(namespace)
        if (!deployment) return { ok: true }
        return saasApi.envvars.delete(deployment.id, key)
      },
    },
  },

  // ── Deploy Tasks (stubs — no saas equivalent) ────────────────────────────
  deployTasks: {
    list: () => Promise.resolve({ tasks: [] }),
    get: async (id: number | string) => ({
      task: {
        id: Number(id),
        namespace: '',
        templateSlug: null,
        version: null,
        status: 'failed',
        config: {},
        agentCount: 0,
        error: 'Deploy tasks are not available in SaaS mode.',
        createdAt: now(),
        updatedAt: now(),
      },
      url: '',
      active: false,
    }),
    streamUrl: (_id: number | string) => '',
    redeploy: async (_id: number | string) =>
      new Response(JSON.stringify({ ok: false }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      }),
    redeployToTaskId: (_id: number | string) => Promise.resolve(0),
    redeployUrl: (_id: number | string) => '',
  },

  // ── Env Vars (global scope in SaaS — stubs) ──────────────────────────────
  env: {
    list: () => saasApi.globalEnvVars.list(),
    groups: () => saasApi.globalEnvVars.groups(),
    createGroup: (name: string) => saasApi.globalEnvVars.createGroup(name),
    deleteGroup: (name: string) => saasApi.globalEnvVars.deleteGroup(name),
    getByScope: (_scope: string) => Promise.resolve({ envVars: [] }),
    getOne: (_scope: string, key: string) => saasApi.globalEnvVars.getOne(key),
    upsert: (_scope: string, key: string, value: string, isSecret?: boolean, groupName?: string) =>
      saasApi.globalEnvVars.upsert(key, value, isSecret, groupName),
    delete: (_scope: string, key: string) => saasApi.globalEnvVars.delete(key),
  },

  // ── Settings (stub — saas doesn't expose provider config) ────────────────
  settings: {
    get: () => Promise.resolve({ providers: [] }),
    put: () => Promise.resolve({ ok: true }),
  },

  // ── Doctor (saas: no local infra checks — return empty healthy result) ────
  doctor: () =>
    Promise.resolve({
      checks: [],
      summary: { pass: 0, warn: 0, fail: 0 },
    }),

  schema: () => saasApi.schema(),

  validate: (config: unknown) => saasApi.validate(config),

  deploy: async (_config: unknown) =>
    new Response(JSON.stringify({ ok: false, error: 'Use deployFn in SaaS mode.' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    }),

  // ── Destroy (remove a namespace/deployment in SaaS) ──────────────────────
  destroy: async (options: { namespace?: string; stack?: string }) => {
    const namespace = options.namespace ?? options.stack
    if (!namespace) return { ok: true }
    const deployment = await resolveDeploymentByNamespace(namespace)
    if (!deployment) return { ok: true }
    await saasApi.deployments.delete(deployment.id)
    deploymentCacheByNamespace.delete(namespace)
    deploymentCacheById.delete(deployment.id)
    return { ok: true }
  },

  rollback: async (options: { namespace: string }) => ({ ok: true, namespace: options.namespace }),

  // ── Activity ─────────────────────────────────────────────────────────────
  activity: {
    list: () =>
      saasApi.activity.list().then((rows) => ({
        activities: rows.map((a) => ({
          id: a.id,
          type: a.type,
          namespace: a.namespace,
          ...a.meta,
          createdAt: a.createdAt,
        })),
      })),
    record: async (_entry: object) => ({ success: true }),
  },

  // ── Init (returns template content for the deploy wizard) ────────────────
  init: (template?: string) =>
    template
      ? saasApi.templates.get(template).then((t) => ({
          ...(t.content as Record<string, unknown>),
          templateSlug: t.slug,
        }))
      : Promise.resolve({}),

  generate: {
    manifests: async (_options: { config: unknown; namespace?: string }) => ({
      manifests: [],
      count: 0,
    }),
    openclawConfig: async (_options: { config: unknown; agentId: string }) => ({ config: {} }),
  },

  images: async () => [],

  config: {
    get: async (_path?: string) => ({ path: 'db://saas', content: '{}' }),
    put: async (_options: { path?: string; content: string }) => ({ ok: true }),
  },

  runtimes: async () => [],

  secrets: {
    list: async () => ({ secrets: [] }),
    getByProvider: async (_providerId: string) => ({ secrets: [] }),
    upsert: async (_providerId: string, _key: string, _value: string, _groupName?: string) => ({
      ok: true,
    }),
    delete: async (_providerId: string, _key: string) => ({ ok: true }),
    deleteProvider: async (_providerId: string) => ({ ok: true }),
  },

  // ── SaaS deploy — bypasses local SSE /api/deploy ─────────────────────────
  deployFn: async (config: {
    templateSlug: string
    namespace: string
    name: string
    resourceTier?: string
    configSnapshot?: Record<string, unknown>
    envVars?: Record<string, string>
  }) => {
    try {
      const created = await saasApi.deployments.create({
        namespace: config.namespace,
        name: config.name,
        templateSlug: config.templateSlug,
        resourceTier: (config.resourceTier as ResourceTier) ?? 'lightweight',
        agentCount: 1,
        configSnapshot: config.configSnapshot ?? {},
        envVars: config.envVars,
      })
      syncDeploymentCache([created])

      return {
        success: true,
        deploymentId: created.id,
        status: created.status,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },

  deploymentStatusFn: async (deploymentId: string) => {
    const deployment = await saasApi.deployments.get(deploymentId)
    syncDeploymentCache([deployment])
    return {
      id: deployment.id,
      status: deployment.status,
      errorMessage: deployment.errorMessage,
    }
  },

  deploymentLogsUrlFn: (deploymentId: string) => saasApi.deployments.logsUrl(deploymentId),

  cancelDeploymentFn: (deploymentId: string) => saasApi.deployments.cancel(deploymentId),

  // ── Wallet ────────────────────────────────────────────────────────────────
  // top-up is performed via the apps/web Stripe recharge modal (host app),
  // triggered by the 'shadow:open-recharge' DOM event from WalletPage.
  wallet: {
    get: () => saasApi.wallet.get(),
    transactions: (params?: { limit?: number; offset?: number }) =>
      saasApi.wallet.transactions(params),
  },
}
