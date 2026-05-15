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
  iconUrl?: string
  iframe?: {
    entry: string
    allowedOrigins: string[]
  }
  api: {
    baseUrl: string
    auth?: {
      type: 'oauth2-bearer' | 'hmac-sha256' | 'none'
    }
  }
  commands: Array<{
    name: string
    title?: string
    description?: string
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
    iframeEntry: text('iframe_entry'),
    allowedOrigins: jsonb('allowed_origins').$type<string[]>().notNull().default([]),
    apiBaseUrl: text('api_base_url').notNull(),
    sharedSecretEncrypted: text('shared_secret_encrypted'),
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
    sharedSecretEncrypted: text('shared_secret_encrypted'),
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
