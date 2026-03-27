import { and, desc, eq, gte, lte, type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { agentActivityEvents, agentDailyStats, agentHourlyStats } from '../db/schema'

function getDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export class AgentDashboardDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  /* ───────────── Daily Stats ───────────── */

  async findDailyStats(agentId: string, startDate: Date, endDate: Date) {
    return this.db
      .select()
      .from(agentDailyStats)
      .where(
        and(
          eq(agentDailyStats.agentId, agentId),
          gte(agentDailyStats.date, getDateString(startDate)),
          lte(agentDailyStats.date, getDateString(endDate)),
        ),
      )
      .orderBy(agentDailyStats.date)
  }

  async upsertDailyStats(
    agentId: string,
    date: string,
    data: { messageCount?: number; onlineSeconds?: number },
  ) {
    const existing = await this.db
      .select()
      .from(agentDailyStats)
      .where(and(eq(agentDailyStats.agentId, agentId), eq(agentDailyStats.date, date)))
      .limit(1)

    if (existing.length > 0) {
      // Update existing
      const updates: Record<string, SQL | number> = { updatedAt: sql`NOW()` }
      if (data.messageCount !== undefined) {
        updates.messageCount = sql`${agentDailyStats.messageCount} + ${data.messageCount}`
      }
      if (data.onlineSeconds !== undefined) {
        updates.onlineSeconds = sql`${agentDailyStats.onlineSeconds} + ${data.onlineSeconds}`
      }

      const result = await this.db
        .update(agentDailyStats)
        .set(updates)
        .where(eq(agentDailyStats.id, existing[0].id))
        .returning()
      return result[0]
    }

    // Insert new
    const result = await this.db
      .insert(agentDailyStats)
      .values({
        agentId,
        date,
        messageCount: data.messageCount ?? 0,
        onlineSeconds: data.onlineSeconds ?? 0,
      })
      .returning()
    return result[0]
  }

  async incrementMessageCount(agentId: string, date: string) {
    return this.upsertDailyStats(agentId, date, { messageCount: 1 })
  }

  async getTotalMessages(agentId: string) {
    const result = await this.db
      .select({ total: sql<number>`SUM(${agentDailyStats.messageCount})` })
      .from(agentDailyStats)
      .where(eq(agentDailyStats.agentId, agentId))
    return result[0]?.total ?? 0
  }

  async getActiveDaysCount(agentId: string, days: number) {
    const since = new Date()
    since.setDate(since.getDate() - days)

    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(agentDailyStats)
      .where(
        and(
          eq(agentDailyStats.agentId, agentId),
          gte(agentDailyStats.date, getDateString(since)),
          sql`${agentDailyStats.messageCount} > 0`,
        ),
      )
    return result[0]?.count ?? 0
  }

  /* ───────────── Hourly Stats ───────────── */

  async findHourlyStats(agentId: string) {
    return this.db
      .select()
      .from(agentHourlyStats)
      .where(eq(agentHourlyStats.agentId, agentId))
      .orderBy(agentHourlyStats.hourOfDay)
  }

  async upsertHourlyStats(
    agentId: string,
    hourOfDay: number,
    data: { messageCount?: number; activityCount?: number },
  ) {
    const existing = await this.db
      .select()
      .from(agentHourlyStats)
      .where(and(eq(agentHourlyStats.agentId, agentId), eq(agentHourlyStats.hourOfDay, hourOfDay)))
      .limit(1)

    if (existing.length > 0) {
      const updates: Record<string, SQL | number> = { updatedAt: sql`NOW()` }
      if (data.messageCount !== undefined) {
        updates.messageCount = sql`${agentHourlyStats.messageCount} + ${data.messageCount}`
      }
      if (data.activityCount !== undefined) {
        updates.activityCount = sql`${agentHourlyStats.activityCount} + ${data.activityCount}`
      }

      const result = await this.db
        .update(agentHourlyStats)
        .set(updates)
        .where(eq(agentHourlyStats.id, existing[0].id))
        .returning()
      return result[0]
    }

    const result = await this.db
      .insert(agentHourlyStats)
      .values({
        agentId,
        hourOfDay,
        messageCount: data.messageCount ?? 0,
        activityCount: data.activityCount ?? 0,
      })
      .returning()
    return result[0]
  }

  async incrementHourlyMessage(agentId: string, hourOfDay: number) {
    return this.upsertHourlyStats(agentId, hourOfDay, { messageCount: 1, activityCount: 1 })
  }

  /* ───────────── Activity Events ───────────── */

  async createEvent(agentId: string, eventType: string, eventData: Record<string, unknown> = {}) {
    const result = await this.db
      .insert(agentActivityEvents)
      .values({
        agentId,
        eventType,
        eventData,
      })
      .returning()
    return result[0]
  }

  async findRecentEvents(agentId: string, limit = 10) {
    return this.db
      .select()
      .from(agentActivityEvents)
      .where(eq(agentActivityEvents.agentId, agentId))
      .orderBy(desc(agentActivityEvents.createdAt))
      .limit(limit)
  }

  async deleteOldEvents(beforeDate: Date) {
    await this.db.delete(agentActivityEvents).where(lte(agentActivityEvents.createdAt, beforeDate))
  }

  /* ───────────── Streak Calculation ───────────── */

  async calculateStreaks(agentId: string): Promise<{ current: number; longest: number }> {
    // Get all daily stats ordered by date
    const stats = await this.db
      .select({ date: agentDailyStats.date, messageCount: agentDailyStats.messageCount })
      .from(agentDailyStats)
      .where(eq(agentDailyStats.agentId, agentId))
      .orderBy(desc(agentDailyStats.date))

    if (stats.length === 0) {
      return { current: 0, longest: 0 }
    }

    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    let prevDate: Date | null = null

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Check if today or yesterday has activity for current streak
    const mostRecent = new Date(stats[0].date)
    mostRecent.setHours(0, 0, 0, 0)
    const daysSinceLastActivity = Math.floor(
      (today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24),
    )

    for (const stat of stats) {
      if (stat.messageCount === 0) continue

      const currentDate = new Date(stat.date)
      currentDate.setHours(0, 0, 0, 0)

      if (prevDate === null) {
        tempStreak = 1
      } else {
        const diffDays = Math.floor(
          (prevDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
        )
        if (diffDays === 1) {
          tempStreak++
        } else {
          longestStreak = Math.max(longestStreak, tempStreak)
          tempStreak = 1
        }
      }

      prevDate = currentDate
    }

    longestStreak = Math.max(longestStreak, tempStreak)

    // Current streak is only valid if last activity was today or yesterday
    if (daysSinceLastActivity <= 1) {
      currentStreak = tempStreak
    } else {
      currentStreak = 0
    }

    return { current: currentStreak, longest: longestStreak }
  }
}
