import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { dmChannels } from './dm-channels'
import type { MessageMetadata } from './messages'
import { users } from './users'

export const dmMessages = pgTable(
  'dm_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    content: text('content').notNull(),
    dmChannelId: uuid('dm_channel_id')
      .notNull()
      .references(() => dmChannels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    replyToId: uuid('reply_to_id'),
    isEdited: boolean('is_edited').default(false).notNull(),
    /** Metadata for agent chains, custom data, etc. */
    metadata: jsonb('metadata').$type<MessageMetadata>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    dmMessagesDmChannelIdIdx: index('dm_messages_dm_channel_id_idx').on(t.dmChannelId),
    dmMessagesCreatedAtIdx: index('dm_messages_created_at_idx').on(t.createdAt),
  }),
)
