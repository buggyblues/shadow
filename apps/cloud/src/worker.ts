/**
 * Cloud Worker — polls pending/destroying cloud_deployments and executes them.
 *
 * Runs as a separate container. Requires access to the same PostgreSQL database
 * as apps/server, plus a running K8s cluster via KUBECONFIG.
 *
 * Environment variables:
 *   DATABASE_URL      — PostgreSQL connection string
 *   POLL_INTERVAL_MS  — how often to poll (default: 5000)
 *   KMS_MASTER_KEY    — 32-byte hex key for decrypting kubeconfigs
 *   SHADOW_SERVER_URL — Shadow server URL injected into deployed agents
 *   KUBECONFIG        — Default kubeconfig path (overridden per-deployment when clusterId set)
 *   KUBECONFIG_CONTEXT — Default K8s context name (overridden per-deployment)
 */
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

  while (true) {
    try {
      // Process pending deployments (deploy)
      const pending = await deploymentDao.listPending()
      for (const deployment of pending) {
        await processDeployment(deployment, deploymentDao, clusterDao)
      }

      // Process destroying deployments (destroy)
      const destroying = await deploymentDao.listDestroying()
      for (const deployment of destroying) {
        await processDestroy(deployment, deploymentDao, clusterDao)
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

    // Write config to temp file
    const configPath = writeConfigTemp(deployment.configSnapshot)
    tmpFiles.push(configPath)
    await deploymentDao.appendLog(
      deployment.id,
      'Config snapshot written, starting Pulumi deploy...',
      'info',
    )

    // Create a fresh container to pick up the env KUBECONFIG
    const container = createContainer()

    const result = await container.deploy.up({
      filePath: configPath,
      namespace: deployment.namespace,
      stack: deployment.id, // unique per deployment for isolated Pulumi state
      k8sContext,
      shadowUrl: process.env.SHADOW_SERVER_URL,
      onOutput: (out) => {
        process.stdout.write(`[deploy:${deployment.id}] ${out}`)
        // Fire-and-forget log append (don't await to avoid blocking the output callback)
        deploymentDao.appendLog(deployment.id, out.trim(), 'info').catch(() => {})
      },
    })

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
    console.error(`[cloud-worker] Deployment ${deployment.id} failed:`, msg)
    await deploymentDao.appendLog(deployment.id, `Error: ${msg}`, 'error')
    await deploymentDao.updateStatus(deployment.id, 'failed', msg)
  } finally {
    // Restore original env vars
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
    // Clean up temp files/dirs
    for (const f of tmpFiles) {
      try {
        const dir =
          f.endsWith('kubeconfig') || f.endsWith('shadowob-cloud.json') ? join(f, '..') : f
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
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
    // On destroy failure, mark as failed (so user can see and retry)
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
        // ignore cleanup errors
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => {
  console.error('[cloud-worker] Fatal:', err)
  process.exit(1)
})
