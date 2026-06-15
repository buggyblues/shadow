export interface ServerAppMobileNavigationConfig {
  mode?: 'compat' | 'immersive'
  capsule?: {
    backgroundColor?: string
    foregroundColor?: string
    borderColor?: string
  }
}

export interface ServerAppMobileConfig {
  navigation?: ServerAppMobileNavigationConfig | null
}

export function encodeMobileNavigationParam(config?: ServerAppMobileConfig | null) {
  if (!config?.navigation) return undefined
  return encodeURIComponent(JSON.stringify(config.navigation))
}
