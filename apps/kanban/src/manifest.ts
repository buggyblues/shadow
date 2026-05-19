import { readFileSync } from 'node:fs'

const manifestJson = JSON.parse(
  readFileSync(new URL('../shadow-app.local.json', import.meta.url), 'utf8'),
) as {
  api: { auth?: { type: 'oauth2-bearer' } }
  [key: string]: unknown
}

export function manifest() {
  const port = Number(process.env.PORT ?? 4201)
  const publicBaseUrl = (
    process.env.SHADOW_APP_PUBLIC_BASE_URL ?? `http://localhost:${port}`
  ).replace(/\/$/, '')
  const apiBaseUrl = (process.env.SHADOW_APP_API_BASE_URL ?? publicBaseUrl).replace(/\/$/, '')
  return {
    ...manifestJson,
    iconUrl: `${publicBaseUrl}/assets/icon.svg`,
    iframe: {
      entry: `${publicBaseUrl}/shadow/server`,
      allowedOrigins: [publicBaseUrl],
    },
    api: {
      ...manifestJson.api,
      baseUrl: apiBaseUrl,
    },
  }
}
