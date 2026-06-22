import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import type { Database } from '../db'
import { cloudDeploymentBackups } from '../db/schema'

export type BackupStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'expired'
export type BackupDriver = 'volumeSnapshot' | 'restic' | 'git'
export type BackupPhase =
  | 'queued'
  | 'checking-snapshot-api'
  | 'snapshot-creating'
  | 'snapshot-waiting'
  | 'object-archiving'
  | 'object-storing'
  | 'git-cloning'
  | 'git-pushing'
  | 'restoring-pausing'
  | 'restoring-pvc'
  | 'restoring-resuming'
  | 'restore-failed'
  | 'completed'
  | 'failed'
  | string

const ACTIVE_BACKUP_STATUSES = ['pending', 'running'] as const
const RESTORING_BACKUP_PHASES = [
  'restoring-pausing',
  'restoring-pvc',
  'restoring-resuming',
] as const

export class CloudDeploymentBackupDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async listByDeployment(data: { userId: string; deploymentId: string; agentId?: string }) {
    const filters = [
      eq(cloudDeploymentBackups.userId, data.userId),
      eq(cloudDeploymentBackups.deploymentId, data.deploymentId),
    ]
    if (data.agentId) filters.push(eq(cloudDeploymentBackups.agentId, data.agentId))

    return this.db
      .select()
      .from(cloudDeploymentBackups)
      .where(and(...filters))
      .orderBy(desc(cloudDeploymentBackups.createdAt))
  }

  async findLatestByDeploymentAgent(data: { deploymentId: string; agentId: string }) {
    const result = await this.db
      .select()
      .from(cloudDeploymentBackups)
      .where(
        and(
          eq(cloudDeploymentBackups.deploymentId, data.deploymentId),
          eq(cloudDeploymentBackups.agentId, data.agentId),
        ),
      )
      .orderBy(desc(cloudDeploymentBackups.createdAt))
      .limit(1)
    return result[0] ?? null
  }

  async findById(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(cloudDeploymentBackups)
      .where(and(eq(cloudDeploymentBackups.id, id), eq(cloudDeploymentBackups.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async create(data: {
    userId: string
    deploymentId: string
    namespace: string
    agentId: string
    sandboxName?: string | null
    pvcName: string
    driver: BackupDriver
    snapshotName?: string | null
    objectKey?: string | null
    status?: BackupStatus
    phase?: BackupPhase | null
    expiresAt?: Date | null
    error?: string | null
  }) {
    const result = await this.db
      .insert(cloudDeploymentBackups)
      .values({
        userId: data.userId,
        deploymentId: data.deploymentId,
        namespace: data.namespace,
        agentId: data.agentId,
        sandboxName: data.sandboxName ?? null,
        pvcName: data.pvcName,
        driver: data.driver,
        snapshotName: data.snapshotName ?? null,
        objectKey: data.objectKey ?? null,
        status: data.status ?? 'pending',
        phase: data.phase ?? 'queued',
        expiresAt: data.expiresAt ?? null,
        error: data.error ?? null,
      })
      .returning()
    return result[0]
  }

  async updateStatus(id: string, status: BackupStatus, error?: string | null) {
    const phase =
      status === 'succeeded'
        ? ({ phase: 'completed' as const } as const)
        : status === 'failed'
          ? ({ phase: 'failed' as const } as const)
          : {}
    const result = await this.db
      .update(cloudDeploymentBackups)
      .set({
        status,
        ...phase,
        error: error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(cloudDeploymentBackups.id, id))
      .returning()
    return result[0] ?? null
  }

  async updatePhase(id: string, phase: BackupPhase) {
    const result = await this.db
      .update(cloudDeploymentBackups)
      .set({ phase, updatedAt: new Date() })
      .where(eq(cloudDeploymentBackups.id, id))
      .returning()
    return result[0] ?? null
  }

  async listActiveUpdatedBefore(cutoff: Date) {
    return this.db
      .select()
      .from(cloudDeploymentBackups)
      .where(
        and(
          inArray(cloudDeploymentBackups.status, [...ACTIVE_BACKUP_STATUSES]),
          lt(cloudDeploymentBackups.updatedAt, cutoff),
        ),
      )
      .orderBy(desc(cloudDeploymentBackups.updatedAt))
  }

  async failIfActive(id: string, error: string) {
    const result = await this.db
      .update(cloudDeploymentBackups)
      .set({ status: 'failed', phase: 'failed', error, updatedAt: new Date() })
      .where(
        and(
          eq(cloudDeploymentBackups.id, id),
          inArray(cloudDeploymentBackups.status, [...ACTIVE_BACKUP_STATUSES]),
        ),
      )
      .returning()
    return result[0] ?? null
  }

  async listRestoringUpdatedBefore(cutoff: Date) {
    return this.db
      .select()
      .from(cloudDeploymentBackups)
      .where(
        and(
          inArray(cloudDeploymentBackups.phase, [...RESTORING_BACKUP_PHASES]),
          lt(cloudDeploymentBackups.updatedAt, cutoff),
        ),
      )
      .orderBy(desc(cloudDeploymentBackups.updatedAt))
  }

  async markRestoreCompletedIfRestoring(id: string) {
    const result = await this.db
      .update(cloudDeploymentBackups)
      .set({ phase: 'completed', updatedAt: new Date() })
      .where(
        and(
          eq(cloudDeploymentBackups.id, id),
          inArray(cloudDeploymentBackups.phase, [...RESTORING_BACKUP_PHASES]),
        ),
      )
      .returning()
    return result[0] ?? null
  }

  async markRestoreFailedIfRestoring(id: string, error: string) {
    const result = await this.db
      .update(cloudDeploymentBackups)
      .set({ phase: 'restore-failed', error, updatedAt: new Date() })
      .where(
        and(
          eq(cloudDeploymentBackups.id, id),
          inArray(cloudDeploymentBackups.phase, [...RESTORING_BACKUP_PHASES]),
        ),
      )
      .returning()
    return result[0] ?? null
  }

  async listExpiredBefore(now: Date) {
    return this.db
      .select()
      .from(cloudDeploymentBackups)
      .where(
        and(
          eq(cloudDeploymentBackups.status, 'succeeded'),
          lt(cloudDeploymentBackups.expiresAt, now),
        ),
      )
      .orderBy(desc(cloudDeploymentBackups.expiresAt))
  }

  async markExpired(id: string, error?: string | null) {
    const result = await this.db
      .update(cloudDeploymentBackups)
      .set({ status: 'expired', phase: 'completed', error: error ?? null, updatedAt: new Date() })
      .where(and(eq(cloudDeploymentBackups.id, id), eq(cloudDeploymentBackups.status, 'succeeded')))
      .returning()
    return result[0] ?? null
  }
}
