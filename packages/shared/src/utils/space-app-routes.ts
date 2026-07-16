const SPACE_APP_ROUTE_PATH_MAX = 1024

export interface SpaceAppRouteTarget {
  serverSlug: string
  appKey: string
  appPath?: string | null
}

export interface SpaceAppPathOptions {
  basePath?: string
}

function cleanBasePath(basePath: string) {
  const trimmed = basePath.trim()
  if (!trimmed || trimmed === '/') return ''
  return trimmed.startsWith('/') ? trimmed.replace(/\/+$/u, '') : `/${trimmed.replace(/\/+$/u, '')}`
}

export function normalizeSpaceAppRoutePath(
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
  return trimmed.slice(0, SPACE_APP_ROUTE_PATH_MAX)
}

export function withSpaceAppRoutePathSearch(
  search: Record<string, unknown> | null | undefined,
  appPath: unknown,
) {
  const next = { ...(search ?? {}) }
  const normalized = normalizeSpaceAppRoutePath(appPath)
  if (normalized && normalized !== '/') {
    next.appPath = normalized
  } else {
    delete next.appPath
  }
  return next
}

export function spaceAppPathFromSearch(search: Record<string, unknown> | null | undefined) {
  return normalizeSpaceAppRoutePath(search?.appPath)
}

export function buildSpaceAppCommunityPath(
  target: SpaceAppRouteTarget,
  options: SpaceAppPathOptions = {},
) {
  const basePath = cleanBasePath(options.basePath ?? '/app')
  const path = `${basePath}/servers/${encodeURIComponent(target.serverSlug)}/space-apps/${encodeURIComponent(
    target.appKey,
  )}`
  const params = new URLSearchParams()
  const appPath = normalizeSpaceAppRoutePath(target.appPath)
  if (appPath && appPath !== '/') params.set('appPath', appPath)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function buildSpaceAppSharePath(
  target: SpaceAppRouteTarget,
  options: SpaceAppPathOptions = {},
) {
  const basePath = cleanBasePath(options.basePath ?? '/app')
  const path = `${basePath}/share/space-app/${encodeURIComponent(
    target.serverSlug,
  )}/${encodeURIComponent(target.appKey)}`
  const params = new URLSearchParams()
  const appPath = normalizeSpaceAppRoutePath(target.appPath)
  if (appPath && appPath !== '/') params.set('appPath', appPath)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function buildSpaceAppShareUrl(
  target: SpaceAppRouteTarget & { origin: string },
  options: SpaceAppPathOptions = {},
) {
  return new URL(buildSpaceAppSharePath(target, options), target.origin).toString()
}
