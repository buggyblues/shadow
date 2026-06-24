import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createMediaHandler, createSignedMediaHandler } from '../src/handlers/media.handler'
import { authMiddleware } from '../src/middleware/auth.middleware'
import { MediaService } from '../src/services/media.service'
import { MessageService } from '../src/services/message.service'
import { NotificationService } from '../src/services/notification.service'
import { ServerService } from '../src/services/server.service'

// Mock DAO helpers
function createMockServerDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findByInviteCode: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateById: vi.fn(),
    delete: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    getMember: vi.fn(),
    getMembers: vi.fn(),
    findAll: vi.fn(),
    findPublic: vi.fn(),
    ...overrides,
  }
}

function createMockChannelDao(overrides = {}) {
  return {
    create: vi.fn(),
    findByServerId: vi.fn(),
    ...overrides,
  }
}

function createMockMessageDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findByChannelId: vi.fn(),
    findWindowAroundMessage: vi.fn(),
    findByThreadId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createThread: vi.fn(),
    findThreadById: vi.fn(),
    findThreadByParentMessageId: vi.fn(),
    findTaskCardReadStatesForMessages: vi.fn().mockResolvedValue([]),
    moveRepliesToThread: vi.fn().mockResolvedValue(0),
    touchThread: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    getReactions: vi.fn(),
    getAttachments: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function createMockUserDao(overrides = {}) {
  return {
    findById: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  }
}

