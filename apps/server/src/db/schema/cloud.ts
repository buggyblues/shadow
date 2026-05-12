import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { agents } from './agents'
import { users } from './users'

// ─── Enums ──────────────────────────────────────────────────────────────────

export const cloudDeploymentStatusEnum = pgEnum('cloud_deployment_status', [
  'pending',
  'deploying',
  'deployed',
  'paused',
  'resuming',
  'failed',
  'destroying',
  'destroyed',
  'cancelling',
])

export const cloudTemplateSourceEnum = pgEnum('cloud_template_source', ['official', 'community'])

export const cloudTemplateReviewStatusEnum = pgEnum('cloud_template_review_status', [
  'draft',
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
  'template_update',
  'template_delete',
  'template_approved',
  'template_rejected',
  'billing_deduct',
  'diy_generate',
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
    reviewNote: text('review_note'),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    content: jsonb('content').notNull(),
    tags: jsonb('tags').$type<string[]>().default([]),
    // SaaS fields
    category: varchar('category', { length: 64 }),
    deployCount: integer('deploy_count').default(0).notNull(),
    rating: integer('rating'),
    baseCost: integer('base_cost'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudTemplatesSourceIdx: index('cloud_templates_source_idx').on(t.source),
    cloudTemplatesReviewStatusIdx: index('cloud_templates_review_status_idx').on(t.reviewStatus),
    cloudTemplatesCategoryIdx: index('cloud_templates_category_idx').on(t.category),
    cloudTemplatesAuthorIdIdx: index('cloud_templates_author_id_idx').on(t.authorId),
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
    // SaaS fields
    templateSlug: varchar('template_slug', { length: 255 }),
    resourceTier: varchar('resource_tier', { length: 32 }),
    monthlyCost: integer('monthly_cost'),
    hourlyCost: integer('hourly_cost').default(1).notNull(),
    lastHourlyBilledAt: timestamp('last_hourly_billed_at', { withTimezone: true }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    saasMode: boolean('saas_mode').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudDeploymentsUserIdIdx: index('cloud_deployments_user_id_idx').on(t.userId),
    cloudDeploymentsStatusIdx: index('cloud_deployments_status_idx').on(t.status),
    cloudDeploymentsSaasModeIdx: index('cloud_deployments_saas_mode_idx').on(t.saasMode),
  }),
)

/**
 * Persistent state backup records for agent-sandbox deployments.
 *
 * The control plane records requested backups here. The backing artifact may
 * be a CSI VolumeSnapshot or an object-store artifact created by restic/kopia.
 */
export const cloudDeploymentBackups = pgTable(
  'cloud_deployment_backups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => cloudDeployments.id, { onDelete: 'cascade' }),
    namespace: varchar('namespace', { length: 255 }).notNull(),
    agentId: varchar('agent_id', { length: 255 }).notNull(),
    sandboxName: varchar('sandbox_name', { length: 255 }),
    pvcName: varchar('pvc_name', { length: 255 }).notNull(),
    driver: varchar('driver', { length: 32 }).default('volumeSnapshot').notNull(),
    snapshotName: varchar('snapshot_name', { length: 255 }),
    objectKey: text('object_key'),
    status: varchar('status', { length: 32 }).default('pending').notNull(),
    phase: varchar('phase', { length: 64 }).default('queued').notNull(),
    error: text('error'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudDeploymentBackupsDeploymentIdIdx: index('cloud_deployment_backups_deployment_id_idx').on(
      t.deploymentId,
    ),
    cloudDeploymentBackupsUserIdIdx: index('cloud_deployment_backups_user_id_idx').on(t.userId),
    cloudDeploymentBackupsAgentIdx: index('cloud_deployment_backups_agent_idx').on(
      t.namespace,
      t.agentId,
      t.createdAt,
    ),
  }),
)

/**
 * Latest usage snapshot reported by a running Shadow Buddy.
 *
 * The Cloud SaaS dashboard reads this table only; it must not exec into
 * OpenClaw pods to compute costs on demand.
 */
export const cloudAgentUsageSnapshots = pgTable(
  'cloud_agent_usage_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentUserId: uuid('agent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 64 }).default('openclaw-trajectory').notNull(),
    model: varchar('model', { length: 255 }),
    totalUsd: doublePrecision('total_usd'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    totalTokens: integer('total_tokens'),
    providers: jsonb('providers')
      .$type<
        Array<{
          provider: string
          amountUsd: number | null
          usageLabel: string | null
          raw: string | null
          inputTokens: number | null
          outputTokens: number | null
          totalTokens: number | null
        }>
      >()
      .default([]),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudAgentUsageSnapshotsAgentIdUniqueIdx: uniqueIndex(
      'cloud_agent_usage_snapshots_agent_id_unique_idx',
    ).on(t.agentId),
    cloudAgentUsageSnapshotsOwnerIdIdx: index('cloud_agent_usage_snapshots_owner_id_idx').on(
      t.ownerId,
    ),
    cloudAgentUsageSnapshotsUpdatedAtIdx: index('cloud_agent_usage_snapshots_updated_at_idx').on(
      t.updatedAt,
    ),
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
