/**
 * Helpers for environment-variable key normalization.
 */

function normalizeToken(value: string): string {
  return value.trim().toUpperCase().replace(/-/g, '_')
}

export function normalizeGroupName(value?: string | null): string {
  const normalized = value?.trim()
  return normalized ? normalized : 'default'
}

export function toProviderSecretEnvKey(providerId: string, key: string): string {
  const providerToken = normalizeToken(providerId)
  const keyToken = normalizeToken(key)

  if (keyToken === 'APIKEY' || keyToken === 'API_KEY') {
    return `${providerToken}_API_KEY`
  }

  return `${providerToken}_${keyToken}`
}

export function withLegacyEnvAliases(key: string, value: string): Record<string, string> {
  const envs: Record<string, string> = { [key]: value }

  if (key.endsWith('_API_KEY')) {
    envs[key.replace(/_API_KEY$/, '_APIKEY')] = value
  }

  return envs
}
