import { defineShadowSpaceApp, shadowSpaceAppApiBaseUrl } from '@shadowob/sdk'
import { shadowSpaceAppManifest } from './space-app.generated.js'

export const shadowSpaceApp = defineShadowSpaceApp(shadowSpaceAppManifest, {
  shadowBaseUrl: shadowSpaceAppApiBaseUrl(process.env),
})

export function manifest() {
  const port = Number(process.env.PORT ?? 4218)
  return shadowSpaceApp.manifest({
    port,
    publicBaseUrl: process.env.WARBUDDY_PUBLIC_BASE_URL ?? process.env.SHADOWOB_APP_PUBLIC_BASE_URL,
    apiBaseUrl: process.env.WARBUDDY_API_BASE_URL ?? process.env.SHADOWOB_APP_API_BASE_URL,
  })
}
