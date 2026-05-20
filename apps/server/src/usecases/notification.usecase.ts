import type { NotificationDao } from '../dao/notification.dao'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

export class NotificationUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      notificationDao: NotificationDao
    },
  ) {}

  async getChannelPreferences(input: SecureUseCaseInput) {
    const userId =
      input.ctx.actor.kind === 'user'
        ? input.ctx.actor.userId
        : '00000000-0000-0000-0000-000000000000'
    return this.deps.notificationDao.getChannelPreferences(userId)
  }

  async upsertChannelPreference(
    input: SecureUseCaseInput & {
      kind: string
      channel: string
      enabled: boolean
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'notification.channelPreferences.upsert',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        return this.deps.notificationDao.upsertChannelPreference({
          userId,
          kind: input.kind,
          channel: input.channel as import('../dao/notification.dao').NotificationChannel,
          enabled: input.enabled,
        })
      },
    })
  }

  async upsertPushToken(
    input: SecureUseCaseInput & {
      platform: string
      token: string
      deviceName?: string | null
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'notification.pushToken.upsert',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        return this.deps.notificationDao.upsertPushToken({
          userId,
          platform: input.platform,
          token: input.token,
          deviceName: input.deviceName,
        })
      },
    })
  }

  async deactivatePushToken(input: SecureUseCaseInput & { idOrToken: string }) {
    return auditUseCase(this.deps, input, {
      action: 'notification.pushToken.deactivate',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        await this.deps.notificationDao.deactivatePushToken(userId, input.idOrToken)
        return { ok: true }
      },
    })
  }

  async upsertWebPushSubscription(
    input: SecureUseCaseInput & {
      endpoint: string
      p256dh: string
      auth: string
      userAgent?: string | null
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'notification.webPush.upsert',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        return this.deps.notificationDao.upsertWebPushSubscription({
          userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        })
      },
    })
  }

  async deactivateWebPushSubscription(input: SecureUseCaseInput & { idOrEndpoint: string }) {
    return auditUseCase(this.deps, input, {
      action: 'notification.webPush.deactivate',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        await this.deps.notificationDao.deactivateWebPushSubscription(userId, input.idOrEndpoint)
        return { ok: true }
      },
    })
  }
}
