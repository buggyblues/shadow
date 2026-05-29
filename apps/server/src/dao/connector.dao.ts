import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import type { Database } from '../db'
import { type ConnectorRuntimeInfo, connectorComputers, connectorJobs } from '../db/schema'

export class ConnectorDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async createComputer(data: { userId: string; name: string; tokenHash: string }) {
    const result = await this.db
      .insert(connectorComputers)
      .values({
        userId: data.userId,
        name: data.name,
        tokenHash: data.tokenHash,
      })
      .returning()
    return result[0] ?? null
  }

  async findComputerByTokenHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(eq(connectorComputers.tokenHash, tokenHash))
      .limit(1)
    return result[0] ?? null
  }

  async findComputerForUser(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(and(eq(connectorComputers.id, id), eq(connectorComputers.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async findPendingComputerForUser(userId: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(and(eq(connectorComputers.userId, userId), isNull(connectorComputers.lastSeenAt)))
      .orderBy(asc(connectorComputers.createdAt))
      .limit(1)
    return result[0] ?? null
  }

  async resetComputerToken(id: string, userId: string, data: { name: string; tokenHash: string }) {
    const result = await this.db
      .update(connectorComputers)
      .set({
        name: data.name,
        tokenHash: data.tokenHash,
        updatedAt: new Date(),
      })
      .where(and(eq(connectorComputers.id, id), eq(connectorComputers.userId, userId)))
      .returning()
    return result[0] ?? null
  }

  async deletePendingComputersForUserExcept(userId: string, keepId: string) {
    await this.db
      .delete(connectorComputers)
      .where(
        and(
          eq(connectorComputers.userId, userId),
          isNull(connectorComputers.lastSeenAt),
          ne(connectorComputers.id, keepId),
        ),
      )
  }

  async listComputers(userId: string) {
    return this.db
      .select()
      .from(connectorComputers)
      .where(eq(connectorComputers.userId, userId))
      .orderBy(asc(connectorComputers.createdAt))
  }

  async updateComputerHeartbeat(
    id: string,
    data: {
      hostname?: string | null
      os?: string | null
      arch?: string | null
      daemonVersion?: string | null
      runtimes: ConnectorRuntimeInfo[]
    },
  ) {
    const result = await this.db
      .update(connectorComputers)
      .set({
        hostname: data.hostname ?? null,
        os: data.os ?? null,
        arch: data.arch ?? null,
        daemonVersion: data.daemonVersion ?? null,
        runtimes: data.runtimes,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(connectorComputers.id, id))
      .returning()
    return result[0] ?? null
  }

  async createJob(data: {
    userId: string
    computerId: string
    agentId: string
    type: string
    payloadEncrypted: string
  }) {
    const result = await this.db
      .insert(connectorJobs)
      .values({
        userId: data.userId,
        computerId: data.computerId,
        agentId: data.agentId,
        type: data.type,
        payloadEncrypted: data.payloadEncrypted,
      })
      .returning()
    return result[0] ?? null
  }

  async findJobForUser(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(connectorJobs)
      .where(and(eq(connectorJobs.id, id), eq(connectorJobs.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async claimPendingJobs(computerId: string, limit = 5) {
    const pending = await this.db
      .select()
      .from(connectorJobs)
      .where(and(eq(connectorJobs.computerId, computerId), eq(connectorJobs.status, 'pending')))
      .orderBy(asc(connectorJobs.createdAt))
      .limit(limit)

    if (pending.length === 0) return []

    const ids = pending.map((job) => job.id)
    return this.db
      .update(connectorJobs)
      .set({ status: 'running', claimedAt: new Date(), updatedAt: new Date() })
      .where(inArray(connectorJobs.id, ids))
      .returning()
  }

  async updateJobForComputer(
    id: string,
    computerId: string,
    data: {
      status: 'completed' | 'failed'
      result?: Record<string, unknown> | null
      error?: string | null
    },
  ) {
    const result = await this.db
      .update(connectorJobs)
      .set({
        status: data.status,
        result: data.result ?? null,
        error: data.error ?? null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(connectorJobs.id, id), eq(connectorJobs.computerId, computerId)))
      .returning()
    return result[0] ?? null
  }
}
