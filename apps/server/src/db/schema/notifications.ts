import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { servers } from './servers'
import { spaceAppInstallations } from './space-app-installations'
import { users } from './users'

export const notificationTypeEnum = pgEnum('notification_type', [
  'mention',
  'reply',
  'dm',
  'system',
])

export const notificationStrategyEnum = pgEnum('notification_strategy', [
  'all',
  'mention_only',
  'none',
])

export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'socket',
  'mobile_push',
  'web_push',
  'email',
  'sms',
  'chat_system',
])

export const notificationDeliveryStatusEnum = pgEnum('notification_delivery_status', [
  'pending',
  'sent',
  'failed',
  'skipped',
  'dead_letter',
])

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    /**
     * Stable product event identifier. `type` stays as the coarse legacy bucket
     * (mention/reply/dm/system) for SDK compatibility; `kind` drives routing,
     * actions, templates, and future push workflows.
     */
    kind: varchar('kind', { length: 80 }).default('system').notNull(),
    referenceId: uuid('reference_id'),
    referenceType: varchar('reference_type', { length: 50 }),
    senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
    scopeServerId: uuid('scope_server_id'),
    scopeChannelId: uuid('scope_channel_id'),
    aggregationKey: varchar('aggregation_key', { length: 240 }),
    aggregatedCount: integer('aggregated_count').default(1).notNull(),
    lastAggregatedAt: timestamp('last_aggregated_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    sourceSpaceAppId: uuid('source_space_app_id').references(() => spaceAppInstallations.id, {
      onDelete: 'set null',
    }),
    sourceSpaceAppKey: varchar('source_space_app_key', { length: 80 }),
    sourceSpaceAppTopicKey: varchar('source_space_app_topic_key', { length: 80 }),
    sourceSpaceAppEventKey: varchar('source_space_app_event_key', { length: 200 }),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => ({
    notificationsUserIdIdx: index('notifications_user_id_idx').on(t.userId),
    notificationsCreatedAtIdx: index('notifications_created_at_idx').on(t.createdAt),
    notificationsIsReadIdx: index('notifications_is_read_idx').on(t.isRead),
    notificationsUserUnreadCreatedIdx: index('notifications_user_unread_created_idx').on(
      t.userId,
      t.isRead,
      t.lastAggregatedAt,
      t.createdAt,
    ),
    notificationsScopeChannelIdx: index('notifications_scope_channel_idx').on(t.scopeChannelId),
    notificationsScopeServerIdx: index('notifications_scope_server_idx').on(t.scopeServerId),
    notificationsAggregationIdx: index('notifications_aggregation_idx').on(
      t.userId,
      t.aggregationKey,
      t.isRead,
    ),
    notificationsSourceAppIdx: index('notifications_source_space_app_idx').on(
      t.userId,
      t.sourceSpaceAppId,
      t.sourceSpaceAppTopicKey,
    ),
    notificationsSourceAppEventUnique: unique('notifications_source_space_app_event_unique').on(
      t.userId,
      t.sourceSpaceAppId,
      t.sourceSpaceAppEventKey,
    ),
  }),
)

export const spaceAppNotificationTopics = pgTable(
  'space_app_notification_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceAppId: uuid('space_app_id')
      .notNull()
      .references(() => spaceAppInstallations.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    appKey: varchar('app_key', { length: 80 }).notNull(),
    topicKey: varchar('topic_key', { length: 80 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    description: text('description'),
    defaultEnabled: boolean('default_enabled').default(true).notNull(),
    defaultChannels: jsonb('default_channels')
      .$type<Array<'in_app' | 'mobile_push' | 'web_push' | 'email'>>()
      .default(['in_app'])
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    spaceAppNotificationTopicsUnique: unique('space_app_notification_topics_unique').on(
      t.spaceAppId,
      t.topicKey,
    ),
    spaceAppNotificationTopicsServerIdx: index('space_app_notification_topics_server_idx').on(
      t.serverId,
    ),
  }),
)

export const spaceAppNotificationPreferences = pgTable(
  'space_app_notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    spaceAppId: uuid('space_app_id')
      .notNull()
      .references(() => spaceAppInstallations.id, { onDelete: 'cascade' }),
    topicKey: varchar('topic_key', { length: 80 }).notNull(),
    enabled: boolean('enabled').notNull(),
    channels: jsonb('channels')
      .$type<Array<'in_app' | 'mobile_push' | 'web_push' | 'email'>>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    spaceAppNotificationPreferencesUnique: unique('space_app_notification_preferences_unique').on(
      t.userId,
      t.spaceAppId,
      t.topicKey,
    ),
    spaceAppNotificationPreferencesUserIdx: index('space_app_notification_preferences_user_idx').on(
      t.userId,
    ),
  }),
)

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  strategy: notificationStrategyEnum('strategy').default('all').notNull(),
  mutedServerIds: uuid('muted_server_ids').array().default([]).notNull(),
  mutedChannelIds: uuid('muted_channel_ids').array().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const notificationEvents = pgTable(
  'notification_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'set null',
    }),
    kind: varchar('kind', { length: 80 }).notNull(),
    source: varchar('source', { length: 80 }).default('system').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    notificationEventsUserIdx: index('notification_events_user_idx').on(t.userId),
    notificationEventsKindIdx: index('notification_events_kind_idx').on(t.kind),
    notificationEventsIdempotencyUnique: unique('notification_events_idempotency_unique').on(
      t.idempotencyKey,
    ),
  }),
)

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => notificationEvents.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull(),
    status: notificationDeliveryStatusEnum('status').default('pending').notNull(),
    provider: varchar('provider', { length: 80 }),
    target: text('target'),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    notificationDeliveriesEventIdx: index('notification_deliveries_event_idx').on(t.eventId),
    notificationDeliveriesUserIdx: index('notification_deliveries_user_idx').on(t.userId),
    notificationDeliveriesStatusIdx: index('notification_deliveries_status_idx').on(t.status),
    notificationDeliveriesChannelIdx: index('notification_deliveries_channel_idx').on(t.channel),
    notificationDeliveriesRetryIdx: index('notification_deliveries_retry_idx').on(
      t.status,
      t.nextAttemptAt,
    ),
  }),
)

export const userPushTokens = pgTable(
  'user_push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 20 }).notNull(),
    token: text('token').notNull(),
    deviceName: varchar('device_name', { length: 120 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    userPushTokensUserIdx: index('user_push_tokens_user_idx').on(t.userId),
    userPushTokensActiveIdx: index('user_push_tokens_active_idx').on(t.isActive),
    userPushTokensTokenUnique: unique('user_push_tokens_token_unique').on(t.token),
  }),
)

export const userWebPushSubscriptions = pgTable(
  'user_web_push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    userWebPushSubscriptionsUserIdx: index('user_web_push_subscriptions_user_idx').on(t.userId),
    userWebPushSubscriptionsActiveIdx: index('user_web_push_subscriptions_active_idx').on(
      t.isActive,
    ),
    userWebPushSubscriptionsEndpointUnique: unique(
      'user_web_push_subscriptions_endpoint_unique',
    ).on(t.endpoint),
  }),
)

export const notificationChannelPreferences = pgTable(
  'notification_channel_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 80 }).notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    notificationChannelPreferencesPk: unique('notification_channel_preferences_unique').on(
      t.userId,
      t.kind,
      t.channel,
    ),
  }),
)
