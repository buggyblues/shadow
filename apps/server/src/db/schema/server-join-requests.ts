import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { servers } from './servers'
import { users } from './users'

export const serverJoinRequests = pgTable(
  'server_join_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('server_join_requests_server_user_unique').on(t.serverId, t.userId),
    index('server_join_requests_server_status_idx').on(t.serverId, t.status),
    index('server_join_requests_user_status_idx').on(t.userId, t.status),
  ],
)