function createMockNotificationDao(overrides = {}) {
  return {
    findByUserId: vi.fn(),
    findUnreadByUserId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getUnreadCount: vi.fn(),
    getPreference: vi.fn().mockResolvedValue({
      userId: 'u1',
      strategy: 'all',
      mutedServerIds: [],
      mutedChannelIds: [],
    }),
    upsertPreference: vi.fn(),
    findMessageScopesByMessageIds: vi.fn().mockResolvedValue([]),
    findChannelScopes: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('ServerService', () => {
  describe('getByInviteCode', () => {
    it('should return server when invite code is valid', async () => {
      const mockServer = { id: '1', name: 'Test', inviteCode: 'abc12345' }
      const serverDao = createMockServerDao({
        findByInviteCode: vi.fn().mockResolvedValue(mockServer),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.getByInviteCode('abc12345')
      expect(result).toEqual(mockServer)
      expect(serverDao.findByInviteCode).toHaveBeenCalledWith('abc12345')
    })

    it('should throw 404 when invite code is invalid', async () => {
      const serverDao = createMockServerDao({
        findByInviteCode: vi.fn().mockResolvedValue(null),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.getByInviteCode('invalid1')).rejects.toThrow('Invalid invite code')
    })
  })

  describe('discoverPublic', () => {
    it('should return public servers from DAO', async () => {
      const mockServers = [{ id: '1', name: 'Public Server', memberCount: 10 }]
      const serverDao = createMockServerDao({
        findPublic: vi.fn().mockResolvedValue(mockServers),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.discoverPublic(50, 0)
      expect(result).toEqual(mockServers)
      expect(serverDao.findPublic).toHaveBeenCalledWith(50, 0)
    })
  })

  describe('addBotMember', () => {
    it('rejects private Buddies when the server is not allowlisted', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue({ id: 'srv1', name: 'Server' }),
        getMember: vi.fn().mockResolvedValue(null),
      })
      const channelDao = createMockChannelDao()
      const agentDao = {
        findByUserId: vi.fn().mockResolvedValue({
          id: 'agent1',
          userId: 'bot1',
          config: { buddyMode: 'private', allowedServerIds: [] },
        }),
      }
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
        agentDao: agentDao as any,
      })

      await expect(service.addBotMember('srv1', 'bot1')).rejects.toThrow(
        'Private Buddy is not allowlisted for this server',
      )
      expect(serverDao.addMember).not.toHaveBeenCalled()
    })

    it('allows private Buddies when the server is allowlisted', async () => {
      const member = { id: 'member1', serverId: 'srv1', userId: 'bot1', role: 'member' }
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue({ id: 'srv1', name: 'Server' }),
        getMember: vi.fn().mockResolvedValue(null),
        addMember: vi.fn().mockResolvedValue(member),
      })
      const channelDao = createMockChannelDao()
      const agentDao = {
        findByUserId: vi.fn().mockResolvedValue({
          id: 'agent1',
          userId: 'bot1',
          config: { buddyMode: 'private', allowedServerIds: ['srv1'] },
        }),
      }
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
        agentDao: agentDao as any,
      })

      await expect(service.addBotMember('srv1', 'bot1')).resolves.toEqual(member)
      expect(serverDao.addMember).toHaveBeenCalledWith('srv1', 'bot1', 'member')
    })
  })

  describe('join', () => {
    it('should add member when invite code is valid and user is not a member', async () => {
      const mockServer = { id: 'srv1', name: 'Server', inviteCode: 'abcd1234' }
      const serverDao = createMockServerDao({
        findByInviteCode: vi.fn().mockResolvedValue(mockServer),
        getMember: vi.fn().mockResolvedValue(null),
        addMember: vi
          .fn()
          .mockResolvedValue({ id: 'm1', serverId: 'srv1', userId: 'u1', role: 'member' }),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.join('abcd1234', 'u1')
      expect(result).toEqual(mockServer)
      expect(serverDao.addMember).toHaveBeenCalledWith('srv1', 'u1', 'member')
    })

    it('should throw 409 when user is already a member', async () => {
      const mockServer = { id: 'srv1', name: 'Server', inviteCode: 'abcd1234' }
      const serverDao = createMockServerDao({
        findByInviteCode: vi.fn().mockResolvedValue(mockServer),
        getMember: vi.fn().mockResolvedValue({ id: 'm1' }),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.join('abcd1234', 'u1')).rejects.toThrow('Already a member')
    })
  })

  describe('create', () => {
    it('should create server with description and isPublic', async () => {
      const mockServer = { id: 'srv1', name: 'My Server', description: 'Cool', isPublic: true }
      const serverDao = createMockServerDao({
        create: vi.fn().mockResolvedValue(mockServer),
        addMember: vi.fn().mockResolvedValue({}),
      })
      const channelDao = createMockChannelDao({
        create: vi.fn().mockResolvedValue({}),
      })
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.create(
        { name: 'My Server', description: 'Cool', isPublic: true },
        'user1',
      )
      expect(result.name).toBe('My Server')
      expect(serverDao.create).toHaveBeenCalledWith({
        name: 'My Server',
        ownerId: 'user1',
        iconUrl: undefined,
        bannerUrl: undefined,
        description: 'Cool',
        slug: null,
        isPublic: true,
      })
    })
  })
})

describe('MediaService', () => {
  it('forces active content attachments to download disposition in signed tokens', () => {
    const previousSecret = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'test-media-secret'
    try {
      const service = new MediaService({
        logger: { info: vi.fn(), warn: vi.fn() } as any,
        messageDao: {} as any,
        dmService: {} as any,
        policyService: {} as any,
      })

      const result = service.createSignedUrl({
        contentRef: '/shadow/uploads/page.html',
        contentType: 'text/html',
        disposition: 'inline',
        filename: 'page.html',
      })
      const payload = service.verifySignedToken(result.url.split('/').pop()!)

      expect(payload.disposition).toBe('attachment')
      expect(payload.contentType).toBe('text/html')
      expect(result.url).toMatch(/^\/api\/media\/signed\//)
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousSecret
    }
  })

  it('authorizes channel attachments through the parent message channel', async () => {
    const previousSecret = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'test-media-secret'
    try {
      const messageDao = {
        findAttachmentById: vi.fn().mockResolvedValue({
          id: 'att-1',
          messageId: 'msg-1',
          filename: 'photo.png',
          url: '/shadow/uploads/photo.png',
          contentType: 'image/png',
          size: 12,
        }),
        findById: vi.fn().mockResolvedValue({ id: 'msg-1', channelId: 'ch-1' }),
      }
      const policyService = { requireChannelRead: vi.fn().mockResolvedValue({}) }
      const service = new MediaService({
        logger: { info: vi.fn(), warn: vi.fn() } as any,
        messageDao: messageDao as any,
        dmService: {} as any,
        policyService: policyService as any,
      })

      const result = await service.resolveAttachmentMediaUrl({
        actor: { kind: 'user', userId: 'u-1', authMethod: 'jwt', scopes: [] },
        attachmentId: 'att-1',
        kind: 'channel',
        disposition: 'inline',
      })
      const payload = service.verifySignedToken(result.url.split('/').pop()!)

      expect(policyService.requireChannelRead).toHaveBeenCalledWith(
        { kind: 'user', userId: 'u-1', authMethod: 'jwt', scopes: [] },
        'ch-1',
      )
      expect(payload.disposition).toBe('inline')
      expect(payload.key).toBe('uploads/photo.png')
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousSecret
    }
  })
})

describe('MediaHandler', () => {
  it('serves signed media without requiring bearer auth while keeping upload protected', async () => {
    const mediaAccessGateway = {
      getSignedObjectResponse: vi.fn().mockResolvedValue({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('ok'))
            controller.close()
          },
        }),
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    }
    const container = {
      resolve(name: string) {
        if (name === 'mediaAccessGateway') return mediaAccessGateway
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as any
    const protectedApi = new Hono()
    protectedApi.use('*', authMiddleware)

    const handler = new Hono()
    handler.route('/api', createSignedMediaHandler(container))
    handler.route('/api', protectedApi)
    handler.route('/api/media', createMediaHandler(container))

    const signed = await handler.request('/api/media/signed/test-token.part')
    expect(signed.status).toBe(200)
    expect(await signed.text()).toBe('ok')
    expect(mediaAccessGateway.getSignedObjectResponse).toHaveBeenCalledWith(
      'test-token.part',
      undefined,
    )

    const upload = await handler.request('/api/media/upload', { method: 'POST' })
    expect(upload.status).toBe(401)
  })
})

describe('MessageService', () => {
  describe('threads', () => {
    it('reuses an existing parent thread instead of creating a duplicate', async () => {
      const parentMessage = {
        id: 'message-1',
        content: 'Task root',
        channelId: 'channel-1',
        authorId: 'user-1',
        threadId: null,
      }
      const existingThread = {
        id: 'thread-1',
        channelId: 'channel-1',
        parentMessageId: 'message-1',
        creatorId: 'user-1',
        name: 'Task root',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(parentMessage),
        findThreadByParentMessageId: vi.fn().mockResolvedValue(existingThread),
        createThread: vi.fn(),
        moveRepliesToThread: vi.fn().mockResolvedValue(0),
      })
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao() as any,
      })

      const result = await service.createThread('channel-1', 'user-1', {
        name: 'Task root',
        parentMessageId: 'message-1',
      })

      expect(result).toBe(existingThread)
      expect(messageDao.createThread).not.toHaveBeenCalled()
      expect(messageDao.moveRepliesToThread).toHaveBeenCalledWith('message-1', 'thread-1')
    })

    it('routes replies to thread messages back into the same thread', async () => {
      const replyTarget = {
        id: 'thread-message-1',
        content: 'Thread note',
        channelId: 'channel-1',
        authorId: 'user-1',
        threadId: 'thread-1',
      }
      const thread = {
        id: 'thread-1',
        channelId: 'channel-1',
        parentMessageId: 'root-message-1',
        creatorId: 'user-1',
        name: 'Task thread',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const created = {
        id: 'reply-message-1',
        content: 'Reply in the task thread',
        channelId: 'channel-1',
        authorId: 'bot-user-1',
        threadId: 'thread-1',
        replyToId: 'thread-message-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(replyTarget),
        findThreadById: vi.fn().mockResolvedValue(thread),
        create: vi.fn().mockResolvedValue(created),
      })
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao() as any,
        channelDao: { updateLastMessageAt: vi.fn() } as any,
      })

      const result = await service.send('channel-1', 'bot-user-1', {
        content: 'Reply in the task thread',
        replyToId: 'thread-message-1',
      })

      expect(messageDao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-1',
          replyToId: 'thread-message-1',
        }),
      )
      expect(messageDao.touchThread).toHaveBeenCalledWith('thread-1')
      expect(result.threadId).toBe('thread-1')
    })

    it('ensures a discussion thread for messages mentioning multiple Buddies', async () => {
      const parentMessage = {
        id: 'message-1',
        content: '@alpha @beta compare approaches',
        channelId: 'channel-1',
        authorId: 'user-1',
        threadId: null,
        metadata: {
          mentions: [
            {
              kind: 'buddy',
              targetId: 'bot-user-1',
              userId: 'bot-user-1',
              token: '@alpha',
              label: '@Alpha',
              isBot: true,
            },
            {
              kind: 'buddy',
              targetId: 'bot-user-2',
              userId: 'bot-user-2',
              token: '@beta',
              label: '@Beta',
              isBot: true,
            },
          ],
        },
      }
      const thread = {
        id: 'thread-1',
        channelId: 'channel-1',
        parentMessageId: 'message-1',
        creatorId: 'user-1',
        name: '@alpha @beta compare approaches',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(parentMessage),
        findThreadByParentMessageId: vi.fn().mockResolvedValue(null),
        createThread: vi.fn().mockResolvedValue(thread),
      })
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao() as any,
      })

      const result = await service.tryEnsureMultiBuddyMentionThread(parentMessage, 'user-1', {
        channelKind: 'text',
      })

      expect(result).toBe(thread)
      expect(messageDao.createThread).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: 'channel-1',
          parentMessageId: 'message-1',
          creatorId: 'user-1',
          name: '@alpha @beta compare approaches',
        }),
      )
      expect(messageDao.moveRepliesToThread).toHaveBeenCalledWith('message-1', 'thread-1')
    })

    it('does not create a discussion thread for a single Buddy mention', async () => {
      const parentMessage = {
        id: 'message-1',
        content: '@alpha can you check this?',
        channelId: 'channel-1',
        authorId: 'user-1',
        threadId: null,
        metadata: {
          mentions: [
            {
              kind: 'buddy',
              targetId: 'bot-user-1',
              userId: 'bot-user-1',
              token: '@alpha',
              label: '@Alpha',
              isBot: true,
            },
          ],
        },
      }
      const messageDao = createMockMessageDao({
        createThread: vi.fn(),
      })
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao() as any,
      })

      const result = await service.tryEnsureMultiBuddyMentionThread(parentMessage, 'user-1', {
        channelKind: 'text',
      })

      expect(result).toBeNull()
      expect(messageDao.createThread).not.toHaveBeenCalled()
    })
  })

  describe('Inbox task replies', () => {
    it('routes bare Buddy Inbox task replies into the task thread', async () => {
      const agentId = 'agent-1'
      const buddyUserId = 'bot-user-1'
      const channelId = 'inbox-channel-1'
      const taskMessageId = 'task-message-1'
      const taskThreadId = 'task-thread-1'
      const taskMessage = {
        id: taskMessageId,
        content: 'Find the trace from context',
        channelId,
        authorId: 'human-user-1',
        threadId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          cards: [
            {
              id: 'task-card-1',
              kind: 'task',
              version: 1,
              title: 'Context smoke',
              status: 'running',
              assignee: { agentId, userId: buddyUserId, label: 'BrandScout' },
              data: {
                task: {
                  threadId: taskThreadId,
                },
              },
              progress: [],
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }
      const thread = {
        id: taskThreadId,
        channelId,
        parentMessageId: taskMessageId,
        creatorId: 'human-user-1',
        name: 'Context smoke',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const created = {
        id: 'reply-message-1',
        content: 'TRACE found.',
        channelId,
        authorId: buddyUserId,
        threadId: taskThreadId,
        replyToId: taskMessageId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const messageDao = createMockMessageDao({
        findById: vi.fn(async (id: string) => (id === taskMessageId ? taskMessage : null)),
        findByChannelId: vi.fn().mockResolvedValue({ messages: [taskMessage], hasMore: false }),
        findThreadById: vi.fn().mockResolvedValue(thread),
        create: vi.fn().mockResolvedValue(created),
        updateMetadata: vi.fn(async (id: string, metadata: Record<string, unknown> | null) => ({
          ...taskMessage,
          id,
          metadata,
        })),
      })
      const emit = vi.fn()
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao({
          findById: vi.fn(async (userId: string) => ({
            id: userId,
            username: userId === buddyUserId ? 'brandscout' : 'admin',
            displayName: userId === buddyUserId ? 'BrandScout' : 'Admin',
            avatarUrl: null,
            status: 'online',
            isBot: userId === buddyUserId,
          })),
        }) as any,
        channelDao: {
          updateLastMessageAt: vi.fn(),
          findById: vi.fn().mockResolvedValue({
            id: channelId,
            topic: `shadow:buddy-inbox:${agentId}`,
          }),
        } as any,
        agentDao: {
          findByUserId: vi.fn().mockResolvedValue({ id: agentId, userId: buddyUserId }),
          findById: vi.fn().mockResolvedValue({ id: agentId, userId: buddyUserId }),
        } as any,
        agentDashboardDao: {
          incrementMessageCount: vi.fn(),
          incrementHourlyMessage: vi.fn(),
          createEvent: vi.fn(),
        } as any,
        io: { to: vi.fn(() => ({ emit })) } as any,
      })

      const result = await service.send(channelId, buddyUserId, {
        content: created.content,
      })

      expect(messageDao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: taskThreadId,
          replyToId: taskMessageId,
        }),
      )
      expect(messageDao.touchThread).toHaveBeenCalledWith(taskThreadId)
      expect(result.threadId).toBe(taskThreadId)
      expect(messageDao.updateMetadata).toHaveBeenCalledWith(
        taskMessageId,
        expect.objectContaining({
          cards: [
            expect.objectContaining({
              id: 'task-card-1',
              progress: [
                expect.objectContaining({
                  status: 'running',
                  note: expect.stringContaining('Buddy replied:'),
                }),
              ],
            }),
          ],
        }),
      )
    })

    it('records Buddy replies without completing the active task card', async () => {
      const agentId = 'agent-1'
      const buddyUserId = 'bot-user-1'
      const channelId = 'inbox-channel-1'
      const taskMessageId = 'task-message-1'
      const replyMessage = {
        id: 'reply-message-1',
        content: 'I created the first research brief and will continue with the next step.',
        channelId,
        authorId: buddyUserId,
        replyToId: taskMessageId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const taskMessage = {
        id: taskMessageId,
        content: 'Research this brand',
        channelId,
        authorId: 'human-user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          cards: [
            {
              id: 'task-card-1',
              kind: 'task',
              version: 1,
              title: 'Brand research',
              status: 'claimed',
              assignee: { agentId, userId: buddyUserId, label: 'BrandScout' },
              claim: {
                id: 'claim-1',
                actor: { kind: 'agent', agentId, userId: buddyUserId },
                claimedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
              capability: {
                kind: 'task',
                scope: ['workspace.write'],
                issuedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
              progress: [
                {
                  at: new Date().toISOString(),
                  status: 'claimed',
                  note: 'Claimed',
                },
              ],
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }
      const messageDao = createMockMessageDao({
        create: vi.fn().mockResolvedValue(replyMessage),
        findById: vi.fn(async (id: string) => (id === taskMessageId ? taskMessage : null)),
        updateMetadata: vi.fn(async (id: string, metadata: Record<string, unknown> | null) => ({
          ...taskMessage,
          id,
          metadata,
        })),
      })
      const userDao = createMockUserDao({
        findById: vi.fn(async (userId: string) => ({
          id: userId,
          username: userId === buddyUserId ? 'brandscout' : 'admin',
          displayName: userId === buddyUserId ? 'BrandScout' : 'Admin',
          avatarUrl: null,
          isBot: userId === buddyUserId,
        })),
      })
      const emit = vi.fn()
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: userDao as any,
        channelDao: {
          updateLastMessageAt: vi.fn(),
          findById: vi.fn().mockResolvedValue({
            id: channelId,
            topic: `shadow:buddy-inbox:${agentId}`,
          }),
        } as any,
        agentDao: {
          findByUserId: vi.fn().mockResolvedValue(null),
          findById: vi.fn().mockResolvedValue({ id: agentId, userId: buddyUserId }),
        } as any,
        agentDashboardDao: {
          incrementMessageCount: vi.fn(),
          incrementHourlyMessage: vi.fn(),
          createEvent: vi.fn(),
        } as any,
        io: { to: vi.fn(() => ({ emit })) } as any,
      })

      await service.send(channelId, buddyUserId, {
        content: replyMessage.content,
        replyToId: taskMessageId,
      })

      expect(messageDao.updateMetadata).toHaveBeenCalledWith(
        taskMessageId,
        expect.objectContaining({
          cards: [
            expect.objectContaining({
              id: 'task-card-1',
              status: 'claimed',
              claim: taskMessage.metadata.cards[0]?.claim,
              capability: taskMessage.metadata.cards[0]?.capability,
              progress: expect.arrayContaining([
                expect.objectContaining({
                  status: 'claimed',
                  note: expect.stringContaining('Buddy replied:'),
                }),
              ]),
            }),
          ],
        }),
      )
      expect(emit).toHaveBeenCalledWith(
        'message:updated',
        expect.objectContaining({
          metadata: expect.objectContaining({
            cards: [
              expect.objectContaining({
                status: 'claimed',
                claim: taskMessage.metadata.cards[0]?.claim,
              }),
            ],
          }),
        }),
      )
      const updateCalls = messageDao.updateMetadata.mock.calls
      const updatedMetadata = updateCalls[updateCalls.length - 1]?.[1] as {
        cards?: Array<Record<string, unknown>>
      }
      expect(updatedMetadata.cards?.[0]).not.toHaveProperty('replies')
    })

    it('ignores reply_terminal output contracts on ordinary Buddy replies', async () => {
      const agentId = 'agent-1'
      const buddyUserId = 'bot-user-1'
      const channelId = 'inbox-channel-1'
      const taskMessageId = 'task-message-1'
      const replyMessage = {
        id: 'reply-message-1',
        content: 'Installed successfully at ~/.agents/skills/grill-me.',
        channelId,
        authorId: buddyUserId,
        replyToId: taskMessageId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const taskMessage = {
        id: taskMessageId,
        content: 'Install grill-me',
        channelId,
        authorId: 'human-user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          cards: [
            {
              id: 'task-card-1',
              kind: 'task',
              version: 1,
              title: 'Install grill-me',
              status: 'running',
              assignee: { agentId, userId: buddyUserId, label: 'BrandScout' },
              outputContract: {
                completionPolicy: { mode: 'reply_terminal', status: 'completed' },
              },
              claim: {
                id: 'claim-1',
                actor: { kind: 'agent', agentId, userId: buddyUserId },
                claimedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
              capability: {
                kind: 'task',
                scope: ['workspace.write'],
                issuedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
              progress: [],
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }
      const messageDao = createMockMessageDao({
        create: vi.fn().mockResolvedValue(replyMessage),
        findById: vi.fn(async (id: string) => (id === taskMessageId ? taskMessage : null)),
        updateMetadata: vi.fn(async (id: string, metadata: Record<string, unknown> | null) => ({
          ...taskMessage,
          id,
          metadata,
        })),
      })
      const userDao = createMockUserDao({
        findById: vi.fn(async (userId: string) => ({
          id: userId,
          username: userId === buddyUserId ? 'brandscout' : 'admin',
          displayName: userId === buddyUserId ? 'BrandScout' : 'Admin',
          avatarUrl: null,
          isBot: userId === buddyUserId,
        })),
      })
      const emit = vi.fn()
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: userDao as any,
        channelDao: {
          updateLastMessageAt: vi.fn(),
          findById: vi.fn().mockResolvedValue({
            id: channelId,
            topic: `shadow:buddy-inbox:${agentId}`,
          }),
        } as any,
        agentDao: {
          findByUserId: vi.fn().mockResolvedValue(null),
          findById: vi.fn().mockResolvedValue({ id: agentId, userId: buddyUserId }),
        } as any,
        agentDashboardDao: {
          incrementMessageCount: vi.fn(),
          incrementHourlyMessage: vi.fn(),
          createEvent: vi.fn(),
        } as any,
        io: { to: vi.fn(() => ({ emit })) } as any,
      })

      await service.send(channelId, buddyUserId, {
        content: replyMessage.content,
        replyToId: taskMessageId,
      })

      expect(messageDao.updateMetadata).toHaveBeenCalledWith(
        taskMessageId,
        expect.objectContaining({
          cards: [
            expect.objectContaining({
              claim: taskMessage.metadata.cards[0]?.claim,
              capability: taskMessage.metadata.cards[0]?.capability,
            }),
          ],
        }),
      )
      expect(messageDao.updateMetadata).toHaveBeenCalledWith(
        taskMessageId,
        expect.objectContaining({
          cards: [
            expect.objectContaining({
              id: 'task-card-1',
              status: 'running',
              progress: [
                expect.objectContaining({
                  status: 'running',
                  note: expect.stringContaining('Buddy replied:'),
                }),
              ],
            }),
          ],
        }),
      )
      const updateCalls = messageDao.updateMetadata.mock.calls
      const updatedMetadata = updateCalls[updateCalls.length - 1]?.[1] as {
        cards?: Array<Record<string, unknown>>
      }
      expect(updatedMetadata.cards?.[0]).not.toHaveProperty('replies')
    })

    it.each([
      { taskStatus: 'running', sourceKind: 'server_app' },
      { taskStatus: 'completed', sourceKind: 'server_app' },
      { taskStatus: 'failed', sourceKind: 'server_app' },
      { taskStatus: 'completed', sourceKind: 'agent' },
    ] as const)('does not dispatch legacy Buddy Inbox reply notifications for a delegated $sourceKind task with $taskStatus status', async ({
      taskStatus,
      sourceKind,
    }) => {
      const assigneeAgentId = 'agent-worker'
      const assigneeUserId = 'bot-worker'
      const dispatcherAgentId = 'agent-coordinator'
      const dispatcherUserId = 'bot-coordinator'
      const workerInboxId = 'worker-inbox'
      const dispatcherInboxId = 'coordinator-inbox'
      const taskMessageId = 'delegated-task-message'
      const taskResource = { kind: 'kanban.card', id: 'card-script', label: 'Write script' }
      const taskSource =
        sourceKind === 'server_app'
          ? {
              kind: 'server_app',
              appKey: 'kanban',
              command: 'cards.dispatch',
              resource: taskResource,
            }
          : {
              kind: 'agent',
              agentId: dispatcherAgentId,
              userId: dispatcherUserId,
              label: 'Coordinator Buddy',
            }
      const replyMessage = {
        id: 'worker-reply-message',
        content: 'Script is complete and saved to workspace.',
        channelId: workerInboxId,
        authorId: assigneeUserId,
        replyToId: taskMessageId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const taskMessage = {
        id: taskMessageId,
        content: 'Write the script',
        channelId: workerInboxId,
        authorId: dispatcherUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          cards: [
            {
              id: 'task-card-worker',
              kind: 'task',
              version: 1,
              title: 'Write script',
              status: taskStatus,
              assignee: { agentId: assigneeAgentId, userId: assigneeUserId, label: 'ScriptSmith' },
              source: taskSource,
              data: {
                cardId: 'card-script',
              },
              progress: [],
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }
      const createdMessages: any[] = []
      const messageDao = createMockMessageDao({
        create: vi.fn(async (data) => {
          const created = {
            id: data.channelId === dispatcherInboxId ? 'dispatcher-notification' : replyMessage.id,
            ...data,
            authorId: data.authorId,
            createdAt: new Date(),
            updatedAt: new Date(),
            isEdited: false,
            isPinned: false,
          }
          createdMessages.push(created)
          return created
        }),
        findById: vi.fn(async (id: string) => (id === taskMessageId ? taskMessage : null)),
        findByChannelId: vi.fn(async (channelId: string) => ({
          messages: channelId === dispatcherInboxId ? [] : [taskMessage],
          hasMore: false,
        })),
        updateMetadata: vi.fn(async (id: string, metadata: Record<string, unknown> | null) => ({
          ...taskMessage,
          id,
          metadata,
        })),
      })
      const userDao = createMockUserDao({
        findById: vi.fn(async (userId: string) => ({
          id: userId,
          username: userId === assigneeUserId ? 'scriptsmith' : 'coordinator',
          displayName: userId === assigneeUserId ? 'ScriptSmith' : 'Coordinator',
          avatarUrl: null,
          isBot: true,
        })),
      })
      const emit = vi.fn()
      const channelDao = {
        updateLastMessageAt: vi.fn(),
        findById: vi.fn(async (channelId: string) =>
          channelId === workerInboxId
            ? {
                id: workerInboxId,
                serverId: 'server-1',
                topic: `shadow:buddy-inbox:${assigneeAgentId}`,
              }
            : {
                id: dispatcherInboxId,
                serverId: 'server-1',
                topic: `shadow:buddy-inbox:${dispatcherAgentId}`,
              },
        ),
        findByServerId: vi.fn().mockResolvedValue([
          {
            id: workerInboxId,
            serverId: 'server-1',
            topic: `shadow:buddy-inbox:${assigneeAgentId}`,
          },
          {
            id: dispatcherInboxId,
            serverId: 'server-1',
            topic: `shadow:buddy-inbox:${dispatcherAgentId}`,
          },
        ]),
      }
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: userDao as any,
        channelDao: channelDao as any,
        agentDao: {
          findById: vi.fn(async (agentId: string) =>
            agentId === assigneeAgentId
              ? { id: assigneeAgentId, userId: assigneeUserId }
              : { id: dispatcherAgentId, userId: dispatcherUserId, name: 'Coordinator Buddy' },
          ),
          findByUserId: vi.fn(async (userId: string) =>
            userId === dispatcherUserId
              ? { id: dispatcherAgentId, userId: dispatcherUserId, name: 'Coordinator Buddy' }
              : null,
          ),
        } as any,
        agentDashboardDao: {
          incrementMessageCount: vi.fn(),
          incrementHourlyMessage: vi.fn(),
          createEvent: vi.fn(),
        } as any,
        io: { to: vi.fn(() => ({ emit })) } as any,
      })

      await service.send(workerInboxId, assigneeUserId, {
        content: replyMessage.content,
        replyToId: taskMessageId,
      })

      expect(messageDao.updateMetadata).toHaveBeenCalledWith(
        taskMessageId,
        expect.objectContaining({
          cards: [
            expect.objectContaining({
              id: 'task-card-worker',
              status: taskStatus,
              progress: [
                expect.objectContaining({
                  status: taskStatus,
                  note: expect.stringContaining('Buddy replied:'),
                }),
              ],
            }),
          ],
        }),
      )
      const updateCalls = messageDao.updateMetadata.mock.calls
      const updatedMetadata = updateCalls[updateCalls.length - 1]?.[1] as {
        cards?: Array<Record<string, unknown>>
      }
      expect(updatedMetadata.cards?.[0]).not.toHaveProperty('replies')
      const notification = createdMessages.find(
        (message) => message.channelId === dispatcherInboxId,
      )
      expect(notification).toBeUndefined()
      expect(emit).toHaveBeenCalledWith(
        'message:updated',
        expect.objectContaining({ id: taskMessageId }),
      )
      expect(emit).not.toHaveBeenCalledWith(
        'message:new',
        expect.objectContaining({ id: 'dispatcher-notification' }),
      )
    })
  })

  describe('getById', () => {
    it('should return message when found', async () => {
      const mockMessage = { id: 'msg1', content: 'Hello', channelId: 'ch1' }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(mockMessage),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getById('msg1')
      expect(result).toEqual(mockMessage)
    })

    it('should return null when message not found', async () => {
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getById('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('getByChannelId', () => {
    it('should resolve author avatar urls before returning messages', async () => {
      const messageDao = createMockMessageDao({
        findByChannelId: vi.fn().mockResolvedValue({
          messages: [
            {
              id: 'msg1',
              content: 'Hello',
              channelId: 'ch1',
              author: {
                id: 'u1',
                username: 'testuser',
                displayName: 'Test',
                avatarUrl: '/shadow/uploads/avatar.png',
                isBot: false,
              },
            },
          ],
          hasMore: false,
        }),
      })
      const mediaService = {
        resolveMediaUrl: vi.fn().mockReturnValue('/api/media/signed/avatar-token'),
      }
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao() as any,
        mediaService: mediaService as any,
      })

      const result = await service.getByChannelId('ch1')

      expect(result.messages[0]?.author?.avatarUrl).toBe('/api/media/signed/avatar-token')
      expect(mediaService.resolveMediaUrl).toHaveBeenCalledWith(
        '/shadow/uploads/avatar.png',
        'image/png',
        {
          variant: 'avatar',
        },
      )
    })
  })

  describe('getWindowAroundMessage', () => {
    it('delegates to the message window query and resolves author avatars', async () => {
      const messageDao = createMockMessageDao({
        findWindowAroundMessage: vi.fn().mockResolvedValue({
          messages: [
            {
              id: 'msg2',
              content: 'Target',
              channelId: 'ch1',
              author: {
                id: 'u1',
                username: 'testuser',
                displayName: 'Test',
                avatarUrl: '/shadow/uploads/avatar.png',
                isBot: false,
              },
            },
          ],
          hasMore: true,
        }),
      })
      const mediaService = {
        resolveMediaUrl: vi.fn().mockReturnValue('/api/media/signed/avatar-token'),
      }
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao() as any,
        mediaService: mediaService as any,
      })

      const result = await service.getWindowAroundMessage('ch1', 'msg2', 50)

      expect(messageDao.findWindowAroundMessage).toHaveBeenCalledWith('ch1', 'msg2', 50)
      expect(result?.hasMore).toBe(true)
      expect(result?.messages[0]?.author?.avatarUrl).toBe('/api/media/signed/avatar-token')
    })
  })

  describe('addReaction', () => {
    it('should add reaction to existing message', async () => {
      const mockMessage = { id: 'msg1', content: 'Hello' }
      const mockReaction = { id: 'r1', messageId: 'msg1', userId: 'u1', emoji: '👍' }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(mockMessage),
        addReaction: vi.fn().mockResolvedValue(mockReaction),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.addReaction('msg1', 'u1', { emoji: '👍' })
      expect(result.emoji).toBe('👍')
    })

    it('should throw 404 for reaction on non-existent message', async () => {
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.addReaction('nonexistent', 'u1', { emoji: '👍' })).rejects.toThrow(
        'Message not found',
      )
    })
  })

  describe('getReactions', () => {
    it('should return reactions for a message', async () => {
      const mockRawReactions = [
        { id: 'r1', messageId: 'msg1', userId: 'u1', emoji: '👍', createdAt: new Date() },
        { id: 'r2', messageId: 'msg1', userId: 'u2', emoji: '👍', createdAt: new Date() },
      ]
      const messageDao = createMockMessageDao({
        getReactions: vi.fn().mockResolvedValue(mockRawReactions),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getReactions('msg1')
      expect(result).toEqual([{ emoji: '👍', count: 2, userIds: ['u1', 'u2'] }])
    })
  })

  describe('long content handling', () => {
    it('should send message with content at the new 16KB limit', async () => {
      const longContent = 'A'.repeat(16000)
      const mockMessage = {
        id: 'msg-long',
        content: longContent,
        channelId: 'ch1',
        authorId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const messageDao = createMockMessageDao({
        create: vi.fn().mockResolvedValue(mockMessage),
      })
      const userDao = createMockUserDao({
        findById: vi.fn().mockResolvedValue({
          id: 'u1',
          username: 'testuser',
          displayName: 'Test',
          avatarUrl: 'data:image/svg+xml,test-avatar',
          isBot: false,
        }),
      })
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: userDao as any,
        channelDao: { updateLastMessageAt: vi.fn() } as any,
        agentDao: {} as any,
        agentDashboardDao: {} as any,
      })

      const result = await service.send('ch1', 'u1', { content: longContent })
      expect(result.content).toBe(longContent)
      expect(result.content.length).toBe(16000)
      expect(result.author?.avatarUrl).toBe('data:image/svg+xml,test-avatar')
      expect(result.author).not.toHaveProperty('avatarName')
    })

    it('should send message with 8KB agent response', async () => {
      const agentContent = 'This is a detailed agent response. '.repeat(200) // ~7200 chars
      const mockMessage = {
        id: 'msg-agent',
        content: agentContent,
        channelId: 'ch1',
        authorId: 'bot-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const messageDao = createMockMessageDao({
        create: vi.fn().mockResolvedValue(mockMessage),
      })
      const userDao = createMockUserDao({
        findById: vi.fn().mockResolvedValue({
          id: 'bot-1',
          username: 'testbot',
          displayName: 'Test Bot',
          isBot: true,
        }),
      })
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: userDao as any,
        channelDao: { updateLastMessageAt: vi.fn() } as any,
        agentDao: { findByUserId: vi.fn().mockResolvedValue(null) } as any,
        agentDashboardDao: {
          incrementMessageCount: vi.fn(),
          incrementHourlyMessage: vi.fn(),
          createEvent: vi.fn(),
        } as any,
      })

      const result = await service.send('ch1', 'bot-1', { content: agentContent })
      expect(result.content).toBe(agentContent)
      expect(result.content.length).toBe(agentContent.length)
    })

    it('should auto-link channel attachments into the server workspace', async () => {
      const mockMessage = {
        id: 'msg-with-file',
        content: 'see file',
        channelId: 'ch1',
        authorId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
        isEdited: false,
        isPinned: false,
      }
      const messageDao = createMockMessageDao({
        create: vi.fn().mockResolvedValue(mockMessage),
        createAttachment: vi.fn().mockImplementation((data) =>
          Promise.resolve({
            id: 'att-1',
            ...data,
          }),
        ),
        getAttachments: vi.fn().mockResolvedValue([
          {
            id: 'att-1',
            messageId: 'msg-with-file',
            filename: 'page.html',
            url: '/shadow/uploads/page.html',
            contentType: 'text/html',
            size: 128,
            workspaceNodeId: 'node-1',
          },
        ]),
      })
      const userDao = createMockUserDao({
        findById: vi.fn().mockResolvedValue({ id: 'u1', username: 'testuser', isBot: false }),
      })
      const workspaceService = {
        getOrCreateForServer: vi.fn().mockResolvedValue({ id: 'ws-1', serverId: 'srv-1' }),
        createFile: vi.fn().mockResolvedValue({ id: 'node-1' }),
      }

      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: userDao as any,
        channelDao: {
          findById: vi.fn().mockResolvedValue({ id: 'ch1', serverId: 'srv-1' }),
          updateLastMessageAt: vi.fn(),
        } as any,
        agentDao: {} as any,
        agentDashboardDao: {} as any,
        workspaceService: workspaceService as any,
        logger: { warn: vi.fn() } as any,
      })

      const result = await service.send('ch1', 'u1', {
        content: 'see file',
        attachments: [
          {
            filename: 'page.html',
            url: '/shadow/uploads/page.html',
            contentType: 'text/html',
            size: 128,
          },
        ],
      })

      expect(workspaceService.getOrCreateForServer).toHaveBeenCalledWith('srv-1')
      expect(workspaceService.createFile).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          name: 'page.html',
          mime: 'text/html',
          contentRef: '/shadow/uploads/page.html',
          metadata: expect.objectContaining({
            source: 'channel_message_attachment',
            channelId: 'ch1',
            messageId: 'msg-with-file',
            access: { scope: 'server', serverId: 'srv-1' },
          }),
        }),
      )
      expect(messageDao.createAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceNodeId: 'node-1' }),
      )
      expect(result.attachments[0].workspaceNodeId).toBe('node-1')
    })

    it('should preserve private channel isolation when linking attachments to workspace', async () => {
      const messageDao = createMockMessageDao({
        createAttachment: vi.fn().mockImplementation((data) =>
          Promise.resolve({
            id: 'att-1',
            ...data,
          }),
        ),
      })
      const workspaceService = {
        getOrCreateForServer: vi.fn().mockResolvedValue({ id: 'ws-1', serverId: 'srv-1' }),
        createFile: vi.fn().mockResolvedValue({ id: 'node-1' }),
      }
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: createMockUserDao() as any,
        channelDao: {
          findById: vi
            .fn()
            .mockResolvedValue({ id: 'private-ch', serverId: 'srv-1', isPrivate: true }),
        } as any,
        agentDao: {} as any,
        agentDashboardDao: {} as any,
        workspaceService: workspaceService as any,
        logger: { warn: vi.fn() } as any,
      })

      await service.createAttachmentForMessage('msg-1', 'private-ch', {
        filename: 'secret.html',
        url: '/shadow/uploads/secret.html',
        contentType: 'text/html',
        size: 128,
      })

      expect(workspaceService.createFile).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          metadata: expect.objectContaining({
            access: { scope: 'channel', serverId: 'srv-1', channelId: 'private-ch' },
          }),
        }),
      )
    })

    it('should update message with long content', async () => {
      const longContent = 'B'.repeat(12000)
      const existingMessage = {
        id: 'msg1',
        content: 'short',
        channelId: 'ch1',
        authorId: 'u1',
      }
      const updatedMessage = { ...existingMessage, content: longContent, isEdited: true }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(existingMessage),
        updateById: vi.fn().mockResolvedValue(updatedMessage),
      })
      const userDao = createMockUserDao({
        findById: vi.fn().mockResolvedValue({
          id: 'u1',
          username: 'testuser',
          displayName: 'Test',
          isBot: false,
        }),
      })
      const service = new MessageService({
        messageDao: messageDao as any,
        userDao: userDao as any,
        channelDao: {} as any,
        agentDao: {} as any,
        agentDashboardDao: {} as any,
      })

      const result = await service.update('msg1', 'u1', { content: longContent })
      expect(result.content).toBe(longContent)
    })
  })
})

