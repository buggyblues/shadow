import { createShadowSpaceAppClient } from '@shadowob/sdk/bridge'

const client = createShadowSpaceAppClient({ appKey: 'travel' })
let serverScope = 'standalone'

export function setTravelServerScope(serverId: string | null | undefined) {
  serverScope = serverId?.trim() || 'standalone'
}

export function travelServerScope() {
  return serverScope
}

export const travelShadowSpaceApp = {
  bridgeAvailable: () => client.bridgeAvailable(),
  fetchWithSession: client.fetchWithSession.bind(client),
  authorizeOAuth: client.authorizeOAuth.bind(client),
  openChannel: client.openChannel.bind(client),
}
