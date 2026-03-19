import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Database } from '../db'
import { channels, messages, notificationPreferences, notifications, users } from '../db/schema'

type NotificationStrategy = 'all' | 'mention_only' | 'none'

export class NotificationDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findByUserId(userId: string, limit = 50, offset = 0) {
    const result = await this.db
      .select({
        notification: notifications,
        senderAvatarUrl: users.avatarUrl,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.senderId, users.id))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset)
    
    return result.map(r => ({
      ...r.notification,
      senderAvatarUrl: r.senderAvatarUrl,
    }))
  }

  async findUnreadByUserId(userId: string) {
    const result = await this.db
      .select({
        notification: notifications,
        senderAvatarUrl: users.avatarUrl,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.senderId, users.id))
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .orderBy(desc(notifications.createdAt))
    
    return result.map(r => ({
      ...r.notification,
      senderAvatarUrl: r.senderAvatarUrl,
    }))
  }

  async create(data: {
    userId: string
    type: 'mention' | 'reply' | 'dm' | 'system'
    title: string
    body?: string
    referenceId?: string
    referenceType?: string
    senderId?: string
  }) {
    const result = await this.db.insert(notifications).values(data).returning()
    return result[0]
  }

  async markAsRead(id: string) {
    const result = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning()
    return result[0] ?? null
  }

  async markAllAsRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
  }

  async markAsReadByIds(ids: string[]) {
    if (ids.length === 0) return
    await this.db.update(notifications).set({ isRead: true }).where(inArray(notifications.id, ids))
  }

  async getUnreadCount(userId: string) {
    const result = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
    return result.length
  }

  async getPreference(userId: string) {
    const result = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1)
    return result[0] ?? null
  }

  async upsertPreference(data: {
    userId: string
    strategy: NotificationStrategy
    mutedServerIds: string[]
    mutedChannelIds: string[]
  }) {
    const existing = await this.getPreference(data.userId)
    if (!existing) {
      const inserted = await this.db
        .insert(notificationPreferences)
        .values({
          userId: data.userId,
          strategy: data.strategy,
          mutedServerIds: data.mutedServerIds,
          mutedChannelIds: data.mutedChannelIds,
        })
        .returning()
      return inserted[0]!
    }

    const updated = await this.db
      .update(notificationPreferences)
      .set({
        strategy: data.strategy,
        mutedServerIds: data.mutedServerIds,
        mutedChannelIds: data.mutedChannelIds,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.userId, data.userId))
      .returning()
    return updated[0]!
  }

  async findMessageScopesByMessageIds(messageIds: string[]) {
    if (messageIds.length === 0) return []
    return this.db
      .select({
        messageId: messages.id,
        channelId: channels.id,
        serverId: channels.serverId,
      })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .where(inArray(messages.id, messageIds))
  }

  async findChannelScopes(channelIds: string[]) {
    if (channelIds.length === 0) return []
    return this.db
      .select({
        channelId: channels.id,
        serverId: channels.serverId,
      })
      .from(channels)
      .where(inArray(channels.id, channelIds))
  }
}
