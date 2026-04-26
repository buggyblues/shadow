import type { Logger } from 'pino'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentDashboardDao } from '../dao/agent-dashboard.dao'
import type { ClawListingDao } from '../dao/claw-listing.dao'
import type { RentalContractDao } from '../dao/rental-contract.dao'
import type { UserDao } from '../dao/user.dao'

// Dashboard constants
const DASHBOARD_CONSTANTS = {
  HEATMAP_DAYS: 365,
  WEEKLY_DAYS: 7,
  MONTHLY_MONTHS: 12,
  ACTIVE_DAYS_WINDOW: 30,
  EVENT_RETENTION_DAYS: 90,
} as const

function getDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function calculateActivityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count >= 100) return 4
  if (count >= 51) return 3
  if (count >= 11) return 2
  if (count >= 1) return 1
  return 0
}

export interface DashboardStats {
  totalMessages: number
  totalOnlineSeconds: number
  activeDays30d: number
  currentStreak: number
  longestStreak: number
}

export interface ActivityHeatmapItem {
  date: string
  messageCount: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface WeeklyActivityItem {
  date: string
  messageCount: number
}

export interface HourlyDistributionItem {
  hour: number
  messageCount: number
}

export interface MonthlyTrendItem {
  month: string
  messageCount: number
}

export interface ActivityEvent {
  id: string
  type: string
  data: Record<string, unknown>
  createdAt: string
}

export interface RentalStats {
  totalRentals: number
  totalIncome: number
  averageDuration: number
  currentTenant?: {
    id: string
    username: string
    displayName: string
  }
}

export interface AgentDashboardResponse {
  activityHeatmap: ActivityHeatmapItem[]
  stats: DashboardStats
  weeklyActivity: WeeklyActivityItem[]
  hourlyDistribution: HourlyDistributionItem[]
  monthlyTrend: MonthlyTrendItem[]
  recentEvents: ActivityEvent[]
  rentalStats?: RentalStats
}

export class AgentDashboardService {
  constructor(
    private deps: {
      agentDashboardDao: AgentDashboardDao
      agentDao: AgentDao
      rentalContractDao: RentalContractDao
      clawListingDao: ClawListingDao
      userDao: UserDao
      logger: Logger
    },
  ) {}

  /**
   * Get full dashboard data for an agent
   */
  async getDashboard(agentId: string, userId: string): Promise<AgentDashboardResponse> {
    // Verify agent exists and user has access
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Agent not found'), { status: 404 })
    }

    // Check permissions (owner or tenant can view full dashboard)
    const isOwner = agent.ownerId === userId
    const isTenant = await this.checkIsTenant(agentId, userId)

    if (!isOwner && !isTenant) {
      throw Object.assign(new Error('Forbidden'), { status: 403 })
    }

    const now = new Date()
    const oneYearAgo = new Date(
      now.getTime() - DASHBOARD_CONSTANTS.HEATMAP_DAYS * 24 * 60 * 60 * 1000,
    )
    const sevenDaysAgo = new Date(
      now.getTime() - DASHBOARD_CONSTANTS.WEEKLY_DAYS * 24 * 60 * 60 * 1000,
    )
    const twelveMonthsAgo = new Date(
      now.getTime() - DASHBOARD_CONSTANTS.MONTHLY_MONTHS * 30 * 24 * 60 * 60 * 1000,
    )

    // Fetch all data in parallel
    const [dailyStats, hourlyStats, totalMessages, activeDays30d, streaks, recentEvents] =
      await Promise.all([
        this.deps.agentDashboardDao.findDailyStats(agentId, oneYearAgo, now),
        this.deps.agentDashboardDao.findHourlyStats(agentId),
        this.deps.agentDashboardDao.getTotalMessages(agentId),
        this.deps.agentDashboardDao.getActiveDaysCount(agentId, 30),
        this.deps.agentDashboardDao.calculateStreaks(agentId),
        this.deps.agentDashboardDao.findRecentEvents(agentId, 10),
      ])

    // Build activity heatmap (last 365 days)
    const activityHeatmap = this.buildActivityHeatmap(dailyStats)

    // Build weekly activity (last 7 days)
    const weeklyActivity = this.buildWeeklyActivity(dailyStats, sevenDaysAgo)

    // Build hourly distribution
    const hourlyDistribution = this.buildHourlyDistribution(hourlyStats)

    // Build monthly trend (last 12 months)
    const monthlyTrend = this.buildMonthlyTrend(dailyStats, twelveMonthsAgo)

    // Get rental stats if owner
    let rentalStats: RentalStats | undefined
    if (isOwner) {
      rentalStats = await this.getRentalStats(agentId)
    }

    return {
      activityHeatmap,
      stats: {
        totalMessages,
        totalOnlineSeconds: agent.totalOnlineSeconds ?? 0,
        activeDays30d,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
      },
      weeklyActivity,
      hourlyDistribution,
      monthlyTrend,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        type: e.eventType,
        data: e.eventData as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
      rentalStats,
    }
  }

  /**
   * Record a message sent by the agent
   */
  async recordMessage(agentId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0]!
    const hour = new Date().getHours()

