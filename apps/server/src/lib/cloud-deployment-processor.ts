/**
 * Cloud deployment processor — polls cloud_deployments and executes lifecycle actions.
 *
 * Runs in-process with the server. Requires access to PostgreSQL and a reachable
 * Kubernetes cluster via KUBECONFIG.
 */
import { createHash } from 'node:crypto'
import {
  attachCloudSaasProvisionState,
  createContainer,
  deleteNamespace,
  extractCloudSaasRuntime,
  listManagedNamespaces,
  listPodsAsync,
  namespaceExists,
  resolveCloudSaasShadowRuntime,
  type ServiceContainer,
} from '@shadowob/cloud'
import { CloudClusterDao } from '../dao/cloud-cluster.dao'
import { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { Database } from '../db'
import { db } from '../db'
import { decrypt } from './kms'
import { logger } from './logger'

const POLL_INTERVAL_MS = Number(
  process.env.CLOUD_WORKER_POLL_INTERVAL_MS ?? process.env.POLL_INTERVAL_MS ?? 5000,
)
const RECONCILE_INTERVAL_MS = Number(process.env.RECONCILE_INTERVAL_MS ?? 60_000)
const DEFAULT_DESTROY_VERIFY_TIMEOUT_MS = 600_000
const QUEUE_WAIT_LOG_INTERVAL_MS = Number(process.env.CLOUD_QUEUE_WAIT_LOG_INTERVAL_MS ?? 30_000)

type CloudDeploymentRecord = NonNullable<Awaited<ReturnType<CloudDeploymentDao['findByIdOnly']>>>
type DeploymentStatus = CloudDeploymentRecord['status']
type RunningOperationToken = {
  cancelled: boolean
  stack?: { cancel: () => Promise<void> }
  cancelSignalled?: boolean
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
type CloudDeploymentProcessorRuntime = {
  deploymentDao: CloudDeploymentDao
  clusterDao: CloudClusterDao
  container: ServiceContainer
  lastReconcileAt: number
}

export type CloudDeploymentProcessorTickResult = {
  pending: number
  destroying: number
  cancelling: number
  reconciled: boolean
}

function extractKubeContext(kubeconfigYaml: string): string | undefined {
  const match = kubeconfigYaml.match(/current-context:\s*(\S+)/)
  return match?.[1]
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

async function signalRunningOperationCancel(
  deploymentId: string,
  token: RunningOperationToken,
  reason: string,
): Promise<boolean> {
  token.cancelled = true
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
  await signalRunningOperationCancel(deploymentId, token, 'user request')
  return true
}

function watchCancellationRequest(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  token: RunningOperationToken,
): () => void {
  const interval = setInterval(() => {
    if (token.cancelled) return

    void (async () => {
      const latest = await deploymentDao.findByIdOnly(deployment.id).catch(() => null)
      if (latest?.status === 'cancelling') {
        await signalRunningOperationCancel(
          deployment.id,
          token,
          'deployment status changed to cancelling',
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
}): CloudDeploymentProcessorRuntime {
  const database = options?.database ?? (db as Database)
  return {
    container: options?.container ?? createContainer(),
    deploymentDao: new CloudDeploymentDao({ db: database }),
    clusterDao: new CloudClusterDao({ db: database }),
    lastReconcileAt: 0,
  }
}

export async function processCloudDeploymentQueueOnce(options?: {
  database?: Database
  container?: ServiceContainer
  reconcile?: boolean
  deploymentIds?: string[]
}): Promise<CloudDeploymentProcessorTickResult> {
  const runtime = createProcessorRuntime(options)
  return processCloudDeploymentQueueTick(runtime, {
    reconcile: options?.reconcile ?? true,
    deploymentIds: options?.deploymentIds,
  })
}

export function startCloudDeploymentProcessor(): CloudDeploymentProcessorHandle {
  const enabled = process.env.ENABLE_CLOUD_DEPLOYMENT_PROCESSOR !== 'false'
  if (!enabled) {
    logger.info('Cloud deployment processor disabled (ENABLE_CLOUD_DEPLOYMENT_PROCESSOR=false)')
    return {
      stop: async () => {},
    }
  }

  let stopped = false
  const loopPromise = runLoop(() => stopped).catch((err) => {
    logger.error({ err }, 'Cloud deployment processor stopped unexpectedly')
  })

  return {
    stop: async () => {
      stopped = true
      await loopPromise
    },
  }
}

async function runLoop(isStopped: () => boolean): Promise<void> {
  const runtime = createProcessorRuntime()

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
  const { deploymentDao, clusterDao, container } = runtime
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
        await processDeployment(latestDeployment, deploymentDao, clusterDao, container)
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
        await processDestroy(latestDeployment, deploymentDao, clusterDao, container)
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

  let reconciled = false
  const now = Date.now()
  if (options.reconcile && now - runtime.lastReconcileAt >= RECONCILE_INTERVAL_MS) {
    runtime.lastReconcileAt = now
    reconciled = true
    await reconcileOrphans(deploymentDao, clusterDao).catch((err) => {
      logger.error({ err }, 'Cloud deployment reconcile error')
    })
  }

  return {
    pending: pending.length,
    destroying: destroying.length,
    cancelling: cancelling.length,
    reconciled,
  }
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
      logger.warn({ deploymentId: deployment.id, newerDeploymentId: newer.id }, message)
      return
    }

    await deploymentDao.updateStatus(deployment.id, 'deploying')
    await deploymentDao.appendLog(deployment.id, `Starting deployment: ${deployment.name}`, 'info')

    // Register once the task is claimed so /cancel can signal the live stack.
    runningOperations.set(deployment.id, cancelToken)
    stopWatchingCancellation = watchCancellationRequest(deployment, deploymentDao, cancelToken)

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
        `Using platform/default cluster (context=${process.env.KUBECONFIG_CONTEXT ?? 'rancher-desktop'}, kubeconfig=${process.env.KUBECONFIG ?? '~/.kube/config'})`,
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
      provisionState,
    } = extractCloudSaasRuntime(deployment.configSnapshot)

    if (!configSnapshot) {
      throw new Error('No valid config snapshot found for this deployment. Cannot deploy.')
    }

    const { shadowUrl, podShadowUrl, shadowToken } = resolveCloudSaasShadowRuntime(runtimeEnvVars)

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
    const persistProvisionState = async (state: NonNullable<typeof provisionState>) => {
      await deploymentDao.updateConfigSnapshot(
        deployment.id,
        attachCloudSaasProvisionState(deployment.configSnapshot, state),
      )
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
    await deploymentDao.markDeployed(deployment.id, result.agentCount)
    logger.info(
      { deploymentId: deployment.id, agentCount: result.agentCount },
      'Deployment completed',
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cancelled = cancelToken.cancelled || /cancel/i.test(msg)
    logger.error({ deploymentId: deployment.id, error: msg }, 'Deployment failed')

    if (!cancelled) {
      const recovery = await probeDeploymentRuntimeResources(
        deployment.namespace,
        activeKubeconfig,
      ).catch(() => null)
      if (recovery) {
        await deploymentDao.appendLog(
          deployment.id,
          `[reconcile] Pulumi reported failure, but ${recovery.agentCount} OpenClaw pod(s) exist in namespace "${deployment.namespace}" (${recovery.readyPods}/${recovery.agentCount} ready): ${recovery.podNames.join(', ')}`,
          'warn',
        )
        await deploymentDao.appendLog(
          deployment.id,
          '[reconcile] Marking deployment as deployed to keep Shadow Cloud state consistent with Kubernetes. Review pod readiness and logs from the namespace page.',
          'warn',
        )
        await deploymentDao.markDeployed(deployment.id, recovery.agentCount)
        return
      }
    }

    await deploymentDao.appendLog(
      deployment.id,
      cancelled ? `Cancelled: ${msg}` : `Error: ${msg}`,
      cancelled ? 'warn' : 'error',
    )
    await deploymentDao.updateStatus(deployment.id, 'failed', cancelled ? 'cancelled by user' : msg)
  } finally {
    stopWatchingCancellation()
    runningOperations.delete(deployment.id)
    queueWaitLogThrottle.delete(deployment.id)
  }
}

async function processDestroy(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
  container: ServiceContainer,
) {
  logger.info({ deploymentId: deployment.id, deploymentName: deployment.name }, 'Destroying stack')
  await deploymentDao.appendLog(deployment.id, `Starting destroy: ${deployment.name}`, 'info')
  const cancelToken: RunningOperationToken = { cancelled: false }
  runningOperations.set(deployment.id, cancelToken)
  const stopWatchingCancellation = watchCancellationRequest(deployment, deploymentDao, cancelToken)

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
    await deploymentDao.markNamespaceRowsDestroyed(deployment)
    logger.info({ deploymentId: deployment.id }, 'Destroy completed')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cancelled = cancelToken.cancelled || /cancel/i.test(msg)
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
    await signalRunningOperationCancel(deployment.id, live, 'worker cancellation pass')
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
