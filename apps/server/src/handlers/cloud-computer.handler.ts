import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { posix as posixPath } from 'node:path'
import { sanitizeCloudSaasDeployment } from '@shadowob/cloud'
import { Hono } from 'hono'
import { lookup } from 'mime-types'
import { WebSocket } from 'ws'
import { z } from 'zod'
import type { AppContainer } from '../container'
import {
  resolveCloudComputerBrowserTarget,
  signCloudComputerBrowserSession,
} from '../lib/cloud-computer-browser-session'
import {
  resolveCloudComputerDesktopTarget,
  signCloudComputerDesktopSession,
} from '../lib/cloud-computer-desktop-session'
import {
  cloudComputerEnvironmentKey,
  cloudComputerIdForDeployment,
  cloudComputerWorkspaceId,
  type CloudComputerDeploymentIdentity,
  resolveCloudComputerDeployment,
  selectCloudComputerDeploymentRows,
} from '../lib/cloud-computer-identity'
import { extractCloudProvisionedBuddies } from '../lib/cloud-provisioned-buddies'
import { resolveRuntimeStateTarget } from '../lib/cloud-runtime-state'
import { materializeTemplateI18nPlaceholders } from '../lib/cloud-template-i18n'
import { decrypt } from '../lib/kms'
import { authMiddleware } from '../middleware/auth.middleware'
import { actorLabel, type Actor } from '../security/actor'
import { createActorContext } from '../security/actor-context'
import { buildContentDispositionHeader } from '../services/media.service'
import { createCloudSaasHandler } from './cloud-saas.handler'

const cloudComputerListQuerySchema = z.object({
  includeHistory: z
    .string()
    .optional()
    .transform((value) => value === '1' || value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const activeCloudComputerStatuses = new Set([
  'pending',
  'deploying',
  'cancelling',
  'deployed',
  'paused',
  'resuming',
  'destroying',
  'failed',
])

const CLOUD_COMPUTER_FILE_ID_PREFIX = 'cf_'
const CLOUD_COMPUTER_SIGNED_FILE_TTL_SECONDS = 300
const CLOUD_COMPUTER_FILE_MAX_BYTES = Number(
  process.env.CLOUD_COMPUTER_FILE_MAX_BYTES ?? 25 * 1024 * 1024,
)
const CLOUD_COMPUTER_FILE_MAX_NODES = Number(process.env.CLOUD_COMPUTER_FILE_MAX_NODES ?? 2000)
const CLOUD_COMPUTER_FILE_MAX_DEPTH = Number(process.env.CLOUD_COMPUTER_FILE_MAX_DEPTH ?? 8)
const CLOUD_COMPUTER_FILE_ROOT_CANDIDATES = ['/workspace', '/workspaces', '/home/shadow', '/state']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const createCloudFolderSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
})

const createCloudFileSchema = createCloudFolderSchema

const updateCloudNodeSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  contentRef: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const pasteCloudNodesSchema = z.object({
  sourceWorkspaceId: z.string(),
  targetParentId: z.string().nullable().optional(),
  nodeIds: z.array(z.string().min(1)).min(1).max(50),
  mode: z.enum(['copy', 'cut']),
})

const createWorkspaceMountSchema = z.object({
  serverId: z.string().min(1).max(160),
  rootId: z.string().min(1).max(160).nullable().optional(),
  mountPath: z.string().min(1).max(256).optional(),
  readOnly: z.boolean().optional(),
})

const createCloudComputerSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
  })
  .optional()

const updateCloudComputerSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => value.name !== undefined, {
    message: 'At least one cloud computer setting must be provided',
  })

const createCloudComputerBuddySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  runtimeId: z
    .enum(['openclaw', 'hermes', 'claude-code', 'codex', 'opencode'])
    .optional()
    .default('openclaw'),
})

const browserNavigateSchema = z.object({
  url: z.string().trim().min(1).max(2048),
})

const browserClickSchema = z.object({
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
})

const browserTypeSchema = z.object({
  text: z.string().min(1).max(4000),
})

const browserKeySchema = z.object({
  key: z.string().trim().min(1).max(80),
})

const cloudComputerBackupCreateSchema = z
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

const cloudComputerRestoreSchema = z
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

type CloudComputerDeployment = {
  id: string
  clusterId: string | null
  namespace: string
  name: string
  configSnapshot?: unknown
}

type CloudComputerVncTarget = {
  serviceName: string
  targetPort: number
}

type CloudComputerBrowserTarget = CloudComputerVncTarget & {
  protocol: 'cdp'
}

type CloudComputerFileRuntime = {
  deployment: CloudComputerDeployment
  kubeconfig?: string
  pod: string
  container?: string
  rootPath: string
}

type CloudComputerFileNode = {
  id: string
  workspaceId: string
  parentId: string | null
  kind: 'dir' | 'file'
  name: string
  path: string
  pos: number
  ext: string | null
  mime: string | null
  sizeBytes: number | null
  contentRef: string | null
  previewUrl: string | null
  flags: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  children?: CloudComputerFileNode[]
}

type CloudFileTokenPayload = {
  deploymentId: string
  path: string
  contentType: string
  disposition: 'inline' | 'attachment'
  filename: string
  exp: number
}

type AsyncCacheEntry<T> = {
  expiresAt: number
  promise: Promise<T>
  settled: boolean
}

type ComponentRuntimeCacheEntry = {
  expiresAt: number
}

const CLOUD_COMPUTER_DEPLOYMENT_CACHE_TTL_MS = Number(
  process.env.CLOUD_COMPUTER_DEPLOYMENT_CACHE_TTL_MS ?? 3000,
)
const CLOUD_COMPUTER_FILE_RUNTIME_CACHE_TTL_MS = Number(
  process.env.CLOUD_COMPUTER_FILE_RUNTIME_CACHE_TTL_MS ?? 10_000,
)
const CLOUD_COMPUTER_FILE_LIST_CACHE_TTL_MS = Number(
  process.env.CLOUD_COMPUTER_FILE_LIST_CACHE_TTL_MS ?? 2000,
)
const CLOUD_COMPUTER_COMPONENT_RUNTIME_CACHE_TTL_MS = Number(
  process.env.CLOUD_COMPUTER_COMPONENT_RUNTIME_CACHE_TTL_MS ?? 60_000,
)

const cloudComputerDeploymentCache = new Map<
  string,
  AsyncCacheEntry<CloudComputerDeploymentIdentity | null>
>()
const cloudComputerFileRuntimeCache = new Map<string, AsyncCacheEntry<CloudComputerFileRuntime>>()
const cloudComputerFileListCache = new Map<string, AsyncCacheEntry<CloudComputerFileNode[]>>()
const cloudComputerComponentRuntimeCache = new Map<string, ComponentRuntimeCacheEntry>()

function ttlMs(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function pruneAsyncCache<T>(cache: Map<string, AsyncCacheEntry<T>>) {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (entry.settled && entry.expiresAt <= now) cache.delete(key)
  }
}

function cachedAsync<T>(
  cache: Map<string, AsyncCacheEntry<T>>,
  key: string,
  ttl: number,
  load: () => Promise<T>,
) {
  const cacheTtl = ttlMs(ttl)
  if (cacheTtl === 0) return load()

  const now = Date.now()
  const existing = cache.get(key)
  if (existing && (!existing.settled || existing.expiresAt > now)) return existing.promise

  const promise = load()
  const entry = { expiresAt: now + cacheTtl, promise, settled: false }
  cache.set(key, entry)
  promise.then(
    () => {
      entry.settled = true
    },
    () => {
      entry.settled = true
    },
  )
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key)
  })
  if (cache.size > 500) pruneAsyncCache(cache)
  return promise
}

function deploymentSignature(deployment: CloudComputerDeployment) {
  const record = deployment as Record<string, unknown>
  return [
    deployment.id,
    deployment.clusterId ?? 'platform',
    deployment.namespace,
    record.status ?? '',
    record.updatedAt instanceof Date ? record.updatedAt.toISOString() : (record.updatedAt ?? ''),
  ].join(':')
}

function fileRuntimeCacheKey(deployment: CloudComputerDeployment) {
  return deploymentSignature(deployment)
}

function fileListCacheKey(runtime: CloudComputerFileRuntime) {
  return [
    fileRuntimeCacheKey(runtime.deployment),
    runtime.pod,
    runtime.container ?? '',
    runtime.rootPath,
  ].join(':')
}

function componentRuntimeCacheKey(
  deployment: CloudComputerDeployment,
  component: 'browser' | 'desktop',
  target: CloudComputerBrowserTarget | CloudComputerVncTarget,
) {
  const image =
    component === 'browser'
      ? process.env.CLOUD_COMPUTER_BROWSER_IMAGE
      : process.env.CLOUD_COMPUTER_DESKTOP_IMAGE
  const browserRuntimeVersion =
    component === 'browser'
      ? [
          process.env.CLOUD_COMPUTER_BROWSER_START_COMMAND ?? '',
          process.env.CLOUD_COMPUTER_BROWSER_PROFILE_PVC ?? '',
          process.env.CLOUD_COMPUTER_BROWSER_PROFILE_MOUNT_PATH ?? '',
          process.env.CLOUD_COMPUTER_BROWSER_DOWNLOADS_MOUNT_PATH ?? '',
        ].join(':')
      : ''
  return [
    component,
    deploymentSignature(deployment),
    target.serviceName,
    target.targetPort,
    image ?? '',
    browserRuntimeVersion,
  ].join(':')
}

function knownComponentRuntimeEnsured(
  deployment: CloudComputerDeployment,
  component: 'browser' | 'desktop',
  target: CloudComputerBrowserTarget | CloudComputerVncTarget,
) {
  const entry = cloudComputerComponentRuntimeCache.get(
    componentRuntimeCacheKey(deployment, component, target),
  )
  return Boolean(entry && entry.expiresAt > Date.now())
}

function markComponentRuntimeEnsured(
  deployment: CloudComputerDeployment,
  component: 'browser' | 'desktop',
  target: CloudComputerBrowserTarget | CloudComputerVncTarget,
) {
  const cacheTtl = ttlMs(CLOUD_COMPUTER_COMPONENT_RUNTIME_CACHE_TTL_MS)
  if (cacheTtl === 0) return
  cloudComputerComponentRuntimeCache.set(componentRuntimeCacheKey(deployment, component, target), {
    expiresAt: Date.now() + cacheTtl,
  })
}

function invalidateCloudFileCaches(runtime: CloudComputerFileRuntime) {
  const runtimeKey = fileRuntimeCacheKey(runtime.deployment)
  for (const key of cloudComputerFileListCache.keys()) {
    if (key.startsWith(`${runtimeKey}:`)) cloudComputerFileListCache.delete(key)
  }
}

export function clearCloudComputerPerformanceCaches() {
  cloudComputerDeploymentCache.clear()
  cloudComputerFileRuntimeCache.clear()
  cloudComputerFileListCache.clear()
  cloudComputerComponentRuntimeCache.clear()
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function deploymentAgentCount(deployment: Record<string, unknown>) {
  if (typeof deployment.agentCount === 'number') return deployment.agentCount
  const snapshot = recordValue(deployment.configSnapshot)
  const deployments = recordValue(snapshot?.deployments)
  const agents = deployments?.agents
  return Array.isArray(agents) ? agents.length : 0
}

function deploymentAgentCountFromSnapshot(snapshot: Record<string, unknown>) {
  const deployments = recordValue(snapshot.deployments)
  const agents = deployments?.agents
  return Array.isArray(agents) ? agents.length : 0
}

function cloudComputerRuntimeAgents(deployment: Record<string, unknown>) {
  const snapshot = recordValue(deployment.configSnapshot)
  const deployments = recordValue(snapshot?.deployments)
  const agents = deployments?.agents
  if (!Array.isArray(agents)) return []
  return agents.map((agent, index) => {
    const item = recordValue(agent) ?? {}
    const id = stringValue(item.id) ?? stringValue(item.name) ?? `agent-${index + 1}`
    return {
      id,
      name: stringValue(item.name) ?? id,
      runtime: stringValue(item.runtime) ?? stringValue(item.runner) ?? null,
      connectorStatus: stringValue(item.connectorStatus) ?? 'unknown',
    }
  })
}

function cloneConfigSnapshot(snapshot: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
}

function slugifyCloudComputerBuddyId(input: string) {
  const slug = input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 42)
  if (slug) return slug
  return `buddy-${createHash('sha256').update(input).digest('hex').slice(0, 8)}`
}

