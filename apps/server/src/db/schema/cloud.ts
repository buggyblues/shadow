import { sql } from 'drizzle-orm'
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
import { serverAppIntegrations } from './app-integrations'
import { servers } from './servers'
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

export type CloudTemplateGithubSource = {
  repository: string
  branch?: string
  path?: string
  installationId?: string
  webhook?: {
    enabled?: boolean
    autoUpdateTemplate?: boolean
    autoDeploy?: boolean
  }
  protectedOverrides?: string[]
  lastCommitSha?: string
}

export type CloudGitConnectionScopes = {
  raw?: string
  scopes?: string[]
}

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
    githubSource: jsonb('github_source').$type<CloudTemplateGithubSource | null>(),
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
 * User-owned Git provider connections for Cloud template import and state backups.
 *
 * Credentials are encrypted at rest and decrypted only for short-lived GitHub
 * API/git operations. This is intentionally separate from login OAuth accounts,
 * which do not carry repository scopes.
 */
export const cloudGitConnections = pgTable(
  'cloud_git_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).default('github').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    accountLogin: varchar('account_login', { length: 255 }).notNull(),
    accountName: varchar('account_name', { length: 255 }),
    tokenEncrypted: text('token_encrypted').notNull(),
    scopes: jsonb('scopes').$type<CloudGitConnectionScopes | null>(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudGitConnectionsUserIdIdx: index('cloud_git_connections_user_id_idx').on(t.userId),
    cloudGitConnectionsProviderIdx: index('cloud_git_connections_provider_idx').on(t.provider),
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
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    saasMode: boolean('saas_mode').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudDeploymentsUserIdIdx: index('cloud_deployments_user_id_idx').on(t.userId),
    cloudDeploymentsStatusIdx: index('cloud_deployments_status_idx').on(t.status),
    cloudDeploymentsSaasModeIdx: index('cloud_deployments_saas_mode_idx').on(t.saasMode),
    cloudDeploymentsExpiresAtIdx: index('cloud_deployments_expires_at_idx').on(t.expiresAt),
    cloudDeploymentsPlatformNamespaceUnique: uniqueIndex(
      'cloud_deployments_platform_namespace_unique',
    )
      .on(t.namespace)
      .where(
        sql`${t.clusterId} IS NULL AND ${t.saasMode} = false AND ${t.status} <> 'failed' AND ${t.status} <> 'destroyed'`,
      ),
    cloudDeploymentsClusterNamespaceUnique: uniqueIndex(
      'cloud_deployments_cluster_namespace_unique',
    )
      .on(t.clusterId, t.namespace)
      .where(
        sql`${t.clusterId} IS NOT NULL AND ${t.saasMode} = false AND ${t.status} <> 'failed' AND ${t.status} <> 'destroyed'`,
      ),
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

export type CloudExposureAuthMode = 'shadow_session' | 'signed_link' | 'server_app' | 'none'

export type CloudExposurePolicy = {
  rateLimit?: {
    requestsPerMinute?: number
    burst?: number
  }
  bodyLimitBytes?: number
  allowedMethods?: string[]
  allowIframe?: boolean
}

export type CloudExposureHealth = {
  path?: string
  status?: 'unknown' | 'healthy' | 'degraded' | 'unhealthy'
  checkedAt?: string
  message?: string
}

/**
 * Shadow-controlled HTTPS exposure registry for services running inside Cloud
 * agent containers. Runtime source exposures are short-lived; installed App
 * releases bind stable hosts through cloud_app_releases/current_exposure_id.
 */
export const cloudExposures = pgTable(
  'cloud_exposures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => cloudDeployments.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
    appInstanceId: uuid('app_instance_id'),
    appReleaseId: uuid('app_release_id'),
    agentId: varchar('agent_id', { length: 255 }).notNull(),
    localId: varchar('local_id', { length: 64 }).notNull(),
    source: varchar('source', { length: 32 }).default('runtime').notNull(),
    exposureKind: varchar('exposure_kind', { length: 32 }).default('http_service').notNull(),
    releaseMode: varchar('release_mode', { length: 32 }).default('preview').notNull(),
    visibility: varchar('visibility', { length: 32 }).default('private').notNull(),
    authMode: varchar('auth_mode', { length: 32 }).default('shadow_session').notNull(),
    status: varchar('status', { length: 32 }).default('active').notNull(),
    host: varchar('host', { length: 255 }).notNull(),
    stableHost: varchar('stable_host', { length: 255 }),
    publicBaseUrl: text('public_base_url').notNull(),
    manifestUrl: text('manifest_url'),
    targetNamespace: varchar('target_namespace', { length: 255 }).notNull(),
    targetWorkload: varchar('target_workload', { length: 255 }),
    targetServiceName: varchar('target_service_name', { length: 255 }),
    targetPort: integer('target_port').notNull(),
    health: jsonb('health').$type<CloudExposureHealth | null>(),
    policy: jsonb('policy').$type<CloudExposurePolicy>().default({}).notNull(),
    dynamicConfig: jsonb('dynamic_config').$type<Record<string, unknown>>().default({}).notNull(),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closeReason: text('close_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudExposuresDeploymentAgentLocalUniqueIdx: uniqueIndex(
      'cloud_exposures_deployment_agent_local_unique_idx',
    ).on(t.deploymentId, t.agentId, t.localId),
    cloudExposuresHostUniqueIdx: uniqueIndex('cloud_exposures_host_unique_idx').on(t.host),
    cloudExposuresStableHostUniqueIdx: uniqueIndex('cloud_exposures_stable_host_unique_idx').on(
      t.stableHost,
    ),
    cloudExposuresDeploymentIdx: index('cloud_exposures_deployment_idx').on(t.deploymentId),
    cloudExposuresServerIdx: index('cloud_exposures_server_idx').on(t.serverId),
    cloudExposuresStatusIdx: index('cloud_exposures_status_idx').on(t.status),
    cloudExposuresLeaseExpiresAtIdx: index('cloud_exposures_lease_expires_at_idx').on(
      t.leaseExpiresAt,
    ),
  }),
)

