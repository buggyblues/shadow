/**
 * Cloud deployment processor — polls cloud_deployments and executes lifecycle actions.
 *
 * Runs in-process with the server. Requires access to PostgreSQL and a reachable
 * Kubernetes cluster via KUBECONFIG.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  attachCloudSaasProvisionState,
  createContainer,
  deleteKubernetesResourceAsync,
  deleteNamespace,
  extractCloudSaasRuntime,
  listManagedNamespaces,
  listPodsAsync,
  namespaceExists,
  resolveCloudSaasShadowRuntime,
  type ServiceContainer,
  scaleAgentSandboxAsync,
  waitForAgentSandboxPaused,
  waitForAgentSandboxReady,
} from '@shadowob/cloud'
import { and, eq } from 'drizzle-orm'
import type { AppContainer } from '../container'
import { CloudClusterDao } from '../dao/cloud-cluster.dao'
import { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import { CloudDeploymentBackupDao } from '../dao/cloud-deployment-backup.dao'
import { WalletDao } from '../dao/wallet.dao'
import type { Database } from '../db'
import { db } from '../db'
import { cloudDeployments, wallets, walletTransactions } from '../db/schema'
import { LedgerService } from '../services/ledger.service'
import { runCloudDeploymentBackup } from './cloud-deployment-backup-runtime'
import { extractShadowProvisionBuddyUserIds } from './cloud-shadow-target'
import { decrypt } from './kms'
import { logger } from './logger'

const POLL_INTERVAL_MS = Number(
  process.env.CLOUD_WORKER_POLL_INTERVAL_MS ?? process.env.POLL_INTERVAL_MS ?? 5000,
)
const RECONCILE_INTERVAL_MS = Number(process.env.RECONCILE_INTERVAL_MS ?? 60_000)
const FAILED_DEPLOYMENT_RECOVERY_WINDOW_MS = Number(
  process.env.CLOUD_FAILED_DEPLOYMENT_RECOVERY_WINDOW_MS ?? 30 * 60_000,
)
const DEFAULT_DESTROY_VERIFY_TIMEOUT_MS = 600_000
const QUEUE_WAIT_LOG_INTERVAL_MS = Number(process.env.CLOUD_QUEUE_WAIT_LOG_INTERVAL_MS ?? 30_000)
const CLOUD_HOURLY_BILLING_INTERVAL_MS = 15 * 60 * 1000
const CLOUD_HOURLY_PREPAID_UNIT_MS = 60 * 60 * 1000
const CLOUD_HOURLY_BILLING_MICROS_PER_COIN = 1_000_000
const CLOUD_HOURLY_BILLING_SOURCE_PREFIX = 'cloud_hourly'
const ORPHAN_RECONCILE_GRACE_MS = Number(process.env.CLOUD_ORPHAN_RECONCILE_GRACE_MS ?? 10 * 60_000)
const CLOUD_BACKUP_OPERATION_STALE_MS = Number(
  process.env.CLOUD_BACKUP_OPERATION_STALE_MS ?? 6 * 60 * 60_000,
)
const CLOUD_RESTORE_OPERATION_STALE_MS = Number(
  process.env.CLOUD_RESTORE_OPERATION_STALE_MS ?? CLOUD_BACKUP_OPERATION_STALE_MS,
)
const CLOUD_IDLE_AUTOPAUSE_MIN_SECONDS = Number(process.env.CLOUD_IDLE_AUTOPAUSE_MIN_SECONDS ?? 60)

type CloudDeploymentRecord = NonNullable<Awaited<ReturnType<CloudDeploymentDao['findByIdOnly']>>>
type DeploymentStatus = CloudDeploymentRecord['status']
type OperationCancellationStatus = 'cancelling' | 'destroying'
type RunningOperationToken = {
  cancelled: boolean
  stack?: { cancel: () => Promise<void> }
  cancelSignalled?: boolean
  cancellationStatus?: OperationCancellationStatus
}
type NamespaceDeletionWaitResult = 'deleted' | 'cancelled' | 'timeout'
type NamespaceExistsFn = (namespace: string, kubeconfig?: string) => boolean | null
type DeleteNamespaceFn = (namespace: string, kubeconfig?: string) => void
type NamespaceDeletionStartResult =
  | { status: 'already-deleted' }
  | { status: 'delete-requested' }
  | { status: 'delete-failed'; error: string }
type DeploymentRecoveryProbeResult = {
  agentCount: number
  podNames: string[]
  readyPods: number
}
type AutoPauseAgentConfig = {
  agentId: string
  idleSeconds: number
  backupBeforePause: boolean
}
type CloudDeploymentProcessorRuntime = {
  deploymentDao: CloudDeploymentDao
  backupDao: CloudDeploymentBackupDao
  clusterDao: CloudClusterDao
  container: ServiceContainer
  appContainer?: AppContainer
  database: Database
  lastReconcileAt: number
}

export type CloudDeploymentProcessorTickResult = {
  pending: number
  destroying: number
  cancelling: number
  expired: number
  reconciled: boolean
}

export type CloudHourlyBillingCharge = {
  intervals: number
  amountMicros: number
  billedUntil: Date
}

function extractKubeContext(kubeconfigYaml: string): string | undefined {
  const match = kubeconfigYaml.match(/current-context:\s*(\S+)/)
  return match?.[1]
}

function readKubeconfigCurrentContext(kubeconfigPath: string | undefined): string | undefined {
  if (!kubeconfigPath) return undefined
  try {
    return extractKubeContext(readFileSync(kubeconfigPath, 'utf8'))
  } catch {
    return undefined
  }
}

function describeAmbientKubeContext(): string {
  const envContext = process.env.KUBECONFIG_CONTEXT?.trim()
  const currentContext = readKubeconfigCurrentContext(process.env.KUBECONFIG)
  if (!currentContext) return envContext || 'rancher-desktop'
  if (envContext && envContext !== currentContext) {
    return `${currentContext} (mounted current-context; env KUBECONFIG_CONTEXT=${envContext} ignored)`
  }
  return currentContext
}

function sanitizePulumiStackPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveDeploymentStackName(deployment: CloudDeploymentRecord): string {
  const clusterKey = deployment.clusterId ?? 'platform'
  const clusterHash = createHash('sha256').update(clusterKey).digest('hex').slice(0, 10)
  const namespace = sanitizePulumiStackPart(deployment.namespace).slice(0, 60) || 'deployment'
  return `saas-${namespace}-${clusterHash}`
}

function cloudHourlyBillingSource() {
  return CLOUD_HOURLY_BILLING_SOURCE_PREFIX
}

export function createCloudHourlyBillingReferenceId(deploymentId: string, billedUntil: Date) {
  const bytes = createHash('sha256')
    .update(`cloud-hourly:${deploymentId}:${billedUntil.toISOString()}`)
    .digest()

  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function calculateCloudHourlyBillingCharge(input: {
  lastBilledAt: Date
  now: Date
  hourlyCost: number
}): CloudHourlyBillingCharge | null {
  if (!Number.isFinite(input.hourlyCost) || input.hourlyCost <= 0) return null
  const elapsedMs = input.now.getTime() - input.lastBilledAt.getTime()
  const intervals = Math.floor(elapsedMs / CLOUD_HOURLY_BILLING_INTERVAL_MS)
  if (intervals <= 0) return null

  const billedUntil = new Date(
    input.lastBilledAt.getTime() + intervals * CLOUD_HOURLY_BILLING_INTERVAL_MS,
  )
  const amountMicros = Math.round(
    (input.hourlyCost *
      intervals *
      CLOUD_HOURLY_BILLING_INTERVAL_MS *
      CLOUD_HOURLY_BILLING_MICROS_PER_COIN) /
      (60 * 60 * 1000),
  )
  if (amountMicros <= 0) return null

  return { intervals, amountMicros, billedUntil }
}

export async function resolveDeploymentShadowProvisionToken(
  runtimeEnvVars: Record<string, string>,
  deploymentUserId: string,
): Promise<string | undefined> {
  const { shadowToken } = resolveCloudSaasShadowRuntime(runtimeEnvVars)
  if (shadowToken) return shadowToken

  const { signAccessToken } = await import('./jwt')
  return signAccessToken({ userId: deploymentUserId })
}

function assertNoSecretsInProvisionState(state: unknown) {
  const serialized = JSON.stringify(state)
  if (
    /(?:token|secret|password|api[_-]?key|authorization|bearer|kubeconfig)/i.test(serialized) ||
    /(?:sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,})/.test(serialized)
  ) {
    throw new Error('Provision state contains secret-like data and cannot be persisted')
  }
}

async function refundFailedCloudDeploymentCharge(
  deployment: CloudDeploymentRecord,
  database: Database,
  reason: string,
) {
  const amount = deployment.monthlyCost ?? 0
  if (!deployment.saasMode || amount <= 0) return

  try {
    const walletDao = new WalletDao({ db: database })
    const wallet = await walletDao.getOrCreate(deployment.userId)
    const existingRefund = await database
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, wallet.id),
          eq(walletTransactions.referenceId, deployment.id),
          eq(walletTransactions.referenceType, 'cloud_deploy_failed'),
        ),
      )
      .limit(1)

    if (existingRefund.length > 0) return

    const ledgerService = new LedgerService({ walletDao, db: database })
    await ledgerService.credit({
      userId: deployment.userId,
      amount,
      type: 'refund',
      referenceId: deployment.id,
      referenceType: 'cloud_deploy_failed',
      note: `Cloud deployment refund: ${deployment.name} (${reason})`,
    })
    await deploymentDaoSafeLog(
      deployment.id,
      `[billing] Refunded ${amount} Shrimp Coins after ${reason}`,
      database,
    )
  } catch (err) {
    logger.error(
      {
        deploymentId: deployment.id,
        userId: deployment.userId,
        amount,
        err,
      },
      'Failed to refund SaaS deployment charge',
    )
  }
}

async function reverseFailedCloudDeploymentRefundIfNeeded(
  deployment: CloudDeploymentRecord,
  database: Database,
) {
  const amount = deployment.monthlyCost ?? 0
  if (!deployment.saasMode || amount <= 0) return

  try {
    const walletDao = new WalletDao({ db: database })
    const wallet = await walletDao.getOrCreate(deployment.userId)
    const [refund] = await database
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, wallet.id),
          eq(walletTransactions.referenceId, deployment.id),
          eq(walletTransactions.referenceType, 'cloud_deploy_failed'),
        ),
      )
      .limit(1)
    if (!refund) return

    const [existingRecoveryCharge] = await database
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, wallet.id),
          eq(walletTransactions.referenceId, deployment.id),
          eq(walletTransactions.referenceType, 'cloud_deploy_recovered'),
        ),
      )
      .limit(1)
    if (existingRecoveryCharge) return

    const ledgerService = new LedgerService({ walletDao, db: database })
    await ledgerService.debit({
      userId: deployment.userId,
      amount,
      type: 'purchase',
      referenceId: deployment.id,
      referenceType: 'cloud_deploy_recovered',
      note: `Recovered cloud deployment charge: ${deployment.name}`,
    })
    await deploymentDaoSafeLog(
      deployment.id,
      `[billing] Re-applied ${amount} Shrimp Coins after Kubernetes recovery marked the deployment live`,
      database,
    )
  } catch (err) {
    logger.error(
      {
        deploymentId: deployment.id,
        userId: deployment.userId,
        amount,
        err,
      },
      'Failed to re-apply SaaS deployment charge after recovery',
    )
    await deploymentDaoSafeLog(
      deployment.id,
      `[billing] Failed to re-apply ${amount} Shrimp Coins after Kubernetes recovery; deployment remains failed for billing review`,
      database,
    )
    throw err
  }
}

async function deploymentDaoSafeLog(deploymentId: string, message: string, database: Database) {
  try {
    await new CloudDeploymentDao({ db: database }).appendLog(deploymentId, message, 'info')
  } catch {
    // Billing refund must not fail just because deployment logs are unavailable.
  }
}

async function markCloudDeploymentDeployedWithInitialBilling(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  database: Database,
  agentCount: number,
  now = new Date(),
) {
  if (!deployment.saasMode || (deployment.hourlyCost ?? 0) <= 0) {
    return {
      deployment: await deploymentDao.markDeployed(deployment.id, agentCount, now),
      charged: false,
      billedUntil: now,
    }
  }

  const hourlyCost = deployment.hourlyCost ?? 0
  const billedUntil = new Date(now.getTime() + CLOUD_HOURLY_PREPAID_UNIT_MS)
  const walletDao = new WalletDao({ db: database })
  const ledgerService = new LedgerService({ walletDao, db: database })

  return database.transaction(async (tx) => {
    const walletRows = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.userId, deployment.userId))
      .limit(1)

    const wallet = walletRows[0]
    const existingCharge = wallet
      ? await tx
          .select({ id: walletTransactions.id })
          .from(walletTransactions)
          .where(
            and(
              eq(walletTransactions.walletId, wallet.id),
              eq(walletTransactions.referenceId, deployment.id),
              eq(walletTransactions.referenceType, CLOUD_HOURLY_BILLING_SOURCE_PREFIX),
            ),
          )
          .limit(1)
      : []

    const charged = existingCharge.length === 0
    if (charged) {
      await ledgerService.debit(
        {
          userId: deployment.userId,
          amount: hourlyCost,
          type: 'purchase',
          referenceId: deployment.id,
          referenceType: CLOUD_HOURLY_BILLING_SOURCE_PREFIX,
          note: `Cloud deployment first hourly unit: ${deployment.name}`,
        },
        tx,
      )
    }

    const [updated] = await tx
      .update(cloudDeployments)
      .set({
        status: 'deployed' as DeploymentStatus,
        agentCount,
        errorMessage: null,
        lastHourlyBilledAt: billedUntil,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(cloudDeployments.id, deployment.id))
      .returning()

    return { deployment: updated ?? null, charged, billedUntil }
  })
}

async function handleInitialCloudHourlyBillingFailure(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  err: unknown,
) {
  const error = err as { status?: number; code?: string; balance?: number; shortfall?: number }
  const reason =
    (error.status ?? 500) === 402 || error.code === 'WALLET_INSUFFICIENT_BALANCE'
      ? `wallet insufficient for initial cloud hourly billing (balance=${error.balance ?? 'unknown'}, shortfall=${error.shortfall ?? 'unknown'})`
      : `initial cloud hourly billing failed: ${err instanceof Error ? err.message : String(err)}`

  logger.warn({ deploymentId: deployment.id, userId: deployment.userId, err }, reason)
  await deploymentDao.appendLog(deployment.id, `[billing] ${reason}; stopping deployment`, 'error')
  await deploymentDao.updateStatus(deployment.id, 'destroying', reason)
}

async function settleCloudDeploymentHourlyUsage(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  database: Database,
  now = new Date(),
) {
  if (!deployment.saasMode) return null
  const hourlyCost = deployment.hourlyCost ?? 0
  const lastBilledAt = deployment.lastHourlyBilledAt ?? deployment.updatedAt ?? deployment.createdAt
  const charge = calculateCloudHourlyBillingCharge({ lastBilledAt, now, hourlyCost })
  if (!charge) return null

  const walletDao = new WalletDao({ db: database })
  const ledgerService = new LedgerService({ walletDao, db: database })
  const result = await ledgerService.settleReservedMicros(
    deployment.userId,
    charge.amountMicros,
    0,
    cloudHourlyBillingSource(),
    createCloudHourlyBillingReferenceId(deployment.id, charge.billedUntil),
    'cloud_hourly',
    `Cloud deployment hourly usage: ${deployment.name}`,
  )

  await deploymentDao.updateLastHourlyBilledAt(deployment.id, charge.billedUntil)
  if (result.chargedAmount > 0) {
    await deploymentDao.appendLog(
      deployment.id,
      `[billing] Charged ${result.chargedAmount} Shrimp Coin(s) for ${charge.intervals * 15} minutes of deployment runtime`,
      'info',
    )
  }

  return { charge, result }
}

async function handleCloudHourlyBillingFailure(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  err: unknown,
) {
  const error = err as { status?: number; code?: string; balance?: number; shortfall?: number }
  if ((error.status ?? 500) === 402 || error.code === 'WALLET_INSUFFICIENT_BALANCE') {
    await deploymentDao.appendLog(
      deployment.id,
      `[billing] Wallet balance is insufficient for hourly deployment usage; stopping deployment (balance=${error.balance ?? 'unknown'}, shortfall=${error.shortfall ?? 'unknown'})`,
      'error',
    )
    await deploymentDao.updateStatus(
      deployment.id,
      'destroying',
      'wallet insufficient for cloud hourly billing',
    )
    return
  }

  logger.error(
    { deploymentId: deployment.id, userId: deployment.userId, err },
    'Cloud deployment hourly billing failed',
  )
  await deploymentDao
    .appendLog(
      deployment.id,
      `[billing] Hourly usage settlement failed: ${err instanceof Error ? err.message : String(err)}`,
      'error',
    )
    .catch(() => null)
}

export function isUserCancelledDeploymentError(
  token: Pick<RunningOperationToken, 'cancelled'>,
  message: string,
): boolean {
  return (
    token.cancelled ||
    message === 'Deployment cancelled by user' ||
    message === 'Destroy cancelled by user'
  )
}

export function hasReadyDeploymentRuntimeResources(
  recovery: DeploymentRecoveryProbeResult | null,
): recovery is DeploymentRecoveryProbeResult {
  return Boolean(
    recovery &&
      recovery.agentCount > 0 &&
      recovery.readyPods >= recovery.agentCount &&
      recovery.podNames.length >= recovery.agentCount,
  )
}

function isCloudDeploymentRecoveryEnabled(): boolean {
  return process.env.CLOUD_DEPLOYMENT_RECOVERY_MODE !== '0'
}

async function recoverDeploymentFromReadyRuntimeResources(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  database: Database,
  kubeconfig?: string,
): Promise<boolean> {
  const recovery = await probeDeploymentRuntimeResources(deployment.namespace, kubeconfig).catch(
    () => null,
  )
  if (!hasReadyDeploymentRuntimeResources(recovery)) return false

  await deploymentDao.appendLog(
    deployment.id,
    `[reconcile] Kubernetes has ${recovery.agentCount} ready OpenClaw pod(s) in namespace "${deployment.namespace}": ${recovery.podNames.join(', ')}`,
    'warn',
  )
  await reverseFailedCloudDeploymentRefundIfNeeded(deployment, database)
  await deploymentDao.appendLog(
    deployment.id,
    '[reconcile] Marking deployment as deployed to keep Shadow Cloud state consistent with Kubernetes.',
    'warn',
  )
  try {
    const billing = await markCloudDeploymentDeployedWithInitialBilling(
      deployment,
      deploymentDao,
      database,
      recovery.agentCount,
    )
    if (billing.charged) {
      await deploymentDao.appendLog(
        deployment.id,
        `[billing] Charged ${deployment.hourlyCost ?? 0} Shrimp Coin(s) for the first hourly runtime unit`,
        'info',
      )
    }
  } catch (err) {
    await handleInitialCloudHourlyBillingFailure(deployment, deploymentDao, err)
  }
  return true
}

export async function probeDeploymentRuntimeResources(
  namespace: string,
  kubeconfig?: string,
): Promise<DeploymentRecoveryProbeResult | null> {
  const pods = await listPodsAsync(namespace, kubeconfig)
  const workloadPods = pods.filter(
    (pod) => pod.status === 'Running' && pod.containers.includes('openclaw'),
  )
  if (workloadPods.length === 0) return null

  const readyPods = workloadPods.filter((pod) => {
    const [readyRaw, totalRaw] = pod.ready.split('/')
    const ready = Number(readyRaw)
    const total = Number(totalRaw)
    return Number.isFinite(ready) && Number.isFinite(total) && total > 0 && ready >= total
  }).length

  return {
    agentCount: workloadPods.length,
    podNames: workloadPods.map((pod) => pod.name),
    readyPods,
  }
}

export async function ensureNamespaceDeletionStarted(
  namespace: string,
  kubeconfig?: string,
  options: {
    exists?: NamespaceExistsFn
    deleteNamespace?: DeleteNamespaceFn
  } = {},
): Promise<NamespaceDeletionStartResult> {
  const namespaceExistsFn = options.exists ?? namespaceExists
  const deleteNamespaceFn = options.deleteNamespace ?? deleteNamespace

  const exists = namespaceExistsFn(namespace, kubeconfig)
  if (exists === false) return { status: 'already-deleted' }

  try {
    deleteNamespaceFn(namespace, kubeconfig)
    return { status: 'delete-requested' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/not found/i.test(msg)) return { status: 'already-deleted' }
    return { status: 'delete-failed', error: msg }
  }
}

function resolveDestroyVerifyTimeoutMs(): number {
  const raw = Number(process.env.CLOUD_DESTROY_VERIFY_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DESTROY_VERIFY_TIMEOUT_MS
}

/**
 * In-process registry of currently-running deploy operations.
 * Keyed by deployment.id. Used to wire cancellation requests to the live
 * Pulumi stack so we can call stack.cancel().
 */
