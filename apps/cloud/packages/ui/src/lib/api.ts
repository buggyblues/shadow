const BASE = '/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Deployment {
  name: string
  namespace: string
  ready: string
  upToDate: string
  available: string
  age: string
  status?: string
  workloadKind?: 'deployment' | 'agent-sandbox'
  runtimeState?: 'running' | 'paused' | 'resuming' | 'failed' | 'unknown'
  sandboxName?: string
  serviceFQDN?: string
  statePvc?: string
  pausedAt?: string
  lastActiveAt?: string
}

export type DeploymentRedeployMode = 'snapshot' | 'template'

export interface DeploymentRedeployOptions {
  mode?: DeploymentRedeployMode
  templateSlug?: string
  configSnapshot?: Record<string, unknown>
  envVars?: Record<string, string>
  runtimeContext?: { locale?: string; timezone?: string }
}

export interface DeploymentManifestInfo {
  deploymentId: string | number | null
  namespace: string
  name?: string
  templateSlug: string | null
  template: {
    id: string
    slug: string
    name: string
    description?: string | null
    source: string
    reviewStatus: string
    updatedAt: string | null
    ownedByUser?: boolean
    editable?: boolean
    contentHash?: string | null
  } | null
  manifest: {
    schemaVersion: number
    revision: number
    manifestId: string
    source: string
    generatedAt: string | null
    configHash: string | null
    manifestHash: string | null
    templateSlug: string | null
    templateId: string | null
    templateName: string | null
    templateSource: string | null
    templateReviewStatus: string | null
    templateUpdatedAt: string | null
    templateContentHash: string | null
  } | null
  drift: {
    status: 'up-to-date' | 'template-updated' | 'missing-template' | 'unlinked' | 'unknown'
    templateAvailable: boolean
    templateChanged: boolean
    deployedTemplateHash: string | null
    currentTemplateHash: string | null
    configHash: string | null
  }
  configSnapshot?: Record<string, unknown> | null
}

export interface DeploymentTemplateSyncResult {
  ok: boolean
  action: 'updated' | 'forked'
  template: {
    id?: string
    slug: string
    name: string
    source?: string
    reviewStatus?: string
    updatedAt?: string | null
  }
  manifest?: DeploymentManifestInfo | Partial<DeploymentManifestInfo>
}

export interface DeploymentBackup {
  id: string
  restoreKey?: string
  deploymentId: string | null
  namespace: string
  agentId: string
  sandboxName: string | null
  pvcName: string
  driver: 'volumeSnapshot' | 'restic' | 'git' | string
  snapshotName: string | null
  objectKey: string | null
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'expired' | string
  phase?: string | null
  error: string | null
  expiresAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface GitConnection {
  id: string
  provider: string
  name: string
  accountLogin: string
  accountName: string | null
  scopes: unknown
  lastUsedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface GitRepository {
  repository: string
  private: boolean
  defaultBranch: string
  pushedAt: string | null
  permissions: { pull?: boolean; push?: boolean; admin?: boolean } | null
}

export interface Pod {
  name: string
  ready: string
  status: string
  restarts: string
  age: string
}

export interface Template {
  name: string
  title: string
  description: string
  agentCount: number
  tags?: string[]
  namespace: string
}

export type TemplateCategoryId =
  | 'devops'
  | 'security'
  | 'support'
  | 'research'
  | 'monitoring'
  | 'business'
  | 'education'
  | 'demo'

export type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface TemplateCategoryInfo {
  id: TemplateCategoryId | 'all'
  label: string
  emoji: string
  description: string
}

export interface TemplateCatalogSummary extends Template {
  category: TemplateCategoryId
  emoji: string
  featured: boolean
  popularity: number
  difficulty: TemplateDifficulty
  estimatedDeployTime: string
  overview: string[]
  features: string[]
  highlights: string[]
}

export interface TemplateCatalogDetail extends TemplateCatalogSummary {
  file: string
  lastUpdated: string | null
  useCases: string[]
  requirements: string[]
  requiredEnvVars: string[]
  fields?: TemplateEnvField[]
}

export interface TemplateEnvField {
  key: string
  label: string
  description?: string
  required: boolean
  sensitive: boolean
  placeholder?: string
  source: 'template' | 'plugin'
  sourceId: string
  sourceLabel: string
  helpUrl?: string
}

export interface Settings {
  providers?: ProviderSettings[]
  [key: string]: unknown
}

export interface CommunitySettings {
  baseUrl: string
  oauthConnected: boolean
  hasToken: boolean
}

export interface CommunityCatalogResponse {
  templates: TemplateCatalogSummary[]
  categories: TemplateCategoryInfo[]
  source: 'community' | 'local'
}

export interface ProviderSettings {
  id: string
  api: string
  apiKey?: string
  baseUrl?: string
}

export interface ProviderCatalogEntry {
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
    placeholder?: string
  }>
}

export interface LlmProviderModel {
  id: string
  name?: string
  tags?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: {
    input?: number
    output?: number
  }
  capabilities?: {
    vision?: boolean
    tools?: boolean
    reasoning?: boolean
  }
}

export interface ProviderProfile {
  id: string
  providerId: string
  name: string
  scope: string
  enabled: boolean
  config: Record<string, unknown>
  envVars: Array<{ key: string; maskedValue: string; isSecret: boolean }>
  updatedAt?: string
}

export interface ProviderTestResult {
  ok: boolean
  status?: number | null
  message?: string
  error?: string
  checkedAt?: string
}

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
}