/**
 * Compact audit trail for exposure lifecycle events. Request logs should use
 * separate bounded telemetry and never persist query strings or request bodies.
 */
export const cloudExposureEvents = pgTable(
  'cloud_exposure_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exposureId: uuid('exposure_id')
      .notNull()
      .references(() => cloudExposures.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    deploymentId: uuid('deployment_id').references(() => cloudDeployments.id, {
      onDelete: 'set null',
    }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    actorKind: varchar('actor_kind', { length: 32 }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorAgentId: uuid('actor_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 32 }),
    message: text('message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudExposureEventsExposureIdx: index('cloud_exposure_events_exposure_idx').on(t.exposureId),
    cloudExposureEventsDeploymentIdx: index('cloud_exposure_events_deployment_idx').on(
      t.deploymentId,
    ),
    cloudExposureEventsCreatedAtIdx: index('cloud_exposure_events_created_at_idx').on(t.createdAt),
  }),
)

export type CloudAppStatePolicy = {
  paths: string[]
  backupOnPublish?: boolean
  restoreStrategy?: 'in_place' | 'new_release'
}

export const cloudAppInstances = pgTable(
  'cloud_app_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => cloudDeployments.id, { onDelete: 'cascade' }),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    serverAppIntegrationId: uuid('server_app_integration_id').references(
      () => serverAppIntegrations.id,
      { onDelete: 'set null' },
    ),
    agentId: varchar('agent_id', { length: 255 }).notNull(),
    appKey: varchar('app_key', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    stableHost: varchar('stable_host', { length: 255 }).notNull(),
    stableBaseUrl: text('stable_base_url').notNull(),
    manifestUrl: text('manifest_url').notNull(),
    status: varchar('status', { length: 32 }).default('active').notNull(),
    currentReleaseId: uuid('current_release_id'),
    currentExposureId: uuid('current_exposure_id'),
    sourcePath: text('source_path'),
    statePolicy: jsonb('state_policy')
      .$type<CloudAppStatePolicy>()
      .default({ paths: [] })
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudAppInstancesScopeUniqueIdx: uniqueIndex('cloud_app_instances_scope_unique_idx').on(
      t.deploymentId,
      t.agentId,
      t.serverId,
      t.appKey,
    ),
    cloudAppInstancesStableHostUniqueIdx: uniqueIndex(
      'cloud_app_instances_stable_host_unique_idx',
    ).on(t.stableHost),
    cloudAppInstancesServerIdx: index('cloud_app_instances_server_idx').on(t.serverId),
    cloudAppInstancesStatusIdx: index('cloud_app_instances_status_idx').on(t.status),
  }),
)

export const cloudAppReleases = pgTable(
  'cloud_app_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appInstanceId: uuid('app_instance_id')
      .notNull()
      .references(() => cloudAppInstances.id, { onDelete: 'cascade' }),
    exposureId: uuid('exposure_id').references(() => cloudExposures.id, { onDelete: 'set null' }),
    serverAppIntegrationId: uuid('server_app_integration_id').references(
      () => serverAppIntegrations.id,
      { onDelete: 'set null' },
    ),
    version: varchar('version', { length: 128 }).notNull(),
    codeSha: varchar('code_sha', { length: 128 }).notNull(),
    releaseMode: varchar('release_mode', { length: 32 }).default('installed').notNull(),
    status: varchar('status', { length: 32 }).default('active').notNull(),
    manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
    manifestUrl: text('manifest_url').notNull(),
    sourcePath: text('source_path'),
    artifactRef: text('artifact_ref'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudAppReleasesInstanceIdx: index('cloud_app_releases_instance_idx').on(t.appInstanceId),
    cloudAppReleasesCodeShaIdx: index('cloud_app_releases_code_sha_idx').on(t.codeSha),
  }),
)