    await Promise.all([
      this.deps.agentDashboardDao.incrementMessageCount(agentId, today),
      this.deps.agentDashboardDao.incrementHourlyMessage(agentId, hour),
    ])
  }

  /**
   * Record online time for the agent
   */
  async recordOnlineTime(agentId: string, seconds: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0]!
    await this.deps.agentDashboardDao.upsertDailyStats(agentId, today, { onlineSeconds: seconds })
  }

  /**
   * Add an activity event
   */
  async addEvent(
    agentId: string,
    eventType: string,
    eventData: Record<string, unknown> = {},
  ): Promise<void> {
    await this.deps.agentDashboardDao.createEvent(agentId, eventType, eventData)
  }

  /**
   * Clean up old events (keep last N days)
   */
  async cleanupOldEvents(): Promise<void> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - DASHBOARD_CONSTANTS.EVENT_RETENTION_DAYS)
    await this.deps.agentDashboardDao.deleteOldEvents(cutoffDate)
    this.deps.logger.info({ cutoffDate }, 'Cleaned up old agent activity events')
  }

  /* ───────────── Private Helpers ───────────── */

  private async checkIsTenant(agentId: string, userId: string): Promise<boolean> {
    // Find listings for this agent
    const listings = await this.deps.clawListingDao.findByAgentId(agentId)
    if (listings.length === 0) {
      return false
    }

    const listingIds = listings.map((l) => l.id)

    // Check if user has an active contract for any of these listings
    const contracts = await this.deps.rentalContractDao.findByTenantId(userId, { status: 'active' })
    return contracts.some((contract) => listingIds.includes(contract.listingId))
  }

  private async getRentalStats(agentId: string): Promise<RentalStats> {
    // Find listings for this agent
    const listings = await this.deps.clawListingDao.findByAgentId(agentId)

    if (listings.length === 0) {
      return {
        totalRentals: 0,
        totalIncome: 0,
        averageDuration: 0,
      }
    }

    const listingIds = listings.map((l) => l.id)

    // Get all contracts for these listings
    const contracts = await this.deps.rentalContractDao.findByListingIds(listingIds)

    if (contracts.length === 0) {
      return {
        totalRentals: 0,
        totalIncome: 0,
        averageDuration: 0,
      }
    }

    // Calculate stats
    const completedContracts = contracts.filter((c) => c.status === 'completed')
    const totalRentals = completedContracts.length

    // Calculate total income from usage records
    let totalIncome = 0
    for (const contract of completedContracts) {
      totalIncome += contract.totalCost ?? 0
    }

    // Calculate average duration
    let totalDuration = 0
    for (const contract of completedContracts) {
      if (contract.startsAt && contract.terminatedAt) {
        const duration =
          new Date(contract.terminatedAt).getTime() - new Date(contract.startsAt).getTime()
        totalDuration += duration / (1000 * 60 * 60 * 24) // Convert to days
      }
    }
    const averageDuration = totalRentals > 0 ? totalDuration / totalRentals : 0

    // Find current tenant (active contract)
    const activeContract = contracts.find((c) => c.status === 'active')
    let currentTenant: RentalStats['currentTenant']
    if (activeContract) {
      const tenant = await this.deps.userDao.findById(activeContract.tenantId)
      if (tenant) {
        currentTenant = {
          id: tenant.id,
          username: tenant.username,
          displayName: tenant.displayName ?? tenant.username,
        }
      }
    }

    return {
      totalRentals,
      totalIncome,
      averageDuration,
      currentTenant,
    }
  }

  private buildActivityHeatmap(
    dailyStats: { date: string; messageCount: number }[],
  ): ActivityHeatmapItem[] {
    const statsMap = new Map(dailyStats.map((s) => [s.date, s.messageCount]))

    // Generate last 365 days
    const result: ActivityHeatmapItem[] = []
    const today = new Date()

    for (let i = DASHBOARD_CONSTANTS.HEATMAP_DAYS - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = getDateString(date)
      const count = statsMap.get(dateStr) ?? 0

      // Calculate level based on message count
      const level = calculateActivityLevel(count)
      result.push({ date: dateStr, messageCount: count, level })
    }

    return result
  }

  private buildWeeklyActivity(
    dailyStats: { date: string; messageCount: number }[],
    _since: Date,
  ): WeeklyActivityItem[] {
    const statsMap = new Map(dailyStats.map((s) => [s.date, s.messageCount]))
    const result: WeeklyActivityItem[] = []

    for (let i = DASHBOARD_CONSTANTS.WEEKLY_DAYS - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = getDateString(date)
      result.push({
        date: dateStr,
        messageCount: statsMap.get(dateStr) ?? 0,
      })
    }

    return result
  }

  private buildHourlyDistribution(
    hourlyStats: { hourOfDay: number; messageCount: number }[],
  ): HourlyDistributionItem[] {
    // Initialize all 24 hours with 0
    const result: HourlyDistributionItem[] = []
    const statsMap = new Map(hourlyStats.map((s) => [s.hourOfDay, s.messageCount]))

    for (let hour = 0; hour < 24; hour++) {
      result.push({
        hour,
        messageCount: statsMap.get(hour) ?? 0,
      })
    }

    return result
  }

  private buildMonthlyTrend(
    dailyStats: { date: string; messageCount: number }[],
    _since: Date,
  ): MonthlyTrendItem[] {
    const monthlyMap = new Map<string, number>()

    for (const stat of dailyStats) {
      const month = stat.date.substring(0, 7) // YYYY-MM
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + stat.messageCount)
    }

    // Generate last N months
    const result: MonthlyTrendItem[] = []
    const today = new Date()

    for (let i = DASHBOARD_CONSTANTS.MONTHLY_MONTHS - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const monthStr = date.toISOString().substring(0, 7)
      result.push({
        month: monthStr,
        messageCount: monthlyMap.get(monthStr) ?? 0,
      })
    }

    return result
  }
}