export interface DoctorResult {
  checks: DoctorCheck[]
  summary: { pass: number; warn: number; fail: number }
}

export interface ValidateResult {
  valid: boolean
  agents: number
  configurations: number
  violations: Array<{ path: string; prefix: string }>
  extendsErrors: string[]
  templateRefs: { env: number; secret: number; file: number }
}

export interface ImageInfo {
  name: string
  hasDockerfile: boolean
}

export interface RuntimeInfo {
  id: string
  name: string
  defaultImage: string
}

export interface PluginInfo {
  id: string
  name: string
  description: string
  category: string
  icon: string
  version: string
  capabilities: string[]
  tags: string[]
  auth: {
    type: string
    fields: Array<{
      key: string
      label: string
      description?: string
      required: boolean
      placeholder?: string
    }>
  }
  enabled: boolean
  hasSkills: boolean
  hasCli: boolean
  hasMcp: boolean
  hasChannel: boolean
}

export interface ConfigFile {
  path: string
  content: string
}

export interface DeployTask {
  id: number | string
  namespace: string
  templateSlug: string | null
  version: number | null
  status: string
  config: unknown
  agentCount: number | null
  error: string | null
  createdAt: string | null
  updatedAt: string | null
  blockedBy?: {
    id: number | string
    status: string
    namespace: string
    createdAt?: string | null
    updatedAt: string | null
  } | null
}

export interface DeployTaskListItem {
  task: DeployTask
  url: string
  active: boolean
}

export interface EnvVarListEntry {
  scope: string
  key: string
  maskedValue: string
  isSecret: boolean
  groupName: string
}

export interface EnvVarDetail {
  scope: string
  key: string
  value: string
  isSecret: boolean
  groupName: string
}

export interface DeploymentLogsPage {
  namespace: string
  agent: string
  podName: string
  page: number
  limit: number
  lines: string[]
  hasMore: boolean
}

export type BillingUnit = 'usd' | 'shrimp'

