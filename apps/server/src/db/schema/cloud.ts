import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

// ─── Enums ──────────────────────────────────────────────────────────────────

export const cloudDeploymentStatusEnum = pgEnum('cloud_deployment_status', [
  'pending',
  'deploying',
  'deployed',
  'failed',
  'destroying',
  'destroyed',
])

export const cloudTemplateSourceEnum = pgEnum('cloud_template_source', ['official', 'community'])

export const cloudTemplateReviewStatusEnum = pgEnum('cloud_template_review_status', [
  'pending',
  'approved',
  'rejected',
])

export const cloudActivityTypeEnum = pgEnum('cloud_activity_type', [
  'deploy',
  'destroy',
  'scale',
  'config_update',
  'cluster_add',
  'cluster_remove',
  'envvar_update',
  'template_submit',
])

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * Public + community template library
 */
export const cloudTemplates = pgTable(
  'cloud_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    source: cloudTemplateSourceEnum('source').default('official').notNull(),
    reviewStatus: cloudTemplateReviewStatusEnum('review_status').default('approved').notNull(),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    content: jsonb('content').notNull(),
    tags: jsonb('tags').$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudTemplatesSourceIdx: index('cloud_templates_source_idx').on(t.source),
    cloudTemplatesReviewStatusIdx: index('cloud_templates_review_status_idx').on(t.reviewStatus),
  }),
)

/**
 * K8s clusters (platform-shared or BYOK)
 */
export const cloudClusters = pgTable(
  'cloud_clusters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    /** KMS key reference for the encrypted kubeconfig */
    kubeconfigKmsRef: text('kubeconfig_kms_ref'),
    /** AES-GCM encrypted kubeconfig (when using local KMS fallback) */
    kubeconfigEncrypted: text('kubeconfig_encrypted'),
    isDefault: boolean('is_default').default(false).notNull(),
    isPlatform: boolean('is_platform').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudClustersUserIdIdx: index('cloud_clusters_user_id_idx').on(t.userId),
  }),
)

/**
 * Deployment records
 */
export const cloudDeployments = pgTable(
  'cloud_deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clusterId: uuid('cluster_id').references(() => cloudClusters.id, { onDelete: 'set null' }),
    namespace: varchar('namespace', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: cloudDeploymentStatusEnum('status').default('pending').notNull(),
    agentCount: integer('agent_count').default(0).notNull(),
    configSnapshot: jsonb('config_snapshot'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudDeploymentsUserIdIdx: index('cloud_deployments_user_id_idx').on(t.userId),
    cloudDeploymentsStatusIdx: index('cloud_deployments_status_idx').on(t.status),
  }),
)

/**
 * Streaming deploy logs
 */
export const cloudDeploymentLogs = pgTable(
  'cloud_deployment_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => cloudDeployments.id, { onDelete: 'cascade' }),
    level: varchar('level', { length: 16 }).default('info').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudDeploymentLogsDeploymentIdIdx: index('cloud_deployment_logs_deployment_id_idx').on(
      t.deploymentId,
    ),
  }),
)

/**
 * User config files (named shadow-cloud.json snapshots)
 */
export const cloudConfigs = pgTable(
  'cloud_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    content: jsonb('content').notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudConfigsUserIdIdx: index('cloud_configs_user_id_idx').on(t.userId),
  }),
)

/**
 * Env variable groups
 */
export const cloudEnvGroups = pgTable(
  'cloud_env_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudEnvGroupsUserIdIdx: index('cloud_env_groups_user_id_idx').on(t.userId),
  }),
)

/**
 * Encrypted env variables
 */
export const cloudEnvVars = pgTable(
  'cloud_env_vars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => cloudEnvGroups.id, { onDelete: 'set null' }),
    scope: varchar('scope', { length: 255 }).default('global').notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    /** AES-GCM encrypted value (base64) */
    encryptedValue: text('encrypted_value').notNull(),
    kmsKeyId: text('kms_key_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudEnvVarsUserIdIdx: index('cloud_env_vars_user_id_idx').on(t.userId),
    cloudEnvVarsUserIdScopeKeyIdx: index('cloud_env_vars_user_id_scope_key_idx').on(
      t.userId,
      t.scope,
      t.key,
    ),
  }),
)

/**
 * Audit activity log
 */
export const cloudActivities = pgTable(
  'cloud_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: cloudActivityTypeEnum('type').notNull(),
    namespace: varchar('namespace', { length: 255 }),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudActivitiesUserIdIdx: index('cloud_activities_user_id_idx').on(t.userId),
    cloudActivitiesCreatedAtIdx: index('cloud_activities_created_at_idx').on(t.createdAt),
  }),
)
