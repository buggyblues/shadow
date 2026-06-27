type NamedEnvVar = { name?: unknown }

export const RESERVED_RUNTIME_ENV_KEYS = new Set([
  'KUBECONFIG',
  'JWT_SECRET',
  'MODEL_PROXY_TOKEN_SECRET',
  'OPENAI_COMPATIBLE_API_KEY',
  'SHADOWOB_AGENT_ID',
  'SHADOWOB_AGENT_SERVER_URL',
  'SHADOWOB_CLOUD_DEPLOYMENT_ID',
  'SHADOWOB_CLOUD_NAMESPACE',
  'SHADOWOB_EXPOSURE_CONFIG',
  'SHADOWOB_EXPOSURE_STATUS',
  'SHADOWOB_MODEL_PROXY_UPSTREAM_API_KEY',
  'SHADOWOB_PROVISION_URL',
  'SHADOWOB_SERVER_URL',
  'SHADOWOB_USER_TOKEN',
])

const MERGEABLE_PATH_ENV_KEYS = new Set(['PATH', 'PYTHONPATH', 'NODE_PATH'])
const DEFAULT_CONTAINER_PATH_PARTS = [
  '/home/shadow/.local/bin',
  '/usr/local/sbin',
  '/usr/local/bin',
  '/usr/sbin',
  '/usr/bin',
  '/sbin',
  '/bin',
]

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
    if (MERGEABLE_PATH_ENV_KEYS.has(name) && baseNames.has(name)) continue
    if (isReservedRuntimeEnvKey(name) || baseNames.has(name)) {
      throw new Error(`${source} cannot override reserved runtime env var: ${name}`)
    }
  }
}

function uniquePathParts(parts: string[]): string[] {
  const out: string[] = []
  for (const part of parts) {
    if (!part || out.includes(part)) continue
    out.push(part)
  }
  return out
}

function mergePathLikeEnvValue(name: string, existing: string, incoming: string): string {
  const parts = [...existing.split(':'), ...incoming.split(':')]
  if (name !== 'PATH') return uniquePathParts(parts).join(':')

  const defaultParts = new Set(DEFAULT_CONTAINER_PATH_PARTS)
  const custom = parts.filter((part) => part && !defaultParts.has(part))
  const defaults = parts.filter((part) => defaultParts.has(part))
  return uniquePathParts([...custom, ...defaults]).join(':')
}

/**
 * Kubernetes rejects duplicated `env[].name` entries. Runtime plugins are
 * not allowed to override base environment variables. Duplicate path-like
 * entries are merged so plugin paths do not remove the persistent user bin.
 * Other duplicate non-reserved entries keep the later value while preserving
 * position.
 */
export function dedupeEnvVars<T extends NamedEnvVar & { value?: unknown }>(envVars: T[]): T[] {
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

    const existingEnvVar = result[existingIndex]
    if (
      MERGEABLE_PATH_ENV_KEYS.has(name) &&
      existingEnvVar &&
      typeof existingEnvVar.value === 'string' &&
      typeof envVar.value === 'string'
    ) {
      result[existingIndex] = {
        ...existingEnvVar,
        value: mergePathLikeEnvValue(name, existingEnvVar.value, envVar.value),
      } as T
      continue
    }

    result[existingIndex] = envVar
  }

  return result
}
