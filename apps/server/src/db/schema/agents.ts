import { integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const agentStatusEnum = pgEnum('agent_status', ['running', 'stopped', 'error'])

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kernelType: varchar('kernel_type', { length: 50 }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  containerId: varchar('container_id', { length: 100 }),
  status: agentStatusEnum('status').default('stopped').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  totalOnlineSeconds: integer('total_online_seconds').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
