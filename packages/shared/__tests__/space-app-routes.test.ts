import { describe, expect, it } from 'vitest'
import {
  buildSpaceAppCommunityPath,
  buildSpaceAppSharePath,
  buildSpaceAppShareUrl,
  normalizeSpaceAppRoutePath,
  spaceAppPathFromSearch,
  withSpaceAppRoutePathSearch,
} from '../src/utils/space-app-routes'

describe('Space App route helpers', () => {
  it('normalizes iframe route paths conservatively', () => {
    expect(normalizeSpaceAppRoutePath('/boards/1?tab=done')).toBe('/boards/1?tab=done')
    expect(normalizeSpaceAppRoutePath('https://evil.test')).toBeNull()
    expect(normalizeSpaceAppRoutePath('//evil.test/path')).toBeNull()
    expect(normalizeSpaceAppRoutePath('/bad\\path')).toBeNull()
    expect(normalizeSpaceAppRoutePath('', '/')).toBe('/')
  })

  it('builds community and share paths with appPath search state', () => {
    expect(
      buildSpaceAppCommunityPath({
        serverSlug: 'dragon-farm',
        appKey: 'qa',
        appPath: '/questions/42',
      }),
    ).toBe('/app/servers/dragon-farm/space-apps/qa?appPath=%2Fquestions%2F42')
    expect(
      buildSpaceAppSharePath({
        serverSlug: 'dragon-farm',
        appKey: 'qa',
        appPath: '/',
      }),
    ).toBe('/app/share/space-app/dragon-farm/qa')
    expect(
      buildSpaceAppShareUrl({
        origin: 'https://shadow.example',
        serverSlug: 'dragon-farm',
        appKey: 'qa',
        appPath: '/questions/42',
      }),
    ).toBe('https://shadow.example/app/share/space-app/dragon-farm/qa?appPath=%2Fquestions%2F42')
  })

  it('merges appPath into route search objects', () => {
    expect(withSpaceAppRoutePathSearch({ copilot: 'channel-1' }, '/boards/1')).toEqual({
      copilot: 'channel-1',
      appPath: '/boards/1',
    })
    expect(withSpaceAppRoutePathSearch({ appPath: '/boards/1' }, '/')).toEqual({})
    expect(spaceAppPathFromSearch({ appPath: '/boards/2' })).toBe('/boards/2')
  })
})
