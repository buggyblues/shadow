import { and, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  cloudAppInstances,
  cloudAppReleases,
  cloudBackupComponents,
  cloudBackupPolicies,
  cloudBackupSets,
  cloudExposureEvents,
  cloudExposures,
  cloudRestoreJobs,
} from '../db/schema'

type CloudExposureInsert = typeof cloudExposures.$inferInsert
type CloudAppInstanceInsert = typeof cloudAppInstances.$inferInsert
type CloudAppReleaseInsert = typeof cloudAppReleases.$inferInsert
type CloudBackupSetInsert = typeof cloudBackupSets.$inferInsert
type CloudBackupComponentInsert = typeof cloudBackupComponents.$inferInsert
type CloudRestoreJobInsert = typeof cloudRestoreJobs.$inferInsert

export class CloudExposureDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async upsertExposure(data: CloudExposureInsert) {
    const rows = await this.db
      .insert(cloudExposures)
      .values(data)
      .onConflictDoUpdate({
        target: [cloudExposures.deploymentId, cloudExposures.agentId, cloudExposures.localId],
        set: {
          serverId: data.serverId ?? null,
          appInstanceId: data.appInstanceId ?? null,
          appReleaseId: data.appReleaseId ?? null,
          source: data.source ?? 'runtime',
          exposureKind: data.exposureKind ?? 'http_service',
          releaseMode: data.releaseMode ?? 'preview',
          visibility: data.visibility ?? 'private',
          authMode: data.authMode ?? 'shadow_session',
          status: data.status ?? 'active',
          host: data.host,
          stableHost: data.stableHost ?? null,
          publicBaseUrl: data.publicBaseUrl,
          manifestUrl: data.manifestUrl ?? null,
          targetNamespace: data.targetNamespace,
          targetWorkload: data.targetWorkload ?? null,
          targetServiceName: data.targetServiceName ?? null,
          targetPort: data.targetPort,
          health: data.health ?? null,
          policy: data.policy ?? {},
          dynamicConfig: data.dynamicConfig ?? {},
          lastReconciledAt: new Date(),
          lastHeartbeatAt: data.lastHeartbeatAt ?? new Date(),
          leaseExpiresAt: data.leaseExpiresAt ?? null,
          closedAt: data.closedAt ?? null,
          closeReason: data.closeReason ?? null,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async findExposureById(id: string) {
    const rows = await this.db
      .select()
      .from(cloudExposures)
      .where(eq(cloudExposures.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async findExposureByHost(host: string) {
    const rows = await this.db
      .select()
      .from(cloudExposures)
      .where(
        and(
          eq(cloudExposures.status, 'active'),
          sql`(${cloudExposures.host} = ${host} OR ${cloudExposures.stableHost} = ${host})`,
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  async listExposures(data: { deploymentId: string; agentId?: string; statuses?: string[] }) {
    const filters = [eq(cloudExposures.deploymentId, data.deploymentId)]
    if (data.agentId) filters.push(eq(cloudExposures.agentId, data.agentId))
    if (data.statuses?.length) filters.push(inArray(cloudExposures.status, data.statuses))
    return this.db
      .select()
      .from(cloudExposures)
      .where(and(...filters))
      .orderBy(desc(cloudExposures.updatedAt))
  }

  async closeMissingRuntimeExposures(data: {
    deploymentId: string
    agentId: string
    keepLocalIds: string[]
    reason: string
  }) {
    const filters = [
      eq(cloudExposures.deploymentId, data.deploymentId),
      eq(cloudExposures.agentId, data.agentId),
      eq(cloudExposures.source, 'runtime'),
      eq(cloudExposures.status, 'active'),
    ]
    if (data.keepLocalIds.length > 0) {
      filters.push(notInArray(cloudExposures.localId, data.keepLocalIds))
    }
    return this.db
      .update(cloudExposures)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closeReason: data.reason,
        updatedAt: new Date(),
      })
      .where(and(...filters))
      .returning()
  }

  async closeExposure(id: string, reason: string) {
    const rows = await this.db
      .update(cloudExposures)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closeReason: reason,
        updatedAt: new Date(),
      })
      .where(and(eq(cloudExposures.id, id), ne(cloudExposures.status, 'closed')))
      .returning()
    return rows[0] ?? null
  }

  async updateExposureRelease(data: {
    id: string
    appInstanceId?: string | null
    appReleaseId?: string | null
    status?: string
  }) {
    const rows = await this.db
      .update(cloudExposures)
      .set({
        ...(data.appInstanceId !== undefined ? { appInstanceId: data.appInstanceId } : {}),
        ...(data.appReleaseId !== undefined ? { appReleaseId: data.appReleaseId } : {}),
        ...(data.status ? { status: data.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cloudExposures.id, data.id))
      .returning()
    return rows[0] ?? null
  }

  async createExposureEvent(data: typeof cloudExposureEvents.$inferInsert) {
    const rows = await this.db.insert(cloudExposureEvents).values(data).returning()
    return rows[0]!
  }

  async upsertAppInstance(data: CloudAppInstanceInsert) {
    const rows = await this.db
      .insert(cloudAppInstances)
      .values(data)
      .onConflictDoUpdate({
        target: [
          cloudAppInstances.deploymentId,
          cloudAppInstances.agentId,
          cloudAppInstances.serverId,
          cloudAppInstances.appKey,
        ],
        set: {
          spaceAppInstallationId: data.spaceAppInstallationId ?? null,
          name: data.name,
          stableHost: data.stableHost,
          stableBaseUrl: data.stableBaseUrl,
          manifestUrl: data.manifestUrl,
          status: data.status ?? 'active',
          sourcePath: data.sourcePath ?? null,
          statePolicy: data.statePolicy ?? { paths: [] },
          metadata: data.metadata ?? {},
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
    return rows[0]!
  }

  async updateAppInstancePointers(data: {
    id: string
    currentReleaseId?: string | null
    currentExposureId?: string | null
    spaceAppInstallationId?: string | null
    status?: string
  }) {
    const rows = await this.db
      .update(cloudAppInstances)
      .set({
        ...(data.currentReleaseId !== undefined ? { currentReleaseId: data.currentReleaseId } : {}),
        ...(data.currentExposureId !== undefined
          ? { currentExposureId: data.currentExposureId }
          : {}),
        ...(data.spaceAppInstallationId !== undefined
          ? { spaceAppInstallationId: data.spaceAppInstallationId }
          : {}),
        ...(data.status ? { status: data.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cloudAppInstances.id, data.id))
      .returning()
    return rows[0] ?? null
  }

  async findAppInstance(data: {
    appKey: string
    deploymentId?: string
    serverId?: string
    userId?: string
  }) {
    const filters = [eq(cloudAppInstances.appKey, data.appKey)]
    if (data.deploymentId) filters.push(eq(cloudAppInstances.deploymentId, data.deploymentId))
    if (data.serverId) filters.push(eq(cloudAppInstances.serverId, data.serverId))
    if (data.userId) filters.push(eq(cloudAppInstances.userId, data.userId))
    const rows = await this.db
      .select()
      .from(cloudAppInstances)
      .where(and(...filters))
      .orderBy(desc(cloudAppInstances.updatedAt))
      .limit(1)
    return rows[0] ?? null
  }

  async listAppInstancesByDeployments(data: { deploymentIds: string[]; userId: string }) {
    if (data.deploymentIds.length === 0) return []
    return this.db
      .select()
      .from(cloudAppInstances)
      .where(
        and(
          eq(cloudAppInstances.userId, data.userId),
          inArray(cloudAppInstances.deploymentId, data.deploymentIds),
        ),
      )
      .orderBy(desc(cloudAppInstances.updatedAt))
  }

  async createAppRelease(data: CloudAppReleaseInsert) {
    const rows = await this.db.insert(cloudAppReleases).values(data).returning()
    return rows[0]!
  }

  async activateRelease(data: {
    releaseId: string
    appInstanceId: string
    exposureId: string
    spaceAppInstallationId?: string | null
  }) {
    await this.db
      .update(cloudAppReleases)
      .set({
        status: 'superseded',
      })
      .where(
        and(
          eq(cloudAppReleases.appInstanceId, data.appInstanceId),
          ne(cloudAppReleases.id, data.releaseId),
          eq(cloudAppReleases.status, 'active'),
        ),
      )
    const rows = await this.db
      .update(cloudAppReleases)
      .set({
        exposureId: data.exposureId,
        spaceAppInstallationId: data.spaceAppInstallationId ?? null,
        status: 'active',
        activatedAt: new Date(),
      })
      .where(eq(cloudAppReleases.id, data.releaseId))
      .returning()
    await this.updateAppInstancePointers({
      id: data.appInstanceId,
      currentReleaseId: data.releaseId,
      currentExposureId: data.exposureId,
      spaceAppInstallationId: data.spaceAppInstallationId ?? null,
      status: 'active',
    })
    return rows[0] ?? null
  }

  async findReleaseById(id: string) {
    const rows = await this.db
      .select()
      .from(cloudAppReleases)
      .where(eq(cloudAppReleases.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async listReleases(appInstanceId: string, limit = 20) {
    return this.db
      .select()
      .from(cloudAppReleases)
      .where(eq(cloudAppReleases.appInstanceId, appInstanceId))
      .orderBy(desc(cloudAppReleases.createdAt))
      .limit(limit)
  }

  async upsertBackupPolicy(data: typeof cloudBackupPolicies.$inferInsert) {
    const existing = await this.db
      .select()
      .from(cloudBackupPolicies)
      .where(eq(cloudBackupPolicies.appInstanceId, data.appInstanceId))
      .limit(1)
    if (existing[0]) {
      const rows = await this.db
        .update(cloudBackupPolicies)
        .set({
          status: data.status ?? 'active',
          driver: data.driver ?? 'metadata',
          config: data.config ?? { statePaths: [] },
          updatedAt: new Date(),
        })
        .where(eq(cloudBackupPolicies.id, existing[0].id))
        .returning()
      return rows[0] ?? existing[0]
    }
    const rows = await this.db.insert(cloudBackupPolicies).values(data).returning()
    return rows[0]!
  }

  async createBackupSet(data: CloudBackupSetInsert) {
    const rows = await this.db.insert(cloudBackupSets).values(data).returning()
    return rows[0]!
  }

  async updateBackupSetStatus(id: string, status: string, error?: string | null) {
    const rows = await this.db
      .update(cloudBackupSets)
      .set({ status, error: error ?? null, updatedAt: new Date() })
      .where(eq(cloudBackupSets.id, id))
      .returning()
    return rows[0] ?? null
  }

  async createBackupComponent(data: CloudBackupComponentInsert) {
    const rows = await this.db.insert(cloudBackupComponents).values(data).returning()
    return rows[0]!
  }

  async listBackupSets(appInstanceId: string, limit = 20) {
    return this.db
      .select()
      .from(cloudBackupSets)
      .where(eq(cloudBackupSets.appInstanceId, appInstanceId))
      .orderBy(desc(cloudBackupSets.createdAt))
      .limit(limit)
  }

  async findBackupSet(id: string) {
    const rows = await this.db
      .select()
      .from(cloudBackupSets)
      .where(eq(cloudBackupSets.id, id))
      .limit(1)
    return rows[0] ?? null
  }

  async listBackupComponents(backupSetId: string) {
    return this.db
      .select()
      .from(cloudBackupComponents)
      .where(eq(cloudBackupComponents.backupSetId, backupSetId))
  }

  async createRestoreJob(data: CloudRestoreJobInsert) {
    const rows = await this.db.insert(cloudRestoreJobs).values(data).returning()
    return rows[0]!
  }

  async updateRestoreJobStatus(id: string, status: string, phase: string, error?: string | null) {
    const rows = await this.db
      .update(cloudRestoreJobs)
      .set({ status, phase, error: error ?? null, updatedAt: new Date() })
      .where(eq(cloudRestoreJobs.id, id))
      .returning()
    return rows[0] ?? null
  }
}