function uniqueCloudComputerBuddyId(snapshot: Record<string, unknown>, base: string) {
  const used = new Set<string>()
  const deployments = recordValue(snapshot.deployments)
  const agents = deployments?.agents
  if (Array.isArray(agents)) {
    for (const agent of agents) {
      const id = stringValue(recordValue(agent)?.id)
      if (id) used.add(id)
    }
  }

  const uses = Array.isArray(snapshot.use) ? snapshot.use : []
  for (const plugin of uses) {
    const item = recordValue(plugin)
    if (!item || stringValue(item.plugin) !== 'shadowob') continue
    const options = recordValue(item.options)
    const buddies = options?.buddies
    if (!Array.isArray(buddies)) continue
    for (const buddy of buddies) {
      const id = stringValue(recordValue(buddy)?.id)
      if (id) used.add(id)
    }
  }

  if (!used.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`.slice(0, 48)
    if (!used.has(candidate)) return candidate
  }
  return `${base}-${randomUUID().replace(/-/g, '').slice(0, 6)}`.slice(0, 48)
}

function ensureCloudComputerShadowobPlugin(snapshot: Record<string, unknown>) {
  const uses = Array.isArray(snapshot.use) ? [...snapshot.use] : []
  snapshot.use = uses

  let plugin = uses
    .map((item) => recordValue(item))
    .find((item) => stringValue(item?.plugin) === 'shadowob')
  if (!plugin) {
    plugin = { plugin: 'shadowob', options: {} }
    uses.push(plugin)
  }

  const options = recordValue(plugin.options) ?? {}
  plugin.options = options
  const buddies = Array.isArray(options.buddies) ? [...options.buddies] : []
  const bindings = Array.isArray(options.bindings) ? [...options.bindings] : []
  options.buddies = buddies
  options.bindings = bindings
  return { buddies, bindings }
}

function cloudComputerBuddySystemPrompt(name: string) {
  return [
    `You are ${name}, a Shadow Buddy running inside the user's cloud computer.`,
    'Use the cloud runtime connector to help the user through Shadow conversations.',
    'Be concise, verify before destructive actions, and explain important changes plainly.',
  ].join('\n')
}

function addCloudComputerBuddyToSnapshot(
  snapshot: Record<string, unknown>,
  input: z.infer<typeof createCloudComputerBuddySchema>,
) {
  const next = cloneConfigSnapshot(snapshot)
  const deployments = recordValue(next.deployments) ?? {}
  next.deployments = deployments
  const agents = Array.isArray(deployments.agents) ? [...deployments.agents] : []
  deployments.agents = agents

  const buddyId = uniqueCloudComputerBuddyId(next, slugifyCloudComputerBuddyId(input.name))
  const agentId = buddyId
  const description = input.description || `${input.name} Buddy`

  agents.push({
    id: agentId,
    runtime: input.runtimeId,
    description,
    identity: {
      name: input.name,
      description,
      personality: 'A helpful Shadow Buddy connected to this cloud computer.',
      systemPrompt: cloudComputerBuddySystemPrompt(input.name),
    },
    resources: {
      requests: { cpu: '100m', memory: '256Mi' },
      limits: { cpu: '1000m', memory: '1Gi' },
    },
    configuration: {},
  })

  const { buddies, bindings } = ensureCloudComputerShadowobPlugin(next)
  buddies.push({
    id: buddyId,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
  })
  bindings.push({
    targetId: buddyId,
    targetType: 'buddy',
    servers: [],
    channels: [],
    agentId,
  })

  return {
    configSnapshot: next,
    buddy: {
      id: buddyId,
      name: input.name,
      status: 'pending',
      kernelType: input.runtimeId,
    },
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isI18nPlaceholder(value: string) {
  return /^\$\{i18n:[A-Za-z0-9_.-]+}$/.test(value.trim())
}

function placeholderKey(value: string) {
  const match = /^\$\{i18n:([A-Za-z0-9_.-]+)}$/.exec(value.trim())
  return match?.[1] ?? null
}

function localeCandidates(locale?: string | null) {
  const raw = locale?.split(',')[0]?.trim()
  const normalized = raw?.replace('_', '-')
  const base = normalized?.split('-')[0]
  return [normalized, normalized?.toLowerCase(), base, base?.toLowerCase(), 'en', 'en-US'].filter(
    (item, index, list): item is string => Boolean(item) && list.indexOf(item) === index,
  )
}

function readPath(value: Record<string, unknown> | null, path: string) {
  let current: unknown = value
  for (const segment of path.split('.')) {
    const record = recordValue(current)
    if (!record) return null
    current = record[segment]
  }
  return current
}

function localizedValueFromI18n(
  snapshot: Record<string, unknown> | null,
  key: string,
  locale?: string | null,
) {
  const i18n = recordValue(snapshot?.i18n) ?? recordValue(recordValue(snapshot?.manifest)?.i18n)
  if (!i18n) return null
  for (const candidate of localeCandidates(locale)) {
    const localized = recordValue(i18n[candidate])
    const value = readPath(localized, key) ?? localized?.[key]
    if (typeof value === 'string' && isI18nPlaceholder(value)) continue
    const resolved = localizedString(value, snapshot, key, locale)
    if (resolved) return resolved
  }
  return null
}

function localizedString(
  value: unknown,
  snapshot: Record<string, unknown> | null,
  key: string,
  locale?: string | null,
): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (isI18nPlaceholder(trimmed)) {
      return localizedValueFromI18n(snapshot, placeholderKey(trimmed) ?? key, locale)
    }
    return trimmed
  }
  const record = recordValue(value)
  if (!record) return null
  for (const candidate of localeCandidates(locale)) {
    const localized = stringValue(record[candidate])
    if (localized && !isI18nPlaceholder(localized)) return localized
  }
  const fallback = stringValue(record.default) ?? stringValue(record.en)
  return fallback && !isI18nPlaceholder(fallback) ? fallback : null
}

function materializeCloudComputerSnapshotI18n(
  snapshot: Record<string, unknown>,
  locale?: string | null,
) {
  return materializeTemplateI18nPlaceholders(snapshot, locale, 'Cloud computer template')
}

function usableDisplayName(value: string | null) {
  if (!value || isI18nPlaceholder(value) || /cloud\s*buddy/i.test(value)) return null
  return value
}

function unresolvedDisplayNameI18nKey(
  snapshot: Record<string, unknown> | null,
  locale?: string | null,
) {
  const team = recordValue(snapshot?.team)
  const candidates: Array<[string, unknown]> = [
    ['title', snapshot?.title],
    ['name', snapshot?.name],
    ['team.name', team?.name],
  ]
  for (const [fallbackKey, value] of candidates) {
    const raw = stringValue(value)
    const key = raw && isI18nPlaceholder(raw) ? (placeholderKey(raw) ?? fallbackKey) : null
    if (key && !localizedValueFromI18n(snapshot, key, locale)) return key
  }
  return null
}

function cloudComputerDisplayName(deployment: Record<string, unknown>, locale?: string | null) {
  const namespace =
    stringValue(deployment.namespace) ?? stringValue(deployment.id) ?? 'cloud-computer'
  const snapshot = recordValue(deployment.configSnapshot)
  const team = recordValue(snapshot?.team)
  const deploymentName = localizedString(deployment.name, snapshot, 'title', locale)
  const title =
    localizedString(snapshot?.title, snapshot, 'title', locale) ??
    localizedString(team?.name, snapshot, 'team.name', locale) ??
    localizedValueFromI18n(snapshot, 'title', locale) ??
    localizedValueFromI18n(snapshot, 'name', locale)
  const displayName = usableDisplayName(deploymentName) ?? usableDisplayName(title)
  if (displayName) return displayName
  return namespace
}

function namespaceSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .slice(0, 38) || 'computer'
  )
}

function newCloudComputerNamespace(name: string) {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8)
  return `cc-${namespaceSegment(name)}-${suffix}`.slice(0, 63).replace(/-+$/g, '')
}

function localeFromRequest(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header('accept-language')?.split(',')[0]?.slice(0, 35) ?? null
}

function componentStatus(runtimeEnsured: boolean, repairAvailable: boolean) {
  if (runtimeEnsured) return 'ensured'
  return repairAvailable ? 'repairable' : 'not-configured'
}

function componentRepairPayload(input: {
  component: 'browser' | 'desktop'
  cloudComputerId: string
  runtimeEnsured: boolean
  repairAvailable: boolean
}) {
  return {
    ok: true,
    component: input.component,
    cloudComputerId: input.cloudComputerId,
    runtimeEnsured: input.runtimeEnsured,
    repairAvailable: input.repairAvailable,
    componentStatus: componentStatus(input.runtimeEnsured, input.repairAvailable),
  }
}

function runtimeRepairPayload(input: {
  cloudComputerId: string
  deployment: CloudComputerDeployment
  recoveryAction: 'redeploy' | 'resume'
  body: Record<string, unknown> | null
  status: number
}) {
  return input.body
    ? {
        cloudComputerId: input.cloudComputerId,
        component: 'runtime',
        recoveryAction: input.recoveryAction,
        ok: Boolean(input.body.ok ?? true),
        status: stringValue(input.body.status) ?? undefined,
      }
    : jsonErrorPayload('Failed to repair cloud computer runtime', input.status, {
        cloudComputerId: input.cloudComputerId,
        component: 'runtime',
        recoveryAction: input.recoveryAction,
      })
}

function jsonErrorPayload(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return { ok: false, error: message, status, ...extra }
}

function cloudComputerFacadeBody(
  body: Record<string, unknown>,
  options: { dropId?: boolean } = {},
) {
  const next = { ...body }
  if (options.dropId) delete next.id
  delete next.deploymentId
  delete next.deployment
  delete next.namespace
  delete next.configSnapshot
  delete next.runtime
  return next
}

function agentConfig(agent: Record<string, unknown>) {
  return recordValue(agent.config) ?? {}
}

function configStringAt(value: Record<string, unknown> | null, path: string) {
  const resolved = readPath(value, path)
  return stringValue(resolved)
}

function cloudComputerProvisionedBuddyForAgent(
  agent: Record<string, unknown>,
  deployment: Record<string, unknown>,
) {
  const agentId = stringValue(agent.id)
  const agentUserId = stringValue(agent.userId)
  const deploymentId = stringValue(deployment.id)
  const namespace = stringValue(deployment.namespace)
  return (
    extractCloudProvisionedBuddies(deployment.configSnapshot).find((buddy) => {
      const agentMatches = Boolean(agentId && buddy.agentId === agentId)
      const userMatches = Boolean(agentUserId && buddy.userId === agentUserId)
      if (!agentMatches && !userMatches) return false
      if (buddy.deploymentId && deploymentId && buddy.deploymentId !== deploymentId) return false
      if (buddy.namespace && namespace && buddy.namespace !== namespace) return false
      return true
    }) ?? null
  )
}

function cloudComputerBuddyBinding(
  agent: Record<string, unknown>,
  deployment: Record<string, unknown>,
) {
  const config = agentConfig(agent)
  const cloudComputerId = cloudComputerIdForDeployment(deployment)
  const deploymentId = stringValue(deployment.id)
  const namespace = stringValue(deployment.namespace)
  const runtimeAgents = cloudComputerRuntimeAgents(deployment)
  const runtimeAgentIds = new Set(runtimeAgents.map((runtimeAgent) => runtimeAgent.id))
  const configuredCloudComputerId =
    configStringAt(config, 'cloudComputerId') ??
    configStringAt(config, 'cloudComputer.id') ??
    configStringAt(config, 'connector.cloudComputerId') ??
    configStringAt(config, 'connector.computerId') ??
    configStringAt(config, 'computerId')
  const configuredDeploymentId =
    configStringAt(config, 'cloudDeploymentId') ??
    configStringAt(config, 'deploymentId') ??
    configStringAt(config, 'cloudComputer.deploymentId') ??
    configStringAt(config, 'connector.deploymentId')
  const configuredNamespace =
    configStringAt(config, 'cloudNamespace') ??
    configStringAt(config, 'namespace') ??
    configStringAt(config, 'connector.namespace')
  const runtimeAgentId =
    configStringAt(config, 'runtimeAgentId') ??
    configStringAt(config, 'cloudRuntimeAgentId') ??
    configStringAt(config, 'connector.runtimeAgentId') ??
    configStringAt(config, 'connector.agentId') ??
    configStringAt(config, 'agentId')
  const cloudComputerMatches =
    configuredCloudComputerId === cloudComputerId ||
    (deploymentId ? configuredDeploymentId === deploymentId : false) ||
    (namespace ? configuredNamespace === namespace : false)
  const runtimeAgentMatches = runtimeAgentId ? runtimeAgentIds.has(runtimeAgentId) : false
  const provisionedBuddy = cloudComputerProvisionedBuddyForAgent(agent, deployment)
  if (!cloudComputerMatches && !runtimeAgentMatches && !provisionedBuddy) return null
  return {
    scope: 'cloud-computer',
    cloudComputerId,
    deploymentId,
    namespace,
    runtimeAgentId: runtimeAgentId ?? provisionedBuddy?.id ?? null,
  }
}

