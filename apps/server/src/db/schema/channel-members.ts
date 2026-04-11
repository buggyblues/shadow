import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { users } from './users'

export const channelMembers = pgTable(
  'channel_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('channel_members_channel_user_unique').on(t.channelId, t.userId),
    index('channel_members_user_id_idx').on(t.userId),
  ],
)
