/**
 * Cloud deployment processor — polls cloud_deployments and executes lifecycle actions.
 *
 * Runs in-process with the server. Requires access to PostgreSQL and a reachable
 * Kubernetes cluster via KUBECONFIG.
 */
import {
  createContainer,
  deleteNamespace,
  extractCloudSaasRuntime,
  listManagedNamespaces,
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

type CloudDeploymentRecord = NonNullable<Awaited<ReturnType<CloudDeploymentDao['findByIdOnly']>>>
type DeploymentStatus = CloudDeploymentRecord['status']

/**
 * In-process registry of currently-running deploy operations.
 * Keyed by deployment.id. Used to wire cancellation requests to the live
 * Pulumi stack so we can call stack.cancel().
 */
const runningDeploys = new Map<
  string,
  {
    cancelled: boolean
    stack?: { cancel: () => Promise<void> }
  }
>()

export type CloudDeploymentProcessorHandle = {
  stop: () => Promise<void>
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
  const container = createContainer()

  const deploymentDao = new CloudDeploymentDao({
    db: db as Database,
  })
  const clusterDao = new CloudClusterDao({
    db: db as Database,
  })

  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, 'Cloud deployment processor started')

  let lastReconcileAt = 0

  while (!isStopped()) {
    try {
      // 1. Process pending deployments (deploy)
      const pending = await deploymentDao.listPending()
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

      // 2. Process destroying deployments
      const destroying = await deploymentDao.listDestroying()
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

      // 3. Honor cancel requests
      const cancelling = await deploymentDao.listCancelling()
      for (const deployment of cancelling) {
        await withLockedDeployment(
          deployment.id,
          ['cancelling'],
          deploymentDao,
          async (latestDeployment) => {
            await processCancel(latestDeployment, deploymentDao)
          },
        )
      }

      // 4. Periodic orphan reconcile
      const now = Date.now()
      if (now - lastReconcileAt >= RECONCILE_INTERVAL_MS) {
        lastReconcileAt = now
        await reconcileOrphans(deploymentDao, clusterDao).catch((err) => {
          logger.error({ err }, 'Cloud deployment reconcile error')
        })
      }
    } catch (err) {
      logger.error({ err }, 'Cloud deployment poll error')
    }

    if (!isStopped()) {
      await sleep(POLL_INTERVAL_MS)
    }
  }

  logger.info('Cloud deployment processor stopped')
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

    await run(latest)
  } finally {
    try {
      await deploymentDao.releaseWorkerLock(deploymentId)
    } catch {
      // best effort unlock
    }
  }
}

async function resolveClusterRuntime(
  clusterId: string | null,
  clusterDao: CloudClusterDao,
): Promise<{ name: string; kubeconfig: string } | null> {
  if (!clusterId) return null

  const cluster = await clusterDao.findByIdOnly(clusterId)
  if (!cluster?.kubeconfigEncrypted) return null

  return {
    name: cluster.name,
    kubeconfig: decrypt(cluster.kubeconfigEncrypted),
  }
}

async function waitForNamespaceDeletion(
  namespace: string,
  kubeconfig?: string,
  timeoutMs = 180_000,
  intervalMs = 4_000,
): Promise<boolean> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const exists = namespaceExists(namespace, kubeconfig)
    if (exists === false) return true
    await sleep(intervalMs)
  }

  return false
}

