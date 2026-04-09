import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mocked } from 'vitest'
import type { NotificationDao } from '../dao/notification.dao'
import { NotificationService } from './notification.service'

describe('NotificationService', () => {
  const mockNotificationDao: Mocked<NotificationDao> = {
    getPreference: vi.fn(),
    upsertPreference: vi.fn(),
    findMessageScopesByMessageIds: vi.fn(),
    findChannelScopes: vi.fn(),
    create: vi.fn(),
    findByUserId: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    getUnreadCount: vi.fn(),
    markScopeRead: vi.fn(),
    getScopedUnread: vi.fn(),
  } as unknown as Mocked<NotificationDao>

  let service: NotificationService

  beforeEach(() => {
    vi.clearAllMocks()
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
    it('skips notification when user strategy is none', async () => {
      mockNotificationDao.getPreference.mockResolvedValue({
        userId: 'user-1',
        strategy: 'none',
        mutedServerIds: [],
        mutedChannelIds: [],
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
      mockNotificationDao.getPreference.mockResolvedValue({
        userId: 'user-1',
        strategy: 'all',
        mutedServerIds: [],
        mutedChannelIds: [],
      })
      mockNotificationDao.create.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        type: 'dm',
        referenceId: null,
        referenceType: null,
        isRead: false,
        createdAt: new Date(),
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
  })
})
