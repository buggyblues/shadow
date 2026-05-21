import { CLOUD_SAAS_RUNTIME_KEY } from '@shadowob/cloud'

export type CloudStoreModelProviderMode = 'official' | 'custom'
export type CloudSaasWorkloadBackend = 'agent-sandbox' | 'deployment'
export type CloudSaasWorkloadBackendSetting = CloudSaasWorkloadBackend | 'auto'

export const CLOUD_SAAS_WORKLOAD_BACKEND_ENV = 'CLOUD_SAAS_WORKLOAD_BACKEND'
export const CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED_ENV = 'CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED'
export const CLOUD_SAAS_SANDBOX_RUNTIME_CLASS_ENV = 'CLOUD_SAAS_SANDBOX_RUNTIME_CLASS'
export const CLOUD_SAAS_SANDBOX_NODE_SELECTOR_ENV = 'CLOUD_SAAS_SANDBOX_NODE_SELECTOR'

const CLOUD_SAAS_WORKLOAD_BACKENDS = new Set<CloudSaasWorkloadBackend>([
  'agent-sandbox',
  'deployment',
])
const CLOUD_SAAS_WORKLOAD_BACKEND_SETTINGS = new Set<CloudSaasWorkloadBackendSetting>([
  'agent-sandbox',
  'deployment',
  'auto',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function configUsesPlugin(value: unknown, pluginId: string, depth = 0): boolean {
  if (depth > 32 || !value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => configUsesPlugin(item, pluginId, depth + 1))

  const record = value as Record<string, unknown>
  if (record.plugin === pluginId) return true
  return Object.values(record).some((child) => configUsesPlugin(child, pluginId, depth + 1))
}

export function readCloudStoreModelProviderMode(
  configSnapshot: unknown,
): CloudStoreModelProviderMode | null {
  if (!isRecord(configSnapshot)) return null
  const runtime = configSnapshot[CLOUD_SAAS_RUNTIME_KEY]
  if (!isRecord(runtime)) return null

  if (runtime.modelProviderMode === 'official' || runtime.modelProviderMode === 'custom') {
    return runtime.modelProviderMode
  }
  if (runtime.officialModelProxy === true) return 'official'
  return null
}

function firstModelProviderOptions(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 32 || !value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstModelProviderOptions(item, depth + 1)
      if (found) return found
    }
    return null
  }

  const record = value as Record<string, unknown>
  if (record.plugin === 'model-provider' && isRecord(record.options)) {
    return record.options
  }
  for (const child of Object.values(record)) {
    const found = firstModelProviderOptions(child, depth + 1)
    if (found) return found
  }
  return null
}

function normalizeProviderProfileId(value: string | undefined | null): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') ?? ''
  )
}

function sanitizeModelProviderPreferences(options: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {}
  const profileId = options.profileId
  if (typeof profileId === 'string') {
    const normalized = normalizeProviderProfileId(profileId)
    if (normalized) sanitized.profileId = normalized
  }
  const profileIds = options.profileIds
  if (Array.isArray(profileIds)) {
    const normalized = profileIds
      .filter((id): id is string => typeof id === 'string')
      .map(normalizeProviderProfileId)
      .filter(Boolean)
      .slice(0, 8)
    if (normalized.length > 0) sanitized.profileIds = normalized
  }
  for (const key of ['selector', 'tag', 'model']) {
    const value = options[key]
    if (typeof value === 'string' && value.trim()) {
      sanitized[key] = value.trim().slice(0, 120)
    }
  }
  return sanitized
}

function applyModelProviderPreferences(value: unknown, preferences: Record<string, unknown>) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) applyModelProviderPreferences(item, preferences)
    return
  }

  const record = value as Record<string, unknown>
  if (record.plugin === 'model-provider') {
    record.options = {
      ...(isRecord(record.options) ? record.options : {}),
      ...preferences,
    }
  }
  for (const child of Object.values(record)) applyModelProviderPreferences(child, preferences)
}

export function readWorkloadBackendPreference(value: unknown): CloudSaasWorkloadBackend | null {
  if (!isRecord(value)) return null
  const deployments = value.deployments
  if (!isRecord(deployments)) return null
  const backend = deployments.backend
  return typeof backend === 'string' &&
    CLOUD_SAAS_WORKLOAD_BACKENDS.has(backend as CloudSaasWorkloadBackend)
    ? (backend as CloudSaasWorkloadBackend)
    : null
}

export function configuredWorkloadBackendPreference(
  env: Record<string, string | undefined> = process.env,
): CloudSaasWorkloadBackend {
  const backend = env[CLOUD_SAAS_WORKLOAD_BACKEND_ENV]?.trim()
  if (
    backend &&
    CLOUD_SAAS_WORKLOAD_BACKEND_SETTINGS.has(backend as CloudSaasWorkloadBackendSetting) &&
    backend !== 'auto'
  ) {
    return backend as CloudSaasWorkloadBackend
  }

  return env[CLOUD_SAAS_CLUSTER_SANDBOX_ENABLED_ENV] === 'true' ? 'agent-sandbox' : 'deployment'
}

