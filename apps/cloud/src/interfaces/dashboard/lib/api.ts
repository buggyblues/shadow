const BASE = '/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Deployment {
  name: string
  namespace: string
  ready: string
  upToDate: string
  available: string
  age: string
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
  description: string
  teamName: string
  agentCount: number
  tags?: string[]
  namespace: string
}

export interface Settings {
  providers?: ProviderSettings[]
  [key: string]: unknown
}

export interface ProviderSettings {
  id: string
  api: string
  apiKey?: string
  baseUrl?: string
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
  id: number
  namespace: string
  templateSlug: string | null
  version: number | null
  status: string
  config: unknown
  agentCount: number | null
  error: string | null
  createdAt: string | null
  updatedAt: string | null
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function postRaw(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  health: () => get<{ status: string; timestamp: string }>('/health'),

  deployments: {
    list: () => get<Deployment[]>('/deployments'),
    pods: (namespace: string, id: string) =>
      get<Pod[]>(`/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/pods`),
    logsUrl: (namespace: string, id: string) =>
      `${BASE}/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/logs`,
    scale: (namespace: string, id: string, replicas: number) =>
      post<{ ok: boolean }>(
        `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/scale`,
        { replicas },
      ),
  },

  templates: {
    list: () => get<Template[]>('/templates'),
    get: (name: string) => get<Record<string, unknown>>(`/templates/${encodeURIComponent(name)}`),
    envRefs: (name: string) =>
      get<{ template: string; requiredEnvVars: string[] }>(
        `/templates/${encodeURIComponent(name)}/env-refs`,
      ),
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
        }>
      >('/my-templates'),
    get: (name: string) =>
      get<{
        name: string
        slug: string
        templateSlug: string | null
        content: unknown
        version: number
      }>(`/my-templates/${encodeURIComponent(name)}`),
    save: (name: string, content: unknown, templateSlug?: string) =>
      put<{ ok: boolean }>(`/my-templates/${encodeURIComponent(name)}`, { content, templateSlug }),
    fork: (sourceTemplate: string, newName?: string) =>
      post<{ name: string; slug: string }>('/my-templates/fork', {
        source: sourceTemplate,
        name: newName,
      }),
    delete: (name: string) =>
      fetch(`${BASE}/my-templates/${encodeURIComponent(name)}`, { method: 'DELETE' }).then((r) =>
        r.json(),
      ) as Promise<{ ok: boolean }>,
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
    importGit: (data: { url: string; name?: string; path?: string; branch?: string }) =>
      post<{ ok: boolean; name: string; source: string }>('/my-templates/import-git', data),
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
  },

  destroy: (options: { namespace?: string; stack?: string }) =>
    post<{ ok: boolean }>('/destroy', options),

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

  activity: {
    list: () => get<{ activities: Array<Record<string, unknown>> }>('/activity'),
    record: (entry: Record<string, unknown>) => post<{ success: boolean }>('/activity', entry),
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
      fetch(`${BASE}/secrets/${encodeURIComponent(providerId)}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }).then((r) => r.json()) as Promise<{ ok: boolean }>,
    deleteProvider: (providerId: string) =>
      fetch(`${BASE}/secrets/${encodeURIComponent(providerId)}`, { method: 'DELETE' }).then((r) =>
        r.json(),
      ) as Promise<{ ok: boolean }>,
  },

  env: {
    list: () =>
      get<{
        envVars: EnvVarListEntry[]
        groups: string[]
      }>('/env'),
    groups: () => get<{ groups: string[] }>('/env/groups'),
    createGroup: (name: string) => post<{ ok: boolean; name: string }>('/env/groups', { name }),
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
      fetch(`${BASE}/env/${encodeURIComponent(scope)}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }).then((r) => r.json()) as Promise<{ ok: boolean }>,
  },
}
