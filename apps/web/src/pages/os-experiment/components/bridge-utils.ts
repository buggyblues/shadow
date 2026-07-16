export function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export type OsBridgeBuddyCreatorLanding = {
  title?: string
  description?: string
}

export type OsBridgeBuddyCreatorResult = {
  opened: boolean
  agent?: unknown
}

export function normalizeBuddyCreatorLanding(
  value: unknown,
): OsBridgeBuddyCreatorLanding | undefined {
  const landing = getRecord(value)
  if (!landing) return undefined
  const title = typeof landing.title === 'string' ? landing.title : undefined
  const description = typeof landing.description === 'string' ? landing.description : undefined
  return title || description ? { title, description } : undefined
}

export function normalizeOsSpaceAppRoutePath(value: unknown) {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input) return null
  const withoutHash = input.startsWith('#') ? input.slice(1) : input
  const prefixed = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`
  return prefixed.replace(/\/{2,}/g, '/') || '/'
}

export function routeRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}:${Math.random()}`
}

export function osAppRouteState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const route = (value as { shadowOsAppRoute?: unknown }).shadowOsAppRoute
  if (!route || typeof route !== 'object' || Array.isArray(route)) return null
  const record = route as { appKey?: unknown; path?: unknown; windowId?: unknown }
  if (
    typeof record.appKey !== 'string' ||
    typeof record.path !== 'string' ||
    typeof record.windowId !== 'string'
  ) {
    return null
  }
  return {
    appKey: record.appKey,
    path: normalizeOsSpaceAppRoutePath(record.path) ?? '/',
    windowId: record.windowId,
  }
}

export function pushOsAppRouteHistory(windowId: string, appKey: string, path: string) {
  if (typeof window === 'undefined') return
  const currentState =
    window.history.state &&
    typeof window.history.state === 'object' &&
    !Array.isArray(window.history.state)
      ? window.history.state
      : {}
  window.history.pushState(
    {
      ...currentState,
      shadowOsAppRoute: { windowId, appKey, path },
    },
    '',
    window.location.href,
  )
}