async function processDeployment(
  deployment: CloudDeploymentRecord,
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
  container: ServiceContainer,
) {
  logger.info({ deploymentId: deployment.id, deploymentName: deployment.name }, 'Deploying stack')
  await deploymentDao.updateStatus(deployment.id, 'deploying')
  await deploymentDao.appendLog(deployment.id, `Starting deployment: ${deployment.name}`, 'info')

  // Register in the runningDeploys map so that a /cancel request mid-flight
  // can find this deploy and call stack.cancel() on it.
  const cancelToken: { cancelled: boolean; stack?: { cancel: () => Promise<void> } } = {
    cancelled: false,
  }
  runningDeploys.set(deployment.id, cancelToken)

  try {
    const cluster = await resolveClusterRuntime(deployment.clusterId, clusterDao)
    if (cluster) {
      await deploymentDao.appendLog(deployment.id, `Using BYOK cluster: ${cluster.name}`, 'info')
    }

    // Validate configSnapshot
    if (!deployment.configSnapshot) {
      throw new Error('No config snapshot found for this deployment. Cannot deploy.')
    }

    const { configSnapshot, envVars: runtimeEnvVars } = extractCloudSaasRuntime(
      deployment.configSnapshot,
    )

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

    const result = await container.deploymentRuntime.deployFromSnapshot({
      configSnapshot,
      runtimeEnvVars,
      namespace: deployment.namespace,
      stack: deployment.id,
      cluster,
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
    await deploymentDao.updateStatus(deployment.id, 'deployed')
    logger.info(
      { deploymentId: deployment.id, agentCount: result.agentCount },
      'Deployment completed',
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cancelled = cancelToken.cancelled || /cancel/i.test(msg)
    logger.error({ deploymentId: deployment.id, error: msg }, 'Deployment failed')
    await deploymentDao.appendLog(
      deployment.id,
      cancelled ? `Cancelled: ${msg}` : `Error: ${msg}`,
      cancelled ? 'warn' : 'error',
    )
    await deploymentDao.updateStatus(deployment.id, 'failed', cancelled ? 'cancelled by user' : msg)
  } finally {
    runningDeploys.delete(deployment.id)
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

  try {
    const cluster = await resolveClusterRuntime(deployment.clusterId, clusterDao)
    const { configSnapshot } = extractCloudSaasRuntime(deployment.configSnapshot)
    const clusterKubeconfig = cluster?.kubeconfig

    await container.deploymentRuntime.destroy({
      namespace: deployment.namespace,
      stack: deployment.id,
      cluster,
      configSnapshot,
    })

    let namespaceDeleted = await waitForNamespaceDeletion(
      deployment.namespace,
      clusterKubeconfig,
      30_000,
    )
    if (!namespaceDeleted) {
      await deploymentDao.appendLog(
        deployment.id,
        `Namespace "${deployment.namespace}" still exists after stack destroy; issuing direct namespace delete`,
        'warn',
      )
      deleteNamespace(deployment.namespace, clusterKubeconfig)
      namespaceDeleted = await waitForNamespaceDeletion(deployment.namespace, clusterKubeconfig)
    }

    if (!namespaceDeleted) {
      throw new Error(`Namespace "${deployment.namespace}" still exists after destroy`)
    }

    await deploymentDao.appendLog(
      deployment.id,
      `Namespace "${deployment.namespace}" destroyed successfully`,
      'info',
    )
    await deploymentDao.updateStatus(deployment.id, 'destroyed')
    logger.info({ deploymentId: deployment.id }, 'Destroy completed')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ deploymentId: deployment.id, error: msg }, 'Destroy failed')
    await deploymentDao.appendLog(deployment.id, `Destroy error: ${msg}`, 'error')
    await deploymentDao.updateStatus(deployment.id, 'failed', `destroy: ${msg}`)
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
  const live = runningDeploys.get(deployment.id)
  if (live) {
    live.cancelled = true
    if (live.stack) {
      try {
        logger.info({ deploymentId: deployment.id }, 'Cancelling Pulumi stack')
        await live.stack.cancel()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error({ deploymentId: deployment.id, error: msg }, 'stack.cancel() failed')
      }
    }
    await deploymentDao.appendLog(
      deployment.id,
      '[cancel] Signal sent to in-progress deploy',
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
 * For every "live" deployment in the DB (status ∈ {deployed, deploying, cancelling}),
 * verify that the corresponding K8s namespace exists. If not, mark the
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
