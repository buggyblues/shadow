import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { inviteCodes, users } from '../db/schema'

export class InviteCodeDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async create(data: { code: string; createdBy: string; note?: string }) {
    const result = await this.db
      .insert(inviteCodes)
      .values({
        code: data.code,
        createdBy: data.createdBy,
        note: data.note,
      })
      .returning()
    return result[0]
  }

  async findByCode(code: string) {
    const result = await this.db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, code))
      .limit(1)
    return result[0] ?? null
  }

  async findByUsedBy(userId: string) {
    const result = await this.db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.usedBy, userId))
      .limit(1)
    return result[0] ?? null
  }

  async findAvailable(code: string) {
    const result = await this.db
      .select()
      .from(inviteCodes)
      .where(
        and(eq(inviteCodes.code, code), eq(inviteCodes.isActive, true), isNull(inviteCodes.usedBy)),
      )
      .limit(1)
    return result[0] ?? null
  }

  async markUsed(id: string, userId: string) {
    const result = await this.db
      .update(inviteCodes)
      .set({ usedBy: userId, usedAt: new Date(), isActive: false })
      .where(eq(inviteCodes.id, id))
      .returning()
    return result[0] ?? null
  }

  async deactivate(id: string) {
    const result = await this.db
      .update(inviteCodes)
      .set({ isActive: false })
      .where(eq(inviteCodes.id, id))
      .returning()
    return result[0] ?? null
  }

  async findAll(limit = 50, offset = 0) {
    const rows = await this.db
      .select({
        inviteCode: inviteCodes,
        createdByUser: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
        },
      })
      .from(inviteCodes)
      .leftJoin(users, eq(inviteCodes.createdBy, users.id))
      .orderBy(sql`${inviteCodes.createdAt} DESC`)
      .limit(limit)
      .offset(offset)

    return rows.map((r) => ({
      ...r.inviteCode,
      createdByUser: r.createdByUser,
    }))
  }

  async count() {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(inviteCodes)
    return Number(result[0]?.count ?? 0)
  }

  async countUsed() {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(inviteCodes)
      .where(sql`${inviteCodes.usedBy} IS NOT NULL`)
    return Number(result[0]?.count ?? 0)
  }

  async delete(id: string) {
    await this.db.delete(inviteCodes).where(eq(inviteCodes.id, id))
  }

  /** Scoped delete by serverId and code value */
  async deleteByServerIdAndCode(serverId: string, code: string) {
    await this.db
      .delete(inviteCodes)
      .where(and(eq(inviteCodes.createdBy, serverId), eq(inviteCodes.code, code)))
  }

  /** Find all invite codes created by a specific user, with used-by user info */
  async findByCreator(userId: string, limit = 50, offset = 0) {
    const usedByUser = {
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    }

    // Self-join: get usedBy user info
    const rows = await this.db
      .select({
        inviteCode: inviteCodes,
        usedByUser: usedByUser,
      })
      .from(inviteCodes)
      .leftJoin(users, eq(inviteCodes.usedBy, users.id))
      .where(eq(inviteCodes.createdBy, userId))
      .orderBy(sql`${inviteCodes.createdAt} DESC`)
      .limit(limit)
      .offset(offset)

    return rows.map((r) => ({
      ...r.inviteCode,
      usedByUser: r.usedByUser?.id ? r.usedByUser : null,
    }))
  }
}
