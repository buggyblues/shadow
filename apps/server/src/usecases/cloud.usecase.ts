import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { CloudService } from '../services/cloud.service'
import type { CloudActivityDao } from '../dao/cloud-activity.dao'
import type { CloudClusterDao } from '../dao/cloud-cluster.dao'
import type { CloudConfigDao } from '../dao/cloud-config.dao'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudEnvVarDao } from '../dao/cloud-envvar.dao'
import type { CloudTemplateDao } from '../dao/cloud-template.dao'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'
import { encrypt } from '../lib/kms'

export class CloudUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      cloudDeploymentDao: CloudDeploymentDao
      cloudTemplateDao: CloudTemplateDao
      cloudConfigDao: CloudConfigDao
      cloudEnvVarDao: CloudEnvVarDao
      cloudClusterDao: CloudClusterDao
      cloudActivityDao: CloudActivityDao
      cloudService: CloudService
    },
  ) {}

  // ─── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(
    input: SecureUseCaseInput & { locale?: string },
  ) {
    const templates = await this.deps.cloudTemplateDao.listApproved()
    return templates.map((template) => {
      const content = template.content as Record<string, unknown>
      const i18n = content.i18n as Record<string, Record<string, string>> | undefined
      const locale = input.locale ?? 'en'
      const baseLocale = locale.split('-')[0] ?? locale
      const i18nDict = !i18n
        ? {}
        : i18n[locale] ?? (baseLocale !== locale ? i18n[baseLocale] : undefined) ?? i18n.en ?? {}
      const resolveI18nValue = (value: unknown): string | undefined => {
        if (typeof value !== 'string') return undefined
        const match = /^\$\{i18n:([^}]+)\}$/.exec(value)
        return match?.[1] ? (i18nDict[match[1]] ?? value) : value
      }
      return {
        ...template,
        name: template.slug,
        title:
          resolveI18nValue(content.title) ??
          resolveI18nValue(template.name) ??
          template.slug,
        description:
          resolveI18nValue(template.description) ??
          resolveI18nValue(content.description) ??
          null,
      }
    })
  }

  async submitCommunityTemplate(
    input: SecureUseCaseInput & {
      payload: {
        slug: string
        name: string
        description?: string
        content: Record<string, unknown>
        tags?: string[]
      }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud.template.submit',
      scope: { kind: 'user', id: input.ctx.actor.kind === 'user' ? input.ctx.actor.userId : 'system' },
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'system'
            ? '00000000-0000-0000-0000-000000000000'
            : input.ctx.actor.userId
        const template = await this.deps.cloudTemplateDao.submitCommunity({
          ...input.payload,
          submittedByUserId: userId,
        })
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'template_submit',
          meta: { slug: input.payload.slug },
        })
        return template
      },
    })
  }

  // ─── Deployments ────────────────────────────────────────────────────────────

  async listDeployments(
    input: SecureUseCaseInput & { limit?: number; offset?: number },
  ) {
    const userId =
      input.ctx.actor.kind === 'system'
        ? '00000000-0000-0000-0000-000000000000'
        : input.ctx.actor.userId
    const limit = Math.min(input.limit ?? 50, 100)
    const offset = Math.max(input.offset ?? 0, 0)
    return this.deps.cloudDeploymentDao.listByUser(userId, limit, offset)
  }

  async getDeploymentStream(
    input: SecureUseCaseInput & { deploymentId: string },
  ) {
    const userId =
      input.ctx.actor.kind === 'system'
        ? '00000000-0000-0000-0000-000000000000'
        : input.ctx.actor.userId
    const deployment = await this.deps.cloudDeploymentDao.findById(
      input.deploymentId,
      userId,
    )
    if (!deployment) {
      return { ok: false as const, error: 'Deployment not found' }
    }
    const logs = await this.deps.cloudDeploymentDao.getLogs(input.deploymentId)
    return { ok: true as const, deployment, logs }
  }

  // ─── Configs ────────────────────────────────────────────────────────────────

  async listConfigs(input: SecureUseCaseInput) {
    const userId =
      input.ctx.actor.kind === 'system'
        ? '00000000-0000-0000-0000-000000000000'
        : input.ctx.actor.userId
    return this.deps.cloudConfigDao.listByUser(userId)
  }

  async createConfig(
    input: SecureUseCaseInput & {
      payload: { name: string; content: Record<string, unknown> }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud.config.create',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'system'
            ? '00000000-0000-0000-0000-000000000000'
            : input.ctx.actor.userId
        const config = await this.deps.cloudConfigDao.create({
          userId,
          ...input.payload,
        })
        if (!config) {
          return { ok: false as const, error: 'Failed to create config' }
        }
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'config_update',
          meta: { configId: config.id },
        })
        return { ok: true as const, config }
      },
    })
  }

  async updateConfig(
    input: SecureUseCaseInput & {
      configId: string
      payload: { name?: string; content?: Record<string, unknown> }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud.config.update',
      resource: { kind: 'config', id: input.configId },
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'system'
            ? '00000000-0000-0000-0000-000000000000'
            : input.ctx.actor.userId
        const config = await this.deps.cloudConfigDao.update(
          input.configId,
          userId,
          input.payload,
        )
        if (!config) {
          return { ok: false as const, error: 'Config not found' }
        }
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'config_update',
          meta: { configId: input.configId },
        })
        return { ok: true as const, config }
      },
    })
  }

  async deleteConfig(
    input: SecureUseCaseInput & { configId: string },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud.config.delete',
      resource: { kind: 'config', id: input.configId },
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'system'
            ? '00000000-0000-0000-0000-000000000000'
            : input.ctx.actor.userId
        await this.deps.cloudConfigDao.delete(input.configId, userId)
        return { ok: true }
      },
    })
  }

  // ─── Env Vars ───────────────────────────────────────────────────────────────

  async listEnvVars(
    input: SecureUseCaseInput & { scope?: string },
  ) {
    const userId =
      input.ctx.actor.kind === 'system'
        ? '00000000-0000-0000-0000-000000000000'
        : input.ctx.actor.userId
    const vars = await this.deps.cloudEnvVarDao.listByUser(userId, input.scope)
    return vars.map((v) => {
      const { encryptedValue: _e, ...rest } = v
      return rest
    })
  }

  async createEnvVar(
    input: SecureUseCaseInput & {
      key: string
      value: string
      scope?: string
      groupId?: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud.envvar.create',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'system'
            ? '00000000-0000-0000-0000-000000000000'
            : input.ctx.actor.userId
        const encryptedValue = encrypt(input.value)
        const envVar = await this.deps.cloudEnvVarDao.create({
          userId,
          key: input.key,
          encryptedValue,
          scope: input.scope,
          groupId: input.groupId,
        })
        if (!envVar) return { ok: false as const, error: 'Failed to create env var' }
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'envvar_update',
          meta: { key: input.key },
        })
        const { encryptedValue: _e2, ...rest } = envVar
        return { ok: true as const, envVar: rest }
      },
    })
  }

  async deleteEnvVar(
    input: SecureUseCaseInput & { envVarId: string },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud.envvar.delete',
      resource: { kind: 'envvar', id: input.envVarId },
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'system'
            ? '00000000-0000-0000-0000-000000000000'
            : input.ctx.actor.userId
        await this.deps.cloudEnvVarDao.delete(input.envVarId, userId)
        return { ok: true }
      },
    })
  }

  // ─── Clusters ───────────────────────────────────────────────────────────────

  async listClusters(input: SecureUseCaseInput) {
    const userId =
      input.ctx.actor.kind === 'system'
        ? '00000000-0000-0000-0000-000000000000'
        : input.ctx.actor.userId
    const clusters = await this.deps.cloudClusterDao.listByUser(userId)
    return clusters.map((cl) => {
      const { kubeconfigEncrypted: _e, kubeconfigKmsRef: _k, ...rest } = cl
      return rest
    })
  }

  async deleteCluster(
    input: SecureUseCaseInput & { clusterId: string },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cloud.cluster.delete',
      resource: { kind: 'cluster', id: input.clusterId },
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'system'
            ? '00000000-0000-0000-0000-000000000000'
            : input.ctx.actor.userId
        const cluster = await this.deps.cloudClusterDao.findById(
          input.clusterId,
          userId,
        )
        if (!cluster) return { ok: false as const, error: 'Cluster not found' }
        await this.deps.cloudClusterDao.delete(input.clusterId, userId)
        await this.deps.cloudActivityDao.log({
          userId,
          type: 'cluster_remove',
          meta: { clusterId: input.clusterId },
        })
        return { ok: true as const }
      },
    })
  }

  // ─── Activity ───────────────────────────────────────────────────────────────

  async listActivity(
    input: SecureUseCaseInput & { limit?: number; offset?: number },
  ) {
    const userId =
      input.ctx.actor.kind === 'system'
        ? '00000000-0000-0000-0000-000000000000'
        : input.ctx.actor.userId
    const limit = Math.min(input.limit ?? 50, 100)
    const offset = Math.max(input.offset ?? 0, 0)
    return this.deps.cloudActivityDao.listByUser(userId, limit, offset)
  }
}
