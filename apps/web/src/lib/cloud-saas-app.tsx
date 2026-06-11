import type { CloudSaasAppProps } from '@shadowob/cloud-ui/web-saas'
import { type ComponentType, lazy } from 'react'
import { reloadOnceForChunkError } from './chunk-reload'

type CloudSaasModule = typeof import('@shadowob/cloud-ui/web-saas') & {
  default?: unknown
}

let cloudSaasAppPromise: Promise<{ default: ComponentType<CloudSaasAppProps> }> | null = null

function resolveCloudSaasComponent(module: CloudSaasModule) {
  const fallback = module.default
  const Component =
    module.CloudSaasApp ??
    (typeof fallback === 'function'
      ? fallback
      : (
          fallback as {
            CloudSaasApp?: typeof module.CloudSaasApp
            default?: typeof module.CloudSaasApp
          }
        )?.CloudSaasApp) ??
    (fallback as { default?: typeof module.CloudSaasApp })?.default

  if (!Component) {
    throw new Error('Cloud SaaS app entry did not export a React component')
  }

  return Component as ComponentType<CloudSaasAppProps>
}

export function loadCloudSaasApp() {
  cloudSaasAppPromise ??= import('@shadowob/cloud-ui/web-saas')
    .then((module) => ({ default: resolveCloudSaasComponent(module) }))
    .catch((error) => {
      cloudSaasAppPromise = null
      if (reloadOnceForChunkError(error)) {
        return new Promise<never>(() => {})
      }
      throw error
    })

  return cloudSaasAppPromise
}

export function preloadCloudSaasApp() {
  void loadCloudSaasApp()
}

export const CloudSaasApp = lazy(loadCloudSaasApp)
