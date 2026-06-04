const DEFAULT_RUNNER_REGISTRY = 'ghcr.io/buggyblues'
export const DEFAULT_RUNNER_IMAGE_TAG =
  process.env.SHADOWOB_RUNNER_IMAGE_TAG?.trim() || '20260604-faststart'

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