const runningOperations = new Map<string, RunningOperationToken>()

const queueWaitLogThrottle = new Map<string, { key: string; loggedAt: number }>()
const autoPauseSkipLogThrottle = new Map<string, number>()

async function signalRunningOperationCancel(
  deploymentId: string,
  token: RunningOperationToken,
  reason: string,
  cancellationStatus?: OperationCancellationStatus,
): Promise<boolean> {
  token.cancelled = true
  if (cancellationStatus) token.cancellationStatus = cancellationStatus
  if (!token.stack || token.cancelSignalled) return true

  token.cancelSignalled = true
  try {
    logger.info({ deploymentId, reason }, 'Cancelling Pulumi stack')
    await token.stack.cancel()
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ deploymentId, error: msg }, 'stack.cancel() failed')
    return false
  }
}

export async function requestCloudDeploymentCancellation(deploymentId: string): Promise<boolean> {
  const token = runningOperations.get(deploymentId)
  if (!token) return false
  await signalRunningOperationCancel(deploymentId, token, 'user request', 'cancelling')
  return true
}

export async function requestCloudDeploymentDestroyInterruption(
  deploymentId: string,
): Promise<boolean> {
  const token = runningOperations.get(deploymentId)
  if (!token) return false
  await signalRunningOperationCancel(
    deploymentId,
    token,
    'destroy requested while operation is running',
    'destroying',
  )
  return true
}

