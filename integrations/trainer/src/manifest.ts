import { defineShadowServerApp } from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated.js'

export const shadowApp = defineShadowServerApp(shadowServerAppManifest, {
  shadowBaseUrl: process.env.SHADOWOB_SERVER_URL ?? 'http://localhost:3002',
})

export function manifest() {
  const port = Number(process.env.PORT ?? 4213)
  return shadowApp.manifest({
    port,
    publicBaseUrl: process.env.TRAINER_PUBLIC_BASE_URL ?? process.env.SHADOWOB_APP_PUBLIC_BASE_URL,
    apiBaseUrl: process.env.TRAINER_API_BASE_URL ?? process.env.SHADOWOB_APP_API_BASE_URL,
  })
}