export interface ProviderUsageSummary {
  provider: string
  amountUsd: number | null
  usageLabel: string | null
  raw: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export interface AgentCostSummary {
  agentName: string
  podName: string | null
  totalUsd: number | null
  billingAmount: number | null
  billingUnit: BillingUnit
  totalTokens: number | null
  providers: ProviderUsageSummary[]
  source: 'json' | 'text' | 'telemetry' | 'unavailable'
  message: string | null
}

export interface NamespaceCostSummary {
  namespace: string
  totalUsd: number | null
  billingAmount: number | null
  billingUnit: BillingUnit
  totalTokens: number | null
  agents: AgentCostSummary[]
  availableAgents: number
  unavailableAgents: number
  generatedAt: string
}

export interface CostOverviewSummary {
  totalUsd: number | null
  billingAmount: number | null
  billingUnit: BillingUnit
  totalTokens: number | null
  namespaces: Array<{
    namespace: string
    totalUsd: number | null
    billingAmount: number | null
    billingUnit: BillingUnit
    totalTokens: number | null
    agentCount: number
    availableAgents: number
    unavailableAgents: number
  }>
  generatedAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export class ApiError extends Error {
  readonly status: number
  readonly method: HttpMethod
  readonly path: string
  readonly detail: string

  constructor(method: HttpMethod, path: string, status: number, detail = '') {
    const suffix = detail.trim() ? `: ${detail.trim()}` : ''
    super(`${method} ${path} failed: ${status}${suffix}`)
    this.name = 'ApiError'
    this.status = status
    this.method = method
    this.path = path
    this.detail = detail
  }
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  try {
    const token = window.localStorage.getItem('accessToken')
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...getAuthHeaders() }
}

function readApiErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return ''

  const payload = body as { error?: unknown; message?: unknown }
  const detail = payload.error ?? payload.message
  return typeof detail === 'string' ? detail : ''
}

async function readResponseText(response: Response): Promise<string> {
  return response
    .clone()
    .text()
    .catch(() => '')
}

async function buildApiError(
  response: Response,
  method: HttpMethod,
  path: string,
): Promise<ApiError> {
  let detail = ''

  try {
    detail = readApiErrorMessage(await response.clone().json())
  } catch {
    detail = await readResponseText(response)
  }

  return new ApiError(method, path, response.status, detail)
}

async function readJson<T>(response: Response, method: HttpMethod, path: string): Promise<T> {
  const text = await response.text()
  if (!text.trim()) return undefined as T

  try {
    return JSON.parse(text) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ApiError(method, path, response.status, `Invalid JSON response: ${message}`)
  }
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? getAuthHeaders() : jsonHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) throw await buildApiError(response, method, path)

  return readJson<T>(response, method, path)
}

async function get<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

async function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body)
}

async function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path)
}

async function postRaw(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await buildApiError(res, 'POST', path)
  return res
}

