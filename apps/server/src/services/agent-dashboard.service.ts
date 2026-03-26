import type { Logger } from 'pino'
import type { AgentDashboardDao } from '../dao/agent-dashboard.dao'
import type { AgentDao } from '../dao/agent.dao'
import type { RentalContractDao } from '../dao/rental-contract.dao'

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
      logger: Logger
    }
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
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

    // Fetch all data in parallel
    const [
      dailyStats,
      hourlyStats,
      totalMessages,
      activeDays30d,
      streaks,
      recentEvents,
    ] = await Promise.all([
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
    const today = new Date().toISOString().split('T')[0]
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
    const today = new Date().toISOString().split('T')[0]
    await this.deps.agentDashboardDao.upsertDailyStats(agentId, today, { onlineSeconds: seconds })
  }

  /**
   * Add an activity event
   */
  async addEvent(
    agentId: string,
    eventType: string,
    eventData: Record<string, unknown> = {}
  ): Promise<void> {
    await this.deps.agentDashboardDao.createEvent(agentId, eventType, eventData)
  }

  /**
   * Clean up old events (keep last 90 days)
   */
  async cleanupOldEvents(): Promise<void> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)
    await this.deps.agentDashboardDao.deleteOldEvents(cutoffDate)
    this.deps.logger.info({ cutoffDate }, 'Cleaned up old agent activity events')
  }

  /* ───────────── Private Helpers ───────────── */

  private async checkIsTenant(agentId: string, userId: string): Promise<boolean> {
    // Check if user has an active rental contract for this agent
    const contracts = await this.deps.rentalContractDao.findByTenantId(userId, { status: 'active' })
    // Need to check if any contract's listing is for this agent
    // This is a simplified check - in production, you'd join with listings
    return false // TODO: Implement proper tenant check
  }

  private async getRentalStats(agentId: string): Promise<RentalStats> {
    // Get all contracts where this agent was rented
    // This requires joining with clawListings to find by agentId
    // For now, return placeholder data
    return {
      totalRentals: 0,
      totalIncome: 0,
      averageDuration: 0,
    }
  }

  private buildActivityHeatmap(
    dailyStats: { date: string; messageCount: number }[]
  ): ActivityHeatmapItem[] {
    const statsMap = new Map(dailyStats.map((s) => [s.date, s.messageCount]))

    // Generate last 365 days
    const result: ActivityHeatmapItem[] = []
    const today = new Date()

    for (let i = 364; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const count = statsMap.get(dateStr) ?? 0

      // Calculate level based on message count
      let level: 0 | 1 | 2 | 3 | 4 = 0
      if (count >= 100) level = 4
      else if (count >= 51) level = 3
      else if (count >= 11) level = 2
      else if (count >= 1) level = 1

      result.push({ date: dateStr, messageCount: count, level })
    }

    return result
  }

  private buildWeeklyActivity(
    dailyStats: { date: string; messageCount: number }[],
    since: Date
  ): WeeklyActivityItem[] {
    const statsMap = new Map(dailyStats.map((s) => [s.date, s.messageCount]))
    const result: WeeklyActivityItem[] = []

    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      result.push({
        date: dateStr,
        messageCount: statsMap.get(dateStr) ?? 0,
      })
    }

    return result
  }

  private buildHourlyDistribution(
    hourlyStats: { hourOfDay: number; messageCount: number }[]
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
    since: Date
  ): MonthlyTrendItem[] {
    const monthlyMap = new Map<string, number>()

    for (const stat of dailyStats) {
      const month = stat.date.substring(0, 7) // YYYY-MM
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + stat.messageCount)
    }

    // Generate last 12 months
    const result: MonthlyTrendItem[] = []
    const today = new Date()

    for (let i = 11; i >= 0; i--) {
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