function watchCancellationRequest(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  token: RunningOperationToken,
  statuses: readonly OperationCancellationStatus[] = ['cancelling'],
): () => void {
  const cancellableStatuses = new Set<DeploymentStatus>(statuses)
  const interval = setInterval(() => {
    if (token.cancelled) return

    void (async () => {
      const latest = await deploymentDao.findByIdOnly(deployment.id).catch(() => null)
      if (latest && cancellableStatuses.has(latest.status)) {
        await signalRunningOperationCancel(
          deployment.id,
          token,
          `deployment status changed to ${latest.status}`,
          latest.status as OperationCancellationStatus,
        )
      }
    })()
  }, 2_000)

  return () => clearInterval(interval)
}

export type CloudDeploymentProcessorHandle = {
  stop: () => Promise<void>
}

function createProcessorRuntime(options?: {
  database?: Database
  container?: ServiceContainer
  appContainer?: AppContainer
}): CloudDeploymentProcessorRuntime {
  const database = options?.database ?? (db as Database)
  return {
    container: options?.container ?? createContainer(),
    appContainer: options?.appContainer,
    database,
    deploymentDao: new CloudDeploymentDao({ db: database }),
    backupDao: new CloudDeploymentBackupDao({ db: database }),
    clusterDao: new CloudClusterDao({ db: database }),
    lastReconcileAt: 0,
  }
}

export async function processCloudDeploymentQueueOnce(options?: {
  database?: Database
  container?: ServiceContainer
  appContainer?: AppContainer
  reconcile?: boolean
  deploymentIds?: string[]
}): Promise<CloudDeploymentProcessorTickResult> {
  const runtime = createProcessorRuntime(options)
  return processCloudDeploymentQueueTick(runtime, {
    reconcile: options?.reconcile ?? true,
    deploymentIds: options?.deploymentIds,
  })
}

export function startCloudDeploymentProcessor(options?: {
  appContainer?: AppContainer
}): CloudDeploymentProcessorHandle {
  const enabled = process.env.ENABLE_CLOUD_DEPLOYMENT_PROCESSOR !== 'false'
  if (!enabled) {
    logger.info('Cloud deployment processor disabled (ENABLE_CLOUD_DEPLOYMENT_PROCESSOR=false)')
    return {
      stop: async () => {},
    }
  }

  let stopped = false
  const loopPromise = runLoop(() => stopped, options).catch((err) => {
    logger.error({ err }, 'Cloud deployment processor stopped unexpectedly')
  })

  return {
    stop: async () => {
      stopped = true
      await loopPromise
    },
  }
}

async function runLoop(
  isStopped: () => boolean,
  options?: { appContainer?: AppContainer },
): Promise<void> {
  const runtime = createProcessorRuntime(options)

  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, 'Cloud deployment processor started')

  while (!isStopped()) {
    try {
      await processCloudDeploymentQueueTick(runtime, { reconcile: true })
    } catch (err) {
      logger.error({ err }, 'Cloud deployment poll error')
    }

    if (!isStopped()) {
      await sleep(POLL_INTERVAL_MS)
    }
  }

  logger.info('Cloud deployment processor stopped')
}

