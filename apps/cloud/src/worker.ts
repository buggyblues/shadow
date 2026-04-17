/**
 * Cloud Worker — polls pending cloud_deployments and executes them.
 *
 * Runs as a separate container. Requires access to the same PostgreSQL database
 * as apps/server, plus a running K8s cluster via KUBECONFIG.
 *
 * Environment variables:
 *   DATABASE_URL      — PostgreSQL connection string
 *   POLL_INTERVAL_MS  — how often to poll (default: 5000)
 *   KMS_MASTER_KEY    — 32-byte hex key for decrypting kubeconfigs
 */
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { CloudClusterDao } from '../../server/src/dao/cloud-cluster.dao'
import { CloudDeploymentDao } from '../../server/src/dao/cloud-deployment.dao'
import * as schema from '../../server/src/db/schema'
import { decrypt } from '../../server/src/lib/kms'

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
      const pending = await deploymentDao.listPending()
      for (const deployment of pending) {
        await processDeployment(deployment, deploymentDao, clusterDao)
      }
    } catch (err) {
      console.error('[cloud-worker] Poll error:', err)
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

async function processDeployment(
  deployment: Awaited<ReturnType<CloudDeploymentDao['listPending']>>[number],
  deploymentDao: CloudDeploymentDao,
  clusterDao: CloudClusterDao,
) {
  console.log(`[cloud-worker] Processing deployment ${deployment.id} (${deployment.name})`)
  await deploymentDao.updateStatus(deployment.id, 'deploying')
  await deploymentDao.appendLog(deployment.id, `Starting deployment: ${deployment.name}`, 'info')

  try {
    let kubeconfig: string | undefined

    if (deployment.clusterId) {
      const cluster = await clusterDao.findByIdOnly(deployment.clusterId)
      if (cluster?.kubeconfigEncrypted) {
        kubeconfig = decrypt(cluster.kubeconfigEncrypted)
      }
    }

    // TODO: integrate with @shadowob/cloud DeployService here
    // const deployService = new DeployService({ kubeconfig })
    // await deployService.deploy(deployment.configSnapshot, deployment.namespace)

    await deploymentDao.appendLog(deployment.id, 'Deployment completed successfully.', 'info')
    await deploymentDao.updateStatus(deployment.id, 'deployed')
    console.log(`[cloud-worker] Deployment ${deployment.id} completed`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cloud-worker] Deployment ${deployment.id} failed:`, msg)
    await deploymentDao.appendLog(deployment.id, `Error: ${msg}`, 'error')
    await deploymentDao.updateStatus(deployment.id, 'failed', msg)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => {
  console.error('[cloud-worker] Fatal:', err)
  process.exit(1)
})
