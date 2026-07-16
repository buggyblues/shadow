import { CLOUD_SAAS_RUNTIME_KEY } from '@shadowob/cloud'
import { isCloudComputerShellColor } from '@shadowob/shared'

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

function applyCloudComputerPreferences(
  snapshot: Record<string, unknown>,
  clientConfigSnapshot: Record<string, unknown>,
) {
  if (!isRecord(clientConfigSnapshot.cloudComputer)) return
  const requestedWorkspace = isRecord(clientConfigSnapshot.workspace)
    ? clientConfigSnapshot.workspace
    : {}
  snapshot.workspace = {
    ...(isRecord(snapshot.workspace) ? snapshot.workspace : {}),
    enabled: true,
    mountPath: '/workspace',
    storageSize: '10Gi',
    accessMode:
      requestedWorkspace.accessMode === 'ReadWriteMany' ? 'ReadWriteMany' : 'ReadWriteOnce',
  }

  const requestedOverlay = clientConfigSnapshot.cloudComputer
  const requestedAppearance = isRecord(requestedOverlay.appearance)
    ? requestedOverlay.appearance
    : {}
  const requestedComponents = isRecord(requestedOverlay.components)
    ? requestedOverlay.components
    : {}
  const requestedResources = isRecord(requestedOverlay.resources) ? requestedOverlay.resources : {}
  const requestedBaseAgentId = safeCloudComputerId(requestedOverlay.baseAgentId)
  const requestedInstanceId = safeCloudComputerInstanceId(requestedOverlay.instanceId)
  const requestedSchemaVersion = requestedOverlay.schemaVersion === 2 ? 2 : undefined
  const resourceTier = ['lightweight', 'standard', 'pro'].includes(String(requestedResources.tier))
    ? String(requestedResources.tier)
    : null
  const resourceStorage = resourceTier === 'pro' ? 50 : resourceTier === 'standard' ? 25 : 10
  const workspaceMounts = Array.isArray(requestedOverlay.workspaceMounts)
    ? requestedOverlay.workspaceMounts
        .filter(isRecord)
        .flatMap((mount) => {
          const serverId = typeof mount.serverId === 'string' ? mount.serverId.trim() : ''
          const mountPath = typeof mount.mountPath === 'string' ? mount.mountPath.trim() : ''
          if (!serverId || !mountPath.startsWith('/workspace/server-workspaces/')) return []
          return [
            {
              serverId: serverId.slice(0, 160),
              rootId: typeof mount.rootId === 'string' ? mount.rootId.slice(0, 160) : null,
              mountPath: mountPath.slice(0, 256),
              readOnly: mount.readOnly === true,
            },
          ]
        })
        .slice(0, 20)
    : []
  snapshot.cloudComputer = {
    ...(requestedSchemaVersion ? { schemaVersion: requestedSchemaVersion } : {}),
    ...(requestedInstanceId ? { instanceId: requestedInstanceId } : {}),
    ...(requestedBaseAgentId ? { baseAgentId: requestedBaseAgentId } : {}),
    ...(isCloudComputerShellColor(requestedAppearance.shellColor)
      ? { appearance: { shellColor: requestedAppearance.shellColor } }
      : {}),
    components: {
      browser: requestedComponents.browser === true,
      desktop: requestedComponents.desktop === true,
    },
    workspaceMounts,
    ...(resourceTier
      ? {
          resources: {
            tier: resourceTier,
            cpu: String(requestedResources.cpu ?? '').slice(0, 32),
            memory: String(requestedResources.memory ?? '').slice(0, 32),
            storageGi: resourceStorage,
            pricingVersion: String(requestedResources.pricingVersion ?? '').slice(0, 32),
            hourlyCredits:
              typeof requestedResources.hourlyCredits === 'number'
                ? Math.max(0, Math.min(1_000, requestedResources.hourlyCredits))
                : 0,
            effectiveAt: String(requestedResources.effectiveAt ?? '').slice(0, 64),
          },
        }
      : {}),
    ...(Array.isArray(requestedOverlay.runtimes)
      ? { runtimes: sanitizeCloudComputerRuntimes(requestedOverlay.runtimes) }
      : {}),
  }
  if (resourceTier) {
    snapshot.workspace = {
      ...(isRecord(snapshot.workspace) ? snapshot.workspace : {}),
      storageSize: `${resourceStorage}Gi`,
    }
  }
  applyCloudComputerAgentPreferences(snapshot, clientConfigSnapshot)
  applyCloudComputerShadowobPreferences(snapshot, clientConfigSnapshot)
}

function safeCloudComputerInstanceId(value: unknown) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null
}

function safeCloudComputerId(value: unknown) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : null
}

function sanitizeCloudComputerRuntimes(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .flatMap((runtime) => {
      const id = safeCloudComputerId(runtime.id)
      const pluginId = safeCloudComputerId(runtime.pluginId)
      if (!id || !pluginId) return []
      return [
        {
          id,
          pluginId,
          pluginVersion: String(runtime.pluginVersion ?? '').slice(0, 64),
          runtimeVersion: String(runtime.runtimeVersion ?? '').slice(0, 64),
          status: runtime.status === 'installed' ? 'installed' : 'available',
          persistentState: runtime.persistentState === true,
          installedAt: String(runtime.installedAt ?? '').slice(0, 64),
        },
      ]
    })
    .slice(0, 20)
}

