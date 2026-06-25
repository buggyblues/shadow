import { defineShadowServerApp, shadowServerAppApiBaseUrl } from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated.js'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: shadowServerAppApiBaseUrl(process.env),
})

export function manifest() {
  const port = Number(process.env.PORT ?? 4210)
  return shadowApp.manifest({
    port,
    publicBaseUrl: process.env.QNA_PUBLIC_BASE_URL ?? process.env.SHADOWOB_APP_PUBLIC_BASE_URL,
    apiBaseUrl: process.env.QNA_API_BASE_URL ?? process.env.SHADOWOB_APP_API_BASE_URL,
  })
}
