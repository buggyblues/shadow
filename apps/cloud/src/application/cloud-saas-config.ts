import { z } from 'zod'
import type { CloudConfig } from '../config/schema.js'
import {
  type DeploymentRuntimeContext,
  isDeploymentRuntimeContextEmpty,
  normalizeDeploymentRuntimeContext,
} from '../utils/runtime-context.js'
import type { ProvisionState } from '../utils/state.js'
import { type CloudRuntimeTopology, planRuntimeTopology } from './runtime-topology.js'

export const CLOUD_SAAS_RUNTIME_KEY = '__shadowobRuntime'

const agentSnapshotSchema = z
  .object({
    id: z.string().min(1),
    runtime: z.string().min(1),
  })
  .passthrough()

const cloudConfigSnapshotSchema = z
  .object({
    version: z.string().min(1),
    deployments: z
      .object({
        agents: z.array(agentSnapshotSchema).min(1),
      })
      .passthrough(),
  })
  .passthrough()

const runtimeMetadataSchema = z
  .object({
    envVars: z.record(z.string()).default({}),
    context: z
      .object({
        locale: z.string().optional(),
        timezone: z.string().optional(),
      })
      .optional(),
    provisionState: z.unknown().optional(),
  })
  .passthrough()

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(token|secret|password|passphrase|api[-_]?key|private[-_]?key|credential|authorization|cookie|session|kubeconfig|encrypted)([_-]|$)/i

const SENSITIVE_CONTAINER_KEYS = new Set(['secrets', 'envVars'])
const NON_PERSISTENT_RUNTIME_ENV_KEYS = new Set(['SHADOWOB_USER_TOKEN', 'SHADOWOB_PROVISION_URL'])

function formatValidationError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

function normalizeRuntimeEnvVars(envVars?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!envVars) return normalized

  for (const [key, value] of Object.entries(envVars)) {
    if (typeof value !== 'string') continue
    if (value === '__SAVED__' || value.trim() === '') continue
    normalized[key] = value
  }

  return normalized
}

function normalizePersistedRuntimeEnvVars(
  envVars?: Record<string, string>,
): Record<string, string> {
  const normalized = normalizeRuntimeEnvVars(envVars)
  for (const key of NON_PERSISTENT_RUNTIME_ENV_KEYS) {
    delete normalized[key]
  }
  return normalized
}

function normalizeProvisionState(value: unknown): ProvisionState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Record<string, unknown>
  const plugins = candidate.plugins
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return null

  return {
    provisionedAt:
      typeof candidate.provisionedAt === 'string'
        ? candidate.provisionedAt
        : new Date().toISOString(),
    ...(typeof candidate.stackName === 'string' ? { stackName: candidate.stackName } : {}),
    ...(typeof candidate.namespace === 'string' ? { namespace: candidate.namespace } : {}),
    plugins: plugins as Record<string, Record<string, unknown>>,
  }
}

function normalizeRuntimeTopology(value: unknown): CloudRuntimeTopology | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<CloudRuntimeTopology>
  if (candidate.schemaVersion !== 1) return null
  if (!Array.isArray(candidate.executionUnits)) return null
  if (
    !candidate.agentToExecutionUnit ||
    typeof candidate.agentToExecutionUnit !== 'object' ||
    Array.isArray(candidate.agentToExecutionUnit)
  ) {
    return null
  }
  return candidate as CloudRuntimeTopology
}

function isLoopbackShadowUrl(url?: string): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]'
    )
  } catch {
    return false
  }
}

function resolveProvisionShadowUrl(
  runtimeEnvVars: Record<string, string>,
  processEnv: Record<string, string | undefined>,
  fallbackShadowUrl?: string,
): string | undefined {
  const explicitProvisionUrl =
    runtimeEnvVars.SHADOWOB_PROVISION_URL ?? processEnv.SHADOWOB_PROVISION_URL
  if (explicitProvisionUrl) return explicitProvisionUrl

  if (isLoopbackShadowUrl(fallbackShadowUrl)) {
    return processEnv.SHADOWOB_SERVER_URL ?? fallbackShadowUrl
  }

  return fallbackShadowUrl
}

function redactUnknown(value: unknown, forceRedact = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, forceRedact))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, childValue]) => {
        if (key === CLOUD_SAAS_RUNTIME_KEY) {
          return [key, undefined]
        }

        if (forceRedact || SENSITIVE_CONTAINER_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, redactUnknown(childValue, true)]
        }

        return [key, redactUnknown(childValue, false)]
      }),
    )
  }

  if (forceRedact && value !== null && value !== undefined) {
    return '[REDACTED]'
  }

  return value
}

export function validateCloudSaasConfigSnapshot(configSnapshot: unknown): Record<string, unknown> {
  const result = cloudConfigSnapshotSchema.safeParse(configSnapshot)
  if (!result.success) {
    throw Object.assign(
      new Error(`Invalid configSnapshot: ${formatValidationError(result.error)}`),
      { status: 422 },
    )
  }

  return result.data
}

