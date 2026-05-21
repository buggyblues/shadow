import { describe, expect, it, vi } from 'vitest'
import { ChannelService } from '../src/services/channel.service'

type ChannelServiceDeps = ConstructorParameters<typeof ChannelService>[0]

function makeChannel(input: { id: string; name: string; isPrivate?: boolean }) {
  return {
    id: input.id,
    kind: 'server' as const,
    name: input.name,
    type: 'text' as const,
    serverId: 'server-1',
    dmUserAId: null,
    dmUserBId: null,
    dmPairKey: null,
    topic: null,
    position: 0,
    isPrivate: input.isPrivate ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: null,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
  }
}

function setup() {
  const channelDao = {
    findByServerId: vi.fn().mockResolvedValue([]),
    findArchivedByServerId: vi.fn().mockResolvedValue([]),
  }
  const channelMemberDao = {
    getUserChannelIds: vi.fn().mockResolvedValue([]),
  }
  const policyService = {
    requireServerMember: vi.fn().mockResolvedValue({ role: 'member' }),
  }
  const service = new ChannelService({
    channelDao,
    channelMemberDao,
    serverDao: {},
    serverService: {},
    policyService,
  } as unknown as ChannelServiceDeps)

  return { channelDao, channelMemberDao, policyService, service }
}

describe('ChannelService.getByServerIdForUser', () => {
  it('rejects non-members before reading server channels', async () => {
    const { channelDao, policyService, service } = setup()
    policyService.requireServerMember.mockRejectedValue(
      Object.assign(new Error('Not a member of this server'), { status: 403 }),
    )

    await expect(service.getByServerIdForUser('server-1', 'user-1')).rejects.toMatchObject({
      status: 403,
    })

    expect(policyService.requireServerMember).toHaveBeenCalledWith('user-1', 'server-1')
    expect(channelDao.findByServerId).not.toHaveBeenCalled()
  })

  it('filters app channels and private channels for server members', async () => {
    const { channelDao, channelMemberDao, service } = setup()
    channelDao.findByServerId.mockResolvedValue([
      makeChannel({ id: 'public-1', name: 'general' }),
      makeChannel({ id: 'private-1', name: 'plans', isPrivate: true }),
      makeChannel({ id: 'app-1', name: 'app:workspace' }),
    ])
    channelMemberDao.getUserChannelIds.mockResolvedValue(['private-1'])

    const channels = await service.getByServerIdForUser('server-1', 'user-1')

    expect(channels.map((channel) => ({ id: channel.id, isMember: channel.isMember }))).toEqual([
      { id: 'public-1', isMember: false },
      { id: 'private-1', isMember: true },
    ])
  })

  it('requires server membership before reading archived channels', async () => {
    const { channelDao, policyService, service } = setup()
    policyService.requireServerMember.mockRejectedValue(
      Object.assign(new Error('Not a member of this server'), { status: 403 }),
    )

    await expect(service.getArchivedChannels('server-1', 'user-1')).rejects.toMatchObject({
      status: 403,
    })

    expect(channelDao.findArchivedByServerId).not.toHaveBeenCalled()
  })
})
