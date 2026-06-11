import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BuddyInboxService } from '../src/services/buddy-inbox.service'

const serverId = '00000000-0000-4000-8000-000000000001'
const agentId = '00000000-0000-4000-8000-000000000002'
const channelId = '00000000-0000-4000-8000-000000000003'
const buddyUserId = '00000000-0000-4000-8000-000000000004'
const ownerUserId = '00000000-0000-4000-8000-000000000005'

function createService() {
  const agent = {
    id: agentId,
    userId: buddyUserId,
    ownerId: ownerUserId,
    status: 'running',
  }
  const channel = {
    id: channelId,
    serverId,
    name: 'inbox-code-trainer-assistant-buddy',
    type: 'text',
    topic: `shadow:buddy-inbox:${agentId}`,
    isPrivate: true,
  }
  const visibleChannel = {
    id: '00000000-0000-4000-8000-000000000006',
    serverId,
    name: '代码复盘',
    type: 'text',
    topic: 'Post-submission review.',
    isPrivate: false,
  }
  const recommendationChannel = {
    id: '00000000-0000-4000-8000-000000000007',
    serverId,
    name: '题目推荐',
    type: 'text',
    topic: 'Daily recommendations.',
    isPrivate: false,
  }
  const existingPolicy = {
    id: 'policy-1',
    agentId,
    serverId,
    channelId,
    listen: false,
    reply: false,
    mentionOnly: true,
    config: {
      inboxAdmission: {
        defaultMode: 'first_time',
        rules: [],
      },
    },
  }
  const emit = vi.fn()
  const deps = {
    agentDao: {
      findById: vi.fn().mockResolvedValue(agent),
    },
    agentPolicyDao: {
      findByChannel: vi.fn().mockResolvedValue(existingPolicy),
      findByAgentAndServer: vi.fn().mockResolvedValue([
        {
          id: 'policy-visible',
          agentId,
          serverId,
          channelId: visibleChannel.id,
          listen: true,
          reply: true,
          mentionOnly: true,
          config: {},
        },
      ]),
      upsert: vi.fn(async (input) => ({ ...existingPolicy, ...input })),
    },
    channelDao: {
      findByServerId: vi.fn().mockResolvedValue([channel, recommendationChannel, visibleChannel]),
      create: vi.fn(),
    },
    channelMemberDao: {
      add: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ channelId, userId: ownerUserId }),
    },
    io: {
      to: vi.fn(() => ({ emit })),
    },
    mediaService: {
      resolveMediaUrl: vi.fn((value: string) => `http://localhost:3000${value}?signed=1`),
    },
    messageDao: {
      findByChannelId: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
      findById: vi.fn(),
    },
    messageService: {
      send: vi.fn().mockResolvedValue({
        id: 'message-1',
        channelId,
        metadata: {},
      }),
      updateMetadata: vi.fn(async (messageId, metadata) => ({
        id: messageId,
        channelId,
        metadata,
      })),
    },
    policyService: {
      requireServerMember: vi.fn().mockResolvedValue({ role: 'owner' }),
      requireChannelRead: vi.fn().mockResolvedValue({ channel }),
    },
    serverDao: {
      getMembers: vi.fn().mockResolvedValue([
        {
          user: {
            id: buddyUserId,
            username: 'code-trainer-assistant-buddy',
            displayName: '算法助教',
            avatarUrl: null,
          },
          agent,
        },
      ]),
      getMember: vi.fn().mockResolvedValue({ role: 'member' }),
      addMember: vi.fn(),
    },
    userDao: {
      findById: vi.fn(async (userId: string) => ({
        id: userId,
        username: userId === buddyUserId ? 'code-trainer-assistant-buddy' : 'admin',
        displayName: userId === buddyUserId ? '算法助教' : 'Admin',
        avatarUrl: null,
      })),
    },
  }

  return {
    agent,
    channel,
    deps,
    emit,
    service: new BuddyInboxService(deps as any),
    visibleChannel,
  }
}

