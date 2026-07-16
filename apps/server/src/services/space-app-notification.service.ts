import type { NotificationDao } from '../dao/notification.dao'
import type { ServerDao } from '../dao/server.dao'
import type { SpaceAppDao } from '../dao/space-app.dao'
import type { SpaceAppManifest } from '../db/schema'
import type { ActorInput } from '../security/actor'
import type { AuditLogService } from './audit-log.service'
import type { NotificationService } from './notification.service'
import type { NotificationPlatformService } from './notification-platform.service'

export type SpaceAppNotificationChannel = 'in_app' | 'mobile_push' | 'web_push' | 'email'

type InstalledSpaceApp = {
  id: string
  serverId: string
  appKey: string
  name: string
  iconUrl?: string | null
  manifest: Pick<SpaceAppManifest, 'notifications' | 'i18n'>
}

const SPACE_APP_NOTIFICATION_CHANNELS = new Set<SpaceAppNotificationChannel>([
  'in_app',
  'mobile_push',
  'web_push',
  'email',
])

function httpError(message: string, status: number, reason: string) {
  return Object.assign(new Error(message), { status, reason })
}

function cleanChannels(value: readonly SpaceAppNotificationChannel[]) {
  return [...new Set(value)].filter((channel) => SPACE_APP_NOTIFICATION_CHANNELS.has(channel))
}

function notificationKind(appKey: string, topicKey: string) {
  return `space-app.${appKey}.${topicKey}`.slice(0, 80)
}

export class SpaceAppNotificationService {
  constructor(
    private deps: {
      spaceAppDao: SpaceAppDao
      notificationDao: NotificationDao
      notificationService: NotificationService
      notificationPlatformService: NotificationPlatformService
      serverDao: ServerDao
      auditLogService: AuditLogService
    },
  ) {}

  async syncManifest(app: InstalledSpaceApp, manifest: Pick<SpaceAppManifest, 'notifications'>) {
    await this.deps.notificationDao.syncSpaceAppTopics({
      spaceAppId: app.id,
      serverId: app.serverId,
      appKey: app.appKey,
      topics: (manifest.notifications ?? []).map((topic) => ({
        key: topic.key,
        title: topic.title,
        description: topic.description,
        defaultEnabled: topic.defaultEnabled,
        defaultChannels: cleanChannels(topic.defaultChannels ?? ['in_app']),
      })),
    })
  }

  private async requireMember(serverId: string, userId: string) {
    const member = await this.deps.serverDao.getMember(serverId, userId)
    if (!member) throw httpError('Space membership required', 403, 'space_membership_required')
    return member
  }

  async listPreferences(userId: string, serverId?: string, locale?: string | null) {
    let allowedServerIds: Set<string>
    if (serverId) {
      await this.requireMember(serverId, userId)
      allowedServerIds = new Set([serverId])
    } else {
      const memberships = await this.deps.serverDao.findByUserId(userId)
      allowedServerIds = new Set(memberships.map(({ server }) => server.id))
    }

    const installedSpaceApps = (
      await Promise.all(
        [...allowedServerIds].map((allowedServerId) =>
          this.deps.spaceAppDao.listByServer(allowedServerId),
        ),
      )
    ).flat()
    await Promise.all(installedSpaceApps.map((app) => this.syncManifest(app, app.manifest)))

    const topics = await this.deps.notificationDao.listSpaceAppTopicsForUser(userId, serverId)
    const visible = topics.filter((topic) => allowedServerIds.has(topic.serverId))
    const appIds = [...new Set(visible.map((topic) => topic.spaceAppId))]
    const apps = await Promise.all(appIds.map((id) => this.deps.spaceAppDao.findById(id)))
    const appById = new Map(apps.filter(Boolean).map((app) => [app!.id, app!]))
    const servers = await Promise.all(
      [...new Set(visible.map((topic) => topic.serverId))].map((id) =>
        this.deps.serverDao.findById(id),
      ),
    )
    const serverById = new Map(servers.filter(Boolean).map((server) => [server!.id, server!]))

    return visible.map((topic) => {
      const app = appById.get(topic.spaceAppId)
      const normalizedLocale = locale?.trim().replace('_', '-').toLowerCase()
      const localizedEntry = app
        ? Object.entries(app.manifest.i18n ?? {}).find(([key]) => {
            const normalizedKey = key.toLowerCase()
            return (
              normalizedKey === normalizedLocale ||
              normalizedKey === normalizedLocale?.split('-')[0]
            )
          })?.[1]
        : undefined
      const localizedTopic = localizedEntry?.notifications?.[topic.topicKey]
      return {
        serverId: topic.serverId,
        serverName: serverById.get(topic.serverId)?.name ?? topic.serverId,
        spaceAppId: topic.spaceAppId,
        appKey: topic.appKey,
        appName: app?.name ?? topic.appKey,
        appIconUrl: app?.iconUrl ?? null,
        topicKey: topic.topicKey,
        title: localizedTopic?.title ?? topic.title,
        description: localizedTopic?.description ?? topic.description,
        enabled: topic.preference?.enabled ?? topic.defaultEnabled,
        channels: topic.preference?.channels ?? topic.defaultChannels,
        isDefault: !topic.preference,
      }
    })
  }

