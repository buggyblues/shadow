import { boolean, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { users } from './users'

export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    parentMessageId: uuid('parent_message_id').notNull(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isArchived: boolean('is_archived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    threadsChannelIdIdx: index('threads_channel_id_idx').on(t.channelId),
    threadsParentMessageIdIdx: index('threads_parent_message_id_idx').on(t.parentMessageId),
  }),
)
