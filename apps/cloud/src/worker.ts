/**
 * Cloud Worker — polls cloud_deployments and executes lifecycle actions.
 *
 * Runs as a separate container. Requires access to the same PostgreSQL database
 * as apps/server, plus a running K8s cluster via KUBECONFIG.
 *
 * Lifecycle states handled:
 *   - pending     → execute deploy, transition to deployed/failed
 *   - destroying  → execute destroy, transition to destroyed/failed
 *   - cancelling  → if a deploy is currently running for this id, ask the
 *                   Pulumi stack to cancel; otherwise transition to failed
 *
 * In addition, the worker periodically reconciles DB ↔ K8s state to detect:
 *   - DB rows that point at namespaces no longer present on the cluster
 *     ("orphaned by cluster") — marked failed
 *
 * Environment variables:
 *   DATABASE_URL           — PostgreSQL connection string
 *   POLL_INTERVAL_MS       — how often to poll (default: 5000)
 *   RECONCILE_INTERVAL_MS  — how often to run orphan reconcile (default: 60000)
 *   KMS_MASTER_KEY         — 32-byte hex key for decrypting kubeconfigs
 *   SHADOW_SERVER_URL      — Shadow server URL injected into deployed agents
 *   KUBECONFIG             — Default kubeconfig path (overridden per-deployment)
 *   KUBECONFIG_CONTEXT     — Default K8s context name (overridden per-deployment)
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { CloudClusterDao } from '../../server/src/dao/cloud-cluster.dao'
import { CloudDeploymentDao } from '../../server/src/dao/cloud-deployment.dao'
import * as schema from '../../server/src/db/schema'
import { decrypt } from '../../server/src/lib/kms'
import { createContainer } from './services/container'

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000)
const RECONCILE_INTERVAL_MS = Number(process.env.RECONCILE_INTERVAL_MS ?? 60_000)

/**
 * In-process registry of currently-running deploy operations.
 * Keyed by deployment.id. Used to wire cancellation requests to the live
 * Pulumi stack so we can call `stack.cancel()`.
 */
const runningDeploys = new Map<
  string,
  {
    cancelled: boolean
    stack?: { cancel: () => Promise<void> }
  }
>()

