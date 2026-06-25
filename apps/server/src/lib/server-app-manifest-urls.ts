import type { ServerAppManifest } from '../db/schema'

export function serverAppManifestUrlForBase(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, '')}/.well-known/shadow-app.json`
}

function parseUrlPath(value: string | undefined, fallback: string) {
  if (!value) return fallback
  try {
    const url = new URL(value)
    return `${url.pathname}${url.search}${url.hash}` || fallback
  } catch {
    return value.startsWith('/') ? value : fallback
  }
}

export function rewriteServerAppManifestToBase(
  rawManifest: ServerAppManifest,
  baseUrl: string,
): ServerAppManifest {
  const normalizedBase = baseUrl.replace(/\/$/, '')
  const apiPath = parseUrlPath(rawManifest.api.baseUrl, '/')
  const iframeEntry = rawManifest.iframe?.entry
  const iconUrl = rawManifest.iconUrl

  return {
    ...rawManifest,
    iconUrl: iconUrl
      ? new URL(parseUrlPath(iconUrl, iconUrl), `${normalizedBase}/`).toString()
      : iconUrl,
    iframe: rawManifest.iframe
      ? {
          ...rawManifest.iframe,
          entry: new URL(
            parseUrlPath(iframeEntry, '/shadow/server'),
            `${normalizedBase}/`,
          ).toString(),
          allowedOrigins: [new URL(normalizedBase).origin],
        }
      : rawManifest.iframe,
    api: {
      ...rawManifest.api,
      baseUrl: new URL(apiPath, `${normalizedBase}/`).toString().replace(/\/$/, ''),
    },
  }
}
