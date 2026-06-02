import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { attachments } from './attachments'
import { channels } from './channels'
import { messages } from './messages'
import { servers } from './servers'
import { users } from './users'

export type ContentFeedKind = 'image' | 'html' | 'pdf' | 'file' | 'voice' | 'card'
export type ContentSubscriptionStatus = 'active' | 'paused'
export type ContentDigestMode = 'realtime' | 'daily' | 'none'
export type ContentFeedEventState = 'seen' | 'opened' | 'saved' | 'hidden' | 'dismissed'

export const channelContentSubscriptions = pgTable(
  'channel_content_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 24 })
      .$type<ContentSubscriptionStatus>()
      .default('active')
      .notNull(),
    includeKinds: varchar('include_kinds', { length: 24 })
      .array()
      .$type<ContentFeedKind[]>()
      .default(['image', 'html', 'pdf', 'file', 'voice', 'card'])
      .notNull(),
    excludeMimeTypes: varchar('exclude_mime_types', { length: 120 }).array().default([]).notNull(),
    minAttachmentSize: integer('min_attachment_size'),
    maxAttachmentSize: integer('max_attachment_size'),
    pushEnabled: boolean('push_enabled').default(true).notNull(),
    digestMode: varchar('digest_mode', { length: 24 })
      .$type<ContentDigestMode>()
      .default('realtime')
      .notNull(),
    ruleCustomized: boolean('rule_customized').default(false).notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    channelContentSubscriptionsUserChannelUnique: unique(
      'channel_content_subscriptions_user_channel_unique',
    ).on(t.userId, t.channelId),
    channelContentSubscriptionsUserStatusIdx: index(
      'channel_content_subscriptions_user_status_idx',
    ).on(t.userId, t.status, t.channelId),
    channelContentSubscriptionsChannelStatusIdx: index(
      'channel_content_subscriptions_channel_status_idx',
    ).on(t.channelId, t.status),
    channelContentSubscriptionsServerIdx: index('channel_content_subscriptions_server_idx').on(
      t.serverId,
    ),
  }),
)

export const contentSubscriptionPreferences = pgTable(
  'content_subscription_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    includeKinds: varchar('include_kinds', { length: 24 })
      .array()
      .$type<ContentFeedKind[]>()
      .default(['image', 'html', 'pdf', 'file', 'voice', 'card'])
      .notNull(),
    pushEnabled: boolean('push_enabled').default(true).notNull(),
    digestMode: varchar('digest_mode', { length: 24 })
      .$type<ContentDigestMode>()
      .default('realtime')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    contentSubscriptionPreferencesUserUnique: unique(
      'content_subscription_preferences_user_unique',
    ).on(t.userId),
  }),
)

export const contentFeedItems = pgTable(
  'content_feed_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 240 }).notNull(),
    summary: text('summary'),
    contentKinds: varchar('content_kinds', { length: 24 })
      .array()
      .$type<ContentFeedKind[]>()
      .default([])
      .notNull(),
    primaryAttachmentId: uuid('primary_attachment_id').references(() => attachments.id, {
      onDelete: 'set null',
    }),
    primaryAttachmentContentType: varchar('primary_attachment_content_type', { length: 120 }),
    primaryAttachmentSize: integer('primary_attachment_size'),
    attachmentIds: uuid('attachment_ids').array().default([]).notNull(),
    cardRefs: jsonb('card_refs').$type<Array<Record<string, unknown>>>().default([]).notNull(),
    score: integer('score').default(0).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    contentFeedItemsMessageUnique: unique('content_feed_items_message_unique').on(t.messageId),
    contentFeedItemsChannelPublishedIdx: index('content_feed_items_channel_published_idx').on(
      t.channelId,
      t.publishedAt,
      t.id,
    ),
    contentFeedItemsServerPublishedIdx: index('content_feed_items_server_published_idx').on(
      t.serverId,
      t.publishedAt,
      t.id,
    ),
    contentFeedItemsPublishedIdx: index('content_feed_items_published_idx').on(t.publishedAt, t.id),
    contentFeedItemsScorePublishedIdx: index('content_feed_items_score_published_idx').on(
      t.score,
      t.publishedAt,
      t.id,
    ),
    contentFeedItemsKindsIdx: index('content_feed_items_kinds_idx').using('gin', t.contentKinds),
  }),
)

export const contentFeedEvents = pgTable(
  'content_feed_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feedItemId: uuid('feed_item_id')
      .notNull()
      .references(() => contentFeedItems.id, { onDelete: 'cascade' }),
    state: varchar('state', { length: 24 }).$type<ContentFeedEventState>().notNull(),
    lastPosition: jsonb('last_position').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    contentFeedEventsUserItemUnique: unique('content_feed_events_user_item_unique').on(
      t.userId,
      t.feedItemId,
    ),
    contentFeedEventsUserStateIdx: index('content_feed_events_user_state_idx').on(
      t.userId,
      t.state,
      t.updatedAt,
    ),
  }),
)
