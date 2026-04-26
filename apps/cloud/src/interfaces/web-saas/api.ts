import type {
  CostOverviewSummary,
  DeploymentLogsPage,
  NamespaceCostSummary,
} from '@shadowob/cloud-ui/lib/api'

/**
 * SaaS API Client — wraps /api/cloud-saas/* endpoints on apps/server.
 * Used by web-saas pages (embedded in apps/web at /cloud/*).
 */

export const BASE = '/api/cloud-saas'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('accessToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: getAuthHeaders() })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: getAuthHeaders() })
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResourceTier = 'lightweight' | 'standard' | 'pro'

export interface SaasTemplate {
  id: string
  slug: string
  name: string
  description: string | null
  source: 'official' | 'community'
  reviewStatus: 'draft' | 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  tags: string[] | null
  category: string | null
  deployCount: number
  rating: number | null
  baseCost: number | null
  authorId: string | null
  content: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SaasDeployment {
  id: string
  userId: string
  clusterId: string | null
  namespace: string
  name: string
  status:
    | 'pending'
    | 'deploying'
    | 'cancelling'
    | 'deployed'
    | 'failed'
    | 'destroying'
    | 'destroyed'
  agentCount: number
  configSnapshot: Record<string, unknown> | null
  errorMessage: string | null
  templateSlug: string | null
  resourceTier: ResourceTier | null
  monthlyCost: number | null
  saasMode: boolean
  createdAt: string
  updatedAt: string
}

export interface SaasEnvVar {
  id: string
  key: string
  scope: string
  groupId: string | null
  groupName?: string | null
  createdAt: string
  updatedAt: string
}

export interface SaasWallet {
  balance: number
}

export interface SaasTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  referenceId: string | null
  referenceType: string | null
  note: string | null
  createdAt: string
}

export interface SaasActivityEntry {
  id: string
  type: string
  namespace: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface SaasProviderCatalog {
  pluginId: string
  pluginName: string
  provider: {
    id: string
    api: string
    baseUrl?: string
    envKey: string
    envKeyAliases?: string[]
    baseUrlEnvKey?: string
    modelEnvKey?: string
    priority?: number
    models: Array<{
      id: string
      name?: string
      tags?: string[]
      contextWindow?: number
      maxTokens?: number
    }>
  }
  secretFields: Array<{
    key: string
    label?: string
    description?: string
    required?: boolean
    sensitive?: boolean
  }>
}

export interface SaasProviderProfile {
  id: string
  providerId: string
  name: string
  scope: string
  enabled: boolean
  config: Record<string, unknown>
  envVars: Array<{ key: string; maskedValue: string; isSecret: boolean }>
  updatedAt?: string
}

export interface SaasProviderTestResult {
  ok: boolean
  status?: number | null
  message?: string
  error?: string
  checkedAt?: string
}

// ── API ───────────────────────────────────────────────────────────────────────

export const saasApi = {
  schema: () => get<Record<string, unknown>>('/schema'),
  validate: (config: unknown) =>
    post<{
      valid: boolean
      agents: number
      configurations: number
      violations: Array<{ path: string; prefix: string }>
      extendsErrors: string[]
      templateRefs: { env: number; secret: number; file: number }
    }>('/validate', config),

  // Templates
  templates: {
    list: (params?: { category?: string; q?: string }) => {
      const qs = new URLSearchParams()
      if (params?.category) qs.set('category', params.category)
      if (params?.q) qs.set('q', params.q)
      const query = qs.toString()
      return get<SaasTemplate[]>(`/templates${query ? `?${query}` : ''}`)
    },
    mine: () => get<SaasTemplate[]>('/templates/mine'),
    mineOne: (slug: string) => get<SaasTemplate>(`/templates/mine/${encodeURIComponent(slug)}`),
    get: (slug: string) => get<SaasTemplate>(`/templates/${encodeURIComponent(slug)}`),
    envRefs: (slug: string) =>
      get<{ template: string; requiredEnvVars: string[] }>(
        `/templates/${encodeURIComponent(slug)}/env-refs`,
      ),
    create: (data: {
      slug: string
      name: string
      description?: string
      content: Record<string, unknown>
      tags?: string[]
      category?: string
      baseCost?: number
    }) => post<SaasTemplate>('/templates', data),
    update: (
      slug: string,
      data: {
        name?: string
        description?: string
        content?: Record<string, unknown>
        tags?: string[]
        category?: string
        baseCost?: number
      },
    ) => put<SaasTemplate>(`/templates/${encodeURIComponent(slug)}`, data),
    submit: (slug: string) => post<SaasTemplate>(`/templates/${encodeURIComponent(slug)}/submit`),
    delete: (slug: string) => del<{ ok: boolean }>(`/templates/${encodeURIComponent(slug)}`),
  },

  // Deployments
  deployments: {
    list: (params?: { limit?: number; offset?: number }) =>
      get<SaasDeployment[]>(
        `/deployments${params ? `?limit=${params.limit ?? 50}&offset=${params.offset ?? 0}` : ''}`,
      ),
    get: (id: string) => get<SaasDeployment>(`/deployments/${encodeURIComponent(id)}`),
    create: (data: {
      namespace: string
      name: string
      templateSlug: string
      resourceTier: ResourceTier
      agentCount?: number
      configSnapshot: Record<string, unknown>
      envVars?: Record<string, string>
    }) => post<SaasDeployment>('/deployments', data),
    delete: (id: string) => del<{ ok: boolean }>(`/deployments/${encodeURIComponent(id)}`),
    costs: () => get<CostOverviewSummary>('/deployments/costs'),
    namespaceCosts: (id: string) =>
      get<NamespaceCostSummary>(`/deployments/${encodeURIComponent(id)}/costs`),
    scale: (id: string, agentCount: number) =>
      post<SaasDeployment>(`/deployments/${encodeURIComponent(id)}/scale`, { agentCount }),
    logsUrl: (id: string) => `${BASE}/deployments/${encodeURIComponent(id)}/logs`,
    logsHistory: (
      id: string,
      params?: { agent?: string; pod?: string; page?: number; limit?: number },
    ) => {
      const qs = new URLSearchParams()
      if (params?.agent) qs.set('agent', params.agent)
      if (params?.pod) qs.set('pod', params.pod)
      if (params?.page) qs.set('page', String(params.page))
      if (params?.limit) qs.set('limit', String(params.limit))
      const query = qs.toString()
      return get<DeploymentLogsPage>(
        `/deployments/${encodeURIComponent(id)}/logs/history${query ? `?${query}` : ''}`,
      )
    },
    cancel: (id: string) =>
      post<{ ok: boolean; status?: 'cancelling' }>(
        `/deployments/${encodeURIComponent(id)}/cancel`,
        {},
      ),
    pods: (id: string) =>
      get<{
        pods: Array<{
          name: string
          status: string
          ready: string
          restarts: number
          age: string
          containers: string[]
        }>
      }>(`/deployments/${encodeURIComponent(id)}/pods`),
    podLogsUrl: (id: string, pod: string, opts?: { tail?: number; container?: string }) => {
      const qs = new URLSearchParams({ pod })
      if (opts?.tail) qs.set('tail', String(opts.tail))
      if (opts?.container) qs.set('container', opts.container)
      return `${BASE}/deployments/${encodeURIComponent(id)}/pod-logs?${qs.toString()}`
    },
    listOrphans: () =>
      get<{
        items: SaasDeployment[]
        _orphans?: string[]
      }>(`/deployments?includeOrphans=1`),
    claimOrphan: (namespace: string) =>
      post<{ ok: boolean; deployment: SaasDeployment }>(
        `/deployments/orphans/${encodeURIComponent(namespace)}/claim`,
        {},
      ),
    cleanupOrphan: (namespace: string) =>
      post<{ ok: boolean }>(`/deployments/orphans/${encodeURIComponent(namespace)}/cleanup`, {}),
  },

  // Env vars
  envvars: {
    list: (deploymentId: string) =>
      get<SaasEnvVar[]>(`/envvars/${encodeURIComponent(deploymentId)}`),
    update: (deploymentId: string, vars: Array<{ key: string; value: string }>) =>
      put<{ ok: boolean }>(`/envvars/${encodeURIComponent(deploymentId)}`, { vars }),
    getOne: (deploymentId: string, key: string) =>
      get<{
        envVar: { scope: string; key: string; value: string; isSecret: boolean; groupName: string }
      }>(`/envvars/${encodeURIComponent(deploymentId)}/${encodeURIComponent(key)}`),
    delete: (deploymentId: string, key: string) =>
      del<{ ok: boolean }>(
        `/envvars/${encodeURIComponent(deploymentId)}/${encodeURIComponent(key)}`,
      ),
  },

  // Wallet
  // NOTE: top-up is intentionally not exposed here. Use the host app's Stripe
  // recharge flow (window event 'shadow:open-recharge') instead.
  wallet: {
    get: () => get<SaasWallet>('/wallet'),
    transactions: (params?: { limit?: number; offset?: number }) =>
      get<{ transactions: SaasTransaction[]; total: number; limit: number; offset: number }>(
        `/wallet/transactions${params ? `?limit=${params.limit ?? 50}&offset=${params.offset ?? 0}` : ''}`,
      ),
  },

  // Activity
  activity: {
    list: (params?: { limit?: number; offset?: number }) =>
      get<SaasActivityEntry[]>(
        `/activity${params ? `?limit=${params.limit ?? 50}&offset=${params.offset ?? 0}` : ''}`,
      ),
  },

  // Global Env Vars (Secrets page — not scoped to a deployment)
  globalEnvVars: {
    list: () =>
      get<{
        envVars: Array<{
          scope: string
          key: string
          maskedValue: string
          isSecret: boolean
          groupName: string
        }>
        groups: string[]
      }>('/global-envvars'),
    groups: () =>
      get<{ groups: string[] }>('/global-envvars').then((response) => ({
        groups: response.groups,
      })),
    getOne: (key: string) =>
      get<{
        envVar: { scope: string; key: string; value: string; isSecret: boolean; groupName: string }
      }>(`/global-envvars/${encodeURIComponent(key)}`),
    upsert: (key: string, value: string, isSecret?: boolean, groupName?: string) =>
      put<{ ok: boolean }>('/global-envvars', { key, value, isSecret, groupName }),
    delete: (key: string) => del<{ ok: boolean }>(`/global-envvars/${encodeURIComponent(key)}`),
    createGroup: (name: string) =>
      post<{ ok: boolean; name: string }>('/global-envvars/groups', { name }),
    deleteGroup: (name: string) =>
      del<{ ok: boolean }>(`/global-envvars/groups/${encodeURIComponent(name)}`),
  },

  // Provider Profiles
  providerCatalogs: {
    list: () => get<{ providers: SaasProviderCatalog[] }>('/provider-catalogs'),
  },
  providerProfiles: {
    list: () => get<{ profiles: SaasProviderProfile[] }>('/provider-profiles'),
    upsert: (data: {
      id?: string
      providerId: string
      name: string
      enabled?: boolean
      config?: Record<string, unknown>
      envVars?: Record<string, string>
    }) => put<{ ok: boolean; profile?: SaasProviderProfile }>('/provider-profiles', data),
    test: (id: string) =>
      post<SaasProviderTestResult>(`/provider-profiles/${encodeURIComponent(id)}/test`, {}),
    delete: (id: string) => del<{ ok: boolean }>(`/provider-profiles/${encodeURIComponent(id)}`),
  },
}
