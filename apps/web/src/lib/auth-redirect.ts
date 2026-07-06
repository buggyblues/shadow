const APP_BASE = '/app'
const FALLBACK_ROUTER_PATH = '/space'

export function defaultAuthenticatedRouterPath(): string {
  return FALLBACK_ROUTER_PATH
}

function defaultWebRedirect(): string {
  return `${APP_BASE}${defaultAuthenticatedRouterPath()}`
}

function isSafeLocalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !/[\r\n\\]/.test(value)
}

function isAuthRouterPath(value: string): boolean {
  return (
    value === '/login' ||
    value.startsWith('/login?') ||
    value.startsWith('/login#') ||
    value === '/register' ||
    value.startsWith('/register?') ||
    value.startsWith('/register#')
  )
}

export function currentAppRedirect(): string {
  if (typeof window === 'undefined') return defaultWebRedirect()
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (!isSafeLocalPath(current)) return defaultWebRedirect()
  if (current === APP_BASE || current.startsWith(`${APP_BASE}/`)) return current
  return `${APP_BASE}${current}`
}

export function routerPathFromRedirect(redirect?: string | null): string {
  const fallback = defaultAuthenticatedRouterPath()
  if (!redirect) return fallback

  let value = redirect
  if (/^https?:\/\//.test(value) && typeof window !== 'undefined') {
    try {
      const url = new URL(value)
      if (url.origin !== window.location.origin) return fallback
      value = `${url.pathname}${url.search}${url.hash}`
    } catch {
      return fallback
    }
  }

  if (!isSafeLocalPath(value)) return fallback
  if (value === APP_BASE) return '/'
  if (value.startsWith(`${APP_BASE}/`)) return value.slice(APP_BASE.length) || '/'
  return value
}

export function webRedirectFromRouterPath(path?: string | null): string {
  if (!path) return defaultWebRedirect()
  if (!isSafeLocalPath(path)) return defaultWebRedirect()
  if (path === APP_BASE || path.startsWith(`${APP_BASE}/`)) return path
  return `${APP_BASE}${path === '/' ? '' : path}`
}

export function authenticatedRouterPathFromRedirect(redirect?: string | null): string {
  const routerPath = routerPathFromRedirect(redirect)
  return isAuthRouterPath(routerPath) ? defaultAuthenticatedRouterPath() : routerPath
}

export function isDesktopAuthContinuationPath(path?: string | null): boolean {
  if (!path) return false
  const routerPath = routerPathFromRedirect(path)
  return (
    routerPath === '/desktop-auth-callback' ||
    routerPath.startsWith('/desktop-auth-callback?') ||
    routerPath.startsWith('/desktop-auth-callback#')
  )
}