async function main() {
  const client = postgres(process.env.DATABASE_URL!)
  const db = drizzle(client, { schema })

  const deploymentDao = new CloudDeploymentDao({
    db: db as Parameters<typeof CloudDeploymentDao.prototype.constructor>[0]['db'],
  })
  const clusterDao = new CloudClusterDao({
    db: db as Parameters<typeof CloudClusterDao.prototype.constructor>[0]['db'],
  })

  console.log('[cloud-worker] Started, polling every', POLL_INTERVAL_MS, 'ms')

  let lastReconcileAt = 0

  while (true) {
    try {
      // 1. Process pending deployments (deploy)
      const pending = await deploymentDao.listPending()
      for (const deployment of pending) {
        // Don't await — run concurrently so cancel-poll can still fire promptly.
        // But to keep semantics simple (single-stack-per-deploy id) we await.
        await processDeployment(deployment, deploymentDao, clusterDao)
      }

      // 2. Process destroying deployments
      const destroying = await deploymentDao.listDestroying()
      for (const deployment of destroying) {
        await processDestroy(deployment, deploymentDao, clusterDao)
      }

      // 3. Honor cancel requests
      const cancelling = await deploymentDao.listCancelling()
      for (const deployment of cancelling) {
        await processCancel(deployment, deploymentDao)
      }

      // 4. Periodic orphan reconcile
      const now = Date.now()
      if (now - lastReconcileAt >= RECONCILE_INTERVAL_MS) {
        lastReconcileAt = now
        await reconcileOrphans(deploymentDao, clusterDao).catch((err) => {
          console.error('[cloud-worker] Reconcile error:', err)
        })
      }
    } catch (err) {
      console.error('[cloud-worker] Poll error:', err)
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

/**
 * Write a kubeconfig string to a temp file and return its path.
 * Caller is responsible for deleting the file after use.
 */
function writeKubeconfigTemp(kubeconfig: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-kube-'))
  const kubeconfigPath = join(dir, 'kubeconfig')
  writeFileSync(kubeconfigPath, kubeconfig, { mode: 0o600 })
  return kubeconfigPath
}

/**
 * Write a config snapshot object to a temp JSON file.
 * Caller is responsible for deleting the file after use.
 */
function writeConfigTemp(configSnapshot: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-cfg-'))
  const configPath = join(dir, 'shadowob-cloud.json')
  writeFileSync(configPath, JSON.stringify(configSnapshot), 'utf-8')
  return configPath
}

/**
 * Extract the first context name from a kubeconfig YAML string.
 * Falls back to 'default' if parsing fails.
 */
function extractKubeContext(kubeconfigYaml: string): string | undefined {
  const match = kubeconfigYaml.match(/current-context:\s*(\S+)/)
  return match?.[1]
}

async function processDeployment(
  deployment: Awaited<ReturnType<CloudDeploymentDao['listPending']>>[number],
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
) {
  console.log(`[cloud-worker] Deploying ${deployment.id} (${deployment.name})`)
  await deploymentDao.updateStatus(deployment.id, 'deploying')
  await deploymentDao.appendLog(deployment.id, `Starting deployment: ${deployment.name}`, 'info')

  // Register in the runningDeploys map so that a /cancel request mid-flight
  // can find this deploy and call stack.cancel() on it.
  const cancelToken: { cancelled: boolean; stack?: { cancel: () => Promise<void> } } = {
    cancelled: false,
  }
  runningDeploys.set(deployment.id, cancelToken)

  const tmpFiles: string[] = []
  const originalKubeconfig = process.env.KUBECONFIG
  const originalKubeContext = process.env.KUBECONFIG_CONTEXT

  try {
    // Resolve kubeconfig for BYOK clusters
    let k8sContext: string | undefined
    if (deployment.clusterId) {
      const cluster = await clusterDao.findByIdOnly(deployment.clusterId)
      if (cluster?.kubeconfigEncrypted) {
        const kubeconfig = decrypt(cluster.kubeconfigEncrypted)
        const kubeconfigPath = writeKubeconfigTemp(kubeconfig)
        tmpFiles.push(kubeconfigPath)
        process.env.KUBECONFIG = kubeconfigPath
        k8sContext = extractKubeContext(kubeconfig)
        if (k8sContext) process.env.KUBECONFIG_CONTEXT = k8sContext
        await deploymentDao.appendLog(deployment.id, `Using BYOK cluster: ${cluster.name}`, 'info')
      }
    }

    // Validate configSnapshot
    if (!deployment.configSnapshot) {
      throw new Error('No config snapshot found for this deployment. Cannot deploy.')
    }

    const configPath = writeConfigTemp(deployment.configSnapshot)
    tmpFiles.push(configPath)
    await deploymentDao.appendLog(
      deployment.id,
      'Config snapshot written, starting Pulumi deploy...',
      'info',
    )

    const container = createContainer()

    const result = await container.deploy.up({
      filePath: configPath,
      namespace: deployment.namespace,
      stack: deployment.id,
      k8sContext,
      shadowUrl: process.env.SHADOW_SERVER_URL,
      onOutput: (out) => {
        process.stdout.write(`[deploy:${deployment.id}] ${out}`)
        deploymentDao.appendLog(deployment.id, out.trim(), 'info').catch(() => {})
      },
      onStackReady: (stack) => {
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
    console.log(
      `[cloud-worker] Deployment ${deployment.id} completed (${result.agentCount} agents)`,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cancelled = cancelToken.cancelled || /cancel/i.test(msg)
    console.error(`[cloud-worker] Deployment ${deployment.id} failed:`, msg)
    await deploymentDao.appendLog(
      deployment.id,
      cancelled ? `Cancelled: ${msg}` : `Error: ${msg}`,
      cancelled ? 'warn' : 'error',
    )
    await deploymentDao.updateStatus(deployment.id, 'failed', cancelled ? 'cancelled by user' : msg)
  } finally {
    runningDeploys.delete(deployment.id)
    if (originalKubeconfig !== undefined) {
      process.env.KUBECONFIG = originalKubeconfig
    } else {
      delete process.env.KUBECONFIG
    }
    if (originalKubeContext !== undefined) {
      process.env.KUBECONFIG_CONTEXT = originalKubeContext
    } else {
      delete process.env.KUBECONFIG_CONTEXT
    }
    for (const f of tmpFiles) {
      try {
        const dir =
          f.endsWith('kubeconfig') || f.endsWith('shadowob-cloud.json') ? join(f, '..') : f
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
}

async function processDestroy(
  deployment: Awaited<ReturnType<CloudDeploymentDao['listDestroying']>>[number],
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
) {
  console.log(`[cloud-worker] Destroying ${deployment.id} (${deployment.name})`)
  await deploymentDao.appendLog(deployment.id, `Starting destroy: ${deployment.name}`, 'info')

  const tmpFiles: string[] = []
  const originalKubeconfig = process.env.KUBECONFIG
  const originalKubeContext = process.env.KUBECONFIG_CONTEXT

  try {
    let k8sContext: string | undefined
    if (deployment.clusterId) {
      const cluster = await clusterDao.findByIdOnly(deployment.clusterId)
      if (cluster?.kubeconfigEncrypted) {
        const kubeconfig = decrypt(cluster.kubeconfigEncrypted)
        const kubeconfigPath = writeKubeconfigTemp(kubeconfig)
        tmpFiles.push(kubeconfigPath)
        process.env.KUBECONFIG = kubeconfigPath
        k8sContext = extractKubeContext(kubeconfig)
        if (k8sContext) process.env.KUBECONFIG_CONTEXT = k8sContext
      }
    }

    const container = createContainer()

    await container.deploy.destroy({
      namespace: deployment.namespace,
      stack: deployment.id,
      k8sContext,
    })

    await deploymentDao.appendLog(
      deployment.id,
      `Namespace "${deployment.namespace}" destroyed successfully`,
      'info',
    )
    await deploymentDao.updateStatus(deployment.id, 'destroyed')
    console.log(`[cloud-worker] Destroy ${deployment.id} completed`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cloud-worker] Destroy ${deployment.id} failed:`, msg)
    await deploymentDao.appendLog(deployment.id, `Destroy error: ${msg}`, 'error')
    await deploymentDao.updateStatus(deployment.id, 'failed', `destroy: ${msg}`)
  } finally {
    if (originalKubeconfig !== undefined) {
      process.env.KUBECONFIG = originalKubeconfig
    } else {
      delete process.env.KUBECONFIG
    }
    if (originalKubeContext !== undefined) {
      process.env.KUBECONFIG_CONTEXT = originalKubeContext
    } else {
      delete process.env.KUBECONFIG_CONTEXT
    }
    for (const f of tmpFiles) {
      try {
        const dir = join(f, '..')
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Honor a cancellation request:
 *   - If the deploy is running in this worker, signal cooperative cancel and
 *     ask the Pulumi stack to abort. processDeployment() will mark failed.
 *   - Otherwise (worker restarted, or cancellation arrived before the deploy
 *     was picked up), mark failed directly.
 */
async function processCancel(
  deployment: Awaited<ReturnType<CloudDeploymentDao['listCancelling']>>[number],
  deploymentDao: CloudDeploymentDao,
) {
  const live = runningDeploys.get(deployment.id)
  if (live) {
    live.cancelled = true
    if (live.stack) {
      try {
        console.log(`[cloud-worker] Cancelling Pulumi stack for ${deployment.id}`)
        await live.stack.cancel()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[cloud-worker] stack.cancel() failed for ${deployment.id}:`, msg)
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
  // worker (future), or never started, or already finished.
  await deploymentDao.appendLog(
    deployment.id,
    '[cancel] No live deploy found in this worker; marking failed',
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
 *
 * Note: the inverse direction (k8s namespace exists but no DB row) is handled
 * by the SaaS API's GET /deployments handler, which annotates orphan rows.
 */
async function reconcileOrphans(deploymentDao: CloudDeploymentDao, clusterDao: CloudClusterDao) {
  const live = await deploymentDao.listLive()
  if (live.length === 0) return

  const namespaces = listAllManagedNamespaces()
  if (namespaces === null) return // kubectl unavailable; skip silently

  const presentNs = new Set(namespaces)

  for (const d of live) {
    if (presentNs.has(d.namespace)) continue
    // Skip deployments tied to a BYOK cluster we can't reach.
    if (d.clusterId) {
      try {
        const cluster = await clusterDao.findByIdOnly(d.clusterId)
        if (cluster?.kubeconfigEncrypted) {
          // Best-effort: use the cluster's kubeconfig before declaring orphan.
          const kubeconfig = decrypt(cluster.kubeconfigEncrypted)
          const tmpDir = mkdtempSync(join(tmpdir(), 'sc-kube-rec-'))
          const kPath = join(tmpDir, 'kubeconfig')
          writeFileSync(kPath, kubeconfig, { mode: 0o600 })
          try {
            const out = execSync(
              `kubectl --kubeconfig=${kPath} get ns ${d.namespace} --no-headers --ignore-not-found`,
              { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
            )
            if (out.trim().length > 0) continue
          } catch {
            /* assume orphan if kubectl errors */
          } finally {
            rmSync(tmpDir, { recursive: true, force: true })
          }
        }
      } catch {
        /* ignore — fall through to mark orphan */
      }
    }
    console.warn(
      `[cloud-worker] Orphan detected: deployment ${d.id} (${d.namespace}) not present on cluster`,
    )
    await deploymentDao.appendLog(
      d.id,
      `[reconcile] Namespace "${d.namespace}" no longer exists on the cluster`,
      'error',
    )
    await deploymentDao.updateStatus(d.id, 'failed', 'orphaned-by-cluster')
  }
}

/**
 * Return all K8s namespaces tagged as managed by Shadow Cloud, or `null` if
 * `kubectl` is unavailable.
 */
function listAllManagedNamespaces(): string[] | null {
  try {
    const out = execSync(
      'kubectl get ns -l shadowob-cloud/managed=true -o jsonpath={.items[*].metadata.name}',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return out.length > 0 ? out.split(/\s+/) : []
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => {
  console.error('[cloud-worker] Fatal:', err)
  process.exit(1)
})
