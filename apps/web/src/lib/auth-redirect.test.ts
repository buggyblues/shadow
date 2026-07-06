import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authenticatedRouterPathFromRedirect,
  currentAppRedirect,
  defaultAuthenticatedRouterPath,
  isDesktopAuthContinuationPath,
  routerPathFromRedirect,
  webRedirectFromRouterPath,
} from './auth-redirect'

describe('auth redirect helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    window.history.replaceState(null, '', '/app/discover')
  })

  it('preserves the current app route for login redirects', () => {
    window.history.replaceState(null, '', '/app/cloud?tab=diy#draft')

    expect(currentAppRedirect()).toBe('/app/cloud?tab=diy#draft')
  })

  it('converts app redirects into router paths after authentication', () => {
    expect(routerPathFromRedirect('/app/cloud?tab=diy#draft')).toBe('/cloud?tab=diy#draft')
    expect(webRedirectFromRouterPath('/cloud?tab=diy#draft')).toBe('/app/cloud?tab=diy#draft')
  })

  it('does not loop authenticated users back to auth routes', () => {
    expect(authenticatedRouterPathFromRedirect('/app/login?redirect=/app/cloud')).toBe('/space')
    expect(authenticatedRouterPathFromRedirect('/register')).toBe('/space')
  })

  it('uses the OS space chooser as the default authenticated route', () => {
    vi.stubEnv('VITE_SHADOW_OFFICIAL_OS_SERVER', 'official')

    expect(defaultAuthenticatedRouterPath()).toBe('/space')
    expect(webRedirectFromRouterPath()).toBe('/app/space')
    expect(authenticatedRouterPathFromRedirect('/app/login')).toBe('/space')
  })

  it('detects desktop auth continuation redirects after web login', () => {
    expect(isDesktopAuthContinuationPath('/app/desktop-auth-callback?redirect=/app/discover')).toBe(
      true,
    )
    expect(isDesktopAuthContinuationPath('/desktop-auth-callback?redirect=/app/discover')).toBe(
      true,
    )
    expect(isDesktopAuthContinuationPath('/app/discover')).toBe(false)
  })

  it('accepts same-origin absolute redirects but rejects unsafe targets', () => {
    expect(routerPathFromRedirect(`${window.location.origin}/app/cloud`)).toBe('/cloud')
    expect(routerPathFromRedirect('https://evil.example/app/cloud')).toBe('/space')
    expect(routerPathFromRedirect('//evil.example/app/cloud')).toBe('/space')
    expect(routerPathFromRedirect('/app/cloud\nSet-Cookie:bad=1')).toBe('/space')
    expect(routerPathFromRedirect('/app\\evil.example')).toBe('/space')
  })
})
