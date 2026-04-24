// Shared types for config management

export type ConfigEnv = 'dev' | 'staging' | 'prod'

export interface ConfigSchema {
  id: string
  name: string
  displayName: string
  description: string | null
  jsonSchema: Record<string, unknown>
  uiSchema: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ConfigValue {
  id: string
  schemaId: string
  environment: ConfigEnv
  version: number
  data: Record<string, unknown>
  isPublished: boolean
  publishedAt: string | null
  createdBy: string | null
  createdAt: string
}

export interface FeatureFlag {
  id: string
  key: string
  description: string | null
  envs: { dev: boolean; staging: boolean; prod: boolean }
  createdAt: string
  updatedAt: string
}

// API client (reads admin_token from localStorage)
const API_BASE = '/api/admin'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token') ?? ''
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  })
  if (res.status === 403) {
    localStorage.removeItem('admin_token')
    window.location.reload()
    throw new Error('Admin access denied')
  }
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

async function apiFetchNoAdmin<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token') ?? ''
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

// ── Schema APIs ────────────────────────────────────────────────────────────
export const configApi = {
  listSchemas: () => apiFetch<ConfigSchema[]>('/config/schemas'),
  getSchema: (id: string) => apiFetch<ConfigSchema>(`/config/schemas/${id}`),
  createSchema: (data: {
    name: string
    displayName: string
    description?: string
    jsonSchema: Record<string, unknown>
    uiSchema?: Record<string, unknown>
  }) =>
    apiFetch<ConfigSchema>('/config/schemas', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSchema: (
    id: string,
    data: Partial<{
      displayName: string
      description: string
      jsonSchema: Record<string, unknown>
      uiSchema: Record<string, unknown>
    }>,
  ) =>
    apiFetch<ConfigSchema>(`/config/schemas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSchema: (id: string) =>
    apiFetch<{ ok: boolean }>(`/config/schemas/${id}`, { method: 'DELETE' }),

  // Values
  getValues: (schemaName: string, env: ConfigEnv) =>
    apiFetch<{ schema: ConfigSchema; draft: ConfigValue | null; published: ConfigValue | null }>(
      `/config/values/${schemaName}?env=${env}`,
    ),
  saveDraft: (schemaName: string, env: ConfigEnv, data: Record<string, unknown> | unknown[]) =>
    apiFetch<ConfigValue>(`/config/values/${schemaName}?env=${env}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),
  publish: (schemaName: string, env: ConfigEnv) =>
    apiFetch<ConfigValue>(`/config/values/${schemaName}/publish?env=${env}`, { method: 'POST' }),
  getHistory: (schemaName: string, env: ConfigEnv) =>
    apiFetch<ConfigValue[]>(`/config/values/${schemaName}/history?env=${env}`),
  rollback: (schemaName: string, env: ConfigEnv, version: number) =>
    apiFetch<ConfigValue>(`/config/values/${schemaName}/rollback?env=${env}&version=${version}`, {
      method: 'POST',
    }),

  // Feature flags
  listFlags: () => apiFetch<FeatureFlag[]>('/config/flags'),
  createFlag: (data: {
    key: string
    description?: string
    envs?: { dev: boolean; staging: boolean; prod: boolean }
  }) => apiFetch<FeatureFlag>('/config/flags', { method: 'POST', body: JSON.stringify(data) }),
  updateFlag: (
    id: string,
    data: { description?: string; envs: { dev: boolean; staging: boolean; prod: boolean } },
  ) => apiFetch<FeatureFlag>(`/config/flags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFlag: (id: string) =>
    apiFetch<{ ok: boolean }>(`/config/flags/${id}`, { method: 'DELETE' }),

  // Import JSON config
  importConfig: (schemaName: string, env: ConfigEnv, jsonData: string) => {
    const data = JSON.parse(jsonData) as Record<string, unknown>
    return apiFetch<ConfigValue>(`/config/values/${schemaName}?env=${env}`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    })
  },
}

export { apiFetch, apiFetchNoAdmin }
