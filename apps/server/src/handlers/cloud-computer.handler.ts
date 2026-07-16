import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { connect as connectTcp } from 'node:net'
import { posix as posixPath } from 'node:path'
import {
  CLOUD_SAAS_RUNTIME_KEY,
  extractCloudSaasRuntime,
  getAgentRuntimePlugin,
  getPluginRuntimeVerificationChecks,
  listAgentRuntimePlugins,
  type PluginVerificationCheck,
  sanitizeCloudSaasDeployment,
} from '@shadowob/cloud'
import { CLOUD_COMPUTER_SHELL_COLORS, resolveCloudComputerShellColor } from '@shadowob/shared'
import { Hono } from 'hono'
import { lookup } from 'mime-types'
import { WebSocket } from 'ws'
import { z } from 'zod'
import type { AppContainer } from '../container'
import type { KubernetesOpsGateway } from '../gateways/kubernetes-ops.gateway'
import {
  resolveCloudComputerBrowserTarget,
  signCloudComputerBrowserSession,
} from '../lib/cloud-computer-browser-session'
import {
  cloudComputerBuddyIdentityCleanupQueue,
  enqueueCloudComputerBuddyIdentityCleanup,
  setCloudComputerBuddyRuntimeState,
} from '../lib/cloud-computer-buddy-lifecycle'
import {
  resolveCloudComputerDesktopTarget,
  signCloudComputerDesktopSession,
} from '../lib/cloud-computer-desktop-session'
import {
  type CloudComputerDeploymentIdentity,
  cloudComputerIdentityKey,
  cloudComputerIdForDeployment,
  cloudComputerWorkspaceId,
  resolveCloudComputerDeployment,
  selectCloudComputerDeploymentRows,
} from '../lib/cloud-computer-identity'
import { extractCloudProvisionedBuddies } from '../lib/cloud-provisioned-buddies'
import { listRuntimeStateTargets, resolveRuntimeStateTarget } from '../lib/cloud-runtime-state'
import { materializeTemplateI18nPlaceholders } from '../lib/cloud-template-i18n'
import { decrypt } from '../lib/kms'
import { logger } from '../lib/logger'
import { authMiddleware } from '../middleware/auth.middleware'
import { type Actor, actorLabel } from '../security/actor'
import { createActorContext } from '../security/actor-context'
import { connectorSecretRef } from '../services/cloud-connector.service'
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
const CLOUD_COMPUTER_BASE_TEMPLATE_SLUG = 'cloud-computer-base'
const CLOUD_COMPUTER_SNAPSHOT_SCHEMA_VERSION = 2

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

const createCloudComputerBuddySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  avatarUrl: z.string().trim().min(1).max(100_000).optional(),
  serverId: z.string().uuid().optional(),
  runtimeId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .default('openclaw'),
})

const cloudComputerResourceTierSchema = z.enum(['lightweight', 'standard', 'pro'])
const createCloudComputerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  shellColor: z.enum(CLOUD_COMPUTER_SHELL_COLORS).optional(),
  resourceTier: cloudComputerResourceTierSchema.optional().default('lightweight'),
  buddy: createCloudComputerBuddySchema.optional(),
})

const updateCloudComputerSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    shellColor: z.enum(CLOUD_COMPUTER_SHELL_COLORS).optional(),
  })
  .refine((value) => value.name !== undefined || value.shellColor !== undefined, {
    message: 'At least one cloud computer setting must be provided',
  })

const cloudComputerConfigurationQuoteSchema = z.object({
  resourceTier: cloudComputerResourceTierSchema,
})
const cloudComputerConfigurationApplySchema = z.object({ quoteToken: z.string().min(20) })

type CloudComputerResourceTier = z.infer<typeof cloudComputerResourceTierSchema>

type CloudComputerResourceProfile = {
  id: CloudComputerResourceTier
  cpu: string
  memory: string
  storageGi: number
  baseHourlyCredits: number
  additionalBuddyCredits: number
}

const CLOUD_COMPUTER_PRICING_VERSION = '2026-07-13'
const CLOUD_COMPUTER_RESOURCE_PROFILES: CloudComputerResourceProfile[] = [
  {
    id: 'lightweight',
    cpu: '1 vCPU',
    memory: '2 GiB',
    storageGi: 10,
    baseHourlyCredits: 1,
    additionalBuddyCredits: 1,
  },
  {
    id: 'standard',
    cpu: '2 vCPU',
    memory: '4 GiB',
    storageGi: 25,
    baseHourlyCredits: 2,
    additionalBuddyCredits: 1,
  },
  {
    id: 'pro',
    cpu: '4 vCPU',
    memory: '8 GiB',
    storageGi: 50,
    baseHourlyCredits: 4,
    additionalBuddyCredits: 2,
  },
]

type CloudComputerQuotePayload = {
  cloudComputerId: string
  userId: string
  resourceTier: CloudComputerResourceTier
  pricingVersion: string
  deploymentRevision: string
  buddyCount: number
  hourlyCredits: number
  monthlyCredits: number
  storageGi: number
  exp: number
}

const configureCloudComputerConnectorSchema = z.object({
  credentials: z.record(z.string(), z.unknown()).optional(),
  options: z.record(z.string(), z.unknown()).optional().default({}),
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
  status?: string
  configSnapshot?: unknown
  errorMessage?: string | null
  hourlyCost?: number | null
  monthlyCost?: number | null
  resourceTier?: string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  lastActiveAt?: Date | string | null
}

type CloudComputerCapabilityState = 'ready' | 'preparing' | 'paused' | 'repairable' | 'unavailable'

type CloudComputerReadiness = {
  state: CloudComputerCapabilityState
  reason: string | null
  action: string | null
}

export function cloudComputerFailureReason(errorMessage: unknown) {
  const message = stringValue(errorMessage)?.toLowerCase() ?? ''
  if (message.startsWith('destroy:')) return 'delete_failed'
  if (
    message.includes('legacy cloud computer billing policy') ||
    message.includes('cloud computer runtime removed')
  ) {
    return 'runtime_removed'
  }
  if (/balance|credit|insufficient|wallet|payment|billing/.test(message)) {
    return 'insufficient_balance'
  }
  if (/cluster|kubernetes|kubeconfig|namespace|node/.test(message)) return 'cluster_unavailable'
  if (/image|pull|registry/.test(message)) return 'image_unavailable'
  if (/plugin|connector|dependency|install/.test(message)) return 'extension_install_failed'
  if (/timeout|timed out/.test(message)) return 'operation_timed_out'
  return message ? 'runtime_failed' : 'unknown_failure'
}

export function cloudComputerOperation(
  status: string,
  errorMessage?: string | null,
  deploymentSource?: string | null,
) {
  const isUpdating = Boolean(deploymentSource && deploymentSource !== 'create')
  const operations: Record<
    string,
    { kind: string; stage: string; progress: number; cancellable: boolean }
  > = {
    pending: isUpdating
      ? { kind: 'update', stage: 'changes_queued', progress: 5, cancellable: true }
      : { kind: 'create', stage: 'queued', progress: 5, cancellable: true },
    deploying: isUpdating
      ? { kind: 'update', stage: 'applying_changes', progress: 55, cancellable: true }
      : { kind: 'create', stage: 'preparing_runtime', progress: 55, cancellable: true },
    cancelling: { kind: 'cancel', stage: 'stopping_operation', progress: 75, cancellable: false },
    resuming: { kind: 'resume', stage: 'starting_runtime', progress: 60, cancellable: false },
    destroying: { kind: 'delete', stage: 'stopping_buddies', progress: 25, cancellable: false },
  }
  if (status === 'destroying') {
    const destroyOperations: Record<
      string,
      { kind: string; stage: string; progress: number; cancellable: boolean }
    > = {
      'destroy:queued': {
        kind: 'delete',
        stage: 'delete_queued',
        progress: 10,
        cancellable: false,
      },
      'destroy:retry_queued': {
        kind: 'delete',
        stage: 'delete_queued',
        progress: 10,
        cancellable: false,
      },
      'destroy:stopping_runtime': {
        kind: 'delete',
        stage: 'stopping_buddies',
        progress: 25,
        cancellable: false,
      },
      'destroy:removing_resources': {
        kind: 'delete',
        stage: 'removing_resources',
        progress: 55,
        cancellable: false,
      },
      'destroy:cleaning_state': {
        kind: 'delete',
        stage: 'cleaning_state',
        progress: 80,
        cancellable: false,
      },
      'destroy:finalizing': {
        kind: 'delete',
        stage: 'finalizing_delete',
        progress: 95,
        cancellable: false,
      },
    }
    const destroyPhase = errorMessage?.startsWith('destroy:queued:')
      ? 'destroy:queued'
      : (errorMessage ?? '')
    return destroyOperations[destroyPhase] ?? operations.destroying
  }
  return operations[status] ?? null
}

function capabilityStateForStatus(
  status: string,
  options: { configured?: boolean; recoverable?: boolean; availableWhilePaused?: boolean } = {},
): CloudComputerCapabilityState {
  if (options.configured === false) return 'unavailable'
  if (status === 'deployed') return 'ready'
  if (status === 'paused') return options.availableWhilePaused ? 'ready' : 'paused'
  if (status === 'failed') return options.recoverable === false ? 'unavailable' : 'repairable'
  if (['pending', 'deploying', 'resuming', 'cancelling', 'destroying'].includes(status)) {
    return 'preparing'
  }
  return 'unavailable'
}

function runtimeReadiness(status: string, failureReason: string | null): CloudComputerReadiness {
  const state = capabilityStateForStatus(status)
  if (state === 'ready') return { state, reason: null, action: null }
  if (state === 'paused') return { state, reason: 'runtime_paused', action: 'resume' }
  if (state === 'preparing') return { state, reason: 'runtime_preparing', action: 'wait' }
  if (state === 'repairable') {
    return {
      state,
      reason: failureReason ?? 'runtime_failed',
      action:
        failureReason === 'runtime_removed'
          ? 'rebuild-runtime'
          : failureReason === 'delete_failed'
            ? 'retry-delete'
            : 'repair-runtime',
    }
  }
  return { state, reason: 'runtime_unavailable', action: 'rebuild-runtime' }
}

function configuredComponentReadiness(
  status: string,
  configured: boolean,
  failureReason: string | null,
): CloudComputerReadiness {
  if (!configured) {
    return { state: 'unavailable', reason: 'component_not_configured', action: null }
  }
  return runtimeReadiness(status, failureReason)
}

function backupReadiness(status: string, failureReason: string | null): CloudComputerReadiness {
  if (status === 'deployed' || status === 'paused') {
    return { state: 'ready', reason: null, action: null }
  }
  if (status === 'failed') {
    return {
      state: 'repairable',
      reason: failureReason ?? 'runtime_failed',
      action: 'restore-backup',
    }
  }
  if (['pending', 'deploying', 'resuming', 'cancelling', 'destroying'].includes(status)) {
    return { state: 'preparing', reason: 'runtime_preparing', action: 'wait' }
  }
  return { state: 'unavailable', reason: 'runtime_unavailable', action: null }
}

function ensureCloudComputerWorkspaceSnapshot(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const workspace = recordValue(snapshot.workspace) ?? {}
  const cloudComputer = recordValue(snapshot.cloudComputer) ?? {}
  const use = Array.isArray(snapshot.use) ? [...snapshot.use] : []
  if (!use.some((entry) => stringValue(recordValue(entry)?.plugin) === 'model-provider')) {
    use.unshift({ plugin: 'model-provider' })
  }
  const runtime = recordValue(snapshot[CLOUD_SAAS_RUNTIME_KEY]) ?? {}
  return {
    ...snapshot,
    use,
    workspace: {
      ...workspace,
      enabled: true,
      mountPath: '/workspace',
      storageSize: stringValue(workspace.storageSize) ?? '10Gi',
      accessMode: stringValue(workspace.accessMode) ?? 'ReadWriteOnce',
    },
    cloudComputer,
    [CLOUD_SAAS_RUNTIME_KEY]: {
      ...runtime,
      modelProviderMode: 'official',
    },
  }
}

function prepareCloudComputerRedeploySnapshot(snapshot: Record<string, unknown>) {
  const declarativeSnapshot = extractCloudSaasRuntime(snapshot).configSnapshot ?? snapshot
  return ensureCloudComputerWorkspaceSnapshot(
    migrateCloudComputerSnapshot(declarativeSnapshot).configSnapshot,
  )
}

/** Migrate legacy topology once; Runtime inventory does not own Buddy membership. */
export function migrateCloudComputerSnapshot(snapshot: Record<string, unknown>): {
  configSnapshot: Record<string, unknown>
  removedBuddyIds: string[]
} {
  const next = cloneConfigSnapshot(snapshot)
  const { overlay, runtimes } = cloudComputerRuntimeOverlay(next)
  const alreadyCurrent = overlay.schemaVersion === CLOUD_COMPUTER_SNAPSHOT_SCHEMA_VERSION
  next.cloudComputer = {
    ...overlay,
    schemaVersion: CLOUD_COMPUTER_SNAPSHOT_SCHEMA_VERSION,
    runtimes: runtimes.map(({ buddyIds: _legacyBuddyIds, ...runtime }) => runtime),
  }
  if (alreadyCurrent) return { configSnapshot: next, removedBuddyIds: [] }

  const use = Array.isArray(next.use) ? [...next.use] : []
  const shadowobIndex = use.findIndex(
    (entry) => stringValue(recordValue(entry)?.plugin) === 'shadowob',
  )
  if (shadowobIndex < 0) return { configSnapshot: next, removedBuddyIds: [] }

  const shadowob = recordValue(use[shadowobIndex]) ?? {}
  const options = recordValue(shadowob.options) ?? {}
  const declaredServerIds = new Set(
    (Array.isArray(options.servers) ? options.servers : [])
      .map((server) => stringValue(recordValue(server)?.id))
      .filter((id): id is string => Boolean(id)),
  )
  const protectedBuddyIds = new Set(
    runtimes.flatMap((runtime) =>
      Array.isArray(runtime.buddyIds)
        ? runtime.buddyIds.filter((id): id is string => typeof id === 'string')
        : [],
    ),
  )
  const bindings = (Array.isArray(options.bindings) ? options.bindings : []).map(
    (binding) => recordValue(binding) ?? {},
  )
  const removedBindings: Record<string, unknown>[] = []
  const retainedBindings: Record<string, unknown>[] = []

  for (const binding of bindings) {
    const targetId = stringValue(binding.targetId)
    const servers = Array.isArray(binding.servers)
      ? binding.servers.filter((id): id is string => typeof id === 'string')
      : []
    const validServers = servers.filter(
      (serverId) => UUID_RE.test(serverId) || declaredServerIds.has(serverId),
    )
    if (validServers.length === servers.length) {
      retainedBindings.push(binding)
      continue
    }
    if (targetId && protectedBuddyIds.has(targetId)) {
      retainedBindings.push({ ...binding, servers: validServers })
      continue
    }
    removedBindings.push(binding)
  }

  if (removedBindings.length === 0) return { configSnapshot: next, removedBuddyIds: [] }

  const retainedTargetIds = new Set(
    retainedBindings
      .map((binding) => stringValue(binding.targetId))
      .filter((id): id is string => Boolean(id)),
  )
  const retainedAgentIds = new Set(
    retainedBindings
      .map((binding) => stringValue(binding.agentId))
      .filter((id): id is string => Boolean(id)),
  )
  const removedBuddyIds = Array.from(
    new Set(
      removedBindings
        .map((binding) => stringValue(binding.targetId))
        .filter(
          (id): id is string =>
            id !== null && !retainedTargetIds.has(id) && !protectedBuddyIds.has(id),
        ),
    ),
  )
  const removedAgentIds = new Set(
    removedBindings
      .map((binding) => stringValue(binding.agentId))
      .filter(
        (id): id is string =>
          id !== null && !retainedAgentIds.has(id) && !protectedBuddyIds.has(id),
      ),
  )
  const buddies = (Array.isArray(options.buddies) ? options.buddies : []).filter(
    (buddy) => !removedBuddyIds.includes(stringValue(recordValue(buddy)?.id) ?? ''),
  )
  use[shadowobIndex] = {
    ...shadowob,
    options: { ...options, buddies, bindings: retainedBindings },
  }

  const deployments = recordValue(next.deployments) ?? {}
  const agents = (Array.isArray(deployments.agents) ? deployments.agents : []).filter(
    (agent) => !removedAgentIds.has(stringValue(recordValue(agent)?.id) ?? ''),
  )
  next.use = use
  next.deployments = { ...deployments, agents }
  return { configSnapshot: next, removedBuddyIds }
}

function cloudComputerSharedWorkspacePvc(deployment: CloudComputerDeployment) {
  const snapshot = recordValue(deployment.configSnapshot)
  const workspace = recordValue(snapshot?.workspace)
  if (workspace?.enabled === true) return 'shared-workspace'
  return resolveRuntimeStateTarget(deployment).pvcName
}

function cloudComputerRuntimeOverlay(snapshot: Record<string, unknown>) {
  const overlay = recordValue(snapshot.cloudComputer) ?? {}
  const components = recordValue(overlay.components) ?? {}
  const workspaceMounts = Array.isArray(overlay.workspaceMounts)
    ? overlay.workspaceMounts.filter((mount): mount is Record<string, unknown> =>
        Boolean(mount && typeof mount === 'object' && !Array.isArray(mount)),
      )
    : []
  const runtimes = Array.isArray(overlay.runtimes)
    ? overlay.runtimes.filter((runtime): runtime is Record<string, unknown> =>
        Boolean(runtime && typeof runtime === 'object' && !Array.isArray(runtime)),
      )
    : []
  return { overlay, components, workspaceMounts, runtimes }
}

function cloudComputerResourceProfile(tier: string | null | undefined) {
  return (
    CLOUD_COMPUTER_RESOURCE_PROFILES.find((profile) => profile.id === tier) ??
    CLOUD_COMPUTER_RESOURCE_PROFILES[0]!
  )
}

function cloudComputerTierRank(tier: string | null | undefined) {
  return { lightweight: 0, standard: 1, pro: 2 }[tier ?? 'lightweight'] ?? 0
}

function cloudComputerHourlyCredits(profile: CloudComputerResourceProfile, buddyCount: number) {
  return profile.baseHourlyCredits + Math.max(0, buddyCount) * profile.additionalBuddyCredits
}

function cloudComputerK8sResources(profile: CloudComputerResourceProfile) {
  return profile.id === 'pro'
    ? { requests: { cpu: '1000m', memory: '2Gi' }, limits: { cpu: '4000m', memory: '8Gi' } }
    : profile.id === 'standard'
      ? { requests: { cpu: '500m', memory: '1Gi' }, limits: { cpu: '2000m', memory: '4Gi' } }
      : { requests: { cpu: '250m', memory: '512Mi' }, limits: { cpu: '1000m', memory: '2Gi' } }
}

function cloudComputerQuote(
  deployment: Record<string, unknown>,
  userId: string,
  tier: CloudComputerResourceTier,
) {
  const profile = cloudComputerResourceProfile(tier)
  const snapshot = recordValue(deployment.configSnapshot)
  const workspace = recordValue(snapshot?.workspace)
  const currentStorage = Number.parseInt(stringValue(workspace?.storageSize) ?? '10', 10) || 10
  const storageGi = Math.max(currentStorage, profile.storageGi)
  const buddyCount = deploymentBuddyCount(deployment)
  const hourlyCredits = cloudComputerHourlyCredits(profile, buddyCount)
  const payload: CloudComputerQuotePayload = {
    cloudComputerId: cloudComputerIdForDeployment(deployment),
    userId,
    resourceTier: tier,
    pricingVersion: CLOUD_COMPUTER_PRICING_VERSION,
    deploymentRevision: cloudComputerDeploymentRevision(deployment.configSnapshot),
    buddyCount,
    hourlyCredits,
    monthlyCredits: hourlyCredits * 720,
    storageGi,
    exp: Math.floor(Date.now() / 1000) + 5 * 60,
  }
  return { payload, quoteToken: signCloudComputerQuote(payload) }
}

function cloudComputerDeploymentRevision(configSnapshot: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(cloudComputerDeclarativeSnapshot(configSnapshot)))
    .digest('hex')
    .slice(0, 32)
}

