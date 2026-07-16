import { execFile } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { zValidator } from '@hono/zod-validator'
import {
  applyKubernetesManifestAsync,
  applyRuntimeEnvRefPolicy,
  attachCloudSaasProvisionState,
  CLOUD_SAAS_RUNTIME_KEY,
  collectRuntimeEnvFields,
  collectRuntimeEnvRefPolicy,
  collectRuntimeEnvRequirements,
  createVolumeSnapshotBackupAsync,
  deleteKubernetesResourceAsync,
  extractCloudSaasRuntime,
  extractRequiredEnvVars,
  getPvcVolumeSnapshotCapability,
  isVolumeSnapshotApiAvailable,
  listProviderCatalogs,
  loadCloudConfigSchema,
  prepareCloudSaasConfigSnapshot,
  sanitizeCloudSaasDeployment,
  scaleAgentSandboxAsync,
  summarizeCloudConfigValidation,
  validateCloudSaasConfigSnapshot,
  waitForAgentSandboxPaused,
  waitForAgentSandboxReady,
  waitForPodReadyAsync,
  waitForVolumeSnapshotReady,
} from '@shadowob/cloud'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import type { AppContainer } from '../container'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudDeploymentBackupDao } from '../dao/cloud-deployment-backup.dao'
import { cloudDeployments, cloudTemplates } from '../db/schema'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { CLOUD_COMPUTER_MANUAL_PAUSE_REASON } from '../lib/cloud-computer-billing'
import {
  requestCloudDeploymentCancellation,
  requestCloudDeploymentDestroyInterruption,
} from '../lib/cloud-deployment-processor'
import { attachCloudProvisionedBuddies } from '../lib/cloud-provisioned-buddies'
import {
  listEphemeralRuntimeStateTargets,
  type RuntimeStateTarget,
  resolveRuntimeStateTarget,
} from '../lib/cloud-runtime-state'
import {
  applySafeDeploymentPreferences,
  type CloudStoreModelProviderMode,
  readCloudStoreModelProviderMode,
} from '../lib/cloud-saas-deployment-preferences'
import { extractShadowProvisionTarget } from '../lib/cloud-shadow-target'
import { materializeTemplateI18nPlaceholders } from '../lib/cloud-template-i18n'
import { validateJsonLimits } from '../lib/json-limits'
import { decrypt, encrypt } from '../lib/kms'
import {
  assertOfficialModelProxyAvailable,
  officialModelProxyEnvVars,
  officialModelProxyMissingConfig,
  resolveOfficialModelProxyRuntimeServerUrl,
  shouldCopyServerRuntimeEnvKey,
} from '../lib/model-proxy-config'
import { assertSafeHttpUrl } from '../lib/ssrf'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  areRateLimitsDisabled,
  createRateLimitMiddleware,
} from '../middleware/rate-limit.middleware'
import type { Actor } from '../security/actor'
import { createActorContext } from '../security/actor-context'
import { assertCloudTemplatePolicy } from '../services/cloud-template-policy.service'
import {
  DIY_CLOUD_MAX_ESTIMATED_TOKENS,
  estimateDiyCloudInputBudget,
  listDiyCloudPlugins,
  listDiyCloudTemplates,
  searchDiyCloudPlugins,
} from '../services/diy-cloud.service'
import {
  type LlmProviderApiFormat,
  normalizeLlmProviderConfig,
  normalizeLlmProviderModels,
  parseDiscoveredModelsFromResponse,
} from '../services/llm-provider-platform'
import type { CloudSaasUseCase } from '../usecases/cloud-saas.usecase'

const execFileAsync = promisify(execFile)

const OFFICIAL_MODEL_PROXY_ENV_KEYS = new Set([
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OPENAI_COMPATIBLE_MODEL_ID',
])

const RESERVED_RUNTIME_ENV_KEYS = new Set([
  'SHADOWOB_AGENT_ID',
  'SHADOWOB_AGENT_SERVER_URL',
  'SHADOWOB_TOKEN',
  'SHADOWOB_SERVER_URL',
  'SHADOWOB_WORKSPACE',
  'SHADOWOB_RUNTIME',
  'SHADOWOB_PROVISION_URL',
  'SHADOWOB_USER_TOKEN',
  'SHARED_WORKSPACE_PATH',
  'SKILLS_DIR',
  'NODE_ENV',
  'HOSTNAME',
  ...OFFICIAL_MODEL_PROXY_ENV_KEYS,
])

const DEFAULT_DIY_CLOUD_DAILY_LIMIT = 24
const DEPLOYMENT_MANIFEST_SCHEMA_VERSION = 1

function isReservedRuntimeEnvKey(name: string): boolean {
  return RESERVED_RUNTIME_ENV_KEYS.has(name)
}

async function diyCloudDailyLimit() {
  if (await areRateLimitsDisabled()) return null
  const limit = Number.parseInt(process.env.SHADOWOB_DIY_CLOUD_DAILY_LIMIT ?? '', 10)
  if (limit === 0) return null
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_DIY_CLOUD_DAILY_LIMIT
}

function validateTemplateContentForWrite(content: Record<string, unknown>) {
  const limits = validateJsonLimits(content, {
    maxBytes: 256 * 1024,
    maxDepth: 12,
    maxObjectKeys: 1200,
    maxArrayItems: 400,
  })
  if (!limits.ok) {
    throw Object.assign(new Error(limits.error), { status: 413 })
  }
  const snapshot = validateCloudSaasConfigSnapshot(content)
  assertCloudTemplatePolicy(snapshot)
  return snapshot
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function deploymentAgentCountFromSnapshot(configSnapshot: Record<string, unknown>) {
  const deployments = isRecord(configSnapshot.deployments) ? configSnapshot.deployments : null
  const agents = deployments?.agents
  return Array.isArray(agents) ? agents.length : 0
}

function runtimeContextLocale(context?: { locale?: string } | null) {
  return typeof context?.locale === 'string' ? context.locale : null
}

function isRawI18nPlaceholder(value: string) {
  return /^\$\{i18n:[A-Za-z0-9_.-]+}$/.test(value.trim())
}

function manifestTemplateName(
  template: CloudTemplateRecord | null | undefined,
  cleanConfig: Record<string, unknown>,
  previous?: DeploymentManifestMetadata | null,
) {
  const templateName =
    typeof template?.name === 'string' && !isRawI18nPlaceholder(template.name)
      ? template.name
      : null
  const snapshotTitle =
    typeof cleanConfig.title === 'string' && !isRawI18nPlaceholder(cleanConfig.title)
      ? cleanConfig.title
      : null
  const previousName =
    typeof previous?.templateName === 'string' && !isRawI18nPlaceholder(previous.templateName)
      ? previous.templateName
      : null
  return templateName ?? snapshotTitle ?? previousName
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(stableJsonStringify(value)).digest('hex')
}

function shortHash(value: unknown): string {
  return sha256Hex(value).slice(0, 16)
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return null
}

type DeploymentManifestMetadata = {
  schemaVersion: number
  revision: number
  manifestId: string
  source: 'create' | 'snapshot-redeploy' | 'template-redeploy' | 'template-sync'
  generatedAt: string
  configHash: string
  manifestHash: string
  templateSlug: string | null
  templateId: string | null
  templateName: string | null
  templateSource: string | null
  templateReviewStatus: string | null
  templateUpdatedAt: string | null
  templateContentHash: string | null
}

function deploymentRuntimeRecord(configSnapshot: unknown): Record<string, unknown> | null {
  if (!isRecord(configSnapshot)) return null
  const runtime = configSnapshot[CLOUD_SAAS_RUNTIME_KEY]
  return isRecord(runtime) ? runtime : null
}

function readDeploymentManifestMetadata(
  configSnapshot: unknown,
): DeploymentManifestMetadata | null {
  const manifest = deploymentRuntimeRecord(configSnapshot)?.manifest
  if (!isRecord(manifest)) return null
  if (manifest.schemaVersion !== DEPLOYMENT_MANIFEST_SCHEMA_VERSION) return null
  if (typeof manifest.revision !== 'number' || !Number.isFinite(manifest.revision)) return null
  if (typeof manifest.manifestId !== 'string') return null
  if (typeof manifest.configHash !== 'string') return null
  if (typeof manifest.manifestHash !== 'string') return null
  return {
    schemaVersion: DEPLOYMENT_MANIFEST_SCHEMA_VERSION,
    revision: manifest.revision,
    manifestId: manifest.manifestId,
    source:
      manifest.source === 'snapshot-redeploy' ||
      manifest.source === 'template-redeploy' ||
      manifest.source === 'template-sync'
        ? manifest.source
        : 'create',
    generatedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : '',
    configHash: manifest.configHash,
    manifestHash: manifest.manifestHash,
    templateSlug: typeof manifest.templateSlug === 'string' ? manifest.templateSlug : null,
    templateId: typeof manifest.templateId === 'string' ? manifest.templateId : null,
    templateName: typeof manifest.templateName === 'string' ? manifest.templateName : null,
    templateSource: typeof manifest.templateSource === 'string' ? manifest.templateSource : null,
    templateReviewStatus:
      typeof manifest.templateReviewStatus === 'string' ? manifest.templateReviewStatus : null,
    templateUpdatedAt:
      typeof manifest.templateUpdatedAt === 'string' ? manifest.templateUpdatedAt : null,
    templateContentHash:
      typeof manifest.templateContentHash === 'string' ? manifest.templateContentHash : null,
  }
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function inferTemplateSlugFromConfigSnapshot(configSnapshot: unknown): string | null {
  const manifest = readDeploymentManifestMetadata(configSnapshot)
  if (manifest?.templateSlug) return manifest.templateSlug

  const runtime = extractCloudSaasRuntime(configSnapshot)
  const snapshot = runtime.configSnapshot ?? (isRecord(configSnapshot) ? configSnapshot : null)
  if (!snapshot) return null

  const metadata = isRecord(snapshot.metadata) ? snapshot.metadata : null
  const direct =
    readNonEmptyString(snapshot, 'templateSlug') ??
    readNonEmptyString(snapshot, 'template') ??
    readNonEmptyString(metadata ?? {}, 'templateSlug') ??
    readNonEmptyString(metadata ?? {}, 'template') ??
    readNonEmptyString(metadata ?? {}, 'sourceTemplateSlug')
  if (direct) return direct

  // The CloudConfig schema treats `name` as the stable config/template slug.
  // Older deployments created before manifest metadata used this field as the
  // only durable link back to the catalog template.
  return readNonEmptyString(snapshot, 'name')
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function deploymentTemplateSlugCandidates(deployment: {
  namespace: string
  name: string
  templateSlug?: string | null
  configSnapshot?: unknown
}): string[] {
  return uniqueNonEmptyStrings([
    deployment.templateSlug,
    inferTemplateSlugFromConfigSnapshot(deployment.configSnapshot),
    deployment.name,
    deployment.namespace,
  ])
}

function configSnapshotWithoutRuntime(configSnapshot: Record<string, unknown>) {
  const snapshot = { ...configSnapshot }
  delete snapshot[CLOUD_SAAS_RUNTIME_KEY]
  return snapshot
}

function attachDeploymentManifestMetadata(
  configSnapshot: unknown,
  options: {
    template?: CloudTemplateRecord | null
    source: DeploymentManifestMetadata['source']
    previous?: DeploymentManifestMetadata | null
  },
): Record<string, unknown> {
  const validated = validateCloudSaasConfigSnapshot(configSnapshot)
  const runtime = deploymentRuntimeRecord(validated)
  const cleanConfig = configSnapshotWithoutRuntime(validated)
  const configHash = shortHash(cleanConfig)
  const templateContentHash = options.template ? shortHash(options.template.content) : null
  const revision = Math.max(1, (options.previous?.revision ?? 0) + 1)
  const generatedAt = new Date().toISOString()
  const manifestPayload = {
    schemaVersion: DEPLOYMENT_MANIFEST_SCHEMA_VERSION,
    revision,
    source: options.source,
    generatedAt,
    configHash,
    templateSlug: options.template?.slug ?? options.previous?.templateSlug ?? null,
    templateId: options.template?.id ?? options.previous?.templateId ?? null,
    templateName: manifestTemplateName(options.template, cleanConfig, options.previous),
    templateSource: options.template?.source ?? options.previous?.templateSource ?? null,
    templateReviewStatus:
      options.template?.reviewStatus ?? options.previous?.templateReviewStatus ?? null,
    templateUpdatedAt: options.template
      ? toIsoString(options.template.updatedAt)
      : (options.previous?.templateUpdatedAt ?? null),
    templateContentHash: templateContentHash ?? options.previous?.templateContentHash ?? null,
  }
  const manifestHash = shortHash(manifestPayload)
  const manifest: DeploymentManifestMetadata = {
    ...manifestPayload,
    manifestId: `manifest-${manifestHash}`,
    manifestHash,
  }

  return {
    ...validated,
    [CLOUD_SAAS_RUNTIME_KEY]: {
      ...(runtime ?? {}),
      manifest,
    },
  }
}

function buildTemplateView(template: CloudTemplateRecord | null, userId: string) {
  if (!template) return null
  const ownedByUser = isTemplateOwnedByUser(template, userId)
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description,
    source: template.source,
    reviewStatus: template.reviewStatus,
    updatedAt: toIsoString(template.updatedAt),
    githubSource: template.githubSource ?? null,
    ownedByUser,
    editable:
      ownedByUser &&
      template.source === 'community' &&
      template.reviewStatus !== 'approved' &&
      template.reviewStatus !== 'pending',
    contentHash: shortHash(template.content),
  }
}

function buildDeploymentManifestResponse(options: {
  deployment: {
    id: string
    namespace: string
    name: string
    templateSlug?: string | null
    configSnapshot?: unknown
  }
  template: CloudTemplateRecord | null
  userId: string
}) {
  const manifest = readDeploymentManifestMetadata(options.deployment.configSnapshot)
  const linkedTemplateSlug =
    options.deployment.templateSlug ??
    manifest?.templateSlug ??
    inferTemplateSlugFromConfigSnapshot(options.deployment.configSnapshot)
  const templateView = buildTemplateView(options.template, options.userId)
  const currentTemplateHash = templateView?.contentHash ?? null
  const deployedTemplateHash = manifest?.templateContentHash ?? null
  const templateChanged = Boolean(
    currentTemplateHash && deployedTemplateHash && currentTemplateHash !== deployedTemplateHash,
  )
  const templateAvailable = Boolean(options.template)
  const driftStatus = !linkedTemplateSlug
    ? 'unlinked'
    : !manifest
      ? 'unknown'
      : !templateAvailable
        ? 'missing-template'
        : templateChanged
          ? 'template-updated'
          : 'up-to-date'

  return {
    deploymentId: options.deployment.id,
    namespace: options.deployment.namespace,
    name: options.deployment.name,
    templateSlug: linkedTemplateSlug,
    template: templateView,
    manifest,
    drift: {
      status: driftStatus,
      templateAvailable,
      templateChanged,
      deployedTemplateHash,
      currentTemplateHash,
      configHash: manifest?.configHash ?? null,
    },
    configSnapshot: sanitizeCloudSaasDeployment({
      configSnapshot: options.deployment.configSnapshot,
    }).configSnapshot,
  }
}

function slugifyTemplateSlug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `template-${randomUUID().slice(0, 8)}`
  )
}

const PROVISION_STATE_SECRET_KEY_RE =
  /(?:token|secret|password|api[_-]?key|authorization|bearer|kubeconfig)/i

function sanitizeLegacyProvisionState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeLegacyProvisionState(item))
  if (!isRecord(value)) return value

  const sanitized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (PROVISION_STATE_SECRET_KEY_RE.test(key)) continue
    sanitized[key] = sanitizeLegacyProvisionState(child)
  }
  return sanitized
}

function resolveModelProviderMode(input: {
  configSnapshot: unknown
  explicitProviderProfileIds: string[]
  modelProviderMode?: CloudStoreModelProviderMode | null
  runtimeServerUrl?: string
  usesModelProvider: boolean
}): CloudStoreModelProviderMode | null {
  const configuredMode =
    input.modelProviderMode ?? readCloudStoreModelProviderMode(input.configSnapshot)
  if (configuredMode) return configuredMode
  if (!input.usesModelProvider || input.explicitProviderProfileIds.length > 0) return null
  return officialModelProxyMissingConfig(input.runtimeServerUrl).length === 0 ? 'official' : null
}
const CLOUD_DEPLOYMENT_HOURLY_COST = 1
const CLOUD_DEPLOYMENT_BILLING_PRECISION_MINUTES = 15

const deploymentRuntimeContextSchema = z
  .object({
    locale: z.string().optional(),
    timezone: z.string().optional(),
  })
  .optional()

const deploymentAgentOperationSchema = z
  .object({
    agentId: z.string().min(1).max(255).optional(),
  })
  .optional()

const deploymentBackupCreateSchema = z
  .object({
    agentId: z.string().min(1).max(255).optional(),
    driver: z.enum(['volumeSnapshot', 'restic']).optional(),
    retentionDays: z.number().int().min(1).max(365).optional(),
    target: z
      .object({
        type: z.literal('github'),
        repository: z.string().min(3).max(255),
        branch: z.string().min(1).max(128).optional(),
        pathPrefix: z.string().max(200).optional(),
        token: z.string().min(8).max(4096).optional(),
        connectionId: z.string().uuid().optional(),
      })
      .optional(),
  })
  .optional()

const deploymentRestoreSchema = z
  .object({
    agentId: z.string().min(1).max(255).optional(),
    backupId: z.string().min(1).max(255).optional(),
    target: z
      .object({
        type: z.literal('github'),
        connectionId: z.string().uuid().optional(),
        token: z.string().min(8).max(4096).optional(),
      })
      .optional(),
  })
  .optional()

const deploymentRedeploySchema = z
  .object({
    mode: z.enum(['snapshot', 'template']).optional(),
    templateSlug: z.string().min(1).max(255).optional(),
    configSnapshot: z.record(z.unknown()).optional(),
    envVars: z.record(z.string()).optional(),
    removeEnvKeys: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/))
      .max(100)
      .optional(),
    runtimeContext: deploymentRuntimeContextSchema,
  })
  .optional()

const templateGithubSourceSchema = z
  .object({
    repository: z.string().min(1).max(512),
    branch: z.string().min(1).max(255).optional(),
    path: z.string().min(1).max(512).optional(),
    installationId: z.string().min(1).max(255).optional(),
    webhook: z
      .object({
        enabled: z.boolean().optional(),
        autoUpdateTemplate: z.boolean().optional(),
        autoDeploy: z.boolean().optional(),
      })
      .optional(),
    protectedOverrides: z.array(z.string().min(1).max(255)).max(50).optional(),
    lastCommitSha: z.string().min(7).max(64).optional(),
  })
  .optional()

const deploymentTemplateSyncSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    content: z.record(z.unknown()).optional(),
    tags: z.array(z.string().max(64)).max(20).optional(),
    category: z.string().max(64).optional(),
    baseCost: z.number().int().min(0).optional(),
    githubSource: templateGithubSourceSchema.nullable(),
  })
  .optional()

const githubConnectionCreateSchema = z.object({
  token: z.string().min(8).max(4096),
  name: z.string().min(1).max(255).optional(),
  connectionId: z.string().uuid().optional(),
})

const githubTemplatePreviewSchema = z.object({
  connectionId: z.string().uuid(),
  repository: z.string().min(3).max(255),
  branch: z.string().min(1).max(128).optional(),
  path: z.string().min(1).max(512).optional(),
})

function runCloudRuntimeOperation(
  container: AppContainer,
  meta: Record<string, unknown>,
  operation: () => Promise<void>,
) {
  void operation().catch((err) => {
    container.resolve('logger').error({ err, ...meta }, 'Cloud runtime operation failed')
  })
}

const diyCloudGenerateSchema = z
  .object({
    prompt: z.string().min(4).max(2000),
    feedback: z.string().max(2000).optional(),
    previousConfig: z.record(z.unknown()).optional(),
    locale: z.string().max(16).optional(),
    timezone: z.string().max(64).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.previousConfig) return
    const limits = validateJsonLimits(value.previousConfig, {
      maxBytes: 64 * 1024,
      maxDepth: 8,
      maxObjectKeys: 512,
      maxArrayItems: 128,
    })
    if (!limits.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['previousConfig'],
        message: limits.error,
      })
    }
  })

const diyCloudRunFeedbackSchema = z.object({
  feedback: z.string().min(1).max(2000),
  prompt: z.string().min(4).max(2000).optional(),
  locale: z.string().max(16).optional(),
  timezone: z.string().max(64).optional(),
})

const K8S_NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/

const PROVIDER_PROFILE_SCOPE_PREFIX = 'provider:'
const PROVIDER_PROFILE_META_KEYS = {
  id: 'SHADOWOB_PROVIDER_PROFILE_ID',
  providerId: 'SHADOWOB_PROVIDER_ID',
  name: 'SHADOWOB_PROVIDER_PROFILE_NAME',
  configJson: 'SHADOWOB_PROVIDER_CONFIG_JSON',
  enabled: 'SHADOWOB_PROVIDER_ENABLED',
} as const
const PROVIDER_PROFILE_META_KEY_SET = new Set<string>(Object.values(PROVIDER_PROFILE_META_KEYS))
const PROVIDER_PROFILE_MODELS_ENV_KEY = 'SHADOWOB_PROVIDER_PROFILE_MODELS_JSON'
const PROVIDER_MODEL_TAGS = ['default', 'fast', 'flash', 'reasoning', 'vision', 'tools'] as const
const PROVIDER_MODEL_TAG_SET = new Set<string>(PROVIDER_MODEL_TAGS)

type ProviderCatalogView = Awaited<ReturnType<typeof listProviderCatalogs>>[number]['provider']

type ProviderProfileView = {
  id: string
  providerId: string
  name: string
  scope: string
  enabled: boolean
  config: Record<string, unknown>
  envVars: Array<{ key: string; maskedValue: string; isSecret: boolean }>
  updatedAt?: string
}

type ProviderProfileModelView = {
  id: string
  name?: string
  tags?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: {
    input?: number
    output?: number
  }
  capabilities?: {
    vision?: boolean
    tools?: boolean
    reasoning?: boolean
  }
}

type ProviderRuntimeProfile = {
  id: string
  providerId: string
  name: string
  provider: ProviderCatalogView
  values: Map<string, string>
  apiKey: { key: string; value: string }
  baseUrl: string
  models: ProviderProfileModelView[]
}

type CloudTemplateRecord = typeof cloudTemplates.$inferSelect

async function getPrimarySchema(): Promise<Record<string, unknown>> {
  return loadCloudConfigSchema()
}

function isDeployableTemplateContent(content: unknown): boolean {
  try {
    validateCloudSaasConfigSnapshot(content)
    return true
  } catch {
    return false
  }
}

function isTemplateOwnedByUser(template: CloudTemplateRecord, userId: string): boolean {
  return template.authorId === userId || template.submittedByUserId === userId
}

function canUseTemplate(template: CloudTemplateRecord, userId: string): boolean {
  return template.reviewStatus === 'approved' || isTemplateOwnedByUser(template, userId)
}

function nonEmptyProcessEnv(key: string): string | undefined {
  const value = process.env[key]
  return value && value.trim() !== '' ? value : undefined
}

/**
 * Resolve i18n dict from a template's `content.i18n` field for the given locale.
 * Falls back to 'en' if the requested locale isn't available.
 */
function resolveTemplateI18nDict(
  content: Record<string, unknown>,
  locale: string,
): Record<string, string> {
  const i18n = content.i18n as Record<string, Record<string, string>> | undefined
  if (!i18n) return {}
  const baseLocale = locale.split('-')[0] ?? locale
  return i18n[locale] ?? (baseLocale !== locale ? i18n[baseLocale] : undefined) ?? i18n.en ?? {}
}

/**
 * Resolve a string value that may contain `${i18n:key}` references.
 */
function resolveI18nValue(value: string, i18nDict: Record<string, string>): string {
  const match = /^\$\{i18n:([^}]+)\}$/.exec(value)
  if (!match?.[1]) return value
  return i18nDict[match[1]] ?? value
}

/**
 * Deep-resolve `${i18n:...}` placeholders in an object's string values.
 */
function resolveI18nInObject(obj: unknown, i18nDict: Record<string, string>): unknown {
  if (typeof obj === 'string') return resolveI18nValue(obj, i18nDict)
  if (Array.isArray(obj)) return obj.map((item) => resolveI18nInObject(item, i18nDict))
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip the i18n section itself — it's the source, not a target
      if (key === 'i18n') continue
      result[key] = resolveI18nInObject(value, i18nDict)
    }
    return result
  }
  return obj
}

function localizeTemplateRecord<
  T extends { name: string; description: string | null; content: unknown },
