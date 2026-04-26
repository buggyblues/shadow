import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateCloudSaasConfigSnapshot } from '@shadowob/cloud'
import type { CloudActivityDao } from '../dao/cloud-activity.dao'
import type { CloudClusterDao } from '../dao/cloud-cluster.dao'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudTemplateDao } from '../dao/cloud-template.dao'
import { decrypt, encrypt } from '../lib/kms'

export class CloudService {
  constructor(
    private deps: {
      cloudDeploymentDao: CloudDeploymentDao
      cloudTemplateDao: CloudTemplateDao
      cloudClusterDao: CloudClusterDao
      cloudActivityDao: CloudActivityDao
    },
  ) {}

  // ─── Template Seed ───────────────────────────────────────────────────────

  /**
   * Idempotently seed official templates from the @shadowob/cloud templates/ directory.
   * Called once on server startup.
   */
  async seedOfficialTemplates(templatesDir: string) {
    let files: string[]
    try {
      files = await readdir(templatesDir)
    } catch {
      return // templates dir not found, skip silently
    }

    const jsonFiles = files.filter((f) => f.endsWith('.template.json'))
    for (const file of jsonFiles) {
      const slug = file.replace('.template.json', '')
      const raw = await readFile(join(templatesDir, file), 'utf-8')
      let content: Record<string, unknown>
      try {
        content = validateCloudSaasConfigSnapshot(JSON.parse(raw))
      } catch (err) {
        console.warn(
          `[cloud] Skipping invalid official template "${file}": ${err instanceof Error ? err.message : String(err)}`,
        )
        continue
      }
      const name = slug
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')
      await this.deps.cloudTemplateDao.upsertOfficial({ slug, name, content })
    }
  }

  // ─── Deploy ──────────────────────────────────────────────────────────────

  async createDeployment(data: {
    userId: string
    namespace: string
    name: string
    clusterId?: string | null
    agentCount?: number
    configSnapshot?: unknown
  }) {
    const deployment = await this.deps.cloudDeploymentDao.create(data)
    if (!deployment) throw new Error('Failed to create deployment')
    await this.deps.cloudActivityDao.log({
      userId: data.userId,
      type: 'deploy',
      namespace: data.namespace,
      meta: { deploymentId: deployment.id, name: data.name },
    })
    return deployment
  }

  // ─── Cluster BYOK ────────────────────────────────────────────────────────

  async addCluster(data: {
    userId: string
    name: string
    kubeconfig: string // plaintext, will be encrypted
  }) {
    const encryptedValue = encrypt(data.kubeconfig)
    const cluster = await this.deps.cloudClusterDao.create({
      userId: data.userId,
      name: data.name,
      kubeconfigEncrypted: encryptedValue,
    })
    if (!cluster) throw new Error('Failed to create cluster')
    await this.deps.cloudActivityDao.log({
      userId: data.userId,
      type: 'cluster_add',
      meta: { clusterId: cluster.id, name: data.name },
    })
    return cluster
  }

  async getDecryptedKubeconfig(clusterId: string, userId: string): Promise<string | null> {
    const cluster = await this.deps.cloudClusterDao.findById(clusterId, userId)
    if (!cluster?.kubeconfigEncrypted) return null
    return decrypt(cluster.kubeconfigEncrypted)
  }
}