function cloudComputerBuddySummary(
  agent: Record<string, unknown>,
  deployment: Record<string, unknown>,
) {
  const binding = cloudComputerBuddyBinding(agent, deployment)
  if (!binding) return null
  const botUser = recordValue(agent.botUser)
  const owner = recordValue(agent.owner)
  const id = stringValue(agent.id)
  if (!id) return null
  return {
    id,
    name:
      stringValue(botUser?.displayName) ??
      stringValue(botUser?.username) ??
      stringValue(agent.name) ??
      id,
    status: stringValue(agent.status) ?? 'unknown',
    kernelType: stringValue(agent.kernelType),
    lastHeartbeat: stringValue(agent.lastHeartbeat),
    botUser: botUser
      ? {
          id: stringValue(botUser.id),
          username: stringValue(botUser.username),
          displayName: stringValue(botUser.displayName),
          avatarUrl: stringValue(botUser.avatarUrl),
        }
      : null,
    owner: owner
      ? {
          id: stringValue(owner.id),
          username: stringValue(owner.username),
          displayName: stringValue(owner.displayName),
          avatarUrl: stringValue(owner.avatarUrl),
        }
      : null,
  }
}

async function listCloudComputerBuddyAgents(
  container: AppContainer,
  ownerId: string,
  deployment: Record<string, unknown>,
) {
  const agentService = container.resolve('agentService')
  const candidates = new Map<string, Record<string, unknown>>()
  const addCandidate = (agent: unknown) => {
    const record = recordValue(agent) ?? {}
    const id = stringValue(record.id)
    if (id) candidates.set(id, record)
  }

  for (const agent of await agentService.getByOwnerId(ownerId)) {
    addCandidate(agent)
  }

  await Promise.all(
    extractCloudProvisionedBuddies(deployment.configSnapshot).map(async (buddy) => {
      const agent = await agentService.getById(buddy.agentId).catch(() => null)
      addCandidate(agent)
    }),
  )

  return Promise.all(
    [...candidates.values()].map(async (agent) => {
      const id = stringValue(agent.id)
      if (!id) return agent
      return (
        ((await agentService.getById(id).catch(() => null)) as Record<string, unknown> | null) ??
        agent
      )
    }),
  )
}

function toCloudComputer(deployment: Record<string, unknown>, locale?: string | null) {
  const sanitized = sanitizeCloudSaasDeployment(deployment)
  const cloudComputerId = cloudComputerIdForDeployment(sanitized)
  return {
    id: cloudComputerId,
    name: cloudComputerDisplayName(sanitized, locale),
    status: String(sanitized.status ?? 'unknown'),
    agentCount: deploymentAgentCount(sanitized),
    createdAt: typeof sanitized.createdAt === 'string' ? sanitized.createdAt : null,
    updatedAt: typeof sanitized.updatedAt === 'string' ? sanitized.updatedAt : null,
    lastActiveAt: typeof sanitized.lastActiveAt === 'string' ? sanitized.lastActiveAt : null,
    errorMessage: typeof sanitized.errorMessage === 'string' ? sanitized.errorMessage : null,
    capabilities: {
      files: true,
      terminal: true,
      browser: true,
      desktop: true,
      buddies: true,
      backups: true,
    },
  }
}

async function requireCloudComputer(container: AppContainer, actor: Actor, id: string) {
  return cachedAsync(
    cloudComputerDeploymentCache,
    `${actorLabel(actor)}:${id}`,
    CLOUD_COMPUTER_DEPLOYMENT_CACHE_TTL_MS,
    () => resolveCloudComputerDeployment(container, actor, id),
  )
}

function vncWebSocketUrl(input: {
  requestUrl: string
  host?: string
  proto?: string
  id: string
  kind: 'desktop' | 'browser'
  token: string
}) {
  const url = new URL(input.requestUrl)
  const proto = input.proto?.split(',')[0]?.trim() || url.protocol.replace(':', '')
  const wsProto = proto === 'https' ? 'wss' : 'ws'
  const host = input.host?.split(',')[0]?.trim() || url.host
  return `${wsProto}://${host}/api/cloud-computers/${encodeURIComponent(input.id)}/${input.kind}/ws?token=${encodeURIComponent(input.token)}`
}

type CloudComputerResourceDefaults = {
  cpuRequest: string
  memoryRequest: string
  cpuLimit: string
  memoryLimit: string
}

function cloudComputerResourceValue(prefix: string, key: string, fallback: string) {
  return process.env[`CLOUD_COMPUTER_${prefix}_${key}`]?.trim() || fallback
}

function cloudComputerComponentResources(
  prefix: 'BROWSER' | 'DESKTOP' | 'WORKSPACE_MOUNT',
  defaults: CloudComputerResourceDefaults,
) {
  return {
    requests: {
      cpu: cloudComputerResourceValue(prefix, 'CPU_REQUEST', defaults.cpuRequest),
      memory: cloudComputerResourceValue(prefix, 'MEMORY_REQUEST', defaults.memoryRequest),
    },
    limits: {
      cpu: cloudComputerResourceValue(prefix, 'CPU_LIMIT', defaults.cpuLimit),
      memory: cloudComputerResourceValue(prefix, 'MEMORY_LIMIT', defaults.memoryLimit),
    },
  }
}

function tcpSocketProbe(
  port: number,
  options: {
    initialDelaySeconds?: number
    periodSeconds?: number
    timeoutSeconds?: number
    failureThreshold?: number
  } = {},
) {
  return {
    tcpSocket: { port },
    initialDelaySeconds: options.initialDelaySeconds ?? 5,
    periodSeconds: options.periodSeconds ?? 10,
    timeoutSeconds: options.timeoutSeconds ?? 2,
    failureThreshold: options.failureThreshold ?? 6,
  }
}

function browserCdpProbe(
  port: number,
  options: {
    initialDelaySeconds?: number
    periodSeconds?: number
    timeoutSeconds?: number
    failureThreshold?: number
  } = {},
) {
  return {
    httpGet: { path: '/json/version', port },
    initialDelaySeconds: options.initialDelaySeconds ?? 5,
    periodSeconds: options.periodSeconds ?? 10,
    timeoutSeconds: options.timeoutSeconds ?? 2,
    failureThreshold: options.failureThreshold ?? 6,
  }
}

async function ensureDesktopRuntime(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  target: CloudComputerVncTarget,
) {
  const image = process.env.CLOUD_COMPUTER_DESKTOP_IMAGE?.trim()
  if (!image) return false
  const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
  const labels = {
    'app.kubernetes.io/name': 'shadow-cloud-computer-desktop',
    'app.kubernetes.io/part-of': 'shadow-cloud-computer',
    'shadowob.com/cloud-computer-id': deployment.id,
  }
  const deploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: target.serviceName,
      namespace: deployment.namespace,
      labels,
    },
    spec: {
      replicas: 1,
      strategy: { type: 'Recreate' },
      selector: { matchLabels: labels },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: 'desktop',
              image,
              imagePullPolicy:
                process.env.CLOUD_COMPUTER_DESKTOP_IMAGE_PULL_POLICY ?? 'IfNotPresent',
              ports: [{ name: 'vnc', containerPort: target.targetPort, protocol: 'TCP' }],
              resources: cloudComputerComponentResources('DESKTOP', {
                cpuRequest: '100m',
                memoryRequest: '256Mi',
                cpuLimit: '1000m',
                memoryLimit: '1536Mi',
              }),
              startupProbe: tcpSocketProbe(target.targetPort, {
                initialDelaySeconds: 2,
                periodSeconds: 2,
                failureThreshold: 60,
              }),
              readinessProbe: tcpSocketProbe(target.targetPort),
              livenessProbe: tcpSocketProbe(target.targetPort, {
                initialDelaySeconds: 30,
                failureThreshold: 6,
              }),
              env: [
                { name: 'SE_VNC_NO_PASSWORD', value: 'true' },
                {
                  name: 'SE_SCREEN_WIDTH',
                  value: process.env.CLOUD_COMPUTER_DESKTOP_WIDTH ?? '1440',
                },
                {
                  name: 'SE_SCREEN_HEIGHT',
                  value: process.env.CLOUD_COMPUTER_DESKTOP_HEIGHT ?? '900',
                },
                {
                  name: 'RESOLUTION',
                  value: `${process.env.CLOUD_COMPUTER_DESKTOP_WIDTH ?? '1440'}x${
                    process.env.CLOUD_COMPUTER_DESKTOP_HEIGHT ?? '900'
                  }`,
                },
              ],
              volumeMounts: [
                { name: 'workspace', mountPath: '/workspace' },
                { name: 'dev-shm', mountPath: '/dev/shm' },
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
              },
            },
          ],
          volumes: [
            { name: 'workspace', emptyDir: {} },
            { name: 'dev-shm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } },
          ],
        },
      },
    },
  }
  const serviceManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: target.serviceName,
      namespace: deployment.namespace,
      labels,
    },
    spec: {
      type: 'ClusterIP',
      selector: labels,
      ports: [
        {
          name: 'vnc',
          port: target.targetPort,
          targetPort: target.targetPort,
          protocol: 'TCP',
        },
      ],
    },
  }
  const k8sGateway = container.resolve('kubernetesOpsGateway')
  await k8sGateway.applyManifest({ manifest: deploymentManifest, kubeconfig, timeout: 30_000 })
  await k8sGateway.applyManifest({ manifest: serviceManifest, kubeconfig, timeout: 30_000 })
  return true
}

function defaultBrowserStartCommand() {
  return [
    'set -eu',
    'profile_dir="${SHADOW_BROWSER_PROFILE_DIR:-/root/.config/google-chrome}"',
    'mkdir -p "$profile_dir" "${SHADOW_BROWSER_DOWNLOADS_DIR:-/root/Downloads}"',
    'rm -f "$profile_dir"/SingletonLock "$profile_dir"/SingletonSocket "$profile_dir"/SingletonCookie',
    'browser_bin="${CHROME_BIN:-${CHROMIUM_PATH:-}}"',
    'if [ -z "$browser_bin" ] || [ ! -x "$browser_bin" ]; then for candidate in google-chrome google-chrome-stable chromium chromium-browser chromium-headless-shell /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/chromium-headless-shell /ms-playwright/chromium-*/chrome-linux/chrome /ms-playwright/chromium-*/chrome-linux/headless_shell; do if command -v "$candidate" >/dev/null 2>&1; then browser_bin="$(command -v "$candidate")"; break; fi; for match in $candidate; do if [ -x "$match" ]; then browser_bin="$match"; break 2; fi; done; done; fi',
    'if [ -z "$browser_bin" ] || [ ! -x "$browser_bin" ]; then echo "No Chrome/Chromium executable found for cloud computer browser" >&2; exit 127; fi',
    'exec "$browser_bin" --headless=new --no-sandbox --no-first-run --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage --disable-extensions --disable-background-networking --disable-sync --disable-component-update --disable-breakpad --disable-crash-reporter --remote-debugging-address=0.0.0.0 --remote-debugging-port="${SHADOW_BROWSER_CDP_PORT:-9222}" --user-data-dir="$profile_dir" --window-size="${SE_SCREEN_WIDTH:-1440},${SE_SCREEN_HEIGHT:-900}" about:blank',
  ].join('\n')
}

function browserStartCommand() {
  const configured = process.env.CLOUD_COMPUTER_BROWSER_START_COMMAND?.trim()
  if (configured === '0') return null
  return configured || defaultBrowserStartCommand()
}

