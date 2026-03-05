import { boolean, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', ['online', 'idle', 'dnd', 'offline'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  displayName: varchar('display_name', { length: 64 }),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash').notNull(),
  status: userStatusEnum('status').default('offline').notNull(),
  isBot: boolean('is_bot').default(false).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
