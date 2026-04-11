import { index, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { servers } from './servers'
import { users } from './users'

export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member'])

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').default('member').notNull(),
    nickname: varchar('nickname', { length: 64 }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    membersServerIdIdx: index('members_server_id_idx').on(t.serverId),
    membersUserIdIdx: index('members_user_id_idx').on(t.userId),
  }),
)