async function ensureBrowserRuntime(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  target: CloudComputerBrowserTarget,
) {
  const image = process.env.CLOUD_COMPUTER_BROWSER_IMAGE?.trim()
  if (!image) return false
  const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
  const labels = {
    'app.kubernetes.io/name': 'shadow-cloud-computer-browser',
    'app.kubernetes.io/part-of': 'shadow-cloud-computer',
    'shadowob.com/cloud-computer-id': deployment.id,
  }
  const profilePvcName =
    process.env.CLOUD_COMPUTER_BROWSER_PROFILE_PVC_NAME?.trim() || `${target.serviceName}-profile`
  const profileMountPath =
    process.env.CLOUD_COMPUTER_BROWSER_PROFILE_MOUNT_PATH?.trim() || '/root/.config/google-chrome'
  const downloadsMountPath =
    process.env.CLOUD_COMPUTER_BROWSER_DOWNLOADS_MOUNT_PATH?.trim() || '/root/Downloads'
  const useProfilePvc = process.env.CLOUD_COMPUTER_BROWSER_PROFILE_PVC !== '0'
  const startCommand = browserStartCommand()
  const profileVolume = useProfilePvc
    ? { name: 'browser-profile', persistentVolumeClaim: { claimName: profilePvcName } }
    : { name: 'browser-profile', emptyDir: {} }
  const profilePvcManifest = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: profilePvcName,
      namespace: deployment.namespace,
      labels,
    },
    spec: {
      accessModes: [process.env.CLOUD_COMPUTER_BROWSER_PROFILE_ACCESS_MODE ?? 'ReadWriteOnce'],
      resources: {
        requests: {
          storage: process.env.CLOUD_COMPUTER_BROWSER_PROFILE_STORAGE ?? '5Gi',
        },
      },
      ...(process.env.CLOUD_COMPUTER_BROWSER_PROFILE_STORAGE_CLASS
        ? { storageClassName: process.env.CLOUD_COMPUTER_BROWSER_PROFILE_STORAGE_CLASS }
        : {}),
    },
  }
  const deploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: target.serviceName,
      namespace: deployment.namespace,
      labels,
    },
    spec: {
      replicas: 1,
      strategy: { type: 'Recreate' },
      selector: { matchLabels: labels },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: 'browser',
              image,
              imagePullPolicy:
                process.env.CLOUD_COMPUTER_BROWSER_IMAGE_PULL_POLICY ?? 'IfNotPresent',
              ...(startCommand ? { command: ['/bin/bash', '-lc'], args: [startCommand] } : {}),
              ports: [{ name: 'cdp', containerPort: target.targetPort, protocol: 'TCP' }],
              resources: cloudComputerComponentResources('BROWSER', {
                cpuRequest: '100m',
                memoryRequest: '256Mi',
                cpuLimit: '1000m',
                memoryLimit: '1Gi',
              }),
              startupProbe: browserCdpProbe(target.targetPort, {
                initialDelaySeconds: 2,
                periodSeconds: 2,
                failureThreshold: 60,
              }),
              readinessProbe: browserCdpProbe(target.targetPort),
              livenessProbe: browserCdpProbe(target.targetPort, {
                initialDelaySeconds: 30,
                failureThreshold: 6,
              }),
              env: [
                { name: 'SE_NODE_SESSION_TIMEOUT', value: '86400' },
                { name: 'SHADOW_BROWSER_CDP_PORT', value: String(target.targetPort) },
                {
                  name: 'DISPLAY',
                  value: process.env.CLOUD_COMPUTER_BROWSER_DISPLAY ?? ':1',
                },
                {
                  name: 'SE_SCREEN_WIDTH',
                  value: process.env.CLOUD_COMPUTER_BROWSER_WIDTH ?? '1440',
                },
                {
                  name: 'SE_SCREEN_HEIGHT',
                  value: process.env.CLOUD_COMPUTER_BROWSER_HEIGHT ?? '900',
                },
                {
                  name: 'RESOLUTION',
                  value: `${process.env.CLOUD_COMPUTER_BROWSER_WIDTH ?? '1440'}x${
                    process.env.CLOUD_COMPUTER_BROWSER_HEIGHT ?? '900'
                  }`,
                },
                { name: 'SHADOW_BROWSER_PROFILE_DIR', value: profileMountPath },
              ],
              volumeMounts: [
                { name: 'browser-profile', mountPath: profileMountPath },
                { name: 'dev-shm', mountPath: '/dev/shm' },
                { name: 'downloads', mountPath: downloadsMountPath },
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
              },
            },
          ],
          volumes: [
            profileVolume,
            { name: 'dev-shm', emptyDir: { medium: 'Memory', sizeLimit: '1Gi' } },
            { name: 'downloads', emptyDir: {} },
          ],
        },
      },
    },
  }
  const serviceManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: target.serviceName,
      namespace: deployment.namespace,
      labels,
    },
    spec: {
      type: 'ClusterIP',
      selector: labels,
      ports: [
        {
          name: 'cdp',
          port: target.targetPort,
          targetPort: target.targetPort,
          protocol: 'TCP',
        },
      ],
    },
  }
  const k8sGateway = container.resolve('kubernetesOpsGateway')
  if (useProfilePvc) {
    await k8sGateway.applyManifest({ manifest: profilePvcManifest, kubeconfig, timeout: 30_000 })
  }
  await k8sGateway.applyManifest({ manifest: deploymentManifest, kubeconfig, timeout: 30_000 })
  await k8sGateway.applyManifest({ manifest: serviceManifest, kubeconfig, timeout: 30_000 })
  return true
}

type BrowserCdpPage = {
  id: string
  type?: string
  title?: string
  url?: string
  webSocketDebuggerUrl?: string
}

type BrowserPageState = {
  title: string
  url: string
}

function normalizeBrowserUrl(input: string) {
  const trimmed = input.trim()
  if (/^(https?:|about:|data:)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

async function browserCdpJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init)
  if (!response.ok) {
    throw Object.assign(new Error(`Browser CDP request failed (${response.status})`), {
      status: 502,
    })
  }
  return response.json() as Promise<T>
}

async function resolveBrowserCdpPage(baseUrl: string): Promise<BrowserCdpPage> {
  const pages = await browserCdpJson<BrowserCdpPage[]>(baseUrl, '/json/list')
  const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl) ?? pages[0]
  if (page?.webSocketDebuggerUrl) return page

  const created = await browserCdpJson<BrowserCdpPage>(
    baseUrl,
    `/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  )
  if (!created.webSocketDebuggerUrl) {
    throw Object.assign(new Error('Browser CDP page is unavailable'), { status: 502 })
  }
  return created
}

function localBrowserWebSocketUrl(webSocketDebuggerUrl: string, localPort: number) {
  const url = new URL(webSocketDebuggerUrl)
  url.protocol = 'ws:'
  url.host = `127.0.0.1:${localPort}`
  return url.toString()
}

class BrowserCdpClient {
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (err: Error) => void }
  >()

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const payload = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)) as {
        id?: number
        result?: Record<string, unknown>
        error?: { message?: string }
      }
      if (!payload.id) return
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      if (payload.error) {
        pending.reject(new Error(payload.error.message ?? 'Browser CDP command failed'))
      } else {
        pending.resolve(payload.result ?? {})
      }
    })
    ws.on('error', (err) => {
      for (const pending of this.pending.values()) pending.reject(err as Error)
      this.pending.clear()
    })
  }

  static connect(url: string) {
    return new Promise<BrowserCdpClient>((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.once('open', () => resolve(new BrowserCdpClient(ws)))
      ws.once('error', (err) => reject(err))
    })
  }

  command(method: string, params?: Record<string, unknown>) {
    const id = this.nextId++
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params: params ?? {} }), (err) => {
        if (!err) return
        this.pending.delete(id)
        reject(err)
      })
    })
  }

  close() {
    this.ws.close()
  }
}

async function withBrowserCdpClient<T>(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  target: CloudComputerBrowserTarget,
  run: (client: BrowserCdpClient, page: BrowserCdpPage) => Promise<T>,
) {
  const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
  const portForward = await container.resolve('kubernetesOpsGateway').portForwardService({
    namespace: deployment.namespace,
    serviceName: target.serviceName,
    targetPort: target.targetPort,
    kubeconfig,
  })
  let client: BrowserCdpClient | null = null
  try {
    const baseUrl = `http://127.0.0.1:${portForward.localPort}`
    const page = await resolveBrowserCdpPage(baseUrl)
    client = await BrowserCdpClient.connect(
      localBrowserWebSocketUrl(page.webSocketDebuggerUrl as string, portForward.localPort),
    )
    await client.command('Page.enable')
    await client.command('Runtime.enable')
    return await run(client, page)
  } finally {
    client?.close()
    portForward.cleanup()
  }
}

async function browserPageState(client: BrowserCdpClient, fallback: BrowserCdpPage) {
  const result = await client.command('Runtime.evaluate', {
    expression: '({ title: document.title || "", url: location.href || "" })',
    returnByValue: true,
  })
  const value = recordValue(recordValue(result.result)?.value)
  return {
    title: stringValue(value?.title) ?? fallback.title ?? '',
    url: stringValue(value?.url) ?? fallback.url ?? 'about:blank',
  }
}

