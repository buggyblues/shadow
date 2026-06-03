import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BuddyInboxService } from '../src/services/buddy-inbox.service'

const serverId = '00000000-0000-4000-8000-000000000001'
const agentId = '00000000-0000-4000-8000-000000000002'
const channelId = '00000000-0000-4000-8000-000000000003'
const botUserId = '00000000-0000-4000-8000-000000000004'
const ownerUserId = '00000000-0000-4000-8000-000000000005'

function createService() {
  const agent = {
    id: agentId,
    userId: botUserId,
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
      getMember: vi.fn().mockResolvedValue({ role: 'member' }),
      addMember: vi.fn(),
    },
    userDao: {
      findById: vi.fn(async (userId: string) => ({
        id: userId,
        username: userId === botUserId ? 'code-trainer-assistant-buddy' : 'admin',
        displayName: userId === botUserId ? '算法助教' : 'Admin',
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
      },
    })
    expect(deps.io.to).toHaveBeenCalledWith(`user:${botUserId}`)
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
              userId: botUserId,
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
      { kind: 'agent', userId: botUserId, agentId, ownerId: ownerUserId, scopes: [] },
      { note: 'OpenClaw runtime claimed task' },
    )

    expect(deps.messageService.send).toHaveBeenCalledWith(
      visibleChannel.id,
      botUserId,
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
})
