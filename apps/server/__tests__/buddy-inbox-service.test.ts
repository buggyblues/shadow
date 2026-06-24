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
      findById: vi.fn().mockResolvedValue(channel),
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
      findByThreadId: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
    },
    messageService: {
      send: vi.fn().mockResolvedValue({
        id: 'message-1',
        channelId,
        metadata: {},
      }),
      ensureThreadForMessage: vi.fn().mockResolvedValue({
        id: 'thread-1',
        channelId,
        parentMessageId: 'message-1',
        creatorId: ownerUserId,
        name: 'Review Two Sum submission',
        isArchived: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
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
        replyToBuddy: true,
      },
    })
  })

  it('activates the Inbox policy before enqueueing a task for an existing channel', async () => {
    const { deps, emit, service } = createService()
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
    deps.messageDao.findByChannelId.mockResolvedValue({
      messages: [
        {
          id: 'context-message-1',
          channelId,
          authorId: ownerUserId,
          content: 'Earlier context: the submission failed on empty arrays.',
          threadId: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'context-message-2',
          channelId,
          authorId: buddyUserId,
          content: 'Buddy suggested checking boundary conditions.',
          threadId: null,
          createdAt: new Date('2026-01-01T00:01:00.000Z'),
        },
      ],
      hasMore: false,
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
    expect(deps.messageService.ensureThreadForMessage).toHaveBeenCalledWith(
      'message-1',
      ownerUserId,
      { name: 'Review Two Sum submission' },
    )
    expect(deps.messageService.updateMetadata).toHaveBeenCalledWith(
      'message-1',
      expect.objectContaining({
        cards: [
          expect.objectContaining({
            title: 'Review Two Sum submission',
            data: expect.objectContaining({
              task: expect.objectContaining({
                workspaceId: expect.stringMatching(/^task_/),
                threadId: 'thread-1',
                revision: 1,
                contextPack: expect.objectContaining({
                  snapshotAtMessageId: 'context-message-2',
                  sourceSurface: 'channel',
                  policy: 'auto_recent',
                  items: [
                    expect.objectContaining({
                      kind: 'message',
                      messageId: 'context-message-1',
                      authorId: ownerUserId,
                      text: 'Earlier context: the submission failed on empty arrays.',
                    }),
                    expect.objectContaining({
                      kind: 'message',
                      messageId: 'context-message-2',
                      authorId: buddyUserId,
                      text: 'Buddy suggested checking boundary conditions.',
                    }),
                  ],
                  tokenEstimate: expect.any(Number),
                }),
              }),
            }),
          }),
        ],
      }),
    )
    expect(emit).toHaveBeenCalledWith(
      'thread:created',
      expect.objectContaining({
        id: 'thread-1',
        channelId,
        parentMessageId: 'message-1',
      }),
    )
  })

  it('registers source app status hooks and card context for Server App tasks', async () => {
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
          defaultMode: 'allow',
          rules: [],
        },
      },
    })

    await service.enqueueTaskForAgent(
      serverId,
      agentId,
      {
        title: 'Finish Kanban research card',
        body: 'Research the release notes and summarize the findings.',
        source: {
          kind: 'server_app',
          id: '00000000-0000-4000-8000-000000000012',
          appId: '00000000-0000-4000-8000-000000000012',
          appKey: 'kanban',
          resource: { kind: 'kanban.card', id: 'card_release_notes', label: 'Release notes' },
        },
        requirements: {
          tools: [{ kind: 'shadow-app-command', name: 'cards.complete', required: true }],
        },
        data: {
          appKey: 'kanban',
          boardId: 'kanban',
          cardId: 'card_release_notes',
          completeCardCommand: 'cards.complete',
        },
      },
      { kind: 'user', userId: ownerUserId },
    )

    expect(deps.messageService.updateMetadata).toHaveBeenCalledWith(
      'message-1',
      expect.objectContaining({
        cards: [
          expect.objectContaining({
            data: expect.objectContaining({
              task: expect.objectContaining({
                runtimeBinding: expect.objectContaining({
                  instruction: expect.not.stringContaining('do not use a server App'),
                  taskCard: expect.objectContaining({
                    body: 'Research the release notes and summarize the findings.',
                    requirements: expect.objectContaining({
                      tools: [
                        expect.objectContaining({
                          name: 'cards.complete',
                          required: true,
                        }),
                      ],
                    }),
                  }),
                }),
                cliPolicy: expect.objectContaining({
                  hooks: [
                    expect.objectContaining({
                      kind: 'server_app_command',
                      appKey: 'kanban',
                      command: 'cards.complete',
                      input: expect.objectContaining({
                        boardId: 'kanban',
                        cardId: 'card_release_notes',
                      }),
                      trigger: { event: 'task.status', status: 'completed', phase: 'after' },
                    }),
                  ],
                }),
              }),
            }),
          }),
        ],
      }),
    )
  })

  it('records triggered status hook commands when a task moves to completed', async () => {
    const { deps, service } = createService()
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    deps.messageDao.findById.mockResolvedValue({
      id: 'message-task',
      channelId,
      metadata: {
        cards: [
          {
            id: 'task-card-1',
            kind: 'task',
            version: 1,
            title: 'Finish Kanban card',
            status: 'running',
            assignee: { agentId, userId: buddyUserId, label: '算法助教' },
            claim: {
              id: 'claim-1',
              actor: { kind: 'user', userId: ownerUserId },
              claimedAt: new Date().toISOString(),
              expiresAt,
            },
            progress: [],
            createdAt: new Date().toISOString(),
            data: {
              task: {
                cliPolicy: {
                  hooks: [
                    {
                      id: 'kanban:card_release_notes:completed',
                      kind: 'server_app_command',
                      label: 'Sync Kanban completion',
                      trigger: { event: 'task.status', status: 'completed', phase: 'after' },
                      required: true,
                      appKey: 'kanban',
                      command: 'cards.complete',
                      input: {
                        boardId: 'kanban',
                        cardId: 'card_release_notes',
                        summary: '<short result>',
                      },
                      instruction: 'Sync the Kanban source card.',
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    })

    await service.updateTaskCard(
      'message-task',
      'task-card-1',
      { status: 'completed', note: 'Done' },
      { kind: 'user', userId: ownerUserId },
    )

    expect(deps.messageService.updateMetadata).toHaveBeenCalledWith(
      'message-task',
      expect.objectContaining({
        cards: [
          expect.objectContaining({
            status: 'completed',
            data: expect.objectContaining({
              task: expect.objectContaining({
                cliPolicy: expect.objectContaining({
                  hookEvents: [
                    expect.objectContaining({
                      kind: 'server_app_command',
                      status: 'completed',
                      state: 'pending',
                      required: true,
                      command: expect.stringContaining(
                        "shadowob app call 'kanban' 'cards.complete'",
                      ),
                    }),
                  ],
                }),
              }),
            }),
          }),
        ],
      }),
    )
    const updateArg = deps.messageService.updateMetadata.mock.calls.at(-1)?.[1] as {
      cards?: Array<{
        claim?: unknown
        capability?: unknown
        data?: { task?: { cliPolicy?: { hookEvents?: Array<{ command?: string }> } } }
      }>
    }
    expect(updateArg.cards?.[0]).not.toHaveProperty('claim')
    expect(updateArg.cards?.[0]).not.toHaveProperty('capability')
    expect(updateArg.cards?.[0]?.data?.task?.cliPolicy?.hookEvents?.[0]?.command).toContain(
      '--task-claim-id claim-1',
    )
    expect(updateArg.cards?.[0]?.data?.task?.cliPolicy?.hookEvents?.[0]?.command).toContain(
      `--server '${serverId}'`,
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

  it('relays terminal delegated Buddy task results back to the source Buddy inbox', async () => {
    const { deps, emit, service } = createService()
    const coordinatorAgentId = '00000000-0000-4000-8000-000000000008'
    const coordinatorUserId = '00000000-0000-4000-8000-000000000009'
    const coordinatorInboxId = '00000000-0000-4000-8000-000000000010'
    const taskMessage = {
      id: 'worker-task-message',
      channelId,
      authorId: coordinatorUserId,
      metadata: {
        cards: [
          {
            id: 'worker-card',
            kind: 'task',
            version: 1,
            title: 'Review Two Sum solution',
            body: 'Check correctness and edge cases.',
            status: 'running',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            source: {
              kind: 'agent',
              userId: coordinatorUserId,
              label: 'Coordinator Buddy',
            },
            data: {
              task: {
                threadId: 'worker-task-thread',
              },
            },
            progress: [],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }

    deps.messageDao.findById.mockResolvedValue(taskMessage)
    deps.agentDao.findById.mockImplementation(async (id: string) =>
      id === coordinatorAgentId
        ? {
            id: coordinatorAgentId,
            userId: coordinatorUserId,
            ownerId: ownerUserId,
            status: 'running',
          }
        : {
            id: agentId,
            userId: buddyUserId,
            ownerId: ownerUserId,
            status: 'running',
          },
    )
    ;(deps.agentDao as any).findByUserId = vi.fn(async (userId: string) =>
      userId === coordinatorUserId
        ? {
            id: coordinatorAgentId,
            userId: coordinatorUserId,
            ownerId: ownerUserId,
            status: 'running',
          }
        : null,
    )
    deps.channelDao.findByServerId.mockResolvedValue([
      {
        id: channelId,
        serverId,
        name: 'inbox-code-trainer-assistant-buddy',
        type: 'text',
        topic: `shadow:buddy-inbox:${agentId}`,
        isPrivate: true,
      },
      {
        id: coordinatorInboxId,
        serverId,
        name: 'inbox-coordinator-buddy',
        type: 'text',
        topic: `shadow:buddy-inbox:${coordinatorAgentId}`,
        isPrivate: true,
      },
    ])
    deps.messageDao.findByChannelId.mockResolvedValue({ messages: [], hasMore: false })
    deps.messageService.send.mockImplementation(async (targetChannelId, authorId, input) => ({
      id: targetChannelId === coordinatorInboxId ? 'result-message' : 'message-1',
      channelId: targetChannelId,
      authorId,
      content: input.content,
      metadata: input.metadata,
    }))
    deps.messageService.updateMetadata.mockImplementation(async (messageId, metadata) => ({
      id: messageId,
      channelId: messageId === 'result-message' ? coordinatorInboxId : channelId,
      metadata,
    }))

    await service.updateTaskCard(
      taskMessage.id,
      'worker-card',
      { status: 'completed', note: 'All tests passed and edge cases look good.' },
      { kind: 'agent', userId: buddyUserId, agentId, ownerId: ownerUserId, scopes: [] },
    )

    const threadResultCall = deps.messageService.send.mock.calls.find(
      ([targetChannelId, , input]) =>
        targetChannelId === channelId && input.threadId === 'worker-task-thread',
    )
    expect(threadResultCall).toBeDefined()
    expect(threadResultCall?.[1]).toBe(buddyUserId)
    expect(threadResultCall?.[2]).toEqual(
      expect.objectContaining({
        content: 'All tests passed and edge cases look good.',
        threadId: 'worker-task-thread',
        metadata: expect.objectContaining({
          cards: [
            expect.objectContaining({
              kind: 'task_result',
              title: 'Review Two Sum solution',
              body: 'All tests passed and edge cases look good.',
              taskMessageId: taskMessage.id,
              taskCardId: 'worker-card',
              status: 'completed',
            }),
          ],
        }),
      }),
    )

    const relayCall = deps.messageService.send.mock.calls.find(
      ([targetChannelId]) => targetChannelId === coordinatorInboxId,
    )
    expect(relayCall).toBeDefined()
    expect(relayCall?.[1]).toBe(buddyUserId)
    expect(relayCall?.[2]).toEqual(
      expect.objectContaining({
        content: expect.stringContaining('Review Two Sum solution'),
        metadata: expect.objectContaining({
          cards: [
            expect.objectContaining({
              kind: 'task',
              status: 'queued',
              title: 'Review Two Sum solution',
              body: 'All tests passed and edge cases look good.',
              assignee: expect.objectContaining({
                agentId: coordinatorAgentId,
                userId: coordinatorUserId,
              }),
              data: expect.objectContaining({
                taskResultNotification: true,
                originalTask: expect.objectContaining({
                  messageId: taskMessage.id,
                  cardId: 'worker-card',
                  channelId,
                  threadId: 'worker-task-thread',
                  status: 'completed',
                  resultMessageId: 'message-1',
                }),
              }),
            }),
          ],
        }),
      }),
    )
    expect(relayCall?.[2].metadata.cards[0]?.body).toBe(
      'All tests passed and edge cases look good.',
    )
    expect(deps.io.to).toHaveBeenCalledWith(`channel:${coordinatorInboxId}`)
    expect(emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ id: 'result-message', channelId: coordinatorInboxId }),
    )
  })

  it('delivers delegated Buddy task results to the parent task thread without a result inbox task', async () => {
    const { deps, service } = createService()
    const coordinatorAgentId = '00000000-0000-4000-8000-000000000008'
    const coordinatorUserId = '00000000-0000-4000-8000-000000000009'
    const coordinatorInboxId = '00000000-0000-4000-8000-000000000010'
    const parentThreadId = 'parent-task-thread'
    const taskMessage = {
      id: 'worker-task-message',
      channelId,
      authorId: coordinatorUserId,
      metadata: {
        cards: [
          {
            id: 'worker-card',
            kind: 'task',
            version: 1,
            title: 'Review Two Sum solution',
            status: 'running',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            source: {
              kind: 'agent',
              agentId: coordinatorAgentId,
              userId: coordinatorUserId,
              label: 'Coordinator Buddy',
            },
            data: {
              task: {
                threadId: 'worker-task-thread',
                parentTask: {
                  messageId: 'parent-task-message',
                  cardId: 'parent-card',
                  channelId: coordinatorInboxId,
                  threadId: parentThreadId,
                  title: 'Coordinate code review',
                },
              },
            },
            progress: [],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }

    deps.messageDao.findById.mockResolvedValue(taskMessage)
    deps.agentDao.findById.mockImplementation(async (id: string) =>
      id === coordinatorAgentId
        ? {
            id: coordinatorAgentId,
            userId: coordinatorUserId,
            ownerId: ownerUserId,
            status: 'running',
          }
        : {
            id: agentId,
            userId: buddyUserId,
            ownerId: ownerUserId,
            status: 'running',
          },
    )
    deps.channelDao.findById.mockResolvedValue({
      id: coordinatorInboxId,
      serverId,
      name: 'inbox-coordinator-buddy',
      type: 'text',
      topic: `shadow:buddy-inbox:${coordinatorAgentId}`,
      isPrivate: true,
    })
    deps.messageService.send.mockImplementation(async (targetChannelId, authorId, input) => ({
      id: 'parent-result-message',
      channelId: targetChannelId,
      authorId,
      content: input.content,
      threadId: input.threadId,
      metadata: input.metadata,
    }))

    await service.updateTaskCard(
      taskMessage.id,
      'worker-card',
      { status: 'completed', note: 'All tests passed and edge cases look good.' },
      { kind: 'agent', userId: buddyUserId, agentId, ownerId: ownerUserId, scopes: [] },
    )

    expect(deps.messageService.send).toHaveBeenCalledTimes(1)
    expect(deps.messageService.send).toHaveBeenCalledWith(
      coordinatorInboxId,
      buddyUserId,
      expect.objectContaining({
        content: 'All tests passed and edge cases look good.',
        threadId: parentThreadId,
        metadata: expect.objectContaining({
          cards: [
            expect.objectContaining({
              kind: 'task_result',
              title: 'Review Two Sum solution',
              body: 'All tests passed and edge cases look good.',
              delivery: 'parent_task_thread',
              taskMessageId: taskMessage.id,
              taskCardId: 'worker-card',
              status: 'completed',
              parentTask: expect.objectContaining({
                messageId: 'parent-task-message',
                cardId: 'parent-card',
                channelId: coordinatorInboxId,
                threadId: parentThreadId,
              }),
              sourceTask: expect.objectContaining({
                messageId: taskMessage.id,
                cardId: 'worker-card',
                channelId,
                threadId: 'worker-task-thread',
              }),
            }),
          ],
        }),
      }),
    )
    const resultInput = deps.messageService.send.mock.calls[0]?.[2]
    expect(resultInput?.metadata?.custom).toBeUndefined()
    expect(deps.messageService.updateMetadata).toHaveBeenCalledTimes(1)
  })

  it('does not duplicate terminal Buddy task result relays with an existing idempotency key', async () => {
    const { deps, service } = createService()
    const coordinatorAgentId = '00000000-0000-4000-8000-000000000008'
    const coordinatorUserId = '00000000-0000-4000-8000-000000000009'
    const coordinatorInboxId = '00000000-0000-4000-8000-000000000010'
    const taskMessage = {
      id: 'worker-task-message',
      channelId,
      authorId: coordinatorUserId,
      metadata: {
        cards: [
          {
            id: 'worker-card',
            kind: 'task',
            version: 1,
            title: 'Review Two Sum solution',
            status: 'running',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            source: {
              kind: 'agent',
              agentId: coordinatorAgentId,
              userId: coordinatorUserId,
              label: 'Coordinator Buddy',
            },
            progress: [],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    }
    deps.messageDao.findById.mockResolvedValue(taskMessage)
    deps.agentDao.findById.mockImplementation(async (id: string) =>
      id === coordinatorAgentId
        ? {
            id: coordinatorAgentId,
            userId: coordinatorUserId,
            ownerId: ownerUserId,
            status: 'running',
          }
        : {
            id: agentId,
            userId: buddyUserId,
            ownerId: ownerUserId,
            status: 'running',
          },
    )
    deps.channelDao.findByServerId.mockResolvedValue([
      {
        id: channelId,
        serverId,
        name: 'inbox-code-trainer-assistant-buddy',
        type: 'text',
        topic: `shadow:buddy-inbox:${agentId}`,
        isPrivate: true,
      },
      {
        id: coordinatorInboxId,
        serverId,
        name: 'inbox-coordinator-buddy',
        type: 'text',
        topic: `shadow:buddy-inbox:${coordinatorAgentId}`,
        isPrivate: true,
      },
    ])
    deps.messageDao.findByChannelId.mockImplementation(async (targetChannelId: string) => ({
      messages:
        targetChannelId === coordinatorInboxId
          ? [
              {
                id: 'existing-result-message',
                channelId: coordinatorInboxId,
                metadata: {
                  cards: [
                    {
                      id: 'existing-result-card',
                      kind: 'task',
                      version: 1,
                      title: 'Completed: Review Two Sum solution',
                      status: 'queued',
                      data: {
                        idempotencyKey: `task-result:${taskMessage.id}:worker-card:completed`,
                      },
                      createdAt: new Date().toISOString(),
                    },
                  ],
                },
              },
            ]
          : [],
      hasMore: false,
    }))

    await service.updateTaskCard(
      taskMessage.id,
      'worker-card',
      { status: 'completed', note: 'Done already.' },
      { kind: 'agent', userId: buddyUserId, agentId, ownerId: ownerUserId, scopes: [] },
    )

    expect(deps.messageService.send).not.toHaveBeenCalled()
  })

  it('does not relay terminal status changes for result notification tasks', async () => {
    const { deps, service } = createService()
    const coordinatorAgentId = '00000000-0000-4000-8000-000000000008'
    const coordinatorUserId = '00000000-0000-4000-8000-000000000009'
    deps.messageDao.findById.mockResolvedValue({
      id: 'result-task-message',
      channelId,
      authorId: buddyUserId,
      metadata: {
        cards: [
          {
            id: 'result-card',
            kind: 'task',
            version: 1,
            title: 'Completed: Review Two Sum solution',
            status: 'running',
            assignee: {
              agentId: coordinatorAgentId,
              userId: coordinatorUserId,
              label: 'Coordinator Buddy',
            },
            source: {
              kind: 'agent',
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            data: {
              taskResultNotification: true,
            },
            progress: [],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    })

    await service.updateTaskCard(
      'result-task-message',
      'result-card',
      { status: 'completed', note: 'Coordinator handled the relay.' },
      {
        kind: 'agent',
        userId: coordinatorUserId,
        agentId: coordinatorAgentId,
        ownerId: ownerUserId,
        scopes: [],
      },
    )

    expect(deps.messageService.send).not.toHaveBeenCalled()
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

  it('claims the highest-priority queued task before older lower-priority tasks', async () => {
    const { deps, service } = createService()
    const lowPriorityMessage = {
      id: 'message-low',
      channelId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: {
        cards: [
          {
            id: 'card-low',
            kind: 'task',
            version: 1,
            title: 'Low priority task',
            status: 'queued',
            priority: 'low',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            progress: [],
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    }
    const highPriorityMessage = {
      id: 'message-high',
      channelId,
      createdAt: new Date('2026-01-01T00:01:00.000Z'),
      metadata: {
        cards: [
          {
            id: 'card-high',
            kind: 'task',
            version: 1,
            title: 'High priority task',
            status: 'queued',
            priority: 'high',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            progress: [],
            createdAt: '2026-01-01T00:01:00.000Z',
          },
        ],
      },
    }
    deps.messageDao.findByChannelId.mockResolvedValue({
      messages: [lowPriorityMessage, highPriorityMessage],
      hasMore: false,
    })
    deps.messageDao.findById.mockImplementation(async (messageId: string) =>
      messageId === highPriorityMessage.id ? highPriorityMessage : lowPriorityMessage,
    )

    const result = await service.claimNextTask(serverId, agentId, {
      kind: 'agent',
      userId: buddyUserId,
      agentId,
      ownerId: ownerUserId,
      scopes: [],
    })

    expect(result.message).toEqual(
      expect.objectContaining({
        id: 'message-high',
        metadata: expect.objectContaining({
          cards: [
            expect.objectContaining({
              id: 'card-high',
              status: 'claimed',
            }),
          ],
        }),
      }),
    )
    expect(result.card).toEqual(
      expect.objectContaining({
        id: 'card-high',
        priority: 'high',
        status: 'claimed',
      }),
    )
    expect(deps.messageService.updateMetadata).toHaveBeenCalledWith(
      'message-high',
      expect.objectContaining({
        cards: [
          expect.objectContaining({
            id: 'card-high',
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

  it('rejects direct claims against terminal task cards', async () => {
    const { deps, service } = createService()
    deps.messageDao.findById.mockResolvedValue({
      id: 'message-completed',
      channelId,
      metadata: {
        cards: [
          {
            id: 'completed-card',
            kind: 'task',
            version: 1,
            title: 'Already done',
            status: 'completed',
            assignee: {
              agentId,
              userId: buddyUserId,
              label: '算法助教',
            },
            progress: [
              {
                at: new Date().toISOString(),
                status: 'completed',
              },
            ],
            createdAt: new Date().toISOString(),
          },
        ],
      },
    })

    await expect(
      service.claimTaskCard('message-completed', 'completed-card', {
        kind: 'agent',
        userId: buddyUserId,
        agentId,
        ownerId: ownerUserId,
        scopes: [],
      }),
    ).rejects.toMatchObject({
      message: 'Terminal task cards cannot be claimed',
      status: 409,
    })
    expect(deps.messageService.updateMetadata).not.toHaveBeenCalled()
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