describe('NotificationService', () => {
  describe('getByUserId', () => {
    it('should resolve sender avatar urls for notification lists', async () => {
      const notificationDao = createMockNotificationDao({
        findByUserId: vi.fn().mockResolvedValue([
          {
            id: 'n1',
            userId: 'u1',
            type: 'mention',
            title: 'Mention',
            referenceId: 'm1',
            referenceType: 'message',
            senderAvatarUrl: '/shadow/uploads/sender.png',
            isRead: false,
          },
        ]),
      })
      const mediaService = {
        resolveMediaUrl: vi.fn().mockReturnValue('/api/media/signed/sender-token'),
      }
      const service = new NotificationService({
        notificationDao: notificationDao as any,
        mediaService: mediaService as any,
      })

      const result = await service.getByUserId('u1')

      expect(result[0]?.senderAvatarUrl).toBe('/api/media/signed/sender-token')
      expect(mediaService.resolveMediaUrl).toHaveBeenCalledWith(
        '/shadow/uploads/sender.png',
        'image/png',
        {
          variant: 'avatar',
        },
      )
    })
  })

  describe('create', () => {
    it('should create a reply notification', async () => {
      const mockNotification = {
        id: 'n1',
        userId: 'u2',
        type: 'reply',
        title: 'Alice replied to your message',
        body: 'Hello there!',
      }
      const notificationDao = createMockNotificationDao({
        create: vi.fn().mockResolvedValue(mockNotification),
      })
      const service = new NotificationService({ notificationDao: notificationDao as any })

      const result = await service.create({
        userId: 'u2',
        type: 'reply',
        title: 'Alice replied to your message',
        body: 'Hello there!',
        referenceId: 'msg1',
        referenceType: 'message',
      })
      expect(result.type).toBe('reply')
      expect(result.userId).toBe('u2')
    })
  })

  describe('getUnreadCount', () => {
    it('should return the unread count', async () => {
      const notificationDao = createMockNotificationDao({
        findUnreadByUserId: vi.fn().mockResolvedValue([
          {
            id: 'n1',
            userId: 'u1',
            type: 'mention',
            referenceId: 'm1',
            referenceType: 'message',
            isRead: false,
          },
          {
            id: 'n2',
            userId: 'u1',
            type: 'reply',
            referenceId: 'm2',
            referenceType: 'message',
            isRead: false,
          },
        ]),
        findMessageScopesByMessageIds: vi.fn().mockResolvedValue([
          { messageId: 'm1', channelId: 'c1', serverId: 's1' },
          { messageId: 'm2', channelId: 'c1', serverId: 's1' },
        ]),
      })
      const service = new NotificationService({ notificationDao: notificationDao as any })

      const result = await service.getUnreadCount('u1')
      expect(result).toBe(2)
    })
  })

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const mockNotification = { id: 'n1', isRead: true }
      const notificationDao = createMockNotificationDao({
        markAsRead: vi.fn().mockResolvedValue(mockNotification),
      })
      const service = new NotificationService({ notificationDao: notificationDao as any })

      const result = await service.markAsRead('n1')
      expect(result.isRead).toBe(true)
    })
  })

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for user', async () => {
      const notificationDao = createMockNotificationDao({
        markAllAsRead: vi.fn().mockResolvedValue(undefined),
      })
      const service = new NotificationService({ notificationDao: notificationDao as any })

      await expect(service.markAllAsRead('u1')).resolves.toBeUndefined()
      expect(notificationDao.markAllAsRead).toHaveBeenCalledWith('u1')
    })
  })
})
