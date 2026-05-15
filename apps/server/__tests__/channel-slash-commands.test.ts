import { describe, expect, it, vi } from 'vitest'
import type { AppContainer } from '../src/container'
import { createChannelHandler } from '../src/handlers/channel.handler'
import { signAccessToken } from '../src/lib/jwt'

function createMockContainer(registry: Record<string, unknown>): AppContainer {
  return {
    resolve: vi.fn((key: string) => {
      const dependency = registry[key]
      if (!dependency) throw new Error(`Missing mock dependency: ${key}`)
      return dependency
    }),
  } as unknown as AppContainer
}

function authHeaders(userId = 'user-1') {
  const token = signAccessToken({
    userId,
    email: `${userId}@example.test`,
    username: userId,
  })
  return { Authorization: `Bearer ${token}` }
}

describe('channel slash command registry', () => {
  it('returns registered Buddy slash commands in direct messages', async () => {
    const channelService = {
      getById: vi.fn().mockResolvedValue({ id: 'dm-1', kind: 'dm', serverId: null }),
      getDirectChannelById: vi.fn().mockResolvedValue({ id: 'dm-1', kind: 'dm' }),
      findDirectPeer: vi.fn().mockResolvedValue({
        id: 'bot-user-1',
        username: 'audit-buddy',
        displayName: 'Audit Buddy',
        isBot: true,
      }),
    }
    const agentDao = {
      findByUserIds: vi.fn().mockResolvedValue([
        {
          id: 'agent-1',
          userId: 'bot-user-1',
          config: {
            slashCommands: [
              { name: '/audit', description: ' Run audit ', aliases: ['/a'] },
              { name: 'bad name!' },
            ],
          },
        },
      ]),
    }

    const app = createChannelHandler(
      createMockContainer({
        channelService,
        serverDao: {},
        channelMemberDao: {},
        agentDao,
      }),
    )

    const res = await app.request('/channels/dm-1/slash-commands', {
      headers: authHeaders(),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(channelService.getDirectChannelById).toHaveBeenCalledWith('dm-1', 'user-1')
    expect(agentDao.findByUserIds).toHaveBeenCalledWith(['bot-user-1'])
    expect(body).toEqual({
      commands: [
        {
          name: 'audit',
          description: 'Run audit',
          aliases: ['a'],
          agentId: 'agent-1',
          botUserId: 'bot-user-1',
          botUsername: 'audit-buddy',
          botDisplayName: 'Audit Buddy',
        },
      ],
    })
  })

  it('does not expose direct message slash commands to non-participants', async () => {
    const channelService = {
      getById: vi.fn().mockResolvedValue({ id: 'dm-1', kind: 'dm', serverId: null }),
      getDirectChannelById: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Not a participant of this direct channel'), { status: 403 }),
        ),
      findDirectPeer: vi.fn(),
    }
    const agentDao = {
      findByUserIds: vi.fn(),
    }

    const app = createChannelHandler(
      createMockContainer({
        channelService,
        serverDao: {},
        channelMemberDao: {},
        agentDao,
      }),
    )

    const res = await app.request('/channels/dm-1/slash-commands', {
      headers: authHeaders('other-user'),
    })

    expect(res.status).toBe(403)
    expect(channelService.findDirectPeer).not.toHaveBeenCalled()
    expect(agentDao.findByUserIds).not.toHaveBeenCalled()
  })
})

describe('channel Buddy reply policy routes', () => {
  it('lets an active tenant store a custom channel policy', async () => {
    const agentPolicyService = {
      upsertPolicies: vi.fn().mockResolvedValue([{ id: 'policy-1' }]),
    }
    const agentService = {
      getById: vi.fn().mockResolvedValue({
        id: 'agent-1',
        userId: 'bot-user-1',
        ownerId: 'owner-1',
      }),
    }
    const channelService = {
      getById: vi.fn().mockResolvedValue({ id: 'channel-1', kind: 'server', serverId: 'server-1' }),
    }
    const rentalService = {
      canUseAgent: vi.fn().mockResolvedValue({ canUse: true, role: 'tenant' }),
    }

    const app = createChannelHandler(
      createMockContainer({
        agentPolicyService,
        agentService,
        channelService,
        rentalService,
      }),
    )

    const res = await app.request('/channels/channel-1/agents/agent-1/policy', {
      method: 'PUT',
      headers: { ...authHeaders('tenant-1'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'custom',
        config: {
          mentionOnly: true,
          replyToUsers: ['alice'],
          keywords: ['urgent'],
          replyToBuddy: true,
          maxBuddyChainDepth: 2,
          smartReply: false,
        },
      }),
    })

    expect(res.status).toBe(200)
    expect(rentalService.canUseAgent).toHaveBeenCalledWith('agent-1', 'tenant-1')
    expect(agentPolicyService.upsertPolicies).toHaveBeenCalledWith('agent-1', [
      {
        serverId: 'server-1',
        channelId: 'channel-1',
        listen: true,
        reply: true,
        mentionOnly: true,
        config: {
          mentionOnly: true,
          replyToUsers: ['alice'],
          keywords: ['urgent'],
          replyToBuddy: true,
          maxBuddyChainDepth: 2,
          smartReply: false,
        },
      },
    ])
  })

  it('rejects policy updates from users who are not the Buddy owner or tenant', async () => {
    const agentPolicyService = {
      upsertPolicies: vi.fn(),
    }
    const agentService = {
      getById: vi.fn().mockResolvedValue({
        id: 'agent-1',
        userId: 'bot-user-1',
        ownerId: 'owner-1',
      }),
    }
    const channelService = {
      getById: vi.fn().mockResolvedValue({ id: 'channel-1', kind: 'server', serverId: 'server-1' }),
    }
    const rentalService = {
      canUseAgent: vi.fn().mockResolvedValue({ canUse: false, role: null }),
    }

    const app = createChannelHandler(
      createMockContainer({
        agentPolicyService,
        agentService,
        channelService,
        rentalService,
      }),
    )

    const res = await app.request('/channels/channel-1/agents/agent-1/policy', {
      method: 'PUT',
      headers: { ...authHeaders('user-2'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'disabled' }),
    })

    expect(res.status).toBe(403)
    expect(agentPolicyService.upsertPolicies).not.toHaveBeenCalled()
  })

  it('returns the stored channel policy instead of a fixed default', async () => {
    const agentPolicyDao = {
      findByChannel: vi.fn().mockResolvedValue({
        listen: true,
        reply: false,
        mentionOnly: true,
        config: { replyToBuddy: true },
      }),
      findServerDefault: vi.fn(),
    }
    const agentService = {
      getById: vi.fn().mockResolvedValue({
        id: 'agent-1',
        userId: 'bot-user-1',
        ownerId: 'owner-1',
      }),
    }
    const channelService = {
      getById: vi.fn().mockResolvedValue({ id: 'channel-1', kind: 'server', serverId: 'server-1' }),
    }

    const app = createChannelHandler(
      createMockContainer({
        agentPolicyDao,
        agentService,
        channelService,
      }),
    )

    const res = await app.request('/channels/channel-1/agents/agent-1/policy', {
      headers: authHeaders('owner-1'),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      listen: true,
      reply: false,
      mentionOnly: true,
      config: { replyToBuddy: true },
    })
  })
})
