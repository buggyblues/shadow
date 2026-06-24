import { describe, expect, it } from 'vitest'
import {
  buildServerAppCommunityPath,
  buildServerAppSharePath,
  buildServerAppShareUrl,
  normalizeServerAppRoutePath,
  serverAppPathFromSearch,
  withServerAppRoutePathSearch,
} from '../src/utils/server-app-routes'

describe('server app route helpers', () => {
  it('normalizes iframe route paths conservatively', () => {
    expect(normalizeServerAppRoutePath('/boards/1?tab=done')).toBe('/boards/1?tab=done')
    expect(normalizeServerAppRoutePath('https://evil.test')).toBeNull()
    expect(normalizeServerAppRoutePath('//evil.test/path')).toBeNull()
    expect(normalizeServerAppRoutePath('/bad\\path')).toBeNull()
    expect(normalizeServerAppRoutePath('', '/')).toBe('/')
  })

  it('builds community and share paths with appPath search state', () => {
    expect(
      buildServerAppCommunityPath({
        serverSlug: 'dragon-farm',
        appKey: 'qa',
        appPath: '/questions/42',
      }),
    ).toBe('/app/servers/dragon-farm/apps/qa?appPath=%2Fquestions%2F42')
    expect(
      buildServerAppSharePath({
        serverSlug: 'dragon-farm',
        appKey: 'qa',
        appPath: '/',
      }),
    ).toBe('/app/share/server-app/dragon-farm/qa')
    expect(
      buildServerAppShareUrl({
        origin: 'https://shadow.example',
        serverSlug: 'dragon-farm',
        appKey: 'qa',
        appPath: '/questions/42',
      }),
    ).toBe('https://shadow.example/app/share/server-app/dragon-farm/qa?appPath=%2Fquestions%2F42')
  })

  it('merges appPath into route search objects', () => {
    expect(withServerAppRoutePathSearch({ copilot: 'channel-1' }, '/boards/1')).toEqual({
      copilot: 'channel-1',
      appPath: '/boards/1',
    })
    expect(withServerAppRoutePathSearch({ appPath: '/boards/1' }, '/')).toEqual({})
    expect(serverAppPathFromSearch({ appPath: '/boards/2' })).toBe('/boards/2')
  })
})
