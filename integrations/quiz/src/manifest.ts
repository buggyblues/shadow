import { defineShadowSpaceApp, shadowSpaceAppApiBaseUrl } from '@shadowob/sdk'
import { shadowSpaceAppManifest } from './space-app.generated.js'

export const shadowSpaceApp = defineShadowSpaceApp(shadowSpaceAppManifest, {
  shadowBaseUrl: shadowSpaceAppApiBaseUrl(process.env),
})

export function manifest() {
  const port = Number(process.env.PORT ?? 4211)
  return shadowSpaceApp.manifest({
    port,
    publicBaseUrl: process.env.QUIZ_PUBLIC_BASE_URL ?? process.env.SHADOWOB_APP_PUBLIC_BASE_URL,
    apiBaseUrl: process.env.QUIZ_API_BASE_URL ?? process.env.SHADOWOB_APP_API_BASE_URL,
  })
}
