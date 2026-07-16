export type TravelRuntimeMode = 'embedded' | 'standalone'

export interface TravelRuntimeCapabilities {
  bridgeUi: boolean
  communityContext: boolean
  mode: TravelRuntimeMode
}

export function resolveTravelRuntimeCapabilities(input: {
  bridgeAvailable: boolean
  launchAuthenticated?: boolean
}): TravelRuntimeCapabilities {
  const embedded = input.bridgeAvailable
  return {
    bridgeUi: embedded,
    communityContext: embedded && input.launchAuthenticated !== false,
    mode: embedded ? 'embedded' : 'standalone',
  }
}