>(template: T, locale: string): T {
  const content = template.content as Record<string, unknown>
  const i18nDict = resolveTemplateI18nDict(content, locale)
  const resolvedName = resolveI18nValue(template.name, i18nDict)
  const finalName =
    resolvedName === template.name
      ? (i18nDict.title ?? i18nDict.name ?? template.name)
      : resolvedName
  const resolvedDesc = template.description
    ? resolveI18nValue(template.description, i18nDict)
    : undefined
  const finalDesc =
    resolvedDesc === template.description
      ? (i18nDict.description ?? template.description)
      : (resolvedDesc ?? i18nDict.description)

  return {
    ...template,
    name: finalName,
    description: finalDesc ?? null,
    content: resolveI18nInObject(content, i18nDict),
  }
}

function providerProfileScope(profileId: string): string {
  return `${PROVIDER_PROFILE_SCOPE_PREFIX}${profileId}`
}

function isProviderProfileMetaKey(key: string): boolean {
  return PROVIDER_PROFILE_META_KEY_SET.has(key)
}

function normalizeProviderProfileId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function parseProviderProfileConfig(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function isMaskedPlaceholderValue(value: unknown): boolean {
  return typeof value === 'string' && /^[*•●∙·]{3,}$/u.test(value.trim())
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeProviderBaseUrlValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (isMaskedPlaceholderValue(value)) return undefined
  const normalized = normalizeBaseUrl(value)
  if (!normalized) return undefined
  return isValidHttpUrl(normalized) ? normalized : undefined
}

function safeDecryptProviderValue(value: string, scope: string, key: string): string | null {
  try {
    return decrypt(value)
  } catch (err) {
    console.warn(
      `[cloud-saas] ignoring unreadable provider env value scope=${scope} key=${key}:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

function safeDecryptEnvValue(value: string, scope: string, key: string): string | null {
  try {
    return decrypt(value)
  } catch (err) {
    console.warn(
      `[cloud-saas] ignoring unreadable env value scope=${scope} key=${key}:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

function parseProviderProfileEnabled(value: string | undefined): boolean {
  return value !== 'false'
}

function finitePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

function normalizeModelTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const tags = [
    ...new Set(
      value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => PROVIDER_MODEL_TAG_SET.has(tag)),
    ),
  ]
  return tags.length > 0 ? tags : undefined
}

function normalizeProviderProfileModels(
  config: Record<string, unknown>,
): ProviderProfileModelView[] {
  const rawModels = Array.isArray(config.models) ? config.models : []
  const models: ProviderProfileModelView[] = []
  const seen = new Set<string>()

  for (const raw of rawModels) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)

    const name =
      typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined
    const contextWindow = finitePositiveNumber(record.contextWindow)
    const maxTokens = finitePositiveNumber(record.maxTokens)
    const inputCost = finitePositiveNumber(
      (record.cost as Record<string, unknown> | undefined)?.input,
    )
    const outputCost = finitePositiveNumber(
      (record.cost as Record<string, unknown> | undefined)?.output,
    )
    const capabilities =
      record.capabilities &&
      typeof record.capabilities === 'object' &&
      !Array.isArray(record.capabilities)
        ? (record.capabilities as Record<string, unknown>)
        : undefined

    models.push({
      id,
      ...(name ? { name } : {}),
      ...(normalizeModelTags(record.tags) ? { tags: normalizeModelTags(record.tags) } : {}),
      ...(contextWindow ? { contextWindow } : {}),
      ...(maxTokens ? { maxTokens } : {}),
      ...(inputCost || outputCost
        ? {
            cost: {
              ...(inputCost ? { input: inputCost } : {}),
              ...(outputCost ? { output: outputCost } : {}),
            },
          }
        : {}),
      ...(capabilities
        ? {
            capabilities: {
              ...(typeof capabilities.vision === 'boolean' ? { vision: capabilities.vision } : {}),
              ...(typeof capabilities.tools === 'boolean' ? { tools: capabilities.tools } : {}),
              ...(typeof capabilities.reasoning === 'boolean'
                ? { reasoning: capabilities.reasoning }
                : {}),
            },
          }
        : {}),
    })
  }

  const legacyModel = config.modelId ?? config.defaultModel ?? config.model
  if (typeof legacyModel === 'string' && legacyModel.trim() && !seen.has(legacyModel.trim())) {
    models.push({ id: legacyModel.trim(), tags: ['default'] })
  }

  return models
}

function configUsesPlugin(value: unknown, pluginId: string, depth = 0): boolean {
  if (depth > 32 || !value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => configUsesPlugin(item, pluginId, depth + 1))

  const record = value as Record<string, unknown>
  if (record.plugin === pluginId) return true
  return Object.values(record).some((child) => configUsesPlugin(child, pluginId, depth + 1))
}

function firstProviderApiKey(
  provider: ProviderCatalogView,
  values: Map<string, string>,
): { key: string; value: string } | null {
  for (const key of [provider.envKey, ...(provider.envKeyAliases ?? [])]) {
    const value = values.get(key)
    if (value?.trim()) return { key, value }
  }
  return null
}

function defaultProviderBaseUrl(provider: ProviderCatalogView): string | undefined {
  if (provider.baseUrl) return provider.baseUrl
  if (provider.id === 'anthropic') return 'https://api.anthropic.com/v1'
  if (provider.id === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta'
  return undefined
}

function normalizeBaseUrl(input: string | undefined): string | undefined {
  const value = input?.trim()
  if (!value) return undefined
  return value.replace(/\/+$/, '')
}

function providerProfileBaseUrl(
  provider: ProviderCatalogView,
  values: Map<string, string>,
  config: Record<string, unknown>,
): string | undefined {
  const configBaseUrl = normalizeProviderBaseUrlValue(config.baseUrl)
  const envBaseUrl = provider.baseUrlEnvKey ? values.get(provider.baseUrlEnvKey) : undefined
  return normalizeBaseUrl(
    configBaseUrl ?? normalizeProviderBaseUrlValue(envBaseUrl) ?? defaultProviderBaseUrl(provider),
  )
}

function sanitizeStoredProviderProfileConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = normalizeLlmProviderConfig(config)
  const baseUrl = normalizeProviderBaseUrlValue(config.baseUrl)
  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(normalized.apiFormat ? { apiFormat: normalized.apiFormat } : {}),
    ...(normalized.authType ? { authType: normalized.authType } : {}),
    ...(normalized.discoveredAt ? { discoveredAt: normalized.discoveredAt } : {}),
    models: normalizeProviderProfileModels(config),
  }
}

function validateProviderProfileConfigForSave(
  config: Record<string, unknown> | undefined,
): { ok: true; config: Record<string, unknown> } | { ok: false; error: string } {
  const raw = config ?? {}
  const baseUrlValue = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : ''
  if (
    baseUrlValue &&
    !isMaskedPlaceholderValue(baseUrlValue) &&
    !normalizeProviderBaseUrlValue(baseUrlValue)
  ) {
    return { ok: false, error: 'Invalid Base URL' }
  }

  const sanitized = sanitizeStoredProviderProfileConfig(raw)
  if (normalizeProviderProfileModels(sanitized).length === 0) {
    return { ok: false, error: 'At least one model is required' }
  }

  return { ok: true, config: sanitized }
}

async function testProviderConnection(
  safeHttpClient: SafeHttpClient,
  provider: ProviderCatalogView,
  values: Map<string, string>,
  config: Record<string, unknown>,
): Promise<{
  ok: boolean
  status?: number
  message: string
  checkedAt: string
}> {
  const checkedAt = new Date().toISOString()
  const apiKey = firstProviderApiKey(provider, values)
  if (!apiKey) {
    return { ok: false, message: 'Missing provider API key', checkedAt }
  }

  const baseUrl = providerProfileBaseUrl(provider, values, config)
  if (!baseUrl) {
    return { ok: false, message: 'Missing provider base URL', checkedAt }
  }
  try {
    await assertSafeHttpUrl(baseUrl)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unsafe provider base URL',
      checkedAt,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    let url = `${baseUrl}/models`
    const headers: Record<string, string> = { Accept: 'application/json' }

    if (provider.api === 'google' || provider.api === 'google-generative-ai') {
      headers['x-goog-api-key'] = apiKey.value
    } else if (provider.api === 'anthropic-messages') {
      headers['x-api-key'] = apiKey.value
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers.Authorization = `Bearer ${apiKey.value}`
    }

    const response = await safeHttpClient.fetch(url, {
      headers,
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        message: 'Connection succeeded',
        checkedAt,
      }
    }
    const body = await response.text().catch(() => '')
    if (response.status === 404) {
      const model = normalizeProviderProfileModels(config)[0]?.id
      if (model) {
        return await testProviderModelRequest(
          safeHttpClient,
          provider,
          baseUrl,
          apiKey,
          config,
          model,
          checkedAt,
        )
      }
    }
    return {
      ok: false,
      status: response.status,
      message: body.trim()
        ? `Provider returned ${response.status}`
        : `Provider returned ${response.status}`,
      checkedAt,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Connection failed',
      checkedAt,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function testProviderModelRequest(
  safeHttpClient: SafeHttpClient,
  provider: ProviderCatalogView,
  baseUrl: string,
  apiKey: { key: string; value: string },
  config: Record<string, unknown>,
  model: string,
  checkedAt: string,
): Promise<{
  ok: boolean
  status?: number
  message: string
  checkedAt: string
}> {
  const apiFormat = providerProfileApiFormat(provider, config)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  let url: string
  let body: unknown

  if (apiFormat === 'anthropic') {
    url = `${baseUrl}/messages`
    headers['x-api-key'] = apiKey.value
    headers['anthropic-version'] = '2023-06-01'
    body = {
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }
  } else if (apiFormat === 'gemini') {
    const modelPath = model.startsWith('models/') ? model : `models/${model}`
    url = `${baseUrl}/${modelPath}:generateContent`
    headers['x-goog-api-key'] = apiKey.value
    body = {
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 1 },
    }
  } else {
    url = `${baseUrl}/chat/completions`
    headers.Authorization = `Bearer ${apiKey.value}`
    body = {
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await safeHttpClient.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        message: 'Connection succeeded',
        checkedAt,
      }
    }
    await response.text().catch(() => '')
    return {
      ok: false,
      status: response.status,
      message: `Provider returned ${response.status}`,
      checkedAt,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Connection failed',
      checkedAt,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function providerProfileApiFormat(
  provider: ProviderCatalogView,
  config: Record<string, unknown>,
): LlmProviderApiFormat {
  const normalized = normalizeLlmProviderConfig(config)
  if (normalized.apiFormat) return normalized.apiFormat
  if (provider.api === 'google' || provider.api === 'google-generative-ai') return 'gemini'
  return provider.api === 'anthropic' || provider.api === 'anthropic-messages'
    ? 'anthropic'
    : 'openai'
}

async function discoverProviderProfileModels(
  safeHttpClient: SafeHttpClient,
  provider: ProviderCatalogView,
  values: Map<string, string>,
  config: Record<string, unknown>,
): Promise<{
  ok: boolean
  status?: number
  message: string
  models: ProviderProfileModelView[]
}> {
  const apiKey = firstProviderApiKey(provider, values)
  const apiFormat = providerProfileApiFormat(provider, config)
  const baseUrl = providerProfileBaseUrl(provider, values, config)

  if (!baseUrl) return { ok: false, message: 'Missing provider base URL', models: [] }
  if (!apiKey) return { ok: false, message: 'Missing provider API key', models: [] }
  try {
    await assertSafeHttpUrl(baseUrl)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unsafe provider base URL',
      models: [],
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const url =
      apiFormat === 'anthropic'
        ? `${baseUrl}/models?limit=100`
        : apiFormat === 'gemini'
          ? `${baseUrl}/models`
          : `${baseUrl}/models`
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) {
      if (apiFormat === 'anthropic') {
        headers['x-api-key'] = apiKey.value
        headers['anthropic-version'] = '2023-06-01'
      } else if (apiFormat === 'gemini') {
        headers['x-goog-api-key'] = apiKey.value
      } else if (apiFormat === 'openai') {
        headers.Authorization = `Bearer ${apiKey.value}`
      }
    }

    const response = await safeHttpClient.fetch(url, {
      headers,
      redirect: 'manual',
      signal: controller.signal,
    })
    if (!response.ok) {
      await response.text().catch(() => '')
      return {
        ok: false,
        status: response.status,
        message: `Provider returned ${response.status}`,
        models: [],
      }
    }

    const body = await response.json()
    const models = parseDiscoveredModelsFromResponse(body, apiFormat)
    return {
      ok: true,
      status: response.status,
      message: `Discovered ${models.length} model(s)`,
      models,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Model discovery failed',
      models: [],
    }
  } finally {
    clearTimeout(timeout)
  }
}

function collectProviderProfileIds(
  value: unknown,
  out = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 32 || !value || typeof value !== 'object') return out

  if (Array.isArray(value)) {
    for (const item of value) collectProviderProfileIds(item, out, depth + 1)
    return out
  }

  const record = value as Record<string, unknown>
  if (record.plugin === 'model-provider') {
    const options = record.options as Record<string, unknown> | undefined
    const profileId = options?.profileId
    if (typeof profileId === 'string' && profileId.trim()) out.add(profileId.trim())

    const profileIds = options?.profileIds
    if (Array.isArray(profileIds)) {
      for (const id of profileIds) {
        if (typeof id === 'string' && id.trim()) out.add(id.trim())
      }
    }
  }

  for (const child of Object.values(record)) collectProviderProfileIds(child, out, depth + 1)
  return out
}

function collectModelProviderSelectors(
  value: unknown,
  out = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 32 || !value || typeof value !== 'object') return out

  if (Array.isArray(value)) {
    for (const item of value) collectModelProviderSelectors(item, out, depth + 1)
    return out
  }

  const record = value as Record<string, unknown>
  if (record.plugin === 'model-provider') {
    const options = record.options as Record<string, unknown> | undefined
    for (const key of ['selector', 'tag', 'model']) {
      const value = options?.[key]
      if (typeof value === 'string' && value.trim()) out.add(value.trim().toLowerCase())
    }
  }

  for (const child of Object.values(record)) collectModelProviderSelectors(child, out, depth + 1)
  return out
}

function providerModelMatchesSelector(
  model: ProviderProfileModelView,
  profileId: string,
  selector: string,
): boolean {
  const normalized = selector.trim().toLowerCase()
  if (!normalized) return false
  if (model.id.toLowerCase() === normalized) return true
  if (`${profileId}/${model.id}`.toLowerCase() === normalized) return true
  return (model.tags ?? []).some((tag) => tag.toLowerCase() === normalized)
}

function selectRuntimeProviderProfiles(
  profiles: ProviderRuntimeProfile[],
  selectors: string[],
): ProviderRuntimeProfile[] {
  if (profiles.length === 0) return []
  const wanted = selectors.length > 0 ? selectors : ['default']
  const selected = new Map<string, ProviderRuntimeProfile>()

  for (const selector of wanted) {
    const match =
      profiles.find((profile) =>
        profile.models.some((model) => providerModelMatchesSelector(model, profile.id, selector)),
      ) ??
      profiles.find((profile) =>
        profile.models.some((model) => providerModelMatchesSelector(model, profile.id, 'default')),
      ) ??
      profiles[0]

    if (match) selected.set(match.id, match)
  }

  return [...selected.values()]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isTerminalDeploymentStatus(status: string): boolean {
  return (
    status === 'deployed' || status === 'paused' || status === 'failed' || status === 'destroyed'
  )
}

function isVisibleDeploymentStatus(status: string, errorMessage?: string | null): boolean {
  return (
    status === 'pending' ||
    status === 'deploying' ||
    status === 'cancelling' ||
    status === 'deployed' ||
    status === 'paused' ||
    status === 'resuming' ||
    status === 'destroying' ||
    (status === 'failed' &&
      errorMessage !== 'cancelled by user' &&
      errorMessage !== 'superseded-by-newer-deployment')
  )
}

function isActiveDeploymentStatus(status: string): boolean {
  return (
    status === 'pending' ||
    status === 'deploying' ||
    status === 'resuming' ||
    status === 'cancelling' ||
    status === 'destroying'
  )
}

type BlockingDeploymentRow = {
  id: string
  clusterId?: string | null
  namespace: string
  status: string
  updatedAt?: Date | null
  createdAt?: Date | null
}

function deploymentCreatedTime(row: { createdAt?: Date | null; updatedAt?: Date | null }): number {
  return (row.createdAt ?? row.updatedAt)?.getTime?.() ?? 0
}

function findBlockingDeployment<T extends BlockingDeploymentRow>(
  deployment: T,
  rows: T[],
): T | null {
  if (!isActiveDeploymentStatus(deployment.status)) return null

  const queuedAt = deploymentCreatedTime(deployment)
  return (
    rows
      .filter(
        (row) =>
          row.id !== deployment.id &&
          row.namespace === deployment.namespace &&
          (row.clusterId ?? null) === (deployment.clusterId ?? null) &&
          isActiveDeploymentStatus(row.status) &&
          deploymentCreatedTime(row) <= queuedAt,
      )
      .sort((left, right) => deploymentCreatedTime(left) - deploymentCreatedTime(right))[0] ?? null
  )
}

function resolveDeploymentAgentIds(
  deployment: { name: string; configSnapshot?: unknown },
  requestedAgentId?: string,
): string[] {
  if (requestedAgentId?.trim()) return [requestedAgentId.trim()]
  if (isRecord(deployment.configSnapshot)) {
    const deployments = deployment.configSnapshot.deployments
    if (isRecord(deployments) && Array.isArray(deployments.agents)) {
      const agentIds = deployments.agents
        .map((agent) => (isRecord(agent) && typeof agent.id === 'string' ? agent.id.trim() : ''))
        .filter((agentId) => agentId.length > 0)
      if (agentIds.length > 0) {
        return [...new Set(agentIds)]
      }
    }
  }
  return [deployment.name]
}

function formatDeploymentAgentIds(agentIds: string[]) {
  return agentIds.map((agentId) => `"${agentId}"`).join(', ')
}

function expiresAtFromRetentionDays(retentionDays?: number): Date | null {
  if (!retentionDays) return null
  return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
}

function expiresAtFromTtlMinutes(ttlMinutes?: number | null): Date | null {
  if (!ttlMinutes) return null
  return new Date(Date.now() + ttlMinutes * 60 * 1000)
}

async function resolveDeploymentKubeconfig(
  container: AppContainer,
  deployment: { clusterId?: string | null },
): Promise<string | undefined> {
  if (!deployment.clusterId) return undefined
  const useCase = container.resolve('cloudSaasUseCase')
  const cluster = await useCase.findClusterByIdOnly({
    ctx: createActorContext({ kind: 'system', service: 'cloud-processor', capabilities: [] }),
    clusterId: deployment.clusterId,
  })
  if (!cluster?.kubeconfigEncrypted) return undefined
  return decrypt(cluster.kubeconfigEncrypted)
}

const CLOUD_BACKUP_HELPER_IMAGE = process.env.CLOUD_BACKUP_HELPER_IMAGE ?? 'busybox:1.36'
const CLOUD_BACKUP_ENCRYPTION_MAGIC = Buffer.from('SHADOWOB-BACKUP-AESGCM-v1\n')

type CloudBackupDeployment = {
  namespace: string
  clusterId?: string | null
}

type CloudBackupRecord = {
  id: string
  namespace: string
  agentId: string
  pvcName: string
  objectKey: string | null
}

type CloudBackupPhase =
  | 'git-pushing'
  | 'object-storing'
  | 'restoring-pausing'
  | 'restoring-pvc'
  | 'restoring-resuming'
  | 'restore-failed'
  | 'completed'

type ObjectStoreBackupResult = {
  archiveBytes: number
  storedBytes: number
  encrypted: boolean
  source: 'running-pod' | 'helper-pod'
}

type RuntimeArchiveResult = {
  archive: Buffer
  source: 'running-pod' | 'helper-pod'
}

type GitHubBackupTarget = {
  repository: string
  branch?: string
  pathPrefix?: string
  token?: string
  connectionId?: string
}

type NormalizedGitHubBackupTarget = {
  cloneUrl: string
  owner: string
  repo: string
  displayRepository: string
  branch: string
  pathPrefix: string
  token: string
}

type GitHubRepositoryRef = {
  owner: string
  repo: string
  displayRepository: string
  cloneUrl: string
}

type ParsedGitHubBackupArtifact = GitHubRepositoryRef & {
  branch: string
  path: string
}

function backupHelperPodName(backupId: string, purpose: 'backup' | 'restore') {
  const suffix = backupId
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 10)
  return `shadow-${purpose}-${suffix}`
}

function objectBackupKey(deploymentId: string, agentId: string, stamp: string) {
  const safeAgent = agentId
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const agentSegment =
    safeAgent || `agent-${createHash('sha256').update(agentId).digest('hex').slice(0, 12)}`
  return `backups/cloud/${deploymentId}/${agentSegment}/${stamp}.tar.gz`
}

function parseGitHubRepository(rawRepository: string): GitHubRepositoryRef {
  const raw = rawRepository.trim()
  let owner: string
  let repo: string

  const shorthand = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/)
  if (shorthand) {
    owner = shorthand[1]!
    repo = shorthand[2]!
  } else {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      throw new Error(
        'GitHub repository must be owner/repo or an https://github.com/owner/repo URL',
      )
    }
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
      throw new Error('GitHub backup only supports https://github.com repositories')
    }
    const parts = parsed.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean)
    if (parts.length !== 2) {
      throw new Error('GitHub repository URL must point to exactly one owner/repo')
    }
    owner = parts[0]!
    repo = parts[1]!.replace(/\.git$/i, '')
  }

  const repoId = `${owner}/${repo}`
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoId)) {
    throw new Error('GitHub repository contains unsupported characters')
  }

  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
    displayRepository: `github.com/${owner}/${repo}`,
  }
}