function sanitizeCloudComputerAgentResources(value: unknown) {
  if (!isRecord(value)) return undefined
  const sanitizeGroup = (group: unknown) => {
    if (!isRecord(group)) return undefined
    const cpu = typeof group.cpu === 'string' && /^\d+(?:m)?$/.test(group.cpu) ? group.cpu : null
    const memory =
      typeof group.memory === 'string' && /^\d+(?:Mi|Gi)$/.test(group.memory) ? group.memory : null
    return cpu && memory ? { cpu, memory } : undefined
  }
  const requests = sanitizeGroup(value.requests)
  const limits = sanitizeGroup(value.limits)
  return requests && limits ? { requests, limits } : undefined
}

function applyCloudComputerAgentPreferences(
  snapshot: Record<string, unknown>,
  clientConfigSnapshot: Record<string, unknown>,
) {
  const deployments = isRecord(snapshot.deployments) ? snapshot.deployments : {}
  const requestedDeployments = isRecord(clientConfigSnapshot.deployments)
    ? clientConfigSnapshot.deployments
    : {}
  const agents = Array.isArray(deployments.agents) ? [...deployments.agents] : []
  const requestedAgents = Array.isArray(requestedDeployments.agents)
    ? requestedDeployments.agents.filter(isRecord)
    : []
  const indexes = new Map(
    agents.flatMap((agent, index) => {
      const id = safeCloudComputerId(isRecord(agent) ? agent.id : null)
      return id ? [[id, index] as const] : []
    }),
  )

  for (const requested of requestedAgents) {
    const id = safeCloudComputerId(requested.id)
    const runtime = safeCloudComputerId(requested.runtime)
    const resources = sanitizeCloudComputerAgentResources(requested.resources)
    if (!id || !runtime || !resources) continue
    const existingIndex = indexes.get(id)
    const identity = isRecord(requested.identity) ? requested.identity : {}
    const safeAgentPreferences = {
      runtime,
      description: String(requested.description ?? '').slice(0, 500),
      identity: {
        name: String(identity.name ?? id).slice(0, 80),
        description: String(identity.description ?? '').slice(0, 500),
        personality: String(identity.personality ?? '').slice(0, 500),
        systemPrompt: String(identity.systemPrompt ?? '').slice(0, 4_000),
      },
      resources,
    }
    if (existingIndex !== undefined) {
      const existing = isRecord(agents[existingIndex]) ? agents[existingIndex] : {}
      agents[existingIndex] = { ...existing, ...safeAgentPreferences }
      continue
    }
    agents.push({
      id,
      ...safeAgentPreferences,
      configuration: {},
    })
    indexes.set(id, agents.length - 1)
  }

  snapshot.deployments = { ...deployments, agents }
}

function applyCloudComputerShadowobPreferences(
  snapshot: Record<string, unknown>,
  clientConfigSnapshot: Record<string, unknown>,
) {
  const requestedUse = Array.isArray(clientConfigSnapshot.use)
    ? clientConfigSnapshot.use.filter(isRecord)
    : []
  const requestedPlugin = requestedUse.find((entry) => entry.plugin === 'shadowob')
  const requestedOptions = isRecord(requestedPlugin?.options) ? requestedPlugin.options : null
  if (!requestedOptions) return

  const buddies = Array.isArray(requestedOptions.buddies)
    ? requestedOptions.buddies
        .filter(isRecord)
        .flatMap((buddy) => {
          const id = safeCloudComputerId(buddy.id)
          const name = typeof buddy.name === 'string' ? buddy.name.trim().slice(0, 80) : ''
          if (!id || !name) return []
          return [
            {
              id,
              name,
              ...(typeof buddy.description === 'string'
                ? { description: buddy.description.slice(0, 500) }
                : {}),
              ...(typeof buddy.avatarUrl === 'string'
                ? { avatarUrl: buddy.avatarUrl.slice(0, 100_000) }
                : {}),
            },
          ]
        })
        .slice(0, 50)
    : []
  const bindings = Array.isArray(requestedOptions.bindings)
    ? requestedOptions.bindings
        .filter(isRecord)
        .flatMap((binding) => {
          const targetId = safeCloudComputerId(binding.targetId)
          const agentId = safeCloudComputerId(binding.agentId)
          if (!targetId || !agentId || binding.targetType !== 'buddy') return []
          return [
            {
              targetId,
              targetType: 'buddy',
              agentId,
              servers: Array.isArray(binding.servers)
                ? binding.servers.filter((id): id is string => typeof id === 'string').slice(0, 50)
                : [],
              channels: Array.isArray(binding.channels)
                ? binding.channels.filter((id): id is string => typeof id === 'string').slice(0, 50)
                : [],
              ...(isRecord(binding.replyPolicy) && binding.replyPolicy.mode === 'mentionOnly'
                ? { replyPolicy: { mode: 'mentionOnly' } }
                : {}),
            },
          ]
        })
        .slice(0, 50)
    : []
  if (buddies.length === 0) return

  const use = Array.isArray(snapshot.use) ? [...snapshot.use] : []
  const index = use.findIndex((entry) => isRecord(entry) && entry.plugin === 'shadowob')
  const plugin = { plugin: 'shadowob', options: { buddies, bindings } }
  if (index >= 0) use[index] = plugin
  else use.push(plugin)
  snapshot.use = use
}

export function applySafeDeploymentPreferences(
  serverTemplateSnapshot: Record<string, unknown>,
  clientConfigSnapshot: unknown,
  env?: Record<string, string | undefined>,
) {
  const snapshot = structuredClone(serverTemplateSnapshot) as Record<string, unknown>
  applyWorkloadBackendPreference(snapshot, clientConfigSnapshot, env)
  if (isRecord(clientConfigSnapshot)) applyCloudComputerPreferences(snapshot, clientConfigSnapshot)
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
