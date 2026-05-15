import { describe, expect, it } from 'vitest'
import { resolveCommunityUrl } from '../src/shared/community-url'

describe('resolveCommunityUrl', () => {
  it('opens a channel notification in the browser route', () => {
    expect(
      resolveCommunityUrl('https://shadowob.app', {
        id: 'n1',
        title: 'Mention',
        isRead: false,
        scopeServerId: 'server-1',
        scopeChannelId: 'channel-1',
      }),
    ).toBe('https://shadowob.app/app/servers/server-1/channels/channel-1')
  })

  it('falls back to discover when scope is missing', () => {
    expect(resolveCommunityUrl('https://shadowob.app', null)).toBe(
      'https://shadowob.app/app/discover',
    )
  })
})
