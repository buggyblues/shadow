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

import { api } from '@shadowob/cloud-ui/lib/api'
import type { CloudApiClient } from '@shadowob/cloud-ui/lib/api-context'
import { saasApi } from './api'

// Build a partial override that matches CloudApiClient shape
// for the saas-relevant subset, falling back to the local `api`
// for anything not reachable from the web-saas router.
export const saasApiAdapter: CloudApiClient = {
  ...api,

  // ── Community (StorePage uses api.community.catalog) ─────────────────────
  community: {
    ...api.community,
    catalog: (_locale: string) =>
      saasApi.templates.list().then((rows) => ({
        source: 'community' as const,
        templates: rows.map((t) => ({
          name: t.slug,
          namespace: '',
          description: t.description ?? '',
          teamName: 'Shadow Cloud',
          agentCount: 0,
          tags: Array.isArray(t.tags) ? t.tags : [],
          category:
            (t.category as import('@shadowob/cloud-ui/lib/api').TemplateCategoryId) ?? 'demo',
          emoji: '☁️',
          featured: t.source === 'official',
          popularity: t.deployCount,
          difficulty: (t.category === 'advanced'
            ? 'advanced'
            : t.category === 'intermediate'
              ? 'intermediate'
              : 'beginner') as import('@shadowob/cloud-ui/lib/api').TemplateDifficulty,
          estimatedDeployTime: '5 min',
          overview: [],
          features: [],
          highlights: [],
        })),
        categories: [],
      })),
  },

  // ── Templates ────────────────────────────────────────────────────────────
  templates: {
    ...api.templates,
    // list all approved templates from the server-side store
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
        templates: rows.map((t) => ({
          name: t.slug,
          namespace: '',
          description: t.description ?? '',
          teamName: 'Shadow Cloud',
          agentCount: 0,
          tags: t.tags ?? [],
          category:
            (t.category as import('@shadowob/cloud-ui/lib/api').TemplateCategoryId) ?? 'demo',
          emoji: '☁️',
          featured: t.source === 'official',
          popularity: t.deployCount,
          difficulty: 'beginner' as const,
          estimatedDeployTime: '5 min',
          overview: [],
          features: [],
          highlights: [],
        })),
        categories: [],
      })),
    detail: (name: string, _locale: string) =>
      saasApi.templates.get(name).then((t) => ({
        template: {
          name: t.slug,
          namespace: '',
          description: t.description ?? '',
          teamName: 'Shadow Cloud',
          agentCount: 0,
          tags: t.tags ?? [],
          category:
            (t.category as import('@shadowob/cloud-ui/lib/api').TemplateCategoryId) ?? 'demo',
          emoji: '☁️',
          featured: t.source === 'official',
          popularity: t.deployCount,
          difficulty: 'beginner' as const,
          estimatedDeployTime: '5 min',
          overview: [],
          features: [],
          highlights: [],
          file: '',
          lastUpdated: t.updatedAt,
          useCases: [],
          requirements: [],
          requiredEnvVars: [],
        },
      })),
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
    scale: (namespace: string, _id: string, agentCount: number) =>
      saasApi.deployments.scale(namespace, agentCount).then(() => ({ ok: true })),
  },

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
}
