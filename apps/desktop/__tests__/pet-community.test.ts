import { describe, expect, it } from 'vitest'
import {
  communityRequestStateFromError,
  isCommunityAuthRequiredError,
  loadCommunityChannelOptions,
  loadContentSubscriptions,
  loadSubscriptionFiles,
} from '../src/renderer/lib/pet-community'
import type { DesktopPetApi } from '../src/renderer/pet-types'

describe('desktop community request errors', () => {
  it('recognizes direct and Electron-wrapped auth failures', () => {
    expect(isCommunityAuthRequiredError(new Error('AUTH_REQUIRED'))).toBe(true)
    expect(
      isCommunityAuthRequiredError(
        new Error(
          "Error invoking remote method 'desktop:community:fetchJson': Error: AUTH_REQUIRED",
        ),
      ),
    ).toBe(true)
  })

  it('maps only auth failures to the auth state', () => {
    expect(communityRequestStateFromError(new Error('AUTH_REQUIRED'))).toBe('auth')
    expect(communityRequestStateFromError(new Error('REQUEST_FAILED_500'))).toBe('error')
  })

  it('treats missing optional content endpoints as empty desktop data', async () => {
    const calls: Array<{ path: string; optional?: boolean }> = []
    const api: DesktopPetApi = {
      communityFetchJson: async <T>({ path, optional }: { path: string; optional?: boolean }) => {
        calls.push({ path, optional })
        return { __desktopCommunityNotFound: true } as T
      },
    }

    await expect(loadContentSubscriptions(api)).resolves.toEqual([])
    await expect(loadSubscriptionFiles(api, [])).resolves.toEqual([])

    expect(calls).toEqual([
      { path: '/api/content-subscriptions', optional: true },
      { path: '/api/content-feed?limit=50&sort=latest', optional: true },
    ])
  })

  it('falls back from server slug to id without surfacing optional channel 404s', async () => {
    const calls: Array<{ path: string; optional?: boolean }> = []
    const api: DesktopPetApi = {
      communityFetchJson: async <T>({ path, optional }: { path: string; optional?: boolean }) => {
        calls.push({ path, optional })
        if (path === '/api/servers') {
          return [{ id: 'server-id', slug: 'server-slug', name: 'Server' }] as T
        }
        if (path.includes('server-slug')) return { __desktopCommunityNotFound: true } as T
        return [{ id: 'channel-id', name: 'general', serverId: 'server-id' }] as T
      },
    }

    await expect(loadCommunityChannelOptions(api)).resolves.toEqual([
      {
        id: 'channel-id',
        name: 'general',
        serverId: 'server-id',
        serverSlug: 'server-slug',
        serverName: 'Server',
      },
    ])
    expect(calls).toEqual([
      { path: '/api/servers', optional: undefined },
      { path: '/api/servers/server-slug/channels', optional: true },
      { path: '/api/servers/server-id/channels', optional: true },
    ])
  })
})