function normalizeGitHubBackupTarget(target: GitHubBackupTarget): NormalizedGitHubBackupTarget {
  const repository = parseGitHubRepository(target.repository)
  const branch = (target.branch?.trim() || 'main').replace(/^refs\/heads\//, '')
  if (!/^[A-Za-z0-9._/-]{1,128}$/.test(branch) || branch.includes('..')) {
    throw new Error('GitHub backup branch contains unsupported characters')
  }

  const pathPrefix = (target.pathPrefix?.trim() || 'shadow-backups')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
  if (
    !/^[A-Za-z0-9._/-]{1,200}$/.test(pathPrefix) ||
    pathPrefix.split('/').some((part) => part === '..' || part === '.' || part === '.git')
  ) {
    throw new Error('GitHub backup path contains unsupported characters')
  }

  const token = target.token?.trim() ?? ''
  if (!token) throw new Error('GitHub token is required')

  return {
    ...repository,
    branch,
    pathPrefix,
    token,
  }
}

function githubBackupArtifactUri(target: NormalizedGitHubBackupTarget, relativePath: string) {
  return `github://${target.displayRepository}/${encodeURIComponent(target.branch)}/${relativePath}`
}

function parseGitHubBackupArtifact(objectKey: string): ParsedGitHubBackupArtifact {
  let parsed: URL
  try {
    parsed = new URL(objectKey)
  } catch {
    throw new Error('GitHub backup artifact URI is malformed')
  }
  if (parsed.protocol !== 'github:' || parsed.hostname !== 'github.com') {
    throw new Error('GitHub backup artifact must use github://github.com/owner/repo/branch/path')
  }
  const parts = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
  if (parts.length < 4) {
    throw new Error('GitHub backup artifact is missing repository, branch, or path')
  }
  const [owner, repo, branchRaw, ...pathParts] = parts
  const repository = parseGitHubRepository(`${owner}/${repo}`)
  const branch = decodeURIComponent(branchRaw!)
  const path = pathParts.join('/')
  if (!path || path.includes('..')) throw new Error('GitHub backup artifact path is invalid')
  return { ...repository, branch, path }
}

function safeGitBackupFilePath(
  target: NormalizedGitHubBackupTarget,
  options: {
    namespace: string
    agentId: string
    stamp: string
  },
) {
  const cleanNamespace = options.namespace
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const cleanAgent = options.agentId
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${target.pathPrefix}/${cleanNamespace || 'namespace'}/${cleanAgent || 'agent'}/${options.stamp}.tar.gz`
}

function resolveObjectBackupEncryptionKey(): Buffer | null {
  const raw = process.env.CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY?.trim()
  if (!raw) {
    if (process.env.CLOUD_BACKUP_OBJECT_ENCRYPTION_REQUIRED === 'true') {
      throw new Error('CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY is required for object backups')
    }
    return null
  }

  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.byteLength !== 32) {
    throw new Error('CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex')
  }
  return key
}

function startsWithBuffer(value: Buffer, prefix: Buffer): boolean {
  return (
    value.byteLength >= prefix.byteLength && value.subarray(0, prefix.byteLength).equals(prefix)
  )
}

function encryptObjectBackupArchive(archive: Buffer): Buffer {
  const key = resolveObjectBackupEncryptionKey()
  if (!key) return archive

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(archive), cipher.final()])
  const tag = cipher.getAuthTag()
  const metadata = Buffer.from(
    JSON.stringify({
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    }),
  )
  return Buffer.concat([CLOUD_BACKUP_ENCRYPTION_MAGIC, metadata, Buffer.from('\n'), ciphertext])
}

function encryptGitHubBackupArchive(archive: Buffer): Buffer {
  const storedArchive = encryptObjectBackupArchive(archive)
  if (storedArchive === archive && process.env.CLOUD_GITHUB_BACKUP_ALLOW_PLAINTEXT !== 'true') {
    throw new Error(
      'CLOUD_BACKUP_OBJECT_ENCRYPTION_KEY is required for GitHub backups; set CLOUD_GITHUB_BACKUP_ALLOW_PLAINTEXT=true only for non-sensitive test data',
    )
  }
  return storedArchive
}

function decryptObjectBackupArchiveIfNeeded(archive: Buffer): Buffer {
  if (!startsWithBuffer(archive, CLOUD_BACKUP_ENCRYPTION_MAGIC)) return archive
  const metaStart = CLOUD_BACKUP_ENCRYPTION_MAGIC.byteLength
  const metaEnd = archive.indexOf('\n', metaStart)
  if (metaEnd <= metaStart) throw new Error('Encrypted backup archive metadata is malformed')

  const metadata = JSON.parse(archive.subarray(metaStart, metaEnd).toString('utf8')) as {
    alg?: string
    iv?: string
    tag?: string
  }
  if (metadata.alg !== 'aes-256-gcm' || !metadata.iv || !metadata.tag) {
    throw new Error('Encrypted backup archive metadata is unsupported')
  }
  const key = resolveObjectBackupEncryptionKey()
  if (!key) throw new Error('Object backup is encrypted but no decryption key is configured')

  const iv = Buffer.from(metadata.iv, 'base64')
  const tag = Buffer.from(metadata.tag, 'base64')
  if (iv.byteLength !== 12 || tag.byteLength !== 16) {
    throw new Error('Encrypted backup archive metadata has invalid key material')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const ciphertext = archive.subarray(metaEnd + 1)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

async function createStatePvcHelperPod(options: {
  namespace: string
  podName: string
  pvcName: string
  kubeconfig?: string
}) {
  await deleteStatePvcHelperPod(options)
  await applyKubernetesManifestAsync(
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: options.podName,
        namespace: options.namespace,
        labels: {
          app: 'shadowob-cloud',
          'shadowob.cloud/backup-helper': 'true',
        },
      },
      spec: {
        restartPolicy: 'Never',
        automountServiceAccountToken: false,
        securityContext: {
          runAsUser: 1000,
          runAsGroup: 1000,
          fsGroup: 1000,
          seccompProfile: { type: 'RuntimeDefault' },
        },
        containers: [
          {
            name: 'archive',
            image: CLOUD_BACKUP_HELPER_IMAGE,
            imagePullPolicy: 'IfNotPresent',
            command: ['sh', '-c', 'trap : TERM INT; sleep 3600 & wait'],
            securityContext: {
              allowPrivilegeEscalation: false,
              capabilities: { drop: ['ALL'] },
            },
            volumeMounts: [{ name: 'state', mountPath: '/state' }],
          },
        ],
        volumes: [
          {
            name: 'state',
            persistentVolumeClaim: { claimName: options.pvcName },
          },
        ],
      },
    },
    options.kubeconfig,
    30_000,
  )
  await waitForPodReadyAsync({
    namespace: options.namespace,
    pod: options.podName,
    kubeconfig: options.kubeconfig,
    timeoutMs: 90_000,
  })
}

async function deleteStatePvcHelperPod(options: {
  namespace: string
  podName: string
  kubeconfig?: string
}) {
  await deleteKubernetesResourceAsync({
    namespace: options.namespace,
    kind: 'pod',
    name: options.podName,
    kubeconfig: options.kubeconfig,
    timeoutMs: 30_000,
  }).catch(() => {})
}

async function findRunningAgentPod(options: {
  namespace: string
  agentId: string
  kubeconfig?: string
  kubernetesOpsGateway: {
    listPods: (
      namespace: string,
      kubeconfig?: string,
    ) => Promise<Array<{ name: string; status: string }>>
  }
}) {
  const pods = await options.kubernetesOpsGateway
    .listPods(options.namespace, options.kubeconfig)
    .catch(() => [])
  return (
    pods.find((pod) => pod.name === options.agentId && pod.status === 'Running') ??
    pods.find((pod) => pod.name.includes(options.agentId) && pod.status === 'Running') ??
    null
  )
}

async function readStateArchiveFromPod(options: {
  namespace: string
  podName: string
  path: string
  container?: string
  kubeconfig?: string
  kubernetesOpsGateway: {
    execInPod: (opts: {
      namespace: string
      pod: string
      container?: string
      kubeconfig?: string
      timeout?: number
      command: string[]
    }) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  }
}) {
  const result = await options.kubernetesOpsGateway.execInPod({
    namespace: options.namespace,
    pod: options.podName,
    container: options.container,
    kubeconfig: options.kubeconfig,
    timeout: 180_000,
    command: [
      'sh',
      '-lc',
      `mkdir -p ${options.path} && cd ${options.path} && tar -czf - . | base64 | tr -d '\\n'`,
    ],
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to archive state PVC')
  }
  const encoded = result.stdout.trim()
  if (!encoded) throw new Error('State archive was empty')
  return Buffer.from(encoded, 'base64')
}

async function writeStateArchiveToPod(options: {
  namespace: string
  podName: string
  archive: Buffer
  kubeconfig?: string
  kubernetesOpsGateway: {
    execInPodWithInput: (opts: {
      namespace: string
      pod: string
      container?: string
      kubeconfig?: string
      timeout?: number
      input: string
      command: string[]
    }) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  }
}) {
  const result = await options.kubernetesOpsGateway.execInPodWithInput({
    namespace: options.namespace,
    pod: options.podName,
    kubeconfig: options.kubeconfig,
    timeout: 180_000,
    input: options.archive.toString('base64'),
    command: [
      'sh',
      '-lc',
      'set -e; mkdir -p /state; rm -rf /state/* /state/.[!.]* /state/..?* 2>/dev/null || true; base64 -d | tar -xzf - -C /state',
    ],
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to restore state PVC archive')
  }
}

async function putObjectArchive(options: {
  container: AppContainer
  objectKey: string
  archive: Buffer
}): Promise<{ storedBytes: number; encrypted: boolean }> {
  const object = encryptObjectBackupArchive(options.archive)
  await options.container
    .resolve('mediaService')
    .putPrivateObject(
      options.objectKey,
      object,
      object === options.archive ? 'application/gzip' : 'application/octet-stream',
    )
  return { storedBytes: object.byteLength, encrypted: object !== options.archive }
}

async function createRuntimeStateArchive(options: {
  container: AppContainer
  deployment: CloudBackupDeployment
  backup: CloudBackupRecord
  target: RuntimeStateTarget
  kubeconfig?: string
}): Promise<RuntimeArchiveResult> {
  const runningPod = await findRunningAgentPod({
    namespace: options.deployment.namespace,
    agentId: options.backup.agentId,
    kubeconfig: options.kubeconfig,
    kubernetesOpsGateway: options.container.resolve('kubernetesOpsGateway'),
  })
  if (runningPod) {
    try {
      const archive = await readStateArchiveFromPod({
        namespace: options.deployment.namespace,
        podName: runningPod.name,
        path: options.target.statePath,
        container: options.target.containerName,
        kubeconfig: options.kubeconfig,
        kubernetesOpsGateway: options.container.resolve('kubernetesOpsGateway'),
      })
      return { archive, source: 'running-pod' }
    } catch (err) {
      options.container.resolve('logger').warn(
        {
          err,
          namespace: options.deployment.namespace,
          backupId: options.backup.id,
          agentId: options.backup.agentId,
          podName: runningPod.name,
        },
        'Falling back to backup helper pod after running pod archive failed',
      )
    }
  }

  if (!options.target.persistentState) {
    throw new Error(
      `Runtime state for agent "${options.target.agentId}" is not backed by a PVC; cannot fall back to helper-pod backup`,
    )
  }

  const helperPod = backupHelperPodName(options.backup.id, 'backup')
  await createStatePvcHelperPod({
    namespace: options.deployment.namespace,
    podName: helperPod,
    pvcName: options.backup.pvcName,
    kubeconfig: options.kubeconfig,
  })

  try {
    const archive = await readStateArchiveFromPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      path: '/state',
      kubeconfig: options.kubeconfig,
      kubernetesOpsGateway: options.container.resolve('kubernetesOpsGateway'),
    })
    return { archive, source: 'helper-pod' }
  } finally {
    await deleteStatePvcHelperPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      kubeconfig: options.kubeconfig,
    })
  }
}

async function createObjectStoreBackup(options: {
  container: AppContainer
  deployment: CloudBackupDeployment
  backup: CloudBackupRecord
  target: RuntimeStateTarget
  kubeconfig?: string
  onPhase?: (phase: CloudBackupPhase) => Promise<void>
}): Promise<ObjectStoreBackupResult> {
  if (!options.backup.objectKey) throw new Error('Object backup key is missing')
  const runtimeArchive = await createRuntimeStateArchive(options)
  await options.onPhase?.('object-storing')
  const stored = await putObjectArchive({
    container: options.container,
    objectKey: options.backup.objectKey,
    archive: runtimeArchive.archive,
  })
  return {
    archiveBytes: runtimeArchive.archive.byteLength,
    ...stored,
    source: runtimeArchive.source,
  }
}

async function runGit(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {},
) {
  try {
    return await execFileAsync('git', args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      timeout: options.timeoutMs ?? 180_000,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (err) {
    const error = err as Error & { stderr?: string; stdout?: string; code?: string | number }
    let detail = (error.stderr || error.stdout || error.message || 'git command failed')
      .replace(/https:\/\/[^@\s]+@github\.com/gi, 'https://***@github.com')
      .slice(0, 600)
    for (const value of Object.values(options.env ?? {})) {
      if (value.length >= 8) detail = detail.split(value).join('***')
    }
    throw new Error(detail)
  }
}

async function createGitAskpassScript(dir: string) {
  const script = join(dir, 'git-askpass.sh')
  const body = [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "x-access-token" ;;',
    '  *) printf "%s\\n" "$SHADOWOB_GITHUB_TOKEN" ;;',
    'esac',
    '',
  ].join('\n')
  await writeFile(script, body, { encoding: 'utf8', mode: 0o700 })
  await chmod(script, 0o700).catch(() => {})
  return script
}

async function createGitHubBackup(options: {
  target: NormalizedGitHubBackupTarget
  archive: Buffer
  namespace: string
  agentId: string
  stamp: string
  onPhase?: (phase: CloudBackupPhase) => Promise<void>
}): Promise<{ artifact: string; commitSha: string; repository: string; branch: string }> {
  const target = options.target
  const root = await mkdtemp(join(tmpdir(), 'shadow-github-backup-'))
  try {
    const askpass = await createGitAskpassScript(root)
    const env = {
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      SHADOWOB_GITHUB_TOKEN: target.token,
    }
    const repoDir = join(root, 'repo')
    await runGit(['clone', '--depth', '1', '--branch', target.branch, target.cloneUrl, repoDir], {
      env,
      timeoutMs: 240_000,
    })
    await runGit(['config', 'user.name', 'Shadow Backup'], { cwd: repoDir, env })
    await runGit(['config', 'user.email', 'shadow-backup@shadowob.local'], { cwd: repoDir, env })

    const relativePath = safeGitBackupFilePath(target, {
      namespace: options.namespace,
      agentId: options.agentId,
      stamp: options.stamp,
    })
    const absolutePath = join(repoDir, ...relativePath.split('/'))
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, options.archive, { mode: 0o600 })

    await runGit(['add', '--', relativePath], { cwd: repoDir, env })
    await runGit(
      [
        'commit',
        '-m',
        `chore(shadow): backup ${options.namespace}/${options.agentId} ${options.stamp}`,
      ],
      { cwd: repoDir, env },
    )
    const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: repoDir, env })
    const commitSha = stdout.trim()
    await options.onPhase?.('git-pushing')
    await runGit(['push', 'origin', `HEAD:${target.branch}`], {
      cwd: repoDir,
      env,
      timeoutMs: 240_000,
    })
    return {
      artifact: githubBackupArtifactUri(target, relativePath),
      commitSha,
      repository: target.displayRepository,
      branch: target.branch,
    }
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
}

function sanitizeGitConnection(row: {
  id: string
  provider: string
  name: string
  accountLogin: string
  accountName: string | null
  scopes: unknown
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    accountLogin: row.accountLogin,
    accountName: row.accountName,
    scopes: row.scopes,
    lastUsedAt: toIsoString(row.lastUsedAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

async function githubApiJson<T>(
  container: AppContainer,
  path: string,
  token: string,
  options: { method?: string; maxBytes?: number } = {},
): Promise<{ data: T; scopes: string | null }> {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`
  const { buffer, response } = await container.resolve('safeHttpClient').fetchBuffer(
    url,
    {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'shadowob-server',
      },
      redirect: 'manual',
    },
    { maxRedirects: 0, maxBytes: options.maxBytes ?? 512 * 1024 },
  )
  return {
    data: JSON.parse(buffer.toString('utf8')) as T,
    scopes: response.headers.get('x-oauth-scopes'),
  }
}

async function fetchGitHubConnectionProfile(container: AppContainer, token: string) {
  const { data, scopes } = await githubApiJson<{
    login?: string
    name?: string | null
    id?: number
  }>(container, '/user', token)
  if (!data.login) throw new Error('GitHub token did not return an account login')
  return {
    accountLogin: data.login,
    accountName: data.name ?? null,
    scopes: {
      raw: scopes ?? '',
      scopes: scopes
        ? scopes
            .split(',')
            .map((scope) => scope.trim())
            .filter(Boolean)
        : [],
    },
  }
}

async function resolveGitHubConnectionToken(options: {
  container: AppContainer
  userId: string
  connectionId?: string
  token?: string
}) {
  const token = options.token?.trim()
  if (token) return { token, connection: null }
  if (!options.connectionId) {
    throw new Error('GitHub connection or token is required')
  }
  const connection = await options.container
    .resolve('cloudGitConnectionDao')
    .findByIdForUser(options.connectionId, options.userId)
  if (!connection) throw Object.assign(new Error('GitHub connection not found'), { status: 404 })
  return { token: decrypt(connection.tokenEncrypted), connection }
}

async function normalizeGitHubBackupTargetForUser(options: {
  container: AppContainer
  userId: string
  target: GitHubBackupTarget
}): Promise<NormalizedGitHubBackupTarget> {
  const resolved = await resolveGitHubConnectionToken({
    container: options.container,
    userId: options.userId,
    connectionId: options.target.connectionId,
    token: options.target.token,
  })
  if (resolved.connection) {
    await options.container
      .resolve('cloudGitConnectionDao')
      .touch(resolved.connection.id, options.userId)
      .catch(() => null)
  }
  return normalizeGitHubBackupTarget({ ...options.target, token: resolved.token })
}

async function listGitHubRepositories(options: {
  container: AppContainer
  token: string
  page?: number
}) {
  const page = Math.max(1, Math.min(10, options.page ?? 1))
  const { data } = await githubApiJson<
    Array<{
      full_name: string
      private: boolean
      default_branch: string
      pushed_at: string | null
      permissions?: { pull?: boolean; push?: boolean; admin?: boolean }
    }>
  >(
    options.container,
    `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
    options.token,
    { maxBytes: 1024 * 1024 },
  )
  return data.map((repo) => ({
    repository: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
    permissions: repo.permissions ?? null,
  }))
}

async function readGitHubTemplateContent(options: {
  container: AppContainer
  token: string
  repository: string
  branch?: string
  path?: string
}) {
  const repo = parseGitHubRepository(options.repository)
  const path = (options.path?.trim() || 'shadowob-cloud.json').replace(/^\/+/, '')
  if (!/^[A-Za-z0-9._/-]{1,512}$/.test(path) || path.split('/').includes('..')) {
    throw new Error('GitHub template path contains unsupported characters')
  }
  const ref = options.branch?.trim()
  const qs = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  const { data } = await githubApiJson<{
    type?: string
    encoding?: string
    content?: string
    sha?: string
    html_url?: string
  }>(
    options.container,
    `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}${qs}`,
    options.token,
    { maxBytes: 512 * 1024 },
  )
  if (data.type !== 'file' || data.encoding !== 'base64' || !data.content) {
    throw new Error('GitHub template path does not point to a base64 file')
  }
  const raw = Buffer.from(data.content.replace(/\s+/g, ''), 'base64').toString('utf8')
  if (Buffer.byteLength(raw, 'utf8') > 256 * 1024) {
    throw Object.assign(new Error('GitHub template file is too large'), { status: 413 })
  }
  const parsed = JSON.parse(raw) as unknown
  if (!isRecord(parsed)) throw new Error('GitHub template file must contain a JSON object')
  const content = validateTemplateContentForWrite(parsed)
  return {
    repository: repo.displayRepository,
    branch: options.branch?.trim() || undefined,
    path,
    sha: data.sha ?? null,
    url: data.html_url ?? null,
    content,
  }
}

async function readGitHubBackupArchive(options: {
  target: ParsedGitHubBackupArtifact
  token: string
}): Promise<Buffer> {
  const root = await mkdtemp(join(tmpdir(), 'shadow-github-restore-'))
  try {
    const askpass = await createGitAskpassScript(root)
    const env = {
      GIT_ASKPASS: askpass,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      SHADOWOB_GITHUB_TOKEN: options.token,
    }
    const repoDir = join(root, 'repo')
    await runGit(
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        options.target.branch,
        options.target.cloneUrl,
        repoDir,
      ],
      {
        env,
        timeoutMs: 240_000,
      },
    )
    return await readFile(join(repoDir, ...options.target.path.split('/')))
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
}

async function restoreObjectStoreBackup(options: {
  container: AppContainer
  deployment: CloudBackupDeployment
  backup: CloudBackupRecord
  kubeconfig?: string
}): Promise<{ archiveBytes: number }> {
  if (!options.backup.objectKey) throw new Error('Object backup key is missing')
  const storedArchive = await options.container
    .resolve('mediaService')
    .getPrivateObjectBuffer(options.backup.objectKey)
  if (!storedArchive) throw new Error('Object backup artifact is missing from storage')
  const archive = decryptObjectBackupArchiveIfNeeded(storedArchive)

  const helperPod = backupHelperPodName(options.backup.id, 'restore')
  await createStatePvcHelperPod({
    namespace: options.deployment.namespace,
    podName: helperPod,
    pvcName: options.backup.pvcName,
    kubeconfig: options.kubeconfig,
  })
  try {
    await writeStateArchiveToPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      archive,
      kubeconfig: options.kubeconfig,
      kubernetesOpsGateway: options.container.resolve('kubernetesOpsGateway'),
    })
    return { archiveBytes: archive.byteLength }
  } finally {
    await deleteStatePvcHelperPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      kubeconfig: options.kubeconfig,
    })
  }
}

async function restoreArchiveToRuntimeStatePvc(options: {
  container: AppContainer
  deployment: CloudBackupDeployment
  backup: CloudBackupRecord
  archive: Buffer
  kubeconfig?: string
}) {
  const helperPod = backupHelperPodName(options.backup.id, 'restore')
  await createStatePvcHelperPod({
    namespace: options.deployment.namespace,
    podName: helperPod,
    pvcName: options.backup.pvcName,
    kubeconfig: options.kubeconfig,
  })
  try {
    await writeStateArchiveToPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      archive: options.archive,
      kubeconfig: options.kubeconfig,
      kubernetesOpsGateway: options.container.resolve('kubernetesOpsGateway'),
    })
    return { archiveBytes: options.archive.byteLength }
  } finally {
    await deleteStatePvcHelperPod({
      namespace: options.deployment.namespace,
      podName: helperPod,
      kubeconfig: options.kubeconfig,
    })
  }
}

async function restoreGitHubBackup(options: {
  container: AppContainer
  deployment: CloudBackupDeployment
  backup: CloudBackupRecord
  token: string
  kubeconfig?: string
}) {
  if (!options.backup.objectKey) throw new Error('GitHub backup objectKey is missing')
  const target = parseGitHubBackupArtifact(options.backup.objectKey)
  const storedArchive = await readGitHubBackupArchive({ target, token: options.token })
  const archive = decryptObjectBackupArchiveIfNeeded(storedArchive)
  return restoreArchiveToRuntimeStatePvc({ ...options, archive })
}

async function createPreRestoreSafetyBackup(options: {
  container: AppContainer
  deploymentDao: CloudDeploymentDao
  backupDao: CloudDeploymentBackupDao
  deployment: CloudBackupDeployment & { id: string; userId: string }
  sourceBackup: CloudBackupRecord
  target: RuntimeStateTarget
  kubeconfig?: string
}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safetyBackup = await options.backupDao.create({
    userId: options.deployment.userId,
    deploymentId: options.deployment.id,
    namespace: options.deployment.namespace,
    agentId: options.sourceBackup.agentId,
    sandboxName: options.sourceBackup.agentId,
    pvcName: options.sourceBackup.pvcName,
    driver: 'restic',
    objectKey: objectBackupKey(options.deployment.id, options.sourceBackup.agentId, stamp),
    status: 'running',
    phase: 'object-archiving',
    expiresAt: expiresAtFromRetentionDays(30),
  })
  if (!safetyBackup) throw new Error('Failed to create pre-restore safety backup record')

  try {
    await options.deploymentDao.appendLog(
      options.deployment.id,
      `[restore] Creating safety backup ${safetyBackup.id} before replacing state`,
      'info',
    )
    const result = await createObjectStoreBackup({
      container: options.container,
      deployment: options.deployment,
      backup: safetyBackup,
      target: options.target,
      kubeconfig: options.kubeconfig,
      onPhase: async (phase) => {
        await options.backupDao.updatePhase(safetyBackup.id, phase)
      },
    })
    await options.backupDao.updateStatus(safetyBackup.id, 'succeeded')
    await options.deploymentDao.appendLog(
      options.deployment.id,
      `[restore] Safety backup ${safetyBackup.id} is ready (${result.archiveBytes} bytes from ${result.source})`,
      'info',
    )
    return safetyBackup
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await options.backupDao.updateStatus(safetyBackup.id, 'failed', message).catch(() => null)
    throw new Error(`Pre-restore safety backup failed: ${message}`)
  }
}

function sanitizeCloudSaasDeploymentWithBlocker<
  T extends Parameters<typeof sanitizeCloudSaasDeployment>[0] & BlockingDeploymentRow,
>(deployment: T, rows: T[]) {
  const blocker = findBlockingDeployment(deployment, rows)
  const shadowTarget = extractShadowProvisionTarget(deployment.configSnapshot)
  return {
    ...sanitizeCloudSaasDeploymentForResponse(deployment),
    shadowServerId: shadowTarget.serverId,
    shadowChannelId: shadowTarget.channelId,
    blockedBy: blocker
      ? {
          id: blocker.id,
          namespace: blocker.namespace,
          status: blocker.status,
          createdAt: blocker.createdAt?.toISOString?.() ?? null,
          updatedAt: blocker.updatedAt?.toISOString?.() ?? null,
        }
      : null,
  }
}

function sanitizeCloudSaasDeploymentForResponse<
  T extends Parameters<typeof sanitizeCloudSaasDeployment>[0],
>(deployment: T) {
  return attachCloudProvisionedBuddies(deployment, sanitizeCloudSaasDeployment(deployment))
}

function newestVisibleDeploymentsByNamespace<
  T extends {
    namespace: string
    status: string
    errorMessage?: string | null
    updatedAt?: Date | null
    createdAt?: Date | null
  },
>(rows: T[]): T[] {
  const byNamespace = new Map<string, T>()
  for (const row of rows) {
    if (!isVisibleDeploymentStatus(row.status, row.errorMessage)) continue
    const existing = byNamespace.get(row.namespace)
    const rowTime = deploymentCreatedTime(row)
    const existingTime = existing ? deploymentCreatedTime(existing) : 0
    if (!existing || rowTime >= existingTime) {
      byNamespace.set(row.namespace, row)
    }
  }
  return [...byNamespace.values()].sort((left, right) => {
    const leftTime = deploymentCreatedTime(left)
    const rightTime = deploymentCreatedTime(right)
    return rightTime - leftTime
  })
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createSseStreamWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal,
) {
  const encoder = new TextEncoder()
  let closed = false

  const close = () => {
    if (closed) return
    closed = true
    try {
      controller.close()
    } catch {
      /* already closed */
    }
  }

  signal.addEventListener('abort', close, { once: true })

  return {
    close,
    isClosed: () => closed || signal.aborted,
    send: (data: unknown, event?: string) => {
      if (closed || signal.aborted) return false
      try {
        controller.enqueue(
          encoder.encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`),
        )
        return true
      } catch {
        closed = true
        return false
      }
    },
  }
}