function withCloudComputerResourceProfile(
  snapshot: Record<string, unknown>,
  quote: CloudComputerQuotePayload,
) {
  const normalized = ensureCloudComputerWorkspaceSnapshot(snapshot)
  const deployments = recordValue(normalized.deployments) ?? {}
  const agents = Array.isArray(deployments.agents) ? deployments.agents : []
  const profile = cloudComputerResourceProfile(quote.resourceTier)
  const resources = cloudComputerK8sResources(profile)
  const overlay = recordValue(normalized.cloudComputer) ?? {}
  return {
    ...normalized,
    workspace: {
      ...(recordValue(normalized.workspace) ?? {}),
      storageSize: `${quote.storageGi}Gi`,
    },
    deployments: {
      ...deployments,
      agents: agents.map((agent) => ({ ...(recordValue(agent) ?? {}), resources })),
    },
    cloudComputer: {
      ...overlay,
      resources: {
        tier: profile.id,
        cpu: profile.cpu,
        memory: profile.memory,
        storageGi: quote.storageGi,
        pricingVersion: quote.pricingVersion,
        hourlyCredits: quote.hourlyCredits,
        effectiveAt: new Date().toISOString(),
      },
    },
  }
}

function withCloudComputerRuntime(
  snapshot: Record<string, unknown>,
  runtime: {
    id: string
    pluginId: string
    pluginVersion: string
    version: string
    persistentState: boolean
  },
) {
  const normalized = ensureCloudComputerWorkspaceSnapshot(snapshot)
  const { overlay, runtimes } = cloudComputerRuntimeOverlay(normalized)
  const existing = runtimes.find((item) => stringValue(item.id) === runtime.id)
  const installed = {
    ...existing,
    id: runtime.id,
    pluginId: runtime.pluginId,
    pluginVersion: runtime.pluginVersion,
    runtimeVersion: runtime.version,
    status: 'installed',
    persistentState: runtime.persistentState,
    installedAt: stringValue(existing?.installedAt) ?? new Date().toISOString(),
  }
  return {
    ...normalized,
    cloudComputer: {
      ...overlay,
      runtimes: [...runtimes.filter((item) => stringValue(item.id) !== runtime.id), installed],
    },
  }
}

function withCloudComputerComponent(
  snapshot: Record<string, unknown>,
  component: 'browser' | 'desktop',
) {
  const normalized = ensureCloudComputerWorkspaceSnapshot(snapshot)
  const { overlay, components } = cloudComputerRuntimeOverlay(normalized)
  return {
    ...normalized,
    cloudComputer: {
      ...overlay,
      components: { ...components, [component]: true },
    },
  }
}

function withCloudComputerWorkspaceMount(
  snapshot: Record<string, unknown>,
  input: { serverId: string; rootId?: string | null; mountPath: string; readOnly?: boolean },
) {
  const normalized = ensureCloudComputerWorkspaceSnapshot(snapshot)
  const { overlay, workspaceMounts } = cloudComputerRuntimeOverlay(normalized)
  const nextMount = {
    serverId: input.serverId,
    rootId: input.rootId ?? null,
    mountPath: input.mountPath,
    readOnly: Boolean(input.readOnly),
  }
  return {
    ...normalized,
    cloudComputer: {
      ...overlay,
      workspaceMounts: [
        ...workspaceMounts.filter((mount) => stringValue(mount.serverId) !== input.serverId),
        nextMount,
      ],
    },
  }
}

async function persistCloudComputerSnapshot(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  configSnapshot: Record<string, unknown>,
) {
  const updated = await container
    .resolve('cloudDeploymentDao')
    .updateConfigSnapshot(deployment.id, configSnapshot)
  if (updated) deployment.configSnapshot = updated.configSnapshot
  clearCloudComputerPerformanceCaches()
  return updated
}

async function safeCloudComputerRebuildSnapshot(
  container: AppContainer,
  input: {
    userId: string
    cloudComputerId: string
    snapshot: Record<string, unknown>
  },
) {
  let configSnapshot: Record<string, unknown> = ensureCloudComputerWorkspaceSnapshot(input.snapshot)
  const connectorDao = container.resolve('cloudConnectorDao')
  const bindings = await connectorDao.listBindings(input.userId, input.cloudComputerId)
  const detachedBindingIds: string[] = []

  for (const binding of bindings) {
    if (binding.declaredInBase) continue
    const connection = await connectorDao.findConnectionByIdForUser(
      binding.connectionId,
      input.userId,
    )
    if (!connection) continue
    configSnapshot = removeCloudComputerConnectorFromSnapshot({
      snapshot: configSnapshot,
      pluginId: binding.pluginId,
      credentialFields: connection.credentialFields,
      optionKeys: Object.keys(binding.options),
      declaredInBase: false,
    })
    detachedBindingIds.push(binding.id)
  }

  const overlay = recordValue(configSnapshot.cloudComputer) ?? {}
  configSnapshot = {
    ...configSnapshot,
    cloudComputer: {
      ...overlay,
      components: { browser: false, desktop: false },
      workspaceMounts: [],
    },
  }

  return { configSnapshot, detachedBindingIds }
}

