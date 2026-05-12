import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentDashboardDao } from '../dao/agent-dashboard.dao'
import type { AgentListingDao } from '../dao/agent-listing.dao'
import type { RentalContractDao } from '../dao/rental-contract.dao'
import type { UserDao } from '../dao/user.dao'
import { AgentDashboardService } from './agent-dashboard.service'

/** Cast to Mocked<T> via unknown to avoid missing-property errors for rarely-used methods */
function mockDao<T extends object>(obj: Record<string, ReturnType<typeof vi.fn>>): Mocked<T> {
  return obj as unknown as Mocked<T>
}

// Mock logger — cast to avoid missing BaseLogger properties
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as typeof import('../lib/logger').logger

describe('AgentDashboardService', () => {
  // Mock DAOs using vi.fn() with proper typing
  const mockAgentDashboardDao = mockDao<AgentDashboardDao>({
    findDailyStats: vi.fn(),
    findHourlyStats: vi.fn(),
    getTotalMessages: vi.fn(),
    getActiveDaysCount: vi.fn(),
    calculateStreaks: vi.fn(),
    findRecentEvents: vi.fn(),
    incrementMessageCount: vi.fn(),
    incrementHourlyMessage: vi.fn(),
    upsertDailyStats: vi.fn(),
    createEvent: vi.fn(),
    deleteOldEvents: vi.fn(),
  })

  const mockAgentDao = mockDao<AgentDao>({
    findById: vi.fn(),
    findByUserId: vi.fn(),
  })

  const mockRentalContractDao = mockDao<RentalContractDao>({
    findByListingIds: vi.fn(),
  })

  const mockAgentListingDao = mockDao<AgentListingDao>({
    findByAgentId: vi.fn(),
  })

  const mockUserDao = mockDao<UserDao>({
    findById: vi.fn(),
  })

  const service = new AgentDashboardService({
    agentDashboardDao: mockAgentDashboardDao,
    agentDao: mockAgentDao,
    rentalContractDao: mockRentalContractDao,
    agentListingDao: mockAgentListingDao,
    userDao: mockUserDao,
    logger: mockLogger,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getDashboard', () => {
    it('should return dashboard data for agent owner', async () => {
      const agentId = 'agent-123'
      const userId = 'user-123'

      // Mock agent
      vi.mocked(mockAgentDao.findById).mockResolvedValue({
        id: agentId,
        ownerId: userId,
        totalOnlineSeconds: 3600,
      } as any)

      // Mock stats
      vi.mocked(mockAgentDashboardDao.findDailyStats).mockResolvedValue([
        { date: '2025-03-26', messageCount: 10 },
        { date: '2025-03-27', messageCount: 5 },
      ] as any)
      vi.mocked(mockAgentDashboardDao.findHourlyStats).mockResolvedValue([
        { hourOfDay: 9, messageCount: 5 },
        { hourOfDay: 14, messageCount: 10 },
      ] as any)
      vi.mocked(mockAgentDashboardDao.getTotalMessages).mockResolvedValue(100)
      vi.mocked(mockAgentDashboardDao.getActiveDaysCount).mockResolvedValue(15)
      vi.mocked(mockAgentDashboardDao.calculateStreaks).mockResolvedValue({
        current: 5,
        longest: 10,
      })
      vi.mocked(mockAgentDashboardDao.findRecentEvents).mockResolvedValue([
        {
          id: 'event-1',
          eventType: 'message',
          eventData: { preview: 'Hello' },
          createdAt: new Date(),
        },
      ] as any)

      // Mock rental stats
      vi.mocked(mockAgentListingDao.findByAgentId).mockResolvedValue([])

      const result = await service.getDashboard(agentId, userId)

      expect(result).toBeDefined()
      expect(result.stats.totalMessages).toBe(100)
      expect(result.stats.totalOnlineSeconds).toBe(3600)
      expect(result.stats.activeDays30d).toBe(15)
      expect(result.stats.currentStreak).toBe(5)
      expect(result.stats.longestStreak).toBe(10)
      expect(result.activityHeatmap).toHaveLength(365)
      expect(result.weeklyActivity).toHaveLength(7)
      expect(result.hourlyDistribution).toHaveLength(24)
      expect(result.monthlyTrend).toHaveLength(12)
      expect(result.recentEvents).toHaveLength(1)
    })

    it('should throw 404 if agent not found', async () => {
      vi.mocked(mockAgentDao.findById).mockResolvedValue(null)

      await expect(service.getDashboard('agent-123', 'user-123')).rejects.toMatchObject({
        status: 404,
        message: 'Agent not found',
      })
    })

    it('should throw 403 if user is not owner or tenant', async () => {
      vi.mocked(mockAgentDao.findById).mockResolvedValue({
        id: 'agent-123',
        ownerId: 'owner-123',
      } as any)

      await expect(service.getDashboard('agent-123', 'other-user')).rejects.toMatchObject({
        status: 403,
        message: 'Forbidden',
      })
    })
  })

  describe('recordMessage', () => {
    it('should record message count and hourly stats', async () => {
      const agentId = 'agent-123'

      await service.recordMessage(agentId)

      expect(mockAgentDashboardDao.incrementMessageCount).toHaveBeenCalled()
      expect(mockAgentDashboardDao.incrementHourlyMessage).toHaveBeenCalled()
    })
  })

  describe('recordOnlineTime', () => {
    it('should record online time for today', async () => {
      const agentId = 'agent-123'
      const seconds = 300

      await service.recordOnlineTime(agentId, seconds)

      expect(mockAgentDashboardDao.upsertDailyStats).toHaveBeenCalledWith(
        agentId,
        expect.any(String),
        { onlineSeconds: seconds },
      )
    })
  })

  describe('addEvent', () => {
    it('should create activity event', async () => {
      const agentId = 'agent-123'
      const eventType = 'status_change'
      const eventData = { status: 'online' }

      await service.addEvent(agentId, eventType, eventData)

      expect(mockAgentDashboardDao.createEvent).toHaveBeenCalledWith(agentId, eventType, eventData)
    })
  })

  describe('cleanupOldEvents', () => {
    it('should delete events older than 90 days', async () => {
      await service.cleanupOldEvents()

      expect(mockAgentDashboardDao.deleteOldEvents).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalled()
    })
  })
})