export function prepareCloudSaasConfigSnapshot(
  configSnapshot: unknown,
  envVars?: Record<string, string>,
  context?: DeploymentRuntimeContext,
): Record<string, unknown> {
  const validated = validateCloudSaasConfigSnapshot(configSnapshot)
  const runtimeEnvVars = normalizePersistedRuntimeEnvVars(envVars)
  const runtimeContext = normalizeDeploymentRuntimeContext(context)
  const runtime = runtimeMetadataSchema.safeParse(validated[CLOUD_SAAS_RUNTIME_KEY])
  const configWithLocale = runtimeContext.locale
    ? { ...validated, locale: runtimeContext.locale }
    : validated
  const topology = planRuntimeTopology(configWithLocale as unknown as CloudConfig)

  return {
    ...configWithLocale,
    [CLOUD_SAAS_RUNTIME_KEY]: {
      ...(runtime.success && runtime.data && typeof runtime.data === 'object' ? runtime.data : {}),
      envVars: runtimeEnvVars,
      ...(isDeploymentRuntimeContextEmpty(runtimeContext) ? {} : { context: runtimeContext }),
      topology,
    },
  }
}

export function attachCloudSaasProvisionState(
  configSnapshot: unknown,
  provisionState: ProvisionState,
): Record<string, unknown> {
  const validated = validateCloudSaasConfigSnapshot(configSnapshot)
  const runtime = runtimeMetadataSchema.safeParse(validated[CLOUD_SAAS_RUNTIME_KEY])
  const envVars = runtime.success ? normalizePersistedRuntimeEnvVars(runtime.data.envVars) : {}
  const context = runtime.success
    ? normalizeDeploymentRuntimeContext(runtime.data.context)
    : undefined

  return {
    ...validated,
    [CLOUD_SAAS_RUNTIME_KEY]: {
      ...(runtime.success && runtime.data && typeof runtime.data === 'object' ? runtime.data : {}),
      envVars,
      ...(context && !isDeploymentRuntimeContextEmpty(context) ? { context } : {}),
      provisionState,
    },
  }
}

export function extractCloudSaasRuntime(configSnapshot: unknown): {
  configSnapshot: Record<string, unknown> | null
  envVars: Record<string, string>
  context: DeploymentRuntimeContext
  topology: CloudRuntimeTopology | null
  provisionState: ProvisionState | null
} {
  if (!configSnapshot || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return { configSnapshot: null, envVars: {}, context: {}, topology: null, provisionState: null }
  }

  const snapshot = { ...(configSnapshot as Record<string, unknown>) }
  const runtime = runtimeMetadataSchema.safeParse(snapshot[CLOUD_SAAS_RUNTIME_KEY])
  delete snapshot[CLOUD_SAAS_RUNTIME_KEY]

  return {
    configSnapshot: snapshot,
    envVars: runtime.success ? normalizePersistedRuntimeEnvVars(runtime.data.envVars) : {},
    context: runtime.success ? normalizeDeploymentRuntimeContext(runtime.data.context) : {},
    topology: runtime.success
      ? normalizeRuntimeTopology((runtime.data as { topology?: unknown }).topology)
      : null,
    provisionState: runtime.success ? normalizeProvisionState(runtime.data.provisionState) : null,
  }
}

export function resolveCloudSaasShadowRuntime(
  envVars?: Record<string, string>,
  processEnv: Record<string, string | undefined> = process.env,
): {
  shadowUrl?: string
  podShadowUrl?: string
  shadowToken?: string
} {
  const runtimeEnvVars = normalizeRuntimeEnvVars(envVars)
  const configuredRuntimeShadowUrl =
    runtimeEnvVars.SHADOWOB_SERVER_URL ?? processEnv.SHADOWOB_SERVER_URL
  const runtimeShadowUrl =
    isLoopbackShadowUrl(configuredRuntimeShadowUrl) && processEnv.SHADOWOB_SERVER_URL
      ? processEnv.SHADOWOB_SERVER_URL
      : configuredRuntimeShadowUrl
  const shadowUrl = resolveProvisionShadowUrl(runtimeEnvVars, processEnv, runtimeShadowUrl)
  const podShadowUrl = runtimeShadowUrl ?? shadowUrl
  const shadowToken = runtimeEnvVars.SHADOWOB_USER_TOKEN ?? processEnv.SHADOWOB_USER_TOKEN

  return { shadowUrl, podShadowUrl, shadowToken }
}

export function redactCloudSaasConfigSnapshot(configSnapshot: unknown): unknown {
  const { configSnapshot: snapshot } = extractCloudSaasRuntime(configSnapshot)
  if (!snapshot) return null

  const redacted = redactUnknown(snapshot, false)
  if (!redacted || typeof redacted !== 'object' || Array.isArray(redacted)) {
    return redacted
  }

  const result = { ...(redacted as Record<string, unknown>) }
  delete result[CLOUD_SAAS_RUNTIME_KEY]
  return result
}

export function sanitizeCloudSaasDeployment<T extends { configSnapshot?: unknown }>(
  deployment: T,
): T {
  return {
    ...deployment,
    configSnapshot: redactCloudSaasConfigSnapshot(deployment.configSnapshot),
  }
}
