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

import type {
  EnvVarListEntry,
  TemplateCategoryId,
  TemplateDifficulty,
} from '@shadowob/cloud-ui/lib/api'
import { api } from '@shadowob/cloud-ui/lib/api'
import type { CloudApiClient } from '@shadowob/cloud-ui/lib/api-context'
import type { ResourceTier } from './api'
import { saasApi } from './api'

// Helper to map a SaasTemplate to the dashboard TemplateCatalogSummary shape
function toTemplateSummary(t: Awaited<ReturnType<typeof saasApi.templates.list>>[number]) {
  return {
    name: t.slug,
    namespace: '',
    description: t.description ?? '',
    teamName: 'Shadow Cloud',
    agentCount: 0,
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
    overview: [],
    features: [],
    highlights: [],
  }
}

// Helper to map a SaasTemplate to the myTemplates list shape
function toMyTemplate(t: Awaited<ReturnType<typeof saasApi.templates.list>>[number]) {
  return {
    name: t.slug,
    slug: t.slug,
    templateSlug: t.slug,
    content: t.content,
    version: 1,
    updatedAt: t.updatedAt,
  }
}

const now = () => new Date().toISOString()

// Build a partial override that matches CloudApiClient shape
// for the saas-relevant subset, falling back to the local `api`
// for anything not reachable from the web-saas router.
export const saasApiAdapter: CloudApiClient = {
  ...api,

  // ── Community (StorePage uses api.community.catalog) ─────────────────────
  community: {
    ...api.community,
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
        categories: [],
      })),
    publish: (name: string, _data?: unknown) =>
      saasApi.templates.submit(name).then(() => ({ ok: true })),
  },

  // ── Templates ────────────────────────────────────────────────────────────
  templates: {
    ...api.templates,
    list: () =>
      saasApi.templates.list().then((rows) =>
        rows.map((t) => ({
          name: t.slug,
          namespace: '',
          description: t.description ?? '',
          teamName: 'Shadow Cloud',
          agentCount: 0,
          tags: t.tags ?? [],
        })),
      ),
    catalog: (_locale: string) =>
      saasApi.templates.list().then((rows) => ({
        templates: rows.map(toTemplateSummary),
        categories: [],
      })),
    listByLocale: (_locale: string) =>
      saasApi.templates.list().then((rows) => ({
        templates: rows.map(toTemplateSummary),
        categories: [],
      })),
    detail: (name: string, _locale: string) =>
      saasApi.templates.get(name).then((t) => ({
        template: {
          ...toTemplateSummary(t),
          file: '',
          lastUpdated: t.updatedAt,
          useCases: [],
          requirements: [],
          requiredEnvVars: [],
        },
      })),
    get: (name: string) =>
      saasApi.templates.get(name).then((t) => ({
        template: {
          ...toTemplateSummary(t),
          file: '',
          lastUpdated: t.updatedAt,
          useCases: [],
          requirements: [],
          requiredEnvVars: [],
        },
      })),
    envRefs: (_name: string) => Promise.resolve({ template: '', requiredEnvVars: [] }),
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
    delete: (name: string) =>
      saasApi.templates
        .get(name)
        .then(() =>
          // No delete endpoint — just resolve ok (templates persist, but removed from "mine" view)
          Promise.resolve({ ok: true }),
        )
        .catch(() => Promise.resolve({ ok: true })),
    versions: (_name: string) =>
      Promise.resolve({ current: 1, versions: [{ version: 1, createdAt: now(), current: true }] }),
    restoreVersion: (_name: string, _version: number) =>
      Promise.resolve({ ok: true, restoredVersion: _version }),
    share: (name: string) =>
      saasApi.templates.get(name).then((t) => ({
        name: t.slug,
        templateSlug: t.slug,
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
      Promise.resolve({ ok: true, name: data.name ?? 'imported', source: data.url }),
  },

  // ── Deployments ──────────────────────────────────────────────────────────
  deployments: {
    ...api.deployments,
    list: () =>
      saasApi.deployments.list().then((rows) =>
        rows.map((d) => ({
          name: d.name,
          namespace: d.namespace,
          ready: d.status === 'deployed' ? '1/1' : '0/1',
          upToDate: '1',
          available: d.status === 'deployed' ? '1' : '0',
          age: d.createdAt,
        })),
      ),
    namespaces: () =>
      saasApi.deployments.list().then((rows) => {
        const ns = [...new Set(rows.map((d) => d.namespace))]
        return { configured: ns, discovered: ns, all: ns }
      }),
    scale: (namespace: string, _id: string, agentCount: number) =>
      saasApi.deployments.scale(namespace, agentCount).then(() => ({ ok: true })),
    costs: () =>
      Promise.resolve({
        totalUsd: null,
        namespaces: [],
        generatedAt: now(),
      }),
    namespaceCosts: (namespace: string) =>
      Promise.resolve({
        namespace,
        totalUsd: null,
        agents: [],
        availableAgents: 0,
        unavailableAgents: 0,
        generatedAt: now(),
      }),
    pods: (_namespace: string, _id: string) => Promise.resolve([]),
    logsUrl: (namespace: string, _id: string) => saasApi.deployments.logsUrl(namespace),
    logsHistory: (namespace: string, agent: string, _page = 1, limit = 200) =>
      Promise.resolve({ namespace, agent, limit, lines: [], hasMore: false }),
    env: {
      list: (namespace: string, _mode?: string) =>
        // Only call envvars API if namespace is a real UUID deployment ID
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(namespace)
          ? saasApi.envvars.list(namespace).then((vars) => ({
              namespace,
              scope: namespace,
              mode: 'effective' as const,
              envVars: vars.map((v) => ({
                scope: v.scope,
                key: v.key,
                maskedValue: '****',
                isSecret: true,
                groupName: v.groupId ?? 'default',
              })),
            }))
          : Promise.resolve({
              namespace,
              scope: namespace,
              mode: 'effective' as const,
              envVars: [],
            }),
      getOne: (namespace: string, key: string) =>
        Promise.resolve({
          envVar: { scope: namespace, key, value: '', isSecret: false, groupName: 'default' },
        }),
      upsert: (namespace: string, key: string, value: string) =>
        saasApi.envvars.update(namespace, [{ key, value }]).then(() => ({ ok: true })),
      delete: (_namespace: string, _key: string) => Promise.resolve({ ok: true }),
    },
  },

  // ── Deploy Tasks (stubs — no saas equivalent) ────────────────────────────
  deployTasks: {
    ...api.deployTasks,
    list: () => Promise.resolve({ tasks: [] }),
    redeployToTaskId: (_id: number | string) => Promise.resolve(0),
  },

  // ── Env Vars (global scope in SaaS — stubs) ──────────────────────────────
  env: {
    list: () => saasApi.globalEnvVars.list(),
    groups: () => saasApi.globalEnvVars.list().then((r) => ({ groups: r.groups })),
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

  // ── Schema (not available in saas mode) ──────────────────────────────────
  schema: () => Promise.resolve({}),

  // ── Destroy (remove a namespace/deployment in SaaS) ──────────────────────
  destroy: (options: { namespace?: string; stack?: string }) =>
    saasApi.deployments
      .list()
      .then(async (rows) => {
        const ns = options.namespace ?? options.stack
        const match = rows.find((d) => d.namespace === ns)
        if (match) await saasApi.deployments.delete(match.id)
        return { ok: true }
      })
      .catch(() => ({ ok: true })),

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
    record: (entry: object) => api.activity.record(entry),
  },

  // ── Init (returns template content for the deploy wizard) ────────────────
  init: (template?: string) =>
    template
      ? saasApi.templates.get(template).then((t) => ({
          ...(t.content as Record<string, unknown>),
          templateSlug: t.slug,
        }))
      : Promise.resolve({}),

  // ── SaaS deploy — bypasses local SSE /api/deploy ─────────────────────────
  deployFn: async (config: {
    templateSlug: string
    namespace: string
    name: string
    resourceTier?: string
    envVars?: Record<string, string>
  }) => {
    try {
      await saasApi.deployments.create({
        namespace: config.namespace,
        name: config.name,
        templateSlug: config.templateSlug,
        resourceTier: (config.resourceTier as ResourceTier) ?? 'lightweight',
        agentCount: 1,
        configSnapshot: config.envVars ?? {},
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },

  // ── Wallet ────────────────────────────────────────────────────────────────
  wallet: {
    get: () => saasApi.wallet.get(),
    topUp: (amount: number) => saasApi.wallet.topUp(amount),
  },
}