function resolvedWorkloadBackendPreference(
  clientConfigSnapshot: unknown,
  env: Record<string, string | undefined> = process.env,
): CloudSaasWorkloadBackend {
  const configuredBackend = env[CLOUD_SAAS_WORKLOAD_BACKEND_ENV]?.trim()
  if (
    configuredBackend &&
    CLOUD_SAAS_WORKLOAD_BACKENDS.has(configuredBackend as CloudSaasWorkloadBackend)
  ) {
    return configuredBackend as CloudSaasWorkloadBackend
  }

  const clientBackend = readWorkloadBackendPreference(clientConfigSnapshot)
  if (clientBackend === 'deployment') return 'deployment'

  return configuredWorkloadBackendPreference(env)
}

function configuredSandboxRuntimeClassPreference(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const runtimeClassName = env[CLOUD_SAAS_SANDBOX_RUNTIME_CLASS_ENV]?.trim()
  return runtimeClassName || null
}

function configuredSandboxNodeSelectorPreference(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> | null {
  const raw = env[CLOUD_SAAS_SANDBOX_NODE_SELECTOR_ENV]?.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return null
    const entries = Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' && typeof entry[1] === 'string',
    )
    return entries.length > 0 ? Object.fromEntries(entries) : null
  } catch {
    return null
  }
}

function workloadBackendPolicyFor(
  backend: CloudSaasWorkloadBackend,
  env: Record<string, string | undefined> = process.env,
): 'sandbox-required' | 'sandbox-preferred' | 'deployment-only' {
  const configuredBackend = env[CLOUD_SAAS_WORKLOAD_BACKEND_ENV]?.trim()
  if (backend === 'deployment') return 'deployment-only'
  return configuredBackend === 'agent-sandbox' ? 'sandbox-required' : 'sandbox-preferred'
}

export function applyWorkloadBackendPreference(
  snapshot: Record<string, unknown>,
  clientConfigSnapshot: unknown,
  env?: Record<string, string | undefined>,
) {
  const backend = resolvedWorkloadBackendPreference(clientConfigSnapshot, env)

  snapshot.deployments = {
    ...(isRecord(snapshot.deployments) ? snapshot.deployments : {}),
    backend,
    backendPolicy: workloadBackendPolicyFor(backend, env),
  }

  const runtimeClassName = configuredSandboxRuntimeClassPreference(env)
  const nodeSelector = configuredSandboxNodeSelectorPreference(env)
  if (backend === 'agent-sandbox' && runtimeClassName) {
    const deployments = snapshot.deployments as Record<string, unknown>
    deployments.sandbox = {
      ...(isRecord(deployments.sandbox) ? deployments.sandbox : {}),
      runtimeClassName,
    }
  }
  if (backend === 'agent-sandbox' && nodeSelector) {
    const deployments = snapshot.deployments as Record<string, unknown>
    const scheduling = isRecord(deployments.scheduling) ? deployments.scheduling : {}
    deployments.scheduling = {
      ...scheduling,
      nodeSelector: {
        ...nodeSelector,
        ...(isRecord(scheduling.nodeSelector) ? scheduling.nodeSelector : {}),
      },
    }
  }
}

export function applySafeDeploymentPreferences(
  serverTemplateSnapshot: Record<string, unknown>,
  clientConfigSnapshot: unknown,
  env?: Record<string, string | undefined>,
) {
  const snapshot = structuredClone(serverTemplateSnapshot) as Record<string, unknown>
  applyWorkloadBackendPreference(snapshot, clientConfigSnapshot, env)
  if (!configUsesPlugin(snapshot, 'model-provider') || !isRecord(clientConfigSnapshot)) {
    return snapshot
  }

  const clientOptions = firstModelProviderOptions(clientConfigSnapshot)
  if (clientOptions) {
    const preferences = sanitizeModelProviderPreferences(clientOptions)
    if (Object.keys(preferences).length > 0) {
      applyModelProviderPreferences(snapshot, preferences)
    }
  }

  const modelProviderMode = readCloudStoreModelProviderMode(clientConfigSnapshot)
  if (modelProviderMode) {
    snapshot[CLOUD_SAAS_RUNTIME_KEY] = {
      ...(isRecord(snapshot[CLOUD_SAAS_RUNTIME_KEY])
        ? (snapshot[CLOUD_SAAS_RUNTIME_KEY] as Record<string, unknown>)
        : {}),
      modelProviderMode,
    }
  }

  return snapshot
}
