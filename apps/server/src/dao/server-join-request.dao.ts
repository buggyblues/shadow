import { and, eq } from 'drizzle-orm'
import type { Database } from '../db'
import { serverJoinRequests } from '../db/schema'

export type ServerJoinRequestStatus = 'pending' | 'approved' | 'rejected'

export class ServerJoinRequestDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(serverJoinRequests)
      .where(eq(serverJoinRequests.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async findByServerAndUser(serverId: string, userId: string) {
    const result = await this.db
      .select()
      .from(serverJoinRequests)
      .where(and(eq(serverJoinRequests.serverId, serverId), eq(serverJoinRequests.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async request(serverId: string, userId: string) {
    const now = new Date()
    const result = await this.db
      .insert(serverJoinRequests)
      .values({
        serverId,
        userId,
        status: 'pending',
        requestedAt: now,
        reviewedAt: null,
        reviewedBy: null,
      })
      .onConflictDoUpdate({
        target: [serverJoinRequests.serverId, serverJoinRequests.userId],
        set: {
          status: 'pending',
          requestedAt: now,
          reviewedAt: null,
          reviewedBy: null,
        },
      })
      .returning()
    return result[0]!
  }

  async review(
    id: string,
    status: Exclude<ServerJoinRequestStatus, 'pending'>,
    reviewerId: string,
  ) {
    const result = await this.db
      .update(serverJoinRequests)
      .set({
        status,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      })
      .where(eq(serverJoinRequests.id, id))
      .returning()
    return result[0] ?? null
  }
}