async function captureBrowserScreenshot(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  target: CloudComputerBrowserTarget,
) {
  return withBrowserCdpClient(container, deployment, target, async (client, page) => {
    await client.command('Page.bringToFront')
    const result = await client.command('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    const data = stringValue(result.data)
    if (!data) throw Object.assign(new Error('Browser screenshot is unavailable'), { status: 502 })
    return {
      image: `data:image/png;base64,${data}`,
      page: await browserPageState(client, page),
    }
  })
}

async function runBrowserAction(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  target: CloudComputerBrowserTarget,
  action: (client: BrowserCdpClient) => Promise<void>,
) {
  return withBrowserCdpClient(container, deployment, target, async (client) => {
    await client.command('Page.bringToFront')
    await action(client)
    await new Promise((resolve) => setTimeout(resolve, 150))
    const result = await client.command('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })
    const data = stringValue(result.data)
    if (!data) throw Object.assign(new Error('Browser screenshot is unavailable'), { status: 502 })
    return {
      image: `data:image/png;base64,${data}`,
      page: await browserPageState(client, { id: 'page' }),
    }
  })
}

function workspaceMountName(serverId: string) {
  return `workspace-mount-${createHash('sha256').update(serverId).digest('hex').slice(0, 12)}`
}

function safeWorkspaceMountPath(value: string | undefined, serverId: string) {
  const root = normalizeAbsolutePath(
    process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_ROOT?.trim() || '/workspace/server-workspaces',
  )
  const fallback = posixPath.join(root, serverId)
  return ensurePathWithinRoot(value ? normalizeAbsolutePath(value) : fallback, root)
}

async function resolveWorkspaceMountServer(
  container: AppContainer,
  actor: Actor,
  serverIdOrSlug: string,
) {
  if (actor.kind !== 'user') {
    throw Object.assign(new Error('Workspace mount requires a user session'), { status: 403 })
  }
  const serverDao = container.resolve('serverDao')
  const server = UUID_RE.test(serverIdOrSlug)
    ? await serverDao.findById(serverIdOrSlug)
    : await serverDao.findBySlug(serverIdOrSlug)
  if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
  const permissionService = container.resolve('permissionService')
  await permissionService.requireMember(server.id, actor.userId)
  return server
}

async function ensureWorkspaceMountRuntime(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  input: { serverId: string; rootId?: string | null; mountPath?: string; readOnly?: boolean },
) {
  const image = process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_IMAGE?.trim()
  const serviceName = workspaceMountName(input.serverId)
  const mountPath = safeWorkspaceMountPath(input.mountPath, input.serverId)
  if (!image) {
    return { runtimeEnsured: false, serviceName, mountPath, webdavPort: 8765 }
  }

  const shadowServerUrl =
    process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_SERVER_URL ??
    process.env.SHADOWOB_AGENT_SERVER_URL ??
    process.env.SHADOWOB_SERVER_URL
  if (!shadowServerUrl) {
    throw Object.assign(new Error('Workspace mount server URL is not configured'), { status: 500 })
  }

  const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
  const tokenSecretName =
    process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_TOKEN_SECRET_NAME ?? 'shadowob-workspace-mount'
  const tokenSecretKey =
    process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_TOKEN_SECRET_KEY ?? 'SHADOWOB_TOKEN'
  const k8sGateway = container.resolve('kubernetesOpsGateway')
  const hasTokenSecret = await k8sGateway.hasSecret({
    namespace: deployment.namespace,
    name: tokenSecretName,
    kubeconfig,
    timeout: 10_000,
  })
  if (!hasTokenSecret) {
    return { runtimeEnsured: false, serviceName, mountPath, webdavPort: 8765 }
  }
  const labels = {
    'app.kubernetes.io/name': 'shadow-cloud-computer-workspace-mount',
    'app.kubernetes.io/part-of': 'shadow-cloud-computer',
    'shadowob.com/cloud-computer-id': deployment.id,
    'shadowob.com/server-id': input.serverId,
  }
  const script = [
    'set -eu',
    'shadowob auth login --server-url "$SHADOWOB_SERVER_URL" --token "$SHADOWOB_TOKEN" --profile workspace-mount >/dev/null',
    'if [ -n "${SHADOWOB_WORKSPACE_ROOT_ID:-}" ] && [ "${SHADOWOB_WORKSPACE_READ_ONLY:-0}" = "1" ]; then',
    '  exec shadowob workspace webdav "$SHADOWOB_WORKSPACE_SERVER_ID" --profile workspace-mount --listen 0.0.0.0:8765 --root "$SHADOWOB_WORKSPACE_ROOT_ID" --read-only',
    'elif [ -n "${SHADOWOB_WORKSPACE_ROOT_ID:-}" ]; then',
    '  exec shadowob workspace webdav "$SHADOWOB_WORKSPACE_SERVER_ID" --profile workspace-mount --listen 0.0.0.0:8765 --root "$SHADOWOB_WORKSPACE_ROOT_ID"',
    'elif [ "${SHADOWOB_WORKSPACE_READ_ONLY:-0}" = "1" ]; then',
    '  exec shadowob workspace webdav "$SHADOWOB_WORKSPACE_SERVER_ID" --profile workspace-mount --listen 0.0.0.0:8765 --read-only',
    'else',
    '  exec shadowob workspace webdav "$SHADOWOB_WORKSPACE_SERVER_ID" --profile workspace-mount --listen 0.0.0.0:8765',
    'fi',
  ].join('\n')
  const configMapManifest = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `${serviceName}-config`,
      namespace: deployment.namespace,
      labels,
    },
    data: {
      'start-webdav.sh': script,
    },
  }
  const deploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: serviceName,
      namespace: deployment.namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: labels },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: 'workspace-webdav',
              image,
              imagePullPolicy:
                process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_IMAGE_PULL_POLICY ?? 'IfNotPresent',
              command: ['sh', '/config/start-webdav.sh'],
              ports: [{ name: 'webdav', containerPort: 8765, protocol: 'TCP' }],
              resources: cloudComputerComponentResources('WORKSPACE_MOUNT', {
                cpuRequest: '25m',
                memoryRequest: '64Mi',
                cpuLimit: '250m',
                memoryLimit: '256Mi',
              }),
              startupProbe: tcpSocketProbe(8765, {
                initialDelaySeconds: 2,
                periodSeconds: 2,
                failureThreshold: 30,
              }),
              readinessProbe: tcpSocketProbe(8765),
              livenessProbe: tcpSocketProbe(8765, {
                initialDelaySeconds: 30,
                failureThreshold: 6,
              }),
              env: [
                { name: 'SHADOWOB_SERVER_URL', value: shadowServerUrl },
                { name: 'SHADOWOB_WORKSPACE_SERVER_ID', value: input.serverId },
                { name: 'SHADOWOB_WORKSPACE_ROOT_ID', value: input.rootId ?? '' },
                { name: 'SHADOWOB_WORKSPACE_READ_ONLY', value: input.readOnly ? '1' : '0' },
                { name: 'SHADOWOB_WORKSPACE_MOUNT_PATH', value: mountPath },
                {
                  name: 'SHADOWOB_TOKEN',
                  valueFrom: {
                    secretKeyRef: { name: tokenSecretName, key: tokenSecretKey },
                  },
                },
              ],
              volumeMounts: [{ name: 'config', mountPath: '/config', readOnly: true }],
              securityContext: {
                allowPrivilegeEscalation: false,
              },
            },
          ],
          volumes: [{ name: 'config', configMap: { name: `${serviceName}-config` } }],
        },
      },
    },
  }
  const serviceManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: serviceName,
      namespace: deployment.namespace,
      labels,
    },
    spec: {
      type: 'ClusterIP',
      selector: labels,
      ports: [{ name: 'webdav', port: 8765, targetPort: 8765, protocol: 'TCP' }],
    },
  }
  await k8sGateway.applyManifest({ manifest: configMapManifest, kubeconfig, timeout: 30_000 })
  await k8sGateway.applyManifest({ manifest: deploymentManifest, kubeconfig, timeout: 30_000 })
  await k8sGateway.applyManifest({ manifest: serviceManifest, kubeconfig, timeout: 30_000 })
  return { runtimeEnsured: true, serviceName, mountPath, webdavPort: 8765 }
}

function cloudFileSigningSecret(): string {
  const secret = process.env.CLOUD_COMPUTER_FILE_SIGNING_SECRET ?? process.env.JWT_SECRET
  if (!secret)
    throw Object.assign(new Error('File signing secret is not configured'), { status: 500 })
  return secret
}

function signCloudFileToken(payload: CloudFileTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', cloudFileSigningSecret()).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

function verifyCloudFileToken(token: string): CloudFileTokenPayload {
  const [encoded, sig] = token.split('.')
  if (!encoded || !sig) throw Object.assign(new Error('Invalid file token'), { status: 401 })
  const expected = createHmac('sha256', cloudFileSigningSecret()).update(encoded).digest()
  const actual = Buffer.from(sig, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error('Invalid file token'), { status: 401 })
  }
  const payload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as CloudFileTokenPayload
  if (!payload.deploymentId || !payload.path || Date.now() / 1000 >= payload.exp) {
    throw Object.assign(new Error('Expired file token'), { status: 401 })
  }
  return payload
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function safeName(value: string): string {
  const trimmed = value.trim()
  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('/') ||
    trimmed.includes('\0') ||
    /[\x00-\x1F\x7F]/u.test(trimmed)
  ) {
    throw Object.assign(new Error('Invalid file name'), { status: 400 })
  }
  return trimmed
}

function normalizeAbsolutePath(value: string): string {
  const normalized = posixPath.normalize(value)
  if (!normalized.startsWith('/') || normalized.includes('\0')) {
    throw Object.assign(new Error('Invalid file path'), { status: 400 })
  }
  return normalized
}

function ensurePathWithinRoot(path: string, rootPath: string): string {
  const normalized = normalizeAbsolutePath(path)
  const root = normalizeAbsolutePath(rootPath)
  if (normalized !== root && !normalized.startsWith(`${root}/`)) {
    throw Object.assign(new Error('File path is outside the cloud computer workspace'), {
      status: 403,
    })
  }
  return normalized
}

function encodeFileId(path: string): string {
  return `${CLOUD_COMPUTER_FILE_ID_PREFIX}${Buffer.from(path).toString('base64url')}`
}

function decodeFileId(fileId: string): string {
  if (!fileId.startsWith(CLOUD_COMPUTER_FILE_ID_PREFIX)) {
    throw Object.assign(new Error('Invalid file id'), { status: 400 })
  }
  try {
    return normalizeAbsolutePath(
      Buffer.from(fileId.slice(CLOUD_COMPUTER_FILE_ID_PREFIX.length), 'base64url').toString('utf8'),
    )
  } catch {
    throw Object.assign(new Error('Invalid file id'), { status: 400 })
  }
}

function workspaceIdForCloudComputer(id: string) {
  return `cloud-computer:${id}:files`
}

function displayPath(path: string, rootPath: string) {
  if (path === rootPath) return '/'
  return `/${path.slice(rootPath.length).replace(/^\/+/, '')}`
}

function parentIdForPath(path: string, rootPath: string) {
  if (path === rootPath) return null
  const parent = posixPath.dirname(path)
  return parent === rootPath ? null : encodeFileId(parent)
}

const CLOUD_COMPUTER_TEXT_MIME_BY_EXT: Record<string, string> = {
  '.cts': 'text/x-typescript',
  '.mts': 'text/x-typescript',
  '.ts': 'text/x-typescript',
  '.tsx': 'text/x-tsx',
}

function inferMime(name: string) {
  const sourceMime = CLOUD_COMPUTER_TEXT_MIME_BY_EXT[posixPath.extname(name).toLowerCase()]
  if (sourceMime) return sourceMime
  return (lookup(name) as string | false) || 'application/octet-stream'
}

function extOf(name: string) {
  const ext = posixPath.extname(name)
  return ext || null
}

function nodeFromStat(input: {
  computerId: string
  rootPath: string
  path: string
  kind: 'dir' | 'file'
  size: number
  mtimeSeconds: number
  pos: number
}): CloudComputerFileNode {
  const name = input.path === input.rootPath ? '/' : posixPath.basename(input.path)
  const id = encodeFileId(input.path)
  const updatedAt = new Date(Math.max(input.mtimeSeconds, 0) * 1000).toISOString()
  const mime = input.kind === 'file' ? inferMime(name) : null
  return {
    id,
    workspaceId: workspaceIdForCloudComputer(input.computerId),
    parentId: parentIdForPath(input.path, input.rootPath),
    kind: input.kind,
    name,
    path: displayPath(input.path, input.rootPath),
    pos: input.pos,
    ext: input.kind === 'file' ? extOf(name) : null,
    mime,
    sizeBytes: input.kind === 'file' ? input.size : null,
    contentRef: input.kind === 'file' ? `cloudfs:${id}` : null,
    previewUrl: null,
    flags: null,
    createdAt: updatedAt,
    updatedAt,
  }
}

function parseStatLines(computerId: string, rootPath: string, output: string) {
  return output
    .split('\n')
    .map((line, index) => {
      const parts = line.split('\t')
      if (parts.length < 4) return null
      const [kindRaw, sizeRaw, mtimeRaw, ...pathParts] = parts
      const path = ensurePathWithinRoot(pathParts.join('\t'), rootPath)
      return nodeFromStat({
        computerId,
        rootPath,
        path,
        kind: kindRaw === 'd' ? 'dir' : 'file',
        size: Number(sizeRaw) || 0,
        mtimeSeconds: Number(mtimeRaw) || 0,
        pos: index,
      })
    })
    .filter((node): node is CloudComputerFileNode => Boolean(node))
}

function buildTree(nodes: CloudComputerFileNode[], rootPath: string) {
  const byId = new Map<string, CloudComputerFileNode>()
  for (const node of nodes) {
    const copy: CloudComputerFileNode = { ...node }
    delete copy.children
    byId.set(copy.id, copy)
  }
  const roots: CloudComputerFileNode[] = []
  for (const node of byId.values()) {
    const rawPath = decodeFileId(node.id)
    if (rawPath === rootPath) continue
    if (!node.parentId) {
      roots.push(node)
      continue
    }
    const parent = byId.get(node.parentId)
    if (!parent) {
      roots.push(node)
      continue
    }
    parent.children ??= []
    parent.children.push(node)
  }
  const sortNodes = (items: CloudComputerFileNode[]) => {
    items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const item of items) {
      if (item.children) sortNodes(item.children)
    }
  }
  sortNodes(roots)
  return roots
}

async function resolveDeploymentKubeconfig(
  container: AppContainer,
  deployment: CloudComputerDeployment,
): Promise<string | undefined> {
  if (!deployment.clusterId) return undefined
  const useCase = container.resolve('cloudSaasUseCase')
  const cluster = await useCase.findClusterByIdOnly({
    ctx: createActorContext({ kind: 'system', service: 'cloud-computer-files', capabilities: [] }),
    clusterId: deployment.clusterId,
  })
  if (!cluster?.kubeconfigEncrypted) return undefined
  return decrypt(cluster.kubeconfigEncrypted)
}

async function execRuntimeShell(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  script: string,
  input?: string | Buffer,
) {
  const k8sGateway = container.resolve('kubernetesOpsGateway')
  const command = ['sh', '-lc', script]
  const result =
    input === undefined
      ? await k8sGateway.execInPod({
          namespace: runtime.deployment.namespace,
          pod: runtime.pod,
          container: runtime.container,
          kubeconfig: runtime.kubeconfig,
          timeout: 30_000,
          command,
        })
      : await k8sGateway.execInPodWithInput({
          namespace: runtime.deployment.namespace,
          pod: runtime.pod,
          container: runtime.container,
          kubeconfig: runtime.kubeconfig,
          timeout: 60_000,
          input: typeof input === 'string' ? input : input.toString('base64'),
          command,
        })
  if (result.exitCode !== 0) {
    throw Object.assign(
      new Error(result.stderr.trim() || result.stdout.trim() || 'File operation failed'),
      {
        status: result.exitCode === 44 ? 404 : result.exitCode === 43 ? 413 : 500,
      },
    )
  }
  return result.stdout
}

