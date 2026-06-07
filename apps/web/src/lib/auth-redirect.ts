const APP_BASE = '/app'
const DEFAULT_ROUTER_PATH = '/discover'

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
  if (typeof window === 'undefined') return `${APP_BASE}${DEFAULT_ROUTER_PATH}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (!isSafeLocalPath(current)) return `${APP_BASE}${DEFAULT_ROUTER_PATH}`
  if (current === APP_BASE || current.startsWith(`${APP_BASE}/`)) return current
  return `${APP_BASE}${current}`
}

export function routerPathFromRedirect(redirect?: string | null): string {
  if (!redirect) return DEFAULT_ROUTER_PATH

  let value = redirect
  if (/^https?:\/\//.test(value) && typeof window !== 'undefined') {
    try {
      const url = new URL(value)
      if (url.origin !== window.location.origin) return DEFAULT_ROUTER_PATH
      value = `${url.pathname}${url.search}${url.hash}`
    } catch {
      return DEFAULT_ROUTER_PATH
    }
  }

  if (!isSafeLocalPath(value)) return DEFAULT_ROUTER_PATH
  if (value === APP_BASE) return '/'
  if (value.startsWith(`${APP_BASE}/`)) return value.slice(APP_BASE.length) || '/'
  return value
}

export function webRedirectFromRouterPath(path?: string | null): string {
  if (!path) return `${APP_BASE}${DEFAULT_ROUTER_PATH}`
  if (!isSafeLocalPath(path)) return `${APP_BASE}${DEFAULT_ROUTER_PATH}`
  if (path === APP_BASE || path.startsWith(`${APP_BASE}/`)) return path
  return `${APP_BASE}${path === '/' ? '' : path}`
}

export function authenticatedRouterPathFromRedirect(redirect?: string | null): string {
  const routerPath = routerPathFromRedirect(redirect)
  return isAuthRouterPath(routerPath) ? DEFAULT_ROUTER_PATH : routerPath
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