function publicDiyStreamError(err: unknown) {
  const message =
    err instanceof Error ? err.message : 'DIY Cloud generation stream failed. Please retry.'
  if (/failed query|insert into|update .* set|select .* from|params:/i.test(message)) {
    return 'DIY Cloud generation failed while saving progress. Please retry.'
  }
  return message.length > 600 ? `${message.slice(0, 597)}...` : message
}

function requestOrigin(c: Context): string | undefined {
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
  if (host) {
    const proto = c.req.header('x-forwarded-proto') ?? 'http'
    return `${proto}://${host}`
  }
  try {
    return new URL(c.req.url).origin
  } catch {
    return undefined
  }
}

async function enforceCloudDeployStarterBalance(
  container: AppContainer,
  userId: string,
  hourlyCost: number,
) {
  if (hourlyCost <= 0) return

  const requiredAmount = hourlyCost
  const walletService = container.resolve('walletService')
  const wallet = await walletService.getWallet(userId)
  const balance = wallet?.balance ?? 0
  if (balance >= requiredAmount) return

  throw Object.assign(new Error('Insufficient balance'), {
    status: 402,
    code: 'WALLET_INSUFFICIENT_BALANCE',
    requiredAmount,
    balance,
    shortfall: Math.max(requiredAmount - balance, 0),
    nextAction: 'earn_or_recharge',
  })
}

type DeploymentRuntimeAction = 'pause' | 'resume'
type CloudDeploymentRecord = typeof cloudDeployments.$inferSelect

type DeploymentRuntimeTransitionResult = {
  body: Record<string, unknown>
  status: ContentfulStatusCode
}

function runtimeTransitionFailure(
  status: ContentfulStatusCode,
  error: string,
  details: Record<string, unknown> = {},
): DeploymentRuntimeTransitionResult {
  return { status, body: { ok: false, error, ...details } }
}

function runtimeTransitionBillingError(err: unknown): DeploymentRuntimeTransitionResult | null {
  const billingError = err as {
    status?: number
    code?: string
    requiredAmount?: number
    balance?: number
    shortfall?: number
    nextAction?: string
  }
  if (billingError.status !== 402) return null
  return runtimeTransitionFailure(
    402,
    err instanceof Error ? err.message : 'Insufficient balance',
    {
      code: billingError.code,
      requiredAmount: billingError.requiredAmount,
      balance: billingError.balance,
      shortfall: billingError.shortfall,
      nextAction: billingError.nextAction,
    },
  )
}

