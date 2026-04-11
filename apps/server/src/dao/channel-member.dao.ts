import { and, eq, inArray } from 'drizzle-orm'
import type { Database } from '../db'
import { channelMembers } from '../db/schema'

export class ChannelMemberDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  /** Add a user to a channel. Returns the new record or null if already exists. */
  async add(channelId: string, userId: string) {
    const result = await this.db
      .insert(channelMembers)
      .values({ channelId, userId })
      .onConflictDoNothing()
      .returning()
    return result[0] ?? (await this.get(channelId, userId))
  }

  /** Remove a user from a channel. */
  async remove(channelId: string, userId: string) {
    await this.db
      .delete(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
  }

  /** Get a single membership record. */
  async get(channelId: string, userId: string) {
    const result = await this.db
      .select()
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  /** Get all channel IDs a user belongs to within a set of channel IDs. */
  async getUserChannelIds(userId: string, channelIds: string[]) {
    if (channelIds.length === 0) return []
    const rows = await this.db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(and(eq(channelMembers.userId, userId), inArray(channelMembers.channelId, channelIds)))
    return rows.map((r) => r.channelId)
  }

  /** Add a user to multiple channels at once. */
  async addBulk(channelIds: string[], userId: string) {
    if (channelIds.length === 0) return
    const values = channelIds.map((channelId) => ({ channelId, userId }))
    await this.db.insert(channelMembers).values(values).onConflictDoNothing()
  }

  /** Get all user IDs in a channel. */
  async getMembers(channelId: string) {
    return this.db
      .select({ userId: channelMembers.userId, joinedAt: channelMembers.joinedAt })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channelId))
  }

  /** Get all channel IDs a user belongs to. */
  async getAllChannelIds(userId: string) {
    const rows = await this.db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, userId))
    return rows.map((r) => r.channelId)
  }

  /** Remove all members from a channel. */
  async removeAll(channelId: string) {
    await this.db.delete(channelMembers).where(eq(channelMembers.channelId, channelId))
  }
}
