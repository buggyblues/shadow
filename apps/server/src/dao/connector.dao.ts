import { createHash } from 'node:crypto'
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  agentComputerPlacements,
  agents,
  type ConnectorRuntimeInfo,
  connectorComputers,
  connectorJobs,
  users,
} from '../db/schema'

export class ConnectorDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async createComputer(data: {
    userId: string
    name: string
    tokenHash: string
    installationId?: string | null
    deviceFingerprint?: string | null
  }) {
    const result = await this.db
      .insert(connectorComputers)
      .values({
        userId: data.userId,
        name: data.name,
        tokenHash: data.tokenHash,
        installationId: data.installationId ?? null,
        deviceFingerprint: data.deviceFingerprint ?? null,
      })
      .returning()
    return result[0] ?? null
  }

  async findComputerByTokenHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(and(eq(connectorComputers.tokenHash, tokenHash), isNull(connectorComputers.revokedAt)))
      .limit(1)
    return result[0] ?? null
  }

  async findComputerById(id: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(eq(connectorComputers.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async findComputerForUser(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(
        and(
          eq(connectorComputers.id, id),
          eq(connectorComputers.userId, userId),
          isNull(connectorComputers.revokedAt),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  async findComputerByInstallation(userId: string, installationId: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(
        and(
          eq(connectorComputers.userId, userId),
          eq(connectorComputers.installationId, installationId),
          isNull(connectorComputers.revokedAt),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  async findComputerByDeviceFingerprint(userId: string, deviceFingerprint: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(
        and(
          eq(connectorComputers.userId, userId),
          eq(connectorComputers.deviceFingerprint, deviceFingerprint),
          isNull(connectorComputers.revokedAt),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  async findPendingComputerForUser(userId: string) {
    const result = await this.db
      .select()
      .from(connectorComputers)
      .where(
        and(
          eq(connectorComputers.userId, userId),
          isNull(connectorComputers.lastSeenAt),
          isNull(connectorComputers.revokedAt),
        ),
      )
      .orderBy(asc(connectorComputers.createdAt))
      .limit(1)
    return result[0] ?? null
  }

  async resetComputerToken(
    id: string,
    userId: string,
    data: {
      name: string
      tokenHash: string
      installationId?: string | null
      deviceFingerprint?: string | null
    },
  ) {
    const result = await this.db
      .update(connectorComputers)
      .set({
        name: data.name,
        tokenHash: data.tokenHash,
        ...(data.installationId ? { installationId: data.installationId } : {}),
        ...(data.deviceFingerprint ? { deviceFingerprint: data.deviceFingerprint } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(connectorComputers.id, id),
          eq(connectorComputers.userId, userId),
          isNull(connectorComputers.revokedAt),
        ),
      )
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
      .where(and(eq(connectorComputers.userId, userId), isNull(connectorComputers.revokedAt)))
      .orderBy(asc(connectorComputers.createdAt))
  }

  async updateComputerHeartbeat(
    id: string,
    data: {
      hostname?: string | null
      os?: string | null
      osVersion?: string | null
      arch?: string | null
      deviceClass?: string | null
      deviceVendor?: string | null
      deviceModel?: string | null
      daemonVersion?: string | null
      capabilities?: string[]
      runtimes: ConnectorRuntimeInfo[]
      deviceFingerprint?: string | null
    },
  ) {
    const result = await this.db
      .update(connectorComputers)
      .set({
        hostname: data.hostname ?? null,
        os: data.os ?? null,
        osVersion: data.osVersion ?? null,
        arch: data.arch ?? null,
        deviceClass: data.deviceClass?.trim() || 'unknown',
        deviceVendor: data.deviceVendor ?? null,
        deviceModel: data.deviceModel ?? null,
        daemonVersion: data.daemonVersion ?? null,
        capabilities: data.capabilities ?? [],
        runtimes: data.runtimes,
        ...(data.deviceFingerprint ? { deviceFingerprint: data.deviceFingerprint } : {}),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(connectorComputers.id, id))
      .returning()
    return result[0] ?? null
  }

  async reconcileComputerDeviceFingerprint(id: string, deviceFingerprint: string) {
    return this.db.transaction(async (tx) => {
      const currentRows = await tx
        .select()
        .from(connectorComputers)
        .where(and(eq(connectorComputers.id, id), isNull(connectorComputers.revokedAt)))
        .limit(1)
      const current = currentRows[0]
      if (!current) return null
      if (current.deviceFingerprint === deviceFingerprint) return current

      const canonicalRows = await tx
        .select()
        .from(connectorComputers)
        .where(
          and(
            eq(connectorComputers.userId, current.userId),
            eq(connectorComputers.deviceFingerprint, deviceFingerprint),
            isNull(connectorComputers.revokedAt),
          ),
        )
        .limit(1)
      const canonical = canonicalRows[0]
      if (!canonical) {
        const updated = await tx
          .update(connectorComputers)
          .set({ deviceFingerprint, updatedAt: new Date() })
          .where(eq(connectorComputers.id, current.id))
          .returning()
        return updated[0] ?? null
      }

      await tx
        .update(agentComputerPlacements)
        .set({ localComputerId: canonical.id, updatedAt: new Date() })
        .where(eq(agentComputerPlacements.localComputerId, current.id))
      await tx
        .update(connectorJobs)
        .set({ computerId: canonical.id, updatedAt: new Date() })
        .where(eq(connectorJobs.computerId, current.id))
      await tx
        .update(agents)
        .set({
          config: sql`jsonb_set(COALESCE(${agents.config}, '{}'::jsonb), '{connectorComputerId}', to_jsonb(${canonical.id}::text), true)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agents.ownerId, current.userId),
            sql`${agents.config} ->> 'connectorComputerId' = ${current.id}`,
          ),
        )

      const retiredTokenHash = createHash('sha256')
        .update(`merged:${current.id}:${current.tokenHash}:${Date.now()}`)
        .digest('hex')
      await tx
        .update(connectorComputers)
        .set({
          tokenHash: retiredTokenHash,
          installationId: null,
          deviceFingerprint: null,
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(connectorComputers.id, current.id))

      const updatedCanonical = await tx
        .update(connectorComputers)
        .set({
          tokenHash: current.tokenHash,
          installationId: current.installationId ?? canonical.installationId,
          deviceFingerprint,
          updatedAt: new Date(),
        })
        .where(eq(connectorComputers.id, canonical.id))
        .returning()
      return updatedCanonical[0] ?? null
    })
  }

  async updateComputerName(id: string, userId: string, name: string) {
    const result = await this.db
      .update(connectorComputers)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(connectorComputers.id, id),
          eq(connectorComputers.userId, userId),
          isNull(connectorComputers.revokedAt),
        ),
      )
      .returning()
    return result[0] ?? null
  }

  async revokeComputer(id: string, userId: string) {
    const result = await this.db
      .update(connectorComputers)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(connectorComputers.id, id),
          eq(connectorComputers.userId, userId),
          isNull(connectorComputers.revokedAt),
        ),
      )
      .returning()
    return result[0] ?? null
  }

  async upsertLocalPlacement(data: {
    userId: string
    agentId: string
    computerId: string
    runtimeId: string
    runtimeLabel?: string | null
    workDir?: string | null
    status?: string
  }) {
    const values = {
      userId: data.userId,
      agentId: data.agentId,
      computerKind: 'local',
      localComputerId: data.computerId,
      cloudComputerId: null,
      runtimeId: data.runtimeId,
      runtimeLabel: data.runtimeLabel ?? null,
      workDir: data.workDir ?? null,
      status: data.status ?? 'configured',
      updatedAt: new Date(),
    }
    const result = await this.db
      .insert(agentComputerPlacements)
      .values(values)
      .onConflictDoUpdate({
        target: agentComputerPlacements.agentId,
        set: values,
      })
      .returning()
    return result[0] ?? null
  }

  async deletePlacement(agentId: string, userId: string) {
    await this.db
      .delete(agentComputerPlacements)
      .where(
        and(
          eq(agentComputerPlacements.agentId, agentId),
          eq(agentComputerPlacements.userId, userId),
        ),
      )
  }

  async updatePlacementStatus(
    agentId: string,
    status: 'configured' | 'error',
    lastError: string | null,
  ) {
    const result = await this.db
      .update(agentComputerPlacements)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(agentComputerPlacements.agentId, agentId))
      .returning()
    return result[0] ?? null
  }

  async deletePlacementsForComputer(computerId: string, userId: string) {
    await this.db
      .delete(agentComputerPlacements)
      .where(
        and(
          eq(agentComputerPlacements.localComputerId, computerId),
          eq(agentComputerPlacements.userId, userId),
        ),
      )
  }

  async listPlacementsForUser(userId: string) {
    return this.db
      .select()
      .from(agentComputerPlacements)
      .where(eq(agentComputerPlacements.userId, userId))
      .orderBy(asc(agentComputerPlacements.createdAt))
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

  async listConnectorAgentsForComputer(computerId: string) {
    return this.db
      .select({ agent: agents, botUser: users, placement: agentComputerPlacements })
      .from(agentComputerPlacements)
      .innerJoin(agents, eq(agents.id, agentComputerPlacements.agentId))
      .innerJoin(users, eq(users.id, agents.userId))
      .where(eq(agentComputerPlacements.localComputerId, computerId))
      .orderBy(asc(agents.createdAt))
  }

  async hasRecentConfigureJob(computerId: string, agentId: string, since: Date) {
    const result = await this.db
      .select({ id: connectorJobs.id })
      .from(connectorJobs)
      .where(
        and(
          eq(connectorJobs.computerId, computerId),
          eq(connectorJobs.agentId, agentId),
          eq(connectorJobs.type, 'configure-buddy'),
          or(
            inArray(connectorJobs.status, ['pending', 'running']),
            and(eq(connectorJobs.status, 'completed'), gt(connectorJobs.completedAt, since)),
          ),
        ),
      )
      .limit(1)
    return result.length > 0
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
