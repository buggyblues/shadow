import type { NotificationDao } from '../dao/notification.dao'

type NotificationType = 'mention' | 'reply' | 'dm' | 'system'
type NotificationStrategy = 'all' | 'mention_only' | 'none'

interface NotificationPreference {
  userId: string
  strategy: NotificationStrategy
  mutedServerIds: string[]
  mutedChannelIds: string[]
}

interface NotificationItem {
  id: string
  userId: string
  type: NotificationType
  referenceId: string | null
  referenceType: string | null
  isRead: boolean
}

export class NotificationService {
  constructor(private deps: { notificationDao: NotificationDao }) {}

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

  private async filterByPreference(
    notifications: NotificationItem[],
    preference: NotificationPreference,
  ) {
    const base = notifications.filter((n) => this.shouldKeepByStrategy(n.type, preference.strategy))
    if (base.length === 0) return []

    const messageIds = base
      .filter((n) => n.referenceType === 'message' && n.referenceId)
      .map((n) => n.referenceId!)
    const channelInviteChannelIds = base
      .filter((n) => n.referenceType === 'channel_invite' && n.referenceId)
      .map((n) => n.referenceId!)

    const [messageScopes, channelScopes] = await Promise.all([
      this.deps.notificationDao.findMessageScopesByMessageIds(messageIds),
      this.deps.notificationDao.findChannelScopes(channelInviteChannelIds),
    ])

    const messageScopeMap = new Map(
      messageScopes.map((s) => [s.messageId, { channelId: s.channelId, serverId: s.serverId }]),
    )
    const channelScopeMap = new Map(
      channelScopes.map((s) => [s.channelId, { serverId: s.serverId }]),
    )

    return base.filter((n) => {
      if (!n.referenceId) return true

      if (n.referenceType === 'message') {
        const scope = messageScopeMap.get(n.referenceId)
        if (!scope) return true
        if (preference.mutedChannelIds.includes(scope.channelId)) return false
        if (preference.mutedServerIds.includes(scope.serverId)) return false
      }

      if (n.referenceType === 'channel_invite') {
        const scope = channelScopeMap.get(n.referenceId)
        if (!scope) return true
        if (preference.mutedChannelIds.includes(n.referenceId)) return false
        if (preference.mutedServerIds.includes(scope.serverId)) return false
      }

      if (n.referenceType === 'server_join') {
        if (preference.mutedServerIds.includes(n.referenceId)) return false
      }

      return true
    })
  }

  async getByUserId(userId: string, limit?: number, offset?: number) {
    const [notifications, preference] = await Promise.all([
      this.deps.notificationDao.findByUserId(userId, limit, offset),
      this.getOrInitPreference(userId),
    ])
    return this.filterByPreference(notifications, preference)
  }

  async create(data: {
    userId: string
    type: 'mention' | 'reply' | 'dm' | 'system'
    title: string
    body?: string
    referenceId?: string
    referenceType?: string
  }) {
    return this.deps.notificationDao.create(data)
  }

  async markAsRead(id: string) {
    return this.deps.notificationDao.markAsRead(id)
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

    const messageIds = filtered
      .filter((n) => n.referenceType === 'message' && n.referenceId)
      .map((n) => n.referenceId!)
    const scopes = await this.deps.notificationDao.findMessageScopesByMessageIds(messageIds)

    const channelUnread: Record<string, number> = {}
    const serverUnread: Record<string, number> = {}

    for (const s of scopes) {
      channelUnread[s.channelId] = (channelUnread[s.channelId] ?? 0) + 1
      serverUnread[s.serverId] = (serverUnread[s.serverId] ?? 0) + 1
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
      .filter((n) => n.referenceType === 'message' && n.referenceId)
      .map((n) => n.referenceId!)
    const channelInviteChannelIds = unread
      .filter((n) => n.referenceType === 'channel_invite' && n.referenceId)
      .map((n) => n.referenceId!)

    const [messageScopes, channelScopes] = await Promise.all([
      this.deps.notificationDao.findMessageScopesByMessageIds(messageIds),
      this.deps.notificationDao.findChannelScopes(channelInviteChannelIds),
    ])

    const messageScopeMap = new Map(
      messageScopes.map((s) => [s.messageId, { channelId: s.channelId, serverId: s.serverId }]),
    )
    const channelScopeMap = new Map(
      channelScopes.map((s) => [s.channelId, { serverId: s.serverId }]),
    )

    const matched: string[] = []

    for (const n of unread) {
      if (!n.referenceId) continue

      if (n.referenceType === 'message') {
        const s = messageScopeMap.get(n.referenceId)
        if (!s) continue
        const byChannel = scope.channelId ? s.channelId === scope.channelId : true
        const byServer = scope.serverId ? s.serverId === scope.serverId : true
        if (byChannel && byServer) matched.push(n.id)
        continue
      }

      if (n.referenceType === 'channel_invite') {
        const s = channelScopeMap.get(n.referenceId)
        if (!s) continue
        const byChannel = scope.channelId ? n.referenceId === scope.channelId : true
        const byServer = scope.serverId ? s.serverId === scope.serverId : true
        if (byChannel && byServer) matched.push(n.id)
        continue
      }

      if (n.referenceType === 'server_join') {
        if (scope.serverId && n.referenceId === scope.serverId) matched.push(n.id)
      }
    }

    await this.deps.notificationDao.markAsReadByIds(matched)
    return { updated: matched.length }
  }
}
