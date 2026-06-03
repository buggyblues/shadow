import type { CreateNotificationRecord, NotificationDao } from '../dao/notification.dao'
import { resolveAvatarUrl } from '../lib/avatar-url'
import type { MediaService } from './media.service'

export type NotificationType = 'mention' | 'reply' | 'dm' | 'system'
export type NotificationStrategy = 'all' | 'mention_only' | 'none'

const DEFAULT_AGGREGATION_WINDOW_MS = 5 * 60 * 1000

export interface NotificationPreference {
  userId: string
  strategy: NotificationStrategy
  mutedServerIds: string[]
  mutedChannelIds: string[]
}

export interface NotificationItem {
  id: string
  userId: string
  type: NotificationType
  kind?: string | null
  referenceId: string | null
  referenceType: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  senderAvatarUrl?: string | null
  aggregatedCount?: number | null
  isRead: boolean
}

export interface NotificationCreateInput extends CreateNotificationRecord {
  type: NotificationType
  delivery?: {
    bypassPreferences?: boolean
    aggregate?: boolean
    aggregationWindowMs?: number
  }
}

export class NotificationService {
  constructor(
    private deps: {
      notificationDao: NotificationDao
      mediaService?: Pick<MediaService, 'resolveMediaUrl'>
    },
  ) {}

  private resolveSenderAvatars<T extends { senderAvatarUrl?: string | null }>(items: T[]): T[] {
    return items.map((item) => ({
      ...item,
      senderAvatarUrl: resolveAvatarUrl(this.deps.mediaService, item.senderAvatarUrl),
    }))
  }

  private async getOrInitPreference(userId: string): Promise<NotificationPreference> {
    const pref = await this.deps.notificationDao.getPreference(userId)
    if (pref) {
      return {
        userId: pref.userId,
        strategy: pref.strategy,
        mutedServerIds: pref.mutedServerIds ?? [],
        mutedChannelIds: pref.mutedChannelIds ?? [],
      }
    }
    const created = await this.deps.notificationDao.upsertPreference({
      userId,
      strategy: 'all',
      mutedServerIds: [],
      mutedChannelIds: [],
    })
    return {
      userId: created.userId,
      strategy: created.strategy,
      mutedServerIds: created.mutedServerIds ?? [],
      mutedChannelIds: created.mutedChannelIds ?? [],
    }
  }

  private shouldKeepByStrategy(type: NotificationType, strategy: NotificationStrategy): boolean {
    if (type === 'system') return true
    if (strategy === 'none') return false
    if (strategy === 'mention_only') return type === 'mention'
    return true
  }

  private directScopeBlocked(
    notification: Pick<
      NotificationItem,
      'referenceId' | 'referenceType' | 'scopeServerId' | 'scopeChannelId'
    >,
    preference: NotificationPreference,
  ) {
    if (notification.scopeChannelId) {
      if (preference.mutedChannelIds.includes(notification.scopeChannelId)) return true
    }
    if (notification.scopeServerId) {
      if (preference.mutedServerIds.includes(notification.scopeServerId)) return true
    }
    if (notification.referenceType === 'server_join' && notification.referenceId) {
      if (preference.mutedServerIds.includes(notification.referenceId)) return true
    }
    return false
  }

