import {
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
import { servers } from './servers'
import { users } from './users'

export type ServerAppManifest = {
  schemaVersion: 'shadow.app/1'
  appKey: string
  name: string
  description?: string
  version?: string
  updatedAt?: string
  iconUrl?: string
  iframe?: {
    entry: string
    allowedOrigins: string[]
  }
  api: {
    baseUrl: string
    auth?: {
      type: 'oauth2-bearer'
    }
  }
  access?: {
    defaultPermissions?: string[]
    defaultApprovalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
  }
  commands: Array<{
    name: string
    title?: string
    description?: string
    help?: {
      summary?: string
      usage?: string
      details?: string
      examples?: Array<{
        title?: string
        command?: string
        input?: unknown
      }>
      schemaRef?: string
    }
    path: string
    method?: 'POST'
    input?: 'json' | 'multipart'
    inputSchema?: Record<string, unknown>
    permission: string
    action: 'read' | 'write' | 'manage' | 'delete' | 'generate'
    dataClass:
      | 'public'
      | 'server-private'
      | 'channel-private'
      | 'financial'
      | 'secret'
      | 'cloud-secret'
    approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
    binary?: {
      supported?: boolean
      field?: string
      maxBytes?: number
      contentTypes?: string[]
    }
  }>
  skills?: Array<{
    name: string
    description: string
    commandHints?: string[]
  }>
  events?: string[]
  help?: {
    overview?: string
    usage?: string
    details?: string
    commandIndex?: string
  }
  realtime?: {
    transports?: Array<'sse' | 'websocket'>
    subscribe?: {
      events?: string[]
      help?: string
    }
    publish?: {
      command?: string
      events?: string[]
      help?: string
    }
    stateSync?: {
      model?: 'snapshot-patch' | 'frame-sync' | 'lockstep'
      authority?: 'server' | 'client'
      tickRate?: number
      help?: string
    }
  }
  binary?: {
    supported: boolean
    maxBytes?: number
    contentTypes?: string[]
  }
}

export const serverAppIntegrations = pgTable(
  'server_app_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    appKey: varchar('app_key', { length: 80 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
    manifestUrl: text('manifest_url'),
    manifest: jsonb('manifest').$type<ServerAppManifest>().notNull(),
    manifestVersion: varchar('manifest_version', { length: 64 }),
    manifestUpdatedAt: timestamp('manifest_updated_at', { withTimezone: true }),
    manifestFetchedAt: timestamp('manifest_fetched_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    manifestHash: text('manifest_hash'),
    iframeEntry: text('iframe_entry'),
    allowedOrigins: jsonb('allowed_origins').$type<string[]>().notNull().default([]),
    apiBaseUrl: text('api_base_url').notNull(),
    defaultPermissions: jsonb('default_permissions').$type<string[]>().notNull().default([]),
    defaultApprovalMode: varchar('default_approval_mode', { length: 24 }).notNull().default('none'),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    installedByUserId: uuid('installed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    serverAppIntegrationsServerIdIdx: index('server_app_integrations_server_id_idx').on(t.serverId),
    serverAppIntegrationsAppKeyIdx: index('server_app_integrations_app_key_idx').on(t.appKey),
  }),
)

export const serverAppCatalogEntries = pgTable(
  'server_app_catalog_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appKey: varchar('app_key', { length: 80 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
    manifestUrl: text('manifest_url'),
    manifest: jsonb('manifest').$type<ServerAppManifest>().notNull(),
    status: varchar('status', { length: 24 }).notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    serverAppCatalogEntriesAppKeyUnique: uniqueIndex(
      'server_app_catalog_entries_app_key_unique',
    ).on(t.appKey),
    serverAppCatalogEntriesStatusIdx: index('server_app_catalog_entries_status_idx').on(t.status),
  }),
)

export const serverAppCommandTokens = pgTable(
  'server_app_command_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    serverAppId: uuid('server_app_id')
      .notNull()
      .references(() => serverAppIntegrations.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    appKey: varchar('app_key', { length: 80 }).notNull(),
    command: varchar('command', { length: 120 }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorKind: varchar('actor_kind', { length: 24 }).notNull(),
    buddyAgentId: uuid('buddy_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    channelId: uuid('channel_id'),
    taskMessageId: uuid('task_message_id'),
    taskCardId: uuid('task_card_id'),
    taskClaimId: uuid('task_claim_id'),
    taskWorkspaceId: text('task_workspace_id'),
    permission: text('permission').notNull(),
    action: varchar('action', { length: 24 }).notNull(),
    dataClass: varchar('data_class', { length: 32 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    serverAppCommandTokensHashUnique: uniqueIndex('server_app_command_tokens_hash_unique').on(
      t.tokenHash,
    ),
    serverAppCommandTokensAppExpiresIdx: index('server_app_command_tokens_app_expires_idx').on(
      t.serverAppId,
      t.expiresAt,
    ),
  }),
)

export const serverAppBuddyGrants = pgTable(
  'server_app_buddy_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverAppId: uuid('server_app_id')
      .notNull()
      .references(() => serverAppIntegrations.id, { onDelete: 'cascade' }),
    buddyAgentId: uuid('buddy_agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    resourceRules: jsonb('resource_rules').$type<Record<string, unknown>>().notNull().default({}),
    approvalMode: varchar('approval_mode', { length: 24 }).notNull().default('none'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    serverAppBuddyGrantsServerAppIdIdx: index('server_app_buddy_grants_server_app_id_idx').on(
      t.serverAppId,
    ),
    serverAppBuddyGrantsBuddyAgentIdIdx: index('server_app_buddy_grants_buddy_agent_id_idx').on(
      t.buddyAgentId,
    ),
  }),
)

export const serverAppCommandConsents = pgTable(
  'server_app_command_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverAppId: uuid('server_app_id')
      .notNull()
      .references(() => serverAppIntegrations.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    appKey: varchar('app_key', { length: 80 }).notNull(),
    command: varchar('command', { length: 120 }).notNull(),
    permission: text('permission').notNull(),
    subjectKind: varchar('subject_kind', { length: 24 }).notNull(),
    subjectKey: text('subject_key').notNull(),
    subjectUserId: uuid('subject_user_id').references(() => users.id, { onDelete: 'cascade' }),
    buddyAgentId: uuid('buddy_agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    approvalMode: varchar('approval_mode', { length: 24 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    serverAppCommandConsentsUnique: uniqueIndex('server_app_command_consents_subject_unique').on(
      t.serverAppId,
      t.command,
      t.subjectKind,
      t.subjectKey,
    ),
    serverAppCommandConsentsServerAppIdIdx: index(
      'server_app_command_consents_server_app_id_idx',
    ).on(t.serverAppId),
    serverAppCommandConsentsSubjectIdx: index('server_app_command_consents_subject_idx').on(
      t.subjectKind,
      t.subjectKey,
    ),
  }),
)
