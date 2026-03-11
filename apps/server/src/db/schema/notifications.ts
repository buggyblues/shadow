import { boolean, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
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

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  referenceId: uuid('reference_id'),
  referenceType: varchar('reference_type', { length: 50 }),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

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
