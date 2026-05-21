import type { CloudActivityDao } from '../dao/cloud-activity.dao'
import type { CloudClusterDao } from '../dao/cloud-cluster.dao'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudDeploymentBackupDao } from '../dao/cloud-deployment-backup.dao'
import type { CloudEnvVarDao } from '../dao/cloud-envvar.dao'
import type { CloudTemplateDao } from '../dao/cloud-template.dao'
import type { CloudTemplateGithubSource } from '../db/schema'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { CloudUsageService } from '../services/cloud-usage.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

function actorUserIdOrSystem(input: SecureUseCaseInput) {
  return input.ctx.actor.kind === 'system'
    ? '00000000-0000-0000-0000-000000000000'
    : input.ctx.actor.userId
}

export class CloudSaasUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      cloudDeploymentDao: CloudDeploymentDao
      cloudDeploymentBackupDao: CloudDeploymentBackupDao
      cloudTemplateDao: CloudTemplateDao
      cloudEnvVarDao: CloudEnvVarDao
      cloudClusterDao: CloudClusterDao
      cloudActivityDao: CloudActivityDao
      cloudUsageService: CloudUsageService
    },
  ) {}

  // ─── Template Operations ──────────────────────────────────────────────────

  async listApprovedTemplates(input: SecureUseCaseInput) {
    return this.deps.cloudTemplateDao.listApproved()
  }

  async listMyTemplates(input: SecureUseCaseInput) {
    const userId = actorUserIdOrSystem(input)
    return this.deps.cloudTemplateDao.listByAuthorId(userId)
  }

  async getMyTemplateBySlug(input: SecureUseCaseInput & { slug: string }) {
    const userId = actorUserIdOrSystem(input)
    return this.deps.cloudTemplateDao.findBySlugForAuthor(input.slug, userId)
  }

  async getTemplateBySlug(input: SecureUseCaseInput & { slug: string }) {
    return this.deps.cloudTemplateDao.findBySlug(input.slug)
  }

  async getTemplateBySlugForUser(input: SecureUseCaseInput & { slug: string }) {
    const template = await this.deps.cloudTemplateDao.findBySlug(input.slug)
    if (!template) return null
    const userId = actorUserIdOrSystem(input)
    const ownedByUser = template.authorId === userId || template.submittedByUserId === userId
    if (template.reviewStatus === 'approved' || template.source === 'official' || ownedByUser) {
      return template
    }
    return null
  }

  async createTemplate(
    input: SecureUseCaseInput & {
      payload: {
        slug: string
        name: string
        description?: string
        content: Record<string, unknown>
        tags?: string[]
        category?: string
        baseCost?: number
        githubSource?: CloudTemplateGithubSource | null
      }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.template.create',
      scope: { kind: 'user', id: actorUserIdOrSystem(input) },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        const existing = await this.deps.cloudTemplateDao.findBySlug(input.payload.slug)
        if (existing) {
          return { ok: false as const, error: 'Template slug already exists', status: 409 }
        }
        const template = await this.deps.cloudTemplateDao.createCommunity({
          slug: input.payload.slug,
          name: input.payload.name,
          description: input.payload.description,
          content: input.payload.content,
          tags: input.payload.tags ?? [],
          source: 'community',
          reviewStatus: 'draft',
          submittedByUserId: userId,
          authorId: userId,
          category: input.payload.category,
          baseCost: input.payload.baseCost,
          githubSource: input.payload.githubSource,
        })
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'template_submit',
          meta: { slug: input.payload.slug },
        })
        return { ok: true as const, template }
      },
    })
  }

  async updateTemplate(
    input: SecureUseCaseInput & {
      slug: string
      payload: {
        name?: string
        description?: string
        content?: Record<string, unknown>
        tags?: string[]
        category?: string
        baseCost?: number
        githubSource?: CloudTemplateGithubSource | null
      }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.template.update',
      scope: { kind: 'user', id: actorUserIdOrSystem(input) },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        const template = await this.deps.cloudTemplateDao.findBySlug(input.slug)
        if (!template) return { ok: false as const, error: 'Template not found', status: 404 }
        if (template.authorId !== userId) {
          return { ok: false as const, error: 'Forbidden', status: 403 }
        }
        if (template.reviewStatus === 'approved' || template.reviewStatus === 'pending') {
          return {
            ok: false as const,
            error: 'Cannot edit an approved or pending template',
            status: 422,
          }
        }
        const updated = await this.deps.cloudTemplateDao.updateBySlug(input.slug, {
          name: input.payload.name,
          description: input.payload.description,
          content: input.payload.content,
          tags: input.payload.tags,
          category: input.payload.category,
          baseCost: input.payload.baseCost,
          githubSource: input.payload.githubSource,
        })
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'template_update',
          meta: { slug: input.slug },
        })
        return { ok: true as const, template: updated }
      },
    })
  }

  async submitTemplateForReview(input: SecureUseCaseInput & { slug: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.template.submit-for-review',
      scope: { kind: 'user', id: actorUserIdOrSystem(input) },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        const template = await this.deps.cloudTemplateDao.findBySlug(input.slug)
        if (!template) return { ok: false as const, error: 'Template not found', status: 404 }
        if (template.authorId !== userId) {
          return { ok: false as const, error: 'Forbidden', status: 403 }
        }
        if (template.reviewStatus === 'pending') {
          return { ok: false as const, error: 'Already pending review', status: 422 }
        }
        if (template.reviewStatus === 'approved') {
          return { ok: false as const, error: 'Template already approved', status: 422 }
        }
        const updated = await this.deps.cloudTemplateDao.updateReviewStatus(
          template.id,
          'pending',
          null,
        )
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'template_submit',
          meta: { slug: input.slug },
        })
        return { ok: true as const, template: updated }
      },
    })
  }

  async deleteTemplate(input: SecureUseCaseInput & { slug: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.template.delete',
      scope: { kind: 'user', id: actorUserIdOrSystem(input) },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        const template = await this.deps.cloudTemplateDao.findBySlug(input.slug)
        if (!template) return { ok: false as const, error: 'Template not found', status: 404 }
        if (template.authorId !== userId) {
          return { ok: false as const, error: 'Forbidden', status: 403 }
        }
        await this.deps.cloudTemplateDao.deleteBySlug(input.slug)
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'template_delete',
          meta: { slug: input.slug, wasApproved: template.reviewStatus === 'approved' },
        })
        return { ok: true as const }
      },
    })
  }

  // ─── Deployment Operations ────────────────────────────────────────────────

  async getDeployment(input: SecureUseCaseInput & { deploymentId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.deployment.get',
      resource: { kind: 'deployment', id: input.deploymentId },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        const deployment = await this.deps.cloudDeploymentDao.findById(input.deploymentId, userId)
        if (!deployment) return null
        return deployment
      },
    })
  }

  async getDeploymentOwned(input: SecureUseCaseInput & { deploymentId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.deployment.get-owned',
      resource: { kind: 'deployment', id: input.deploymentId },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        const deployment = await this.deps.cloudDeploymentDao.findById(input.deploymentId, userId)
        if (!deployment) return null
        await this.deps.accessService.requireDeploymentOwner(input.ctx.actor, input.deploymentId)
        return deployment
      },
    })
  }

  async listDeployments(input: SecureUseCaseInput & { limit?: number; offset?: number }) {
    const userId = actorUserIdOrSystem(input)
    const limit = Math.min(input.limit ?? 50, 100)
    const offset = Math.max(input.offset ?? 0, 0)
    return this.deps.cloudDeploymentDao.listByUser(userId, limit, offset)
  }

  async getDeploymentLogs(input: SecureUseCaseInput & { deploymentId: string }) {
    const userId = actorUserIdOrSystem(input)
    const deployment = await this.deps.cloudDeploymentDao.findById(input.deploymentId, userId)
    if (!deployment) return null
    const logs = await this.deps.cloudDeploymentDao.getLogs(input.deploymentId)
    return { deployment, logs }
  }

  async getDeploymentCosts(input: SecureUseCaseInput & { deploymentId: string }) {
    const userId = actorUserIdOrSystem(input)
    const deployment = await this.deps.cloudDeploymentDao.findById(input.deploymentId, userId)
    if (!deployment) return null
    const summary = await this.deps.cloudUsageService.collectDeploymentCost(deployment)
    return { deployment, summary }
  }

  // ─── Backup Operations ────────────────────────────────────────────────────

  async listDeploymentBackups(
    input: SecureUseCaseInput & {
      deploymentId: string
      agentId?: string
    },
  ) {
    const userId = actorUserIdOrSystem(input)
    const deployment = await this.deps.cloudDeploymentDao.findById(input.deploymentId, userId)
    if (!deployment) return null
    const backups = await this.deps.cloudDeploymentBackupDao.listByDeployment({
      userId,
      deploymentId: input.deploymentId,
      agentId: input.agentId,
    })
    return { deployment, backups }
  }

  async getBackupById(input: SecureUseCaseInput & { backupId: string }) {
    const userId = actorUserIdOrSystem(input)
    return this.deps.cloudDeploymentBackupDao.findById(input.backupId, userId)
  }

  // ─── Env Var Operations ───────────────────────────────────────────────────

  async listEnvVarsByUser(input: SecureUseCaseInput & { scope?: string }) {
    const userId = actorUserIdOrSystem(input)
    return this.deps.cloudEnvVarDao.listByUser(userId, input.scope)
  }

  async listEnvVarsByDeployment(input: SecureUseCaseInput & { deploymentId: string }) {
    const userId = actorUserIdOrSystem(input)
    const deployment = await this.deps.cloudDeploymentDao.findById(input.deploymentId, userId)
    if (!deployment) return null
    const vars = await this.deps.cloudEnvVarDao.listByUser(userId, input.deploymentId)
    return { deployment, envVars: vars }
  }

  async createEnvVar(
    input: SecureUseCaseInput & {
      key: string
      encryptedValue: string
      scope?: string
      groupId?: string | null
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.envvar.create',
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        return this.deps.cloudEnvVarDao.create({
          userId,
          key: input.key,
          encryptedValue: input.encryptedValue,
          scope: input.scope,
          groupId: input.groupId,
        })
      },
    })
  }

  async upsertEnvVarScoped(
    input: SecureUseCaseInput & {
      scope: string
      key: string
      encryptedValue: string
      groupId?: string | null
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.envvar.upsert',
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        return this.deps.cloudEnvVarDao.upsertScoped({
          userId,
          scope: input.scope,
          key: input.key,
          encryptedValue: input.encryptedValue,
          groupId: input.groupId,
        })
      },
    })
  }

  async updateEnvVar(
    input: SecureUseCaseInput & {
      id: string
      encryptedValue: string
      groupId?: string | null
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.envvar.update',
      resource: { kind: 'envvar', id: input.id },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        return this.deps.cloudEnvVarDao.update(
          input.id,
          userId,
          input.encryptedValue,
          input.groupId,
        )
      },
    })
  }

  async deleteEnvVar(input: SecureUseCaseInput & { envVarId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.envvar.delete',
      resource: { kind: 'envvar', id: input.envVarId },
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        await this.deps.cloudEnvVarDao.delete(input.envVarId, userId)
        return { ok: true }
      },
    })
  }

  async deleteEnvVarByScope(input: SecureUseCaseInput & { scope: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.envvar.delete-scope',
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        await this.deps.cloudEnvVarDao.deleteByScope(userId, input.scope)
        return { ok: true }
      },
    })
  }

  async listEnvGroupsByUser(input: SecureUseCaseInput) {
    const userId = actorUserIdOrSystem(input)
    return this.deps.cloudEnvVarDao.listGroupsByUser(userId)
  }

  async findEnvGroupByName(input: SecureUseCaseInput & { name: string }) {
    const userId = actorUserIdOrSystem(input)
    return this.deps.cloudEnvVarDao.findGroupByName(userId, input.name)
  }

  async createEnvGroup(input: SecureUseCaseInput & { name: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.env-group.create',
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        return this.deps.cloudEnvVarDao.createGroup({ userId, name: input.name })
      },
    })
  }

  async deleteEnvGroupByName(input: SecureUseCaseInput & { name: string }) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.env-group.delete',
      run: async () => {
        const userId = actorUserIdOrSystem(input)
        await this.deps.cloudEnvVarDao.deleteGroupByName(userId, input.name)
        return { ok: true }
      },
    })
  }

  // ─── Cluster Operations ──────────────────────────────────────────────────

  async findClusterByIdOnly(input: SecureUseCaseInput & { clusterId: string }) {
    return this.deps.cloudClusterDao.findByIdOnly(input.clusterId)
  }

  async listClustersByUser(input: SecureUseCaseInput) {
    const userId = actorUserIdOrSystem(input)
    return this.deps.cloudClusterDao.listByUser(userId)
  }

  // ─── Activity Operations ─────────────────────────────────────────────────

  async listActivity(input: SecureUseCaseInput & { limit?: number; offset?: number }) {
    const userId = actorUserIdOrSystem(input)
    const limit = Math.min(input.limit ?? 50, 100)
    const offset = Math.max(input.offset ?? 0, 0)
    return this.deps.cloudActivityDao.listByUser(userId, limit, offset)
  }

  async logActivity(
    input: SecureUseCaseInput & {
      userId: string
      type: Parameters<CloudActivityDao['log']>[0]['type']
      namespace?: string
      meta?: Record<string, unknown>
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.activity.log',
      run: async () => {
        await this.deps.cloudActivityDao.log({
          userId: input.userId,
          type: input.type,
          namespace: input.namespace,
          meta: input.meta,
        })
      },
    })
  }

  async countActivityByUserTypeSince(
    input: SecureUseCaseInput & {
      userId: string
      type: Parameters<CloudActivityDao['log']>[0]['type']
      since: Date
    },
  ) {
    return this.deps.cloudActivityDao.countByUserTypeSince(input.userId, input.type, input.since)
  }

  // ─── Backup Record Operations ─────────────────────────────────────────────

  async createBackupRecord(
    input: SecureUseCaseInput & {
      userId: string
      deploymentId: string
      namespace: string
      agentId: string
      sandboxName?: string | null
      pvcName: string
      driver: 'volumeSnapshot' | 'restic'
      snapshotName?: string | null
      objectKey?: string | null
      status?: string
      phase?: string | null
      expiresAt?: Date | null
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud-saas.backup.create-record',
      run: async () => {
        return this.deps.cloudDeploymentBackupDao.create({
          userId: input.userId,
          deploymentId: input.deploymentId,
          namespace: input.namespace,
          agentId: input.agentId,
          sandboxName: input.sandboxName,
          pvcName: input.pvcName,
          driver: input.driver,
          snapshotName: input.snapshotName,
          objectKey: input.objectKey,
          status: input.status as
            | 'pending'
            | 'running'
            | 'succeeded'
            | 'failed'
            | 'expired'
            | undefined,
          phase: input.phase,
          expiresAt: input.expiresAt,
        })
      },
    })
  }
}