export type CloudBackupPolicyConfig = {
  statePaths: string[]
  schedule?: string
  retain?: number
  backupOnPublish?: boolean
  driver?: 'metadata' | 'volumeSnapshot' | 'restic' | 'git'
}

export const cloudBackupPolicies = pgTable(
  'cloud_backup_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appInstanceId: uuid('app_instance_id')
      .notNull()
      .references(() => cloudAppInstances.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).default('active').notNull(),
    driver: varchar('driver', { length: 32 }).default('metadata').notNull(),
    config: jsonb('config').$type<CloudBackupPolicyConfig>().default({ statePaths: [] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudBackupPoliciesInstanceIdx: index('cloud_backup_policies_instance_idx').on(t.appInstanceId),
  }),
)

export const cloudBackupSets = pgTable(
  'cloud_backup_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appInstanceId: uuid('app_instance_id')
      .notNull()
      .references(() => cloudAppInstances.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').references(() => cloudAppReleases.id, { onDelete: 'set null' }),
    trigger: varchar('trigger', { length: 32 }).default('manual').notNull(),
    status: varchar('status', { length: 32 }).default('pending').notNull(),
    manifestSnapshot: jsonb('manifest_snapshot').$type<Record<string, unknown> | null>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudBackupSetsInstanceIdx: index('cloud_backup_sets_instance_idx').on(t.appInstanceId),
    cloudBackupSetsCreatedAtIdx: index('cloud_backup_sets_created_at_idx').on(t.createdAt),
  }),
)

export const cloudBackupComponents = pgTable(
  'cloud_backup_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    backupSetId: uuid('backup_set_id')
      .notNull()
      .references(() => cloudBackupSets.id, { onDelete: 'cascade' }),
    componentKind: varchar('component_kind', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).default('succeeded').notNull(),
    refKind: varchar('ref_kind', { length: 32 }),
    refId: uuid('ref_id'),
    objectKey: text('object_key'),
    path: text('path'),
    checksum: varchar('checksum', { length: 128 }),
    sizeBytes: integer('size_bytes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudBackupComponentsSetIdx: index('cloud_backup_components_set_idx').on(t.backupSetId),
  }),
)

export const cloudRestoreJobs = pgTable(
  'cloud_restore_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appInstanceId: uuid('app_instance_id')
      .notNull()
      .references(() => cloudAppInstances.id, { onDelete: 'cascade' }),
    backupSetId: uuid('backup_set_id')
      .notNull()
      .references(() => cloudBackupSets.id, { onDelete: 'restrict' }),
    safetyBackupSetId: uuid('safety_backup_set_id').references(() => cloudBackupSets.id, {
      onDelete: 'set null',
    }),
    strategy: varchar('strategy', { length: 32 }).default('in_place').notNull(),
    status: varchar('status', { length: 32 }).default('pending').notNull(),
    phase: varchar('phase', { length: 64 }).default('queued').notNull(),
    error: text('error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cloudRestoreJobsInstanceIdx: index('cloud_restore_jobs_instance_idx').on(t.appInstanceId),
    cloudRestoreJobsBackupSetIdx: index('cloud_restore_jobs_backup_set_idx').on(t.backupSetId),
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
