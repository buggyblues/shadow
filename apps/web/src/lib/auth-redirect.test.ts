import { beforeEach, describe, expect, it } from 'vitest'
import {
  authenticatedRouterPathFromRedirect,
  currentAppRedirect,
  isDesktopAuthContinuationPath,
  routerPathFromRedirect,
  webRedirectFromRouterPath,
} from './auth-redirect'

describe('auth redirect helpers', () => {
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
    expect(authenticatedRouterPathFromRedirect('/app/login?redirect=/app/cloud')).toBe('/discover')
    expect(authenticatedRouterPathFromRedirect('/register')).toBe('/discover')
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
    expect(routerPathFromRedirect('https://evil.example/app/cloud')).toBe('/discover')
    expect(routerPathFromRedirect('//evil.example/app/cloud')).toBe('/discover')
    expect(routerPathFromRedirect('/app/cloud\nSet-Cookie:bad=1')).toBe('/discover')
    expect(routerPathFromRedirect('/app\\evil.example')).toBe('/discover')
  })
})