async function processCloudDeploymentQueueTick(
  runtime: CloudDeploymentProcessorRuntime,
  options: { reconcile: boolean; deploymentIds?: string[] },
): Promise<CloudDeploymentProcessorTickResult> {
  const { deploymentDao, backupDao, clusterDao, container, appContainer, database } = runtime
  const deploymentIdFilter = options.deploymentIds ? new Set(options.deploymentIds) : null
  const includeDeployment = (deployment: CloudDeploymentRecord) =>
    !deploymentIdFilter || deploymentIdFilter.has(deployment.id)

  const pending = (await deploymentDao.listPending()).filter(includeDeployment)
  for (const deployment of pending) {
    await withLockedDeployment(
      deployment.id,
      ['pending'],
      deploymentDao,
      async (latestDeployment) => {
        await processDeployment(
          latestDeployment,
          deploymentDao,
          clusterDao,
          container,
          database,
          appContainer,
        )
      },
    )
  }

  const destroying = (await deploymentDao.listDestroying()).filter(includeDeployment)
  for (const deployment of destroying) {
    await withLockedDeployment(
      deployment.id,
      ['destroying'],
      deploymentDao,
      async (latestDeployment) => {
        await processDestroy(latestDeployment, deploymentDao, clusterDao, container, database)
      },
    )
  }

  const cancelling = (await deploymentDao.listCancelling()).filter(includeDeployment)
  for (const deployment of cancelling) {
    await withWorkerLockedDeployment(
      deployment.id,
      ['cancelling'],
      deploymentDao,
      async (latestDeployment) => {
        await processCancel(latestDeployment, deploymentDao)
      },
    )
  }

  const expired = (await deploymentDao.listExpiredTemporary(new Date())).filter(includeDeployment)
  for (const deployment of expired) {
    await withLockedDeployment(
      deployment.id,
      ['deployed', 'paused'],
      deploymentDao,
      async (latestDeployment) => {
        const expiresAt = latestDeployment.expiresAt?.toISOString?.() ?? 'unknown time'
        await deploymentDao.appendLog(
          latestDeployment.id,
          `[expiry] Temporary deployment expired at ${expiresAt}; queuing destroy`,
          'warn',
        )
        const destroying = await deploymentDao.updateStatusIfStatus(
          latestDeployment.id,
          latestDeployment.status,
          'destroying',
          'temporary deployment expired',
        )
        if (!destroying) return
        await processDestroy(destroying, deploymentDao, clusterDao, container, database)
      },
    )
  }

  const billable = (await deploymentDao.listHourlyBillable()).filter(includeDeployment)
  for (const deployment of billable) {
    await withWorkerLockedDeployment(
      deployment.id,
      ['deployed'],
      deploymentDao,
      async (latestDeployment) => {
        try {
          await settleCloudDeploymentHourlyUsage(latestDeployment, deploymentDao, database)
        } catch (err) {
          await handleCloudHourlyBillingFailure(latestDeployment, deploymentDao, err)
        }
      },
    )
  }

  let reconciled = false
  const now = Date.now()
  if (options.reconcile && now - runtime.lastReconcileAt >= RECONCILE_INTERVAL_MS) {
    runtime.lastReconcileAt = now
    reconciled = true
    await reconcileOrphans(deploymentDao, clusterDao).catch((err) => {
      logger.error({ err }, 'Cloud deployment reconcile error')
    })
    await reconcileReadyFailedDeployments(deploymentDao, clusterDao, database).catch((err) => {
      logger.error({ err }, 'Cloud failed deployment recovery error')
    })
    await reconcileStaleBackupOperations(backupDao, deploymentDao).catch((err) => {
      logger.error({ err }, 'Cloud backup operation reconcile error')
    })
    await reconcileStaleRestoreOperations(backupDao, deploymentDao, clusterDao, database).catch(
      (err) => {
        logger.error({ err }, 'Cloud restore operation reconcile error')
      },
    )
    await reconcileExpiredBackups(backupDao, deploymentDao, clusterDao, appContainer).catch(
      (err) => {
        logger.error({ err }, 'Cloud backup retention reconcile error')
      },
    )
    await reconcileIdleAutoPauseDeployments(deploymentDao, clusterDao, new Date(), {
      backupDao,
      appContainer,
    }).catch((err) => {
      logger.error({ err }, 'Cloud idle auto-pause reconcile error')
    })
  }

  return {
    pending: pending.length,
    destroying: destroying.length,
    cancelling: cancelling.length,
    expired: expired.length,
    reconciled,
  }
}

export async function reconcileStaleBackupOperations(
  backupDao: CloudDeploymentBackupDao,
  deploymentDao: CloudDeploymentDao,
) {
  const staleMs = Number.isFinite(CLOUD_BACKUP_OPERATION_STALE_MS)
    ? Math.max(60_000, CLOUD_BACKUP_OPERATION_STALE_MS)
    : 6 * 60 * 60_000
  const cutoff = new Date(Date.now() - staleMs)
  const staleBackups = await backupDao.listActiveUpdatedBefore(cutoff)
  if (staleBackups.length === 0) return

  for (const backup of staleBackups) {
    const error = `Backup operation did not update for ${Math.round(staleMs / 60_000)} minutes; marked failed during startup reconcile`
    const updated = await backupDao.failIfActive(backup.id, error)
    if (!updated) continue

    await deploymentDao
      .appendLog(
        backup.deploymentId,
        `[backup] ${error} (backup=${backup.id}, phase=${backup.phase})`,
        'error',
      )
      .catch((err) => {
        logger.warn(
          { err, deploymentId: backup.deploymentId, backupId: backup.id },
          'Failed to append stale backup reconcile log',
        )
      })
  }
}

export async function reconcileStaleRestoreOperations(
  backupDao: CloudDeploymentBackupDao,
  deploymentDao: CloudDeploymentDao,
  clusterDao?: CloudClusterDao,
  database?: Database,
) {
  const staleMs = Number.isFinite(CLOUD_RESTORE_OPERATION_STALE_MS)
    ? Math.max(60_000, CLOUD_RESTORE_OPERATION_STALE_MS)
    : 6 * 60 * 60_000
  const cutoff = new Date(Date.now() - staleMs)
  const staleRestores = await backupDao.listRestoringUpdatedBefore(cutoff)
  if (staleRestores.length === 0) return

  for (const backup of staleRestores) {
    const deployment = await deploymentDao.findByIdOnly(backup.deploymentId).catch(() => null)
    if (!deployment) {
      await backupDao.markRestoreCompletedIfRestoring(backup.id)
      continue
    }

    if (deployment.status !== 'resuming') {
      const updated =
        deployment.status === 'failed'
          ? await backupDao.markRestoreFailedIfRestoring(
              backup.id,
              deployment.errorMessage ?? 'Deployment left resuming in failed status',
            )
          : await backupDao.markRestoreCompletedIfRestoring(backup.id)
      if (!updated) continue
      await deploymentDao
        .appendLog(
          deployment.id,
          deployment.status === 'failed'
            ? `[restore] Marked restore phase failed for backup ${backup.id}; deployment status is already failed`
            : `[restore] Cleared stale restore phase for backup ${backup.id}; deployment status is already ${deployment.status}`,
          deployment.status === 'failed' ? 'error' : 'warn',
        )
        .catch(() => null)
      continue
    }

    let recovered = false
    if (clusterDao && database) {
      const cluster = await resolveClusterRuntime(deployment.clusterId, clusterDao).catch(
        () => null,
      )
      recovered = await recoverDeploymentFromReadyRuntimeResources(
        deployment,
        deploymentDao,
        database,
        cluster?.kubeconfig,
      ).catch(() => false)
    }

    if (recovered) {
      await backupDao.markRestoreCompletedIfRestoring(backup.id)
      await deploymentDao
        .appendLog(
          deployment.id,
          `[restore] Reconciled stale restore for backup ${backup.id}; runtime is ready`,
          'warn',
        )
        .catch(() => null)
      continue
    }

    const error = `Restore operation did not update for ${Math.round(staleMs / 60_000)} minutes; marked failed during startup reconcile`
    const failed = await deploymentDao.failIfStatus(deployment.id, 'resuming', error)
    const updated = await backupDao.markRestoreFailedIfRestoring(backup.id, error)
    if (!failed && !updated) continue

    await deploymentDao
      .appendLog(
        deployment.id,
        `[restore] ${error} (backup=${backup.id}, phase=${backup.phase})`,
        'error',
      )
      .catch((err) => {
        logger.warn(
          { err, deploymentId: deployment.id, backupId: backup.id },
          'Failed to append stale restore reconcile log',
        )
      })
  }
}

