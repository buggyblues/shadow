import { describe, expect, it } from 'vitest'
import { serverChannelHref } from './routes'
import { parseScannedShadowLink } from './scan-links'

describe('serverChannelHref', () => {
  it('builds the expo-router dynamic channel route', () => {
    expect(serverChannelHref('shadow-town', 'channel-1')).toEqual({
      pathname: '/servers/[serverSlug]/channels/[channelId]',
      params: {
        serverSlug: 'shadow-town',
        channelId: 'channel-1',
      },
    })
  })

  it('keeps message deep-link params out of the pathname', () => {
    expect(serverChannelHref('shadow-town', 'channel-1', { messageId: 'message-1' })).toEqual({
      pathname: '/servers/[serverSlug]/channels/[channelId]',
      params: {
        serverSlug: 'shadow-town',
        channelId: 'channel-1',
        msg: 'message-1',
      },
    })
  })
})

describe('parseScannedShadowLink', () => {
  it('parses web channel links from QR codes', () => {
    expect(
      parseScannedShadowLink('https://shadowob.com/app/servers/shadow-town/channels/channel-1'),
    ).toEqual({
      type: 'channel',
      serverSlug: 'shadow-town',
      channelId: 'channel-1',
    })
  })

  it('parses app scheme channel links', () => {
    expect(
      parseScannedShadowLink('shadow://servers/shadow-town/channels/channel-1?msg=m1'),
    ).toEqual({
      type: 'channel',
      serverSlug: 'shadow-town',
      channelId: 'channel-1',
      messageId: 'm1',
    })
  })

  it('parses invite links', () => {
    expect(parseScannedShadowLink('https://shadowob.com/app/invite/invite-code')).toEqual({
      type: 'invite',
      code: 'invite-code',
    })
  })

  it('parses Buddy card links', () => {
    expect(parseScannedShadowLink('https://shadowob.com/app/agents/agent-1')).toEqual({
      type: 'buddy',
      buddyId: 'agent-1',
    })
  })

  it('does not throw on malformed scanned URLs', () => {
    expect(parseScannedShadowLink('https://shadowob.com/app/servers/%E0%A4%A/channels/c1')).toEqual(
      {
        type: 'channel',
        serverSlug: '%E0%A4%A',
        channelId: 'c1',
      },
    )
  })
})