  private async filterByPreference(
    notifications: NotificationItem[],
    preference: NotificationPreference,
  ) {
    const base = notifications.filter((n) => this.shouldKeepByStrategy(n.type, preference.strategy))
    if (base.length === 0) return []

    const directAllowed = base.filter((notification) => {
      return !this.directScopeBlocked(notification, preference)
    })
    if (directAllowed.length === 0) return []

    const messageIds = directAllowed
      .filter((n) => !n.scopeChannelId && n.referenceType === 'message' && n.referenceId)
      .map((n) => n.referenceId!)
    const channelReferenceIds = directAllowed
      .filter(
        (n) =>
          !n.scopeChannelId &&
          (n.referenceType === 'channel_invite' ||
            n.referenceType === 'channel_join_request' ||
            n.referenceType === 'channel_access_request') &&
          n.referenceId,
      )
      .map((n) => n.referenceId!)

    const [messageScopes, channelScopes] = await Promise.all([
      this.deps.notificationDao.findMessageScopesByMessageIds(messageIds),
      this.deps.notificationDao.findChannelScopes(channelReferenceIds),
    ])

    const messageScopeMap = new Map(
      messageScopes.map((s) => [s.messageId, { channelId: s.channelId, serverId: s.serverId }]),
    )
    const channelScopeMap = new Map(
      channelScopes.map((s) => [s.channelId, { channelId: s.channelId, serverId: s.serverId }]),
    )

    return directAllowed.filter((n) => {
      if (!n.referenceId) return true

      if (n.referenceType === 'message' && !n.scopeChannelId) {
        const scope = messageScopeMap.get(n.referenceId)
        if (!scope) return true
        if (preference.mutedChannelIds.includes(scope.channelId)) return false
        if (scope.serverId && preference.mutedServerIds.includes(scope.serverId)) return false
      }

      if (
        (n.referenceType === 'channel_invite' ||
          n.referenceType === 'channel_join_request' ||
          n.referenceType === 'channel_access_request') &&
        !n.scopeChannelId
      ) {
        const scope = channelScopeMap.get(n.referenceId)
        if (!scope) return true
        if (preference.mutedChannelIds.includes(n.referenceId)) return false
        if (scope.serverId && preference.mutedServerIds.includes(scope.serverId)) return false
      }

      return true
    })
  }

  private async isAllowedByPreference(input: NotificationCreateInput) {
    if (input.delivery?.bypassPreferences) return true
    const preference = await this.getOrInitPreference(input.userId)
    const filtered = await this.filterByPreference(
      [
        {
          id: 'candidate',
          userId: input.userId,
          type: input.type,
          kind: input.kind,
          referenceId: input.referenceId ?? null,
          referenceType: input.referenceType ?? null,
          scopeServerId: input.scopeServerId ?? null,
          scopeChannelId: input.scopeChannelId ?? null,
          isRead: false,
        },
      ],
      preference,
    )
    return filtered.length > 0
  }

  async getByUserId(userId: string, limit?: number, offset?: number) {
    const [notifications, preference] = await Promise.all([
      this.deps.notificationDao.findByUserId(userId, limit, offset),
      this.getOrInitPreference(userId),
    ])
    return this.resolveSenderAvatars(await this.filterByPreference(notifications, preference))
  }

  async create(data: NotificationCreateInput) {
    const allowed = await this.isAllowedByPreference(data)
    if (!allowed) return null

    const shouldAggregate = data.delivery?.aggregate !== false && Boolean(data.aggregationKey)
    if (shouldAggregate && data.aggregationKey) {
      return this.deps.notificationDao.aggregateOrCreate({
        ...data,
        aggregationKey: data.aggregationKey,
        windowStart: new Date(
          Date.now() - (data.delivery?.aggregationWindowMs ?? DEFAULT_AGGREGATION_WINDOW_MS),
        ),
      })
    }

    return this.deps.notificationDao.create(data)
  }

  async markAsRead(userId: string, id: string) {
    return this.deps.notificationDao.markAsRead(userId, id)
  }

  async markReferenceAsRead(userId: string, referenceType: string, referenceId: string) {
    await this.deps.notificationDao.markReferenceAsRead(userId, referenceType, referenceId)
  }

  async markAllAsRead(userId: string) {
    await this.deps.notificationDao.markAllAsRead(userId)
  }

  async getUnreadCount(userId: string) {
    const [unread, preference] = await Promise.all([
      this.deps.notificationDao.findUnreadByUserId(userId),
      this.getOrInitPreference(userId),
    ])
    const filtered = await this.filterByPreference(unread, preference)
    return filtered.length
  }

  async getPreference(userId: string) {
    return this.getOrInitPreference(userId)
  }

