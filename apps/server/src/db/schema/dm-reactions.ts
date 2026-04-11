import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { dmMessages } from './dm-messages'
import { users } from './users'

export const dmReactions = pgTable(
  'dm_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dmMessageId: uuid('dm_message_id')
      .notNull()
      .references(() => dmMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('dm_reactions_unique').on(t.dmMessageId, t.userId, t.emoji),
    index('dm_reactions_dm_message_id_idx').on(t.dmMessageId),
    index('dm_reactions_user_id_idx').on(t.userId),
  ],
)