async function resolveFileRuntime(
  container: AppContainer,
  deploymentInput: unknown,
): Promise<CloudComputerFileRuntime> {
  const deployment = deploymentInput as CloudComputerDeployment
  const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
  const k8sGateway = container.resolve('kubernetesOpsGateway')
  const pods = await k8sGateway.listPods(deployment.namespace, kubeconfig)
  const selectedPod = pods.find((pod) => pod.status === 'Running') ?? pods[0]
  if (!selectedPod) {
    throw Object.assign(new Error('No pods found for this cloud computer'), { status: 404 })
  }
  const target = resolveRuntimeStateTarget(deployment)
  const containerName = selectedPod.containers.includes(target.containerName)
    ? target.containerName
    : selectedPod.containers.length === 1
      ? selectedPod.containers[0]
      : undefined
  const rootCandidates = [
    process.env.CLOUD_COMPUTER_FILE_ROOT?.trim(),
    ...CLOUD_COMPUTER_FILE_ROOT_CANDIDATES,
  ].filter((item): item is string => Boolean(item))
  const rootProbe = rootCandidates
    .map(
      (candidate) =>
        `if [ -d ${shellQuote(candidate)} ]; then printf %s ${shellQuote(candidate)}; exit 0; fi`,
    )
    .join('\n')
  const rootRuntime: CloudComputerFileRuntime = {
    deployment,
    kubeconfig,
    pod: selectedPod.name,
    ...(containerName ? { container: containerName } : {}),
    rootPath: '/',
  }
  const rootPath = normalizeAbsolutePath(
    (
      await execRuntimeShell(
        container,
        rootRuntime,
        `${rootProbe}\nmkdir -p /workspace 2>/dev/null || true\nif [ -d /workspace ]; then printf %s /workspace; else printf %s /tmp; fi`,
      )
    ).trim() || '/tmp',
  )
  return { ...rootRuntime, rootPath }
}

async function listCloudFiles(container: AppContainer, runtime: CloudComputerFileRuntime) {
  const root = shellQuote(runtime.rootPath)
  const maxNodes = Math.max(1, Math.min(CLOUD_COMPUTER_FILE_MAX_NODES, 10_000))
  const maxDepth = Math.max(1, Math.min(CLOUD_COMPUTER_FILE_MAX_DEPTH, 32))
  const script = `
set -eu
mkdir -p ${root}
find ${root} -maxdepth ${maxDepth} | head -n ${maxNodes} | while IFS= read -r p; do
  if [ -d "$p" ]; then k=d; s=0; else k=f; s=$(wc -c < "$p" 2>/dev/null || printf 0); fi
  m=$(date -r "$p" +%s 2>/dev/null || stat -c %Y "$p" 2>/dev/null || printf 0)
  printf '%s\\t%s\\t%s\\t%s\\n' "$k" "$s" "$m" "$p"
done
`
  return parseStatLines(
    cloudComputerIdForDeployment(runtime.deployment),
    runtime.rootPath,
    await execRuntimeShell(container, runtime, script),
  )
}

function resolveFileRuntimeCached(
  container: AppContainer,
  deployment: CloudComputerDeployment,
): Promise<CloudComputerFileRuntime> {
  return cachedAsync(
    cloudComputerFileRuntimeCache,
    fileRuntimeCacheKey(deployment),
    CLOUD_COMPUTER_FILE_RUNTIME_CACHE_TTL_MS,
    () => resolveFileRuntime(container, deployment),
  )
}

function listCloudFilesCached(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
): Promise<CloudComputerFileNode[]> {
  return cachedAsync(
    cloudComputerFileListCache,
    fileListCacheKey(runtime),
    CLOUD_COMPUTER_FILE_LIST_CACHE_TTL_MS,
    () => listCloudFiles(container, runtime),
  )
}

async function statCloudPath(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  path: string,
) {
  const safePath = shellQuote(ensurePathWithinRoot(path, runtime.rootPath))
  const script = `
set -eu
p=${safePath}
if [ ! -e "$p" ]; then exit 44; fi
if [ -d "$p" ]; then k=d; s=0; else k=f; s=$(wc -c < "$p" 2>/dev/null || printf 0); fi
m=$(date -r "$p" +%s 2>/dev/null || stat -c %Y "$p" 2>/dev/null || printf 0)
printf '%s\\t%s\\t%s\\t%s\\n' "$k" "$s" "$m" "$p"
`
  const nodes = parseStatLines(
    cloudComputerIdForDeployment(runtime.deployment),
    runtime.rootPath,
    await execRuntimeShell(container, runtime, script),
  )
  const node = nodes[0]
  if (!node) throw Object.assign(new Error('File not found'), { status: 404 })
  return node
}

function childPath(
  runtime: CloudComputerFileRuntime,
  parentId: string | null | undefined,
  name: string,
) {
  const parentPath = parentId
    ? ensurePathWithinRoot(decodeFileId(parentId), runtime.rootPath)
    : runtime.rootPath
  return ensurePathWithinRoot(posixPath.join(parentPath, safeName(name)), runtime.rootPath)
}

async function writeCloudFileBuffer(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  path: string,
  buffer: Buffer,
) {
  if (buffer.byteLength > CLOUD_COMPUTER_FILE_MAX_BYTES) {
    throw Object.assign(new Error('File is too large'), { status: 413 })
  }
  const safePath = ensurePathWithinRoot(path, runtime.rootPath)
  const script = `
set -eu
p=${shellQuote(safePath)}
d=$(dirname "$p")
mkdir -p "$d"
tmp="$d/.shadow-upload-$$"
base64 -d > "$tmp"
mv "$tmp" "$p"
`
  await execRuntimeShell(container, runtime, script, buffer)
  return statCloudPath(container, runtime, safePath)
}

async function readCloudFileBuffer(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  path: string,
) {
  const safePath = ensurePathWithinRoot(path, runtime.rootPath)
  const script = `
set -eu
p=${shellQuote(safePath)}
if [ ! -f "$p" ]; then exit 44; fi
s=$(wc -c < "$p" 2>/dev/null || printf 0)
if [ "$s" -gt ${CLOUD_COMPUTER_FILE_MAX_BYTES} ]; then exit 43; fi
base64 "$p" | tr -d '\\n'
`
  return Buffer.from((await execRuntimeShell(container, runtime, script)).trim(), 'base64')
}

async function createCloudFolder(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  parentId: string | null | undefined,
  name: string,
) {
  const path = childPath(runtime, parentId, name)
  await execRuntimeShell(container, runtime, `mkdir -p ${shellQuote(path)}`)
  return statCloudPath(container, runtime, path)
}

async function createCloudFile(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  parentId: string | null | undefined,
  name: string,
) {
  const path = childPath(runtime, parentId, name)
  await execRuntimeShell(
    container,
    runtime,
    `p=${shellQuote(path)}; mkdir -p "$(dirname "$p")"; : > "$p"`,
  )
  return statCloudPath(container, runtime, path)
}

async function moveCloudNode(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  nodeId: string,
  input: { parentId?: string | null; name?: string },
) {
  const fromPath = ensurePathWithinRoot(decodeFileId(nodeId), runtime.rootPath)
  const toParent =
    input.parentId !== undefined
      ? input.parentId
        ? ensurePathWithinRoot(decodeFileId(input.parentId), runtime.rootPath)
        : runtime.rootPath
      : posixPath.dirname(fromPath)
  const toName = input.name ? safeName(input.name) : posixPath.basename(fromPath)
  const toPath = ensurePathWithinRoot(posixPath.join(toParent, toName), runtime.rootPath)
  if (toPath !== fromPath) {
    await execRuntimeShell(
      container,
      runtime,
      `src=${shellQuote(fromPath)}; dst=${shellQuote(toPath)}; [ -e "$src" ] || exit 44; mkdir -p "$(dirname "$dst")"; mv "$src" "$dst"`,
    )
  }
  return statCloudPath(container, runtime, toPath)
}

async function deleteCloudNode(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  nodeId: string,
) {
  const path = ensurePathWithinRoot(decodeFileId(nodeId), runtime.rootPath)
  if (path === runtime.rootPath)
    throw Object.assign(new Error('Cannot delete root folder'), { status: 400 })
  await execRuntimeShell(
    container,
    runtime,
    `p=${shellQuote(path)}; [ -e "$p" ] || exit 44; rm -rf "$p"`,
  )
}

async function cloneCloudFile(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  fileId: string,
) {
  const path = ensurePathWithinRoot(decodeFileId(fileId), runtime.rootPath)
  const parsed = posixPath.parse(path)
  const target = ensurePathWithinRoot(
    posixPath.join(parsed.dir, `${parsed.name}-copy${parsed.ext}`),
    runtime.rootPath,
  )
  await execRuntimeShell(
    container,
    runtime,
    `src=${shellQuote(path)}; dst=${shellQuote(target)}; [ -f "$src" ] || exit 44; cp "$src" "$dst"`,
  )
  return statCloudPath(container, runtime, target)
}

async function pasteCloudNodes(
  container: AppContainer,
  runtime: CloudComputerFileRuntime,
  input: z.infer<typeof pasteCloudNodesSchema>,
) {
  const targetParent = input.targetParentId
    ? ensurePathWithinRoot(decodeFileId(input.targetParentId), runtime.rootPath)
    : runtime.rootPath
  const results: CloudComputerFileNode[] = []
  for (const nodeId of input.nodeIds) {
    const source = ensurePathWithinRoot(decodeFileId(nodeId), runtime.rootPath)
    const target = ensurePathWithinRoot(
      posixPath.join(targetParent, posixPath.basename(source)),
      runtime.rootPath,
    )
    if (input.mode === 'cut') {
      await execRuntimeShell(
        container,
        runtime,
        `src=${shellQuote(source)}; dst=${shellQuote(target)}; [ -e "$src" ] || exit 44; mkdir -p "$(dirname "$dst")"; mv "$src" "$dst"`,
      )
      results.push(await statCloudPath(container, runtime, target))
    } else {
      await execRuntimeShell(
        container,
        runtime,
        `src=${shellQuote(source)}; dst=${shellQuote(target)}; [ -e "$src" ] || exit 44; cp -a "$src" "$dst"`,
      )
      results.push(await statCloudPath(container, runtime, target))
    }
  }
  return results
}