async function transitionDeploymentRuntime(input: {
  container: AppContainer
  actor: Actor
  userId: string
  deployment: CloudDeploymentRecord
  action: DeploymentRuntimeAction
  requestedAgentId?: string
}): Promise<DeploymentRuntimeTransitionResult> {
  const { action, actor, container, deployment, requestedAgentId, userId } = input
  const dao = container.resolve('cloudDeploymentDao')
  const current = await dao.findLatestCurrentInNamespace({
    userId,
    clusterId: deployment.clusterId,
    namespace: deployment.namespace,
  })
  if (!current || current.id !== deployment.id) {
    return runtimeTransitionFailure(409, `Cannot ${action} a historical deployment instance`)
  }

  if (!(await dao.tryAcquireOperationLock(deployment))) {
    return runtimeTransitionFailure(
      409,
      'Another deployment operation is already running in this namespace',
    )
  }

  const completedStatus = action === 'pause' ? 'paused' : 'deployed'
  const allowedStatuses = action === 'pause' ? ['deployed', 'resuming'] : ['paused', 'resuming']
  const agentIds = resolveDeploymentAgentIds(deployment, requestedAgentId)

  try {
    const lockedCurrent = await dao.findLatestCurrentInNamespace({
      userId,
      clusterId: deployment.clusterId,
      namespace: deployment.namespace,
    })
    if (!lockedCurrent || lockedCurrent.id !== deployment.id) {
      return runtimeTransitionFailure(409, `Cannot ${action} a historical deployment instance`)
    }
    if (lockedCurrent.status === completedStatus) {
      return {
        status: 200,
        body: {
          ok: true,
          status: completedStatus,
          deployment: sanitizeCloudSaasDeploymentForResponse(lockedCurrent),
        },
      }
    }
    if (!allowedStatuses.includes(lockedCurrent.status)) {
      return runtimeTransitionFailure(
        422,
        `Cannot ${action} deployment in status "${lockedCurrent.status}"`,
      )
    }

    if (action === 'resume') {
      try {
        await enforceCloudDeployStarterBalance(container, userId, lockedCurrent.hourlyCost ?? 0)
      } catch (err) {
        const billingResult = runtimeTransitionBillingError(err)
        if (billingResult) return billingResult
        throw err
      }
    }

    const workingStatus = action === 'resume' ? 'resuming' : lockedCurrent.status
    if (action === 'resume') {
      const resuming = await dao.updateStatusIfStatus(
        deployment.id,
        lockedCurrent.status,
        'resuming',
      )
      if (!resuming) {
        return runtimeTransitionFailure(409, 'Resume was superseded by a newer lifecycle action')
      }
    }

    await dao.appendLog(
      deployment.id,
      `[${action}] User requested ${action} for agents ${formatDeploymentAgentIds(agentIds)}`,
      'info',
    )
    const kubeconfig = await resolveDeploymentKubeconfig(container, lockedCurrent)
    const replicas = action === 'pause' ? 0 : 1
    await Promise.all(
      agentIds.map((agentId) =>
        scaleAgentSandboxAsync(deployment.namespace, agentId, replicas, kubeconfig),
      ),
    )
    await Promise.all(
      agentIds.map((agentId) =>
        action === 'pause'
          ? waitForAgentSandboxPaused({
              namespace: deployment.namespace,
              agentName: agentId,
              kubeconfig,
              timeoutMs: 120_000,
            })
          : waitForAgentSandboxReady({
              namespace: deployment.namespace,
              agentName: agentId,
              kubeconfig,
              timeoutMs: 180_000,
            }),
      ),
    )
    const updated = await dao.updateStatusIfStatus(
      deployment.id,
      workingStatus,
      completedStatus,
      action === 'pause' ? CLOUD_COMPUTER_MANUAL_PAUSE_REASON : undefined,
    )
    if (!updated) {
      return runtimeTransitionFailure(
        409,
        `${action === 'pause' ? 'Pause' : 'Resume'} was superseded by a newer lifecycle action`,
      )
    }
    if (action === 'resume') await dao.updateLastHourlyBilledAt(deployment.id, new Date())
    await container.resolve('cloudSaasUseCase').logActivity({
      ctx: createActorContext(actor),
      userId,
      type: 'scale',
      namespace: deployment.namespace,
      meta: { deploymentId: deployment.id, operation: action, agentIds },
    })

    return {
      status: 200,
      body: {
        ok: true,
        status: completedStatus,
        deployment: sanitizeCloudSaasDeploymentForResponse(updated),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await dao.appendLog(deployment.id, `[${action}] Failed: ${message}`, 'error')
    if (action === 'resume') await dao.failIfStatus(deployment.id, 'resuming', message)
    return runtimeTransitionFailure(502, message)
  } finally {
    await dao.releaseOperationLock(deployment).catch(() => {})
  }
}

function addProviderManagedEnvKeys(keys: Set<string>, provider: ProviderCatalogView): void {
  keys.add(provider.envKey)
  for (const alias of provider.envKeyAliases ?? []) keys.add(alias)
  if (provider.baseUrlEnvKey) keys.add(provider.baseUrlEnvKey)
  if (provider.modelEnvKey) keys.add(provider.modelEnvKey)
}

async function collectAllowedDeploymentEnvKeys(configSnapshot: unknown): Promise<Set<string>> {
  const [runtimeEnvRequirements, envRefPolicy] = await Promise.all([
    collectRuntimeEnvRequirements(configSnapshot),
    collectRuntimeEnvRefPolicy(configSnapshot),
  ])
  return new Set([
    ...runtimeEnvRequirements,
    ...extractRequiredEnvVars(configSnapshot, envRefPolicy),
  ])
}

export function createCloudSaasHandler(container: AppContainer) {
  const h = new Hono()
  const diyRateLimit = createRateLimitMiddleware({
    namespace: 'cloud-diy',
    windowMs: 60_000,
    limit: 12,
    keyGenerator: (c) => c.get('user')?.userId ?? 'anonymous',
  })

  h.use('*', authMiddleware)

  h.get('/github/connections', async (c) => {
    const user = c.get('user') as { userId: string }
    const connections = await container.resolve('cloudGitConnectionDao').listByUser(user.userId)
    return c.json({ connections: connections.map(sanitizeGitConnection) })
  })

  h.post('/github/connections', zValidator('json', githubConnectionCreateSchema), async (c) => {
    const user = c.get('user') as { userId: string }
    const input = c.req.valid('json')
    let profile: Awaited<ReturnType<typeof fetchGitHubConnectionProfile>>
    try {
      profile = await fetchGitHubConnectionProfile(container, input.token)
    } catch (err) {
      const status = (err as { status?: number }).status ?? 422
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : 'GitHub connection failed' },
        { status: status as 400 | 401 | 403 | 404 | 422 | 500 },
      )
    }
    const dao = container.resolve('cloudGitConnectionDao')
    const name = input.name?.trim() || profile.accountLogin
    const tokenEncrypted = encrypt(input.token)
    const row = input.connectionId
      ? await dao.updateToken(input.connectionId, user.userId, {
          name,
          accountLogin: profile.accountLogin,
          accountName: profile.accountName,
          tokenEncrypted,
          scopes: profile.scopes,
        })
      : await dao.create({
          userId: user.userId,
          name,
          accountLogin: profile.accountLogin,
          accountName: profile.accountName,
          tokenEncrypted,
          scopes: profile.scopes,
        })
    if (!row) return c.json({ ok: false, error: 'GitHub connection not found' }, 404)
    return c.json(
      { ok: true, connection: sanitizeGitConnection(row) },
      input.connectionId ? 200 : 201,
    )
  })

  h.delete('/github/connections/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const deleted = await container
      .resolve('cloudGitConnectionDao')
      .delete(c.req.param('id'), user.userId)
    if (!deleted) return c.json({ ok: false, error: 'GitHub connection not found' }, 404)
    return c.json({ ok: true })
  })

  h.get('/github/repositories', async (c) => {
    const user = c.get('user') as { userId: string }
    const connectionId = c.req.query('connectionId')
    if (!connectionId) return c.json({ ok: false, error: 'Missing connectionId' }, 400)
    const page = Number(c.req.query('page') ?? '1')
    const resolved = await resolveGitHubConnectionToken({
      container,
      userId: user.userId,
      connectionId,
    })
    const repositories = await listGitHubRepositories({
      container,
      token: resolved.token,
      page: Number.isFinite(page) ? page : 1,
    })
    if (resolved.connection) {
      await container.resolve('cloudGitConnectionDao').touch(resolved.connection.id, user.userId)
    }
    return c.json({ repositories })
  })

  h.post('/github/template-preview', zValidator('json', githubTemplatePreviewSchema), async (c) => {
    const user = c.get('user') as { userId: string }
    const input = c.req.valid('json')
    const resolved = await resolveGitHubConnectionToken({
      container,
      userId: user.userId,
      connectionId: input.connectionId,
    })
    const preview = await readGitHubTemplateContent({
      container,
      token: resolved.token,
      repository: input.repository,
      branch: input.branch,
      path: input.path,
    })
    if (resolved.connection) {
      await container.resolve('cloudGitConnectionDao').touch(resolved.connection.id, user.userId)
    }
    return c.json({ ok: true, template: preview })
  })

  async function authorizeDiyGeneration(
    useCase: CloudSaasUseCase,
    userId: string,
    input: z.infer<typeof diyCloudGenerateSchema>,
  ) {
    await container.resolve('membershipService').requireMember(userId, 'cloud:diy_generate')
    const payloadLimits = validateJsonLimits(input, {
      maxBytes: 80 * 1024,
      maxDepth: 9,
      maxObjectKeys: 560,
      maxArrayItems: 160,
    })
    if (!payloadLimits.ok) {
      throw Object.assign(new Error(payloadLimits.error), {
        status: 413,
        code: 'DIY_CLOUD_PAYLOAD_LIMIT_EXCEEDED',
      })
    }
    const budget = estimateDiyCloudInputBudget(input)
    if (budget.estimatedTokens > DIY_CLOUD_MAX_ESTIMATED_TOKENS) {
      throw Object.assign(new Error('DIY Cloud prompt is too large'), {
        status: 413,
        code: 'DIY_CLOUD_TOKEN_BUDGET_EXCEEDED',
        params: {
          estimatedTokens: budget.estimatedTokens,
          maxEstimatedTokens: DIY_CLOUD_MAX_ESTIMATED_TOKENS,
        },
      })
    }
    const limit = await diyCloudDailyLimit()
    if (limit !== null) {
      const usedToday = await useCase.countActivityByUserTypeSince({
        ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
        userId,
        type: 'diy_generate',
        since: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      if (usedToday >= limit) {
        throw Object.assign(new Error('DIY Cloud daily generation quota exceeded'), {
          status: 429,
          code: 'DIY_CLOUD_DAILY_QUOTA_EXCEEDED',
          params: { limit },
        })
      }
    }
    await useCase.logActivity({
      ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
      userId,
      type: 'diy_generate',
      meta: {
        estimatedTokens: budget.estimatedTokens,
        characters: budget.characters,
        hasPreviousConfig: Boolean(input.previousConfig),
      },
    })
    return budget
  }

  async function loadGroupNameLookup(
    useCase: CloudSaasUseCase,
    userId: string,
  ): Promise<Map<string, string>> {
    const groups = await useCase.listEnvGroupsByUser({
      ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
    })
    return new Map(groups.map((group: { id: string; name: string }) => [group.id, group.name]))
  }

  async function resolveGroupId(
    useCase: CloudSaasUseCase,
    userId: string,
    groupName?: string | null,
  ): Promise<string | null> {
    if (!groupName || groupName === 'default') return null

    const existing = await useCase.findEnvGroupByName({
      ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
      name: groupName,
    })
    if (existing) return existing.id

    const created = await useCase.createEnvGroup({
      ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
      name: groupName,
    })
    return created?.id ?? null
  }

  async function readProviderProfiles(
    useCase: CloudSaasUseCase,
    userId: string,
  ): Promise<ProviderProfileView[]> {
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
    })
    const byScope = new Map<string, typeof vars>()
    for (const variable of vars) {
      if (!variable.scope.startsWith(PROVIDER_PROFILE_SCOPE_PREFIX)) continue
      const scoped = byScope.get(variable.scope) ?? []
      scoped.push(variable)
      byScope.set(variable.scope, scoped)
    }

    const profiles: ProviderProfileView[] = []
    for (const [scope, scopedVars] of byScope) {
      const values = new Map<string, string>()
      for (const variable of scopedVars) {
        const decrypted = safeDecryptProviderValue(variable.encryptedValue, scope, variable.key)
        if (decrypted !== null) values.set(variable.key, decrypted)
      }
      const fallbackId = scope.slice(PROVIDER_PROFILE_SCOPE_PREFIX.length)
      const id = values.get(PROVIDER_PROFILE_META_KEYS.id) ?? fallbackId
      const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId) ?? ''
      const name = values.get(PROVIDER_PROFILE_META_KEYS.name) ?? (providerId || id)
      const enabled = parseProviderProfileEnabled(values.get(PROVIDER_PROFILE_META_KEYS.enabled))
      if (!id || !providerId) continue

      profiles.push({
        id,
        providerId,
        name,
        scope,
        enabled,
        config: sanitizeStoredProviderProfileConfig(
          parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson)),
        ),
        envVars: scopedVars
          .filter((v) => !isProviderProfileMetaKey(v.key))
          .map((v) => ({
            key: v.key,
            maskedValue: '****',
            isSecret: true,
          })),
        updatedAt: scopedVars
          .map((v) => v.updatedAt?.toISOString())
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1),
      })
    }

    return profiles.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function readProviderRuntimeProfiles(
    useCase: CloudSaasUseCase,
    userId: string,
    profileIds?: string[],
  ): Promise<ProviderRuntimeProfile[]> {
    const requestedIds =
      profileIds && profileIds.length > 0
        ? new Set(profileIds.map(normalizeProviderProfileId))
        : null
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
    })
    const catalogs = (await listProviderCatalogs()).map((entry) => entry.provider)
    const byScope = new Map<string, typeof vars>()
    for (const variable of vars) {
      if (!variable.scope.startsWith(PROVIDER_PROFILE_SCOPE_PREFIX)) continue
      const scoped = byScope.get(variable.scope) ?? []
      scoped.push(variable)
      byScope.set(variable.scope, scoped)
    }

    const profiles: ProviderRuntimeProfile[] = []
    for (const [scope, scopedVars] of byScope) {
      const values = new Map<string, string>()
      for (const variable of scopedVars) {
        const decrypted = safeDecryptProviderValue(variable.encryptedValue, scope, variable.key)
        if (decrypted !== null) values.set(variable.key, decrypted)
      }

      const fallbackId = scope.slice(PROVIDER_PROFILE_SCOPE_PREFIX.length)
      const id = normalizeProviderProfileId(values.get(PROVIDER_PROFILE_META_KEYS.id) ?? fallbackId)
      if (!id || (requestedIds && !requestedIds.has(id))) continue
      if (!parseProviderProfileEnabled(values.get(PROVIDER_PROFILE_META_KEYS.enabled))) continue

      const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId) ?? ''
      const provider = catalogs.find((catalog) => catalog.id === providerId)
      if (!provider) continue

      const rawConfig = parseProviderProfileConfig(
        values.get(PROVIDER_PROFILE_META_KEYS.configJson),
      )
      const config = sanitizeStoredProviderProfileConfig(rawConfig)
      const apiKey = firstProviderApiKey(provider, values)
      const baseUrl = providerProfileBaseUrl(provider, values, config)
      const models = normalizeProviderProfileModels(config)
      if (!apiKey || !baseUrl || models.length === 0) continue
      await assertSafeHttpUrl(baseUrl)

      const name = values.get(PROVIDER_PROFILE_META_KEYS.name) ?? providerId
      profiles.push({
        id,
        providerId,
        name,
        provider,
        values,
        apiKey,
        baseUrl,
        models,
      })
    }

    return profiles.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function resolveCreateRuntimeEnvVars(
    useCase: CloudSaasUseCase,
    userId: string,
    inputEnvVars: Record<string, string> | undefined,
    configSnapshot: unknown,
    requestAuthHeader: string | undefined,
    fallbackOrigin: string | undefined,
    options: {
      templateSlug?: string | null
      namespace?: string | null
      modelProviderMode?: CloudStoreModelProviderMode | null
    } = {},
  ): Promise<Record<string, string>> {
    for (const key of Object.keys(inputEnvVars ?? {})) {
      if (isReservedRuntimeEnvKey(key)) {
        throw Object.assign(
          new Error(`User env cannot override reserved runtime env var: ${key}`),
          {
            status: 422,
          },
        )
      }
    }
    const envVars: Record<string, string> = {}
    // This value is persisted for agent pods; host-side provisioning resolves
    // a process-reachable control-plane URL in resolveCloudSaasShadowRuntime.
    const shadowServerUrl =
      process.env.SHADOWOB_AGENT_SERVER_URL ?? process.env.SHADOWOB_SERVER_URL ?? fallbackOrigin

    if (shadowServerUrl) envVars.SHADOWOB_SERVER_URL = shadowServerUrl

    const needsSavedLookup = Object.values(inputEnvVars ?? {}).some(
      (value) => value === '__SAVED__',
    )
    const [runtimeEnvRequirements, envRefPolicy] = await Promise.all([
      collectRuntimeEnvRequirements(configSnapshot),
      collectRuntimeEnvRefPolicy(configSnapshot),
    ])
    const usesModelProvider = configUsesPlugin(configSnapshot, 'model-provider')
    const explicitProviderProfileIds = [...collectProviderProfileIds(configSnapshot)]
      .map(normalizeProviderProfileId)
      .filter(Boolean)
    const officialRuntimeServerUrl = resolveOfficialModelProxyRuntimeServerUrl({
      shadowServerUrl,
    })
    const modelProviderMode = resolveModelProviderMode({
      configSnapshot,
      explicitProviderProfileIds,
      modelProviderMode: options.modelProviderMode,
      runtimeServerUrl: officialRuntimeServerUrl.runtimeServerUrl,
      usesModelProvider,
    })
    const usesOfficialModelProxy = usesModelProvider && modelProviderMode === 'official'
    if (usesOfficialModelProxy) {
      assertOfficialModelProxyAvailable(
        officialRuntimeServerUrl.runtimeServerUrl,
        officialRuntimeServerUrl.runtimeServerUrlRequirement,
      )
      const proxyEnvVars = officialModelProxyEnvVars({
        runtimeServerUrl: officialRuntimeServerUrl.runtimeServerUrl,
        runtimeServerUrlRequirement: officialRuntimeServerUrl.runtimeServerUrlRequirement,
        userId,
        templateSlug: options.templateSlug ?? undefined,
        namespace: options.namespace ?? undefined,
      })
      if (Object.keys(proxyEnvVars).length === 0) {
        const err = new Error('Official model provider is unavailable')
        ;(err as { status?: number }).status = 503
        throw err
      }
      Object.assign(envVars, proxyEnvVars)
    }
    const providerProfileIds = usesOfficialModelProxy
      ? []
      : explicitProviderProfileIds.length > 0
        ? explicitProviderProfileIds
        : usesModelProvider
          ? (await readProviderProfiles(useCase, userId))
              .filter((profile) => profile.enabled)
              .map((p) => p.id)
          : []
    const savedValues = new Map<string, string>()
    const providerProfileValues = new Map<string, string>()
    const providerProfileModelSets: Array<{
      providerId: string
      profileId: string
      models: ProviderProfileModelView[]
    }> = []
    const providerCatalogs =
      providerProfileIds.length > 0 || usesOfficialModelProxy
        ? (await listProviderCatalogs()).map((entry) => entry.provider)
        : []
    const providerManagedEnvKeys = new Set<string>([PROVIDER_PROFILE_MODELS_ENV_KEY])
    if (usesOfficialModelProxy) {
      for (const key of OFFICIAL_MODEL_PROXY_ENV_KEYS) providerManagedEnvKeys.add(key)
    }
    for (const provider of providerCatalogs)
      addProviderManagedEnvKeys(providerManagedEnvKeys, provider)

    if (usesModelProvider && providerProfileIds.length > 0) {
      const runtimeProfiles = await readProviderRuntimeProfiles(useCase, userId, providerProfileIds)
      const selectors = [...collectModelProviderSelectors(configSnapshot)]
      const selectedProfiles = selectRuntimeProviderProfiles(runtimeProfiles, selectors)
      if (selectedProfiles.length === 0) {
        const err = new Error('No enabled provider profile matches the requested model selector')
        ;(err as { status?: number }).status = 422
        throw err
      }

      for (const profile of selectedProfiles) {
        providerProfileValues.set(profile.apiKey.key, profile.apiKey.value)
        if (profile.provider.baseUrlEnvKey) {
          providerProfileValues.set(profile.provider.baseUrlEnvKey, profile.baseUrl)
        }
        for (const [key, value] of profile.values) {
          if (isProviderProfileMetaKey(key)) continue
          if (key === profile.apiKey.key) continue
          providerProfileValues.set(key, value)
        }
        providerProfileModelSets.push({
          providerId: profile.providerId,
          profileId: profile.id,
          models: profile.models,
        })
      }
    }

    if (needsSavedLookup || runtimeEnvRequirements.length > 0 || providerProfileIds.length > 0) {
      const globalVars = await useCase.listEnvVarsByUser({
        ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
        scope: 'global',
      })
      for (const variable of globalVars) {
        const decrypted = safeDecryptEnvValue(variable.encryptedValue, 'global', variable.key)
        if (decrypted !== null) savedValues.set(variable.key, decrypted)
      }
      for (const profileId of providerProfileIds) {
        if (usesModelProvider) continue
        const scopedVars = await useCase.listEnvVarsByUser({
          ctx: createActorContext({ kind: 'user', userId, authMethod: 'jwt', scopes: [] }),
          scope: providerProfileScope(profileId),
        })
        const scope = providerProfileScope(profileId)
        const values = new Map<string, string>()
        for (const variable of scopedVars) {
          const decrypted = safeDecryptProviderValue(variable.encryptedValue, scope, variable.key)
          if (decrypted !== null) values.set(variable.key, decrypted)
        }
        const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId)
        if (!parseProviderProfileEnabled(values.get(PROVIDER_PROFILE_META_KEYS.enabled))) continue
        const provider = providerCatalogs.find((catalog) => catalog.id === providerId)
        const config = sanitizeStoredProviderProfileConfig(
          parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson)),
        )
        const baseUrl = provider ? providerProfileBaseUrl(provider, values, config) : undefined
        if (provider?.baseUrlEnvKey && baseUrl) {
          await assertSafeHttpUrl(baseUrl)
          providerProfileValues.set(provider.baseUrlEnvKey, baseUrl)
        }
        const models = normalizeProviderProfileModels(config)
        if (provider && models.length > 0) {
          providerProfileModelSets.push({
            providerId: provider.id,
            profileId,
            models,
          })
        }
        const model = config.modelId ?? config.defaultModel ?? config.model
        if (provider?.modelEnvKey && typeof model === 'string' && model.trim()) {
          providerProfileValues.set(provider.modelEnvKey, model)
        }
        for (const variable of scopedVars) {
          if (isProviderProfileMetaKey(variable.key)) continue
          const value = values.get(variable.key)
          if (value !== undefined) providerProfileValues.set(variable.key, value)
        }
      }
      if (providerProfileModelSets.length > 0) {
        providerProfileValues.set(
          PROVIDER_PROFILE_MODELS_ENV_KEY,
          JSON.stringify(providerProfileModelSets),
        )
      }
    }

    const explicitKeys = new Set(Object.keys(inputEnvVars ?? {}))
    for (const key of runtimeEnvRequirements) {
      if (explicitKeys.has(key)) continue
      if (usesOfficialModelProxy && providerManagedEnvKeys.has(key)) continue
      if (
        usesModelProvider &&
        providerProfileIds.length > 0 &&
        providerManagedEnvKeys.has(key) &&
        !providerProfileValues.has(key)
      ) {
        continue
      }
      const value =
        providerProfileValues.get(key) ??
        savedValues.get(key) ??
        (shouldCopyServerRuntimeEnvKey(key) ? nonEmptyProcessEnv(key) : undefined)
      if (value !== undefined) envVars[key] = value
    }

    for (const [key, value] of providerProfileValues) {
      const shouldOverrideExplicit =
        usesModelProvider && providerManagedEnvKeys.has(key) && value !== undefined
      if ((!explicitKeys.has(key) || shouldOverrideExplicit) && value !== undefined) {
        envVars[key] = value
      }
    }

    for (const [key, value] of Object.entries(inputEnvVars ?? {})) {
      if (typeof value !== 'string') continue

      if (usesOfficialModelProxy && providerManagedEnvKeys.has(key)) continue

      if (usesModelProvider && providerManagedEnvKeys.has(key) && providerProfileValues.has(key)) {
        continue
      }

      if (value === '__SAVED__') {
        const savedValue = savedValues.get(key)
        if (savedValue !== undefined) envVars[key] = savedValue
        continue
      }

      if (value.trim() === '') continue
      envVars[key] = value
    }

    return applyRuntimeEnvRefPolicy(envVars, envRefPolicy)
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  h.get('/schema', async (c) => c.json(await getPrimarySchema()))

  h.get('/diy/plugins', diyRateLimit, async (c) => {
    const plugins = listDiyCloudPlugins()
    return c.json({ plugins })
  })

  h.get('/diy/plugins/search', diyRateLimit, async (c) => {
    const query = c.req.query('q') ?? ''
    return c.json({ plugins: searchDiyCloudPlugins(query) })
  })

  h.get('/diy/templates', diyRateLimit, async (c) => {
    return c.json({ templates: listDiyCloudTemplates() })
  })

  h.post('/diy/runs', diyRateLimit, zValidator('json', diyCloudGenerateSchema), async (c) => {
    const user = c.get('user') as { userId: string }
    const input = c.req.valid('json')
    const useCase = container.resolve('cloudSaasUseCase')
    await authorizeDiyGeneration(useCase, user.userId, input)
    const run = await container.resolve('diyCloudRunService').createRun(user.userId, input)
    return c.json(
      {
        runId: run.id,
        status: run.status,
        createdAt: run.createdAt,
        expiresAt: run.expiresAt,
        streamUrl: `/api/cloud-saas/diy/runs/${encodeURIComponent(run.id)}/stream`,
      },
      201,
    )
  })

  h.get('/diy/runs/:runId', diyRateLimit, async (c) => {
    const user = c.get('user') as { userId: string }
    const runId = c.req.param('runId')
    if (!runId) return c.json({ error: 'DIY Cloud generation run not found' }, 404)
    const runService = container.resolve('diyCloudRunService')
    const run = await runService.getRun(user.userId, runId)
    if (!run) return c.json({ error: 'DIY Cloud generation run not found' }, 404)
    const afterSeq = Math.max(Number(c.req.query('afterSeq')) || 0, 0)
    const events = await runService.listEvents(run.id, afterSeq)
    return c.json({
      run: {
        runId: run.id,
        input: run.input,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        expiresAt: run.expiresAt,
        draft: run.draft,
        error: run.error,
      },
      events: events.map((event) => event.payload),
    })
  })

  h.post('/diy/runs/:runId/cancel', diyRateLimit, async (c) => {
    const user = c.get('user') as { userId: string }
    const runId = c.req.param('runId')
    if (!runId) return c.json({ error: 'DIY Cloud generation run not found' }, 404)
    const runService = container.resolve('diyCloudRunService')
    const run = await runService.getRun(user.userId, runId)
    if (!run) return c.json({ error: 'DIY Cloud generation run not found' }, 404)
    const cancelled = await runService.cancelRun(user.userId, runId)
    return c.json({ ok: Boolean(cancelled), status: cancelled?.status ?? run.status })
  })

  h.post(
    '/diy/runs/:runId/feedback',
    diyRateLimit,
    zValidator('json', diyCloudRunFeedbackSchema),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const runId = c.req.param('runId')
      if (!runId) return c.json({ error: 'DIY Cloud generation run not found' }, 404)
      const runService = container.resolve('diyCloudRunService')
      const sourceRun = await runService.getRun(user.userId, runId)
      if (!sourceRun) return c.json({ error: 'DIY Cloud generation run not found' }, 404)

      const useCase = container.resolve('cloudSaasUseCase')
      const payload = c.req.valid('json')
      const sourceInput =
        sourceRun.input && typeof sourceRun.input === 'object' && !Array.isArray(sourceRun.input)
          ? (sourceRun.input as Record<string, unknown>)
          : {}
      const sourceDraft =
        sourceRun.draft && typeof sourceRun.draft === 'object' && !Array.isArray(sourceRun.draft)
          ? (sourceRun.draft as Record<string, unknown>)
          : {}
      const previousConfig =
        sourceDraft.cloudConfig &&
        typeof sourceDraft.cloudConfig === 'object' &&
        !Array.isArray(sourceDraft.cloudConfig)
          ? (sourceDraft.cloudConfig as Record<string, unknown>)
          : undefined
      const input = {
        prompt:
          payload.prompt ??
          (typeof sourceInput.prompt === 'string' ? sourceInput.prompt : 'Refine DIY Cloud run'),
        feedback: payload.feedback,
        previousConfig,
        locale:
          payload.locale ??
          (typeof sourceInput.locale === 'string' ? sourceInput.locale : undefined),
        timezone:
          payload.timezone ??
          (typeof sourceInput.timezone === 'string' ? sourceInput.timezone : undefined),
      }
      await authorizeDiyGeneration(useCase, user.userId, input)
      const nextRun = await runService.createRun(user.userId, input)
      return c.json(
        {
          runId: nextRun.id,
          sourceRunId: sourceRun.id,
          status: nextRun.status,
          createdAt: nextRun.createdAt,
          expiresAt: nextRun.expiresAt,
          streamUrl: `/api/cloud-saas/diy/runs/${encodeURIComponent(nextRun.id)}/stream`,
        },
        201,
      )
    },
  )

  h.get('/diy/runs/:runId/stream', diyRateLimit, async (c) => {
    const user = c.get('user') as { userId: string }
    const runId = c.req.param('runId')
    if (!runId) return c.json({ error: 'DIY Cloud generation run not found' }, 404)
    const afterSeq = Math.max(Number(c.req.query('afterSeq')) || 0, 0)
    const runService = container.resolve('diyCloudRunService')
    const initialRun = await runService.getRun(user.userId, runId)
    if (!initialRun) return c.json({ error: 'DIY Cloud generation run not found' }, 404)

    return c.body(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          let closed = false
          let sentSeq = afterSeq
          const send = (event: string, data: unknown) => {
            if (closed || c.req.raw.signal.aborted) return
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              )
            } catch {
              closed = true
            }
          }
          c.req.raw.signal.addEventListener(
            'abort',
            () => {
              closed = true
              try {
                controller.close()
              } catch {
                /* already closed */
              }
            },
            { once: true },
          )

          if (initialRun.status === 'pending') {
            void runService.startPendingRun(user.userId, runId).catch(() => false)
          }
          send('ping', {
            schemaVersion: 2,
            runId,
            timestamp: new Date().toISOString(),
          })
          let lastHeartbeatAt = Date.now()

          try {
            while (!closed && !c.req.raw.signal.aborted) {
              const events = await runService.listEvents(runId, sentSeq)
              for (const event of events) {
                send(event.type, event.payload)
                sentSeq = Math.max(sentSeq, event.seq)
              }

              if (Date.now() - lastHeartbeatAt > 10_000) {
                send('ping', {
                  schemaVersion: 2,
                  runId,
                  timestamp: new Date().toISOString(),
                })
                lastHeartbeatAt = Date.now()
              }

              const run = await runService.getRun(user.userId, runId)
              if (!run) {
                send('run.failed', {
                  schemaVersion: 2,
                  runId,
                  error: 'DIY Cloud generation run not found',
                  retryable: false,
                })
                break
              }

              if (run.status === 'completed') {
                const finalEvents = await runService.listEvents(runId, sentSeq)
                for (const event of finalEvents) {
                  send(event.type, event.payload)
                  sentSeq = Math.max(sentSeq, event.seq)
                }
                send('done', { ok: true, runId, status: run.status, lastSeq: sentSeq })
                break
              }
              if (run.status === 'failed' || run.status === 'cancelled') {
                const finalEvents = await runService.listEvents(runId, sentSeq)
                for (const event of finalEvents) {
                  send(event.type, event.payload)
                  sentSeq = Math.max(sentSeq, event.seq)
                }
                send(run.status === 'cancelled' ? 'run.cancelled' : 'run.failed', {
                  schemaVersion: 2,
                  runId,
                  error: run.error ?? (run.status === 'cancelled' ? 'Run cancelled' : 'Run failed'),
                  retryable: run.status !== 'cancelled',
                })
                break
              }

              await delay(500)
            }
          } catch (err) {
            send('run.failed', {
              schemaVersion: 2,
              runId,
              error: publicDiyStreamError(err),
              retryable: true,
            })
          } finally {
            closed = true
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          }
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    )
  })

  h.post('/validate', async (c) => {
    try {
      const config = await c.req.json<unknown>()
      return c.json(summarizeCloudConfigValidation(config))
    } catch (err) {
      return c.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : 'Invalid request',
        },
        400,
      )
    }
  })

  /**
   * GET /api/cloud-saas/templates
   * List all approved templates (official + community).
   * Supports optional `category`, `q` (search), and `locale` query params.
   */
  h.get('/templates', async (c) => {
    const category = c.req.query('category')
    const q = c.req.query('q')?.toLowerCase()
    const locale = c.req.query('locale') ?? 'en'
    const useCase = container.resolve('cloudSaasUseCase')
    let templates = (
      await useCase.listApprovedTemplates({ ctx: createActorContext(c.get('actor')) })
    ).filter((template) => isDeployableTemplateContent(template.content))
    if (category) {
      templates = templates.filter((t) => t.category === category)
    }
    const localized = templates.map((t) => localizeTemplateRecord(t, locale))
    if (q) {
      return c.json(
        localized.filter(
          (t) =>
            t.slug.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            (t.description ?? '').toLowerCase().includes(q) ||
            (t.tags as string[] | null)?.some((tag) => tag.toLowerCase().includes(q)),
        ),
      )
    }
    return c.json(localized)
  })

  /**
   * GET /api/cloud-saas/templates/mine
   * List templates authored by the current user (any review status).
   */
  h.get('/templates/mine', async (c) => {
    const useCase = container.resolve('cloudSaasUseCase')
    const templates = await useCase.listMyTemplates({ ctx: createActorContext(c.get('actor')) })
    return c.json(templates)
  })

  /**
   * GET /api/cloud-saas/templates/mine/:slug
   * Get a single template authored by the current user (any review status).
   */
  h.get('/templates/mine/:slug', async (c) => {
    const slug = c.req.param('slug')
    const useCase = container.resolve('cloudSaasUseCase')
    const template = await useCase.getMyTemplateBySlug({
      ctx: createActorContext(c.get('actor')),
      slug,
    })
    if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
    return c.json(template)
  })

  /**
   * GET /api/cloud-saas/templates/:slug
   * Get a single approved template by slug.
   */
  h.get('/templates/:slug', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const locale = c.req.query('locale') ?? 'en'
    const useCase = container.resolve('cloudSaasUseCase')
    const template = await useCase.getTemplateBySlug({
      ctx: createActorContext(c.get('actor')),
      slug,
    })
    if (!template || !canUseTemplate(template, user.userId)) {
      return c.json({ ok: false, error: 'Template not found' }, 404)
    }
    if (!isDeployableTemplateContent(template.content)) {
      return c.json({ ok: false, error: 'Template is not deployable' }, 422)
    }
    return c.json(localizeTemplateRecord(template, locale))
  })

  h.get('/templates/:slug/env-refs', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const useCase = container.resolve('cloudSaasUseCase')
    const template = await useCase.getTemplateBySlug({
      ctx: createActorContext(c.get('actor')),
      slug,
    })
    if (!template || !canUseTemplate(template, user.userId)) {
      return c.json({ ok: false, error: 'Template not found' }, 404)
    }
    if (!isDeployableTemplateContent(template.content)) {
      return c.json({ ok: false, error: 'Template is not deployable' }, 422)
    }
    const [envRefPolicy, fields, runtimeEnvVars] = await Promise.all([
      collectRuntimeEnvRefPolicy(template.content),
      collectRuntimeEnvFields(template.content),
      collectRuntimeEnvRequirements(template.content),
    ])
    const requiredEnvVars = extractRequiredEnvVars(template.content, envRefPolicy)
    const visibleKeys = new Set(fields.map((field) => field.key))
    const hiddenKeys = new Set(envRefPolicy.hiddenKeys)
    return c.json({
      template: slug,
      requiredEnvVars,
      fields,
      autoDetectedEnvVars: runtimeEnvVars
        .filter((key) => !visibleKeys.has(key) && !hiddenKeys.has(key))
        .sort(),
    })
  })

  /**
   * POST /api/cloud-saas/templates
   * Submit a new community template (pending review).
   */
  h.post(
    '/templates',
    zValidator(
      'json',
      z.object({
        slug: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase kebab-case'),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        content: z.record(z.unknown()),
        tags: z.array(z.string()).optional(),
        category: z.string().max(64).optional(),
        baseCost: z.number().int().min(0).optional(),
        githubSource: templateGithubSourceSchema.nullable(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      let content: Record<string, unknown>
      try {
        content = validateTemplateContentForWrite(input.content)
      } catch (err) {
        const status = (err as { status?: 413 | 422 }).status ?? 422
        return c.json({ ok: false, error: (err as Error).message }, status)
      }
      const useCase = container.resolve('cloudSaasUseCase')
      const result = await useCase.createTemplate({
        ctx: createActorContext(c.get('actor')),
        payload: { ...input, content },
      })
      if (!result.ok) {
        return c.json(
          { ok: false, error: result.error },
          ((result as { status?: number }).status ?? 409) as ContentfulStatusCode,
        )
      }
      return c.json(result.template, 201)
    },
  )

  /**
   * PUT /api/cloud-saas/templates/:slug
   * Update own community template (only if still pending or rejected).
   */
  h.put(
    '/templates/:slug',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        content: z.record(z.unknown()).optional(),
        tags: z.array(z.string()).optional(),
        category: z.string().max(64).optional(),
        baseCost: z.number().int().min(0).optional(),
        githubSource: templateGithubSourceSchema.nullable(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const slug = c.req.param('slug')
      const input = c.req.valid('json')
      let content: Record<string, unknown> | undefined
      if (input.content !== undefined) {
        try {
          content = validateTemplateContentForWrite(input.content)
        } catch (err) {
          const status = (err as { status?: 413 | 422 }).status ?? 422
          return c.json({ ok: false, error: (err as Error).message }, status)
        }
      }
      const useCase = container.resolve('cloudSaasUseCase')
      const result = await useCase.updateTemplate({
        ctx: createActorContext(c.get('actor')),
        slug,
        payload: { ...input, ...(content !== undefined && { content }) },
      })
      if (!result.ok) {
        return c.json(
          { ok: false, error: result.error },
          ((result as { status?: number }).status ?? 404) as ContentfulStatusCode,
        )
      }
      return c.json(result.template)
    },
  )

  /**
   * POST /api/cloud-saas/templates/:slug/submit
   * Re-submit a draft/rejected template for review.
   */
  h.post('/templates/:slug/submit', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const useCase = container.resolve('cloudSaasUseCase')
    const result = await useCase.submitTemplateForReview({
      ctx: createActorContext(c.get('actor')),
      slug,
    })
    if (!result.ok) {
      return c.json(
        { ok: false, error: result.error },
        ((result as { status?: number }).status ?? 404) as ContentfulStatusCode,
      )
    }
    return c.json(result.template)
  })

  /**
   * DELETE /api/cloud-saas/templates/:slug
   * Delete own community template (any review status).
   * If approved, also removes it from the community store.
   */
  h.delete('/templates/:slug', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const useCase = container.resolve('cloudSaasUseCase')
    const result = await useCase.deleteTemplate({
      ctx: createActorContext(c.get('actor')),
      slug,
    })
    if (!result.ok) {
      return c.json(
        { ok: false, error: result.error },
        ((result as { status?: number }).status ?? 404) as ContentfulStatusCode,
      )
    }
    return c.json({ ok: true })
  })

  // ─── Deployments ───────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/deployments
   * List current user's deployments (SaaS mode only).
   *
   * If `includeOrphans=1` is supplied, the response also includes a
   * `_orphans` array listing K8s namespaces tagged as managed by Shadow Cloud
   * but with no DB row for the current user. These are typically the result
   * of a DB reset or a worker bug; the dashboard surfaces them so the user
   * can claim or clean them up.
   */
  h.get('/deployments', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const includeOrphans = c.req.query('includeOrphans') === '1'
    const includeHistory = c.req.query('includeHistory') === '1'
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, user.userId))
      .orderBy(desc(cloudDeployments.updatedAt))
      .limit(limit)
      .offset(offset)

    const visibleRows = newestVisibleDeploymentsByNamespace(rows)
    const sanitizedRows = (includeHistory ? rows : visibleRows).map((row) =>
      sanitizeCloudSaasDeploymentWithBlocker(row, rows),
    )

    if (!includeOrphans) {
      return c.json(sanitizedRows)
    }

    // Orphan namespace discovery is a platform operation. A user-scoped diff
    // leaks other tenants' namespace names, so expose this only to platform admins
    // and compute orphan-ness against all deployment rows.
    await container.resolve('accessService').requirePlatformAdmin(c.get('actor'))
    const kubernetesOpsGateway = container.resolve('kubernetesOpsGateway')
    const cloudDeploymentDao = container.resolve('cloudDeploymentDao')
    const ns = await kubernetesOpsGateway.listManagedNamespaces()
    const ownership = await Promise.all(
      ns.map(async (namespace) => ({
        namespace,
        deployment: await cloudDeploymentDao.findByNamespaceAnyCluster(namespace),
      })),
    )
    const orphans = ownership.filter((item) => !item.deployment).map((item) => item.namespace)
    return c.json({ items: sanitizedRows, _orphans: orphans })
  })

  /**
   * GET /api/cloud-saas/deployments/costs
   * Aggregate cost snapshots for all visible SaaS deployments.
   */
  h.get('/deployments/costs', async (c) => {
    const user = c.get('user') as { userId: string }
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, user.userId))
      .orderBy(desc(cloudDeployments.updatedAt))

    const visibleRows = newestVisibleDeploymentsByNamespace(rows)
    const overview = await container.resolve('cloudUsageService').collectOverview(visibleRows)

    return c.json(overview)
  })

  /**
   * GET /api/cloud-saas/deployments/:id
   * Get deployment detail.
   */
  h.get('/deployments/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    if (deployment.status === 'deployed') {
      await container
        .resolve('greetingService')
        .ensureCloudDeploymentGreeting(user.userId, deployment)
        .catch(() => null)
    }
    const rows = await container
      .resolve('db')
      .select()
      .from(cloudDeployments)
      .where(
        and(
          eq(cloudDeployments.userId, user.userId),
          eq(cloudDeployments.namespace, deployment.namespace),
        ),
      )
      .orderBy(desc(cloudDeployments.createdAt))
    return c.json(sanitizeCloudSaasDeploymentWithBlocker(deployment, rows))
  })

  h.get('/deployments/:id/costs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const summary = await container.resolve('cloudUsageService').collectDeploymentCost(deployment)

    return c.json(summary)
  })

  h.post(
    '/deployments/:id/pause',
    zValidator('json', deploymentAgentOperationSchema),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const id = c.req.param('id')
      const input = c.req.valid('json') ?? {}
      const useCase = container.resolve('cloudSaasUseCase')
      const deployment = await useCase.getDeployment({
        ctx: createActorContext(c.get('actor')),
        deploymentId: id,
      })
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      const result = await transitionDeploymentRuntime({
        container,
        actor: c.get('actor'),
        userId: user.userId,
        deployment,
        action: 'pause',
        requestedAgentId: input.agentId,
      })
      return c.json(result.body, result.status)
    },
  )

  h.post(
    '/deployments/:id/resume',
    zValidator('json', deploymentAgentOperationSchema),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const id = c.req.param('id')
      const input = c.req.valid('json') ?? {}
      const useCase = container.resolve('cloudSaasUseCase')
      const deployment = await useCase.getDeployment({
        ctx: createActorContext(c.get('actor')),
        deploymentId: id,
      })
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      const result = await transitionDeploymentRuntime({
        container,
        actor: c.get('actor'),
        userId: user.userId,
        deployment,
        action: 'resume',
        requestedAgentId: input.agentId,
      })
      return c.json(result.body, result.status)
    },
  )

  h.get('/deployments/:id/backups', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const agentId = c.req.query('agentId')
    const useCase = container.resolve('cloudSaasUseCase')
    const result = await useCase.listDeploymentBackups({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
      agentId,
    })
    if (!result) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    return c.json({ deploymentId: id, backups: result.backups })
  })

  h.post(
    '/deployments/:id/backups',
    zValidator('json', deploymentBackupCreateSchema),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const id = c.req.param('id')
      const input = c.req.valid('json') ?? {}
      const useCase = container.resolve('cloudSaasUseCase')
      const deploymentDao = container.resolve('cloudDeploymentDao')
      const deployment = await useCase.getDeployment({
        ctx: createActorContext(c.get('actor')),
        deploymentId: id,
      })
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      if (deployment.status !== 'deployed' && deployment.status !== 'paused') {
        return c.json(
          { ok: false, error: `Cannot back up deployment in status "${deployment.status}"` },
          422,
        )
      }

      const runtimeState = resolveRuntimeStateTarget(deployment, input.agentId)
      const agentId = runtimeState.agentId
      const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
      const pvcName = runtimeState.pvcName
      let githubTarget: NormalizedGitHubBackupTarget | null = null
      if (input.target?.type === 'github') {
        try {
          githubTarget = await normalizeGitHubBackupTargetForUser({
            container,
            userId: user.userId,
            target: input.target,
          })
        } catch (err) {
          const status = (err as { status?: number }).status ?? 422
          return c.json(
            { ok: false, error: err instanceof Error ? err.message : 'Invalid GitHub target' },
            { status: status as 400 | 401 | 403 | 404 | 422 | 500 },
          )
        }
      }
      if (githubTarget && input.driver === 'volumeSnapshot') {
        return c.json(
          { ok: false, error: 'GitHub backups use git archives, not VolumeSnapshot' },
          422,
        )
      }
      if (input.driver === 'volumeSnapshot' && !runtimeState.persistentState) {
        return c.json(
          {
            ok: false,
            error: `Cannot create VolumeSnapshot backup for agent "${agentId}" because runtime state is not backed by a PVC`,
          },
          422,
        )
      }
      const snapshotApiAvailable = runtimeState.persistentState
        ? await isVolumeSnapshotApiAvailable({ kubeconfig }).catch(() => false)
        : false
      const snapshotCapability =
        runtimeState.persistentState && snapshotApiAvailable
          ? await getPvcVolumeSnapshotCapability({
              namespace: deployment.namespace,
              pvcName,
              kubeconfig,
            }).catch(() => null)
          : null
      const volumeSnapshotClassName = snapshotCapability
        ? snapshotCapability.volumeSnapshotClassName
        : null
      if (input.driver === 'volumeSnapshot' && !volumeSnapshotClassName) {
        return c.json(
          {
            ok: false,
            error: snapshotApiAvailable
              ? snapshotCapability?.isCsi
                ? `PVC "${pvcName}" does not have a matching VolumeSnapshotClass for provisioner "${snapshotCapability.provisioner}"`
                : `PVC "${pvcName}" is not backed by a CSI StorageClass that supports VolumeSnapshot`
              : 'VolumeSnapshot API is not available on this cluster. Install the CSI snapshot CRDs/controller or use a restic/kopia backup driver.',
          },
          422,
        )
      }
      const driver = githubTarget
        ? 'git'
        : (input.driver ??
          (runtimeState.persistentState && volumeSnapshotClassName ? 'volumeSnapshot' : 'restic'))
      const snapshotFallbackReason = !snapshotApiAvailable
        ? runtimeState.persistentState
          ? 'VolumeSnapshot API is unavailable'
          : 'runtime state is not backed by a PVC'
        : !snapshotCapability?.isCsi
          ? `PVC "${pvcName}" is not backed by a CSI StorageClass`
          : !volumeSnapshotClassName
            ? `PVC "${pvcName}" does not have a matching VolumeSnapshotClass for provisioner "${snapshotCapability.provisioner}"`
            : null

      const operationLockAcquired = await deploymentDao.tryAcquireOperationLock(deployment)
      if (!operationLockAcquired) {
        return c.json(
          { ok: false, error: 'Another deployment operation is already running in this namespace' },
          409,
        )
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const artifactBase = `${deployment.namespace}-${agentId}-${stamp}`
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63)
      const githubObjectKey = githubTarget
        ? githubBackupArtifactUri(
            githubTarget,
            safeGitBackupFilePath(githubTarget, {
              namespace: deployment.namespace,
              agentId,
              stamp,
            }),
          )
        : null
      const backupDao = container.resolve('cloudDeploymentBackupDao')
      const backup = await backupDao
        .create({
          userId: user.userId,
          deploymentId: id,
          namespace: deployment.namespace,
          agentId,
          sandboxName: agentId,
          pvcName,
          driver,
          snapshotName: driver === 'volumeSnapshot' ? artifactBase : null,
          objectKey:
            driver === 'restic'
              ? objectBackupKey(id, agentId, stamp)
              : driver === 'git'
                ? githubObjectKey
                : null,
          status: 'running',
          phase: 'queued',
          expiresAt: expiresAtFromRetentionDays(input.retentionDays),
        })
        .catch(async (err) => {
          await deploymentDao.releaseOperationLock(deployment).catch(() => {})
          throw err
        })
      if (!backup) {
        await deploymentDao.releaseOperationLock(deployment).catch(() => {})
        return c.json({ ok: false, error: 'Failed to create backup record' }, 500)
      }
      try {
        await deploymentDao.appendLog(
          id,
          `[backup] Queued ${driver} backup ${backup.id} for agent "${agentId}"${
            driver === 'restic' && snapshotFallbackReason
              ? ` because ${snapshotFallbackReason}`
              : ''
          }`,
          'info',
        )
        await useCase.logActivity({
          ctx: createActorContext(c.get('actor')),
          userId: user.userId,
          type: 'scale',
          namespace: deployment.namespace,
          meta: { deploymentId: id, operation: 'backup', backupId: backup.id, agentId, driver },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await backupDao.updateStatus(backup.id, 'failed', message).catch(() => {})
        await deploymentDao.releaseOperationLock(deployment).catch(() => {})
        throw err
      }

      runCloudRuntimeOperation(
        container,
        { deploymentId: id, backupId: backup.id, operation: 'backup' },
        async () => {
          try {
            if (driver === 'volumeSnapshot') {
              if (!backup.snapshotName) throw new Error('VolumeSnapshot name is missing')
              await backupDao.updatePhase(backup.id, 'snapshot-creating')
              await createVolumeSnapshotBackupAsync({
                namespace: deployment.namespace,
                snapshotName: backup.snapshotName,
                pvcName: backup.pvcName,
                volumeSnapshotClassName: volumeSnapshotClassName ?? undefined,
                kubeconfig,
              })
              await backupDao.updatePhase(backup.id, 'snapshot-waiting')
              await waitForVolumeSnapshotReady({
                namespace: deployment.namespace,
                snapshotName: backup.snapshotName,
                kubeconfig,
                timeoutMs: 180_000,
              })
            } else if (driver === 'git') {
              if (!githubTarget) throw new Error('GitHub backup target is missing')
              await backupDao.updatePhase(backup.id, 'object-archiving')
              const runtimeArchive = await createRuntimeStateArchive({
                container,
                deployment,
                backup,
                target: runtimeState,
                kubeconfig,
              })
              await backupDao.updatePhase(backup.id, 'git-cloning')
              const storedArchive = encryptGitHubBackupArchive(runtimeArchive.archive)
              const result = await createGitHubBackup({
                target: githubTarget,
                archive: storedArchive,
                namespace: deployment.namespace,
                agentId,
                stamp,
                onPhase: async (phase) => {
                  await backupDao.updatePhase(backup.id, phase)
                },
              })
              await deploymentDao.appendLog(
                id,
                `[backup] Pushed ${runtimeArchive.archive.byteLength} bytes from ${runtimeArchive.source} to GitHub backup ${result.repository}@${result.branch} (${result.commitSha.slice(0, 12)}, stored=${storedArchive.byteLength} bytes, encrypted=${storedArchive !== runtimeArchive.archive ? 'yes' : 'no'}) for agent "${agentId}"`,
                'info',
              )
            } else {
              await backupDao.updatePhase(backup.id, 'object-archiving')
              const result = await createObjectStoreBackup({
                container,
                deployment,
                backup,
                target: runtimeState,
                kubeconfig,
                onPhase: async (phase) => {
                  await backupDao.updatePhase(backup.id, phase)
                },
              })
              await deploymentDao.appendLog(
                id,
                `[backup] Archived ${result.archiveBytes} bytes from ${result.source} for agent "${agentId}" (stored=${result.storedBytes} bytes, encrypted=${result.encrypted ? 'yes' : 'no'})`,
                'info',
              )
            }
            await backupDao.updateStatus(backup.id, 'succeeded')
            await deploymentDao.appendLog(
              id,
              driver === 'volumeSnapshot'
                ? `[backup] VolumeSnapshot ${backup.snapshotName} is ready for agent "${agentId}"`
                : driver === 'git'
                  ? `[backup] GitHub archive ${backup.objectKey} is ready for agent "${agentId}"`
                  : `[backup] Object archive ${backup.objectKey} is ready for agent "${agentId}"`,
              'info',
            )
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await backupDao.updateStatus(backup.id, 'failed', message)
            await deploymentDao.appendLog(id, `[backup] Failed: ${message}`, 'error')
          } finally {
            await deploymentDao.releaseOperationLock(deployment).catch(() => {})
          }
        },
      )

      return c.json({ ok: true, backup }, 202)
    },
  )

  h.post('/deployments/:id/restore', zValidator('json', deploymentRestoreSchema), async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const input = c.req.valid('json') ?? {}
    const useCase = container.resolve('cloudSaasUseCase')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const current = await deploymentDao.findLatestCurrentInNamespace({
      userId: user.userId,
      clusterId: deployment.clusterId,
      namespace: deployment.namespace,
    })
    const currentOrRecoverable = current ?? (deployment.status === 'failed' ? deployment : null)
    if (!currentOrRecoverable || currentOrRecoverable.id !== deployment.id) {
      return c.json({ ok: false, error: 'Cannot restore a historical deployment instance' }, 409)
    }
    if (
      deployment.status !== 'deployed' &&
      deployment.status !== 'paused' &&
      deployment.status !== 'failed'
    ) {
      return c.json(
        { ok: false, error: `Cannot restore deployment in status "${deployment.status}"` },
        422,
      )
    }

    const backupDao = container.resolve('cloudDeploymentBackupDao')
    const runtimeState = resolveRuntimeStateTarget(deployment, input.agentId)
    const agentId = runtimeState.agentId
    if (!input.backupId && !runtimeState.persistentState) {
      return c.json(
        {
          ok: false,
          error: `Cannot restore agent "${agentId}" because runtime state is not backed by a PVC`,
        },
        422,
      )
    }
    const backup = input.backupId
      ? await useCase.getBackupById({
          ctx: createActorContext(c.get('actor')),
          backupId: input.backupId,
        })
      : ((
          await useCase.listDeploymentBackups({
            ctx: createActorContext(c.get('actor')),
            deploymentId: id,
            agentId,
          })
        )?.backups?.[0] ?? null)
    if (!backup || backup.deploymentId !== id) {
      return c.json({ ok: false, error: 'Backup not found' }, 404)
    }
    if (backup.status !== 'succeeded') {
      return c.json({ ok: false, error: `Cannot restore backup in status "${backup.status}"` }, 422)
    }
    if (backup.driver === 'volumeSnapshot' && !backup.snapshotName) {
      return c.json({ ok: false, error: 'VolumeSnapshot backup is missing snapshotName' }, 422)
    }
    if (backup.driver === 'restic' && !backup.objectKey) {
      return c.json({ ok: false, error: 'Object backup is missing objectKey' }, 422)
    }
    if (backup.driver === 'git' && !backup.objectKey) {
      return c.json({ ok: false, error: 'GitHub backup is missing objectKey' }, 422)
    }
    const restoreRuntimeState = resolveRuntimeStateTarget(deployment, backup.agentId)
    if (!restoreRuntimeState.persistentState) {
      return c.json(
        {
          ok: false,
          error: `Cannot restore agent "${backup.agentId}" because runtime state is not backed by a PVC`,
        },
        422,
      )
    }
    let githubRestoreToken: string | null = null
    if (backup.driver === 'git') {
      try {
        const resolved = await resolveGitHubConnectionToken({
          container,
          userId: user.userId,
          connectionId: input.target?.type === 'github' ? input.target.connectionId : undefined,
          token: input.target?.type === 'github' ? input.target.token : undefined,
        })
        githubRestoreToken = resolved.token
        if (resolved.connection) {
          await container
            .resolve('cloudGitConnectionDao')
            .touch(resolved.connection.id, user.userId)
        }
      } catch (err) {
        const status = (err as { status?: number }).status ?? 422
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'GitHub restore target is required',
          },
          { status: status as 400 | 401 | 403 | 404 | 422 | 500 },
        )
      }
    }
    if (
      backup.driver !== 'volumeSnapshot' &&
      backup.driver !== 'restic' &&
      backup.driver !== 'git'
    ) {
      return c.json({ ok: false, error: `Unsupported backup driver "${backup.driver}"` }, 422)
    }

    const operationLockAcquired = await deploymentDao.tryAcquireOperationLock(deployment)
    if (!operationLockAcquired) {
      return c.json(
        { ok: false, error: 'Another deployment operation is already running in this namespace' },
        409,
      )
    }

    const resuming = await (async () => {
      try {
        await deploymentDao.appendLog(
          id,
          `[restore] User requested restore from backup ${backup.id} for agent "${backup.agentId}"`,
          'info',
        )
        await useCase.logActivity({
          ctx: createActorContext(c.get('actor')),
          userId: user.userId,
          type: 'scale',
          namespace: deployment.namespace,
          meta: { deploymentId: id, operation: 'restore', backupId: backup.id, agentId },
        })
        return await deploymentDao.updateStatusIfStatus(id, deployment.status, 'resuming')
      } catch (err) {
        await deploymentDao.releaseOperationLock(deployment).catch(() => {})
        throw err
      }
    })()
    if (!resuming) {
      await deploymentDao.releaseOperationLock(deployment).catch(() => {})
      return c.json({ ok: false, error: 'Restore was superseded by a newer lifecycle action' }, 409)
    }
    runCloudRuntimeOperation(
      container,
      { deploymentId: id, backupId: backup.id, operation: 'restore' },
      async () => {
        try {
          const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
          await backupDao.updatePhase(backup.id, 'restoring-pausing')
          await scaleAgentSandboxAsync(deployment.namespace, backup.agentId, 0, kubeconfig)
          await waitForAgentSandboxPaused({
            namespace: deployment.namespace,
            agentName: backup.agentId,
            kubeconfig,
            timeoutMs: 120_000,
          })
          await createPreRestoreSafetyBackup({
            container,
            deploymentDao,
            backupDao,
            deployment,
            sourceBackup: backup,
            target: restoreRuntimeState,
            kubeconfig,
          })
          await backupDao.updatePhase(backup.id, 'restoring-pvc')
          if (backup.driver === 'volumeSnapshot') {
            await container.resolve('kubernetesOpsGateway').restorePvcFromSnapshot({
              namespace: deployment.namespace,
              pvcName: backup.pvcName,
              snapshotName: backup.snapshotName as string,
              kubeconfig,
              timeoutMs: 180_000,
            })
          } else if (backup.driver === 'git') {
            if (!githubRestoreToken) throw new Error('GitHub restore token is missing')
            const result = await restoreGitHubBackup({
              container,
              deployment,
              backup,
              token: githubRestoreToken,
              kubeconfig,
            })
            await deploymentDao.appendLog(
              id,
              `[restore] Restored GitHub archive ${backup.objectKey} (${result.archiveBytes} bytes) into PVC ${backup.pvcName}`,
              'info',
            )
          } else {
            const result = await restoreObjectStoreBackup({
              container,
              deployment,
              backup,
              kubeconfig,
            })
            await deploymentDao.appendLog(
              id,
              `[restore] Restored object archive ${backup.objectKey} (${result.archiveBytes} bytes) into PVC ${backup.pvcName}`,
              'info',
            )
          }
          await backupDao.updatePhase(backup.id, 'restoring-resuming')
          await scaleAgentSandboxAsync(deployment.namespace, backup.agentId, 1, kubeconfig)
          await waitForAgentSandboxReady({
            namespace: deployment.namespace,
            agentName: backup.agentId,
            kubeconfig,
            timeoutMs: 180_000,
          })
          await backupDao.updatePhase(backup.id, 'completed')
          await deploymentDao.updateStatusIfStatus(id, 'resuming', 'deployed')
          await deploymentDao.appendLog(
            id,
            `[restore] Restored backup ${backup.id} for agent "${backup.agentId}"`,
            'info',
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await deploymentDao.appendLog(id, `[restore] Failed: ${message}`, 'error')
          await deploymentDao.failIfStatus(id, 'resuming', message)
          await backupDao.updatePhase(backup.id, 'restore-failed').catch(() => {})
        } finally {
          await deploymentDao.releaseOperationLock(deployment).catch(() => {})
        }
      },
    )

    return c.json(
      {
        ok: true,
        backup,
        status: 'resuming',
        deployment: sanitizeCloudSaasDeploymentForResponse(resuming ?? deployment),
      },
      202,
    )
  })

  /**
   * POST /api/cloud-saas/deployments
   * Create a new SaaS deployment. Runtime usage is billed by the worker.
   */
  h.post(
    '/deployments',
    zValidator(
      'json',
      z.object({
        namespace: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        templateSlug: z.string().min(1),
        resourceTier: z.enum(['lightweight', 'standard', 'pro']),
        agentCount: z.number().int().min(0).optional(),
        configSnapshot: z.record(z.unknown()),
        envVars: z.record(z.string()).optional(),
        temporaryTtlMinutes: z
          .number()
          .int()
          .min(5)
          .max(7 * 24 * 60)
          .optional(),
        runtimeContext: deploymentRuntimeContextSchema,
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const db = container.resolve('db')
      const useCase = container.resolve('cloudSaasUseCase')

      // Verify template exists
      const template = await useCase.getTemplateBySlug({
        ctx: createActorContext(c.get('actor')),
        slug: input.templateSlug,
      })
      if (!template || !canUseTemplate(template, user.userId)) {
        return c.json({ ok: false, error: 'Template not found or not approved' }, 404)
      }
      if (!isDeployableTemplateContent(template.content)) {
        return c.json({ ok: false, error: 'Template is not deployable' }, 422)
      }
      if (!K8S_NAMESPACE_RE.test(input.namespace)) {
        return c.json({ ok: false, error: 'Invalid deployment namespace' }, 422)
      }
      await container.resolve('membershipService').requireMember(user.userId, 'cloud:deploy')

      let storedConfigSnapshot: Record<string, unknown>
      try {
        const serverTemplateSnapshot = materializeTemplateI18nPlaceholders(
          applySafeDeploymentPreferences(
            validateCloudSaasConfigSnapshot(template.content),
            input.configSnapshot,
          ),
          runtimeContextLocale(input.runtimeContext),
          'Cloud deployment template',
        )
        assertCloudTemplatePolicy(serverTemplateSnapshot)
        const allowedEnvKeys = await collectAllowedDeploymentEnvKeys(serverTemplateSnapshot)
        const submittedEnvKeys = Object.keys(input.envVars ?? {})
        const illegalEnvKey = submittedEnvKeys.find(
          (key) => isReservedRuntimeEnvKey(key) || !allowedEnvKeys.has(key),
        )
        if (illegalEnvKey) {
          const reservedHint = RESERVED_RUNTIME_ENV_KEYS.has(illegalEnvKey)
            ? 'reserved runtime env var'
            : 'env var not declared by template'
          return c.json({ ok: false, error: `Rejected ${reservedHint}: ${illegalEnvKey}` }, 422)
        }
        const runtimeEnvVars = await resolveCreateRuntimeEnvVars(
          useCase,
          user.userId,
          input.envVars,
          serverTemplateSnapshot,
          c.req.header('authorization'),
          requestOrigin(c),
          {
            templateSlug: input.templateSlug,
            namespace: input.namespace,
          },
        )
        storedConfigSnapshot = prepareCloudSaasConfigSnapshot(
          serverTemplateSnapshot,
          runtimeEnvVars,
          input.runtimeContext,
        )
        storedConfigSnapshot = attachDeploymentManifestMetadata(storedConfigSnapshot, {
          template,
          source: 'create',
        })
      } catch (err) {
        const status =
          typeof (err as { status?: number }).status === 'number'
            ? (err as { status: number }).status
            : 422
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid configSnapshot',
          },
          { status: status as 400 | 404 | 409 | 422 | 500 },
        )
      }

      const hourlyCost = CLOUD_DEPLOYMENT_HOURLY_COST
      const monthlyCost = 0
      const expiresAt = expiresAtFromTtlMinutes(input.temporaryTtlMinutes)

      // Get or use platform cluster, then reserve the namespace at the
      // deployment-instance level. A template can be deployed multiple times,
      // but each live instance must own a distinct namespace.
      const clusters = await useCase.listClustersByUser({ ctx: createActorContext(c.get('actor')) })
      const platformCluster = clusters.find((cl: { isPlatform?: boolean }) => cl.isPlatform) ?? null
      const deploymentDao = container.resolve('cloudDeploymentDao')
      const operationScope = {
        userId: user.userId,
        clusterId: platformCluster?.id ?? null,
        namespace: input.namespace,
      }
      const namespaceLockAcquired = await deploymentDao.tryAcquireOperationLock(operationScope)
      if (!namespaceLockAcquired) {
        return c.json({ ok: false, error: 'Deployment namespace is currently busy' }, 409)
      }

      try {
        const existingInstance = await deploymentDao.findLatestInNamespace({
          userId: user.userId,
          clusterId: platformCluster?.id ?? null,
          namespace: input.namespace,
        })
        if (existingInstance) {
          return c.json(
            {
              ok: false,
              error:
                'This deployment namespace has already been used. Create a deployment with a fresh namespace.',
            },
            409,
          )
        }

        let deploymentId: string | null = null

        try {
          await enforceCloudDeployStarterBalance(container, user.userId, hourlyCost)

          // Create deployment record
          const deployment = await deploymentDao.create({
            userId: user.userId,
            clusterId: platformCluster?.id ?? null,
            namespace: input.namespace,
            name: input.name,
            agentCount: input.agentCount,
            configSnapshot: storedConfigSnapshot,
            expiresAt,
          })

          if (!deployment) {
            throw new Error('Failed to create deployment')
          }
          deploymentId = deployment.id

          // Set SaaS fields
          const [updated] = await db
            .update(cloudDeployments)
            .set({
              templateSlug: input.templateSlug,
              resourceTier: input.resourceTier,
              monthlyCost,
              hourlyCost,
              expiresAt,
              saasMode: true,
            })
            .where(eq(cloudDeployments.id, deployment.id))
            .returning()

          if (!updated) {
            throw new Error('Failed to finalize deployment metadata')
          }

          await deploymentDao.appendLog(
            deployment.id,
            `[queue] Deployment queued for namespace "${input.namespace}"`,
            'info',
          )

          // Increment template deploy_count
          await db
            .update(cloudTemplates)
            .set({ deployCount: sql`${cloudTemplates.deployCount} + 1` })
            .where(eq(cloudTemplates.slug, input.templateSlug))

          await useCase.logActivity({
            ctx: createActorContext(c.get('actor')),
            userId: user.userId,
            type: 'deploy',
            namespace: input.namespace,
            meta: {
              templateSlug: input.templateSlug,
              resourceTier: input.resourceTier,
              monthlyCost,
              hourlyCost,
              expiresAt: expiresAt?.toISOString() ?? null,
              billingPrecisionMinutes: CLOUD_DEPLOYMENT_BILLING_PRECISION_MINUTES,
            },
          })

          return c.json(sanitizeCloudSaasDeploymentForResponse(updated), 201)
        } catch (err) {
          if (deploymentId) {
            try {
              const deploymentDao = container.resolve('cloudDeploymentDao')
              await deploymentDao.updateStatus(
                deploymentId,
                'failed',
                err instanceof Error ? err.message : 'Failed to create deployment',
              )
              await deploymentDao.appendLog(
                deploymentId,
                `[error] ${err instanceof Error ? err.message : String(err)}`,
                'error',
              )
            } catch (cleanupErr) {
              console.error('[cloud-saas] failed to persist deployment create error:', cleanupErr)
            }
          }

          const status =
            typeof (err as { status?: number }).status === 'number'
              ? (err as { status: number }).status
              : 500
          const appError = err as {
            code?: string
            requiredAmount?: number
            balance?: number
            shortfall?: number
            nextAction?: string
          }
          return c.json(
            {
              ok: false,
              error: err instanceof Error ? err.message : 'Failed to create deployment',
              ...(appError.code ? { code: appError.code } : {}),
              ...(typeof appError.requiredAmount === 'number'
                ? { requiredAmount: appError.requiredAmount }
                : {}),
              ...(typeof appError.balance === 'number' ? { balance: appError.balance } : {}),
              ...(typeof appError.shortfall === 'number' ? { shortfall: appError.shortfall } : {}),
              ...(appError.nextAction ? { nextAction: appError.nextAction } : {}),
            },
            { status: status as 400 | 402 | 404 | 409 | 422 | 500 },
          )
        }
      } finally {
        await deploymentDao.releaseOperationLock(operationScope).catch(() => {})
      }
    },
  )

  /**
   * GET /api/cloud-saas/deployments/:id/manifest
   * Return the template link and deployed manifest metadata for a deployment.
   */
  h.get('/deployments/:id/manifest', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    let linkedTemplateSlug: string | null = deploymentTemplateSlugCandidates(deployment)[0] ?? null
    let template: CloudTemplateRecord | null = null
    for (const candidate of deploymentTemplateSlugCandidates(deployment)) {
      const found = await useCase.getTemplateBySlug({
        ctx: createActorContext(c.get('actor')),
        slug: candidate,
      })
      if (found && canUseTemplate(found, user.userId)) {
        linkedTemplateSlug = candidate
        template = found
        break
      }
    }

    return c.json(
      buildDeploymentManifestResponse({
        deployment: { ...deployment, templateSlug: linkedTemplateSlug },
        template,
        userId: user.userId,
      }),
    )
  })

  /**
   * POST /api/cloud-saas/deployments/:id/template
   * Save the deployed config snapshot as an editable template. Owned draft or
   * rejected templates are updated in place; official, approved, or pending
   * templates are forked to keep public catalog history immutable.
   */
  h.post('/deployments/:id/template', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const parsed = deploymentTemplateSyncSchema.safeParse(await c.req.json().catch(() => undefined))
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 422)
    }

    const useCase = container.resolve('cloudSaasUseCase')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    if (!deployment.configSnapshot || typeof deployment.configSnapshot !== 'object') {
      return c.json({ ok: false, error: 'Deployment has no config snapshot' }, 422)
    }

    const runtime = extractCloudSaasRuntime(deployment.configSnapshot)
    const sourceContent = parsed.data?.content ?? runtime.configSnapshot
    if (!sourceContent || !isRecord(sourceContent)) {
      return c.json({ ok: false, error: 'Deployment has no deployable config snapshot' }, 422)
    }

    let content: Record<string, unknown>
    try {
      content = validateTemplateContentForWrite(sourceContent)
    } catch (err) {
      const status = (err as { status?: 413 | 422 }).status ?? 422
      return c.json({ ok: false, error: (err as Error).message }, status)
    }

    const db = container.resolve('db')
    const templateDao = container.resolve('cloudTemplateDao')
    let linkedTemplateSlug: string | null = deploymentTemplateSlugCandidates(deployment)[0] ?? null
    let currentTemplate: CloudTemplateRecord | null = null
    for (const candidate of deploymentTemplateSlugCandidates(deployment)) {
      const found = await templateDao.findBySlug(candidate)
      if (found && canUseTemplate(found, user.userId)) {
        linkedTemplateSlug = candidate
        currentTemplate = found
        break
      }
    }
    const canUpdateInPlace =
      currentTemplate &&
      isTemplateOwnedByUser(currentTemplate, user.userId) &&
      currentTemplate.source === 'community' &&
      currentTemplate.reviewStatus !== 'approved' &&
      currentTemplate.reviewStatus !== 'pending'

    let template: CloudTemplateRecord | null = null
    let action: 'updated' | 'forked'
    if (canUpdateInPlace && currentTemplate) {
      const [updated] = await db
        .update(cloudTemplates)
        .set({
          name: parsed.data?.name ?? currentTemplate.name,
          description:
            parsed.data?.description !== undefined
              ? parsed.data.description
              : currentTemplate.description,
          content,
          ...(parsed.data?.tags !== undefined && { tags: parsed.data.tags }),
          ...(parsed.data?.category !== undefined && { category: parsed.data.category }),
          ...(parsed.data?.baseCost !== undefined && { baseCost: parsed.data.baseCost }),
          ...(parsed.data?.githubSource !== undefined && {
            githubSource: parsed.data.githubSource,
          }),
          updatedAt: new Date(),
        })
        .where(eq(cloudTemplates.id, currentTemplate.id))
        .returning()
      template = updated ?? currentTemplate
      action = 'updated'
    } else {
      const baseSlug = slugifyTemplateSlug(
        parsed.data?.name ?? linkedTemplateSlug ?? `${deployment.namespace}-${deployment.name}`,
      )
      let slug = baseSlug
      for (let i = 2; await templateDao.findBySlug(slug); i += 1) {
        slug = `${baseSlug}-${i}`
      }

      const [created] = await db
        .insert(cloudTemplates)
        .values({
          slug,
          name: parsed.data?.name ?? currentTemplate?.name ?? deployment.name,
          description:
            parsed.data?.description ??
            currentTemplate?.description ??
            `Editable template forked from deployment ${deployment.namespace}`,
          content,
          tags: parsed.data?.tags ?? currentTemplate?.tags ?? [],
          source: 'community',
          reviewStatus: 'draft',
          submittedByUserId: user.userId,
          authorId: user.userId,
          category: parsed.data?.category ?? currentTemplate?.category ?? null,
          baseCost: parsed.data?.baseCost ?? currentTemplate?.baseCost ?? null,
          githubSource: parsed.data?.githubSource ?? currentTemplate?.githubSource ?? null,
        })
        .returning()
      template = created ?? null
      action = 'forked'
    }

    if (!template) return c.json({ ok: false, error: 'Failed to save template' }, 500)

    const previousManifest = readDeploymentManifestMetadata(deployment.configSnapshot)
    const nextSnapshot = attachDeploymentManifestMetadata(deployment.configSnapshot, {
      template,
      source: 'template-sync',
      previous: previousManifest,
    })
    await dao.updateConfigSnapshot(deployment.id, nextSnapshot)
    if (deployment.templateSlug !== template.slug) {
      await db
        .update(cloudDeployments)
        .set({ templateSlug: template.slug, updatedAt: new Date() })
        .where(eq(cloudDeployments.id, deployment.id))
    }

    await useCase.logActivity({
      ctx: createActorContext(c.get('actor')),
      userId: user.userId,
      type: 'template_update',
      namespace: deployment.namespace,
      meta: { slug: template.slug, deploymentId: deployment.id, action },
    })

    return c.json({
      ok: true,
      action,
      template,
      manifest: buildDeploymentManifestResponse({
        deployment: { ...deployment, templateSlug: template.slug, configSnapshot: nextSnapshot },
        template,
        userId: user.userId,
      }),
    })
  })

  /**
   * DELETE /api/cloud-saas/deployments/:id
   * Mark the current deployment instance as a Pulumi destroy task.
   */
  h.delete('/deployments/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const useCase = container.resolve('cloudSaasUseCase')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    if (deployment.status === 'destroyed') {
      return c.json(
        { ok: false, error: `Cannot destroy deployment in status "${deployment.status}"` },
        422,
      )
    }

    // Lifecycle intent uses a short-lived lock that is deliberately separate
    // from the worker's infrastructure lock. Otherwise an active `pulumi up`
    // prevents DELETE from ever recording the destroy intent or signalling
    // the running stack to stop.
    const lifecycleLockAcquired = await dao.tryAcquireLifecycleLock(deployment)
    if (!lifecycleLockAcquired) {
      const latest = await dao.findLatestCurrentInNamespace({
        userId: user.userId,
        clusterId: deployment.clusterId,
        namespace: deployment.namespace,
      })
      if (latest?.status === 'destroying') {
        return c.json({ ok: true, taskId: latest.id, status: latest.status })
      }
      return c.json({ ok: false, error: 'Deployment lifecycle is currently changing' }, 409)
    }
    try {
      const latestCurrent = await dao.findLatestCurrentInNamespace({
        userId: user.userId,
        clusterId: deployment.clusterId,
        namespace: deployment.namespace,
      })
      const current = latestCurrent ?? (deployment.status === 'failed' ? deployment : null)
      if (!current || current.id !== deployment.id) {
        if (current?.status === 'destroying') {
          return c.json({ ok: true, taskId: current.id, status: current.status })
        }
        return c.json(
          {
            ok: false,
            error:
              'Cannot destroy a historical deployment. Destroy the current deployment instance.',
          },
          409,
        )
      }

      if (current.status === 'destroying') {
        return c.json({ ok: true, taskId: current.id, status: current.status })
      }

      if (!isVisibleDeploymentStatus(current.status) && current.status !== 'failed') {
        return c.json(
          { ok: false, error: `Cannot destroy deployment in status "${current.status}"` },
          422,
        )
      }

      if (!current.configSnapshot || typeof current.configSnapshot !== 'object') {
        return c.json(
          { ok: false, error: 'Deployment has no Pulumi config snapshot to destroy' },
          422,
        )
      }

      const retryingDestroy =
        current.status === 'failed' &&
        current.errorMessage?.trim().toLowerCase().startsWith('destroy:')
      const destroyTask = await dao.updateStatusIfStatus(
        current.id,
        current.status,
        'destroying',
        retryingDestroy ? 'destroy:retry_queued' : `destroy:queued:${current.status}`,
      )
      if (!destroyTask) {
        const latest = await dao.findByIdOnly(current.id)
        if (latest?.status === 'destroying') {
          return c.json({ ok: true, taskId: latest.id, status: latest.status })
        }
        return c.json({ ok: false, error: 'Deployment lifecycle changed; retry deletion' }, 409)
      }

      await dao.appendLog(
        destroyTask.id,
        `[destroy] Queued deletion for deployment ${current.id} in namespace "${current.namespace}"`,
        'info',
      )
      const interrupted = await requestCloudDeploymentDestroyInterruption(destroyTask.id)
      if (interrupted) {
        await dao.appendLog(
          destroyTask.id,
          '[destroy] Signal sent to in-progress operation so destroy can proceed',
          'warn',
        )
      }

      const blocker = await dao.findActiveOperationInNamespace({
        userId: user.userId,
        clusterId: current.clusterId,
        namespace: current.namespace,
        excludeId: destroyTask.id,
      })
      if (blocker) {
        await dao.appendLog(
          destroyTask.id,
          `[queue] Waiting for task ${blocker.id} (${blocker.status}) before destroy starts`,
          'info',
        )
      }

      await useCase.logActivity({
        ctx: createActorContext(c.get('actor')),
        userId: user.userId,
        type: 'destroy',
        namespace: current.namespace,
        meta: { deploymentId: current.id, taskId: destroyTask.id },
      })

      return c.json({ ok: true, taskId: destroyTask.id, status: destroyTask.status })
    } finally {
      await dao.releaseLifecycleLock(deployment).catch(() => {})
    }
  })

  /**
   * POST /api/cloud-saas/deployments/:id/cancel
   * Request cancellation of an active deploy/destroy task.
   *
   * Cancellation must not wait for the namespace operation lock, because the
   * task being cancelled may be the one holding that lock and blocking the
   * rest of the namespace queue.
   */
  h.post('/deployments/:id/cancel', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const useCase = container.resolve('cloudSaasUseCase')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    if (deployment.status === 'cancelling') {
      const signalled = await requestCloudDeploymentCancellation(id)
      if (signalled) {
        await dao.appendLog(id, '[cancel] Cancellation signal re-sent to running operation', 'warn')
      } else {
        const acquired = await dao.tryAcquireWorkerLock(id)
        if (acquired) {
          try {
            await dao.appendLog(id, '[cancel] No live operation found; marking cancelled', 'warn')
            await dao.updateStatus(id, 'failed', 'cancelled by user')
            return c.json({ ok: true, status: 'failed' })
          } finally {
            await dao.releaseWorkerLock(id).catch(() => {})
          }
        }
      }
      return c.json({ ok: true, status: 'cancelling' })
    }

    if (
      deployment.status !== 'pending' &&
      deployment.status !== 'deploying' &&
      deployment.status !== 'destroying'
    ) {
      return c.json(
        {
          ok: false,
          error: `Cannot cancel deployment in status "${deployment.status}"`,
        },
        422,
      )
    }

    await dao.updateStatus(id, 'cancelling')
    await dao.appendLog(id, '[cancel] User requested cancellation', 'warn')
    const signalled = await requestCloudDeploymentCancellation(id)
    if (signalled) {
      return c.json({ ok: true, status: 'cancelling' })
    }

    const acquired = await dao.tryAcquireWorkerLock(id)
    if (!acquired) {
      return c.json({ ok: true, status: 'cancelling' })
    }

    try {
      await dao.appendLog(
        id,
        '[cancel] Task was not running; marking cancelled immediately',
        'warn',
      )
      await dao.updateStatus(id, 'failed', 'cancelled by user')
      return c.json({ ok: true, status: 'failed' })
    } finally {
      await dao.releaseWorkerLock(id).catch(() => {})
    }
  })

  /**
   * POST /api/cloud-saas/deployments/:id/redeploy
   * Re-enqueue the same namespace/config as a new deployment history entry.
   * Redeploy is operational, not a fresh purchase, so it does not debit wallet.
   */
  h.post('/deployments/:id/redeploy', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const parsedRedeploy = deploymentRedeploySchema.safeParse(
      await c.req.json().catch(() => undefined),
    )
    if (!parsedRedeploy.success) {
      return c.json(
        { ok: false, error: parsedRedeploy.error.issues[0]?.message ?? 'Invalid request' },
        422,
      )
    }
    const redeployInput = parsedRedeploy.data ?? {}
    const useCase = container.resolve('cloudSaasUseCase')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    if (deployment.status === 'destroyed') {
      return c.json({ ok: false, error: 'Destroyed deployments cannot be redeployed' }, 422)
    }
    if (
      deployment.status === 'pending' ||
      deployment.status === 'deploying' ||
      deployment.status === 'cancelling' ||
      deployment.status === 'destroying'
    ) {
      return c.json({ ok: false, error: 'Deployment is currently in progress' }, 422)
    }
    const lifecycleLockAcquired = await dao.tryAcquireLifecycleLock(deployment)
    if (!lifecycleLockAcquired) {
      return c.json({ ok: false, error: 'Deployment lifecycle is currently changing' }, 409)
    }
    const operationLockAcquired = await dao.tryAcquireOperationLock(deployment)
    if (!operationLockAcquired) {
      await dao.releaseLifecycleLock(deployment).catch(() => {})
      return c.json({ ok: false, error: 'Deployment namespace is currently busy' }, 409)
    }
    try {
      const current = await dao.findLatestCurrentInNamespace({
        userId: user.userId,
        clusterId: deployment.clusterId,
        namespace: deployment.namespace,
      })
      if (current && current.id !== deployment.id) {
        return c.json(
          {
            ok: false,
            error:
              'Cannot redeploy a historical deployment. Redeploy the current deployment instance.',
          },
          409,
        )
      }
      const currentDeployment = current ?? deployment
      if (
        currentDeployment.status === 'pending' ||
        currentDeployment.status === 'deploying' ||
        currentDeployment.status === 'cancelling' ||
        currentDeployment.status === 'destroying'
      ) {
        return c.json({ ok: false, error: 'Deployment is currently in progress' }, 422)
      }
      const activeOperation = await dao.findActiveOperationInNamespace({
        userId: user.userId,
        clusterId: deployment.clusterId,
        namespace: deployment.namespace,
        excludeId: deployment.id,
      })
      if (activeOperation) {
        return c.json({ ok: false, error: 'Deployment namespace is currently busy' }, 409)
      }
      if (!deployment.configSnapshot || typeof deployment.configSnapshot !== 'object') {
        return c.json({ ok: false, error: 'Deployment has no config snapshot to redeploy' }, 422)
      }
      const ephemeralStateTargets = listEphemeralRuntimeStateTargets(currentDeployment)
      if (ephemeralStateTargets.length > 0) {
        return c.json(
          {
            ok: false,
            error: `Cannot redeploy deployment with ephemeral runtime state. Back up and migrate state to PVC first: ${ephemeralStateTargets.map((target) => target.agentId).join(', ')}`,
          },
          409,
        )
      }

      const runtime = extractCloudSaasRuntime(deployment.configSnapshot)
      if (!runtime.configSnapshot) {
        return c.json({ ok: false, error: 'Deployment has no config snapshot to redeploy' }, 422)
      }

      const redeployEnvVars = { ...runtime.envVars }
      for (const key of redeployInput.removeEnvKeys ?? []) delete redeployEnvVars[key]
      Object.assign(redeployEnvVars, redeployInput.envVars ?? {})
      delete redeployEnvVars.SHADOWOB_USER_TOKEN
      delete redeployEnvVars.SHADOWOB_SERVER_URL
      delete redeployEnvVars.SHADOWOB_PROVISION_URL
      for (const key of OFFICIAL_MODEL_PROXY_ENV_KEYS) delete redeployEnvVars[key]

      let configSnapshot: Record<string, unknown>
      let templateForManifest: CloudTemplateRecord | null = null
      const currentTemplateSlug =
        currentDeployment.templateSlug ??
        inferTemplateSlugFromConfigSnapshot(currentDeployment.configSnapshot) ??
        inferTemplateSlugFromConfigSnapshot(deployment.configSnapshot)
      let nextTemplateSlug = currentTemplateSlug
      const modelProviderMode =
        readCloudStoreModelProviderMode(redeployInput.configSnapshot) ??
        readCloudStoreModelProviderMode(currentDeployment.configSnapshot)
      try {
        const requestedTemplateSlug = redeployInput.templateSlug ?? currentTemplateSlug
        nextTemplateSlug = requestedTemplateSlug ?? null
        const redeployLocale = runtimeContextLocale(redeployInput.runtimeContext ?? runtime.context)
        const useTemplate =
          redeployInput.mode === 'template' ||
          Boolean(redeployInput.templateSlug) ||
          Boolean(redeployInput.configSnapshot)
        let baseConfigSnapshot: Record<string, unknown>
        if (redeployInput.configSnapshot) {
          const submittedSnapshot =
            extractCloudSaasRuntime(redeployInput.configSnapshot).configSnapshot ??
            redeployInput.configSnapshot
          baseConfigSnapshot = materializeTemplateI18nPlaceholders(
            validateTemplateContentForWrite(submittedSnapshot),
            redeployLocale,
            'Cloud deployment template',
          )
          if (requestedTemplateSlug) {
            const found = await useCase.getTemplateBySlug({
              ctx: createActorContext(c.get('actor')),
              slug: requestedTemplateSlug,
            })
            templateForManifest = found && canUseTemplate(found, user.userId) ? found : null
          }
        } else if (useTemplate) {
          if (!requestedTemplateSlug) {
            return c.json({ ok: false, error: 'Deployment has no linked template' }, 422)
          }
          const template = await useCase.getTemplateBySlug({
            ctx: createActorContext(c.get('actor')),
            slug: requestedTemplateSlug,
          })
          if (!template || !canUseTemplate(template, user.userId)) {
            return c.json({ ok: false, error: 'Template not found or not approved' }, 404)
          }
          if (!isDeployableTemplateContent(template.content)) {
            return c.json({ ok: false, error: 'Template is not deployable' }, 422)
          }
          templateForManifest = template
          baseConfigSnapshot = materializeTemplateI18nPlaceholders(
            applySafeDeploymentPreferences(
              validateCloudSaasConfigSnapshot(template.content),
              runtime.configSnapshot,
            ),
            redeployLocale,
            'Cloud deployment template',
          )
          assertCloudTemplatePolicy(baseConfigSnapshot)
        } else {
          baseConfigSnapshot = materializeTemplateI18nPlaceholders(
            runtime.configSnapshot,
            redeployLocale,
            'Cloud deployment template',
          )
          if (requestedTemplateSlug) {
            const found = await useCase.getTemplateBySlug({
              ctx: createActorContext(c.get('actor')),
              slug: requestedTemplateSlug,
            })
            templateForManifest = found && canUseTemplate(found, user.userId) ? found : null
          }
        }

        const allowedEnvKeys = await collectAllowedDeploymentEnvKeys(baseConfigSnapshot)
        const illegalEnvKey = Object.keys(redeployInput.envVars ?? {}).find(
          (key) => isReservedRuntimeEnvKey(key) || !allowedEnvKeys.has(key),
        )
        if (illegalEnvKey) {
          const reservedHint = RESERVED_RUNTIME_ENV_KEYS.has(illegalEnvKey)
            ? 'reserved runtime env var'
            : 'env var not declared by template'
          return c.json({ ok: false, error: `Rejected ${reservedHint}: ${illegalEnvKey}` }, 422)
        }

        const runtimeEnvVars = await resolveCreateRuntimeEnvVars(
          useCase,
          c.get('user').userId,
          redeployEnvVars,
          baseConfigSnapshot,
          c.req.header('authorization'),
          requestOrigin(c),
          {
            templateSlug: requestedTemplateSlug,
            namespace: currentDeployment.namespace,
            modelProviderMode,
          },
        )
        configSnapshot = prepareCloudSaasConfigSnapshot(
          baseConfigSnapshot,
          runtimeEnvVars,
          redeployInput.runtimeContext ?? runtime.context,
        )
        if (modelProviderMode) {
          const preparedRuntime = isRecord(configSnapshot[CLOUD_SAAS_RUNTIME_KEY])
            ? configSnapshot[CLOUD_SAAS_RUNTIME_KEY]
            : {}
          configSnapshot = {
            ...configSnapshot,
            [CLOUD_SAAS_RUNTIME_KEY]: {
              ...preparedRuntime,
              modelProviderMode,
            },
          }
        }
        if (runtime.provisionState) {
          const sanitizedProvisionState = sanitizeLegacyProvisionState(
            runtime.provisionState,
          ) as Parameters<typeof attachCloudSaasProvisionState>[1]
          configSnapshot = attachCloudSaasProvisionState(configSnapshot, sanitizedProvisionState)
        }
        configSnapshot = attachDeploymentManifestMetadata(configSnapshot, {
          template: templateForManifest,
          source: useTemplate ? 'template-redeploy' : 'snapshot-redeploy',
          previous: readDeploymentManifestMetadata(deployment.configSnapshot),
        })
      } catch (err) {
        const status =
          typeof (err as { status?: number }).status === 'number'
            ? (err as { status: number }).status
            : 422
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid configSnapshot',
          },
          { status: status as 400 | 404 | 409 | 422 | 500 },
        )
      }

      const next = await dao.create({
        userId: user.userId,
        clusterId: deployment.clusterId,
        namespace: deployment.namespace,
        name: deployment.name,
        agentCount: deploymentAgentCountFromSnapshot(configSnapshot),
        configSnapshot,
        templateSlug: nextTemplateSlug,
        resourceTier: deployment.resourceTier,
        monthlyCost: deployment.monthlyCost,
        hourlyCost: deployment.hourlyCost,
        lastHourlyBilledAt: currentDeployment.lastHourlyBilledAt,
        expiresAt: deployment.expiresAt,
        saasMode: deployment.saasMode,
      })
      if (!next) {
        return c.json({ ok: false, error: 'Failed to create redeployment' }, 500)
      }

      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudDeployments)
        .set({
          templateSlug: nextTemplateSlug,
          resourceTier: deployment.resourceTier,
          monthlyCost: deployment.monthlyCost,
          hourlyCost: deployment.hourlyCost,
          expiresAt: deployment.expiresAt,
          saasMode: deployment.saasMode,
          updatedAt: new Date(),
        })
        .where(eq(cloudDeployments.id, next.id))
        .returning()

      await dao.appendLog(next.id, `[redeploy] Recreated from deployment ${deployment.id}`, 'info')
      await dao.appendLog(
        next.id,
        `[queue] Redeploy queued for namespace "${deployment.namespace}"`,
        'info',
      )

      await useCase.logActivity({
        ctx: createActorContext(c.get('actor')),
        userId: user.userId,
        type: 'deploy',
        namespace: deployment.namespace,
        meta: {
          deploymentId: next.id,
          redeployFrom: deployment.id,
          templateSlug: nextTemplateSlug,
          resourceTier: deployment.resourceTier,
        },
      })

      return c.json(sanitizeCloudSaasDeploymentForResponse(updated ?? next), 201)
    } finally {
      await dao.releaseOperationLock(deployment).catch(() => {})
      await dao.releaseLifecycleLock(deployment).catch(() => {})
    }
  })

  /**
   * GET /api/cloud-saas/deployments/:id/logs
   * Stream deployment logs (SSE).
   */
  h.get('/deployments/:id/logs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    return c.body(
      new ReadableStream({
        async start(controller) {
          const stream = createSseStreamWriter(controller, c.req.raw.signal)

          let sentCount = 0
          let lastStatus: string | null = null

          try {
            while (!stream.isClosed()) {
              const logs = await dao.getLogs(id)
              for (const log of logs.slice(sentCount)) {
                stream.send(
                  {
                    level: log.level,
                    message: log.message,
                    createdAt: log.createdAt,
                  },
                  'log',
                )
              }
              sentCount = logs.length

              const current = await dao.findById(id, user.userId)
              if (!current) {
                stream.send({ error: 'Deployment not found' }, 'error')
                break
              }

              if (current.status !== lastStatus) {
                lastStatus = current.status
                stream.send({ status: current.status }, 'status')
              }

              if (isTerminalDeploymentStatus(current.status)) {
                stream.send(
                  {
                    status: current.status,
                    error: current.errorMessage,
                  },
                  'close',
                )
                break
              }

              await delay(1000)
            }
          } catch (err) {
            stream.send(
              {
                error: err instanceof Error ? err.message : 'Failed to stream deployment logs',
              },
              'error',
            )
          } finally {
            stream.close()
          }
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    )
  })

  // ─── Env Vars ──────────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/envvars/:deploymentId
   * Read env vars scoped to a deployment (values masked).
   */
  h.get('/envvars/:deploymentId', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const groupNames = await loadGroupNameLookup(useCase, user.userId)
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope: deploymentId,
    })
    return c.json(
      vars.map(
        ({ encryptedValue: _e, ...rest }: { encryptedValue: string; [key: string]: unknown }) => ({
          ...rest,
          groupName: (rest as { groupId?: string | null }).groupId
            ? (groupNames.get((rest as { groupId?: string }).groupId ?? '') ?? 'default')
            : 'default',
        }),
      ),
    )
  })

  /**
   * GET /api/cloud-saas/envvars/:deploymentId/:key
   * Get a single env var value for a deployment (decrypted, for editing).
   */
  h.get('/envvars/:deploymentId/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const key = c.req.param('key')
    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const groupNames = await loadGroupNameLookup(useCase, user.userId)
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope: deploymentId,
    })
    const found = vars.find((v: { key: string }) => v.key === key)
    if (!found) return c.json({ ok: false, error: 'Not found' }, 404)
    const value = safeDecryptEnvValue(found.encryptedValue, deploymentId, found.key)
    if (value === null) {
      return c.json({ ok: false, error: 'Env var cannot be decrypted' }, 422)
    }
    return c.json({
      envVar: {
        scope: deploymentId,
        key: found.key,
        value,
        isSecret: true,
        groupName: found.groupId ? (groupNames.get(found.groupId) ?? 'default') : 'default',
      },
    })
  })

  /**
   * DELETE /api/cloud-saas/envvars/:deploymentId/:key
   * Delete a single env var for a deployment.
   */
  h.delete('/envvars/:deploymentId/:key', async (c) => {
    const deploymentId = c.req.param('deploymentId')
    const key = c.req.param('key')
    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope: deploymentId,
    })
    const found = vars.find((v: { key: string }) => v.key === key)
    if (found)
      await useCase.deleteEnvVar({ ctx: createActorContext(c.get('actor')), envVarId: found.id })
    return c.json({ ok: true })
  })

  /**
   * GET /api/cloud-saas/deployments/:id/logs/history
   * Return deployment logs as a plain JSON array (non-streaming).
   */
  h.get('/deployments/:id/logs/history', async (c) => {
    const id = c.req.param('id')
    const useCase = container.resolve('cloudSaasUseCase')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const agentParam = c.req.query('agent')
    const podParam = c.req.query('pod')
    const page = clamp(Number.parseInt(c.req.query('page') ?? '1', 10) || 1, 1, 100)
    const limit = clamp(Number.parseInt(c.req.query('limit') ?? '200', 10) || 200, 20, 500)

    if (agentParam || podParam) {
      const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
      const k8sGateway = container.resolve('kubernetesOpsGateway')
      const pods = await k8sGateway.listPods(deployment.namespace, kubeconfig)
      let podName = podParam
      if (!podName && agentParam) {
        podName = pods.find((pod) => pod.name.includes(agentParam))?.name
      }
      if (!podName) {
        podName = pods.find((pod) => pod.status === 'Running')?.name ?? pods[0]?.name
      }

      if (!podName) {
        return c.json({ ok: false, error: 'No pods found for this deployment' }, 404)
      }

      try {
        const requestedTail = page * limit
        const logContainer = agentParam
          ? resolveRuntimeStateTarget(deployment, agentParam).containerName
          : undefined
        const allLines = (
          await k8sGateway
            .readPodLogs({
              namespace: deployment.namespace,
              pod: podName,
              container: logContainer,
              tail: requestedTail,
              timestamps: true,
              kubeconfig,
              timeout: 5_000,
            })
            .catch(() =>
              k8sGateway.readPodLogs({
                namespace: deployment.namespace,
                pod: podName,
                tail: requestedTail,
                timestamps: true,
                kubeconfig,
                timeout: 5_000,
              }),
            )
        )
          .split('\n')
          .map((line) => line.trimEnd())
          .filter(Boolean)

        const start = Math.max(allLines.length - requestedTail, 0)
        const end = Math.max(allLines.length - (page - 1) * limit, 0)

        return c.json({
          namespace: deployment.namespace,
          agent: agentParam ?? podName,
          podName,
          page,
          limit,
          lines: allLines.slice(start, end),
          hasMore: allLines.length >= requestedTail,
        })
      } catch (err) {
        const logs = await dao.getLogs(id)
        const lines = logs.map((l) =>
          l.level ? `[${l.level.toUpperCase()}] ${l.message}` : l.message,
        )
        if (lines.length > 0) {
          return c.json({
            namespace: deployment.namespace,
            agent: agentParam ?? podName,
            podName,
            page,
            limit,
            lines: lines.slice(-limit),
            hasMore: lines.length > limit,
            warning: err instanceof Error ? err.message : String(err),
          })
        }
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          },
          500,
        )
      }
    }

    const logs = await dao.getLogs(id)
    return c.json({
      namespace: deployment.namespace,
      agent: deployment.name,
      podName: deployment.name,
      page,
      limit,
      lines: logs.map((l) => (l.level ? `[${l.level.toUpperCase()}] ${l.message}` : l.message)),
      hasMore: false,
    })
  })

  // ─── Live K8s pod inspection (SaaS) ────────────────────────────────────────

  /**
   * Resolve a deployment's effective kubeconfig (BYOK only). Returns null if
   * the deployment uses the platform's default cluster — callers should then
   * spawn kubectl without `--kubeconfig` and rely on the server's KUBECONFIG
   * env var.
   */
  async function resolveKubeconfig(deployment: {
    clusterId: string | null
  }): Promise<string | null> {
    if (!deployment.clusterId) return null
    const useCase = container.resolve('cloudSaasUseCase')
    const cluster = await useCase.findClusterByIdOnly({
      ctx: createActorContext({ kind: 'system', service: 'cloud-processor', capabilities: [] }),
      clusterId: deployment.clusterId,
    })
    if (!cluster?.kubeconfigEncrypted) return null
    return decrypt(cluster.kubeconfigEncrypted)
  }

  /**
   * GET /api/cloud-saas/deployments/:id/pods
   * List pods running in the deployment's namespace, with status snapshot.
   */
  h.get('/deployments/:id/pods', async (c) => {
    const id = c.req.param('id')
    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
    const pods = await container
      .resolve('kubernetesOpsGateway')
      .listPods(deployment.namespace, kubeconfig)
    return c.json({ pods })
  })

  /**
   * GET /api/cloud-saas/deployments/:id/pod-logs?pod=<name>&tail=200
   * Stream live K8s pod logs over Server-Sent Events.
   *
   * Replaces the stub /logs endpoint that only replayed deploy-script output.
   */
  h.get('/deployments/:id/pod-logs', async (c) => {
    const id = c.req.param('id')
    const podParam = c.req.query('pod')
    const agentParam = c.req.query('agent')
    const tail = Math.min(Number(c.req.query('tail')) || 200, 2000)
    const containerParam = c.req.query('container')

    const useCase = container.resolve('cloudSaasUseCase')
    const deployment = await useCase.getDeployment({
      ctx: createActorContext(c.get('actor')),
      deploymentId: id,
    })
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined

    // If no pod is specified, pick the first running pod in the namespace.
    let pod: string | undefined = podParam
    const k8sGateway = container.resolve('kubernetesOpsGateway')
    const pods = await k8sGateway.listPods(deployment.namespace, kubeconfig)
    if (!pod && agentParam) {
      pod = pods.find((item) => item.name.includes(agentParam))?.name ?? undefined
    }
    if (!pod) {
      pod = pods.find((p) => p.status === 'Running')?.name ?? pods[0]?.name ?? undefined
    }
    if (!pod) {
      return c.json({ ok: false, error: 'No pods found for this deployment' }, 404)
    }
    const logContainer =
      containerParam ??
      (agentParam ? resolveRuntimeStateTarget(deployment, agentParam).containerName : undefined)

    return c.body(
      new ReadableStream({
        async start(controller) {
          const stream = createSseStreamWriter(controller, c.req.raw.signal)

          const { proc, cleanup } = await k8sGateway.streamPodLogs({
            namespace: deployment.namespace,
            pod: pod as string,
            container: logContainer,
            follow: true,
            tail,
            kubeconfig,
          })

          let stdoutBuf = ''
          let stdoutLines = 0
          let stderrText = ''
          proc.stdout?.on('data', (chunk: Buffer) => {
            stdoutBuf += chunk.toString('utf-8')
            const lines = stdoutBuf.split('\n')
            stdoutBuf = lines.pop() ?? ''
            for (const line of lines) {
              if (line.length > 0) {
                stdoutLines += 1
                stream.send({ stream: 'stdout', line })
              }
            }
          })
          proc.stderr?.on('data', (chunk: Buffer) => {
            stderrText += chunk.toString('utf-8')
          })
          proc.on('close', async (code) => {
            if (!stream.isClosed() && stdoutLines === 0 && code !== 0) {
              try {
                const snapshot = await k8sGateway.readPodLogs({
                  namespace: deployment.namespace,
                  pod: pod as string,
                  container: logContainer,
                  tail,
                  timestamps: true,
                  kubeconfig,
                  timeout: 5_000,
                })
                for (const line of snapshot.split('\n').filter(Boolean)) {
                  stream.send({ stream: 'stdout', line })
                }
              } catch {
                stream.send(
                  {
                    stream: 'stderr',
                    line: stderrText.trim() || 'i18n:deployments.liveLogsUnavailableTransport',
                  },
                  'warning',
                )
              }
            } else if (!stream.isClosed() && stderrText.trim()) {
              stream.send({ stream: 'stderr', line: stderrText.trim() }, 'warning')
            }
            stream.send({ exitCode: code ?? 0 }, 'end')
            cleanup()
            stream.close()
          })
          proc.on('error', (err) => {
            stream.send({ error: err.message }, 'error')
            cleanup()
            stream.close()
          })

          // Abort handling: when client disconnects, kill kubectl.
          c.req.raw.signal.addEventListener(
            'abort',
            () => {
              cleanup()
              stream.close()
              try {
                proc.kill('SIGTERM')
              } catch {
                /* ignore */
              }
            },
            { once: true },
          )
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    )
  })

  /**
   * POST /api/cloud-saas/deployments/orphans/:namespace/claim
   * Adopt a Shadow-Cloud-managed namespace that has no DB row.
   * Creates a `cloud_deployments` row owned by the calling user so they can
   * destroy it through the normal flow.
   */
  h.post('/deployments/orphans/:namespace/claim', async (c) => {
    const user = c.get('user') as { userId: string }
    const namespace = c.req.param('namespace')
    const kubernetesOpsGateway = container.resolve('kubernetesOpsGateway')
    const created = await kubernetesOpsGateway.claimManagedOrphanNamespace({
      actor: c.get('actor'),
      ownerUserId: user.userId,
      namespace,
    })
    return c.json({
      ok: true,
      deployment: sanitizeCloudSaasDeploymentForResponse(created),
    })
  })

  /**
   * POST /api/cloud-saas/deployments/orphans/:namespace/cleanup
   * Force-delete an orphan namespace (no DB row). Admin-only safety check
   * is enforced via the namespace managed labels.
   */
  h.post('/deployments/orphans/:namespace/cleanup', async (c) => {
    const namespace = c.req.param('namespace')
    const kubernetesOpsGateway = container.resolve('kubernetesOpsGateway')
    try {
      await kubernetesOpsGateway.cleanupManagedOrphanNamespace({
        actor: c.get('actor'),
        namespace,
      })
      return c.json({ ok: true })
    } catch (err) {
      const status = ((err as { status?: number }).status ?? 500) as 500 | 400 | 403 | 404
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, status)
    }
  })

  /**
   * PUT /api/cloud-saas/envvars/:deploymentId
   * Upsert env vars for a deployment.
   */
  h.put(
    '/envvars/:deploymentId',
    zValidator(
      'json',
      z.object({
        vars: z.array(z.object({ key: z.string().min(1), value: z.string() })),
      }),
    ),
    async (c) => {
      const deploymentId = c.req.param('deploymentId')
      const { vars } = c.req.valid('json')
      const useCase = container.resolve('cloudSaasUseCase')
      const deployment = await useCase.getDeployment({
        ctx: createActorContext(c.get('actor')),
        deploymentId,
      })
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      const { encrypt } = await import('../lib/kms')
      for (const { key, value } of vars) {
        const encryptedValue = encrypt(value)
        const existingVars = await useCase.listEnvVarsByUser({
          ctx: createActorContext(c.get('actor')),
          scope: deploymentId,
        })
        const existing = existingVars.find((v: { key: string }) => v.key === key)
        if (existing) {
          await useCase.updateEnvVar({
            ctx: createActorContext(c.get('actor')),
            id: existing.id,
            encryptedValue,
          })
          continue
        }
        await useCase.createEnvVar({
          ctx: createActorContext(c.get('actor')),
          key,
          encryptedValue,
          scope: deploymentId,
        })
      }
      await useCase.logActivity({
        ctx: createActorContext(c.get('actor')),
        userId: c.get('user').userId,
        type: 'envvar_update',
        meta: { deploymentId, count: vars.length },
      })
      return c.json({ ok: true })
    },
  )

  // ─── Wallet / Balance ──────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/wallet
   * Return current user's Shrimp Coin balance.
   */
  h.get('/wallet', async (c) => {
    const user = c.get('user') as { userId: string }
    const walletService = container.resolve('walletService')
    const wallet = await walletService.getOrCreateWallet(user.userId)
    return c.json({ balance: wallet?.balance ?? 0 })
  })

  // NOTE: POST /wallet/topup intentionally removed.
  // Top-ups must go through Stripe (POST /api/v1/recharge/create-intent).
  // For dev/demo top-ups, see POST /api/admin/wallet/grant (admin-only,
  // additionally guarded by ENABLE_DEV_TOPUP=1).

  /**
   * GET /api/cloud-saas/wallet/transactions
   * Return transaction history for the current user's wallet.
   */
  h.get('/wallet/transactions', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const walletService = container.resolve('walletService')
    const [transactions, total] = await Promise.all([
      walletService.getTransactions(user.userId, limit, offset),
      walletService.getTransactionCount(user.userId),
    ])
    return c.json({ transactions, total, limit, offset })
  })

  // ─── Global Env Vars (not scoped to a single deployment) ──────────────────

  /**
   * GET /api/cloud-saas/global-envvars
   * List global env vars (groups + entries) for the current user.
   */
  h.get('/global-envvars', async (c) => {
    const user = c.get('user') as { userId: string }
    const useCase = container.resolve('cloudSaasUseCase')
    const groupNames = await loadGroupNameLookup(useCase, user.userId)
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope: 'global',
    })
    const persistedGroups = await useCase.listEnvGroupsByUser({
      ctx: createActorContext(c.get('actor')),
    })
    const groups: string[] = [
      'default',
      ...persistedGroups.map((group: { name: string }) => group.name),
      ...vars
        .map((v: { groupId?: string | null }) =>
          v.groupId ? groupNames.get(v.groupId) : 'default',
        )
        .filter((groupName: string | undefined): groupName is string =>
          Boolean(groupName && groupName !== 'default'),
        ),
    ]
    return c.json({
      envVars: vars.map(
        ({ encryptedValue: _e, ...rest }: { encryptedValue: string; [key: string]: unknown }) => ({
          scope: (rest as { scope?: string }).scope ?? 'global',
          key: (rest as { key: string }).key,
          maskedValue: '****',
          isSecret: true,
          groupName: (rest as { groupId?: string | null }).groupId
            ? (groupNames.get((rest as { groupId?: string }).groupId ?? '') ?? 'default')
            : 'default',
        }),
      ),
      groups: [...new Set(groups)],
    })
  })

  h.post(
    '/global-envvars/groups',
    zValidator('json', z.object({ name: z.string().min(1).max(255) })),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const { name } = c.req.valid('json')
      const useCase = container.resolve('cloudSaasUseCase')
      const existing = await useCase.findEnvGroupByName({
        ctx: createActorContext(c.get('actor')),
        name,
      })
      if (existing) {
        return c.json({ ok: true, name: existing.name })
      }
      const created = await useCase.createEnvGroup({
        ctx: createActorContext(c.get('actor')),
        name,
      })
      if (!created) {
        return c.json({ ok: false, error: 'Failed to create env group' }, 500)
      }
      return c.json({ ok: true, name: created.name })
    },
  )

  h.delete('/global-envvars/groups/:name', async (c) => {
    const user = c.get('user') as { userId: string }
    const name = c.req.param('name')
    const useCase = container.resolve('cloudSaasUseCase')
    await useCase.deleteEnvGroupByName({ ctx: createActorContext(c.get('actor')), name })
    return c.json({ ok: true })
  })

  /**
   * PUT /api/cloud-saas/global-envvars
   * Upsert a single global env var.
   */
  h.put(
    '/global-envvars',
    zValidator(
      'json',
      z.object({
        key: z.string().min(1),
        value: z.string(),
        isSecret: z.boolean().optional(),
        groupName: z.string().optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const { key, value, isSecret: _isSecret, groupName } = c.req.valid('json')
      const { encrypt } = await import('../lib/kms')
      const useCase = container.resolve('cloudSaasUseCase')
      const resolvedGroupId = await resolveGroupId(useCase, user.userId, groupName)
      // Upsert pattern via UseCase
      const existing = await useCase.listEnvVarsByUser({
        ctx: createActorContext(c.get('actor')),
        scope: 'global',
      })
      const found = existing.find((v: { key: string }) => v.key === key)
      if (found) {
        await useCase.updateEnvVar({
          ctx: createActorContext(c.get('actor')),
          id: found.id,
          encryptedValue: encrypt(value),
          groupId: resolvedGroupId,
        })
      } else {
        await useCase.createEnvVar({
          ctx: createActorContext(c.get('actor')),
          key,
          encryptedValue: encrypt(value),
          scope: 'global',
          groupId: resolvedGroupId,
        })
      }
      return c.json({ ok: true })
    },
  )

  /**
   * DELETE /api/cloud-saas/global-envvars/:key
   * Delete a global env var.
   */
  h.delete('/global-envvars/:key', async (c) => {
    const key = c.req.param('key')
    const useCase = container.resolve('cloudSaasUseCase')
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope: 'global',
    })
    const found = vars.find((v: { key: string }) => v.key === key)
    if (found)
      await useCase.deleteEnvVar({ ctx: createActorContext(c.get('actor')), envVarId: found.id })
    return c.json({ ok: true })
  })

  /**
   * GET /api/cloud-saas/global-envvars/:key
   * Get a single global env var (value decrypted for display in edit form).
   */
  h.get('/global-envvars/:key', async (c) => {
    const key = c.req.param('key')
    const useCase = container.resolve('cloudSaasUseCase')
    const groupNames = await loadGroupNameLookup(useCase, c.get('user').userId)
    const vars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope: 'global',
    })
    const found = vars.find((v: { key: string }) => v.key === key)
    if (!found) return c.json({ ok: false, error: 'Not found' }, 404)
    const value = safeDecryptEnvValue(found.encryptedValue, 'global', found.key)
    if (value === null) {
      return c.json({ ok: false, error: 'Env var cannot be decrypted' }, 422)
    }
    return c.json({
      envVar: {
        scope: 'global',
        key: found.key,
        value,
        isSecret: true,
        groupName: found.groupId ? (groupNames.get(found.groupId) ?? 'default') : 'default',
      },
    })
  })

  // ─── Provider Catalogs / Profiles ────────────────────────────────────────

  /**
   * GET /api/cloud-saas/provider-catalogs
   * Discover model providers declared by Cloud plugins.
   */
  h.get('/provider-catalogs', async (c) => {
    const catalogs = await listProviderCatalogs()
    return c.json({
      providers: catalogs.map((entry) => ({
        pluginId: entry.pluginId,
        pluginName: entry.pluginName,
        provider: entry.provider,
        secretFields: entry.secretFields,
      })),
    })
  })

  /**
   * GET /api/cloud-saas/provider-profiles
   * List encrypted provider profiles saved by the current user.
   */
  h.get('/provider-profiles', async (c) => {
    const useCase = container.resolve('cloudSaasUseCase')
    return c.json({ profiles: await readProviderProfiles(useCase, c.get('user').userId) })
  })

  /**
   * PUT /api/cloud-saas/provider-profiles
   * Upsert a provider profile into the encrypted env store.
   */
  h.put(
    '/provider-profiles',
    zValidator(
      'json',
      z.object({
        id: z.string().min(1).max(120).optional(),
        providerId: z.string().min(1).max(120),
        name: z.string().min(1).max(255),
        enabled: z.boolean().optional(),
        config: z.record(z.unknown()).optional(),
        envVars: z.record(z.string()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const catalogs = await listProviderCatalogs()
      const providerExists = catalogs.some((entry) => entry.provider.id === input.providerId)
      if (!providerExists) {
        return c.json({ ok: false, error: 'Unknown provider' }, 422)
      }
      const normalizedConfig = validateProviderProfileConfigForSave(input.config)
      if (!normalizedConfig.ok) {
        return c.json({ ok: false, error: normalizedConfig.error }, 422)
      }
      if (typeof normalizedConfig.config.baseUrl === 'string') {
        try {
          await assertSafeHttpUrl(normalizedConfig.config.baseUrl)
        } catch (err) {
          return c.json(
            { ok: false, error: err instanceof Error ? err.message : 'Unsafe Base URL' },
            422,
          )
        }
      }

      const profileId =
        normalizeProviderProfileId(input.id ?? `${input.providerId}-${randomUUID().slice(0, 8)}`) ||
        `${input.providerId}-${randomUUID().slice(0, 8)}`
      const scope = providerProfileScope(profileId)
      const useCase = container.resolve('cloudSaasUseCase')
      const meta: Record<string, string> = {
        [PROVIDER_PROFILE_META_KEYS.id]: profileId,
        [PROVIDER_PROFILE_META_KEYS.providerId]: input.providerId,
        [PROVIDER_PROFILE_META_KEYS.name]: input.name,
        [PROVIDER_PROFILE_META_KEYS.configJson]: JSON.stringify(normalizedConfig.config),
        [PROVIDER_PROFILE_META_KEYS.enabled]: String(input.enabled ?? true),
      }

      for (const [key, value] of Object.entries(meta)) {
        await useCase.upsertEnvVarScoped({
          ctx: createActorContext(c.get('actor')),
          scope,
          key,
          encryptedValue: encrypt(value),
        })
      }

      for (const [key, value] of Object.entries(input.envVars ?? {})) {
        if (!value.trim()) continue
        await useCase.upsertEnvVarScoped({
          ctx: createActorContext(c.get('actor')),
          scope,
          key,
          encryptedValue: encrypt(value),
        })
      }

      const profile = (await readProviderProfiles(useCase, user.userId)).find(
        (p) => p.id === profileId,
      )
      return c.json({ ok: true, profile })
    },
  )

  /**
   * POST /api/cloud-saas/provider-profiles/:id/test
   * Check whether the encrypted provider credentials can reach the provider API.
   */
  h.post('/provider-profiles/:id/test', async (c) => {
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    if (!profileId) return c.json({ ok: false, error: 'Invalid provider profile' }, 400)

    const useCase = container.resolve('cloudSaasUseCase')
    const scopedVars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope: providerProfileScope(profileId),
    })
    if (scopedVars.length === 0) {
      return c.json({ ok: false, error: 'Provider profile not found' }, 404)
    }

    const scope = providerProfileScope(profileId)
    const values = new Map<string, string>()
    for (const variable of scopedVars) {
      const decrypted = safeDecryptProviderValue(variable.encryptedValue, scope, variable.key)
      if (decrypted !== null) values.set(variable.key, decrypted)
    }
    if (!parseProviderProfileEnabled(values.get(PROVIDER_PROFILE_META_KEYS.enabled))) {
      return c.json({
        ok: false,
        status: null,
        message: 'Provider profile is disabled',
        checkedAt: new Date().toISOString(),
      })
    }

    const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId)
    const provider = (await listProviderCatalogs())
      .map((entry) => entry.provider)
      .find((catalog) => catalog.id === providerId)
    if (!provider) return c.json({ ok: false, error: 'Unknown provider' }, 422)

    const config = parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson))
    const safeHttpClient = container.resolve('safeHttpClient')
    return c.json(await testProviderConnection(safeHttpClient, provider, values, config))
  })

  /**
   * POST /api/cloud-saas/provider-profiles/:id/models/refresh
   * Discover models from the provider-native API and persist the result.
   */
  h.post('/provider-profiles/:id/models/refresh', async (c) => {
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    if (!profileId) return c.json({ ok: false, error: 'Invalid provider profile' }, 400)

    const useCase = container.resolve('cloudSaasUseCase')
    const scope = providerProfileScope(profileId)
    const scopedVars = await useCase.listEnvVarsByUser({
      ctx: createActorContext(c.get('actor')),
      scope,
    })
    if (scopedVars.length === 0) {
      return c.json({ ok: false, error: 'Provider profile not found' }, 404)
    }

    const values = new Map<string, string>()
    for (const variable of scopedVars) {
      const decrypted = safeDecryptProviderValue(variable.encryptedValue, scope, variable.key)
      if (decrypted !== null) values.set(variable.key, decrypted)
    }
    const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId)
    const provider = (await listProviderCatalogs())
      .map((entry) => entry.provider)
      .find((catalog) => catalog.id === providerId)
    if (!provider) return c.json({ ok: false, error: 'Unknown provider' }, 422)

    const config = parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson))
    const safeHttpClient = container.resolve('safeHttpClient')
    const result = await discoverProviderProfileModels(safeHttpClient, provider, values, config)
    if (!result.ok) return c.json(result, result.status && result.status >= 400 ? 502 : 200)

    const nextConfig = {
      ...config,
      apiFormat: providerProfileApiFormat(provider, config),
      models: normalizeLlmProviderModels(result.models),
      discoveredAt: new Date().toISOString(),
    }
    await useCase.upsertEnvVarScoped({
      ctx: createActorContext(c.get('actor')),
      scope,
      key: PROVIDER_PROFILE_META_KEYS.configJson,
      encryptedValue: encrypt(JSON.stringify(nextConfig)),
    })

    const profile = (await readProviderProfiles(useCase, c.get('user').userId)).find(
      (p) => p.id === profileId,
    )
    return c.json({ ...result, profile })
  })

  /**
   * DELETE /api/cloud-saas/provider-profiles/:id
   * Delete a saved provider profile and its encrypted values.
   */
  h.delete('/provider-profiles/:id', async (c) => {
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    if (profileId) {
      const useCase = container.resolve('cloudSaasUseCase')
      await useCase.deleteEnvVarByScope({
        ctx: createActorContext(c.get('actor')),
        scope: providerProfileScope(profileId),
      })
    }
    return c.json({ ok: true })
  })

  // ─── Activity ──────────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/activity
   * Current user's cloud activity log.
   */
  h.get('/activity', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const useCase = container.resolve('cloudSaasUseCase')
    return c.json(
      await useCase.listActivity({ ctx: createActorContext(c.get('actor')), limit, offset }),
    )
  })

  return h
}
