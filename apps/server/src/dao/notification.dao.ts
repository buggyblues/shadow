import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  channels,
  messages,
  notificationChannelPreferences,
  notificationDeliveries,
  notificationEvents,
  notificationPreferences,
  notifications,
  userPushTokens,
  users,
  userWebPushSubscriptions,
} from '../db/schema'

type NotificationStrategy = 'all' | 'mention_only' | 'none'
type NotificationType = 'mention' | 'reply' | 'dm' | 'system'
export type NotificationChannel =
  | 'in_app'
  | 'socket'
  | 'mobile_push'
  | 'web_push'
  | 'email'
  | 'sms'
  | 'chat_system'

export interface CreateNotificationRecord {
  userId: string
  type: NotificationType
  kind?: string
  title: string
  body?: string | null
  referenceId?: string | null
  referenceType?: string | null
  senderId?: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  aggregationKey?: string | null
  metadata?: Record<string, unknown> | null
  expiresAt?: Date | null
}

export interface AggregateNotificationRecord extends CreateNotificationRecord {
  aggregationKey: string
  windowStart: Date
}

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
      .orderBy(desc(sql`coalesce(${notifications.lastAggregatedAt}, ${notifications.createdAt})`))
      .limit(limit)
      .offset(offset)

    return result.map((r) => ({
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
      .orderBy(desc(sql`coalesce(${notifications.lastAggregatedAt}, ${notifications.createdAt})`))

    return result.map((r) => ({
      ...r.notification,
      senderAvatarUrl: r.senderAvatarUrl,
    }))
  }

  async create(data: CreateNotificationRecord) {
    const result = await this.db
      .insert(notifications)
      .values({
        userId: data.userId,
        type: data.type,
        kind: data.kind ?? data.referenceType ?? data.type,
        title: data.title,
        body: data.body,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
        senderId: data.senderId,
        scopeServerId: data.scopeServerId,
        scopeChannelId: data.scopeChannelId,
        aggregationKey: data.aggregationKey,
        metadata: data.metadata,
        expiresAt: data.expiresAt,
      })
      .returning()
    return result[0]
  }

  async aggregateOrCreate(data: AggregateNotificationRecord) {
    const existing = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, data.userId),
          eq(notifications.aggregationKey, data.aggregationKey),
          eq(notifications.isRead, false),
          sql`coalesce(${notifications.lastAggregatedAt}, ${notifications.createdAt}) >= ${data.windowStart.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(desc(sql`coalesce(${notifications.lastAggregatedAt}, ${notifications.createdAt})`))
      .limit(1)

    if (existing[0]) {
      const result = await this.db
        .update(notifications)
        .set({
          title: data.title,
          body: data.body,
          referenceId: data.referenceId,
          referenceType: data.referenceType,
          senderId: data.senderId,
          scopeServerId: data.scopeServerId,
          scopeChannelId: data.scopeChannelId,
          metadata: data.metadata,
          aggregatedCount: sql`${notifications.aggregatedCount} + 1`,
          lastAggregatedAt: new Date(),
        })
        .where(eq(notifications.id, existing[0].id))
        .returning()
      return result[0]
    }

    return this.create(data)
  }

  async markAsRead(userId: string, id: string) {
    const result = await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
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

  async markReferenceAsRead(userId: string, referenceType: string, referenceId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.referenceType, referenceType),
          eq(notifications.referenceId, referenceId),
          eq(notifications.isRead, false),
        ),
      )
  }

  async getUnreadCount(userId: string) {
    const result = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
    return result[0]?.value ?? 0
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
    const result = await this.db
      .insert(notificationPreferences)
      .values({
        userId: data.userId,
        strategy: data.strategy,
        mutedServerIds: data.mutedServerIds,
        mutedChannelIds: data.mutedChannelIds,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          strategy: data.strategy,
          mutedServerIds: data.mutedServerIds,
          mutedChannelIds: data.mutedChannelIds,
          updatedAt: new Date(),
        },
      })
      .returning()
    return result[0]!
  }

  async createEvent(data: {
    userId: string
    notificationId?: string | null
    kind: string
    source?: string
    idempotencyKey?: string | null
    metadata?: Record<string, unknown> | null
  }) {
    const result = await this.db
      .insert(notificationEvents)
      .values({
        userId: data.userId,
        notificationId: data.notificationId,
        kind: data.kind,
        source: data.source ?? 'system',
        idempotencyKey: data.idempotencyKey,
        metadata: data.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning()
    if (result[0]) return result[0]
    if (data.idempotencyKey) {
      const existing = await this.db
        .select()
        .from(notificationEvents)
        .where(eq(notificationEvents.idempotencyKey, data.idempotencyKey))
        .limit(1)
      return existing[0] ?? null
    }
    return null
  }

  async createDeliveries(
    rows: Array<{
      eventId: string
      notificationId?: string | null
      userId: string
      channel: NotificationChannel
      status?: 'pending' | 'sent' | 'failed' | 'skipped'
      provider?: string | null
      target?: string | null
      payload?: Record<string, unknown>
      error?: string | null
      sentAt?: Date | null
    }>,
  ) {
    if (rows.length === 0) return []
    return this.db.insert(notificationDeliveries).values(rows).returning()
  }

  async updateDelivery(
    id: string,
    data: Partial<{
      status: 'pending' | 'sent' | 'failed' | 'skipped'
      provider: string | null
      target: string | null
      error: string | null
      attempts: number
      sentAt: Date | null
      nextAttemptAt: Date | null
    }>,
  ) {
    const result = await this.db
      .update(notificationDeliveries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationDeliveries.id, id))
      .returning()
    return result[0] ?? null
  }

  async getChannelPreferences(userId: string) {
    return this.db
      .select()
      .from(notificationChannelPreferences)
      .where(eq(notificationChannelPreferences.userId, userId))
  }

  async upsertChannelPreference(data: {
    userId: string
    kind: string
    channel: NotificationChannel
    enabled: boolean
  }) {
    const result = await this.db
      .insert(notificationChannelPreferences)
      .values(data)
      .onConflictDoUpdate({
        target: [
          notificationChannelPreferences.userId,
          notificationChannelPreferences.kind,
          notificationChannelPreferences.channel,
        ],
        set: { enabled: data.enabled, updatedAt: new Date() },
      })
      .returning()
    return result[0]!
  }

  async upsertPushToken(data: {
    userId: string
    platform: string
    token: string
    deviceName?: string | null
  }) {
    const result = await this.db
      .insert(userPushTokens)
      .values({
        userId: data.userId,
        platform: data.platform,
        token: data.token,
        deviceName: data.deviceName,
        isActive: true,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPushTokens.token,
        set: {
          userId: data.userId,
          platform: data.platform,
          deviceName: data.deviceName,
          isActive: true,
          updatedAt: new Date(),
          lastUsedAt: new Date(),
        },
      })
      .returning()
    return result[0]!
  }

  async deactivatePushToken(userId: string, idOrToken: string) {
    await this.db
      .update(userPushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(userPushTokens.userId, userId),
          sql`(${userPushTokens.id}::text = ${idOrToken} OR ${userPushTokens.token} = ${idOrToken})`,
        ),
      )
  }

  async findActivePushTokens(userId: string) {
    return this.db
      .select()
      .from(userPushTokens)
      .where(and(eq(userPushTokens.userId, userId), eq(userPushTokens.isActive, true)))
  }

  async upsertWebPushSubscription(data: {
    userId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent?: string | null
  }) {
    const result = await this.db
      .insert(userWebPushSubscriptions)
      .values({
        userId: data.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent,
        isActive: true,
        lastUsedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userWebPushSubscriptions.endpoint,
        set: {
          userId: data.userId,
          p256dh: data.p256dh,
          auth: data.auth,
          userAgent: data.userAgent,
          isActive: true,
          updatedAt: new Date(),
          lastUsedAt: new Date(),
        },
      })
      .returning()
    return result[0]!
  }

  async deactivateWebPushSubscription(userId: string, idOrEndpoint: string) {
    await this.db
      .update(userWebPushSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(userWebPushSubscriptions.userId, userId),
          sql`(${userWebPushSubscriptions.id}::text = ${idOrEndpoint} OR ${userWebPushSubscriptions.endpoint} = ${idOrEndpoint})`,
        ),
      )
  }

  async findActiveWebPushSubscriptions(userId: string) {
    return this.db
      .select()
      .from(userWebPushSubscriptions)
      .where(
        and(
          eq(userWebPushSubscriptions.userId, userId),
          eq(userWebPushSubscriptions.isActive, true),
        ),
      )
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