export function createCloudComputerHandler(container: AppContainer) {
  const h = new Hono()
  const cloudSaasFacade = createCloudSaasHandler(container)

  h.get('/:id/files/signed/:token', async (c) => {
    const payload = verifyCloudFileToken(c.req.param('token'))
    const deployment = await container
      .resolve('cloudDeploymentDao')
      .findByIdOnly(payload.deploymentId)
    if (!deployment) return c.json({ ok: false, error: 'File not found' }, 404)
    const requestId = c.req.param('id')
    if (requestId !== cloudComputerIdForDeployment(deployment)) {
      return c.json({ ok: false, error: 'File not found' }, 404)
    }
    const runtime = await resolveFileRuntimeCached(container, deployment)
    const buffer = await readCloudFileBuffer(container, runtime, payload.path)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': payload.contentType,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': buildContentDispositionHeader(payload.disposition, payload.filename),
      },
    })
  })

  h.use('*', authMiddleware)

  h.post('/', async (c) => {
    const input = createCloudComputerSchema.parse(await c.req.json().catch(() => ({}))) ?? {}
    const actor = c.get('actor')
    const ctx = createActorContext(actor)
    const useCase = container.resolve('cloudSaasUseCase')
    const requestedTemplateSlug = process.env.CLOUD_COMPUTER_DEFAULT_TEMPLATE_SLUG?.trim()
    const approvedTemplates = requestedTemplateSlug
      ? []
      : await useCase.listApprovedTemplates({ ctx })
    const template = requestedTemplateSlug
      ? await useCase.getTemplateBySlugForUser({ ctx, slug: requestedTemplateSlug })
      : (approvedTemplates.find(
          (candidate: { source?: string }) => candidate.source === 'official',
        ) ??
        approvedTemplates[0] ??
        null)
    if (!template) {
      return c.json({ ok: false, error: 'No cloud computer template is available' }, 422)
    }
    const templateSnapshot = recordValue(template.content)
    if (!templateSnapshot) {
      return c.json({ ok: false, error: 'Cloud computer template is not deployable' }, 422)
    }
    const locale = localeFromRequest(c)
    const unresolvedI18nKey = unresolvedDisplayNameI18nKey(templateSnapshot, locale)
    if (unresolvedI18nKey) {
      return c.json(
        {
          ok: false,
          error: `Cloud computer template i18n key "${unresolvedI18nKey}" is missing`,
        },
        422,
      )
    }
    let configSnapshot: Record<string, unknown>
    try {
      configSnapshot = materializeCloudComputerSnapshotI18n(templateSnapshot, locale)
    } catch (err) {
      return c.json(
        {
          ok: false,
          error:
            err instanceof Error ? err.message : 'Cloud computer template contains unresolved i18n',
        },
        422,
      )
    }

    const name = input.name ?? 'My Cloud Computer'
    const namespace = newCloudComputerNamespace(name)
    const headers = new Headers(c.req.raw.headers)
    headers.set('content-type', 'application/json')
    const response = await cloudSaasFacade.request('/deployments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        namespace,
        name,
        templateSlug: template.slug,
        resourceTier: 'lightweight',
        agentCount: deploymentAgentCount(configSnapshot),
        configSnapshot,
        runtimeContext: {
          locale: c.req.header('accept-language')?.split(',')[0]?.slice(0, 35),
        },
      }),
    })
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok || !body) {
      return c.json(body ?? { ok: false, error: 'Failed to create cloud computer' }, {
        status: response.status as 400,
      })
    }
    return c.json(toCloudComputer(body, localeFromRequest(c)), 201)
  })

  async function requireRuntime(actor: Actor, id: string) {
    const deployment = await requireCloudComputer(container, actor, id)
    if (!deployment) return null
    return resolveFileRuntimeCached(container, deployment)
  }

  h.get('/', async (c) => {
    const parsed = cloudComputerListQuerySchema.safeParse({
      includeHistory: c.req.query('includeHistory'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    })
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    }

    const useCase = container.resolve('cloudSaasUseCase')
    const deployments = await useCase.listDeployments({
      ctx: createActorContext(c.get('actor')),
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    })
    const visibleDeployments = parsed.data.includeHistory
      ? deployments
      : selectCloudComputerDeploymentRows(deployments)
    const computers = visibleDeployments
      .map((deployment) =>
        toCloudComputer(deployment as Record<string, unknown>, localeFromRequest(c)),
      )
      .filter(
        (computer) =>
          parsed.data.includeHistory || activeCloudComputerStatuses.has(computer.status),
      )
    return c.json(computers)
  })

  h.get('/:id', async (c) => {
    const deployment = await requireCloudComputer(container, c.get('actor'), c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    return c.json(toCloudComputer(deployment as Record<string, unknown>, localeFromRequest(c)))
  })

  h.patch('/:id', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer settings require a user-bound actor' }, 403)
    }
    const parsed = updateCloudComputerSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const updated = await container
      .resolve('cloudDeploymentDao')
      .updateName(deployment.id, actor.userId, parsed.data.name ?? deployment.name)
    if (!updated) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    return c.json(toCloudComputer(updated as Record<string, unknown>, localeFromRequest(c)))
  })

  h.get('/:id/backups', async (c) => {
    const actor = c.get('actor')
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const useCase = container.resolve('cloudSaasUseCase')
    const result = await useCase.listDeploymentBackups({
      ctx: createActorContext(actor),
      deploymentId: deployment.id,
      agentId: c.req.query('agentId'),
    })
    if (!result) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    return c.json({
      cloudComputerId: cloudComputerIdForDeployment(deployment),
      backups: result.backups,
    })
  })

  h.post('/:id/backups', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer backup requires a user-bound actor' }, 403)
    }
    const parsed = cloudComputerBackupCreateSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const status = String(deployment.status ?? 'unknown')
    if (status !== 'deployed' && status !== 'paused') {
      return c.json(
        {
          ok: false,
          code: 'cloud_computer_backup_unavailable',
          error: `Cannot back up cloud computer in status "${status}"`,
          cloudComputerId: cloudComputerIdForDeployment(deployment),
          status,
          recoverable: status === 'failed',
          recoveryActions: status === 'failed' ? ['restore-backup'] : ['wait-for-ready'],
          restoreEndpoint: `/api/cloud-computers/${encodeURIComponent(
            cloudComputerIdForDeployment(deployment),
          )}/restore`,
        },
        422,
      )
    }
    const headers = new Headers(c.req.raw.headers)
    headers.delete('content-type')
    headers.delete('content-length')
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/backups`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(parsed.data ?? {}),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    return c.json(
      body
        ? { cloudComputerId, ...cloudComputerFacadeBody(body) }
        : jsonErrorPayload('Failed to create cloud computer backup', response.status, {
            cloudComputerId,
          }),
      { status: response.status as 200 },
    )
  })

  h.post('/:id/restore', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer restore requires a user-bound actor' }, 403)
    }
    const parsed = cloudComputerRestoreSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const headers = new Headers(c.req.raw.headers)
    headers.set('content-type', 'application/json')
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/restore`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(parsed.data ?? {}),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    return c.json(
      body
        ? { cloudComputerId, ...cloudComputerFacadeBody(body, { dropId: true }) }
        : jsonErrorPayload('Failed to restore cloud computer', response.status, {
            cloudComputerId,
          }),
      { status: response.status as 200 },
    )
  })

  h.get('/:id/buddies', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer Buddies require a user-bound actor' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const buddyAgents = await listCloudComputerBuddyAgents(
      container,
      actor.userId,
      deployment as Record<string, unknown>,
    )
    const buddies = buddyAgents
      .map((agent) => cloudComputerBuddySummary(agent, deployment as Record<string, unknown>))
      .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
    return c.json({
      ok: true,
      cloudComputerId: cloudComputerIdForDeployment(deployment),
      buddies,
    })
  })

  h.post('/:id/buddies', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer Buddies require a user-bound actor' }, 403)
    }
    const parsed = createCloudComputerBuddySchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const snapshot = recordValue((deployment as Record<string, unknown>).configSnapshot)
    if (!snapshot) {
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    }

    let baseSnapshot: Record<string, unknown>
    try {
      baseSnapshot = materializeCloudComputerSnapshotI18n(snapshot, localeFromRequest(c))
    } catch (err) {
      return c.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : 'Cloud computer contains unresolved i18n',
        },
        422,
      )
    }

    const { configSnapshot, buddy } = addCloudComputerBuddyToSnapshot(baseSnapshot, parsed.data)
    const headers = new Headers(c.req.raw.headers)
    headers.set('content-type', 'application/json')
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/redeploy`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'snapshot',
          configSnapshot,
        }),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    if (!response.ok) {
      return c.json(
        jsonErrorPayload(
          stringValue(body?.error) ?? 'Failed to add cloud computer Buddy',
          response.status,
          {
            cloudComputerId,
            buddy,
            redeploy: body ? cloudComputerFacadeBody(body, { dropId: true }) : null,
          },
        ),
        { status: response.status as 400 },
      )
    }
    return c.json(
      body
        ? {
            cloudComputerId,
            buddy,
            redeploy: cloudComputerFacadeBody(body, { dropId: true }),
            ok: true,
          }
        : jsonErrorPayload('Failed to add cloud computer Buddy', response.status, {
            cloudComputerId,
            buddy,
          }),
      { status: response.status as 200 },
    )
  })

  h.post('/:id/buddies/:agentId/:action', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer Buddies require a user-bound actor' }, 403)
    }
    const action = c.req.param('action')
    if (action !== 'start' && action !== 'stop') {
      return c.json({ ok: false, error: 'Unsupported Buddy action' }, 404)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const agentService = container.resolve('agentService')
    const agent = (await agentService.getById(c.req.param('agentId'))) as Record<
      string,
      unknown
    > | null
    if (!agent) return c.json({ ok: false, error: 'Buddy not found' }, 404)
    const provisionedBuddy = cloudComputerProvisionedBuddyForAgent(
      agent,
      deployment as Record<string, unknown>,
    )
    if (stringValue(agent.ownerId) !== actor.userId && !provisionedBuddy) {
      return c.json({ ok: false, error: 'Forbidden' }, 403)
    }
    if (!cloudComputerBuddyBinding(agent, deployment as Record<string, unknown>)) {
      return c.json({ ok: false, error: 'Buddy is not connected to this cloud computer' }, 404)
    }
    try {
      const updated =
        action === 'start'
          ? await agentService.start(c.req.param('agentId'))
          : await agentService.stop(c.req.param('agentId'))
      const updatedRecord = recordValue(updated) ?? {}
      return c.json({
        ok: true,
        buddy:
          cloudComputerBuddySummary(
            { ...agent, ...updatedRecord },
            deployment as Record<string, unknown>,
          ) ?? null,
      })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json(
        jsonErrorPayload(err instanceof Error ? err.message : 'Failed to update Buddy', status),
        { status: status as 400 },
      )
    }
  })

  h.post('/:id/runtime/repair', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json(
        { ok: false, error: 'Cloud computer runtime repair requires a user-bound actor' },
        403,
      )
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)

    const headers = new Headers(c.req.raw.headers)
    headers.set('content-type', 'application/json')
    const status = String((deployment as Record<string, unknown>).status ?? 'unknown')
    const recoveryAction = status === 'paused' || status === 'resuming' ? 'resume' : 'redeploy'
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/${recoveryAction}`,
      {
        method: 'POST',
        headers,
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    return c.json(
      runtimeRepairPayload({
        cloudComputerId,
        deployment,
        recoveryAction,
        body,
        status: response.status,
      }),
      { status: response.status as 200 },
    )
  })

  h.post('/:id/desktop/repair', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Desktop repair requires a user session' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerDesktopTarget()
    const repairAvailable = Boolean(process.env.CLOUD_COMPUTER_DESKTOP_IMAGE?.trim())
    if (!repairAvailable) {
      return c.json(
        {
          ok: false,
          code: 'cloud_computer_desktop_repair_not_configured',
          error: 'Desktop repair image is not configured',
          repairAvailable,
          componentStatus: 'not-configured',
        },
        422,
      )
    }
    let runtimeEnsured: boolean
    try {
      runtimeEnsured = await ensureDesktopRuntime(container, deployment, target)
      if (runtimeEnsured) markComponentRuntimeEnsured(deployment, 'desktop', target)
    } catch (err) {
      return c.json(
        {
          ok: false,
          code: 'cloud_computer_desktop_repair_failed',
          error: 'Desktop repair could not be completed',
          params: { cause: err instanceof Error ? err.message : String(err) },
          repairAvailable,
          componentStatus: 'repairable',
        },
        502,
      )
    }
    return c.json(
      componentRepairPayload({
        component: 'desktop',
        cloudComputerId: cloudComputerIdForDeployment(deployment),
        runtimeEnsured,
        repairAvailable,
      }),
    )
  })

  h.post('/:id/browser/repair', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Browser repair requires a user session' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerBrowserTarget()
    const repairAvailable = Boolean(process.env.CLOUD_COMPUTER_BROWSER_IMAGE?.trim())
    if (!repairAvailable) {
      return c.json(
        {
          ok: false,
          code: 'cloud_computer_browser_repair_not_configured',
          error: 'Browser repair image is not configured',
          repairAvailable,
          componentStatus: 'not-configured',
        },
        422,
      )
    }
    let runtimeEnsured: boolean
    try {
      runtimeEnsured = await ensureBrowserRuntime(container, deployment, target)
      if (runtimeEnsured) markComponentRuntimeEnsured(deployment, 'browser', target)
    } catch (err) {
      return c.json(
        {
          ok: false,
          code: 'cloud_computer_browser_repair_failed',
          error: 'Browser repair could not be completed',
          params: { cause: err instanceof Error ? err.message : String(err) },
          repairAvailable,
          componentStatus: 'repairable',
        },
        502,
      )
    }
    return c.json(
      componentRepairPayload({
        component: 'browser',
        cloudComputerId: cloudComputerIdForDeployment(deployment),
        runtimeEnsured,
        repairAvailable,
      }),
    )
  })

  h.post('/:id/desktop/session', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Desktop access requires a user session' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerDesktopTarget()
    const runtimeEnsured = knownComponentRuntimeEnsured(deployment, 'desktop', target)
    const repairAvailable = Boolean(process.env.CLOUD_COMPUTER_DESKTOP_IMAGE?.trim())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const signed = signCloudComputerDesktopSession({
      deploymentId: deployment.id,
      userId: actor.userId,
      namespace: deployment.namespace,
      serviceName: target.serviceName,
      targetPort: target.targetPort,
    })
    return c.json({
      ok: true,
      token: signed.token,
      expiresAt: signed.expiresAt,
      websocketUrl: vncWebSocketUrl({
        requestUrl: c.req.url,
        host: c.req.header('x-forwarded-host') ?? c.req.header('host'),
        proto: c.req.header('x-forwarded-proto'),
        id: cloudComputerId,
        kind: 'desktop',
        token: signed.token,
      }),
      runtimeEnsured,
      repairAvailable,
      componentStatus: componentStatus(runtimeEnsured, repairAvailable),
    })
  })

  h.post('/:id/browser/session', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Browser access requires a user session' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerBrowserTarget()
    const runtimeEnsured = knownComponentRuntimeEnsured(deployment, 'browser', target)
    const repairAvailable = Boolean(process.env.CLOUD_COMPUTER_BROWSER_IMAGE?.trim())
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const signed = signCloudComputerBrowserSession({
      deploymentId: deployment.id,
      userId: actor.userId,
      namespace: deployment.namespace,
      serviceName: target.serviceName,
      targetPort: target.targetPort,
    })
    return c.json({
      ok: true,
      surface: 'cdp',
      token: signed.token,
      expiresAt: signed.expiresAt,
      cloudComputerId,
      page: null,
      endpoints: {
        screenshot: `/api/cloud-computers/${encodeURIComponent(cloudComputerId)}/browser/screenshot`,
        navigate: `/api/cloud-computers/${encodeURIComponent(cloudComputerId)}/browser/navigate`,
        click: `/api/cloud-computers/${encodeURIComponent(cloudComputerId)}/browser/click`,
        type: `/api/cloud-computers/${encodeURIComponent(cloudComputerId)}/browser/type`,
        key: `/api/cloud-computers/${encodeURIComponent(cloudComputerId)}/browser/key`,
      },
      runtimeEnsured,
      repairAvailable,
      componentStatus: componentStatus(runtimeEnsured, repairAvailable),
    })
  })

  h.post('/:id/browser/screenshot', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Browser access requires a user session' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerBrowserTarget()
    try {
      const result = await captureBrowserScreenshot(container, deployment, target)
      markComponentRuntimeEnsured(deployment, 'browser', target)
      return c.json({ ok: true, ...result })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502
      return c.json(
        jsonErrorPayload(err instanceof Error ? err.message : 'Browser unavailable', status),
        {
          status: status as 400,
        },
      )
    }
  })

  h.post('/:id/browser/navigate', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Browser access requires a user session' }, 403)
    }
    const parsed = browserNavigateSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerBrowserTarget()
    try {
      const url = normalizeBrowserUrl(parsed.data.url)
      const result = await runBrowserAction(container, deployment, target, async (client) => {
        await client.command('Page.navigate', { url })
      })
      markComponentRuntimeEnsured(deployment, 'browser', target)
      return c.json({ ok: true, ...result })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502
      return c.json(
        jsonErrorPayload(err instanceof Error ? err.message : 'Browser unavailable', status),
        {
          status: status as 400,
        },
      )
    }
  })

  h.post('/:id/browser/click', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Browser access requires a user session' }, 403)
    }
    const parsed = browserClickSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerBrowserTarget()
    try {
      const result = await runBrowserAction(container, deployment, target, async (client) => {
        await client.command('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: parsed.data.x,
          y: parsed.data.y,
          button: 'left',
          clickCount: 1,
        })
        await client.command('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: parsed.data.x,
          y: parsed.data.y,
          button: 'left',
          clickCount: 1,
        })
      })
      markComponentRuntimeEnsured(deployment, 'browser', target)
      return c.json({ ok: true, ...result })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502
      return c.json(
        jsonErrorPayload(err instanceof Error ? err.message : 'Browser unavailable', status),
        {
          status: status as 400,
        },
      )
    }
  })

  h.post('/:id/browser/type', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Browser access requires a user session' }, 403)
    }
    const parsed = browserTypeSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerBrowserTarget()
    try {
      const result = await runBrowserAction(container, deployment, target, async (client) => {
        await client.command('Input.insertText', { text: parsed.data.text })
      })
      markComponentRuntimeEnsured(deployment, 'browser', target)
      return c.json({ ok: true, ...result })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502
      return c.json(
        jsonErrorPayload(err instanceof Error ? err.message : 'Browser unavailable', status),
        {
          status: status as 400,
        },
      )
    }
  })

  h.post('/:id/browser/key', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Browser access requires a user session' }, 403)
    }
    const parsed = browserKeySchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const target = resolveCloudComputerBrowserTarget()
    try {
      const result = await runBrowserAction(container, deployment, target, async (client) => {
        await client.command('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: parsed.data.key,
        })
        await client.command('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: parsed.data.key,
        })
      })
      markComponentRuntimeEnsured(deployment, 'browser', target)
      return c.json({ ok: true, ...result })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 502
      return c.json(
        jsonErrorPayload(err instanceof Error ? err.message : 'Browser unavailable', status),
        {
          status: status as 400,
        },
      )
    }
  })

  h.post('/:id/workspace-mounts', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json({ ok: false, error: 'Workspace mount requires a user session' }, 403)
    }
    const parsed = createWorkspaceMountSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const server = await resolveWorkspaceMountServer(container, actor, parsed.data.serverId)
    const mount = await ensureWorkspaceMountRuntime(container, deployment, {
      serverId: server.id,
      rootId: parsed.data.rootId,
      mountPath: parsed.data.mountPath,
      readOnly: parsed.data.readOnly,
    })
    return c.json({
      ok: true,
      serverId: server.id,
      serviceName: mount.serviceName,
      mountPath: mount.mountPath,
      webdavUrl: `http://${mount.serviceName}.${deployment.namespace}.svc.cluster.local:${mount.webdavPort}/`,
      mode: 'webdav',
      runtimeEnsured: mount.runtimeEnsured,
      repairAvailable: mount.runtimeEnsured,
      componentStatus: mount.runtimeEnsured ? 'ensured' : 'not-configured',
    })
  })

  h.get('/:id/files', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const now = new Date().toISOString()
    const cloudComputerId = cloudComputerIdForDeployment(runtime.deployment)
    return c.json({
      id: workspaceIdForCloudComputer(cloudComputerId),
      serverId: cloudComputerId,
      name: cloudComputerDisplayName(runtime.deployment as unknown as Record<string, unknown>),
      description: runtime.rootPath,
      createdAt: now,
      updatedAt: now,
    })
  })

  h.get('/:id/files/tree', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const nodes = await listCloudFilesCached(container, runtime)
    return c.json(buildTree(nodes, runtime.rootPath))
  })

  h.get('/:id/files/stats', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const nodes = await listCloudFilesCached(container, runtime)
    const visible = nodes.filter((node) => decodeFileId(node.id) !== runtime.rootPath)
    const folderCount = visible.filter((node) => node.kind === 'dir').length
    const fileCount = visible.filter((node) => node.kind === 'file').length
    return c.json({ folderCount, fileCount, totalCount: folderCount + fileCount })
  })

  h.get('/:id/files/files/search', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const searchText = (c.req.query('searchText') ?? '').toLowerCase()
    const nodes = await listCloudFilesCached(container, runtime)
    return c.json(
      nodes.filter(
        (node) =>
          node.kind === 'file' &&
          node.name.toLowerCase().includes(searchText) &&
          decodeFileId(node.id) !== runtime.rootPath,
      ),
    )
  })

  h.post('/:id/files/folders', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const input = createCloudFolderSchema.parse(await c.req.json())
    const node = await createCloudFolder(container, runtime, input.parentId, input.name)
    invalidateCloudFileCaches(runtime)
    return c.json(node, 201)
  })

  h.patch('/:id/files/folders/:folderId', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const input = updateCloudNodeSchema.parse(await c.req.json())
    const node = await moveCloudNode(container, runtime, c.req.param('folderId'), {
      parentId: input.parentId,
      name: input.name,
    })
    invalidateCloudFileCaches(runtime)
    return c.json(node)
  })

  h.delete('/:id/files/folders/:folderId', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    await deleteCloudNode(container, runtime, c.req.param('folderId'))
    invalidateCloudFileCaches(runtime)
    return c.json({ ok: true })
  })

  h.post('/:id/files/files', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const input = createCloudFileSchema.parse(await c.req.json())
    const node = await createCloudFile(container, runtime, input.parentId, input.name)
    invalidateCloudFileCaches(runtime)
    return c.json(node, 201)
  })

  h.get('/:id/files/files/:fileId/media-url', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const node = await statCloudPath(container, runtime, decodeFileId(c.req.param('fileId')))
    if (node.kind !== 'file') return c.json({ ok: false, error: 'File not found' }, 404)
    const requestedDisposition =
      c.req.query('disposition') === 'attachment' ? 'attachment' : 'inline'
    const activeContent = /(?:html|xml|svg|javascript|ecmascript)/i.test(node.mime ?? '')
    const disposition =
      activeContent && requestedDisposition === 'inline' ? 'attachment' : requestedDisposition
    const exp =
      Math.ceil(Date.now() / 1000 / CLOUD_COMPUTER_SIGNED_FILE_TTL_SECONDS) *
        CLOUD_COMPUTER_SIGNED_FILE_TTL_SECONDS +
      CLOUD_COMPUTER_SIGNED_FILE_TTL_SECONDS
    const token = signCloudFileToken({
      deploymentId: runtime.deployment.id,
      path: decodeFileId(node.id),
      contentType: node.mime ?? 'application/octet-stream',
      disposition,
      filename: node.name,
      exp,
    })
    const cloudComputerId = cloudComputerIdForDeployment(runtime.deployment)
    return c.json({
      url: `/api/cloud-computers/${cloudComputerId}/files/signed/${token}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    })
  })

  h.get('/:id/files/files/:fileId', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    return c.json(await statCloudPath(container, runtime, decodeFileId(c.req.param('fileId'))))
  })

  h.patch('/:id/files/files/:fileId', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const input = updateCloudNodeSchema.parse(await c.req.json())
    let node = await moveCloudNode(container, runtime, c.req.param('fileId'), {
      parentId: input.parentId,
      name: input.name,
    })
    if (input.contentRef) {
      const mediaService = container.resolve('mediaService')
      const buffer = await mediaService.getFileBuffer(input.contentRef)
      if (!buffer) return c.json({ ok: false, error: 'Uploaded content not found' }, 404)
      node = await writeCloudFileBuffer(container, runtime, decodeFileId(node.id), buffer)
    }
    invalidateCloudFileCaches(runtime)
    return c.json(node)
  })

  h.delete('/:id/files/files/:fileId', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    await deleteCloudNode(container, runtime, c.req.param('fileId'))
    invalidateCloudFileCaches(runtime)
    return c.json({ ok: true })
  })

  h.post('/:id/files/files/:fileId/clone', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const node = await cloneCloudFile(container, runtime, c.req.param('fileId'))
    invalidateCloudFileCaches(runtime)
    return c.json(node, 201)
  })

  h.post('/:id/files/upload', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ ok: false, error: 'No file provided' }, 400)
    const parentId = formData.get('parentId') as string | null
    const path = childPath(runtime, parentId, file.name)
    const node = await writeCloudFileBuffer(
      container,
      runtime,
      path,
      Buffer.from(await file.arrayBuffer()),
    )
    invalidateCloudFileCaches(runtime)
    return c.json(node, 201)
  })

  h.post('/:id/files/nodes/paste', async (c) => {
    const runtime = await requireRuntime(c.get('actor'), c.req.param('id'))
    if (!runtime) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const input = pasteCloudNodesSchema.parse(await c.req.json())
    if (
      input.sourceWorkspaceId !==
      workspaceIdForCloudComputer(cloudComputerIdForDeployment(runtime.deployment))
    ) {
      return c.json({ ok: false, error: 'Cross-workspace paste is not supported' }, 422)
    }
    const nodes = await pasteCloudNodes(container, runtime, input)
    invalidateCloudFileCaches(runtime)
    return c.json(nodes)
  })

  return h
}