  async updatePreference(input: {
    userId: string
    serverId: string
    appKey: string
    topicKey: string
    enabled?: boolean
    channels?: SpaceAppNotificationChannel[]
  }) {
    await this.requireMember(input.serverId, input.userId)
    const app = await this.deps.spaceAppDao.findByServerAndKey(input.serverId, input.appKey)
    if (!app)
      throw httpError('Space App is not installed in this Space', 404, 'space_app_not_installed')
    await this.syncManifest(app, app.manifest)
    const topic = await this.deps.notificationDao.findSpaceAppTopic(app.id, input.topicKey)
    if (!topic) throw httpError('Notification topic is not declared', 404, 'topic_not_declared')
    const current = await this.deps.notificationDao.getSpaceAppPreference(
      input.userId,
      app.id,
      input.topicKey,
    )
    const channels = cleanChannels(input.channels ?? current?.channels ?? topic.defaultChannels)
    if (channels.length === 0) {
      throw httpError('Select at least one notification channel', 422, 'channels_required')
    }
    return this.deps.notificationDao.upsertSpaceAppPreference({
      userId: input.userId,
      spaceAppId: app.id,
      topicKey: input.topicKey,
      enabled: input.enabled ?? current?.enabled ?? topic.defaultEnabled,
      channels,
    })
  }

  async publish(input: {
    app: InstalledSpaceApp
    actor: ActorInput
    topicKey: string
    recipientUserIds: string[]
    title: string
    body?: string | null
    idempotencyKey: string
    actionPath?: string | null
    metadata?: Record<string, unknown> | null
    expiresAt?: Date | null
  }) {
    await this.syncManifest(input.app, input.app.manifest)
    const topic = await this.deps.notificationDao.findSpaceAppTopic(input.app.id, input.topicKey)
    if (!topic) throw httpError('Notification topic is not declared', 422, 'topic_not_declared')
    const recipientUserIds = [...new Set(input.recipientUserIds)]
    if (recipientUserIds.length === 0 || recipientUserIds.length > 100) {
      throw httpError('Provide between 1 and 100 recipients', 422, 'invalid_recipients')
    }
    const members = await Promise.all(
      recipientUserIds.map((userId) => this.deps.serverDao.getMember(input.app.serverId, userId)),
    )
    if (members.some((member) => !member)) {
      throw httpError('Every recipient must belong to this Space', 403, 'recipient_outside_space')
    }
    if (
      input.actionPath &&
      (!input.actionPath.startsWith('/') || input.actionPath.startsWith('//'))
    ) {
      throw httpError('actionPath must be an app-relative path', 422, 'invalid_action_path')
    }

    const results = await Promise.all(
      recipientUserIds.map(async (userId) => {
        const preference = await this.deps.notificationDao.getSpaceAppPreference(
          userId,
          input.app.id,
          input.topicKey,
        )
        const enabled = preference?.enabled ?? topic.defaultEnabled
        if (!enabled) return { userId, status: 'skipped' as const }
        const channels = cleanChannels(preference?.channels ?? topic.defaultChannels)
        const eventKey = `${input.app.id}:${input.idempotencyKey}`.slice(0, 200)
        const notification = await this.deps.notificationService.create({
          userId,
          type: 'system',
          kind: notificationKind(input.app.appKey, input.topicKey),
          title: input.title,
          body: input.body,
          referenceId: input.app.id,
          referenceType: 'space_app',
          scopeServerId: input.app.serverId,
          metadata: {
            ...(input.metadata ?? {}),
            appKey: input.app.appKey,
            appName: input.app.name,
            topicKey: input.topicKey,
            actionPath: input.actionPath ?? null,
          },
          sourceSpaceAppId: input.app.id,
          sourceSpaceAppKey: input.app.appKey,
          sourceSpaceAppTopicKey: input.topicKey,
          sourceSpaceAppEventKey: eventKey,
          expiresAt: input.expiresAt,
          delivery: { aggregate: false },
        })
        if (!notification) return { userId, status: 'duplicate' as const }
        await this.deps.notificationPlatformService.deliver(notification, {
          source: `space-app:${input.app.appKey}`,
          idempotencyKey: `space-app:${userId}:${eventKey}`.slice(0, 200),
          enabledChannels: channels,
        })
        return { userId, status: 'delivered' as const, notificationId: notification.id }
      }),
    )

    await this.deps.auditLogService.record({
      actor: input.actor,
      action: 'space_app.notification.publish',
      resource: { kind: 'space_app', id: input.app.id },
      scope: { kind: 'server', id: input.app.serverId },
      result: 'succeeded',
      idempotencyKey: input.idempotencyKey,
      metadata: {
        appKey: input.app.appKey,
        topicKey: input.topicKey,
        recipientCount: results.length,
      },
    })
    return { ok: true, results }
  }
}
