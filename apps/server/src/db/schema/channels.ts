import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { servers } from './servers'

export const channelTypeEnum = pgEnum('channel_type', ['text', 'voice', 'announcement'])

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  type: channelTypeEnum('type').default('text').notNull(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  topic: text('topic'),
  position: integer('position').default(0).notNull(),
  /** Private channels are only visible to explicitly added members */
  isPrivate: boolean('is_private').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
