import { and, eq, or } from 'drizzle-orm'
import type { Database } from '../db'
import { friendships } from '../db/schema'

export class FriendshipDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  /** Find a friendship between two users (regardless of direction) */
  async findBetween(userAId: string, userBId: string) {
    const result = await this.db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, userAId), eq(friendships.addresseeId, userBId)),
          and(eq(friendships.requesterId, userBId), eq(friendships.addresseeId, userAId)),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  /** Create a friend request */
  async create(requesterId: string, addresseeId: string) {
    const result = await this.db
      .insert(friendships)
      .values({ requesterId, addresseeId, status: 'pending' })
      .returning()
    return result[0]
  }

  /** Accept a friend request */
  async accept(id: string) {
    const result = await this.db
      .update(friendships)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(friendships.id, id))
      .returning()
    return result[0] ?? null
  }

  /** Get all accepted friends for a user */
  async getFriends(userId: string) {
    return this.db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.status, 'accepted'),
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        ),
      )
  }

  /** Get pending requests received by a user */
  async getPendingReceived(userId: string) {
    return this.db
      .select()
      .from(friendships)
      .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending')))
  }

  /** Scoped delete by userId and friendship id */
  async deleteByUserIdAndId(userId: string, id: string) {
    await this.db
      .delete(friendships)
      .where(
        and(
          eq(friendships.id, id),
          or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
        ),
      )
  }

  /** Get pending requests sent by a user */
  async getPendingSent(userId: string) {
    return this.db
      .select()
      .from(friendships)
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, 'pending')))
  }

  async findById(id: string) {
    const result = await this.db.select().from(friendships).where(eq(friendships.id, id)).limit(1)
    return result[0] ?? null
  }
}
