import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { entitlements } from '../db/schema'

export class EntitlementDao {
  constructor(private deps: { db: Database }) {}
  private get db() { return this.deps.db }

  async findActiveByUser(userId: string, serverId: string) {
    return this.db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          eq(entitlements.serverId, serverId),
          eq(entitlements.isActive, true),
          sql`(${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > NOW())`,
        ),
      )
  }

  async hasEntitlement(userId: string, serverId: string, type: string, targetId: string) {
    const r = await this.db
      .select({ id: entitlements.id })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.userId, userId),
          eq(entitlements.serverId, serverId),
          eq(entitlements.type, type as typeof entitlements.type.enumValues[number]),
          eq(entitlements.targetId, targetId),
          eq(entitlements.isActive, true),
          sql`(${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > NOW())`,
        ),
      )
      .limit(1)
    return r.length > 0
  }

  async create(data: {
    userId: string
    serverId: string
    orderId?: string
    productId?: string
    type: 'channel_access' | 'channel_speak' | 'app_access' | 'custom_role' | 'custom'
    targetId?: string
    expiresAt?: Date
  }) {
    const r = await this.db.insert(entitlements).values(data).returning()
    return r[0] ?? null
  }

  async revoke(id: string) {
    const r = await this.db.update(entitlements).set({ isActive: false }).where(eq(entitlements.id, id)).returning()
    return r[0] ?? null
  }

  async revokeByOrder(orderId: string) {
    await this.db.update(entitlements).set({ isActive: false }).where(eq(entitlements.orderId, orderId))
  }
}
