import { defineShadowServerApp } from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated.js'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOW_SERVER_URL ?? 'http://localhost:3002',
})

export function manifest() {
  const port = Number(process.env.PORT ?? 4218)
  return shadowApp.manifest({
    port,
    publicBaseUrl: process.env.SHADOW_APP_PUBLIC_BASE_URL,
    apiBaseUrl: process.env.SHADOW_APP_API_BASE_URL,
  })
}
