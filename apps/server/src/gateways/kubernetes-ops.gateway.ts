import { deleteNamespace, listManagedNamespaces } from '@shadowob/cloud'
import type { Logger } from 'pino'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { AccessService } from '../security/access.service'
import type { ActorInput } from '../security/actor'
import { notFoundForScope, scopeMismatch } from '../security/errors'

export class KubernetesOpsGateway {
  constructor(
    private deps: {
      accessService: AccessService
      cloudDeploymentDao: CloudDeploymentDao
      logger: Logger
    },
  ) {}

  listManagedNamespaces() {
    return listManagedNamespaces() ?? []
  }

  async assertManagedOrphanNamespace(namespace: string) {
    const managed = this.listManagedNamespaces()
    if (!managed.includes(namespace)) {
      throw Object.assign(new Error('Namespace is not managed by this platform'), { status: 422 })
    }

    const existing = await this.deps.cloudDeploymentDao.findByNamespaceGlobal(namespace)
    if (existing) {
      throw scopeMismatch('Namespace is already owned by a deployment')
    }
  }

  async cleanupManagedOrphanNamespace(input: { actor: ActorInput; namespace: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.actor)
    await this.assertManagedOrphanNamespace(input.namespace)
    this.deps.logger.warn({ namespace: input.namespace }, '[k8s-gateway] deleting orphan namespace')
    deleteNamespace(input.namespace)
  }

  async claimManagedOrphanNamespace(input: {
    actor: ActorInput
    ownerUserId: string
    namespace: string
  }) {
    await this.deps.accessService.requirePlatformAdmin(input.actor)
    await this.assertManagedOrphanNamespace(input.namespace)

    const created = await this.deps.cloudDeploymentDao.create({
      userId: input.ownerUserId,
      namespace: input.namespace,
      name: `orphan-${input.namespace}`,
      agentCount: 0,
      configSnapshot: null,
      status: 'deployed',
    })
    if (!created) throw notFoundForScope('Failed to create deployment row')
    await this.deps.cloudDeploymentDao.appendLog(
      created.id,
      '[reconcile] Adopted orphan namespace',
      'info',
    )
    return created
  }
}