export async function reconcileExpiredBackups(
  backupDao: CloudDeploymentBackupDao,
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
  appContainer?: AppContainer,
) {
  const expired = await backupDao.listExpiredBefore(new Date())
  if (expired.length === 0) return

  for (const backup of expired) {
    const deployment = await deploymentDao.findByIdOnly(backup.deploymentId).catch(() => null)
    const cleanupErrors: string[] = []

    if (backup.objectKey) {
      if (!appContainer) {
        cleanupErrors.push('object storage cleanup unavailable')
      } else {
        const deleted = await appContainer
          .resolve('mediaService')
          .deletePrivateObject(backup.objectKey)
          .catch((err: unknown) => {
            cleanupErrors.push(err instanceof Error ? err.message : String(err))
            return false
          })
        if (!deleted) cleanupErrors.push('object artifact was not deleted')
      }
    }

    if (backup.snapshotName) {
      const cluster = deployment
        ? await resolveClusterRuntime(deployment.clusterId, clusterDao).catch(() => null)
        : null
      await deleteKubernetesResourceAsync({
        namespace: backup.namespace,
        kind: 'volumesnapshot',
        name: backup.snapshotName,
        kubeconfig: cluster?.kubeconfig,
        timeoutMs: 60_000,
      }).catch((err) => {
        cleanupErrors.push(err instanceof Error ? err.message : String(err))
      })
    }

    if (cleanupErrors.length > 0) {
      if (deployment) {
        await deploymentDao
          .appendLog(
            deployment.id,
            `[backup] Retention cleanup for backup ${backup.id} is pending: ${cleanupErrors.join('; ')}`,
            'warn',
          )
          .catch(() => null)
      }
      continue
    }

    const updated = await backupDao.markExpired(backup.id)
    if (!updated || !deployment) continue
    await deploymentDao
      .appendLog(
        deployment.id,
        `[backup] Backup ${backup.id} expired and artifacts were removed by retention policy`,
        'info',
      )
      .catch(() => null)
  }
}

function extractAutoPauseAgentConfigs(configSnapshot: unknown): AutoPauseAgentConfig[] {
  if (!configSnapshot || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return []
  }
  const deployments = (configSnapshot as { deployments?: unknown }).deployments
  if (!deployments || typeof deployments !== 'object' || Array.isArray(deployments)) return []
  if ((deployments as { backend?: unknown }).backend === 'deployment') return []

  const agents = (deployments as { agents?: unknown }).agents
  if (!Array.isArray(agents) || agents.length === 0) return []

  const minIdleSeconds = Number.isFinite(CLOUD_IDLE_AUTOPAUSE_MIN_SECONDS)
    ? Math.max(60, CLOUD_IDLE_AUTOPAUSE_MIN_SECONDS)
    : 60
  const result: AutoPauseAgentConfig[] = []
  for (const agent of agents) {
    if (!agent || typeof agent !== 'object' || Array.isArray(agent)) continue
    const record = agent as {
      id?: unknown
      replicas?: unknown
      sandbox?: { lifecycle?: Record<string, unknown> }
    }
    const agentId = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null
    if (!agentId) continue
    if (typeof record.replicas === 'number' && record.replicas > 1) continue

    const lifecycle = record.sandbox?.lifecycle
    if (!lifecycle || lifecycle.autoPause !== true) continue
    const idleSeconds =
      typeof lifecycle.idleSeconds === 'number' &&
      Number.isFinite(lifecycle.idleSeconds) &&
      lifecycle.idleSeconds > 0
        ? lifecycle.idleSeconds
        : 30 * 60
    result.push({
      agentId,
      idleSeconds: Math.max(minIdleSeconds, Math.floor(idleSeconds)),
      backupBeforePause: lifecycle.backupBeforePause === true,
    })
  }
  return result
}

export async function reconcileIdleAutoPauseDeployments(
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
  now = new Date(),
  options: {
    backupDao?: CloudDeploymentBackupDao
    appContainer?: AppContainer
  } = {},
) {
  const live = await deploymentDao.listLive()
  if (live.length === 0) return

  for (const deployment of live) {
    const configuredAgents = extractAutoPauseAgentConfigs(deployment.configSnapshot)
    if (configuredAgents.length === 0) continue

    const configuredAgentIds = new Set(configuredAgents.map((agent) => agent.agentId))
    const allAgents = extractRuntimeAgentIds(deployment.configSnapshot)
    if (allAgents.length > 0 && allAgents.some((agentId) => !configuredAgentIds.has(agentId))) {
      continue
    }

    if (
      configuredAgents.some((agent) => agent.backupBeforePause) &&
      (!options.appContainer || !options.backupDao)
    ) {
      const lastLoggedAt = autoPauseSkipLogThrottle.get(deployment.id) ?? 0
      if (now.getTime() - lastLoggedAt > 30 * 60_000) {
        autoPauseSkipLogThrottle.set(deployment.id, now.getTime())
        await deploymentDao
          .appendLog(
            deployment.id,
            '[auto-pause] Skipped idle pause because backupBeforePause is enabled but the backup runtime is unavailable',
            'warn',
          )
          .catch(() => null)
      }
      continue
    }

    const lastActiveAt =
      deployment.lastActiveAt instanceof Date ? deployment.lastActiveAt : deployment.updatedAt
    const idleSeconds = Math.floor((now.getTime() - lastActiveAt.getTime()) / 1000)
    const requiredIdleSeconds = Math.min(...configuredAgents.map((agent) => agent.idleSeconds))
    if (idleSeconds < requiredIdleSeconds) continue

    const acquired = await deploymentDao.tryAcquireOperationLock(deployment).catch(() => false)
    if (!acquired) continue

    try {
      const latest = await deploymentDao.findByIdOnly(deployment.id)
      if (!latest || latest.status !== 'deployed') continue

      const cluster = await resolveClusterRuntime(latest.clusterId, clusterDao).catch(() => null)
      await deploymentDao.appendLog(
        latest.id,
        `[auto-pause] Deployment idle for ${idleSeconds}s; pausing ${configuredAgents.length} sandbox agent(s)`,
        'info',
      )
      if (options.appContainer && options.backupDao) {
        const backupAgents = configuredAgents.filter((agent) => agent.backupBeforePause)
        for (const agent of backupAgents) {
          await runCloudDeploymentBackup({
            appContainer: options.appContainer,
            deploymentDao,
            backupDao: options.backupDao,
            deployment: latest,
            agentId: agent.agentId,
            kubeconfig: cluster?.kubeconfig,
            retentionDays: 7,
            reason: 'auto-pause',
          })
        }
      }
      for (const agent of configuredAgents) {
        await scaleAgentSandboxAsync(latest.namespace, agent.agentId, 0, cluster?.kubeconfig)
        await waitForAgentSandboxPaused({
          namespace: latest.namespace,
          agentName: agent.agentId,
          kubeconfig: cluster?.kubeconfig,
          timeoutMs: 120_000,
        })
      }
      await deploymentDao.updateStatus(latest.id, 'paused')
      await deploymentDao.appendLog(latest.id, '[auto-pause] Deployment paused after idle timeout')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await deploymentDao
        .appendLog(deployment.id, `[auto-pause] Failed: ${message}`, 'error')
        .catch(() => null)
    } finally {
      await deploymentDao.releaseOperationLock(deployment).catch(() => null)
    }
  }
}

export async function resumePausedDeploymentsForBuddyUsers(input: {
  deploymentDao: CloudDeploymentDao
  clusterDao: CloudClusterDao
  buddyUserIds: string[]
  reason: string
}) {
  const targetUserIds = new Set(input.buddyUserIds.filter(Boolean))
  if (targetUserIds.size === 0) return 0

  const paused = await input.deploymentDao.listPaused()
  let resumed = 0
  for (const deployment of paused) {
    const buddyUserIds = extractShadowProvisionBuddyUserIds(deployment.configSnapshot)
    if (!buddyUserIds.some((userId) => targetUserIds.has(userId))) continue

    const acquired = await input.deploymentDao
      .tryAcquireOperationLock(deployment)
      .catch(() => false)
    if (!acquired) continue

    try {
      const latest = await input.deploymentDao.findByIdOnly(deployment.id)
      if (!latest || latest.status !== 'paused') continue

      const agentIds = extractRuntimeAgentIds(latest.configSnapshot)
      if (agentIds.length === 0) continue
      const cluster = await resolveClusterRuntime(latest.clusterId, input.clusterDao).catch(
        () => null,
      )
      await input.deploymentDao.updateStatus(latest.id, 'resuming')
      await input.deploymentDao.appendLog(
        latest.id,
        `[auto-resume] Resuming ${agentIds.length} sandbox agent(s): ${input.reason}`,
        'info',
      )
      for (const agentId of agentIds) {
        await scaleAgentSandboxAsync(latest.namespace, agentId, 1, cluster?.kubeconfig)
        await waitForAgentSandboxReady({
          namespace: latest.namespace,
          agentName: agentId,
          kubeconfig: cluster?.kubeconfig,
          timeoutMs: 180_000,
        })
      }
      await input.deploymentDao.updateStatus(latest.id, 'deployed')
      await input.deploymentDao.appendLog(latest.id, '[auto-resume] Deployment is ready', 'info')
      resumed += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await input.deploymentDao.appendLog(
        deployment.id,
        `[auto-resume] Failed: ${message}`,
        'error',
      )
      await input.deploymentDao.updateStatus(deployment.id, 'failed', message)
    } finally {
      await input.deploymentDao.releaseOperationLock(deployment).catch(() => null)
    }
  }
  return resumed
}

