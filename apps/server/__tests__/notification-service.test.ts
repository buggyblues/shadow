import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationDao } from '../src/dao/notification.dao'
import { NotificationService } from '../src/services/notification.service'

describe('NotificationService', () => {
  const mockNotificationDao: Mocked<NotificationDao> = {
    getPreference: vi.fn(),
    upsertPreference: vi.fn(),
    findMessageScopesByMessageIds: vi.fn(),
    findChannelScopes: vi.fn(),
    create: vi.fn(),
    aggregateOrCreate: vi.fn(),
    findByUserId: vi.fn(),
    findUnreadByUserId: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsReadByIds: vi.fn(),
  } as unknown as Mocked<NotificationDao>

  let service: NotificationService

  beforeEach(() => {
    vi.clearAllMocks()
    mockNotificationDao.findMessageScopesByMessageIds.mockResolvedValue([])
    mockNotificationDao.findChannelScopes.mockResolvedValue([])
    mockNotificationDao.markAsReadByIds.mockResolvedValue(undefined)
    service = new NotificationService({ notificationDao: mockNotificationDao })
  })

  describe('shouldKeepByStrategy', () => {
    it('always keeps system notifications', () => {
      // Access private method via any cast for testing
      const svc = service as any
      expect(svc.shouldKeepByStrategy('system', 'none')).toBe(true)
      expect(svc.shouldKeepByStrategy('system', 'mention_only')).toBe(true)
      expect(svc.shouldKeepByStrategy('system', 'all')).toBe(true)
    })

    it('keeps nothing when strategy is none (except system)', () => {
      const svc = service as any
      expect(svc.shouldKeepByStrategy('mention', 'none')).toBe(false)
      expect(svc.shouldKeepByStrategy('dm', 'none')).toBe(false)
      expect(svc.shouldKeepByStrategy('reply', 'none')).toBe(false)
    })

    it('only keeps mentions when strategy is mention_only', () => {
      const svc = service as any
      expect(svc.shouldKeepByStrategy('mention', 'mention_only')).toBe(true)
      expect(svc.shouldKeepByStrategy('dm', 'mention_only')).toBe(false)
      expect(svc.shouldKeepByStrategy('reply', 'mention_only')).toBe(false)
    })

    it('keeps all when strategy is all', () => {
      const svc = service as any
      expect(svc.shouldKeepByStrategy('mention', 'all')).toBe(true)
      expect(svc.shouldKeepByStrategy('dm', 'all')).toBe(true)
      expect(svc.shouldKeepByStrategy('reply', 'all')).toBe(true)
    })
  })

  describe('create', () => {
    const now = new Date()
    const allowAllPreference = {
      userId: 'user-1',
      strategy: 'all' as const,
      mutedServerIds: [],
      mutedChannelIds: [],
      createdAt: now,
      updatedAt: now,
    }

    it('skips notification when user strategy is none', async () => {
      mockNotificationDao.getPreference.mockResolvedValue({
        userId: 'user-1',
        strategy: 'none',
        mutedServerIds: [],
        mutedChannelIds: [],
        createdAt: now,
        updatedAt: now,
      })

      const result = await service.create({
        userId: 'user-1',
        type: 'dm',
        title: 'Test',
        body: 'Test body',
      })

      expect(result).toBeNull()
      expect(mockNotificationDao.create).not.toHaveBeenCalled()
    })

    it('skips mention notification when strategy is mention_only and type is not mention', async () => {
      mockNotificationDao.getPreference.mockResolvedValue({
        userId: 'user-1',
        strategy: 'mention_only',
        mutedServerIds: [],
        mutedChannelIds: [],
        createdAt: now,
        updatedAt: now,
      })

      const result = await service.create({
        userId: 'user-1',
        type: 'dm',
        title: 'DM',
        body: 'Hey',
      })

      expect(result).toBeNull()
      expect(mockNotificationDao.create).not.toHaveBeenCalled()
    })

    it('creates notification when strategy allows it', async () => {
      mockNotificationDao.getPreference.mockResolvedValue(allowAllPreference)
      mockNotificationDao.create.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        type: 'dm',
        kind: 'dm.message',
        title: 'Test',
        body: 'Test body',
        referenceId: null,
        referenceType: null,
        senderId: null,
        scopeServerId: null,
        scopeChannelId: null,
        aggregationKey: null,
        aggregatedCount: 1,
        lastAggregatedAt: null,
        metadata: null,
        isRead: false,
        createdAt: now,
        expiresAt: null,
      })

      const result = await service.create({
        userId: 'user-1',
        type: 'dm',
        title: 'Test',
        body: 'Test body',
      })

      expect(mockNotificationDao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'dm',
        }),
      )
      expect(result).not.toBeNull()
    })

    it('skips notifications for muted direct channel scope', async () => {
      mockNotificationDao.getPreference.mockResolvedValue({
        ...allowAllPreference,
        mutedChannelIds: ['channel-1'],
      })

      const result = await service.create({
        userId: 'user-1',
        type: 'reply',
        title: 'Reply',
        body: 'Hey',
        scopeChannelId: 'channel-1',
      })

      expect(result).toBeNull()
      expect(mockNotificationDao.create).not.toHaveBeenCalled()
      expect(mockNotificationDao.aggregateOrCreate).not.toHaveBeenCalled()
    })

    it('uses aggregation when an aggregation key is present', async () => {
      mockNotificationDao.getPreference.mockResolvedValue(allowAllPreference)
      mockNotificationDao.aggregateOrCreate.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        type: 'mention',
        kind: 'message.mention',
        title: 'Mention',
        body: 'hello',
        referenceId: 'message-2',
        referenceType: 'message',
        senderId: 'sender-1',
        scopeServerId: 'server-1',
        scopeChannelId: 'channel-1',
        aggregationKey: 'mention:user-1:channel-1',
        aggregatedCount: 2,
        lastAggregatedAt: now,
        metadata: null,
        isRead: false,
        createdAt: now,
        expiresAt: null,
      })

      const result = await service.create({
        userId: 'user-1',
        type: 'mention',
        title: 'Mention',
        body: 'hello',
        referenceId: 'message-2',
        referenceType: 'message',
        scopeServerId: 'server-1',
        scopeChannelId: 'channel-1',
        aggregationKey: 'mention:user-1:channel-1',
      })

      expect(result?.aggregatedCount).toBe(2)
      expect(mockNotificationDao.create).not.toHaveBeenCalled()
      expect(mockNotificationDao.aggregateOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          aggregationKey: 'mention:user-1:channel-1',
          windowStart: expect.any(Date),
        }),
      )
    })
  })

  describe('markAsRead', () => {
    it('scopes mark-read by user id', async () => {
      mockNotificationDao.markAsRead.mockResolvedValue({ id: 'notif-1' } as any)

      await service.markAsRead('user-1', 'notif-1')

      expect(mockNotificationDao.markAsRead).toHaveBeenCalledWith('user-1', 'notif-1')
    })
  })

  describe('getScopedUnread', () => {
    const now = new Date()

    it('counts aggregated unread by server and channel scope', async () => {
      mockNotificationDao.getPreference.mockResolvedValue({
        userId: 'user-1',
        strategy: 'all',
        mutedServerIds: [],
        mutedChannelIds: [],
        createdAt: now,
        updatedAt: now,
      })
      mockNotificationDao.findUnreadByUserId.mockResolvedValue([
        {
          id: 'channel-notif',
          userId: 'user-1',
          type: 'mention',
          kind: 'message.mention',
          referenceId: 'message-1',
          referenceType: 'message',
          scopeServerId: 'server-1',
          scopeChannelId: 'channel-1',
          aggregatedCount: 3,
          isRead: false,
        },
        {
          id: 'dm-notif',
          userId: 'user-1',
          type: 'dm',
          kind: 'dm.message',
          referenceId: 'message-2',
          referenceType: 'channel',
          scopeServerId: null,
          scopeChannelId: 'channel-2',
          aggregatedCount: 2,
          isRead: false,
        },
      ] as any)

      const result = await service.getScopedUnread('user-1')

      expect(result).toEqual({
        channelUnread: { 'channel-1': 3, 'channel-2': 2 },
        serverUnread: { 'server-1': 3 },
      })
    })
  })

  describe('markScopeAsRead', () => {
    it('marks only matching direct channel scope notifications', async () => {
      mockNotificationDao.findUnreadByUserId.mockResolvedValue([
        {
          id: 'channel-target',
          userId: 'user-1',
          type: 'dm',
          referenceId: 'message-1',
          referenceType: 'channel',
          scopeChannelId: 'channel-1',
          isRead: false,
        },
        {
          id: 'channel-other',
          userId: 'user-1',
          type: 'dm',
          referenceId: 'message-2',
          referenceType: 'channel',
          scopeChannelId: 'channel-2',
          isRead: false,
        },
      ] as any)

      const result = await service.markScopeAsRead('user-1', { channelId: 'channel-1' })

      expect(result).toEqual({ updated: 1 })
      expect(mockNotificationDao.markAsReadByIds).toHaveBeenCalledWith(['channel-target'])
    })
  })
})
