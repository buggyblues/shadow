import { createShadowSpaceAppSessionManager } from '@shadowob/sdk/space-app/node'
import { travelShadowApiBaseUrl } from './oauth.js'

export const travelAppSessions = createShadowSpaceAppSessionManager({
  appKey: process.env.TRAVEL_APP_KEY ?? 'travel',
  shadowApiBaseUrl: travelShadowApiBaseUrl(),
})