async function extractTaskIdFromSse(response: Response): Promise<number | string | null> {
  const reader = response.body?.getReader()
  if (!reader) return null

  const decoder = new TextDecoder()
  let buffer = ''

  const readTaskId = (block: string): number | string | null => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()

    if (!data) return null

    try {
      const payload = JSON.parse(data) as { id?: unknown }
      if (payload.id === undefined || payload.id === null) return null

      if (typeof payload.id === 'number' && Number.isFinite(payload.id)) {
        return payload.id
      }

      if (typeof payload.id === 'string' && payload.id.trim().length > 0) {
        const numericId = Number(payload.id)
        return Number.isFinite(numericId) ? numericId : payload.id
      }
    } catch {
      // Ignore non-JSON stream events until the task id event arrives.
    }

    return null
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const taskId = readTaskId(block)
      if (taskId !== null) {
        void reader.cancel()
        return taskId
      }
    }
  }

  const taskId = readTaskId(buffer)
  if (taskId !== null) return taskId

  return null
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  health: () => get<{ status: string; timestamp: string }>('/health'),

  schema: () => get<Record<string, unknown>>('/schema'),

  deployments: {
    list: () => get<Deployment[]>('/deployments'),
    namespaces: () =>
      get<{ configured: string[]; discovered: string[]; all: string[] }>('/namespaces'),
    pods: (namespace: string, id: string) =>
      get<Pod[]>(`/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/pods`),
    logsHistory: (namespace: string, agent: string, page = 1, limit = 200) =>
      get<DeploymentLogsPage>(
        `/deployments/${encodeURIComponent(namespace)}/logs?agent=${encodeURIComponent(agent)}&page=${page}&limit=${limit}`,
      ),
    logsUrl: (namespace: string, id: string) =>
      `${BASE}/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/logs`,
    pause: (namespace: string, id: string) =>
      post<{ ok: boolean; name: string; namespace: string; runtimeState: string }>(
        `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/pause`,
        {},
      ),
    resume: (namespace: string, id: string) =>
      post<{ ok: boolean; name: string; namespace: string; runtimeState: string }>(
        `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/resume`,
        {},
      ),
    backups: (namespace: string, id: string) =>
      get<{ namespace: string; agent: string; backups: DeploymentBackup[] }>(
        `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/backups`,
      ),
    createBackup: (
      namespace: string,
      id: string,
      body?: {
        driver?: 'volumeSnapshot' | 'restic'
        retentionDays?: number
        target?: {
          type: 'github'
          repository: string
          branch?: string
          pathPrefix?: string
          token?: string
          connectionId?: string
        }
      },
    ) =>
      post<{ ok: boolean; backup: DeploymentBackup }>(
        `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/backups`,
        body ?? {},
      ),
    restore: (
      namespace: string,
      id: string,
      body?: {
        backupId?: string
        target?: { type: 'github'; connectionId?: string; token?: string }
      },
    ) =>
      post<{ ok: boolean; backup: DeploymentBackup; runtimeState: string }>(
        `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/restore`,
        body ?? {},
      ),
    costs: () => get<CostOverviewSummary>('/deployments/costs'),
    namespaceCosts: (namespace: string) =>
      get<NamespaceCostSummary>(`/deployments/${encodeURIComponent(namespace)}/costs`),
    manifest: (namespace: string) =>
      get<DeploymentManifestInfo>(`/deployments/${encodeURIComponent(namespace)}/manifest`),
    syncTemplate: (
      namespace: string,
      body?: {
        name?: string
        description?: string
        content?: Record<string, unknown>
        tags?: string[]
        category?: string
        baseCost?: number
      },
    ) =>
      post<DeploymentTemplateSyncResult>(
        `/deployments/${encodeURIComponent(namespace)}/template`,
        body ?? {},
      ),
    env: {
      list: (namespace: string, mode: 'effective' | 'scoped' = 'effective') =>
        get<{
          namespace: string
          scope: string
          mode: 'effective' | 'scoped'
          envVars: EnvVarListEntry[]
        }>(`/deployments/${encodeURIComponent(namespace)}/env?mode=${mode}`),
      getOne: (namespace: string, key: string) =>
        get<{ envVar: EnvVarDetail }>(
          `/deployments/${encodeURIComponent(namespace)}/env/${encodeURIComponent(key)}`,
        ),
      upsert: (
        namespace: string,
        key: string,
        value: string,
        isSecret?: boolean,
        groupName?: string,
      ) =>
        put<{ ok: boolean }>(`/deployments/${encodeURIComponent(namespace)}/env`, {
          key,
          value,
          isSecret,
          groupName,
        }),
      delete: (namespace: string, key: string) =>
        del<{ ok: boolean }>(
          `/deployments/${encodeURIComponent(namespace)}/env/${encodeURIComponent(key)}`,
        ),
    },
  },
  github: {
    connections: () => get<{ connections: GitConnection[] }>('/github/connections'),
    connect: (data: { token: string; name?: string; connectionId?: string }) =>
      post<{ ok: boolean; connection: GitConnection }>('/github/connections', data),
    disconnect: (id: string) =>
      del<{ ok: boolean }>(`/github/connections/${encodeURIComponent(id)}`),
    repositories: (connectionId: string, page = 1) =>
      get<{ repositories: GitRepository[] }>(
        `/github/repositories?connectionId=${encodeURIComponent(connectionId)}&page=${page}`,
      ),
    templatePreview: (data: {
      connectionId: string
      repository: string
      branch?: string
      path?: string
    }) =>
      post<{
        ok: boolean
        template: {
          repository: string
          branch?: string
          path: string
          sha: string | null
          url: string | null
          content: Record<string, unknown>
        }
      }>('/github/template-preview', data),
  },

  templates: {
    list: () => get<Template[]>('/templates'),
    listByLocale: (locale: string) =>
      get<Template[]>(`/templates?locale=${encodeURIComponent(locale)}`),
    catalog: (locale: string) =>
      get<{ templates: TemplateCatalogSummary[]; categories: TemplateCategoryInfo[] }>(
        `/templates/catalog?locale=${encodeURIComponent(locale)}`,
      ),
    detail: (name: string, locale: string) =>
      get<{ template: TemplateCatalogDetail }>(
        `/templates/${encodeURIComponent(name)}/details?locale=${encodeURIComponent(locale)}`,
      ),
    get: (name: string) => get<Record<string, unknown>>(`/templates/${encodeURIComponent(name)}`),
    envRefs: (name: string) =>
      get<{
        template: string
        requiredEnvVars: string[]
        fields?: TemplateEnvField[]
        autoDetectedEnvVars?: string[]
      }>(`/templates/${encodeURIComponent(name)}/env-refs`),
  },

  // ── My Templates (forked / custom) ────────────────────────────────────
  myTemplates: {
    list: () =>
      get<
        Array<{
          name: string
          slug: string
          templateSlug: string | null
          content: unknown
          version: number
          updatedAt: string
          reviewStatus?: 'draft' | 'pending' | 'approved' | 'rejected'
          reviewNote?: string | null
          source?: 'official' | 'community'
        }>
      >('/my-templates'),
    get: (name: string) =>
      get<{
        name: string
        slug: string
        templateSlug: string | null
        content: unknown
        version: number
        reviewStatus?: 'draft' | 'pending' | 'approved' | 'rejected'
        reviewNote?: string | null
        source?: 'official' | 'community'
      }>(`/my-templates/${encodeURIComponent(name)}`),
    save: (name: string, content: unknown, templateSlug?: string) =>
      put<{ ok: boolean }>(`/my-templates/${encodeURIComponent(name)}`, { content, templateSlug }),
    fork: (sourceTemplate: string, newName?: string) =>
      post<{ name: string; slug: string }>('/my-templates/fork', {
        source: sourceTemplate,
        name: newName,
      }),
    delete: (name: string) => del<{ ok: boolean }>(`/my-templates/${encodeURIComponent(name)}`),
    versions: (name: string) =>
      get<{
        current: number
        versions: Array<{ version: number; createdAt: string | null; current: boolean }>
      }>(`/my-templates/${encodeURIComponent(name)}/versions`),
    restoreVersion: (name: string, version: number) =>
      post<{ ok: boolean; restoredVersion: number }>(
        `/my-templates/${encodeURIComponent(name)}/versions/${version}`,
        {},
      ),
    share: (name: string) =>
      get<{
        name: string
        templateSlug: string | null
        version: number
        content: unknown
        sharedAt: string
      }>(`/my-templates/${encodeURIComponent(name)}/share`),
    import: (data: { name: string; content: unknown; templateSlug?: string }) =>
      post<{ ok: boolean; name: string }>('/my-templates/import', data),
    importGit: (data: {
      url?: string
      connectionId?: string
      repository?: string
      name?: string
      path?: string
      branch?: string
    }) => post<{ ok: boolean; name: string; source: string }>('/my-templates/import-git', data),
  },

  deploy: (config: unknown) => postRaw('/deploy', config),

  deployTasks: {
    list: () => get<{ tasks: DeployTaskListItem[] }>('/deploy-tasks'),
    get: (id: number | string) =>
      get<{ task: DeployTask; url: string; active: boolean }>(
        `/deploy-tasks/${encodeURIComponent(String(id))}`,
      ),
    streamUrl: (id: number | string) =>
      `${BASE}/deploy-tasks/${encodeURIComponent(String(id))}/stream`,
    redeploy: (id: number | string, options?: DeploymentRedeployOptions) =>
      postRaw(`/deploy-tasks/${encodeURIComponent(String(id))}/redeploy`, options ?? {}),
    redeployToTaskId: async (id: number | string, options?: DeploymentRedeployOptions) => {
      const response = await postRaw(
        `/deploy-tasks/${encodeURIComponent(String(id))}/redeploy`,
        options ?? {},
      )
      return extractTaskIdFromSse(response)
    },
    cancel: (id: number | string) =>
      post<{
        ok: boolean
        status?: string
      }>(`/deploy-tasks/${encodeURIComponent(String(id))}/cancel`, {}),
    redeployUrl: (id: number | string) =>
      `${BASE}/deploy-tasks/${encodeURIComponent(String(id))}/redeploy`,
  },

  destroy: (options: { namespace?: string; stack?: string }) =>
    post<{ ok: boolean; taskId?: number | string; status?: string }>('/destroy', options),

  rollback: (options: { namespace: string }) =>
    post<{ ok: boolean; namespace: string }>('/rollback', options),

  validate: (config: unknown) => post<ValidateResult>('/validate', config),

  doctor: () => get<DoctorResult>('/doctor'),

  init: (template?: string) => post<Record<string, unknown>>('/init', { template }),

  generate: {
    manifests: (options: { config: unknown; namespace?: string }) =>
      post<{ manifests: unknown[]; count: number }>('/generate/manifests', options),
    openclawConfig: (options: { config: unknown; agentId: string }) =>
      post<{ config: Record<string, unknown> }>('/generate/openclaw-config', options),
  },

  images: () => get<ImageInfo[]>('/images'),

  config: {
    get: (path?: string) =>
      get<ConfigFile>(`/config${path ? `?path=${encodeURIComponent(path)}` : ''}`),
    put: (options: { path?: string; content: string }) => put<{ ok: boolean }>('/config', options),
  },

  runtimes: () => get<RuntimeInfo[]>('/runtimes'),

  settings: {
    get: () => get<Settings>('/settings'),
    put: (data: Settings) => put<{ ok: boolean }>('/settings', data),
  },

  providerCatalogs: {
    list: () => get<{ providers: ProviderCatalogEntry[] }>('/provider-catalogs'),
  },

  providerProfiles: {
    list: () => get<{ profiles: ProviderProfile[] }>('/provider-profiles'),
    upsert: (data: {
      id?: string
      providerId: string
      name: string
      enabled?: boolean
      config?: Record<string, unknown>
      envVars?: Record<string, string>
    }) => put<{ ok: boolean; profile?: ProviderProfile }>('/provider-profiles', data),
    test: (id: string) =>
      post<ProviderTestResult>(`/provider-profiles/${encodeURIComponent(id)}/test`, {}),
    refreshModels: (id: string) =>
      post<
        ProviderTestResult & {
          models?: LlmProviderModel[]
          profile?: ProviderProfile
        }
      >(`/provider-profiles/${encodeURIComponent(id)}/models/refresh`, {}),
    delete: (id: string) => del<{ ok: boolean }>(`/provider-profiles/${encodeURIComponent(id)}`),
  },

  activity: {
    list: () => get<{ activities: Array<Record<string, unknown>> }>('/activity'),
    record: (entry: object) => post<{ success: boolean }>('/activity', entry),
  },

  secrets: {
    list: () =>
      get<{
        secrets: Array<{ providerId: string; key: string; maskedValue: string; groupName: string }>
      }>('/secrets'),
    getByProvider: (providerId: string) =>
      get<{ secrets: Array<{ key: string; value: string }> }>(
        `/secrets/${encodeURIComponent(providerId)}`,
      ),
    upsert: (providerId: string, key: string, value: string, groupName?: string) =>
      put<{ ok: boolean }>(`/secrets/${encodeURIComponent(providerId)}`, { key, value, groupName }),
    delete: (providerId: string, key: string) =>
      del<{ ok: boolean }>(`/secrets/${encodeURIComponent(providerId)}/${encodeURIComponent(key)}`),
    deleteProvider: (providerId: string) =>
      del<{ ok: boolean }>(`/secrets/${encodeURIComponent(providerId)}`),
  },

  env: {
    list: () =>
      get<{
        envVars: EnvVarListEntry[]
        groups: string[]
      }>('/env'),
    groups: () => get<{ groups: string[] }>('/env/groups'),
    createGroup: (name: string) => post<{ ok: boolean; name: string }>('/env/groups', { name }),
    deleteGroup: (name: string) => del<{ ok: boolean }>(`/env/groups/${encodeURIComponent(name)}`),
    getByScope: (scope: string) =>
      get<{ envVars: Array<{ key: string; value: string; isSecret: boolean }> }>(
        `/env/${encodeURIComponent(scope)}`,
      ),
    getOne: (scope: string, key: string) =>
      get<{ envVar: EnvVarDetail }>(`/env/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`),
    upsert: (scope: string, key: string, value: string, isSecret?: boolean, groupName?: string) =>
      put<{ ok: boolean }>(`/env/${encodeURIComponent(scope)}`, {
        key,
        value,
        isSecret,
        groupName,
      }),
    delete: (scope: string, key: string) =>
      del<{ ok: boolean }>(`/env/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`),
  },

  community: {
    getSettings: () => get<CommunitySettings>('/community/settings'),
    putSettings: (data: { baseUrl?: string; token?: string }) =>
      put<{ ok: boolean }>('/community/settings', data),
    catalog: (locale: string) =>
      get<CommunityCatalogResponse>(
        `/community/templates/catalog?locale=${encodeURIComponent(locale)}`,
      ),
    oauthInit: () => get<{ url: string }>('/community/oauth/init'),
    publish: (name: string, opts?: { description?: string; visibility?: string }) =>
      post<{ ok: boolean; result: unknown }>('/community/templates/publish', {
        name,
        ...opts,
      }),
  },
}