  async updatePreference(
    userId: string,
    data: Partial<{
      strategy: NotificationStrategy
      mutedServerIds: string[]
      mutedChannelIds: string[]
    }>,
  ) {
    const current = await this.getOrInitPreference(userId)
    return this.deps.notificationDao.upsertPreference({
      userId,
      strategy: data.strategy ?? current.strategy,
      mutedServerIds: data.mutedServerIds ?? current.mutedServerIds,
      mutedChannelIds: data.mutedChannelIds ?? current.mutedChannelIds,
    })
  }

  async getScopedUnread(userId: string) {
    const [unread, preference] = await Promise.all([
      this.deps.notificationDao.findUnreadByUserId(userId),
      this.getOrInitPreference(userId),
    ])
    const filtered = await this.filterByPreference(unread, preference)

    const missingMessageScopeIds = filtered
      .filter((n) => !n.scopeChannelId && n.referenceType === 'message' && n.referenceId)
      .map((n) => n.referenceId!)
    const fallbackMessageScopes =
      await this.deps.notificationDao.findMessageScopesByMessageIds(missingMessageScopeIds)
    const fallbackByMessageId = new Map(
      fallbackMessageScopes.map((s) => [
        s.messageId,
        { channelId: s.channelId, serverId: s.serverId },
      ]),
    )

    const channelUnread: Record<string, number> = {}
    const serverUnread: Record<string, number> = {}

    for (const notification of filtered) {
      const count = Math.max(notification.aggregatedCount ?? 1, 1)
      const fallback =
        notification.referenceType === 'message' && notification.referenceId
          ? fallbackByMessageId.get(notification.referenceId)
          : undefined
      const channelId = notification.scopeChannelId ?? fallback?.channelId
      const serverId = notification.scopeServerId ?? fallback?.serverId

      if (channelId) channelUnread[channelId] = (channelUnread[channelId] ?? 0) + count
      if (serverId) serverUnread[serverId] = (serverUnread[serverId] ?? 0) + count
    }

    return { channelUnread, serverUnread }
  }

  async markScopeAsRead(
    userId: string,
    scope: {
      serverId?: string
      channelId?: string
    },
  ) {
    const unread = await this.deps.notificationDao.findUnreadByUserId(userId)
    if (unread.length === 0) return { updated: 0 }

    const messageIds = unread
      .filter((n) => !n.scopeChannelId && n.referenceType === 'message' && n.referenceId)
      .map((n) => n.referenceId!)
    const channelReferenceIds = unread
      .filter(
        (n) =>
          !n.scopeChannelId &&
          (n.referenceType === 'channel_invite' ||
            n.referenceType === 'channel_join_request' ||
            n.referenceType === 'channel_access_request') &&
          n.referenceId,
      )
      .map((n) => n.referenceId!)

    const [messageScopes, channelScopes] = await Promise.all([
      this.deps.notificationDao.findMessageScopesByMessageIds(messageIds),
      this.deps.notificationDao.findChannelScopes(channelReferenceIds),
    ])

    const messageScopeMap = new Map(
      messageScopes.map((s) => [s.messageId, { channelId: s.channelId, serverId: s.serverId }]),
    )
    const channelScopeMap = new Map(
      channelScopes.map((s) => [s.channelId, { channelId: s.channelId, serverId: s.serverId }]),
    )

    const matched: string[] = []

    for (const n of unread) {
      const fallback =
        n.referenceType === 'message' && n.referenceId
          ? messageScopeMap.get(n.referenceId)
          : n.referenceId
            ? channelScopeMap.get(n.referenceId)
            : undefined
      const channelId = n.scopeChannelId ?? fallback?.channelId
      const serverId = n.scopeServerId ?? fallback?.serverId

      const byChannel = scope.channelId ? channelId === scope.channelId : true
      const byServer = scope.serverId ? serverId === scope.serverId : true
      if (byChannel && byServer) matched.push(n.id)
    }

    await this.deps.notificationDao.markAsReadByIds(matched)
    return { updated: matched.length }
  }
}
