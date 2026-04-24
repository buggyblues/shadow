import { z } from 'zod'

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
  })
  .passthrough()

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(token|secret|password|passphrase|api[-_]?key|private[-_]?key|credential|authorization|cookie|session|kubeconfig|encrypted)([_-]|$)/i

const SENSITIVE_CONTAINER_KEYS = new Set(['secrets', 'envVars'])

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
): Record<string, unknown> {
  const validated = validateCloudSaasConfigSnapshot(configSnapshot)
  const runtimeEnvVars = normalizeRuntimeEnvVars(envVars)

  if (Object.keys(runtimeEnvVars).length === 0) {
    return validated
  }

  return {
    ...validated,
    [CLOUD_SAAS_RUNTIME_KEY]: {
      envVars: runtimeEnvVars,
    },
  }
}

export function extractCloudSaasRuntime(configSnapshot: unknown): {
  configSnapshot: Record<string, unknown> | null
  envVars: Record<string, string>
} {
  if (!configSnapshot || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return { configSnapshot: null, envVars: {} }
  }

  const snapshot = { ...(configSnapshot as Record<string, unknown>) }
  const runtime = runtimeMetadataSchema.safeParse(snapshot[CLOUD_SAAS_RUNTIME_KEY])
  delete snapshot[CLOUD_SAAS_RUNTIME_KEY]

  return {
    configSnapshot: snapshot,
    envVars: runtime.success ? normalizeRuntimeEnvVars(runtime.data.envVars) : {},
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
  const shadowUrl = runtimeEnvVars.SHADOW_SERVER_URL ?? processEnv.SHADOW_SERVER_URL
  const podShadowUrl =
    runtimeEnvVars.SHADOW_AGENT_SERVER_URL ?? processEnv.SHADOW_AGENT_SERVER_URL ?? shadowUrl
  const shadowToken = runtimeEnvVars.SHADOW_USER_TOKEN ?? processEnv.SHADOW_USER_TOKEN

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
