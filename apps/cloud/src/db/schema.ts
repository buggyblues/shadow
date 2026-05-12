/**
 * Database Schema — all tables for the cloud console.
 */

import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ── Secrets (encrypted provider keys) ────────────────────────────────────────

export const secrets = sqliteTable('secrets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  providerId: text('provider_id').notNull(),
  key: text('key').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  groupName: text('group_name').notNull().default('default'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── Configs ──────────────────────────────────────────────────────────────────

export const configs = sqliteTable('configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  content: text('content', { mode: 'json' }).notNull(),
  templateSlug: text('template_slug'),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── Deployments (state tracking) ─────────────────────────────────────────────

export const deployments = sqliteTable('deployments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  namespace: text('namespace').notNull(),
  templateSlug: text('template_slug'),
  version: integer('version'),
  status: text('status').notNull().default('pending'),
  config: text('config', { mode: 'json' }),
  agentCount: integer('agent_count'),
  error: text('error'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const deploymentLogs = sqliteTable('deployment_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deploymentId: integer('deployment_id')
    .notNull()
    .references(() => deployments.id, { onDelete: 'cascade' }),
  event: text('event').notNull().default('log'),
  message: text('message').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const deploymentBackups = sqliteTable('deployment_backups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deploymentId: integer('deployment_id').references(() => deployments.id, { onDelete: 'cascade' }),
  namespace: text('namespace').notNull(),
  agentId: text('agent_id').notNull(),
  sandboxName: text('sandbox_name'),
  pvcName: text('pvc_name').notNull(),
  driver: text('driver').notNull(),
  snapshotName: text('snapshot_name'),
  objectKey: text('object_key'),
  status: text('status').notNull().default('pending'),
  error: text('error'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── Activity Log ─────────────────────────────────────────────────────────────

export const activities = sqliteTable('activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  namespace: text('namespace'),
  template: text('template'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Environment Variables ────────────────────────────────────────────────────

export const envVars = sqliteTable('env_vars', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scope: text('scope').notNull().default('global'),
  key: text('key').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  iv: text('iv').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).default(true),
  groupName: text('group_name').notNull().default('default'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const envGroups = sqliteTable('env_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ── Config Version History (My Templates) ────────────────────────────────────

export const configVersions = sqliteTable('config_versions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  configName: text('config_name').notNull(),
  version: integer('version').notNull(),
  content: text('content', { mode: 'json' }).notNull(),
  message: text('message'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ── Schema type helpers ──────────────────────────────────────────────────────

export type Secret = typeof secrets.$inferSelect
export type NewSecret = typeof secrets.$inferInsert
export type Config = typeof configs.$inferSelect
export type NewConfig = typeof configs.$inferInsert
export type Deployment = typeof deployments.$inferSelect
export type NewDeployment = typeof deployments.$inferInsert
export type DeploymentLog = typeof deploymentLogs.$inferSelect
export type NewDeploymentLog = typeof deploymentLogs.$inferInsert
export type DeploymentBackup = typeof deploymentBackups.$inferSelect
export type NewDeploymentBackup = typeof deploymentBackups.$inferInsert
export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
export type EnvVar = typeof envVars.$inferSelect
export type NewEnvVar = typeof envVars.$inferInsert
export type EnvGroup = typeof envGroups.$inferSelect
export type NewEnvGroup = typeof envGroups.$inferInsert
export type ConfigVersion = typeof configVersions.$inferSelect
export type NewConfigVersion = typeof configVersions.$inferInsert