export async function recordDeploymentActivityForBuddyUsers(input: {
  deploymentDao: CloudDeploymentDao
  buddyUserIds: string[]
  at?: Date
}) {
  const targetUserIds = new Set(input.buddyUserIds.filter(Boolean))
  if (targetUserIds.size === 0) return 0

  const live = await input.deploymentDao.listLive()
  let touched = 0
  for (const deployment of live) {
    const buddyUserIds = extractShadowProvisionBuddyUserIds(deployment.configSnapshot)
    if (!buddyUserIds.some((userId) => targetUserIds.has(userId))) continue
    await input.deploymentDao.recordActivity(deployment.id, input.at ?? new Date())
    touched += 1
  }
  return touched
}

function extractRuntimeAgentIds(configSnapshot: unknown): string[] {
  if (!configSnapshot || typeof configSnapshot !== 'object' || Array.isArray(configSnapshot)) {
    return []
  }
  const deployments = (configSnapshot as { deployments?: unknown }).deployments
  if (!deployments || typeof deployments !== 'object' || Array.isArray(deployments)) return []
  const agents = (deployments as { agents?: unknown }).agents
  if (!Array.isArray(agents)) return []
  return agents
    .map((agent) =>
      agent && typeof agent === 'object' && !Array.isArray(agent)
        ? (agent as { id?: unknown }).id
        : null,
    )
    .filter((agentId): agentId is string => typeof agentId === 'string' && agentId.trim() !== '')
}

async function withWorkerLockedDeployment(
  deploymentId: string,
  expectedStatuses: readonly DeploymentStatus[],
  deploymentDao: CloudDeploymentDao,
  run: (deployment: CloudDeploymentRecord) => Promise<void>,
): Promise<void> {
  const acquired = await deploymentDao.tryAcquireWorkerLock(deploymentId)
  if (!acquired) {
    return
  }

  try {
    const latest = await deploymentDao.findByIdOnly(deploymentId)
    if (!latest || !expectedStatuses.includes(latest.status)) {
      return
    }
    await run(latest)
  } finally {
    try {
      await deploymentDao.releaseWorkerLock(deploymentId)
    } catch {
      // best effort unlock
    }
  }
}

async function withLockedDeployment(
  deploymentId: string,
  expectedStatuses: readonly DeploymentStatus[],
  deploymentDao: CloudDeploymentDao,
  run: (deployment: CloudDeploymentRecord) => Promise<void>,
): Promise<void> {
  const acquired = await deploymentDao.tryAcquireWorkerLock(deploymentId)
  if (!acquired) {
    return
  }

  try {
    const latest = await deploymentDao.findByIdOnly(deploymentId)
    if (!latest || !expectedStatuses.includes(latest.status)) {
      return
    }

    const operationLockAcquired = await deploymentDao.tryAcquireOperationLock(latest)
    if (!operationLockAcquired) {
      await appendQueueWaitLog(latest, deploymentDao)
      return
    }

    try {
      const refreshed = await deploymentDao.findByIdOnly(deploymentId)
      if (!refreshed || !expectedStatuses.includes(refreshed.status)) {
        return
      }
      await run(refreshed)
    } finally {
      try {
        await deploymentDao.releaseOperationLock(latest)
      } catch {
        // best effort unlock
      }
    }
  } finally {
    try {
      await deploymentDao.releaseWorkerLock(deploymentId)
    } catch {
      // best effort unlock
    }
  }
}

async function appendQueueWaitLog(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
): Promise<void> {
  const blocker = await deploymentDao.findActiveOperationInNamespace({
    userId: deployment.userId,
    namespace: deployment.namespace,
    clusterId: deployment.clusterId,
    excludeId: deployment.id,
  })
  const throttleKey = blocker ? `${blocker.id}:${blocker.status}` : 'operation-lock'
  const previous = queueWaitLogThrottle.get(deployment.id)
  const now = Date.now()
  if (previous?.key === throttleKey && now - previous.loggedAt < QUEUE_WAIT_LOG_INTERVAL_MS) {
    return
  }

  queueWaitLogThrottle.set(deployment.id, { key: throttleKey, loggedAt: now })

  if (blocker) {
    await deploymentDao.appendLog(
      deployment.id,
      `[queue] Waiting for task ${blocker.id} (${blocker.status}) in namespace "${deployment.namespace}" to finish`,
      'info',
    )
    return
  }

  await deploymentDao.appendLog(
    deployment.id,
    `[queue] Waiting for namespace "${deployment.namespace}" operation lock to be released`,
    'info',
  )
}

async function resolveClusterRuntime(
  clusterId: string | null,
  clusterDao: CloudClusterDao,
): Promise<{ id: string; name: string; kubeconfig: string; context?: string } | null> {
  if (!clusterId) return null

  const cluster = await clusterDao.findByIdOnly(clusterId)
  if (!cluster?.kubeconfigEncrypted) return null
  const kubeconfig = decrypt(cluster.kubeconfigEncrypted)

  return {
    id: cluster.id,
    name: cluster.name,
    kubeconfig,
    context: extractKubeContext(kubeconfig),
  }
}

async function sleepUnlessCancelled(ms: number, isCancelled?: () => boolean): Promise<boolean> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < ms) {
    if (isCancelled?.()) return false
    await sleep(Math.min(250, ms - (Date.now() - startedAt)))
  }

  return !isCancelled?.()
}

export async function waitForNamespaceDeletion(
  namespace: string,
  kubeconfig?: string,
  options: {
    timeoutMs?: number
    intervalMs?: number
    isCancelled?: () => boolean
    exists?: NamespaceExistsFn
    onPoll?: (state: { exists: boolean | null; elapsedMs: number }) => void | Promise<void>
  } = {},
): Promise<NamespaceDeletionWaitResult> {
  const timeoutMs = options.timeoutMs ?? 180_000
  const intervalMs = options.intervalMs ?? 4_000
  const namespaceExistsFn = options.exists ?? namespaceExists
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (options.isCancelled?.()) return 'cancelled'

    const exists = namespaceExistsFn(namespace, kubeconfig)
    if (exists === false) return 'deleted'
    try {
      await options.onPoll?.({ exists, elapsedMs: Date.now() - startedAt })
    } catch {
      // Progress logging must never break destroy verification.
    }

    const remainingMs = timeoutMs - (Date.now() - startedAt)
    const slept = await sleepUnlessCancelled(Math.min(intervalMs, remainingMs), options.isCancelled)
    if (!slept) return 'cancelled'
  }

  return options.isCancelled?.() ? 'cancelled' : 'timeout'
}

