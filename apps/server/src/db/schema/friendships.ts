import { index, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const friendshipStatusEnum = pgEnum('friendship_status', ['pending', 'accepted', 'blocked'])

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('friendships_pair').on(t.requesterId, t.addresseeId),
    index('friendships_requester_id_idx').on(t.requesterId),
    index('friendships_addressee_id_idx').on(t.addresseeId),
    index('friendships_status_idx').on(t.status),
  ],
)
