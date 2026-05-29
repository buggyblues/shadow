import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GreetingService } from '../src/services/greeting.service'

describe('greeting service', () => {
  const ioEmit = vi.fn()
  const deps = {
    io: {
      to: vi.fn(() => ({ emit: ioEmit })),
    },
    userDao: {
      findById: vi.fn(),
    },
    serverService: {
      ensureMember: vi.fn(),
      addBotMember: vi.fn(),
    },
    channelService: {
      addMember: vi.fn(),
    },
    agentDao: {
      findByUserId: vi.fn(),
    },
    agentPolicyService: {
      upsertPolicies: vi.fn(),
    },
    messageService: {
      getByChannelId: vi.fn(),
      send: vi.fn(),
    },
  }

  let service: GreetingService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GreetingService(
      deps as unknown as ConstructorParameters<typeof GreetingService>[0],
    )
    deps.userDao.findById.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      displayName: 'Alice',
    })
    deps.serverService.ensureMember.mockResolvedValue(undefined)
    deps.serverService.addBotMember.mockResolvedValue(undefined)
    deps.channelService.addMember.mockResolvedValue(undefined)
    deps.agentDao.findByUserId.mockResolvedValue({
      id: 'agent-1',
      userId: 'buddy-user-1',
    })
    deps.agentPolicyService.upsertPolicies.mockResolvedValue(undefined)
    deps.messageService.getByChannelId.mockResolvedValue({ messages: [], hasMore: false })
    deps.messageService.send.mockResolvedValue(undefined)
  })

  it('adds launched buddies with a channel-scoped policy instead of a server-wide default', async () => {
    await service.addBuddiesAndGreet(
      'server-1',
      'channel-1',
      [{ userId: 'buddy-user-1', agentId: 'agent-1' }],
      {
        greeting: 'Alice，你好。',
        metadata: { greeting: { kind: 'private_room' } },
      },
    )

    expect(deps.serverService.addBotMember).toHaveBeenCalledWith('server-1', 'buddy-user-1')
    expect(deps.channelService.addMember).toHaveBeenCalledWith('channel-1', 'buddy-user-1')
    expect(deps.agentPolicyService.upsertPolicies).toHaveBeenCalledWith('agent-1', [
      {
        serverId: 'server-1',
        channelId: 'channel-1',
        listen: true,
        reply: true,
        mentionOnly: false,
        config: {},
      },
    ])
    expect(ioEmit).toHaveBeenCalledWith('agent:policy-changed', {
      agentId: 'agent-1',
      serverId: 'server-1',
      channelId: 'channel-1',
    })
    expect(deps.messageService.send).toHaveBeenCalledWith(
      'channel-1',
      'buddy-user-1',
      expect.objectContaining({ content: 'Alice，你好。' }),
    )
  })

  it('sends one-time cloud deployment greetings without widening provisioned policies', async () => {
    const deployedSnapshot = {
      __shadowobRuntime: {
        greeting: {
          entryChannelId: 'delivery',
          messages: [
            {
              id: 'welcome',
              channelId: 'delivery',
              buddyId: 'gstack-bot',
              content: '{userName}，欢迎来到 BMAD 方法空间。',
            },
          ],
        },
        provisionState: {
          plugins: {
            shadowob: {
              servers: { 'gstack-hq': 'server-1' },
              channels: { delivery: 'channel-1' },
              buddies: {
                'gstack-bot': {
                  agentId: 'strategy-buddy',
                  userId: 'buddy-user-1',
                },
              },
            },
          },
        },
      },
      use: [
        {
          plugin: 'shadowob',
          options: {
            servers: [
              {
                id: 'gstack-hq',
                name: 'gstack',
                slug: 'gstack',
                channels: [{ id: 'delivery', title: 'Delivery', type: 'text' }],
              },
            ],
            buddies: [{ id: 'gstack-bot', name: 'Strategy Buddy' }],
            bindings: [],
          },
        },
      ],
    }

    await service.ensureCloudDeploymentGreeting('user-1', {
      id: 'deployment-1',
      status: 'deployed',
      templateSlug: 'gstack-buddy',
      configSnapshot: deployedSnapshot,
    })

    expect(deps.serverService.ensureMember).toHaveBeenCalledWith('server-1', 'user-1', {
      allowPrivatePlay: true,
    })
    expect(deps.serverService.addBotMember).toHaveBeenCalledWith('server-1', 'buddy-user-1')
    expect(deps.channelService.addMember).toHaveBeenCalledWith('channel-1', 'buddy-user-1')
    expect(deps.agentPolicyService.upsertPolicies).not.toHaveBeenCalled()
    expect(ioEmit).toHaveBeenCalledWith('agent:policy-changed', {
      agentId: 'agent-1',
      serverId: 'server-1',
      channelId: 'channel-1',
    })
    expect(deps.messageService.send).toHaveBeenCalledWith(
      'channel-1',
      'buddy-user-1',
      expect.objectContaining({
        content: 'Alice，欢迎来到 BMAD 方法空间。',
        metadata: expect.objectContaining({
          greeting: expect.objectContaining({
            kind: 'cloud_deploy',
            deploymentId: 'deployment-1',
            messageId: 'welcome',
          }),
        }),
      }),
    )
  })
})
