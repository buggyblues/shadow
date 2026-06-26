import { describe, expect, it, vi } from 'vitest'
import type { AppContainer } from '../src/container'
import { replayBotChannelMemberships } from '../src/ws/chat.gateway'

describe('replayBotChannelMemberships', () => {
  it('replays existing channel memberships to a reconnecting Buddy socket', async () => {
    const emit = vi.fn()
    const channelMemberDao = {
      getAllChannelIds: vi.fn().mockResolvedValue(['server-channel', 'dm-channel']),
    }
    const channelDao = {
      findById: vi.fn(async (channelId: string) =>
        channelId === 'server-channel'
          ? { id: channelId, serverId: 'server-1' }
          : { id: channelId, serverId: null },
      ),
    }
    const container = {
      resolve: vi.fn((name: string) => {
        if (name === 'channelMemberDao') return channelMemberDao
        if (name === 'channelDao') return channelDao
        throw new Error(`unexpected dependency ${name}`)
      }),
    } as unknown as AppContainer

    await replayBotChannelMemberships({ emit }, container, 'bot-user-1')

    expect(channelMemberDao.getAllChannelIds).toHaveBeenCalledWith('bot-user-1')
    expect(emit).toHaveBeenCalledWith('channel:member-added', {
      channelId: 'server-channel',
      serverId: 'server-1',
      existing: true,
    })
    expect(emit).toHaveBeenCalledWith('channel:member-added', {
      channelId: 'dm-channel',
      existing: true,
    })
  })
})
