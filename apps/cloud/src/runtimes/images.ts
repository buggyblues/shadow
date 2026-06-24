function envValue(key: string): string | undefined {
  const value = process.env[key]?.trim()
  return value || undefined
}

export const DEFAULT_RUNNER_IMAGE_REGISTRY =
  envValue('SHADOWOB_RUNNER_IMAGE_REGISTRY') ?? envValue('SHADOWOB_IMAGE_REGISTRY') ?? 'ghcr.io'
export const DEFAULT_RUNNER_IMAGE_NAMESPACE =
  envValue('SHADOWOB_RUNNER_IMAGE_NAMESPACE') ??
  envValue('SHADOWOB_IMAGE_NAMESPACE') ??
  'buggyblues'
export const DEFAULT_RUNNER_IMAGE_TAG =
  envValue('SHADOWOB_RUNNER_IMAGE_TAG') ?? envValue('SHADOWOB_IMAGE_TAG') ?? 'latest'
export const DEFAULT_RUNNER_REGISTRY = `${DEFAULT_RUNNER_IMAGE_REGISTRY}/${DEFAULT_RUNNER_IMAGE_NAMESPACE}`

export function defaultRunnerImage(options: {
  runner: string
  env?: string
  fallback?: string
}): string {
  return (
    (options.env ? process.env[options.env]?.trim() : undefined) ??
    options.fallback ??
    `${DEFAULT_RUNNER_REGISTRY}/${options.runner}:${DEFAULT_RUNNER_IMAGE_TAG}`
  )
}
