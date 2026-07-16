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

function setup(overrides: Partial<ChannelServiceDeps> = {}) {
  const channelDao = {
    create: vi.fn(),
    findByServerId: vi.fn().mockResolvedValue([]),
    findByServerIdAndNamePrefix: vi.fn().mockResolvedValue([]),
    findDirectChannelsForUser: vi.fn().mockResolvedValue([]),
    findArchivedByServerId: vi.fn().mockResolvedValue([]),
  }
  const channelMemberDao = {
    add: vi.fn().mockResolvedValue(undefined),
    getUserChannelIds: vi.fn().mockResolvedValue([]),
  }
  const policyService = {
    requireServerMember: vi.fn().mockResolvedValue({ role: 'member' }),
    requireServerRole: vi.fn().mockResolvedValue({ role: 'member' }),
  }
  const service = new ChannelService({
    channelDao,
    channelMemberDao,
    serverDao: {},
    serverService: {},
    policyService,
    ...overrides,
  } as unknown as ChannelServiceDeps)

  return { channelDao, channelMemberDao, policyService, service }
}

describe('ChannelService.create', () => {
  it('allows a regular Space member to create a channel', async () => {
    const { channelDao, channelMemberDao, policyService, service } = setup()
    channelDao.create.mockResolvedValue(makeChannel({ id: 'channel-1', name: 'member-channel' }))

    const channel = await service.create(
      'server-1',
      { name: 'member-channel', type: 'text', isPrivate: false },
      'user-1',
    )

    expect(policyService.requireServerRole).toHaveBeenCalledWith('user-1', 'server-1', 'member')
    expect(channelMemberDao.add).toHaveBeenCalledWith('channel-1', 'user-1')
    expect(channel.name).toBe('member-channel')
  })
})

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
      makeChannel({ id: 'app-1', name: 'space-app:workspace' }),
    ])
    channelMemberDao.getUserChannelIds.mockResolvedValue(['private-1'])

    const channels = await service.getByServerIdForUser('server-1', 'user-1')

    expect(channels.map((channel) => ({ id: channel.id, isMember: channel.isMember }))).toEqual([
      { id: 'public-1', isMember: false },
      { id: 'private-1', isMember: true },
    ])
  })

  it('attaches batched latest message and channel member previews', async () => {
    const messageDao = {
      findChannelListPreviews: vi.fn().mockResolvedValue(
        new Map([
          [
            'public-1',
            {
              lastMessagePreview: {
                id: 'message-1',
                content: 'hello',
                createdAt: new Date('2026-06-17T04:00:00.000Z'),
                attachmentCount: 1,
                attachmentPreviews: [
                  {
                    id: 'attachment-1',
                    filename: 'deck.pptx',
                    contentType:
                      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    kind: 'file',
                  },
                ],
                author: {
                  id: 'user-2',
                  username: 'mei',
                  displayName: 'Mei',
                },
              },
              memberPreviews: [
                {
                  id: 'user-2',
                  username: 'mei',
                  displayName: 'Mei',
                  avatarUrl: 'avatar://mei',
                  status: 'online',
                  lastSpokeAt: new Date('2026-06-17T04:00:00.000Z'),
                },
              ],
            },
          ],
        ]),
      ),
    }
    const { channelDao, channelMemberDao, service } = setup({
      messageDao,
    } as Partial<ChannelServiceDeps>)
    channelDao.findByServerId.mockResolvedValue([makeChannel({ id: 'public-1', name: 'general' })])
    channelMemberDao.getUserChannelIds.mockResolvedValue(['public-1'])

    const channels = await service.getByServerIdForUser('server-1', 'user-1')

    expect(messageDao.findChannelListPreviews).toHaveBeenCalledWith(['public-1'], 6)
    expect(channels[0]).toMatchObject({
      id: 'public-1',
      lastMessagePreview: {
        id: 'message-1',
        content: 'hello',
        attachmentPreviews: [
          {
            id: 'attachment-1',
            filename: 'deck.pptx',
            kind: 'file',
          },
        ],
        author: { id: 'user-2', username: 'mei', displayName: 'Mei' },
      },
      memberPreviews: [
        {
          id: 'user-2',
          username: 'mei',
          avatarUrl: 'avatar://mei',
        },
      ],
    })
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

describe('ChannelService.listDirectChannels', () => {
  it('attaches the latest message preview to direct channel rows', async () => {
    const messageDao = {
      findChannelListPreviews: vi.fn().mockResolvedValue(
        new Map([
          [
            'dm-1',
            {
              lastMessagePreview: {
                id: 'message-1',
                content: 'latest direct message',
                createdAt: new Date('2026-07-14T02:00:00.000Z'),
                attachmentCount: 0,
                attachmentPreviews: [],
                author: {
                  id: 'buddy-1',
                  username: 'buddy',
                  displayName: 'Buddy',
                },
              },
              memberPreviews: [],
            },
          ],
        ]),
      ),
    }
    const { channelDao, service } = setup({ messageDao } as Partial<ChannelServiceDeps>)
    channelDao.findDirectChannelsForUser.mockResolvedValue([
      {
        id: 'dm-1',
        kind: 'dm',
        name: 'Direct Message',
        otherUser: {
          id: 'buddy-1',
          username: 'buddy',
          displayName: 'Buddy',
          avatarUrl: null,
          status: 'online',
          isBot: true,
        },
      },
    ])

    const channels = await service.listDirectChannels('user-1')

    expect(messageDao.findChannelListPreviews).toHaveBeenCalledWith(['dm-1'], 6)
    expect(channels[0]).toMatchObject({
      id: 'dm-1',
      lastMessagePreview: {
        id: 'message-1',
        content: 'latest direct message',
        author: { id: 'buddy-1', username: 'buddy' },
      },
    })
  })
})
