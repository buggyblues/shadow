import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { messages } from './messages'
import { users } from './users'

export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('reactions_unique').on(t.messageId, t.userId, t.emoji),
    index('reactions_message_id_idx').on(t.messageId),
    index('reactions_user_id_idx').on(t.userId),
  ],
)
