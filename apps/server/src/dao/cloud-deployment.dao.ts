import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { type Database, workerLockClient } from '../db'
import { cloudDeploymentLogs, cloudDeployments } from '../db/schema'

const ACTIVE_OPERATION_STATUSES = ['pending', 'deploying', 'destroying', 'cancelling'] as const
const CURRENT_INSTANCE_STATUSES = [
  'pending',
  'deploying',
  'deployed',
  'destroying',
  'cancelling',
] as const

type CloudDeploymentStatus = (typeof cloudDeployments.$inferSelect)['status']
type CloudDeploymentRow = typeof cloudDeployments.$inferSelect

export class CloudDeploymentDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  private namespaceScopeWhere(data: {
    userId: string
    namespace: string
    clusterId?: string | null
  }) {
    return and(
      eq(cloudDeployments.userId, data.userId),
      eq(cloudDeployments.namespace, data.namespace),
      data.clusterId
        ? eq(cloudDeployments.clusterId, data.clusterId)
        : isNull(cloudDeployments.clusterId),
    )
  }

  private operationLockKey(data: { userId: string; namespace: string; clusterId?: string | null }) {
    return `cloud-deployment:${data.userId}:${data.clusterId ?? 'platform'}:${data.namespace}`
  }

  async findById(id: string, userId: string) {
    const result = await this.db
      .select()
      .from(cloudDeployments)
      .where(and(eq(cloudDeployments.id, id), eq(cloudDeployments.userId, userId)))
      .limit(1)
    return result[0] ?? null
  }

  async findByIdOnly(id: string) {
    const result = await this.db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async listByUser(userId: string, limit = 50, offset = 0) {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, userId))
      .orderBy(desc(cloudDeployments.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async listPending() {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.status, 'pending'))
      .orderBy(cloudDeployments.createdAt)
  }

  async listDestroying() {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.status, 'destroying'))
      .orderBy(cloudDeployments.createdAt)
  }

  /**
   * Deployments the user has asked to cancel mid-flight.
   * The cloud worker picks these up and signals the in-progress deploy
   * subprocess to terminate.
   */
  async listCancelling() {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.status, 'cancelling'))
      .orderBy(cloudDeployments.createdAt)
  }

  /**
   * Reconcile-only: deployments that should already have a namespace present
   * on the cluster.
   *
   * IMPORTANT: do not include `deploying` here. A rollout may still be
   * creating the namespace when the periodic orphan reconciler runs, which
   * would cause a false `orphaned-by-cluster` failure mid-deploy.
   */
  async listLive() {
    return this.db.select().from(cloudDeployments).where(eq(cloudDeployments.status, 'deployed'))
  }

  async findLatestCurrentInNamespace(data: {
    userId: string
    namespace: string
    clusterId?: string | null
    excludeId?: string
  }) {
    const filters = [
      this.namespaceScopeWhere(data),
      inArray(cloudDeployments.status, [...CURRENT_INSTANCE_STATUSES]),
    ]
    if (data.excludeId) filters.push(ne(cloudDeployments.id, data.excludeId))

    const result = await this.db
      .select()
      .from(cloudDeployments)
      .where(and(...filters))
      .orderBy(desc(cloudDeployments.updatedAt), desc(cloudDeployments.createdAt))
      .limit(1)
    return result[0] ?? null
  }

  async findActiveOperationInNamespace(data: {
    userId: string
    namespace: string
    clusterId?: string | null
    excludeId?: string
  }) {
    const filters = [
      this.namespaceScopeWhere(data),
      inArray(cloudDeployments.status, [...ACTIVE_OPERATION_STATUSES]),
    ]
    if (data.excludeId) filters.push(ne(cloudDeployments.id, data.excludeId))

    const result = await this.db
      .select()
      .from(cloudDeployments)
      .where(and(...filters))
      .orderBy(desc(cloudDeployments.updatedAt), desc(cloudDeployments.createdAt))
      .limit(1)
    return result[0] ?? null
  }

  async findNewerCurrentInNamespace(deployment: CloudDeploymentRow) {
    const result = await this.db
      .select()
      .from(cloudDeployments)
      .where(
        and(
          this.namespaceScopeWhere(deployment),
          inArray(cloudDeployments.status, [...CURRENT_INSTANCE_STATUSES]),
          ne(cloudDeployments.id, deployment.id),
          sql`${cloudDeployments.createdAt} > ${deployment.createdAt}`,
        ),
      )
      .orderBy(desc(cloudDeployments.createdAt))
      .limit(1)
    return result[0] ?? null
  }

  async updateConfigSnapshot(id: string, configSnapshot: unknown) {
    const result = await this.db
      .update(cloudDeployments)
      .set({ configSnapshot, updatedAt: new Date() })
      .where(eq(cloudDeployments.id, id))
      .returning()
    return result[0] ?? null
  }

  async markNamespaceRowsDestroyed(data: {
    userId: string
    namespace: string
    clusterId?: string | null
    errorMessage?: string | null
  }) {
    return this.db
      .update(cloudDeployments)
      .set({
        status: 'destroyed' as CloudDeploymentStatus,
        errorMessage: data.errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          this.namespaceScopeWhere(data),
          inArray(cloudDeployments.status, [...CURRENT_INSTANCE_STATUSES]),
        ),
      )
      .returning()
  }

  async create(data: {
    userId: string
    clusterId?: string | null
    namespace: string
    name: string
    agentCount?: number
    configSnapshot?: unknown
  }) {
    const result = await this.db
      .insert(cloudDeployments)
      .values({
        userId: data.userId,
        clusterId: data.clusterId ?? null,
        namespace: data.namespace,
        name: data.name,
        agentCount: data.agentCount ?? 0,
        configSnapshot: data.configSnapshot ?? null,
        status: 'pending',
      })
      .returning()
    return result[0]
  }

  async updateStatus(
    id: string,
    status:
      | 'pending'
      | 'deploying'
      | 'deployed'
      | 'failed'
      | 'destroying'
      | 'destroyed'
      | 'cancelling',
    errorMessage?: string | null,
  ) {
    const result = await this.db
      .update(cloudDeployments)
      .set({ status, errorMessage: errorMessage ?? null, updatedAt: new Date() })
      .where(eq(cloudDeployments.id, id))
      .returning()
    return result[0] ?? null
  }

  // ─── Logs ────────────────────────────────────────────────────────────────

  async appendLog(deploymentId: string, message: string, level = 'info') {
    const result = await this.db
      .insert(cloudDeploymentLogs)
      .values({ deploymentId, message, level })
      .returning()
    return result[0]
  }

  async getLogs(deploymentId: string) {
    return this.db
      .select()
      .from(cloudDeploymentLogs)
      .where(eq(cloudDeploymentLogs.deploymentId, deploymentId))
      .orderBy(cloudDeploymentLogs.createdAt)
  }

  /**
   * Acquire a per-deployment advisory lock for cross-worker mutual exclusion.
   * Returns true when the lock is acquired by this session.
   */
  async tryAcquireWorkerLock(deploymentId: string): Promise<boolean> {
    const [row] = await workerLockClient<{ locked?: unknown }[]>`
      select pg_try_advisory_lock(hashtext(${deploymentId})) as locked
    `
    const locked = row?.locked
    return locked === true || locked === 't' || locked === 1 || locked === '1'
  }

  /**
   * Release a per-deployment advisory lock previously acquired by this session.
   */
  async releaseWorkerLock(deploymentId: string): Promise<void> {
    await workerLockClient`
      select pg_advisory_unlock(hashtext(${deploymentId}))
    `
  }

  async tryAcquireOperationLock(data: {
    userId: string
    namespace: string
    clusterId?: string | null
  }): Promise<boolean> {
    const [row] = await workerLockClient<{ locked?: unknown }[]>`
      select pg_try_advisory_lock(hashtext(${this.operationLockKey(data)})) as locked
    `
    const locked = row?.locked
    return locked === true || locked === 't' || locked === 1 || locked === '1'
  }

  async releaseOperationLock(data: {
    userId: string
    namespace: string
    clusterId?: string | null
  }): Promise<void> {
    await workerLockClient`
      select pg_advisory_unlock(hashtext(${this.operationLockKey(data)}))
    `
  }
}
