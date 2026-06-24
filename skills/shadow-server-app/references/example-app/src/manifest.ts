import manifestJson from '../shadow-app.local.json' with { type: 'json' }

export function manifest() {
  const port = Number(process.env.PORT ?? 4199)
  const publicBaseUrl = (
    process.env.SHADOWOB_APP_PUBLIC_BASE_URL ?? `http://localhost:${port}`
  ).replace(/\/$/, '')
  const apiBaseUrl = (process.env.SHADOWOB_APP_API_BASE_URL ?? publicBaseUrl).replace(/\/$/, '')
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