export async function reconcileCloudComputerRuntimeOverlays(
  container: AppContainer,
  deployment: CloudComputerDeployment,
) {
  const snapshot = recordValue(deployment.configSnapshot)
  if (!snapshot) return []
  const { components, workspaceMounts } = cloudComputerRuntimeOverlay(snapshot)
  const results: Array<{ component: string; ensured: boolean; error?: string }> = []
  if (components.browser === true) {
    try {
      results.push({
        component: 'browser',
        ensured: await ensureBrowserRuntime(
          container,
          deployment,
          resolveCloudComputerBrowserTarget(),
        ),
      })
    } catch (error) {
      results.push({
        component: 'browser',
        ensured: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (components.desktop === true) {
    try {
      results.push({
        component: 'desktop',
        ensured: await ensureDesktopRuntime(
          container,
          deployment,
          resolveCloudComputerDesktopTarget(),
        ),
      })
    } catch (error) {
      results.push({
        component: 'desktop',
        ensured: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  for (const mount of workspaceMounts) {
    const serverId = stringValue(mount.serverId)
    const mountPath = stringValue(mount.mountPath)
    if (!serverId || !mountPath) continue
    try {
      const result = await ensureWorkspaceMountRuntime(container, deployment, {
        serverId,
        rootId: stringValue(mount.rootId),
        mountPath,
        readOnly: mount.readOnly === true,
      })
      results.push({ component: `workspace:${serverId}`, ensured: result.runtimeEnsured })
    } catch (error) {
      results.push({
        component: `workspace:${serverId}`,
        ensured: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
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

async function probeTcpRuntime(localPort: number, expectedPrefix: string) {
  return new Promise<boolean>((resolve) => {
    const socket = connectTcp({ host: '127.0.0.1', port: localPort })
    let settled = false
    const finish = (available: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(available)
    }
    const timer = setTimeout(() => finish(false), 2_000)
    timer.unref?.()
    socket.once('data', (chunk) => finish(String(chunk).startsWith(expectedPrefix)))
    socket.once('error', () => finish(false))
    socket.once('close', () => finish(false))
  })
}

async function probeComponentRuntime(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  component: 'browser' | 'desktop',
  target: CloudComputerBrowserTarget | CloudComputerVncTarget,
) {
  if (knownComponentRuntimeEnsured(deployment, component, target)) return true
  const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
  let portForward: { localPort: number; cleanup: () => void } | null = null
  try {
    portForward = await container.resolve('kubernetesOpsGateway').portForwardService({
      namespace: deployment.namespace,
      serviceName: target.serviceName,
      targetPort: target.targetPort,
      kubeconfig,
    })
    const available =
      component === 'browser'
        ? await fetch(`http://127.0.0.1:${portForward.localPort}/json/version`, {
            signal: AbortSignal.timeout(2_000),
          })
            .then((response) => response.ok)
            .catch(() => false)
        : await probeTcpRuntime(portForward.localPort, 'RFB ')
    if (available) markComponentRuntimeEnsured(deployment, component, target)
    return available
  } catch {
    return false
  } finally {
    portForward?.cleanup()
  }
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

function deploymentBuddyCountFromSnapshot(snapshot: Record<string, unknown>) {
  const shadowob = (Array.isArray(snapshot.use) ? snapshot.use : [])
    .map((entry) => recordValue(entry))
    .find((entry) => stringValue(entry?.plugin) === 'shadowob')
  const buddies = recordValue(shadowob?.options)?.buddies
  return Array.isArray(buddies) ? buddies.length : 0
}

function deploymentBuddyCount(deployment: Record<string, unknown>) {
  const snapshot = recordValue(deployment.configSnapshot)
  return snapshot ? deploymentBuddyCountFromSnapshot(snapshot) : 0
}

function cloneConfigSnapshot(snapshot: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
}

function newCloudComputerBuddyId(snapshot: Record<string, unknown>) {
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

  let candidate: string
  do {
    candidate = `buddy-${randomUUID().replace(/-/g, '')}`
  } while (used.has(candidate))
  return candidate
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

function cloudComputerBuddySystemPrompt(name: string, description?: string) {
  return [
    `You are ${name}, a Shadow Buddy running inside the user's cloud computer.`,
    ...(description ? [`Your role: ${description}`] : []),
    'Use the cloud runtime connector to help the user through Shadow conversations.',
    'Be concise, verify before destructive actions, and explain important changes plainly.',
  ].join('\n')
}

function cloudComputerConfiguredBuddyIds(snapshot: Record<string, unknown>) {
  const ids = new Set<string>()
  const shadowob = (Array.isArray(snapshot.use) ? snapshot.use : [])
    .map((entry) => recordValue(entry))
    .find((entry) => stringValue(entry?.plugin) === 'shadowob')
  const options = recordValue(shadowob?.options)
  for (const buddy of Array.isArray(options?.buddies) ? options.buddies : []) {
    const id = stringValue(recordValue(buddy)?.id)
    if (id) ids.add(id)
  }
  for (const binding of Array.isArray(options?.bindings) ? options.bindings : []) {
    const item = recordValue(binding)
    const id = stringValue(item?.targetId)
    if (id && (!item?.targetType || item.targetType === 'buddy')) ids.add(id)
  }
  return ids
}

function cloudComputerRuntimeAgentIdForBuddy(snapshot: Record<string, unknown>, buddyId: string) {
  const shadowob = (Array.isArray(snapshot.use) ? snapshot.use : [])
    .map((entry) => recordValue(entry))
    .find((entry) => stringValue(entry?.plugin) === 'shadowob')
  const bindings = recordValue(shadowob?.options)?.bindings
  if (!Array.isArray(bindings)) return null
  const binding = bindings
    .map((entry) => recordValue(entry))
    .find(
      (entry) =>
        stringValue(entry?.targetId) === buddyId &&
        (!entry?.targetType || entry.targetType === 'buddy'),
    )
  return stringValue(binding?.agentId)
}

function restoreCloudComputerBaseAgent(
  source: Record<string, unknown>,
  id: string,
  profile: CloudComputerResourceProfile,
) {
  return {
    ...source,
    id,
    resources: cloudComputerK8sResources(profile),
  }
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

  const buddyId = newCloudComputerBuddyId(next)
  const description = input.description || `${input.name} Buddy`
  const overlay = recordValue(next.cloudComputer)
  const configuredResources = recordValue(overlay?.resources)
  const profile = cloudComputerResourceProfile(stringValue(configuredResources?.tier))
  const configuredBuddyIds = cloudComputerConfiguredBuddyIds(next)
  const configuredBaseAgentId = stringValue(overlay?.baseAgentId)
  const configuredBaseAgentIndex = configuredBaseAgentId
    ? agents.findIndex((agent) => stringValue(recordValue(agent)?.id) === configuredBaseAgentId)
    : -1
  const reusableBaseAgentIndex =
    configuredBuddyIds.size === 0
      ? configuredBaseAgentIndex >= 0
        ? configuredBaseAgentIndex
        : agents.length === 1
          ? 0
          : -1
      : -1
  const reusableBaseAgent =
    reusableBaseAgentIndex >= 0 ? recordValue(agents[reusableBaseAgentIndex]) : null
  const agentId = stringValue(reusableBaseAgent?.id) ?? buddyId
  const buddyAgent = {
    ...(reusableBaseAgent ?? {}),
    id: agentId,
    runtime: input.runtimeId,
    description,
    identity: {
      name: input.name,
      description,
      personality: 'A helpful Shadow Buddy connected to this cloud computer.',
      systemPrompt: cloudComputerBuddySystemPrompt(input.name, input.description),
    },
    resources: cloudComputerK8sResources(profile),
    configuration: {},
  }
  if (reusableBaseAgentIndex >= 0) agents[reusableBaseAgentIndex] = buddyAgent
  else agents.push(buddyAgent)
  if (configuredBuddyIds.size === 0 && (reusableBaseAgentIndex >= 0 || agents.length === 1)) {
    next.cloudComputer = { ...(overlay ?? {}), baseAgentId: agentId }
  }

  const { buddies, bindings } = ensureCloudComputerShadowobPlugin(next)
  buddies.push({
    id: buddyId,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
  })
  bindings.push({
    targetId: buddyId,
    targetType: 'buddy',
    servers: input.serverId ? [input.serverId] : [],
    channels: [],
    agentId,
    ...(input.serverId ? { replyPolicy: { mode: 'mentionOnly' } } : {}),
  })

  return {
    configSnapshot: next,
    buddy: {
      id: buddyId,
      name: input.name,
      description: input.description ?? null,
      avatarUrl: input.avatarUrl ?? null,
      status: 'pending',
      kernelType: input.runtimeId,
    },
  }
}

function removeCloudComputerBuddyFromSnapshot(
  snapshot: Record<string, unknown>,
  input: {
    buddyId: string
    platformAgentId?: string | null
    runtimeAgentId?: string | null
    userId?: string | null
    deploymentId?: string | null
    baseAgent?: Record<string, unknown> | null
  },
) {
  const next = cloneConfigSnapshot(snapshot)
  const deployments = recordValue(next.deployments) ?? {}
  const agents = Array.isArray(deployments.agents) ? deployments.agents : []
  const runtimeAgentId = input.runtimeAgentId ?? input.buddyId
  const uses = Array.isArray(next.use) ? [...next.use] : []
  const shadowobIndex = uses.findIndex(
    (entry) => stringValue(recordValue(entry)?.plugin) === 'shadowob',
  )
  let removed = false
  let retainedBindings: unknown[] = []
  if (shadowobIndex >= 0) {
    const shadowob = recordValue(uses[shadowobIndex]) ?? {}
    const options = recordValue(shadowob.options) ?? {}
    const buddies = Array.isArray(options.buddies) ? options.buddies : []
    const bindings = Array.isArray(options.bindings) ? options.bindings : []
    const retainedBuddies = buddies.filter(
      (buddy) => stringValue(recordValue(buddy)?.id) !== input.buddyId,
    )
    retainedBindings = bindings.filter((binding) => {
      const item = recordValue(binding)
      return stringValue(item?.targetId) !== input.buddyId
    })
    removed ||=
      retainedBuddies.length !== buddies.length || retainedBindings.length !== bindings.length
    uses[shadowobIndex] = {
      ...shadowob,
      options: { ...options, buddies: retainedBuddies, bindings: retainedBindings },
    }
  }

  const runtimeAgentStillBound = retainedBindings.some(
    (binding) => stringValue(recordValue(binding)?.agentId) === runtimeAgentId,
  )
  let retainedAgents = runtimeAgentStillBound
    ? agents
    : agents.filter((agent) => stringValue(recordValue(agent)?.id) !== runtimeAgentId)
  removed ||= retainedAgents.length !== agents.length

  const { overlay, runtimes } = cloudComputerRuntimeOverlay(next)

  let withoutBuddy: Record<string, unknown> = {
    ...next,
    use: uses,
    deployments: { ...deployments, agents: retainedAgents },
    cloudComputer: { ...overlay, runtimes },
  }
  if (cloudComputerConfiguredBuddyIds(withoutBuddy).size === 0 && retainedAgents.length === 0) {
    if (!input.baseAgent) {
      throw Object.assign(new Error('Cloud computer base Agent template is unavailable'), {
        status: 503,
      })
    }
    const baseAgentId = stringValue(overlay.baseAgentId) ?? runtimeAgentId
    const configuredResources = recordValue(overlay.resources)
    const profile = cloudComputerResourceProfile(stringValue(configuredResources?.tier))
    retainedAgents = [restoreCloudComputerBaseAgent(input.baseAgent, baseAgentId, profile)]
    withoutBuddy = {
      ...withoutBuddy,
      deployments: { ...deployments, agents: retainedAgents },
      cloudComputer: { ...overlay, baseAgentId, runtimes },
    }
  }
  return {
    removed,
    configSnapshot: input.platformAgentId
      ? enqueueCloudComputerBuddyIdentityCleanup(withoutBuddy, {
          buddyId: input.buddyId,
          agentId: input.platformAgentId,
          userId: input.userId,
          deploymentId: input.deploymentId,
        })
      : withoutBuddy,
  }
}

function cloudComputerSnapshotUsesPlugin(snapshot: Record<string, unknown>, pluginId: string) {
  return (Array.isArray(snapshot.use) ? snapshot.use : []).some(
    (entry) => stringValue(recordValue(entry)?.plugin) === pluginId,
  )
}

function configureCloudComputerConnectorSnapshot(input: {
  snapshot: Record<string, unknown>
  pluginId: string
  connectionId: string
  credentialFields: string[]
  options: Record<string, unknown>
}) {
  const next = cloneConfigSnapshot(input.snapshot)
  const uses = Array.isArray(next.use) ? [...next.use] : []
  next.use = uses
  let entry = uses
    .map((candidate) => recordValue(candidate))
    .find((candidate) => stringValue(candidate?.plugin) === input.pluginId)
  if (!entry) {
    entry = { plugin: input.pluginId, options: {} }
    uses.push(entry)
  }
  const currentOptions = recordValue(entry.options) ?? {}
  entry.options = {
    ...currentOptions,
    ...input.options,
    ...Object.fromEntries(input.credentialFields.map((field) => [field, `\${env:${field}}`])),
  }

  return {
    configSnapshot: next,
    envVars: Object.fromEntries(
      input.credentialFields.map((field) => [field, connectorSecretRef(input.connectionId, field)]),
    ),
  }
}

function removeCloudComputerConnectorFromSnapshot(input: {
  snapshot: Record<string, unknown>
  pluginId: string
  credentialFields: string[]
  optionKeys: string[]
  declaredInBase: boolean
}) {
  const next = cloneConfigSnapshot(input.snapshot)
  const uses = Array.isArray(next.use) ? [...next.use] : []
  if (!input.declaredInBase) {
    next.use = uses.filter(
      (candidate) => stringValue(recordValue(candidate)?.plugin) !== input.pluginId,
    )
    return next
  }

  const entry = uses
    .map((candidate) => recordValue(candidate))
    .find((candidate) => stringValue(candidate?.plugin) === input.pluginId)
  const options = recordValue(entry?.options)
  if (entry && options) {
    const nextOptions = { ...options }
    for (const key of [...input.credentialFields, ...input.optionKeys]) delete nextOptions[key]
    entry.options = nextOptions
  }
  next.use = uses
  return next
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

function newCloudComputerNamespace(instanceId: string) {
  return `cc-${instanceId.replace(/-/g, '')}`
}

function withCloudComputerIdentity(snapshot: Record<string, unknown>, instanceId: string) {
  const overlay = recordValue(snapshot.cloudComputer) ?? {}
  return {
    ...snapshot,
    cloudComputer: { ...overlay, instanceId },
  }
}

function localeFromRequest(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header('accept-language')?.split(',')[0]?.slice(0, 35) ?? null
}

function componentStatus(runtimeEnsured: boolean, repairAvailable: boolean) {
  if (runtimeEnsured) return 'ensured'
  return repairAvailable ? 'repairable' : 'not-configured'
}

async function probeOrRestorePersistedComponentRuntime(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  component: 'browser' | 'desktop',
  target: CloudComputerBrowserTarget | CloudComputerVncTarget,
) {
  const available = await probeComponentRuntime(container, deployment, component, target)
  if (available) return true

  const snapshot = recordValue(deployment.configSnapshot)
  const persistedComponents = snapshot ? cloudComputerRuntimeOverlay(snapshot).components : null
  if (persistedComponents?.[component] !== true) return false

  try {
    return component === 'browser'
      ? await ensureBrowserRuntime(container, deployment, target as CloudComputerBrowserTarget)
      : await ensureDesktopRuntime(container, deployment, target as CloudComputerVncTarget)
  } catch (error) {
    logger.warn(
      {
        cloudComputerId: cloudComputerIdForDeployment(deployment),
        component,
        error: error instanceof Error ? error.message : String(error),
      },
      'Persisted Cloud Computer component could not be restored',
    )
    return false
  }
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

function lifecyclePayload(input: {
  cloudComputerId: string
  body: Record<string, unknown> | null
  httpStatus: number
}) {
  if (!input.body) {
    return jsonErrorPayload('Cloud computer lifecycle action failed', input.httpStatus, {
      cloudComputerId: input.cloudComputerId,
    })
  }
  return {
    ok: Boolean(input.body.ok),
    cloudComputerId: input.cloudComputerId,
    status: stringValue(input.body.status) ?? undefined,
    error: stringValue(input.body.error) ?? undefined,
  }
}

function jsonErrorPayload(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return { ok: false, error: message, status, ...extra }
}

function cloudComputerFacadeHeaders(source: Headers, requestUrl?: string) {
  const headers = new Headers()
  for (const key of [
    'authorization',
    'accept-language',
    'origin',
    'user-agent',
    'x-forwarded-for',
    'x-real-ip',
  ]) {
    const value = source.get(key)
    if (value) headers.set(key, value)
  }

  let requestOrigin: URL | null = null
  try {
    requestOrigin = requestUrl ? new URL(requestUrl) : null
  } catch {
    requestOrigin = null
  }
  const forwardedHost =
    source.get('x-forwarded-host') ?? source.get('host') ?? requestOrigin?.host ?? null
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost)
  const forwardedProto =
    source.get('x-forwarded-proto') ?? requestOrigin?.protocol.replace(/:$/, '') ?? null
  if (forwardedProto) headers.set('x-forwarded-proto', forwardedProto)

  headers.set('content-type', 'application/json')
  return headers
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

type CloudComputerDesiredBuddy = {
  id: string
  name: string
  description: string | null
  avatarUrl: string | null
  runtimeAgentId: string | null
  kernelType: string | null
}

function cloudComputerDeclarativeSnapshot(snapshot: unknown) {
  const record = recordValue(snapshot) ?? {}
  return extractCloudSaasRuntime(record).configSnapshot ?? record
}

function cloudComputerDesiredBuddies(snapshot: unknown): CloudComputerDesiredBuddy[] {
  const declarative = cloudComputerDeclarativeSnapshot(snapshot)
  const shadowob = (Array.isArray(declarative.use) ? declarative.use : [])
    .map((entry) => recordValue(entry))
    .find((entry) => stringValue(entry?.plugin) === 'shadowob')
  const options = recordValue(shadowob?.options)
  const bindings = (Array.isArray(options?.bindings) ? options.bindings : [])
    .map((binding) => recordValue(binding))
    .filter((binding): binding is Record<string, unknown> => Boolean(binding))
  const deployments = recordValue(declarative.deployments)
  const runtimeAgents = (Array.isArray(deployments?.agents) ? deployments.agents : [])
    .map((agent) => recordValue(agent))
    .filter((agent): agent is Record<string, unknown> => Boolean(agent))
  return (Array.isArray(options?.buddies) ? options.buddies : []).flatMap((value) => {
    const buddy = recordValue(value)
    const id = stringValue(buddy?.id)
    if (!id) return []
    const binding = bindings.find(
      (candidate) =>
        stringValue(candidate.targetId) === id &&
        (!candidate.targetType || candidate.targetType === 'buddy'),
    )
    const runtimeAgentId = stringValue(binding?.agentId)
    const runtimeAgent = runtimeAgents.find(
      (candidate) => stringValue(candidate.id) === runtimeAgentId,
    )
    return [
      {
        id,
        name: stringValue(buddy?.name) ?? id,
        description: stringValue(buddy?.description),
        avatarUrl: stringValue(buddy?.avatarUrl),
        runtimeAgentId,
        kernelType: stringValue(runtimeAgent?.runtime),
      },
    ]
  })
}

function cloudComputerBuddySummary(
  buddy: CloudComputerDesiredBuddy,
  agent: Record<string, unknown> | null,
  status?: string,
) {
  const botUser = recordValue(agent?.botUser)
  const owner = recordValue(agent?.owner)
  return {
    id: buddy.id,
    agentId: stringValue(agent?.id) ?? null,
    name: buddy.name,
    description: buddy.description,
    avatarUrl: buddy.avatarUrl ?? stringValue(botUser?.avatarUrl),
    status: status ?? stringValue(agent?.status) ?? 'pending',
    kernelType: buddy.kernelType ?? stringValue(agent?.kernelType),
    lastHeartbeat: stringValue(agent?.lastHeartbeat),
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

async function listCloudComputerBuddies(
  container: AppContainer,
  deployment: Record<string, unknown>,
) {
  const agentService = container.resolve('agentService')
  const desired = cloudComputerDesiredBuddies(deployment.configSnapshot)
  const provisioned = extractCloudProvisionedBuddies(deployment.configSnapshot)
  const cleanup = cloudComputerBuddyIdentityCleanupQueue(deployment.configSnapshot)
  const agentIds = [
    ...provisioned.map((buddy) => buddy.agentId),
    ...cleanup.map((entry) => entry.agentId),
  ]
  const agents = await agentService.getByIds(agentIds)
  const agentsById = new Map(
    agents.flatMap((agent) =>
      agent ? [[agent.id, agent as unknown as Record<string, unknown>] as const] : [],
    ),
  )
  const provisionedByBuddyId = new Map(provisioned.map((buddy) => [buddy.id, buddy]))
  const cleanupByBuddyId = new Map(cleanup.map((entry) => [entry.buddyId, entry]))
  const summaries = desired.map((buddy) => {
    const mapping = provisionedByBuddyId.get(buddy.id)
    const removing = cleanupByBuddyId.get(buddy.id)
    return cloudComputerBuddySummary(
      buddy,
      agentsById.get(mapping?.agentId ?? removing?.agentId ?? '') ?? null,
      removing ? 'removing' : undefined,
    )
  })
  const desiredIds = new Set(desired.map((buddy) => buddy.id))
  for (const removing of cleanup) {
    if (desiredIds.has(removing.buddyId)) continue
    const agent = agentsById.get(removing.agentId) ?? null
    summaries.push(
      cloudComputerBuddySummary(
        {
          id: removing.buddyId,
          name:
            stringValue(recordValue(agent?.botUser)?.displayName) ??
            stringValue(recordValue(agent?.botUser)?.username) ??
            removing.buddyId,
          description: stringValue(recordValue(agent?.config)?.description),
          avatarUrl: stringValue(recordValue(agent?.botUser)?.avatarUrl),
          runtimeAgentId: null,
          kernelType: stringValue(agent?.kernelType),
        },
        agent,
        'removing',
      ),
    )
  }
  return summaries
}

function toCloudComputer(deployment: Record<string, unknown>, locale?: string | null) {
  const sanitized = sanitizeCloudSaasDeployment(deployment)
  const cloudComputerId = cloudComputerIdForDeployment(sanitized)
  const status = String(sanitized.status ?? 'unknown')
  const errorMessage = typeof sanitized.errorMessage === 'string' ? sanitized.errorMessage : null
  const configSnapshot = recordValue(sanitized.configSnapshot)
  const cloudComputerOverlay = recordValue(configSnapshot?.cloudComputer)
  const deploymentSource = stringValue(
    recordValue(recordValue(configSnapshot?.[CLOUD_SAAS_RUNTIME_KEY])?.manifest)?.source,
  )
  const appearance = recordValue(cloudComputerOverlay?.appearance)
  const configuredResources = recordValue(cloudComputerOverlay?.resources)
  const resourceTier =
    stringValue(configuredResources?.tier) ?? stringValue(sanitized.resourceTier) ?? 'lightweight'
  const resourceProfile = cloudComputerResourceProfile(resourceTier)
  const browserConfigured = Boolean(process.env.CLOUD_COMPUTER_BROWSER_IMAGE?.trim())
  const desktopConfigured = Boolean(process.env.CLOUD_COMPUTER_DESKTOP_IMAGE?.trim())
  const failureReason =
    status === 'failed' || status === 'paused' ? cloudComputerFailureReason(errorMessage) : null
  const runtime = runtimeReadiness(status, failureReason)
  const backup = backupReadiness(status, failureReason)
  const readiness = {
    files: runtime,
    terminal: runtime,
    browser: configuredComponentReadiness(status, browserConfigured, failureReason),
    desktop: configuredComponentReadiness(status, desktopConfigured, failureReason),
    buddies: runtime,
    backups: backup,
    connectors: runtime,
    workspaceMounts: runtime,
    settings: { state: 'ready', reason: null, action: null },
  }
  const healthState =
    status === 'deployed'
      ? 'ready'
      : status === 'paused'
        ? 'paused'
        : status === 'failed'
          ? 'failed'
          : ['pending', 'deploying', 'resuming', 'cancelling', 'destroying'].includes(status)
            ? 'preparing'
            : 'degraded'
  const nextActions =
    status === 'failed'
      ? failureReason === 'delete_failed'
        ? ['retry-delete']
        : failureReason === 'runtime_removed'
          ? ['rebuild-runtime']
          : failureReason === 'insufficient_balance'
            ? ['add-funds']
            : failureReason === 'cluster_unavailable'
              ? ['retry-later']
              : failureReason === 'image_unavailable' ||
                  failureReason === 'extension_install_failed'
                ? ['rebuild-runtime']
                : ['repair-runtime']
      : status === 'paused'
        ? failureReason === 'insufficient_balance'
          ? ['add-funds']
          : ['resume']
        : status === 'deployed'
          ? ['ask-buddy']
          : ['wait']
  return {
    id: cloudComputerId,
    name: cloudComputerDisplayName(sanitized, locale),
    status,
    agentCount: deploymentAgentCount(sanitized),
    buddyCount: deploymentBuddyCount(sanitized),
    createdAt: isoTimestamp(sanitized.createdAt),
    updatedAt: isoTimestamp(sanitized.updatedAt),
    lastActiveAt: isoTimestamp(sanitized.lastActiveAt),
    errorMessage,
    health: {
      state: healthState,
      reason: failureReason,
      message: errorMessage,
    },
    operation: cloudComputerOperation(status, errorMessage, deploymentSource),
    capabilities: {
      files: runtime.state === 'ready',
      terminal: runtime.state === 'ready',
      browser: readiness.browser.state === 'ready',
      desktop: readiness.desktop.state === 'ready',
      buddies: runtime.state === 'ready',
      backups: readiness.backups.state === 'ready' || readiness.backups.state === 'repairable',
      connectors: runtime.state === 'ready',
      workspaceMounts: runtime.state === 'ready',
    },
    readiness,
    nextActions,
    cost: {
      hourlyCredits:
        typeof sanitized.hourlyCost === 'number'
          ? sanitized.hourlyCost
          : sanitized.hourlyCost == null
            ? null
            : Number(sanitized.hourlyCost),
      monthlyCredits:
        typeof sanitized.monthlyCost === 'number'
          ? sanitized.monthlyCost
          : sanitized.monthlyCost == null
            ? null
            : Number(sanitized.monthlyCost),
    },
    configuration: {
      resourceTier: resourceProfile.id,
      cpu: stringValue(configuredResources?.cpu) ?? resourceProfile.cpu,
      memory: stringValue(configuredResources?.memory) ?? resourceProfile.memory,
      storageGi:
        typeof configuredResources?.storageGi === 'number'
          ? configuredResources.storageGi
          : resourceProfile.storageGi,
      pricingVersion:
        stringValue(configuredResources?.pricingVersion) ?? CLOUD_COMPUTER_PRICING_VERSION,
    },
    workspace: {
      persistent: Boolean(configSnapshot?.workspace),
      mountPath: '/workspace',
    },
    appearance: {
      shellColor: resolveCloudComputerShellColor(appearance?.shellColor, cloudComputerId),
    },
  }
}

function isoTimestamp(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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

function isImmutableDeploymentSelectorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('spec.selector') && message.includes('field is immutable')
}

async function applyCloudComputerDeploymentManifest(
  k8sGateway: Pick<KubernetesOpsGateway, 'applyManifest' | 'deleteDeployment'>,
  input: {
    manifest: Record<string, unknown>
    namespace: string
    name: string
    kubeconfig?: string
  },
) {
  try {
    await k8sGateway.applyManifest({
      manifest: input.manifest,
      kubeconfig: input.kubeconfig,
      timeout: 30_000,
    })
  } catch (error) {
    if (!isImmutableDeploymentSelectorError(error)) throw error
    await k8sGateway.deleteDeployment(input.namespace, input.name, input.kubeconfig)
    await k8sGateway.applyManifest({
      manifest: input.manifest,
      kubeconfig: input.kubeconfig,
      timeout: 30_000,
    })
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
  const workspacePvcName = cloudComputerSharedWorkspacePvc(deployment)
  const labels = {
    'app.kubernetes.io/name': 'shadow-cloud-computer-desktop',
    'app.kubernetes.io/part-of': 'shadow-cloud-computer',
    'shadowob.com/cloud-computer-id': cloudComputerIdForDeployment(deployment),
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
            { name: 'workspace', persistentVolumeClaim: { claimName: workspacePvcName } },
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
  await applyCloudComputerDeploymentManifest(k8sGateway, {
    manifest: deploymentManifest,
    namespace: deployment.namespace,
    name: target.serviceName,
    kubeconfig,
  })
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
    'if ! command -v node >/dev/null 2>&1; then echo "Node.js is required to expose the cloud computer browser CDP endpoint" >&2; exit 127; fi',
    'public_port="${SHADOW_BROWSER_CDP_PORT:-9222}"; internal_port="$((public_port + 1))"',
    'screen_width="${SE_SCREEN_WIDTH:-1440}"; screen_height="${SE_SCREEN_HEIGHT:-900}"',
    `exec node -e 'const { spawn } = require("node:child_process"); const net = require("node:net"); const publicPort = Number(process.env.SHADOW_BROWSER_CDP_PORT || 9222); const internalPort = publicPort + 1; const browser = spawn(process.argv[1], process.argv.slice(2), { stdio: "inherit" }); const server = net.createServer((client) => { const upstream = net.connect(internalPort, "127.0.0.1"); client.pipe(upstream).pipe(client); const close = () => { client.destroy(); upstream.destroy(); }; client.on("error", close); upstream.on("error", close); }); const shutdown = (signal) => { server.close(); if (!browser.killed) browser.kill(signal); setTimeout(() => process.exit(0), 2000).unref(); }; process.on("SIGTERM", () => shutdown("SIGTERM")); process.on("SIGINT", () => shutdown("SIGINT")); browser.once("error", (error) => { console.error(error); server.close(); process.exit(1); }); browser.once("exit", (code) => { server.close(); process.exit(code ?? 1); }); server.listen(publicPort, "0.0.0.0");' "$browser_bin" --headless=new --no-sandbox --no-first-run --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage --disable-extensions --disable-background-networking --disable-sync --disable-component-update --disable-breakpad --disable-crash-reporter --remote-debugging-address=127.0.0.1 --remote-debugging-port="$internal_port" --user-data-dir="$profile_dir" --window-size="$screen_width,$screen_height" about:blank`,
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
  const workspacePvcName = cloudComputerSharedWorkspacePvc(deployment)
  const labels = {
    'app.kubernetes.io/name': 'shadow-cloud-computer-browser',
    'app.kubernetes.io/part-of': 'shadow-cloud-computer',
    'shadowob.com/cloud-computer-id': cloudComputerIdForDeployment(deployment),
  }
  const profilePvcName =
    process.env.CLOUD_COMPUTER_BROWSER_PROFILE_PVC_NAME?.trim() || `${target.serviceName}-profile`
  const profileMountPath =
    process.env.CLOUD_COMPUTER_BROWSER_PROFILE_MOUNT_PATH?.trim() || '/root/.config/google-chrome'
  const downloadsMountPath =
    process.env.CLOUD_COMPUTER_BROWSER_DOWNLOADS_MOUNT_PATH?.trim() || '/workspace/downloads'
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
                { name: 'workspace', mountPath: '/workspace' },
                { name: 'dev-shm', mountPath: '/dev/shm' },
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
              },
            },
          ],
          volumes: [
            profileVolume,
            { name: 'workspace', persistentVolumeClaim: { claimName: workspacePvcName } },
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
  await applyCloudComputerDeploymentManifest(k8sGateway, {
    manifest: deploymentManifest,
    namespace: deployment.namespace,
    name: target.serviceName,
    kubeconfig,
  })
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
  const workspacePvcName = cloudComputerSharedWorkspacePvc(deployment)
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
    'shadowob.com/cloud-computer-id': cloudComputerIdForDeployment(deployment),
    'shadowob.com/server-id': input.serverId,
  }
  const script = [
    'set -eu',
    'shadowob auth login --server-url "$SHADOWOB_SERVER_URL" --token "$SHADOWOB_TOKEN" --profile workspace-mount >/dev/null',
    'mkdir -p "$SHADOWOB_WORKSPACE_MOUNT_PATH"',
    'cp /config/mount.json "$SHADOWOB_WORKSPACE_MOUNT_PATH/.shadow-mount.json"',
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
      'mount.json': JSON.stringify({
        version: 1,
        mode: 'webdav',
        serverId: input.serverId,
        rootId: input.rootId ?? null,
        mountPath,
        readOnly: Boolean(input.readOnly),
        url: `http://${serviceName}.${deployment.namespace}.svc.cluster.local:8765/`,
      }),
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
              volumeMounts: [
                { name: 'config', mountPath: '/config', readOnly: true },
                { name: 'workspace', mountPath: '/workspace' },
              ],
              securityContext: {
                allowPrivilegeEscalation: false,
              },
            },
          ],
          volumes: [
            { name: 'config', configMap: { name: `${serviceName}-config` } },
            { name: 'workspace', persistentVolumeClaim: { claimName: workspacePvcName } },
          ],
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
  await applyCloudComputerDeploymentManifest(k8sGateway, {
    manifest: deploymentManifest,
    namespace: deployment.namespace,
    name: serviceName,
    kubeconfig,
  })
  await k8sGateway.applyManifest({ manifest: serviceManifest, kubeconfig, timeout: 30_000 })
  return { runtimeEnsured: true, serviceName, mountPath, webdavPort: 8765 }
}

function cloudFileSigningSecret(): string {
  const secret = process.env.CLOUD_COMPUTER_FILE_SIGNING_SECRET ?? process.env.JWT_SECRET
  if (!secret)
    throw Object.assign(new Error('File signing secret is not configured'), { status: 500 })
  return secret
}

function signCloudComputerQuote(payload: CloudComputerQuotePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', cloudFileSigningSecret())
    .update(`cloud-computer-quote:${encoded}`)
    .digest('base64url')
  return `${encoded}.${signature}`
}

function verifyCloudComputerQuote(token: string): CloudComputerQuotePayload {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature)
    throw Object.assign(new Error('Invalid configuration quote'), { status: 400 })
  const expected = createHmac('sha256', cloudFileSigningSecret())
    .update(`cloud-computer-quote:${encoded}`)
    .digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error('Invalid configuration quote'), { status: 400 })
  }
  const payload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as CloudComputerQuotePayload
  if (
    !payload.cloudComputerId ||
    !payload.userId ||
    !payload.deploymentRevision ||
    payload.pricingVersion !== CLOUD_COMPUTER_PRICING_VERSION ||
    !Number.isInteger(payload.buddyCount) ||
    !cloudComputerResourceTierSchema.safeParse(payload.resourceTier).success ||
    Date.now() / 1000 >= payload.exp
  ) {
    throw Object.assign(new Error('Configuration quote has expired'), { status: 409 })
  }
  return payload
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

function cloudComputerWorkspaceMountRoot(runtime: CloudComputerFileRuntime) {
  const mountRoot = normalizeAbsolutePath(
    process.env.CLOUD_COMPUTER_WORKSPACE_MOUNT_ROOT?.trim() || '/workspace/server-workspaces',
  )
  return mountRoot.startsWith(`${runtime.rootPath}/`) ? mountRoot : null
}

function ensureCloudComputerFilePath(path: string, runtime: CloudComputerFileRuntime) {
  const safePath = ensurePathWithinRoot(path, runtime.rootPath)
  const mountRoot = cloudComputerWorkspaceMountRoot(runtime)
  if (mountRoot && (safePath === mountRoot || safePath.startsWith(`${mountRoot}/`))) {
    throw Object.assign(
      new Error('Space workspace mounts are separate from Cloud Computer files'),
      {
        status: 403,
      },
    )
  }
  return safePath
}

function decodeCloudComputerFileId(fileId: string, runtime: CloudComputerFileRuntime) {
  return ensureCloudComputerFilePath(decodeFileId(fileId), runtime)
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

function podIsReady(ready: string) {
  const [readyRaw, totalRaw] = ready.split('/')
  const readyCount = Number(readyRaw)
  const totalCount = Number(totalRaw)
  return Number.isFinite(readyCount) && totalCount > 0 && readyCount >= totalCount
}

function commandForRuntimeVerification(check: PluginVerificationCheck): string[] | null {
  if (check.kind !== 'command' || !check.command?.length || check.risk === 'write') return null
  const required = check.requiredEnv ?? []
  const requiredAny = check.requiredEnvAny ?? []
  if (required.length === 0 && requiredAny.length === 0) return check.command

  const lines = ['set -eu']
  for (const key of required) {
    lines.push(`test -n "\${${key}:-}" || exit 42`)
  }
  if (requiredAny.length > 0) {
    lines.push(`${requiredAny.map((key) => `test -n "\${${key}:-}"`).join(' || ')} || exit 42`)
  }
  lines.push(`exec ${check.command.map(shellQuote).join(' ')}`)
  return ['sh', '-lc', lines.join('\n')]
}

async function verifyCloudComputerConnectorRuntime(
  container: AppContainer,
  deployment: CloudComputerDeployment,
  pluginId: string,
): Promise<{ verified: boolean; error: string | null }> {
  // Only the target deployment revision may certify a connector rollout.
  const kubeconfig = await resolveDeploymentKubeconfig(container, deployment)
  const gateway = container.resolve('kubernetesOpsGateway')
  const pods = await gateway.listPods(deployment.namespace, kubeconfig)
  const targets = listRuntimeStateTargets(deployment)
  const runtimePods = targets.map((target) => ({
    target,
    pod: pods.find(
      (pod) =>
        pod.deploymentId === deployment.id &&
        pod.status === 'Running' &&
        podIsReady(pod.ready) &&
        pod.containers.includes(target.containerName),
    ),
  }))
  const missing = runtimePods.find((entry) => !entry.pod)
  if (missing) {
    return {
      verified: false,
      error: `Deployment ${deployment.id} has no ready ${missing.target.containerName} runtime pod`,
    }
  }

  const checks = await getPluginRuntimeVerificationChecks(pluginId)
  for (const check of checks) {
    const command = commandForRuntimeVerification(check)
    if (!command) continue
    for (const { target, pod } of runtimePods) {
      const result = await gateway.execInPod({
        namespace: deployment.namespace,
        pod: pod!.name,
        container: target.containerName,
        kubeconfig,
        timeout: Math.max(1_000, Math.min(check.timeoutMs ?? 10_000, 60_000)),
        command,
      })
      if (result.exitCode === 42) continue
      if (result.exitCode !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`
        return { verified: false, error: `${check.label}: ${detail}` }
      }
    }
  }
  return { verified: true, error: null }
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
  const workspaceMountRoot = cloudComputerWorkspaceMountRoot(runtime)
  const maxNodes = Math.max(1, Math.min(CLOUD_COMPUTER_FILE_MAX_NODES, 10_000))
  const maxDepth = Math.max(1, Math.min(CLOUD_COMPUTER_FILE_MAX_DEPTH, 32))
  const findExpression = workspaceMountRoot
    ? `${root} -maxdepth ${maxDepth} -path ${shellQuote(workspaceMountRoot)} -prune -o -print`
    : `${root} -maxdepth ${maxDepth} -print`
  const script = `
set -eu
mkdir -p ${root}
find ${findExpression} | head -n ${maxNodes} | while IFS= read -r p; do
  if [ -d "$p" ]; then k=d; s=0; else k=f; s=$(wc -c < "$p" 2>/dev/null || printf 0); fi
  m=$(date -r "$p" +%s 2>/dev/null || stat -c %Y "$p" 2>/dev/null || printf 0)
  printf '%s\\t%s\\t%s\\t%s\\n' "$k" "$s" "$m" "$p"
done
`
  return parseStatLines(
    cloudComputerIdForDeployment(runtime.deployment),
    runtime.rootPath,
    await execRuntimeShell(container, runtime, script),
  ).filter((node) => {
    const path = decodeFileId(node.id)
    return (
      !workspaceMountRoot ||
      (path !== workspaceMountRoot && !path.startsWith(`${workspaceMountRoot}/`))
    )
  })
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
  const safePath = shellQuote(ensureCloudComputerFilePath(path, runtime))
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
  const parentPath = parentId ? decodeCloudComputerFileId(parentId, runtime) : runtime.rootPath
  return ensureCloudComputerFilePath(posixPath.join(parentPath, safeName(name)), runtime)
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
  const safePath = ensureCloudComputerFilePath(path, runtime)
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
  const safePath = ensureCloudComputerFilePath(path, runtime)
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
  const fromPath = decodeCloudComputerFileId(nodeId, runtime)
  const toParent =
    input.parentId !== undefined
      ? input.parentId
        ? decodeCloudComputerFileId(input.parentId, runtime)
        : runtime.rootPath
      : posixPath.dirname(fromPath)
  const toName = input.name ? safeName(input.name) : posixPath.basename(fromPath)
  const toPath = ensureCloudComputerFilePath(posixPath.join(toParent, toName), runtime)
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
  const path = decodeCloudComputerFileId(nodeId, runtime)
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
  const path = decodeCloudComputerFileId(fileId, runtime)
  const parsed = posixPath.parse(path)
  const target = ensureCloudComputerFilePath(
    posixPath.join(parsed.dir, `${parsed.name}-copy${parsed.ext}`),
    runtime,
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
    ? decodeCloudComputerFileId(input.targetParentId, runtime)
    : runtime.rootPath
  const results: CloudComputerFileNode[] = []
  for (const nodeId of input.nodeIds) {
    const source = decodeCloudComputerFileId(nodeId, runtime)
    const target = ensureCloudComputerFilePath(
      posixPath.join(targetParent, posixPath.basename(source)),
      runtime,
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
  const forwardLifecycle = async (input: {
    request: Request
    deployment: CloudComputerDeployment
    action?: string
    method?: 'POST' | 'DELETE'
    body?: Record<string, unknown>
    onSuccess?: () => Promise<void>
  }) => {
    const suffix = input.action ? `/${input.action}` : ''
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(input.deployment.id)}${suffix}`,
      {
        method: input.method ?? 'POST',
        headers: cloudComputerFacadeHeaders(input.request.headers, input.request.url),
        ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (response.ok) {
      await input.onSuccess?.()
      clearCloudComputerPerformanceCaches()
    }
    return {
      status: response.status,
      body: lifecyclePayload({
        cloudComputerId: cloudComputerIdForDeployment(input.deployment),
        body,
        httpStatus: response.status,
      }),
    }
  }

  h.get('/oauth/callback', async (c) => {
    const state = c.req.query('state') ?? ''
    const code = c.req.query('code')
    const providerError = c.req.query('error')
    let payload: Record<string, unknown>
    try {
      const completed = await container
        .resolve('cloudConnectorService')
        .completeOAuthAuthorization({
          state,
          code,
          error: providerError,
        })
      payload = { type: 'shadow.connector.oauth.completed', ok: true, ...completed }
    } catch {
      payload = { type: 'shadow.connector.oauth.completed', ok: false }
    }
    const serialized = JSON.stringify(payload).replace(/</g, '\\u003c')
    return c.html(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connector authorization</title></head>
<body><p id="status">Authorization complete. You can close this window.</p><script>
const payload=${serialized};
try { window.opener?.postMessage(payload, window.location.origin); } catch {}
try { const channel = new BroadcastChannel('shadow-connector-oauth'); channel.postMessage(payload); channel.close(); } catch {}
if (!payload.ok) document.getElementById('status').textContent='Authorization failed. Return to Shadow and try again.';
setTimeout(() => window.close(), 800);
</script></body></html>`)
  })

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

  h.get('/oauth/flows/:flowId', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system' || actor.kind === 'agent') {
      return c.json({ ok: false, error: 'OAuth flow status requires an interactive user' }, 403)
    }
    try {
      const flow = await container
        .resolve('cloudConnectorService')
        .getOAuthFlow(actor.userId, c.req.param('flowId'))
      return c.json({ ok: true, flow })
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      return c.json(
        jsonErrorPayload(error instanceof Error ? error.message : 'OAuth flow not found', status),
        { status: status as 400 },
      )
    }
  })

  h.get('/runtimes', async (c) => {
    return c.json({ ok: true, runtimes: await listAgentRuntimePlugins() })
  })

  h.get('/resource-profiles', (c) =>
    c.json({
      ok: true,
      pricingVersion: CLOUD_COMPUTER_PRICING_VERSION,
      profiles: CLOUD_COMPUTER_RESOURCE_PROFILES.map((profile) => ({
        ...profile,
        estimatedMonthlyCredits: profile.baseHourlyCredits * 720,
      })),
    }),
  )

  h.post('/', async (c) => {
    const input = createCloudComputerSchema.parse(await c.req.json().catch(() => ({})))
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json(
        { ok: false, error: 'Cloud computer creation requires a user-bound actor' },
        403,
      )
    }
    if (input.buddy?.serverId) {
      const membership = await container
        .resolve('serverDao')
        .getMember(input.buddy.serverId, actor.userId)
      if (!membership) {
        return c.json(
          { ok: false, error: 'You must be a member of the target Space to add this Buddy' },
          403,
        )
      }
    }
    const runtimePlugin = input.buddy ? await getAgentRuntimePlugin(input.buddy.runtimeId) : null
    if (input.buddy && !runtimePlugin) {
      return c.json({ ok: false, error: 'Runtime plugin is not installed on this server' }, 422)
    }
    if (
      runtimePlugin?.minimumResourceTier &&
      cloudComputerTierRank(input.resourceTier) <
        cloudComputerTierRank(runtimePlugin.minimumResourceTier)
    ) {
      return c.json(
        {
          ok: false,
          code: 'cloud_computer_runtime_requires_configuration',
          error: 'This Runtime requires a larger cloud computer configuration',
          runtimeId: runtimePlugin.id,
          currentResourceTier: input.resourceTier,
          requiredResourceTier: runtimePlugin.minimumResourceTier,
        },
        409,
      )
    }
    const ctx = createActorContext(actor)
    const useCase = container.resolve('cloudSaasUseCase')
    const requestedTemplateSlug = CLOUD_COMPUTER_BASE_TEMPLATE_SLUG
    const template = await useCase.getTemplateBySlugForUser({
      ctx,
      slug: requestedTemplateSlug,
    })
    if (!template) {
      return c.json(
        {
          ok: false,
          error: `Cloud computer base template "${requestedTemplateSlug}" is unavailable`,
        },
        503,
      )
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
    configSnapshot = ensureCloudComputerWorkspaceSnapshot(configSnapshot)
    // Display names are mutable and non-unique; instance identity must never depend on them.
    const instanceId = randomUUID()
    configSnapshot = withCloudComputerIdentity(configSnapshot, instanceId)

    let initialBuddy: ReturnType<typeof addCloudComputerBuddyToSnapshot>['buddy'] | null = null
    if (input.buddy && runtimePlugin) {
      const created = addCloudComputerBuddyToSnapshot(configSnapshot, input.buddy)
      initialBuddy = created.buddy
      configSnapshot = withCloudComputerRuntime(created.configSnapshot, runtimePlugin)
    }

    const profile = cloudComputerResourceProfile(input.resourceTier)
    const agentCount = deploymentAgentCountFromSnapshot(configSnapshot)
    const buddyCount = deploymentBuddyCountFromSnapshot(configSnapshot)
    const hourlyCredits = cloudComputerHourlyCredits(profile, buddyCount)
    configSnapshot = withCloudComputerResourceProfile(configSnapshot, {
      cloudComputerId: 'pending',
      userId: actor.userId,
      resourceTier: input.resourceTier,
      pricingVersion: CLOUD_COMPUTER_PRICING_VERSION,
      deploymentRevision: 'pending',
      buddyCount,
      hourlyCredits,
      monthlyCredits: hourlyCredits * 720,
      storageGi: profile.storageGi,
      exp: Math.floor(Date.now() / 1000) + 5 * 60,
    })
    if (input.shellColor) {
      const overlay = recordValue(configSnapshot.cloudComputer) ?? {}
      const appearance = recordValue(overlay.appearance) ?? {}
      configSnapshot = {
        ...configSnapshot,
        cloudComputer: {
          ...overlay,
          appearance: { ...appearance, shellColor: input.shellColor },
        },
      }
    }

    const name = input.name ?? 'My Cloud Computer'
    const namespace = newCloudComputerNamespace(instanceId)
    const headers = cloudComputerFacadeHeaders(c.req.raw.headers, c.req.url)
    const response = await cloudSaasFacade.request('/deployments', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        namespace,
        name,
        templateSlug: template.slug,
        resourceTier: input.resourceTier,
        agentCount,
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
    const createdDeploymentId = stringValue(body.id)
    const priced = createdDeploymentId
      ? await container.resolve('cloudDeploymentDao').updateResourcePricing({
          id: createdDeploymentId,
          userId: actor.userId,
          resourceTier: input.resourceTier,
          hourlyCost: hourlyCredits,
          monthlyCost: hourlyCredits * 720,
        })
      : null
    clearCloudComputerPerformanceCaches()
    const computer = toCloudComputer(
      (priced ?? {
        ...body,
        resourceTier: input.resourceTier,
        hourlyCost: hourlyCredits,
        monthlyCost: hourlyCredits * 720,
        configSnapshot,
      }) as Record<string, unknown>,
      localeFromRequest(c),
    )
    return c.json(initialBuddy ? { ...computer, initialBuddy } : computer, 201)
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

  h.get('/:id/runtimes', async (c) => {
    const deployment = await requireCloudComputer(container, c.get('actor'), c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const snapshot = recordValue((deployment as Record<string, unknown>).configSnapshot) ?? {}
    const installed = cloudComputerRuntimeOverlay(snapshot).runtimes
    const catalog = await listAgentRuntimePlugins()
    return c.json({
      ok: true,
      cloudComputerId: cloudComputerIdForDeployment(deployment),
      runtimes: catalog.map((runtime) => {
        const state = installed.find((item) => stringValue(item.id) === runtime.id)
        return {
          ...runtime,
          installed: Boolean(state),
          status: stringValue(state?.status) ?? 'available',
          installedAt: stringValue(state?.installedAt),
        }
      }),
    })
  })

  h.post('/:id/runtimes/:runtimeId/install', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Runtime installation requires a user-bound actor' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const runtime = await getAgentRuntimePlugin(c.req.param('runtimeId'))
    if (!runtime) return c.json({ ok: false, error: 'Runtime plugin not found' }, 404)
    const snapshot = recordValue((deployment as Record<string, unknown>).configSnapshot)
    if (!snapshot)
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    const configSnapshot = prepareCloudComputerRedeploySnapshot(
      withCloudComputerRuntime(snapshot, runtime),
    )
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/redeploy`,
      {
        method: 'POST',
        headers: cloudComputerFacadeHeaders(c.req.raw.headers, c.req.url),
        body: JSON.stringify({ mode: 'snapshot', configSnapshot }),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok || !body) {
      return c.json(
        jsonErrorPayload(stringValue(body?.error) ?? 'Failed to install Runtime', response.status),
        { status: response.status as 400 },
      )
    }
    clearCloudComputerPerformanceCaches()
    return c.json(
      {
        ok: true,
        cloudComputerId: cloudComputerIdForDeployment(deployment),
        runtime: { ...runtime, installed: true, status: 'installed' },
        deployment: cloudComputerFacadeBody(body, { dropId: true }),
      },
      201,
    )
  })

  h.post('/:id/configuration/quote', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Configuration quotes require a user-bound actor' }, 403)
    }
    const parsed = cloudComputerConfigurationQuoteSchema.safeParse(
      await c.req.json().catch(() => ({})),
    )
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const { payload, quoteToken } = cloudComputerQuote(
      deployment as Record<string, unknown>,
      actor.userId,
      parsed.data.resourceTier,
    )
    return c.json({ ok: true, quoteToken, quote: payload })
  })

  h.patch('/:id/configuration', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Configuration changes require a user-bound actor' }, 403)
    }
    const parsed = cloudComputerConfigurationApplySchema.safeParse(
      await c.req.json().catch(() => ({})),
    )
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    let quote: CloudComputerQuotePayload
    try {
      quote = verifyCloudComputerQuote(parsed.data.quoteToken)
    } catch (error) {
      const status = (error as { status?: number }).status ?? 400
      return c.json(
        jsonErrorPayload(
          error instanceof Error ? error.message : 'Invalid configuration quote',
          status,
        ),
        { status: status as 400 },
      )
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    if (
      quote.userId !== actor.userId ||
      quote.cloudComputerId !== cloudComputerId ||
      quote.deploymentRevision !== cloudComputerDeploymentRevision(deployment.configSnapshot)
    ) {
      return c.json({ ok: false, error: 'Cloud computer changed; request a new quote' }, 409)
    }
    const wallet = await container.resolve('walletService').getWallet(actor.userId)
    const balance = wallet?.balance ?? 0
    if (balance < quote.hourlyCredits) {
      return c.json(
        {
          ok: false,
          code: 'WALLET_INSUFFICIENT_BALANCE',
          error: 'Insufficient balance for this cloud computer configuration',
          requiredAmount: quote.hourlyCredits,
          balance,
          shortfall: quote.hourlyCredits - balance,
          nextAction: 'earn_or_recharge',
        },
        402,
      )
    }
    const snapshot = recordValue((deployment as Record<string, unknown>).configSnapshot)
    if (!snapshot)
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    const configSnapshot = prepareCloudComputerRedeploySnapshot(
      withCloudComputerResourceProfile(snapshot, quote),
    )
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/redeploy`,
      {
        method: 'POST',
        headers: cloudComputerFacadeHeaders(c.req.raw.headers, c.req.url),
        body: JSON.stringify({ mode: 'snapshot', configSnapshot }),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok || !body) {
      return c.json(
        jsonErrorPayload(
          stringValue(body?.error) ?? 'Failed to change cloud computer configuration',
          response.status,
        ),
        { status: response.status as 400 },
      )
    }
    const deploymentId = stringValue(body.id)
    const updated = deploymentId
      ? await container.resolve('cloudDeploymentDao').updateResourcePricing({
          id: deploymentId,
          userId: actor.userId,
          resourceTier: quote.resourceTier,
          hourlyCost: quote.hourlyCredits,
          monthlyCost: quote.monthlyCredits,
        })
      : null
    clearCloudComputerPerformanceCaches()
    return c.json({
      ok: true,
      cloudComputer: toCloudComputer(
        (updated ?? { ...body, configSnapshot }) as Record<string, unknown>,
        localeFromRequest(c),
      ),
      effectiveAt: new Date().toISOString(),
      quote,
    })
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
    let updated: CloudComputerDeployment = deployment
    if (parsed.data.name !== undefined) {
      const renamed = await container
        .resolve('cloudDeploymentDao')
        .updateName(deployment.id, actor.userId, parsed.data.name)
      if (!renamed) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
      updated = { ...updated, ...renamed }
    }
    if (parsed.data.shellColor !== undefined) {
      const snapshot = ensureCloudComputerWorkspaceSnapshot(
        recordValue(updated.configSnapshot) ?? {},
      )
      const overlay = recordValue(snapshot.cloudComputer) ?? {}
      const appearance = recordValue(overlay.appearance) ?? {}
      const configSnapshot = {
        ...snapshot,
        cloudComputer: {
          ...overlay,
          appearance: { ...appearance, shellColor: parsed.data.shellColor },
        },
      }
      const recolored = await container
        .resolve('cloudDeploymentDao')
        .updateConfigSnapshot(deployment.id, configSnapshot)
      if (!recolored) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
      updated = { ...updated, ...recolored, configSnapshot }
      clearCloudComputerPerformanceCaches()
    }
    return c.json(toCloudComputer(updated as Record<string, unknown>, localeFromRequest(c)))
  })

  h.get('/:id/apps', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer Apps require a user-bound actor' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const identityKey = cloudComputerIdentityKey(deployment)
    const candidates = await container
      .resolve('cloudDeploymentDao')
      .listCloudComputerCandidatesByUser(actor.userId)
    const deploymentIds = candidates
      .filter((candidate) => cloudComputerIdentityKey(candidate) === identityKey)
      .map((candidate) => candidate.id)
    const instances = await container.resolve('cloudExposureDao').listAppInstancesByDeployments({
      deploymentIds,
      userId: actor.userId,
    })
    return c.json({
      ok: true,
      cloudComputerId: cloudComputerIdForDeployment(deployment),
      apps: instances.map((instance) => ({
        id: instance.id,
        appKey: instance.appKey,
        name: instance.name,
        status: instance.status,
        stableBaseUrl: instance.stableBaseUrl,
        manifestUrl: instance.manifestUrl,
        serverId: instance.serverId,
        sourcePath: instance.sourcePath,
        currentReleaseId: instance.currentReleaseId,
        updatedAt: isoTimestamp(instance.updatedAt),
      })),
    })
  })

  h.get('/:id/connectors', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system' || actor.kind === 'agent') {
      return c.json(
        { ok: false, error: 'Cloud Computer connectors require a user-bound actor' },
        403,
      )
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)

    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const connectorDao = container.resolve('cloudConnectorDao')
    const connectorService = container.resolve('cloudConnectorService')
    const [bindings, connections] = await Promise.all([
      connectorDao.listBindings(actor.userId, cloudComputerId),
      connectorDao.listConnections(actor.userId),
    ])
    const bindingsByPlugin = new Map(bindings.map((binding) => [binding.pluginId, binding]))
    const connectionsByPlugin = new Map(
      connections.map((connection) => [connection.pluginId, connection]),
    )
    const locale = c.req.query('locale') ?? c.req.header('accept-language')

    const connectors = await Promise.all(
      connectorService.listCatalog(locale).map(async (catalog) => {
        let binding = bindingsByPlugin.get(catalog.id) ?? null
        const connection = connectionsByPlugin.get(catalog.id) ?? null
        if (binding?.targetDeploymentId) {
          const target = await container
            .resolve('cloudDeploymentDao')
            .findByIdOnly(binding.targetDeploymentId)
          if (target?.userId === actor.userId) {
            let nextStatus: 'configured' | 'applying' | 'ready' | 'error'
            let nextError: string | null = null
            if (target.status === 'deployed') {
              const runtimeVerification = await verifyCloudComputerConnectorRuntime(
                container,
                target as CloudComputerDeployment,
                catalog.id,
              ).catch((error) => ({
                verified: false,
                error:
                  error instanceof Error ? error.message : 'Connector runtime verification failed',
              }))
              nextStatus = runtimeVerification.verified ? 'ready' : 'error'
              nextError = runtimeVerification.error
            } else if (target.status === 'failed') {
              nextStatus = 'error'
              nextError = target.errorMessage ?? 'Connector deployment failed'
            } else if (
              target.status === 'pending' ||
              target.status === 'deploying' ||
              target.status === 'resuming'
            ) {
              nextStatus = 'applying'
            } else if (target.status === 'paused') {
              nextStatus = 'configured'
            } else if (
              target.status === 'cancelling' ||
              target.status === 'destroying' ||
              target.status === 'destroyed'
            ) {
              nextStatus = 'error'
              nextError = `Connector deployment is ${target.status}`
            } else {
              nextStatus =
                binding.status === 'ready' ||
                binding.status === 'error' ||
                binding.status === 'applying'
                  ? binding.status
                  : 'configured'
              nextError = binding.lastError
            }
            if (nextStatus !== binding.status || nextError !== binding.lastError) {
              binding =
                (await connectorDao.markBinding(binding.id, {
                  status: nextStatus,
                  lastError: nextError,
                })) ?? binding
            }
          }
        }
        const profile = recordValue(connection?.profile)
        return {
          ...catalog,
          connected: Boolean(binding),
          status: binding?.status ?? 'available',
          options: binding?.options ?? {},
          lastError: binding?.lastError ?? null,
          account: connection
            ? {
                configured: true,
                status: connection.status,
                authType: connection.authType,
                fields: connection.credentialFields,
                accountId: stringValue(profile?.accountId),
                accountName: stringValue(profile?.accountName),
                avatarUrl: stringValue(profile?.avatarUrl),
                scopes: Array.isArray(profile?.scopes)
                  ? profile.scopes.filter((scope): scope is string => typeof scope === 'string')
                  : [],
                lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
              }
            : null,
        }
      }),
    )

    return c.json({ ok: true, cloudComputerId, connectors })
  })

  h.post('/:id/connectors/:pluginId/oauth/start', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system' || actor.kind === 'agent') {
      return c.json({ ok: false, error: 'OAuth setup requires an interactive user' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const configuredOrigin = process.env.CLOUD_CONNECTOR_OAUTH_ORIGIN?.trim().replace(/\/$/, '')
    const requestOrigin = new URL(c.req.url).origin
    const connectorService = container.resolve('cloudConnectorService')
    const callbackPath = connectorService.getOAuthCallbackPath(c.req.param('pluginId'))
    const redirectUri = `${configuredOrigin || requestOrigin}${callbackPath}`
    try {
      const authorization = await connectorService.startOAuthAuthorization({
        userId: actor.userId,
        pluginId: c.req.param('pluginId'),
        cloudComputerId: cloudComputerIdForDeployment(deployment),
        redirectUri,
      })
      return c.json({ ok: true, ...authorization })
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      return c.json(
        jsonErrorPayload(
          error instanceof Error ? error.message : 'Failed to start OAuth authorization',
          status,
        ),
        { status: status as 400 },
      )
    }
  })

  h.put('/:id/connectors/:pluginId', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system' || actor.kind === 'agent') {
      return c.json({ ok: false, error: 'Connector setup requires an interactive user' }, 403)
    }
    const parsed = configureCloudComputerConnectorSchema.safeParse(
      await c.req.json().catch(() => ({})),
    )
    if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400)
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const runtime = extractCloudSaasRuntime(deployment.configSnapshot)
    if (!runtime.configSnapshot) {
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    }

    const pluginId = c.req.param('pluginId')
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const connectorDao = container.resolve('cloudConnectorDao')
    const connectorService = container.resolve('cloudConnectorService')
    try {
      const existingBinding = await connectorDao.findBinding(
        actor.userId,
        cloudComputerId,
        pluginId,
      )
      const declaredInBase =
        existingBinding?.declaredInBase ??
        cloudComputerSnapshotUsesPlugin(runtime.configSnapshot, pluginId)
      const options = connectorService.sanitizeOptions(pluginId, parsed.data.options)
      const { connection, verification } = await connectorService.saveConnection(
        actor.userId,
        pluginId,
        parsed.data.credentials,
      )
      const binding = await connectorDao.upsertBinding({
        userId: actor.userId,
        cloudComputerId,
        pluginId,
        connectionId: connection.id,
        options,
        declaredInBase,
      })
      if (!binding) throw new Error('Failed to configure connector')

      const configured = configureCloudComputerConnectorSnapshot({
        snapshot: ensureCloudComputerWorkspaceSnapshot(runtime.configSnapshot),
        pluginId,
        connectionId: connection.id,
        credentialFields: connection.credentialFields,
        options,
      })
      const headers = new Headers(c.req.raw.headers)
      headers.set('content-type', 'application/json')
      const response = await cloudSaasFacade.request(
        `/deployments/${encodeURIComponent(deployment.id)}/redeploy`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'snapshot',
            configSnapshot: prepareCloudComputerRedeploySnapshot(configured.configSnapshot),
            envVars: configured.envVars,
          }),
        },
      )
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        const error = stringValue(body?.error) ?? 'Failed to apply connector to cloud computer'
        await connectorDao.markBinding(binding.id, { status: 'error', lastError: error })
        return c.json(jsonErrorPayload(error, response.status, { cloudComputerId, pluginId }), {
          status: response.status as 400,
        })
      }
      clearCloudComputerPerformanceCaches()
      const targetDeploymentId = stringValue(body?.id)
      await connectorDao.markBinding(binding.id, {
        status: 'applying',
        targetDeploymentId,
        lastError: null,
      })
      return c.json(
        {
          ok: true,
          cloudComputerId,
          pluginId,
          status: 'applying',
          deploymentId: targetDeploymentId,
          verified: verification.verified,
          account: verification.profile,
        },
        202,
      )
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      return c.json(
        jsonErrorPayload(
          error instanceof Error ? error.message : 'Failed to configure connector',
          status,
        ),
        { status: status as 400 },
      )
    }
  })

  h.post('/:id/connectors/:pluginId/verify', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system' || actor.kind === 'agent') {
      return c.json(
        { ok: false, error: 'Connector verification requires an interactive user' },
        403,
      )
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    try {
      const pluginId = c.req.param('pluginId')
      const cloudComputerId = cloudComputerIdForDeployment(deployment)
      const connectorDao = container.resolve('cloudConnectorDao')
      const binding = await connectorDao.findBinding(actor.userId, cloudComputerId, pluginId)
      if (!binding) return c.json({ ok: false, error: 'Connector is not configured' }, 404)
      const target = binding.targetDeploymentId
        ? await container.resolve('cloudDeploymentDao').findByIdOnly(binding.targetDeploymentId)
        : deployment
      if (
        !target ||
        (binding.targetDeploymentId &&
          (target as CloudComputerDeployment & { userId?: string }).userId !== actor.userId)
      ) {
        return c.json({ ok: false, error: 'Connector deployment not found' }, 404)
      }

      const [accountVerification, runtimeVerification] = await Promise.all([
        container.resolve('cloudConnectorService').verifySavedConnection(actor.userId, pluginId),
        verifyCloudComputerConnectorRuntime(container, target as CloudComputerDeployment, pluginId),
      ])
      await connectorDao.markBinding(binding.id, {
        status: runtimeVerification.verified ? 'ready' : 'error',
        lastError: runtimeVerification.error,
      })
      const catalog = container
        .resolve('cloudConnectorService')
        .listCatalog()
        .find((item) => item.id === pluginId)
      return c.json({
        ok: true,
        verified:
          runtimeVerification.verified &&
          (catalog?.authType === 'none' || accountVerification.verified),
        profile: accountVerification.profile,
      })
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500
      return c.json(
        jsonErrorPayload(
          error instanceof Error ? error.message : 'Connector verification failed',
          status,
        ),
        { status: status as 400 },
      )
    }
  })

  h.delete('/:id/connectors/:pluginId', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system' || actor.kind === 'agent') {
      return c.json({ ok: false, error: 'Connector removal requires an interactive user' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const runtime = extractCloudSaasRuntime(deployment.configSnapshot)
    if (!runtime.configSnapshot) {
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    }
    const pluginId = c.req.param('pluginId')
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const connectorDao = container.resolve('cloudConnectorDao')
    const binding = await connectorDao.findBinding(actor.userId, cloudComputerId, pluginId)
    if (!binding) return c.json({ ok: true, cloudComputerId, pluginId, status: 'available' })
    const connection = await connectorDao.findConnection(actor.userId, pluginId)
    if (!connection) return c.json({ ok: false, error: 'Connector account not found' }, 404)
    const configSnapshot = removeCloudComputerConnectorFromSnapshot({
      snapshot: ensureCloudComputerWorkspaceSnapshot(runtime.configSnapshot),
      pluginId,
      credentialFields: connection.credentialFields,
      optionKeys: Object.keys(binding.options),
      declaredInBase: binding.declaredInBase,
    })
    const headers = new Headers(c.req.raw.headers)
    headers.set('content-type', 'application/json')
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/redeploy`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'snapshot',
          configSnapshot: prepareCloudComputerRedeploySnapshot(configSnapshot),
          removeEnvKeys: connection.credentialFields,
        }),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok) {
      const error = stringValue(body?.error) ?? 'Failed to remove connector from cloud computer'
      await connectorDao.markBinding(binding.id, { status: 'error', lastError: error })
      return c.json(jsonErrorPayload(error, response.status, { cloudComputerId, pluginId }), {
        status: response.status as 400,
      })
    }
    clearCloudComputerPerformanceCaches()
    await connectorDao.deleteBinding(actor.userId, cloudComputerId, pluginId)
    return c.json({
      ok: true,
      cloudComputerId,
      pluginId,
      status: 'available',
      deploymentId: stringValue(body?.id),
    })
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
    if (response.ok) {
      await setCloudComputerBuddyRuntimeState(
        container,
        deployment as CloudComputerDeployment,
        'pause',
      )
      clearCloudComputerPerformanceCaches()
    }
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
    const buddies = await listCloudComputerBuddies(container, deployment as Record<string, unknown>)
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
    if (parsed.data.serverId) {
      const membership = await container
        .resolve('serverDao')
        .getMember(parsed.data.serverId, actor.userId)
      if (!membership) {
        return c.json(
          { ok: false, error: 'You must be a member of the target Space to add this Buddy' },
          403,
        )
      }
    }
    const runtimePlugin = await getAgentRuntimePlugin(parsed.data.runtimeId)
    if (!runtimePlugin) {
      return c.json({ ok: false, error: 'Runtime plugin is not installed on this server' }, 422)
    }
    const currentTier = (deployment as CloudComputerDeployment).resourceTier ?? 'lightweight'
    if (
      runtimePlugin.minimumResourceTier &&
      cloudComputerTierRank(currentTier) < cloudComputerTierRank(runtimePlugin.minimumResourceTier)
    ) {
      return c.json(
        {
          ok: false,
          code: 'cloud_computer_runtime_requires_configuration',
          error: 'This Runtime requires a larger cloud computer configuration',
          runtimeId: runtimePlugin.id,
          currentResourceTier: currentTier,
          requiredResourceTier: runtimePlugin.minimumResourceTier,
        },
        409,
      )
    }
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

    const created = addCloudComputerBuddyToSnapshot(
      ensureCloudComputerWorkspaceSnapshot(baseSnapshot),
      parsed.data,
    )
    const runtimeWasInstalled = cloudComputerRuntimeOverlay(baseSnapshot).runtimes.some(
      (runtime) => stringValue(runtime.id) === runtimePlugin.id,
    )
    const configSnapshot = prepareCloudComputerRedeploySnapshot(
      withCloudComputerRuntime(created.configSnapshot, runtimePlugin),
    )
    const buddy = created.buddy
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
    clearCloudComputerPerformanceCaches()
    const nextDeploymentId = stringValue(body?.id)
    if (nextDeploymentId) {
      const resourceTier = cloudComputerResourceTierSchema
        .catch('lightweight')
        .parse(stringValue((deployment as Record<string, unknown>).resourceTier) ?? 'lightweight')
      const profile = cloudComputerResourceProfile(resourceTier)
      const buddyCount = deploymentBuddyCountFromSnapshot(configSnapshot)
      await container.resolve('cloudDeploymentDao').updateResourcePricing({
        id: nextDeploymentId,
        userId: actor.userId,
        resourceTier,
        hourlyCost: cloudComputerHourlyCredits(profile, buddyCount),
        monthlyCost: cloudComputerHourlyCredits(profile, buddyCount) * 720,
      })
    }
    return c.json(
      body
        ? {
            cloudComputerId,
            buddy,
            runtime: {
              id: runtimePlugin.id,
              pluginId: runtimePlugin.pluginId,
              installed: true,
              reused: runtimeWasInstalled,
            },
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

  h.delete('/:id/buddies/:buddyId', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer Buddies require a user-bound actor' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const deploymentRecord = deployment as Record<string, unknown>
    const buddyId = c.req.param('buddyId')
    const desiredBuddy = cloudComputerDesiredBuddies(deployment.configSnapshot).find(
      (buddy) => buddy.id === buddyId,
    )
    const provisionedBuddy = extractCloudProvisionedBuddies(deployment.configSnapshot).find(
      (buddy) => buddy.id === buddyId,
    )
    const queuedCleanup = cloudComputerBuddyIdentityCleanupQueue(deployment.configSnapshot).find(
      (cleanup) => cleanup.buddyId === buddyId,
    )
    if (!desiredBuddy && !provisionedBuddy && !queuedCleanup) {
      return c.json({ ok: false, error: 'Buddy not found' }, 404)
    }
    const platformAgentId = provisionedBuddy?.agentId ?? queuedCleanup?.agentId ?? null
    const agentService = container.resolve('agentService')
    const agent = platformAgentId
      ? ((await agentService.getById(platformAgentId).catch(() => null)) as Record<
          string,
          unknown
        > | null)
      : null

    const snapshot = recordValue(deployment.configSnapshot)
    if (!snapshot) {
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    }
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const buddy = cloudComputerBuddySummary(
      desiredBuddy ?? {
        id: buddyId,
        name:
          stringValue(recordValue(agent?.botUser)?.displayName) ??
          stringValue(recordValue(agent?.botUser)?.username) ??
          buddyId,
        description: stringValue(recordValue(agent?.config)?.description),
        avatarUrl: stringValue(recordValue(agent?.botUser)?.avatarUrl),
        runtimeAgentId: null,
        kernelType: stringValue(agent?.kernelType),
      },
      agent,
      queuedCleanup ? 'removing' : undefined,
    )
    if (queuedCleanup) {
      return c.json({ ok: true, cloudComputerId, buddy: { ...buddy, status: 'removing' } }, 202)
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
    let baseAgent: Record<string, unknown> | null = null
    if (cloudComputerDesiredBuddies(baseSnapshot).length <= 1) {
      const template = await container.resolve('cloudSaasUseCase').getTemplateBySlugForUser({
        ctx: createActorContext(actor),
        slug: CLOUD_COMPUTER_BASE_TEMPLATE_SLUG,
      })
      const templateSnapshot = recordValue(template?.content)
      const templateDeployments = recordValue(templateSnapshot?.deployments)
      const templateAgents = Array.isArray(templateDeployments?.agents)
        ? templateDeployments.agents
            .map((candidate) => recordValue(candidate))
            .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate))
        : []
      const templateBaseAgentId = stringValue(
        recordValue(templateSnapshot?.cloudComputer)?.baseAgentId,
      )
      baseAgent =
        templateAgents.find((candidate) => stringValue(candidate.id) === templateBaseAgentId) ??
        templateAgents[0] ??
        null
    }
    const removed = removeCloudComputerBuddyFromSnapshot(
      ensureCloudComputerWorkspaceSnapshot(baseSnapshot),
      {
        buddyId,
        platformAgentId,
        runtimeAgentId:
          desiredBuddy?.runtimeAgentId ??
          cloudComputerRuntimeAgentIdForBuddy(baseSnapshot, buddyId) ??
          buddyId,
        userId: provisionedBuddy?.userId ?? stringValue(agent?.userId),
        deploymentId: provisionedBuddy?.deploymentId ?? stringValue(deploymentRecord.id),
        baseAgent,
      },
    )
    if (!removed.removed) {
      return c.json({ ok: false, error: 'Buddy is not present in the current configuration' }, 409)
    }

    const configSnapshot = prepareCloudComputerRedeploySnapshot(removed.configSnapshot)
    const headers = new Headers(c.req.raw.headers)
    headers.set('content-type', 'application/json')
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/redeploy`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'snapshot', configSnapshot }),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) {
        const latest = await requireCloudComputer(container, actor, c.req.param('id'))
        if (
          latest &&
          cloudComputerBuddyIdentityCleanupQueue(latest.configSnapshot).some(
            (cleanup) => cleanup.buddyId === buddyId,
          )
        ) {
          return c.json({ ok: true, cloudComputerId, buddy: { ...buddy, status: 'removing' } }, 202)
        }
      }
      return c.json(
        jsonErrorPayload(
          stringValue(body?.error) ?? 'Failed to remove cloud computer Buddy',
          response.status,
          {
            cloudComputerId,
            buddy: { ...buddy, status: 'removing' },
            redeploy: body ? cloudComputerFacadeBody(body, { dropId: true }) : null,
          },
        ),
        { status: response.status as 400 },
      )
    }

    clearCloudComputerPerformanceCaches()
    const nextDeploymentId = stringValue(body?.id)
    if (nextDeploymentId) {
      const resourceTier = cloudComputerResourceTierSchema
        .catch('lightweight')
        .parse(stringValue(deploymentRecord.resourceTier) ?? 'lightweight')
      const profile = cloudComputerResourceProfile(resourceTier)
      const buddyCount = deploymentBuddyCountFromSnapshot(configSnapshot)
      await container.resolve('cloudDeploymentDao').updateResourcePricing({
        id: nextDeploymentId,
        userId: actor.userId,
        resourceTier,
        hourlyCost: cloudComputerHourlyCredits(profile, buddyCount),
        monthlyCost: cloudComputerHourlyCredits(profile, buddyCount) * 720,
      })
    }
    return c.json(
      {
        ok: true,
        cloudComputerId,
        buddy: { ...buddy, status: 'removing' },
        redeploy: body ? cloudComputerFacadeBody(body, { dropId: true }) : null,
      },
      202,
    )
  })

  h.post('/:id/buddies/:buddyId/:action', async (c) => {
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
    const buddyId = c.req.param('buddyId')
    const desiredBuddy = cloudComputerDesiredBuddies(deployment.configSnapshot).find(
      (buddy) => buddy.id === buddyId,
    )
    const provisionedBuddy = extractCloudProvisionedBuddies(deployment.configSnapshot).find(
      (buddy) => buddy.id === buddyId,
    )
    if (!provisionedBuddy) {
      return c.json(
        {
          ok: false,
          code: desiredBuddy ? 'cloud_computer_buddy_preparing' : 'cloud_computer_buddy_not_found',
          error: desiredBuddy ? 'Buddy is still preparing' : 'Buddy not found',
        },
        desiredBuddy ? 409 : 404,
      )
    }
    const agentService = container.resolve('agentService')
    const agent = (await agentService.getById(provisionedBuddy.agentId)) as Record<
      string,
      unknown
    > | null
    if (!agent) return c.json({ ok: false, error: 'Buddy not found' }, 404)
    try {
      const updated =
        action === 'start'
          ? await agentService.start(provisionedBuddy.agentId)
          : await agentService.stop(provisionedBuddy.agentId)
      const updatedRecord = recordValue(updated) ?? {}
      return c.json({
        ok: true,
        buddy: cloudComputerBuddySummary(
          desiredBuddy ?? {
            id: buddyId,
            name:
              stringValue(recordValue(agent.botUser)?.displayName) ??
              stringValue(recordValue(agent.botUser)?.username) ??
              buddyId,
            description: stringValue(recordValue(agent.config)?.description),
            avatarUrl: stringValue(recordValue(agent.botUser)?.avatarUrl),
            runtimeAgentId: null,
            kernelType: stringValue(agent.kernelType),
          },
          { ...agent, ...updatedRecord },
        ),
      })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      return c.json(
        jsonErrorPayload(err instanceof Error ? err.message : 'Failed to update Buddy', status),
        { status: status as 400 },
      )
    }
  })

  h.post('/:id/pause', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer pause requires a user-bound actor' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const result = await forwardLifecycle({
      request: c.req.raw,
      deployment,
      action: 'pause',
      body: {},
      onSuccess: () => setCloudComputerBuddyRuntimeState(container, deployment, 'pause'),
    })
    return c.json(result.body, { status: result.status as 200 })
  })

  h.post('/:id/resume', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer resume requires a user-bound actor' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const result = await forwardLifecycle({
      request: c.req.raw,
      deployment,
      action: 'resume',
      body: {},
      onSuccess: () => setCloudComputerBuddyRuntimeState(container, deployment, 'resume'),
    })
    return c.json(result.body, { status: result.status as 200 })
  })

  h.post('/:id/cancel', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json({ ok: false, error: 'Cloud computer cancel requires a user-bound actor' }, 403)
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const result = await forwardLifecycle({
      request: c.req.raw,
      deployment,
      action: 'cancel',
    })
    return c.json(result.body, { status: result.status as 200 })
  })

  h.delete('/:id', async (c) => {
    const actor = c.get('actor')
    if (actor.kind === 'system') {
      return c.json(
        { ok: false, error: 'Cloud computer deletion requires a user-bound actor' },
        403,
      )
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const result = await forwardLifecycle({
      request: c.req.raw,
      deployment,
      method: 'DELETE',
    })
    return c.json(result.body, { status: result.status as 200 })
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
    const currentSnapshot = recordValue(deployment.configSnapshot)
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/${recoveryAction}`,
      {
        method: 'POST',
        headers,
        ...(recoveryAction === 'redeploy' && currentSnapshot
          ? {
              body: JSON.stringify({
                mode: 'snapshot',
                configSnapshot: prepareCloudComputerRedeploySnapshot(currentSnapshot),
              }),
            }
          : {}),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const payload = runtimeRepairPayload({
      cloudComputerId,
      deployment,
      recoveryAction,
      body,
      status: response.status,
    })
    if (response.ok) clearCloudComputerPerformanceCaches()
    const overlays = response.ok
      ? await reconcileCloudComputerRuntimeOverlays(container, {
          ...deployment,
          ...(currentSnapshot
            ? { configSnapshot: ensureCloudComputerWorkspaceSnapshot(currentSnapshot) }
            : {}),
        }).catch(() => [])
      : []
    return c.json({ ...payload, overlays }, { status: response.status as 200 })
  })

  h.post('/:id/runtime/rebuild', async (c) => {
    const actor = c.get('actor')
    if (actor.kind !== 'user') {
      return c.json(
        { ok: false, error: 'Cloud computer runtime rebuild requires a user session' },
        403,
      )
    }
    const deployment = await requireCloudComputer(container, actor, c.req.param('id'))
    if (!deployment) return c.json({ ok: false, error: 'Cloud computer not found' }, 404)
    const currentSnapshot = recordValue(deployment.configSnapshot)
    if (!currentSnapshot) {
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    }

    const cloudComputerId = cloudComputerIdForDeployment(deployment)
    const { configSnapshot: rebuildSnapshot, detachedBindingIds } =
      await safeCloudComputerRebuildSnapshot(container, {
        userId: actor.userId,
        cloudComputerId,
        snapshot: currentSnapshot,
      })
    const configSnapshot = prepareCloudComputerRedeploySnapshot(rebuildSnapshot)
    const rebuildProfile = cloudComputerResourceProfile(
      stringValue(recordValue(recordValue(configSnapshot.cloudComputer)?.resources)?.tier) ??
        stringValue((deployment as Record<string, unknown>).resourceTier),
    )
    const rebuildHourlyCredits = cloudComputerHourlyCredits(
      rebuildProfile,
      deploymentBuddyCountFromSnapshot(configSnapshot),
    )
    const headers = new Headers(c.req.raw.headers)
    headers.set('content-type', 'application/json')
    const response = await cloudSaasFacade.request(
      `/deployments/${encodeURIComponent(deployment.id)}/redeploy`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'snapshot', configSnapshot }),
      },
    )
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok) {
      return c.json(
        jsonErrorPayload(
          stringValue(body?.error) ?? 'Failed to rebuild cloud computer runtime',
          response.status,
          {
            cloudComputerId,
            component: 'runtime',
            recoveryAction: 'safe-rebuild',
          },
        ),
        { status: response.status as 400 },
      )
    }

    const rebuiltDeploymentId = stringValue(body?.id)
    if (rebuiltDeploymentId) {
      await container.resolve('cloudDeploymentDao').updateResourcePricing({
        id: rebuiltDeploymentId,
        userId: actor.userId,
        resourceTier: rebuildProfile.id,
        hourlyCost: rebuildHourlyCredits,
        monthlyCost: rebuildHourlyCredits * 720,
      })
    }

    await Promise.all(
      detachedBindingIds.map((bindingId) =>
        container.resolve('cloudConnectorDao').markBinding(bindingId, {
          status: 'configured',
          targetDeploymentId: null,
          lastError: null,
        }),
      ),
    )
    clearCloudComputerPerformanceCaches()
    return c.json(
      {
        ok: true,
        cloudComputerId,
        component: 'runtime',
        recoveryAction: 'safe-rebuild',
        status: stringValue(body?.status) ?? 'pending',
        detachedConnectors: detachedBindingIds.length,
        preservedWorkspace: true,
      },
      201,
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
      const snapshot = recordValue(deployment.configSnapshot)
      if (snapshot) {
        await persistCloudComputerSnapshot(
          container,
          deployment,
          withCloudComputerComponent(snapshot, 'desktop'),
        )
      }
      runtimeEnsured = await ensureDesktopRuntime(container, deployment, target)
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
      const snapshot = recordValue(deployment.configSnapshot)
      if (snapshot) {
        await persistCloudComputerSnapshot(
          container,
          deployment,
          withCloudComputerComponent(snapshot, 'browser'),
        )
      }
      runtimeEnsured = await ensureBrowserRuntime(container, deployment, target)
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
    const runtimeEnsured = await probeOrRestorePersistedComponentRuntime(
      container,
      deployment,
      'desktop',
      target,
    )
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
    const runtimeEnsured = await probeOrRestorePersistedComponentRuntime(
      container,
      deployment,
      'browser',
      target,
    )
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
      websocketUrl: vncWebSocketUrl({
        requestUrl: c.req.url,
        host: c.req.header('x-forwarded-host') ?? c.req.header('host'),
        proto: c.req.header('x-forwarded-proto'),
        id: cloudComputerId,
        kind: 'browser',
        token: signed.token,
      }),
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
    const mountPath = safeWorkspaceMountPath(parsed.data.mountPath, server.id)
    const snapshot = recordValue(deployment.configSnapshot)
    if (!snapshot) {
      return c.json({ ok: false, error: 'Cloud computer has no deployment snapshot' }, 422)
    }
    await persistCloudComputerSnapshot(
      container,
      deployment,
      withCloudComputerWorkspaceMount(snapshot, {
        serverId: server.id,
        rootId: parsed.data.rootId,
        mountPath,
        readOnly: parsed.data.readOnly,
      }),
    )
    const mount = await ensureWorkspaceMountRuntime(container, deployment, {
      serverId: server.id,
      rootId: parsed.data.rootId,
      mountPath,
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
