import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const dmChannels = pgTable(
  'dm_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('dm_channels_pair').on(t.userAId, t.userBId),
    index('dm_channels_user_a_id_idx').on(t.userAId),
    index('dm_channels_user_b_id_idx').on(t.userBId),
  ],
)