describe('BuddyInboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('repairs existing Inbox channels with an active runtime policy', async () => {
    const { deps, emit, service } = createService()

    await service.ensure(serverId, agentId, { kind: 'user', userId: ownerUserId })

    expect(deps.agentPolicyDao.upsert).toHaveBeenCalledWith({
      agentId,
      serverId,
      channelId,
      listen: true,
      reply: true,
      mentionOnly: false,
      config: {
        inboxAdmission: {
          defaultMode: 'first_time',
          rules: [],
        },
        maxBuddyTurns: 3,
        replyToBuddy: true,
      },
    })
    expect(deps.io.to).toHaveBeenCalledWith(`user:${buddyUserId}`)
    expect(emit).toHaveBeenCalledWith('channel:member-added', { channelId, serverId })
    expect(emit).toHaveBeenCalledWith('agent:policy-changed', {
      agentId,
      serverId,
      channelId,
      reply: true,
      mentionOnly: false,
      config: {
        inboxAdmission: {
          defaultMode: 'first_time',
          rules: [],
        },
        maxBuddyTurns: 3,
        replyToBuddy: true,
      },
    })
  })

  it('activates the Inbox policy before enqueueing a task for an existing channel', async () => {
    const { deps, service } = createService()
    deps.agentPolicyDao.findByChannel.mockResolvedValue({
      id: 'policy-1',
      agentId,
      serverId,
      channelId,
      listen: false,
      reply: false,
      mentionOnly: true,
      config: {},
    })

    await service.enqueueTaskForAgent(
      serverId,
      agentId,
      {
        title: 'Review Two Sum submission',
        body: 'Run the sandbox and reply with feedback.',
        tags: ['review', { label: '算法' }],
        requirements: {
          capabilities: ['workspace.write'],
          skills: [{ kind: 'runtime-skill', package: '@shadow/skills-review' }],
        },
        outputContract: {
          expectedArtifacts: [{ kind: 'workspace.file', mimeTypes: ['application/json'] }],
          submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
        app: { appKey: 'judge', name: 'Judge', logoUrl: 'https://example.com/judge.png' },
      },
      { kind: 'user', userId: ownerUserId },
    )

    expect(deps.agentPolicyDao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId,
        serverId,
        channelId,
        listen: true,
        reply: true,
        mentionOnly: false,
        config: expect.objectContaining({
          maxBuddyTurns: 3,
          replyToBuddy: true,
        }),
      }),
    )
    expect(deps.agentPolicyDao.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      deps.messageService.send.mock.invocationCallOrder[0],
    )
    expect(deps.messageService.send).toHaveBeenCalledWith(
      channelId,
      ownerUserId,
      expect.objectContaining({
        content: expect.stringContaining('Review Two Sum submission'),
        metadata: expect.objectContaining({
          cards: expect.arrayContaining([
            expect.objectContaining({
              tags: ['review', { label: '算法' }],
              app: expect.objectContaining({
                appKey: 'judge',
                name: 'Judge',
                iconUrl: 'https://example.com/judge.png',
              }),
              requirements: expect.objectContaining({
                capabilities: ['workspace.write'],
                skills: [
                  expect.objectContaining({
                    kind: 'runtime-skill',
                    package: '@shadow/skills-review',
                  }),
                ],
              }),
              outputContract: expect.objectContaining({
                submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
              }),
              privacy: { dataClass: 'server-private', redactionRequired: true },
            }),
          ]),
        }),
      }),
    )
  })

  it('lazily initializes a missing peer Buddy Inbox during agent task delivery', async () => {
    const { channel, deps, service } = createService()
    const peerAgentId = '00000000-0000-4000-8000-000000000008'
    const peerUserId = '00000000-0000-4000-8000-000000000009'
    const createdChannel = {
      ...channel,
      id: '00000000-0000-4000-8000-000000000010',
      topic: `shadow:buddy-inbox:${agentId}`,
    }

    deps.policyService.requireServerMember.mockResolvedValue({ serverId, role: 'member' })
    deps.agentPolicyDao.findByChannel.mockResolvedValue(null)
    deps.channelDao.findByServerId.mockResolvedValue([])
    deps.channelDao.create.mockResolvedValue(createdChannel)
    deps.serverDao.getMember.mockImplementation(async (_serverId: string, userId: string) => {
      if (userId === buddyUserId || userId === peerUserId) return { role: 'member' }
      return null
    })

    await service.enqueueTaskForAgent(
      serverId,
      agentId,
      {
        title: 'Coordinate the next review',
        body: 'Take the delegated task from the coordinator Buddy.',
      },
      {
        kind: 'agent',
        userId: peerUserId,
        agentId: peerAgentId,
        ownerId: '00000000-0000-4000-8000-000000000011',
        scopes: [],
      },
    )

    expect(deps.channelDao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId,
        type: 'text',
        topic: `shadow:buddy-inbox:${agentId}`,
        isPrivate: true,
      }),
    )
    expect(deps.serverDao.addMember).not.toHaveBeenCalled()
    expect(deps.channelMemberDao.add).toHaveBeenCalledWith(createdChannel.id, buddyUserId)
    expect(deps.channelMemberDao.add).toHaveBeenCalledWith(createdChannel.id, peerUserId)
    expect(deps.messageService.send).toHaveBeenCalledWith(
      createdChannel.id,
      peerUserId,
      expect.objectContaining({
        content: expect.stringContaining('Coordinate the next review'),
      }),
    )
  })

  it('preserves task extensions while holding delivery for admission approval', async () => {
    const { deps, service } = createService()
    deps.agentPolicyDao.findByChannel.mockResolvedValue({
      id: 'policy-1',
      agentId,
      serverId,
      channelId,
      listen: true,
      reply: true,
      mentionOnly: false,
      config: {
        inboxAdmission: {
          defaultMode: 'every_time',
          rules: [],
        },
        inboxAdmissionPending: [],
      },
    })

    await expect(
      service.enqueueTaskForAgent(
        serverId,
        agentId,
        {
          title: 'Render workspace artifact',
          body: 'Use the runtime skill and upload the result to workspace.',
          idempotencyKey: 'kanban:card:render-1',
          source: {
            kind: 'server_app',
            id: 'app-kanban',
            appId: 'app-kanban',
            appKey: 'kanban',
          },
          requirements: {
            capabilities: ['workspace.write'],
            skills: [{ kind: 'runtime-skill', package: '@shadow/skills-media' }],
          },
          outputContract: {
            expectedArtifacts: [{ kind: 'workspace.file', mimeTypes: ['video/mp4'] }],
            submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
          },
          privacy: { dataClass: 'server-private', redactionRequired: true },
        },
        { kind: 'user', userId: ownerUserId },
      ),
    ).rejects.toThrow('Buddy Inbox task delivery requires approval')

    expect(deps.messageService.send).not.toHaveBeenCalled()
    expect(deps.agentPolicyDao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          inboxAdmissionPending: expect.arrayContaining([
            expect.objectContaining({
              task: expect.objectContaining({
                title: 'Render workspace artifact',
                requirements: expect.objectContaining({
                  skills: [
                    expect.objectContaining({
                      kind: 'runtime-skill',
                      package: '@shadow/skills-media',
                    }),
                  ],
                }),
                outputContract: expect.objectContaining({
                  submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
                }),
                privacy: { dataClass: 'server-private', redactionRequired: true },
              }),
            }),
          ]),
        }),
      }),
    )
  })

  it('posts immediate visible feedback when a Buddy claims a task that asks for an ack', async () => {
    const { deps, emit, service, visibleChannel } = createService()
    const taskMessage = {
      id: 'message-task',
      channelId,
      metadata: {
        cards: [
          {
            id: 'card-1',
            kind: 'task',
            version: 1,
            title: 'Review Two Sum submission',
            status: 'queued',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            progress: [],
            createdAt: new Date().toISOString(),
            data: {
              immediateFeedback: {
                expectedAck: 'claim_and_acknowledge',
                ackMessage: '算法助教已收到 Two Sum 提交，正在运行用例。',
                finalChannelName: '代码复盘',
              },
            },
          },
        ],
      },
    }
    deps.messageDao.findById.mockResolvedValue(taskMessage)
    deps.messageService.send.mockResolvedValue({
      id: 'ack-message',
      channelId: visibleChannel.id,
      metadata: {},
    })

    await service.claimTaskCard(
      taskMessage.id,
      'card-1',
      { kind: 'agent', userId: buddyUserId, agentId, ownerId: ownerUserId, scopes: [] },
      { note: 'OpenClaw runtime claimed task' },
    )

    expect(deps.messageService.send).toHaveBeenCalledWith(
      visibleChannel.id,
      buddyUserId,
      expect.objectContaining({
        content: '算法助教已收到 Two Sum 提交，正在运行用例。',
        metadata: expect.objectContaining({
          custom: expect.objectContaining({
            buddyInboxAck: expect.objectContaining({
              kind: 'task_claim_ack',
              taskMessageId: taskMessage.id,
              taskCardId: 'card-1',
              sourceChannelId: channelId,
            }),
          }),
        }),
      }),
    )
    expect(deps.io.to).toHaveBeenCalledWith(`channel:${visibleChannel.id}`)
    expect(emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ id: 'ack-message', channelId: visibleChannel.id }),
    )
  })

  it('claims task cards even when the legacy reply notification marker is present', async () => {
    const { deps, service } = createService()
    const message = {
      id: 'message-notification',
      channelId,
      metadata: {
        cards: [
          {
            id: 'reply-notification-card',
            kind: 'task',
            version: 1,
            title: 'Review reply: Render video',
            status: 'queued',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            data: {
              taskReplyNotification: true,
            },
            progress: [],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }
    deps.messageDao.findByChannelId.mockResolvedValue({
      messages: [message],
      hasMore: false,
    })
    deps.messageDao.findById.mockResolvedValue(message)

    const result = await service.claimNextTask(serverId, agentId, {
      kind: 'agent',
      userId: buddyUserId,
      agentId,
      ownerId: ownerUserId,
      scopes: [],
    })

    expect(result.message).toEqual(
      expect.objectContaining({
        id: 'message-notification',
        metadata: expect.objectContaining({
          cards: [
            expect.objectContaining({
              id: 'reply-notification-card',
              status: 'claimed',
              claim: expect.objectContaining({
                actor: expect.objectContaining({ agentId, userId: buddyUserId }),
              }),
            }),
          ],
        }),
      }),
    )
    expect(result.card).toEqual(
      expect.objectContaining({
        id: 'reply-notification-card',
        status: 'claimed',
      }),
    )
    expect(deps.messageService.updateMetadata).toHaveBeenCalledWith(
      'message-notification',
      expect.objectContaining({
        cards: [
          expect.objectContaining({
            id: 'reply-notification-card',
            status: 'claimed',
          }),
        ],
      }),
    )
  })

  it('allows direct claims against task cards with the legacy reply notification marker', async () => {
    const { deps, service } = createService()
    deps.messageDao.findById.mockResolvedValue({
      id: 'message-notification',
      channelId,
      metadata: {
        cards: [
          {
            id: 'reply-notification-card',
            kind: 'task',
            version: 1,
            title: 'Review reply: Render video',
            status: 'queued',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            data: {
              taskReplyNotification: true,
            },
            progress: [],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    })

    await expect(
      service.claimTaskCard('message-notification', 'reply-notification-card', {
        kind: 'agent',
        userId: buddyUserId,
        agentId,
        ownerId: ownerUserId,
        scopes: [],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'message-notification',
        metadata: expect.objectContaining({
          cards: [
            expect.objectContaining({
              id: 'reply-notification-card',
              status: 'claimed',
            }),
          ],
        }),
      }),
    )
  })

  it('lets a server Buddy discover peer Buddy inboxes without manage access', async () => {
    const { deps, service } = createService()
    const peerAgentId = '00000000-0000-4000-8000-000000000008'
    const peerUserId = '00000000-0000-4000-8000-000000000009'
    const peerChannelId = '00000000-0000-4000-8000-000000000010'

    deps.policyService.requireServerMember.mockResolvedValue({ serverId, role: 'member' })
    deps.serverDao.getMembers.mockResolvedValue([
      {
        userId: buddyUserId,
        user: {
          id: buddyUserId,
          username: 'coordinator-buddy',
          displayName: 'Coordinator Buddy',
          avatarUrl: null,
        },
        agent: {
          id: agentId,
          userId: buddyUserId,
          ownerId: ownerUserId,
          status: 'running',
        },
      },
      {
        userId: peerUserId,
        user: {
          id: peerUserId,
          username: 'research-buddy',
          displayName: 'Research Buddy',
          avatarUrl: null,
        },
        agent: {
          id: peerAgentId,
          userId: peerUserId,
          ownerId: '00000000-0000-4000-8000-000000000011',
          status: 'running',
        },
      },
    ])
    deps.channelDao.findByServerId.mockResolvedValue([
      {
        id: channelId,
        serverId,
        name: 'inbox-coordinator-buddy',
        type: 'text',
        topic: `shadow:buddy-inbox:${agentId}`,
        isPrivate: true,
      },
      {
        id: peerChannelId,
        serverId,
        name: 'inbox-research-buddy',
        type: 'text',
        topic: `shadow:buddy-inbox:${peerAgentId}`,
        isPrivate: true,
      },
    ])
    deps.channelMemberDao.get.mockResolvedValue(null)

    const rows = await service.listForServer(serverId, {
      kind: 'user',
      userId: buddyUserId,
    })

    expect(rows.map((row) => row.agent.id).sort()).toEqual([agentId, peerAgentId].sort())
    expect(rows.every((row) => row.canManage === false)).toBe(true)
  })

  it('returns resolved Buddy avatar URLs for embedded app inbox lists', async () => {
    const { agent, deps, service } = createService()
    deps.serverDao.getMembers.mockResolvedValue([
      {
        userId: buddyUserId,
        user: {
          id: buddyUserId,
          username: 'coordinator-buddy',
          displayName: 'Coordinator Buddy',
          avatarUrl: '/shadow/uploads/buddy-avatar.png',
        },
        agent,
      },
    ])

    const rows = await service.listForServer(serverId, {
      kind: 'user',
      userId: ownerUserId,
    })

    expect(deps.mediaService.resolveMediaUrl).toHaveBeenCalledWith(
      '/shadow/uploads/buddy-avatar.png',
      'image/png',
      { variant: 'avatar' },
    )
    expect(rows[0]?.agent.user.avatarUrl).toBe(
      'http://localhost:3000/shadow/uploads/buddy-avatar.png?signed=1',
    )
  })
})
