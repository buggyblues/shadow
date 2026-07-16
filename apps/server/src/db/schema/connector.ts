import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
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
  iconId?: string | null
  installCommand?: string | null
  installCommands?: string[]
  helpUrl?: string | null
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
    installationId: varchar('installation_id', { length: 128 }),
    deviceFingerprint: varchar('device_fingerprint', { length: 128 }),
    hostname: varchar('hostname', { length: 255 }),
    os: varchar('os', { length: 64 }),
    osVersion: varchar('os_version', { length: 128 }),
    arch: varchar('arch', { length: 64 }),
    deviceClass: varchar('device_class', { length: 32 }).default('unknown').notNull(),
    deviceVendor: varchar('device_vendor', { length: 128 }),
    deviceModel: varchar('device_model', { length: 255 }),
    daemonVersion: varchar('daemon_version', { length: 64 }),
    capabilities: jsonb('capabilities').$type<string[]>().default([]).notNull(),
    runtimes: jsonb('runtimes').$type<ConnectorRuntimeInfo[]>().default([]).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    connectorComputersUserIdIdx: index('connector_computers_user_id_idx').on(t.userId),
    connectorComputersTokenHashIdx: index('connector_computers_token_hash_idx').on(t.tokenHash),
    connectorComputersInstallationUniqueIdx: uniqueIndex(
      'connector_computers_user_installation_unique_idx',
    )
      .on(t.userId, t.installationId)
      .where(sql`${t.installationId} IS NOT NULL AND ${t.revokedAt} IS NULL`),
    connectorComputersDeviceFingerprintUniqueIdx: uniqueIndex(
      'connector_computers_user_device_fingerprint_unique_idx',
    )
      .on(t.userId, t.deviceFingerprint)
      .where(sql`${t.deviceFingerprint} IS NOT NULL AND ${t.revokedAt} IS NULL`),
  }),
)

export const agentComputerPlacements = pgTable(
  'agent_computer_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    computerKind: varchar('computer_kind', { length: 16 }).notNull(),
    localComputerId: uuid('local_computer_id').references(() => connectorComputers.id, {
      onDelete: 'cascade',
    }),
    cloudComputerId: varchar('cloud_computer_id', { length: 128 }),
    runtimeId: varchar('runtime_id', { length: 80 }).notNull(),
    runtimeLabel: varchar('runtime_label', { length: 120 }),
    workDir: text('work_dir'),
    status: varchar('status', { length: 32 }).default('configured').notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    agentComputerPlacementsAgentUniqueIdx: uniqueIndex(
      'agent_computer_placements_agent_unique_idx',
    ).on(t.agentId),
    agentComputerPlacementsUserIdx: index('agent_computer_placements_user_idx').on(t.userId),
    agentComputerPlacementsLocalIdx: index('agent_computer_placements_local_idx').on(
      t.localComputerId,
    ),
    agentComputerPlacementsCloudIdx: index('agent_computer_placements_cloud_idx').on(
      t.cloudComputerId,
    ),
    agentComputerPlacementsKindCheck: check(
      'agent_computer_placements_kind_check',
      sql`${t.computerKind} IN ('local', 'cloud')`,
    ),
    agentComputerPlacementsTargetCheck: check(
      'agent_computer_placements_target_check',
      sql`(${t.computerKind} = 'local' AND ${t.localComputerId} IS NOT NULL AND ${t.cloudComputerId} IS NULL) OR (${t.computerKind} = 'cloud' AND ${t.localComputerId} IS NULL AND ${t.cloudComputerId} IS NOT NULL)`,
    ),
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
