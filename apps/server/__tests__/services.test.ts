import { describe, expect, it, vi } from 'vitest'
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
    findByThreadId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createThread: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    getReactions: vi.fn(),
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
    create: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getUnreadCount: vi.fn(),
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
        slug: undefined,
        isPublic: true,
      })
    })
  })
})

describe('MessageService', () => {
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
})

describe('NotificationService', () => {
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
        getUnreadCount: vi.fn().mockResolvedValue(5),
      })
      const service = new NotificationService({ notificationDao: notificationDao as any })

      const result = await service.getUnreadCount('u1')
      expect(result).toBe(5)
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
