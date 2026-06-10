import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, notInArray, or } from 'drizzle-orm'
import { type Database, workerLockClient } from '../db'
import { cloudDeploymentLogs, cloudDeployments } from '../db/schema'

const ACTIVE_OPERATION_STATUSES = [
  'pending',
  'deploying',
  'destroying',
  'cancelling',
  'resuming',
] as const
const CURRENT_INSTANCE_STATUSES = [
  'pending',
  'deploying',
  'deployed',
  'paused',
  'resuming',
  'destroying',
  'cancelling',
] as const
const NON_RECOVERABLE_FAILED_REASONS = [
  'cancelled by user',
  'orphaned-by-cluster',
  'superseded-by-newer-deployment',
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

  async findByNamespaceGlobal(namespace: string, clusterId?: string | null) {
    const result = await this.db
      .select()
      .from(cloudDeployments)
      .where(
        and(
          eq(cloudDeployments.namespace, namespace),
          clusterId
            ? eq(cloudDeployments.clusterId, clusterId)
            : isNull(cloudDeployments.clusterId),
        ),
      )
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

  async countDeployedByUser(userId: string) {
    const result = await this.db
      .select({ value: count() })
      .from(cloudDeployments)
      .where(and(eq(cloudDeployments.userId, userId), eq(cloudDeployments.status, 'deployed')))
    return result[0]?.value ?? 0
  }

  async listPending() {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.status, 'pending'))
      .orderBy(cloudDeployments.createdAt)
  }

  /**
   * Deployments already claimed by a worker. If the server process restarts,
   * advisory locks and in-memory cancellation tokens disappear while the row
   * remains `deploying`; the processor can safely re-apply the same Pulumi
   * stack under the per-deployment and namespace locks.
   */
  async listDeploying() {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.status, 'deploying'))
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

  async listPaused() {
    return this.db.select().from(cloudDeployments).where(eq(cloudDeployments.status, 'paused'))
  }

  async listExpiredTemporary(now: Date) {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(
        and(
          inArray(cloudDeployments.status, ['deployed', 'paused'] as CloudDeploymentStatus[]),
          lt(cloudDeployments.expiresAt, now),
        ),
      )
      .orderBy(asc(cloudDeployments.expiresAt))
  }

  async listHourlyBillable() {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(
        and(
          eq(cloudDeployments.status, 'deployed'),
          eq(cloudDeployments.saasMode, true),
          gt(cloudDeployments.hourlyCost, 0),
        ),
      )
  }

  async listRecoverableFailedSince(since: Date) {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(
        and(
          eq(cloudDeployments.status, 'failed'),
          eq(cloudDeployments.saasMode, true),
          gt(cloudDeployments.updatedAt, since),
          or(
            isNull(cloudDeployments.errorMessage),
            notInArray(cloudDeployments.errorMessage, [...NON_RECOVERABLE_FAILED_REASONS]),
          ),
        ),
      )
      .orderBy(desc(cloudDeployments.updatedAt))
  }

  async listResumingUpdatedBefore(cutoff: Date) {
    return this.db
      .select()
      .from(cloudDeployments)
      .where(and(eq(cloudDeployments.status, 'resuming'), lt(cloudDeployments.updatedAt, cutoff)))
      .orderBy(desc(cloudDeployments.updatedAt))
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
      .orderBy(desc(cloudDeployments.createdAt), desc(cloudDeployments.updatedAt))
      .limit(1)
    return result[0] ?? null
  }

  async findLatestHourlyBillableInNamespace(data: {
    userId: string
    namespace: string
    clusterId?: string | null
    excludeId?: string
  }) {
    const filters = [
      this.namespaceScopeWhere(data),
      eq(cloudDeployments.status, 'deployed' as CloudDeploymentStatus),
      eq(cloudDeployments.saasMode, true),
      gt(cloudDeployments.hourlyCost, 0),
    ]
    if (data.excludeId) filters.push(ne(cloudDeployments.id, data.excludeId))

    const result = await this.db
      .select()
      .from(cloudDeployments)
      .where(and(...filters))
      .orderBy(desc(cloudDeployments.createdAt), desc(cloudDeployments.updatedAt))
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
      .orderBy(asc(cloudDeployments.createdAt), asc(cloudDeployments.updatedAt))
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
          gt(cloudDeployments.createdAt, deployment.createdAt),
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
    status?: CloudDeploymentStatus
    agentCount?: number
    configSnapshot?: unknown
    templateSlug?: string | null
    resourceTier?: string | null
    monthlyCost?: number | null
    hourlyCost?: number | null
    lastHourlyBilledAt?: Date | null
    expiresAt?: Date | null
    saasMode?: boolean
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
        status: data.status ?? 'pending',
        templateSlug: data.templateSlug ?? null,
        resourceTier: data.resourceTier ?? null,
        monthlyCost: data.monthlyCost ?? null,
        hourlyCost: data.hourlyCost ?? 1,
        lastHourlyBilledAt: data.lastHourlyBilledAt ?? null,
        expiresAt: data.expiresAt ?? null,
        saasMode: data.saasMode ?? false,
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
      | 'paused'
      | 'resuming'
      | 'failed'
      | 'destroying'
      | 'destroyed'
      | 'cancelling',
    errorMessage?: string | null,
  ) {
    const now = new Date()
    const activityPatch =
      status === 'deployed' || status === 'resuming' ? { lastActiveAt: now } : {}
    const result = await this.db
      .update(cloudDeployments)
      .set({ status, errorMessage: errorMessage ?? null, updatedAt: now, ...activityPatch })
      .where(eq(cloudDeployments.id, id))
      .returning()
    return result[0] ?? null
  }

  async updateStatusIfStatus(
    id: string,
    currentStatus: CloudDeploymentStatus,
    nextStatus: CloudDeploymentStatus,
    errorMessage?: string | null,
  ) {
    const now = new Date()
    const activityPatch =
      nextStatus === 'deployed' || nextStatus === 'resuming' ? { lastActiveAt: now } : {}
    const result = await this.db
      .update(cloudDeployments)
      .set({
        status: nextStatus,
        errorMessage: errorMessage ?? null,
        updatedAt: now,
        ...activityPatch,
      })
      .where(and(eq(cloudDeployments.id, id), eq(cloudDeployments.status, currentStatus)))
      .returning()
    return result[0] ?? null
  }

  async failIfStatus(id: string, status: CloudDeploymentStatus, errorMessage: string) {
    const result = await this.db
      .update(cloudDeployments)
      .set({ status: 'failed' as CloudDeploymentStatus, errorMessage, updatedAt: new Date() })
      .where(and(eq(cloudDeployments.id, id), eq(cloudDeployments.status, status)))
      .returning()
    return result[0] ?? null
  }

  async markDeployed(id: string, agentCount: number, lastHourlyBilledAt = new Date()) {
    const result = await this.db
      .update(cloudDeployments)
      .set({
        status: 'deployed' as CloudDeploymentStatus,
        agentCount,
        errorMessage: null,
        lastHourlyBilledAt,
        lastActiveAt: lastHourlyBilledAt,
        updatedAt: new Date(),
      })
      .where(eq(cloudDeployments.id, id))
      .returning()
    return result[0] ?? null
  }

  async recordActivity(id: string, at = new Date()) {
    const result = await this.db
      .update(cloudDeployments)
      .set({ lastActiveAt: at, updatedAt: new Date() })
      .where(eq(cloudDeployments.id, id))
      .returning()
    return result[0] ?? null
  }

  async updateLastHourlyBilledAt(id: string, billedAt: Date) {
    const result = await this.db
      .update(cloudDeployments)
      .set({ lastHourlyBilledAt: billedAt })
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
