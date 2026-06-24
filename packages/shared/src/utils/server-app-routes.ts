const SERVER_APP_ROUTE_PATH_MAX = 1024

export interface ServerAppRouteTarget {
  serverSlug: string
  appKey: string
  appPath?: string | null
}

export interface ServerAppPathOptions {
  basePath?: string
}

function cleanBasePath(basePath: string) {
  const trimmed = basePath.trim()
  if (!trimmed || trimmed === '/') return ''
  return trimmed.startsWith('/') ? trimmed.replace(/\/+$/u, '') : `/${trimmed.replace(/\/+$/u, '')}`
}

export function normalizeServerAppRoutePath(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (
    !trimmed ||
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    /[\r\n\\]/u.test(trimmed)
  ) {
    return fallback
  }
  return trimmed.slice(0, SERVER_APP_ROUTE_PATH_MAX)
}

export function withServerAppRoutePathSearch(
  search: Record<string, unknown> | null | undefined,
  appPath: unknown,
) {
  const next = { ...(search ?? {}) }
  const normalized = normalizeServerAppRoutePath(appPath)
  if (normalized && normalized !== '/') {
    next.appPath = normalized
  } else {
    delete next.appPath
  }
  return next
}

export function serverAppPathFromSearch(search: Record<string, unknown> | null | undefined) {
  return normalizeServerAppRoutePath(search?.appPath)
}

export function buildServerAppCommunityPath(
  target: ServerAppRouteTarget,
  options: ServerAppPathOptions = {},
) {
  const basePath = cleanBasePath(options.basePath ?? '/app')
  const path = `${basePath}/servers/${encodeURIComponent(target.serverSlug)}/apps/${encodeURIComponent(
    target.appKey,
  )}`
  const params = new URLSearchParams()
  const appPath = normalizeServerAppRoutePath(target.appPath)
  if (appPath && appPath !== '/') params.set('appPath', appPath)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function buildServerAppSharePath(
  target: ServerAppRouteTarget,
  options: ServerAppPathOptions = {},
) {
  const basePath = cleanBasePath(options.basePath ?? '/app')
  const path = `${basePath}/share/server-app/${encodeURIComponent(
    target.serverSlug,
  )}/${encodeURIComponent(target.appKey)}`
  const params = new URLSearchParams()
  const appPath = normalizeServerAppRoutePath(target.appPath)
  if (appPath && appPath !== '/') params.set('appPath', appPath)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function buildServerAppShareUrl(
  target: ServerAppRouteTarget & { origin: string },
  options: ServerAppPathOptions = {},
) {
  return new URL(buildServerAppSharePath(target, options), target.origin).toString()
}