// ── API Client type for dependency injection (e.g. web-saas mode) ──────────
export type CloudApiClient = typeof api & {
  /**
   * Optional SaaS-mode deploy override. When present, the deploy wizard calls
   * this instead of POSTing to the local `/api/deploy` SSE endpoint.
   * Should resolve to an SSEResult-like object: { success: boolean; error?: string }.
   */
  deployFn?: (config: {
    templateSlug: string
    namespace: string
    name: string
    resourceTier?: string
    configSnapshot?: Record<string, unknown>
    envVars?: Record<string, string>
    runtimeContext?: { locale?: string; timezone?: string }
  }) => Promise<{
    success: boolean
    error?: string
    deploymentId?: string
    status?:
      | 'pending'
      | 'deploying'
      | 'cancelling'
      | 'deployed'
      | 'paused'
      | 'resuming'
      | 'failed'
      | 'destroying'
      | 'destroyed'
  }>
  deploymentStatusFn?: (deploymentId: string) => Promise<{
    id: string
    status:
      | 'pending'
      | 'deploying'
      | 'cancelling'
      | 'deployed'
      | 'paused'
      | 'resuming'
      | 'failed'
      | 'destroying'
      | 'destroyed'
    errorMessage?: string | null
  }>
  deploymentLogsUrlFn?: (deploymentId: string) => string
  cancelDeploymentFn?: (deploymentId: string) => Promise<{
    ok: boolean
    status?:
      | 'pending'
      | 'deploying'
      | 'cancelling'
      | 'deployed'
      | 'paused'
      | 'resuming'
      | 'failed'
      | 'destroying'
      | 'destroyed'
  }>
}
