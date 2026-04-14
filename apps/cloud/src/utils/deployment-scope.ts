/**
 * Deployment scope helpers — keep namespace-scoped environment variables
 * and route-derived deployment identifiers consistent across the console.
 */

export const GLOBAL_ENV_SCOPE = 'global'
export const DEPLOYMENT_ENV_SCOPE_PREFIX = 'deployment:'

export function normalizeNamespace(value?: string | null): string {
  const normalized = value?.trim()
  return normalized ? normalized : 'shadowob-cloud'
}

export function toDeploymentEnvScope(namespace: string): string {
  return `${DEPLOYMENT_ENV_SCOPE_PREFIX}${normalizeNamespace(namespace)}`
}

export function isDeploymentEnvScope(scope: string): boolean {
  return scope.startsWith(DEPLOYMENT_ENV_SCOPE_PREFIX)
}

export function fromDeploymentEnvScope(scope: string): string | null {
  if (!isDeploymentEnvScope(scope)) return null
  return scope.slice(DEPLOYMENT_ENV_SCOPE_PREFIX.length) || null
}