async function processDeployment(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
  container: ServiceContainer,
  database: Database,
  appContainer?: AppContainer,
) {
  logger.info({ deploymentId: deployment.id, deploymentName: deployment.name }, 'Deploying stack')

  const cancelToken: RunningOperationToken = { cancelled: false }
  let stopWatchingCancellation = () => {}
  let activeKubeconfig: string | undefined

  try {
    const newer = await deploymentDao.findNewerCurrentInNamespace(deployment)
    if (newer) {
      const message = `Superseded by newer deployment ${newer.id}; skipping stale deploy for namespace "${deployment.namespace}"`
      await deploymentDao.appendLog(deployment.id, message, 'warn')
      await deploymentDao.updateStatus(deployment.id, 'failed', 'superseded-by-newer-deployment')
      await refundFailedCloudDeploymentCharge(
        deployment,
        database,
        'superseded by a newer deployment',
      )
      logger.warn({ deploymentId: deployment.id, newerDeploymentId: newer.id }, message)
      return
    }

    const deploying = await deploymentDao.updateStatusIfStatus(
      deployment.id,
      'pending',
      'deploying',
    )
    if (!deploying) {
      const latest = await deploymentDao.findByIdOnly(deployment.id).catch(() => null)
      if (latest?.status === 'destroying') {
        await deploymentDao.appendLog(
          deployment.id,
          '[destroy] Deploy task was interrupted before startup so destroy can proceed',
          'warn',
        )
      }
      return
    }
    await deploymentDao.appendLog(deployment.id, `Starting deployment: ${deployment.name}`, 'info')

    // Register once the task is claimed so /cancel can signal the live stack.
    runningOperations.set(deployment.id, cancelToken)
    stopWatchingCancellation = watchCancellationRequest(deployment, deploymentDao, cancelToken, [
      'cancelling',
      'destroying',
    ])

    const cluster = await resolveClusterRuntime(deployment.clusterId, clusterDao)
    activeKubeconfig = cluster?.kubeconfig
    const stackName = resolveDeploymentStackName(deployment)
    if (cluster) {
      await deploymentDao.appendLog(
        deployment.id,
        `Using BYOK cluster: ${cluster.name} (id=${cluster.id}, context=${cluster.context ?? 'unknown'})`,
        'info',
      )
    } else {
      await deploymentDao.appendLog(
        deployment.id,
        `Using platform/default cluster (context=${describeAmbientKubeContext()}, kubeconfig=${process.env.KUBECONFIG ?? '~/.kube/config'})`,
        'info',
      )
    }
    await deploymentDao.appendLog(deployment.id, `Pulumi stack: ${stackName}`, 'info')

    // Validate configSnapshot
    if (!deployment.configSnapshot) {
      throw new Error('No config snapshot found for this deployment. Cannot deploy.')
    }

    const {
      configSnapshot,
      envVars: runtimeEnvVars,
      context: runtimeContext,
      provisionState,
    } = extractCloudSaasRuntime(deployment.configSnapshot)

    if (!configSnapshot) {
      throw new Error('No valid config snapshot found for this deployment. Cannot deploy.')
    }

    const { shadowUrl, podShadowUrl } = resolveCloudSaasShadowRuntime(runtimeEnvVars)
    const shadowToken = await resolveDeploymentShadowProvisionToken(
      runtimeEnvVars,
      deployment.userId,
    )

    await deploymentDao.appendLog(
      deployment.id,
      'Config snapshot written, starting Pulumi deploy...',
      'info',
    )
    await deploymentDao.appendLog(
      deployment.id,
      `Resolved Shadow URLs: provision=${shadowUrl ?? '(unset)'} pod=${podShadowUrl ?? '(unset)'}`,
      'info',
    )

    let provisionStatePersisted = false
    let deployedConfigSnapshot: unknown = deployment.configSnapshot
    const persistProvisionState = async (state: NonNullable<typeof provisionState>) => {
      assertNoSecretsInProvisionState(state)
      const nextConfigSnapshot = attachCloudSaasProvisionState(deployment.configSnapshot, state)
      await deploymentDao.updateConfigSnapshot(deployment.id, nextConfigSnapshot)
      deployedConfigSnapshot = nextConfigSnapshot
      provisionStatePersisted = true
      await deploymentDao.appendLog(
        deployment.id,
        'Provision state persisted for future redeploys',
        'info',
      )
    }

    const result = await container.deploymentRuntime.deployFromSnapshot({
      configSnapshot,
      runtimeEnvVars,
      runtimeContext,
      namespace: deployment.namespace,
      stack: stackName,
      cluster,
      provisionState,
      onProvisionState: persistProvisionState,
      shadowUrl,
      k8sShadowUrl: podShadowUrl,
      shadowToken,
      onOutput: (out: string) => {
        process.stdout.write(`[deploy:${deployment.id}] ${out}`)
        deploymentDao.appendLog(deployment.id, out.trim(), 'info').catch(() => {})
      },
      onStackReady: (stack: { cancel: () => Promise<void> }) => {
        cancelToken.stack = stack
        if (cancelToken.cancelled && !cancelToken.cancelSignalled) {
          void signalRunningOperationCancel(
            deployment.id,
            cancelToken,
            'stack became ready after cancellation request',
            cancelToken.cancellationStatus,
          )
        }
      },
      isCancelled: () => cancelToken.cancelled,
    })

    if (cancelToken.cancelled) {
      // Stack apply finished after a cancel was requested; treat as cancelled.
      throw new Error('Deployment cancelled by user')
    }

    await deploymentDao.appendLog(
      deployment.id,
      `Deployment complete! ${result.agentCount} agent(s) in namespace "${result.namespace}"`,
      'info',
    )
    if (result.provisionState && !provisionStatePersisted) {
      await persistProvisionState(result.provisionState)
    }
    try {
      const billing = await markCloudDeploymentDeployedWithInitialBilling(
        deployment,
        deploymentDao,
        database,
        result.agentCount,
      )
      if (billing.charged) {
        await deploymentDao.appendLog(
          deployment.id,
          `[billing] Charged ${deployment.hourlyCost ?? 0} Shrimp Coin(s) for the first hourly runtime unit`,
          'info',
        )
      }
    } catch (err) {
      await handleInitialCloudHourlyBillingFailure(deployment, deploymentDao, err)
      return
    }

    if (appContainer) {
      try {
        await appContainer
          .resolve('greetingService')
          .ensureCloudDeploymentGreeting(deployment.userId, {
            id: deployment.id,
            status: 'deployed',
            name: deployment.name,
            templateSlug: deployment.templateSlug,
            configSnapshot: deployedConfigSnapshot,
          })
        await deploymentDao.appendLog(
          deployment.id,
          'Greeting workflow completed for provisioned server',
          'info',
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn({ deploymentId: deployment.id, error: message }, 'Deployment greeting failed')
        await deploymentDao.appendLog(deployment.id, `Greeting workflow failed: ${message}`, 'warn')
      }
    }

    logger.info(
      { deploymentId: deployment.id, agentCount: result.agentCount },
      'Deployment completed',
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cancelled = isUserCancelledDeploymentError(cancelToken, msg)

    if (cancelled) {
      const latest = await deploymentDao.findByIdOnly(deployment.id).catch(() => null)
      if (latest?.status === 'destroying') {
        await deploymentDao.appendLog(
          deployment.id,
          `[destroy] Cancelled active deploy so destroy can proceed: ${msg}`,
          'warn',
        )
        logger.warn({ deploymentId: deployment.id }, 'Deployment interrupted by destroy request')
        return
      }
    }

    if (cancelled) {
      logger.warn({ deploymentId: deployment.id, error: msg }, 'Deployment cancelled')
    } else {
      logger.error({ deploymentId: deployment.id, error: msg }, 'Deployment failed')
    }

    if (!cancelled && isCloudDeploymentRecoveryEnabled()) {
      const recovered = await recoverDeploymentFromReadyRuntimeResources(
        deployment,
        deploymentDao,
        database,
        activeKubeconfig,
      )
      if (recovered) return
    } else if (!cancelled) {
      await deploymentDao.appendLog(
        deployment.id,
        '[reconcile] Recovery probe skipped because CLOUD_DEPLOYMENT_RECOVERY_MODE is not enabled',
        'warn',
      )
    }

    await deploymentDao.appendLog(
      deployment.id,
      cancelled ? `Cancelled: ${msg}` : `Error: ${msg}`,
      cancelled ? 'warn' : 'error',
    )
    await deploymentDao.updateStatus(deployment.id, 'failed', cancelled ? 'cancelled by user' : msg)
    await refundFailedCloudDeploymentCharge(
      deployment,
      database,
      cancelled ? 'cancelled by user' : 'deployment failed',
    )
  } finally {
    stopWatchingCancellation()
    runningOperations.delete(deployment.id)
    queueWaitLogThrottle.delete(deployment.id)
  }
}

async function settleFinalCloudHourlyBillingForDestroy(
  destroyTask: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  database: Database,
) {
  const billableDeployment =
    (await deploymentDao.findLatestHourlyBillableInNamespace({
      userId: destroyTask.userId,
      clusterId: destroyTask.clusterId,
      namespace: destroyTask.namespace,
      excludeId: destroyTask.id,
    })) ?? (destroyTask.saasMode ? destroyTask : null)

  if (!billableDeployment) return

  try {
    await settleCloudDeploymentHourlyUsage(billableDeployment, deploymentDao, database)
  } catch (err) {
    logger.warn(
      { deploymentId: billableDeployment.id, destroyTaskId: destroyTask.id, err },
      'Final cloud hourly billing failed before destroy completion',
    )
    await deploymentDao
      .appendLog(
        destroyTask.id,
        `[billing] Final hourly usage settlement failed before destroy completion: ${err instanceof Error ? err.message : String(err)}`,
        'warn',
      )
      .catch(() => null)
  }
}

async function processDestroy(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
  container: ServiceContainer,
  database: Database,
) {
  logger.info({ deploymentId: deployment.id, deploymentName: deployment.name }, 'Destroying stack')
  await deploymentDao.appendLog(deployment.id, `Starting destroy: ${deployment.name}`, 'info')
  const cancelToken: RunningOperationToken = { cancelled: false }
  runningOperations.set(deployment.id, cancelToken)
  const stopWatchingCancellation = watchCancellationRequest(
    deployment,
    deploymentDao,
    cancelToken,
    ['cancelling'],
  )

  try {
    const newer = await deploymentDao.findNewerCurrentInNamespace(deployment)
    if (newer) {
      const message = `Superseded by newer deployment ${newer.id}; refusing to destroy namespace "${deployment.namespace}"`
      await deploymentDao.appendLog(deployment.id, message, 'warn')
      await deploymentDao.updateStatus(deployment.id, 'failed', 'superseded-by-newer-deployment')
      logger.warn({ deploymentId: deployment.id, newerDeploymentId: newer.id }, message)
      return
    }

    const cluster = await resolveClusterRuntime(deployment.clusterId, clusterDao)
    const { configSnapshot } = extractCloudSaasRuntime(deployment.configSnapshot)
    if (!configSnapshot) {
      throw new Error('No config snapshot found for this deployment. Cannot run Pulumi destroy.')
    }

    const clusterKubeconfig = cluster?.kubeconfig
    const stackName = resolveDeploymentStackName(deployment)
    await deploymentDao.appendLog(deployment.id, `Pulumi stack: ${stackName}`, 'info')
    await deploymentDao.appendLog(
      deployment.id,
      `Running Pulumi destroy for namespace "${deployment.namespace}"`,
      'info',
    )

    await container.deploymentRuntime.destroy({
      namespace: deployment.namespace,
      stack: stackName,
      cluster,
      configSnapshot,
      onStackReady: (stack: { cancel: () => Promise<void> }) => {
        cancelToken.stack = stack
      },
      isCancelled: () => cancelToken.cancelled,
    })

    if (cancelToken.cancelled) {
      throw new Error('Destroy cancelled by user')
    }

    await deploymentDao.appendLog(
      deployment.id,
      `Pulumi destroy finished; verifying namespace "${deployment.namespace}" is gone`,
      'info',
    )

    const deletionStart = await ensureNamespaceDeletionStarted(
      deployment.namespace,
      clusterKubeconfig,
    )
    if (deletionStart.status === 'already-deleted') {
      await deploymentDao.appendLog(
        deployment.id,
        `Namespace "${deployment.namespace}" is already absent after Pulumi destroy`,
        'info',
      )
    } else if (deletionStart.status === 'delete-requested') {
      await deploymentDao.appendLog(
        deployment.id,
        `[destroy] Kubernetes namespace deletion requested for "${deployment.namespace}"`,
        'info',
      )
    } else {
      throw new Error(
        `Failed to request Kubernetes namespace deletion for "${deployment.namespace}": ${deletionStart.error}`,
      )
    }

    let lastDeletionProgressLogAt = 0
    const namespaceDeletionResult = await waitForNamespaceDeletion(
      deployment.namespace,
      clusterKubeconfig,
      {
        timeoutMs: resolveDestroyVerifyTimeoutMs(),
        isCancelled: () => cancelToken.cancelled,
        onPoll: async ({ exists, elapsedMs }) => {
          const now = Date.now()
          if (now - lastDeletionProgressLogAt < 30_000) return
          lastDeletionProgressLogAt = now
          const pods = await listPodsAsync(deployment.namespace, clusterKubeconfig).catch(() => [])
          const podSummary =
            pods.length > 0
              ? pods.map((pod) => `${pod.name}:${pod.status}:${pod.ready}`).join(', ')
              : 'no pods listed'
          await deploymentDao.appendLog(
            deployment.id,
            `[destroy] Waiting for namespace "${deployment.namespace}" deletion (${Math.round(
              elapsedMs / 1000,
            )}s elapsed, exists=${exists === null ? 'unknown' : String(exists)}); remaining pods: ${podSummary}`,
            'info',
          )
        },
      },
    )

    if (namespaceDeletionResult === 'cancelled') {
      throw new Error('Destroy cancelled by user')
    }

    if (namespaceDeletionResult !== 'deleted') {
      const pods = await listPodsAsync(deployment.namespace, clusterKubeconfig).catch(() => [])
      const podSummary =
        pods.length > 0
          ? pods.map((pod) => `${pod.name}:${pod.status}:${pod.ready}`).join(', ')
          : 'no pods listed'
      await deploymentDao.appendLog(
        deployment.id,
        `[destroy] Namespace deletion verification timed out; remaining pods: ${podSummary}`,
        'error',
      )
      throw new Error(
        `Namespace "${deployment.namespace}" still exists after Pulumi destroy verification timed out`,
      )
    }

    await deploymentDao.appendLog(
      deployment.id,
      `Namespace "${deployment.namespace}" destroyed successfully`,
      'info',
    )
    await settleFinalCloudHourlyBillingForDestroy(deployment, deploymentDao, database)
    await deploymentDao.appendLog(deployment.id, 'Destroy complete!', 'info')
    await deploymentDao.markNamespaceRowsDestroyed(deployment)
    logger.info({ deploymentId: deployment.id }, 'Destroy completed')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cancelled = isUserCancelledDeploymentError(cancelToken, msg)
    logger.error({ deploymentId: deployment.id, error: msg }, 'Destroy failed')
    await deploymentDao.appendLog(
      deployment.id,
      cancelled ? `Destroy cancelled: ${msg}` : `Destroy error: ${msg}`,
      cancelled ? 'warn' : 'error',
    )
    await deploymentDao.updateStatus(
      deployment.id,
      'failed',
      cancelled ? 'cancelled by user' : `destroy: ${msg}`,
    )
  } finally {
    stopWatchingCancellation()
    runningOperations.delete(deployment.id)
    queueWaitLogThrottle.delete(deployment.id)
  }
}

/**
 * Honor a cancellation request:
 *   - If the deploy is running in this processor, signal cooperative cancel and
 *     ask the Pulumi stack to abort. processDeployment() will mark failed.
 *   - Otherwise (server restarted, or cancellation arrived before the deploy
 *     was picked up), mark failed directly.
 */
async function processCancel(deployment: CloudDeploymentRecord, deploymentDao: CloudDeploymentDao) {
  const live = runningOperations.get(deployment.id)
  if (live) {
    await signalRunningOperationCancel(
      deployment.id,
      live,
      'worker cancellation pass',
      'cancelling',
    )
    await deploymentDao.appendLog(
      deployment.id,
      '[cancel] Signal sent to in-progress operation',
      'warn',
    )
    return
  }

  // Not actively running here. The deploy may have been picked up by another
  // process (future), or never started, or already finished.
  await deploymentDao.appendLog(
    deployment.id,
    '[cancel] No live deploy found in this processor; marking failed',
    'warn',
  )
  await deploymentDao.updateStatus(deployment.id, 'failed', 'cancelled by user')
}

async function reconcileReadyFailedDeployments(
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
  database: Database,
) {
  if (!isCloudDeploymentRecoveryEnabled()) return

  const windowMs = Number.isFinite(FAILED_DEPLOYMENT_RECOVERY_WINDOW_MS)
    ? Math.max(0, FAILED_DEPLOYMENT_RECOVERY_WINDOW_MS)
    : 30 * 60_000
  if (windowMs <= 0) return

  const since = new Date(Date.now() - windowMs)
  const failed = await deploymentDao.listRecoverableFailedSince(since)
  for (const deployment of failed) {
    const cluster = await resolveClusterRuntime(deployment.clusterId, clusterDao).catch(() => null)
    await recoverDeploymentFromReadyRuntimeResources(
      deployment,
      deploymentDao,
      database,
      cluster?.kubeconfig,
    )
  }
}

/**
 * Orphan reconcile.
 *
 * For every deployed namespace in the DB, verify that the corresponding K8s
 * namespace exists. If not, mark the
 * deployment as failed with a clear reason so it shows up in the UI for the
 * user to take action.
 */
async function reconcileOrphans(deploymentDao: CloudDeploymentDao, clusterDao: CloudClusterDao) {
  const live = await deploymentDao.listLive()
  if (live.length === 0) return

  const namespaces = listAllManagedNamespaces()
  if (namespaces === null) return // kubectl unavailable; skip silently

  const presentNs = new Set(namespaces)

  for (const deployment of live) {
    const updatedAt = deployment.updatedAt instanceof Date ? deployment.updatedAt.getTime() : 0
    const orphanGraceMs = Number.isFinite(ORPHAN_RECONCILE_GRACE_MS)
      ? Math.max(0, ORPHAN_RECONCILE_GRACE_MS)
      : 10 * 60_000
    if (updatedAt > 0 && Date.now() - updatedAt < orphanGraceMs) continue

    if (presentNs.has(deployment.namespace)) continue
    // Skip deployments tied to a BYOK cluster we can't reach.
    if (deployment.clusterId) {
      try {
        const cluster = await clusterDao.findByIdOnly(deployment.clusterId)
        if (cluster?.kubeconfigEncrypted) {
          // Best-effort: use the cluster's kubeconfig before declaring orphan.
          const kubeconfig = decrypt(cluster.kubeconfigEncrypted)
          const exists = namespaceExists(deployment.namespace, kubeconfig)
          if (exists === true) {
            continue
          }
          if (exists === null) {
            continue
          }
        }
      } catch {
        /* ignore — fall through to mark orphan */
      }
    }
    logger.warn(
      { deploymentId: deployment.id, namespace: deployment.namespace },
      'Orphan detected: namespace missing on cluster',
    )
    await deploymentDao.appendLog(
      deployment.id,
      `[reconcile] Namespace "${deployment.namespace}" no longer exists on the cluster`,
      'error',
    )
    await deploymentDao.updateStatus(deployment.id, 'failed', 'orphaned-by-cluster')
  }
}

/**
 * Return all K8s namespaces tagged as managed by Shadow Cloud, or `null` if
 * `kubectl` is unavailable.
 */
function listAllManagedNamespaces(): string[] | null {
  return listManagedNamespaces()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
