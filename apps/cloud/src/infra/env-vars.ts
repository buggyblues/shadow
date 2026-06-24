type NamedEnvVar = { name?: unknown }

export const RESERVED_RUNTIME_ENV_KEYS = new Set([
  'KUBECONFIG',
  'JWT_SECRET',
  'MODEL_PROXY_TOKEN_SECRET',
  'OPENAI_COMPATIBLE_API_KEY',
  'SHADOW_AGENT_SERVER_URL',
  'SHADOW_CLOUD_AGENT_ID',
  'SHADOW_CLOUD_DEPLOYMENT_ID',
  'SHADOW_CLOUD_NAMESPACE',
  'SHADOW_EXPOSURE_CONFIG',
  'SHADOW_EXPOSURE_STATUS',
  'SHADOW_MODEL_PROXY_UPSTREAM_API_KEY',
  'SHADOW_PROVISION_URL',
  'SHADOW_SERVER_URL',
  'SHADOW_USER_TOKEN',
])

export function isReservedRuntimeEnvKey(key: string): boolean {
  return RESERVED_RUNTIME_ENV_KEYS.has(key)
}

export function assertNoReservedEnvOverrides<T extends NamedEnvVar>(
  baseEnvVars: T[],
  candidateEnvVars: T[],
  source: string,
): void {
  const baseNames = new Set(
    baseEnvVars
      .map((envVar) => envVar.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  )

  for (const envVar of candidateEnvVars) {
    const name = envVar.name
    if (typeof name !== 'string' || name.length === 0) continue
    if (isReservedRuntimeEnvKey(name) || baseNames.has(name)) {
      throw new Error(`${source} cannot override reserved runtime env var: ${name}`)
    }
  }
}

/**
 * Kubernetes rejects duplicated `env[].name` entries. Runtime plugins are
 * not allowed to override base environment variables. Duplicate non-reserved
 * entries from the same source keep the later value while preserving position.
 */
export function dedupeEnvVars<T extends NamedEnvVar>(envVars: T[]): T[] {
  const result: T[] = []
  const indexByName = new Map<string, number>()

  for (const envVar of envVars) {
    const name = envVar.name
    if (typeof name !== 'string' || name.length === 0) {
      result.push(envVar)
      continue
    }

    const existingIndex = indexByName.get(name)
    if (existingIndex === undefined) {
      indexByName.set(name, result.length)
      result.push(envVar)
      continue
    }

    result[existingIndex] = envVar
  }

  return result
}
