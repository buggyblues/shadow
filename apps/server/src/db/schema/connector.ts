import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { users } from './users'

export type ConnectorRuntimeStatus = 'available' | 'missing'

export interface ConnectorRuntimeInfo {
  id: string
  label: string
  kind: 'openclaw' | 'cli'
  status: ConnectorRuntimeStatus
  version?: string | null
  command?: string | null
  detectedAt?: string | null
}

export const connectorComputers = pgTable(
  'connector_computers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    hostname: varchar('hostname', { length: 255 }),
    os: varchar('os', { length: 64 }),
    arch: varchar('arch', { length: 64 }),
    daemonVersion: varchar('daemon_version', { length: 64 }),
    runtimes: jsonb('runtimes').$type<ConnectorRuntimeInfo[]>().default([]).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    connectorComputersUserIdIdx: index('connector_computers_user_id_idx').on(t.userId),
    connectorComputersTokenHashIdx: index('connector_computers_token_hash_idx').on(t.tokenHash),
  }),
)

export const connectorJobs = pgTable(
  'connector_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    computerId: uuid('computer_id')
      .notNull()
      .references(() => connectorComputers.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    payloadEncrypted: text('payload_encrypted').notNull(),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    error: text('error'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    connectorJobsComputerStatusIdx: index('connector_jobs_computer_status_idx').on(
      t.computerId,
      t.status,
    ),
    connectorJobsUserIdIdx: index('connector_jobs_user_id_idx').on(t.userId),
    connectorJobsAgentIdIdx: index('connector_jobs_agent_id_idx').on(t.agentId),
  }),
)
