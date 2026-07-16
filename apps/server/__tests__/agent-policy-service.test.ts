import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentPolicyService } from '../src/services/agent-policy.service'

describe('agent policy remote config', () => {
  const agentId = 'agent-1'
  const agentUserId = 'buddy-user-1'
  const ownerId = 'owner-1'
  const serverId = 'server-1'

  const deps = {
    agentDao: {
      findById: vi.fn(),
    },
    agentPolicyDao: {
      findByAgentId: vi.fn(),
    },
    serverDao: {
      findByUserId: vi.fn(),
      getMember: vi.fn(),
    },
    channelDao: {
      findByServerId: vi.fn(),
    },
    channelMemberDao: {
      getUserChannelIds: vi.fn(),
    },
    rentalContractDao: {
      findActiveByAgentId: vi.fn(),
    },
    logger: {
      warn: vi.fn(),
    },
  }

  let service: AgentPolicyService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new AgentPolicyService(
      deps as unknown as ConstructorParameters<typeof AgentPolicyService>[0],
    )
    deps.agentDao.findById.mockResolvedValue({
      id: agentId,
      userId: agentUserId,
      ownerId,
      config: { buddyMode: 'shareable' },
    })
    deps.agentPolicyDao.findByAgentId.mockResolvedValue([])
    deps.serverDao.findByUserId.mockResolvedValue([
      { server: { id: serverId, name: 'Project', slug: 'project', iconUrl: null } },
    ])
    deps.serverDao.getMember.mockResolvedValue({ userId: ownerId, serverId })
    deps.channelDao.findByServerId.mockResolvedValue([
      {
        id: 'inbox-1',
        name: 'Inbox',
        type: 'text',
        kind: 'server',
        serverId,
        topic: `shadow:buddy-inbox:${agentId}`,
        isPrivate: true,
      },
      {
        id: 'channel-1',
        name: 'general',
        type: 'text',
        kind: 'server',
        serverId,
        topic: 'General discussion',
        isPrivate: false,
      },
    ])
    deps.channelMemberDao.getUserChannelIds.mockResolvedValue(['inbox-1', 'channel-1'])
    deps.rentalContractDao.findActiveByAgentId.mockResolvedValue([])
  })

  it('labels Inbox and ordinary channels without a collaboration claim route', async () => {
    const config = await service.getRemoteConfig(agentId)
    const channels = config.servers[0]?.channels

    expect(channels).toEqual([
      expect.objectContaining({
        id: 'inbox-1',
        kind: 'server',
        isPrivate: true,
        routeType: 'buddy-inbox',
      }),
      expect.objectContaining({
        id: 'channel-1',
        kind: 'server',
        isPrivate: false,
        routeType: 'channel',
      }),
    ])
    expect(JSON.stringify(config)).not.toContain('buddy-collaborations/claim')
  })
})
