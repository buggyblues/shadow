import { desc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { passwordChangeLogs } from '../db/schema'

export class PasswordChangeLogDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async create(data: {
    userId: string
    ipAddress?: string
    userAgent?: string
    success: boolean
    failureReason?: string
  }) {
    const result = await this.db
      .insert(passwordChangeLogs)
      .values({
        userId: data.userId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        success: data.success,
        failureReason: data.failureReason,
      })
      .returning()
    return result[0]
  }

  async findByUserId(userId: string, limit = 50, offset = 0) {
    return this.db
      .select()
      .from(passwordChangeLogs)
      .where(eq(passwordChangeLogs.userId, userId))
      .orderBy(desc(passwordChangeLogs.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async findAll(limit = 50, offset = 0) {
    return this.db
      .select()
      .from(passwordChangeLogs)
      .orderBy(desc(passwordChangeLogs.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async count() {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(passwordChangeLogs)
    return Number(result[0]?.count ?? 0)
  }

  async countByUserId(userId: string) {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(passwordChangeLogs)
      .where(eq(passwordChangeLogs.userId, userId))
    return Number(result[0]?.count ?? 0)
  }
}