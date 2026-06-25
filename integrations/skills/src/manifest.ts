import { defineShadowServerApp, shadowServerAppApiBaseUrl } from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated.js'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: shadowServerAppApiBaseUrl(process.env),
})

export function manifest() {
  const port = Number(process.env.PORT ?? 4220)
  return shadowApp.manifest({
    port,
    publicBaseUrl: process.env.SKILLS_PUBLIC_BASE_URL ?? process.env.SHADOWOB_APP_PUBLIC_BASE_URL,
    apiBaseUrl: process.env.SKILLS_API_BASE_URL ?? process.env.SHADOWOB_APP_API_BASE_URL,
  })
}
