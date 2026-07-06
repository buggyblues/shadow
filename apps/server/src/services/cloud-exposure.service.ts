import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  applyKubernetesManifestAsync,
  buildExposureServiceManifest,
  rewriteLoopbackKubeconfig,
} from '@shadowob/cloud'
import { isBuddyInboxPlatformPermission } from '@shadowob/shared'
import type { Logger } from 'pino'
import type { AppIntegrationDao } from '../dao/app-integration.dao'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudDeploymentBackupDao } from '../dao/cloud-deployment-backup.dao'
import type { CloudExposureDao } from '../dao/cloud-exposure.dao'
import type { ServerDao } from '../dao/server.dao'
import type {
  CloudAppStatePolicy,
  CloudBackupPolicyConfig,
  CloudExposureAuthMode,
  CloudExposurePolicy,
  ServerAppManifest,
} from '../db/schema'
import { localCloudExposureGatewayEnabled } from '../lib/cloud-exposure-gateway'
import type { CloudExposureTokenPayload } from '../lib/jwt'
import {
  rewriteServerAppManifestToBase,
  serverAppManifestUrlForBase,
} from '../lib/server-app-manifest-urls'
import type { Actor } from '../security/actor'
import { type ServerAppManifestInput } from '../validators/app-integration.schema'
import type { AppIntegrationService } from './app-integration.service'

type ExposureVisibility = 'private' | 'signed' | 'public'
type ExposureKind = 'http_service' | 'server_app'
type ReleaseMode = 'preview' | 'promoted' | 'installed'

export type RuntimeExposureRequest = {
  id: string
  port: number
  kind?: ExposureKind
  displayName?: string
  visibility?: ExposureVisibility
  auth?: CloudExposureAuthMode
  ttlSeconds?: number
  healthPath?: string
  appKey?: string
  manifestPath?: string
  policy?: CloudExposurePolicy
}

export type RuntimeExposureReconcileInput = {
  deploymentId: string
  agentId: string
  desiredRevision?: string
  exposures: RuntimeExposureRequest[]
}

export type CloudAppPublishInput = {
  deploymentId: string
  agentId: string
  serverId: string
  port: number
  manifest?: unknown
  manifestUrl?: string
  appKey?: string
  sourcePath?: string
  statePaths?: string[]
  visibility?: ExposureVisibility
  releaseMode?: ReleaseMode
  install?: boolean
  defaultPermissions?: string[]
  defaultApprovalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
  buddyGrants?: Array<{
    buddyAgentId: string
    permissions: string[]
    approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
  }>
  backupOnPublish?: boolean
  backupPolicy?: CloudBackupPolicyConfig
  metadata?: Record<string, unknown>
}

type CloudDeploymentRow = Awaited<ReturnType<CloudDeploymentDao['findByIdOnly']>>
type CloudAppInstanceRow = Awaited<ReturnType<CloudExposureDao['findAppInstance']>>
type CloudExposureRow = NonNullable<Awaited<ReturnType<CloudExposureDao['findExposureById']>>>

const LOCAL_ID_RE = /^[a-z0-9]([-a-z0-9]{0,62}[a-z0-9])?$/
const APP_KEY_RE = /^[a-z][a-z0-9_.-]{1,126}[a-z0-9]$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREVIEW_TTL_SECONDS = 60 * 60
const MAX_DYNAMIC_TTL_SECONDS = 24 * 60 * 60
const INSTALLED_LEASE_SECONDS = 30 * 24 * 60 * 60
const ALLOWED_APP_PATH_PREFIXES = ['/workspace', '/state', '/tmp', '/home/shadow']
const GATEWAY_PORT_FORWARD_READY_MS = 10_000
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
const UPSTREAM_RESPONSE_STRIP_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  'content-security-policy',
  'x-frame-options',
])
const SERVER_APP_MANIFEST_PATH = '/.well-known/shadow-app.json'

interface PortForwardEntry {
  port: number
  proc: ReturnType<typeof spawn>
  ready: Promise<number>
  cleanup: () => Promise<void>
}

const portForwards = new Map<string, PortForwardEntry>()

function httpError(message: string, status = 400, code?: string) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value ?? null))
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function slugify(value: string, fallback = 'app') {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
  return (slug || fallback).slice(0, 48)
}

function ensurePathAllowed(path: string, label: string) {
  if (!path.startsWith('/')) throw httpError(`${label} must be an absolute runtime path`, 422)
  if (path.includes('\0') || path.split('/').includes('..')) {
    throw httpError(`${label} contains an unsafe path segment`, 422)
  }
  if (
    !ALLOWED_APP_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  ) {
    throw httpError(
      `${label} must be under ${ALLOWED_APP_PATH_PREFIXES.join(', ')}`,
      422,
      'UNSAFE_RUNTIME_PATH',
    )
  }
}

function actorOwnsDeployment(actor: Actor, deployment: NonNullable<CloudDeploymentRow>) {
  if (actor.kind === 'system') return true
  if (actor.userId === deployment.userId) return true
  return actor.kind === 'agent' && actor.ownerId === deployment.userId
}

function actorManagedUserId(actor: Actor) {
  if (actor.kind === 'system') return undefined
  if (actor.kind === 'agent' && actor.ownerId) return actor.ownerId
  return actor.userId
}

function validatePort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw httpError('Exposure port must be between 1 and 65535', 422)
  }
}

function toBaseUrl(host: string) {
  return `https://${host}`
}

function scopedExposureLocalId(scope: 'rt' | 'app', value: string) {
  const digest = sha256({ scope, value }).slice(0, 10)
  const maxSlugLength = 64 - scope.length - digest.length - 2
  const slug = slugify(value, scope).slice(0, maxSlugLength)
  return `${scope}-${slug}-${digest}`
}

function runtimeStorageLocalId(localId: string) {
  return scopedExposureLocalId('rt', localId)
}

function appStorageLocalId(appKey: string) {
  return scopedExposureLocalId('app', appKey)
}

function ensureVisibilityAllowed(visibility: ExposureVisibility) {
  if (visibility !== 'public') return
  if (process.env.SHADOWOB_CLOUD_EXPOSURE_ALLOW_PUBLIC === 'true') return
  throw httpError(
    'Public cloud exposure is not enabled. Use private or signed visibility.',
    422,
    'PUBLIC_EXPOSURE_DISABLED',
  )
}

function shouldSyncKubernetesExposureServices() {
  if (process.env.SHADOWOB_CLOUD_EXPOSURE_SYNC_K8S === 'false') return false
  if (process.env.NODE_ENV === 'test' && process.env.SHADOWOB_CLOUD_EXPOSURE_SYNC_K8S !== 'true') {
    return false
  }
  return true
}

function shouldSyncKubernetesExposureServicesOnProxy() {
  return process.env.SHADOWOB_CLOUD_EXPOSURE_SYNC_ON_PROXY === 'true'
}

async function fileExists(candidate: string) {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function ambientKubeconfigContent() {
  const candidates = [
    ...(process.env.KUBECONFIG?.split(delimiter)
      .map((candidate) => candidate.trim())
      .filter(Boolean) ?? []),
    process.env.KUBECONFIG_HOST_PATH?.trim(),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) continue
    return await readFile(candidate, 'utf8')
  }
  return null
}

async function createPortForwardKubeconfigArgs(kubeconfig?: string) {
  const raw = kubeconfig?.trim() ? kubeconfig : await ambientKubeconfigContent()
  if (!raw) return { args: [] as string[], cleanup: async () => {} }
  const dir = await mkdtemp(join(tmpdir(), 'shadow-exp-kube-'))
  const path = join(dir, 'kubeconfig')
  await writeFile(path, rewriteLoopbackKubeconfig(raw, process.env.KUBECONFIG_LOOPBACK_HOST), {
    mode: 0o600,
  })
  return {
    args: ['--kubeconfig', path],
    cleanup: async () => {
      try {
        await rm(dir, { recursive: true, force: true })
      } catch {
        // best-effort temp kubeconfig cleanup
      }
    },
  }
}

function reserveLocalPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => {
        if (error) reject(error)
        else if (port) resolve(port)
        else reject(new Error('Failed to reserve a local gateway port'))
      })
    })
  })
}

async function ensurePortForward(input: {
  namespace: string
  serviceName: string
  targetPort: number
  kubeconfig?: string
}) {
  const key = `${input.namespace}/${input.serviceName}:${input.targetPort}`
  const existing = portForwards.get(key)
  if (existing && !existing.proc.killed) return existing.ready

  const localPort = await reserveLocalPort()
  const kubeconfig = await createPortForwardKubeconfigArgs(input.kubeconfig)
  const args = [
    ...kubeconfig.args,
    '-n',
    input.namespace,
    'port-forward',
    '--address',
    '127.0.0.1',
    `svc/${input.serviceName}`,
    `${localPort}:${input.targetPort}`,
  ]
  const proc = spawn('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let settled = false
  let output = ''

  const ready = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGTERM')
      reject(new Error(`Cloud exposure port-forward timed out: ${output.trim()}`))
    }, GATEWAY_PORT_FORWARD_READY_MS)

    const onChunk = (chunk: Buffer) => {
      output += chunk.toString('utf8')
      if (settled || !/Forwarding from/i.test(output)) return
      settled = true
      clearTimeout(timer)
      resolve(localPort)
    }

    proc.stdout?.on('data', onChunk)
    proc.stderr?.on('data', onChunk)
    proc.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    proc.on('close', (code) => {
      portForwards.delete(key)
      void kubeconfig.cleanup()
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(
        new Error(
          output.trim() || `Cloud exposure port-forward exited with code ${code ?? 'unknown'}`,
        ),
      )
    })
  })

  const entry = { port: localPort, proc, ready, cleanup: kubeconfig.cleanup }
  portForwards.set(key, entry)
  return ready
}

function gatewayMode() {
  return (
    process.env.SHADOWOB_CLOUD_EXPOSURE_GATEWAY_MODE?.trim() ||
    (localCloudExposureGatewayEnabled()
      ? 'port-forward'
      : process.env.NODE_ENV === 'production'
        ? 'cluster'
        : 'port-forward')
  )
}

function copyRequestHeaders(headers: Headers) {
  const result = new Headers()
  for (const [key, value] of headers.entries()) {
    const normalized = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(normalized)) continue
    if (normalized === 'cookie' || normalized === 'authorization') continue
    result.set(key, value)
  }
  result.set('X-Shadow-Exposure-Gateway', '1')
  return result
}

function copyResponseHeaders(headers: Headers) {
  const result = new Headers()
  for (const [key, value] of headers.entries()) {
    if (UPSTREAM_RESPONSE_STRIP_HEADERS.has(key.toLowerCase())) continue
    result.set(key, value)
  }
  return result
}

function exposureDisplayLocalId(exposure: CloudExposureRow) {
  const dynamicConfig = isRecord(exposure.dynamicConfig) ? exposure.dynamicConfig : {}
  const localId = dynamicConfig.localId
  if (typeof localId === 'string' && localId) return localId
  const appKey = dynamicConfig.appKey
  if (typeof appKey === 'string' && appKey) return appKey
  return exposure.localId
}

function isServerAppManifestRequest(method: string, path: string) {
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) return false
  return (path.split(/[?#]/u)[0] || '/') === SERVER_APP_MANIFEST_PATH
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function validatePermissions(
  manifest: ServerAppManifest,
  permissions?: string[],
  options: { allowPlatformPermissions?: boolean } = {},
) {
  if (!permissions?.length) return
  const allowed = new Set(manifest.commands.map((command) => command.permission))
  for (const permission of permissions) {
    if (permission === '*' || allowed.has(permission)) continue
    if (options.allowPlatformPermissions && isBuddyInboxPlatformPermission(permission)) continue
    throw httpError(`Unknown app permission: ${permission}`, 422)
  }
}

function gatewayPolicy(exposure: CloudExposureRow): CloudExposurePolicy {
  return isRecord(exposure.policy) ? exposure.policy : {}
}

function gatewayPolicyResponse(body: unknown, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(headers ?? {}),
    },
  })
}

function checkGatewayRequestPolicy(exposure: CloudExposureRow, request: Request) {
  const policy = gatewayPolicy(exposure)
  const method = request.method.toUpperCase()
  const allowedMethods = policy.allowedMethods
    ?.map((item) => item.trim().toUpperCase())
    .filter(Boolean)
  if (allowedMethods?.length && !allowedMethods.includes(method)) {
    return gatewayPolicyResponse({ ok: false, error: 'method_not_allowed' }, 405, {
      Allow: allowedMethods.join(', '),
    })
  }

  const contentLength = request.headers.get('content-length')
  if (policy.bodyLimitBytes && contentLength && Number(contentLength) > policy.bodyLimitBytes) {
    return gatewayPolicyResponse({ ok: false, error: 'request_body_too_large' }, 413)
  }

  return null
}

function applyGatewayResponsePolicy(headers: Headers, exposure: CloudExposureRow) {
  const policy = gatewayPolicy(exposure)
  if (policy.allowIframe === false) {
    headers.set('X-Frame-Options', 'DENY')
    headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  }
}

function redactExposure(
  row: NonNullable<Awaited<ReturnType<CloudExposureDao['findExposureById']>>>,
) {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    serverId: row.serverId,
    appInstanceId: row.appInstanceId,
    appReleaseId: row.appReleaseId,
    agentId: row.agentId,
    localId: exposureDisplayLocalId(row),
    source: row.source,
    kind: row.exposureKind,
    releaseMode: row.releaseMode,
    visibility: row.visibility,
    authMode: row.authMode,
    status: row.status,
    host: row.host,
    stableHost: row.stableHost,
    publicBaseUrl: row.publicBaseUrl,
    manifestUrl: row.manifestUrl,
    targetPort: row.targetPort,
    health: row.health,
    policy: row.policy,
    lastHeartbeatAt: row.lastHeartbeatAt,
    leaseExpiresAt: row.leaseExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function redactAppInstance(row: NonNullable<CloudAppInstanceRow>) {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    serverId: row.serverId,
    serverAppIntegrationId: row.serverAppIntegrationId,
    agentId: row.agentId,
    appKey: row.appKey,
    name: row.name,
    stableHost: row.stableHost,
    stableBaseUrl: row.stableBaseUrl,
    manifestUrl: row.manifestUrl,
    status: row.status,
    currentReleaseId: row.currentReleaseId,
    currentExposureId: row.currentExposureId,
    sourcePath: row.sourcePath,
    statePolicy: row.statePolicy,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class CloudExposureService {
  constructor(
    private deps: {
      cloudExposureDao: CloudExposureDao
      cloudDeploymentDao: CloudDeploymentDao
      cloudDeploymentBackupDao: CloudDeploymentBackupDao
      appIntegrationDao: AppIntegrationDao
      appIntegrationService: AppIntegrationService
      serverDao: ServerDao
      logger?: Pick<Logger, 'warn'>
    },
  ) {}

  private exposureDomain() {
    return (process.env.SHADOWOB_CLOUD_EXPOSURE_DOMAIN ?? 'shadowob.com')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .toLowerCase()
  }

  private hostFor(parts: {
    deployment: NonNullable<CloudDeploymentRow>
    agentId: string
    localId: string
    appKey?: string
    stable?: boolean
  }) {
    const domain = this.exposureDomain()
    const deploymentSlug = slugify(parts.deployment.namespace, 'deployment')
    const agentSlug = slugify(parts.agentId, 'agent')
    const localSlug = slugify(parts.appKey ?? parts.localId, parts.stable ? 'app' : 'exp')
    const digest = createHash('sha256')
      .update(`${parts.deployment.id}:${parts.agentId}:${parts.localId}:${parts.appKey ?? ''}`)
      .digest('hex')
      .slice(0, 10)
    const label = parts.stable
      ? `app-${localSlug}-${digest}`
      : `exp-${deploymentSlug}-${agentSlug}-${localSlug}-${digest}`
    return `${label.slice(0, 63)}.${domain}`
  }

  private async syncExposureNetworking(exposure: CloudExposureRow) {
    if (!shouldSyncKubernetesExposureServices()) return
    if (!exposure.targetServiceName) return
    try {
      await applyKubernetesManifestAsync(
        buildExposureServiceManifest({
          exposureId: exposure.id,
          serviceName: exposure.targetServiceName,
          agentName: exposure.agentId,
          namespace: exposure.targetNamespace,
          port: exposure.targetPort,
          targetPort: exposure.targetPort,
        }),
        undefined,
        15_000,
      )
    } catch (error) {
      this.deps.logger?.warn?.(
        { error, exposureId: exposure.id, serviceName: exposure.targetServiceName },
        'Failed to sync cloud exposure service',
      )
      throw error
    }
  }

  private async requireGatewayExposure(host: string) {
    const exposure = await this.deps.cloudExposureDao.findExposureByHost(host.toLowerCase())
    if (!exposure) throw httpError('Cloud exposure not found', 404)
    if (exposure.status !== 'active') throw httpError('Cloud exposure is not active', 410)
    if (exposure.leaseExpiresAt && exposure.leaseExpiresAt.getTime() < Date.now()) {
      throw httpError('Cloud exposure lease expired', 410)
    }
    if (!exposure.targetServiceName) {
      throw httpError('Cloud exposure target service is not ready', 503)
    }
    return exposure
  }

  private async gatewayTargetBase(exposure: CloudExposureRow) {
    if (gatewayMode() === 'cluster') {
      return `http://${exposure.targetServiceName}.${exposure.targetNamespace}.svc.cluster.local:${exposure.targetPort}`
    }
    const port = await ensurePortForward({
      namespace: exposure.targetNamespace,
      serviceName: exposure.targetServiceName!,
      targetPort: exposure.targetPort,
    })
    return `http://127.0.0.1:${port}`
  }

  async gatewayProxy(host: string, request: Request, path: string) {
    const exposure = await this.requireGatewayExposure(host)
    const policyResponse = checkGatewayRequestPolicy(exposure, request)
    if (policyResponse) return policyResponse
    if (
      isServerAppManifestRequest(request.method, path) &&
      exposure.exposureKind === 'server_app'
    ) {
      return jsonResponse(await this.gatewayManifest(host))
    }
    if (shouldSyncKubernetesExposureServicesOnProxy()) {
      await this.syncExposureNetworking(exposure)
    }
    const baseUrl = await this.gatewayTargetBase(exposure)
    const upstreamUrl = new URL(path || '/', `${baseUrl}/`)
    const method = request.method.toUpperCase()
    const init: RequestInit = {
      method,
      headers: copyRequestHeaders(request.headers),
      redirect: 'manual',
      signal: request.signal,
    }
    if (!['GET', 'HEAD'].includes(method)) {
      init.body = request.body
      ;(init as RequestInit & { duplex: 'half' }).duplex = 'half'
    }
    const response = await fetch(upstreamUrl, init)
    const headers = copyResponseHeaders(response.headers)
    applyGatewayResponsePolicy(headers, exposure)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  private async requireDeploymentForActor(actor: Actor, deploymentId: string) {
    const deployment = await this.deps.cloudDeploymentDao.findByIdOnly(deploymentId)
    if (!deployment) throw httpError('Cloud deployment not found', 404)
    if (!actorOwnsDeployment(actor, deployment)) {
      throw httpError('Actor cannot manage this cloud deployment', 403)
    }
    return deployment
  }

  private async resolveServerId(serverIdOrSlug: string) {
    const server =
      (UUID_RE.test(serverIdOrSlug) ? await this.deps.serverDao.findById(serverIdOrSlug) : null) ??
      (await this.deps.serverDao.findBySlug(serverIdOrSlug))
    if (!server) throw httpError('Server not found', 404)
    return server.id
  }

  private async requireDeploymentForSidecar(
    claims: CloudExposureTokenPayload,
    input: RuntimeExposureReconcileInput,
  ) {
    if (claims.deploymentId !== input.deploymentId || claims.agentId !== input.agentId) {
      throw httpError('Cloud exposure token does not match requested deployment or agent', 403)
    }
    const deployment = await this.deps.cloudDeploymentDao.findByIdOnly(input.deploymentId)
    if (!deployment) throw httpError('Cloud deployment not found', 404)
    if (deployment.userId !== claims.userId || deployment.namespace !== claims.namespace) {
      throw httpError('Cloud exposure token is not valid for this deployment', 403)
    }
    return deployment
  }

  private validateRuntimeExposure(item: RuntimeExposureRequest) {
    const localId = item.id.trim()
    if (!LOCAL_ID_RE.test(localId)) {
      throw httpError(`Invalid exposure id "${item.id}"`, 422)
    }
    validatePort(item.port)
    const visibility = item.visibility ?? 'private'
    ensureVisibilityAllowed(visibility)
    return {
      ...item,
      id: localId,
      kind: item.kind ?? 'http_service',
      visibility,
      auth: item.auth ?? (visibility === 'signed' ? 'signed_link' : 'shadow_session'),
      ttlSeconds: Math.min(item.ttlSeconds ?? PREVIEW_TTL_SECONDS, MAX_DYNAMIC_TTL_SECONDS),
    }
  }

  async reconcileRuntimeExposures(
    input: RuntimeExposureReconcileInput,
    auth: { actor?: Actor; sidecar?: CloudExposureTokenPayload },
  ) {
    const deployment = auth.sidecar
      ? await this.requireDeploymentForSidecar(auth.sidecar, input)
      : auth.actor
        ? await this.requireDeploymentForActor(auth.actor, input.deploymentId)
        : null
    if (!deployment) throw httpError('Cloud exposure reconcile requires authentication', 401)

    const accepted = []
    const denied = []
    const keepLocalIds: string[] = []
    const now = new Date()

    for (const requested of input.exposures) {
      try {
        const item = this.validateRuntimeExposure(requested)
        const storageLocalId = runtimeStorageLocalId(item.id)
        keepLocalIds.push(storageLocalId)
        const host = this.hostFor({
          deployment,
          agentId: input.agentId,
          localId: item.id,
          appKey: item.appKey,
        })
        const baseUrl = toBaseUrl(host)
        const leaseExpiresAt = new Date(now.getTime() + item.ttlSeconds * 1000)
        const exposure = await this.deps.cloudExposureDao.upsertExposure({
          userId: deployment.userId,
          deploymentId: deployment.id,
          agentId: input.agentId,
          localId: storageLocalId,
          source: 'runtime',
          exposureKind: item.kind,
          releaseMode: 'preview',
          visibility: item.visibility,
          authMode: item.auth,
          status: 'active',
          host,
          publicBaseUrl: baseUrl,
          manifestUrl:
            item.kind === 'server_app' || item.manifestPath
              ? new URL(
                  item.manifestPath ?? '/.well-known/shadow-app.json',
                  `${baseUrl}/`,
                ).toString()
              : null,
          targetNamespace: deployment.namespace,
          targetWorkload: input.agentId,
          targetServiceName: `shadow-exp-${slugify(item.id)}`,
          targetPort: item.port,
          health: item.healthPath ? { path: item.healthPath, status: 'unknown' } : null,
          policy: item.policy ?? {},
          dynamicConfig: {
            desiredRevision: input.desiredRevision,
            displayName: item.displayName,
            localId: item.id,
            appKey: item.appKey,
            manifestPath: item.manifestPath,
          },
          lastHeartbeatAt: now,
          leaseExpiresAt,
        })
        await this.syncExposureNetworking(exposure)
        await this.deps.cloudExposureDao.createExposureEvent({
          exposureId: exposure.id,
          userId: deployment.userId,
          deploymentId: deployment.id,
          eventType: 'runtime_reconciled',
          actorKind: auth.sidecar ? 'agent' : auth.actor?.kind,
          actorUserId:
            auth.actor && auth.actor.kind !== 'system' ? auth.actor.userId : deployment.userId,
          status: 'accepted',
          metadata: { localId: item.id, visibility: item.visibility, port: item.port },
        })
        accepted.push(redactExposure(exposure))
      } catch (error) {
        denied.push({
          id: requested.id,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const closed = await this.deps.cloudExposureDao.closeMissingRuntimeExposures({
      deploymentId: deployment.id,
      agentId: input.agentId,
      keepLocalIds,
      reason: 'removed from desired exposure state',
    })

    return {
      ok: denied.length === 0,
      deploymentId: deployment.id,
      agentId: input.agentId,
      accepted,
      denied,
      closed: closed.map(redactExposure),
      status: {
        path: process.env.SHADOWOB_EXPOSURE_STATUS ?? '/run/shadow/exposure/status.json',
        generatedAt: now.toISOString(),
      },
    }
  }

  private async loadManifest(
    serverId: string,
    actor: Actor,
    input: CloudAppPublishInput,
  ): Promise<ServerAppManifest> {
    if (input.manifest) {
      const discovery = await this.deps.appIntegrationService.discover(serverId, actor, {
        manifest: input.manifest as ServerAppManifestInput,
      })
      return discovery.manifest as ServerAppManifest
    }
    if (!input.manifestUrl) throw httpError('Missing manifest or manifestUrl', 422)
    const discovery = await this.deps.appIntegrationService.discover(serverId, actor, {
      manifestUrl: input.manifestUrl,
    })
    return discovery.manifest as ServerAppManifest
  }

  private validatePublishInput(input: CloudAppPublishInput) {
    validatePort(input.port)
    ensureVisibilityAllowed(input.visibility ?? 'private')
    if (input.sourcePath) ensurePathAllowed(input.sourcePath, 'sourcePath')
    for (const [index, path] of (input.statePaths ?? []).entries()) {
      ensurePathAllowed(path, `statePaths[${index}]`)
    }
  }

  async publishApp(actor: Actor, input: CloudAppPublishInput) {
    this.validatePublishInput(input)
    const deployment = await this.requireDeploymentForActor(actor, input.deploymentId)
    const serverId = await this.resolveServerId(input.serverId)
    const visibility = input.visibility ?? 'private'
    const releaseMode = input.releaseMode ?? 'installed'
    const manifest = await this.loadManifest(serverId, actor, input)
    const appKey = input.appKey ?? manifest.appKey
    if (appKey !== manifest.appKey) throw httpError('appKey must match manifest.appKey', 422)
    if (!APP_KEY_RE.test(appKey)) throw httpError('Invalid appKey', 422)

    validatePermissions(manifest, input.defaultPermissions)
    for (const grant of input.buddyGrants ?? []) {
      validatePermissions(manifest, grant.permissions, { allowPlatformPermissions: true })
    }

    const stableHost = this.hostFor({
      deployment,
      agentId: input.agentId,
      localId: appKey,
      appKey,
      stable: true,
    })
    const stableBaseUrl = toBaseUrl(stableHost)
    const stableManifestUrl = serverAppManifestUrlForBase(stableBaseUrl)
    const rewrittenManifest = rewriteServerAppManifestToBase(manifest, stableBaseUrl)
    const statePolicy: CloudAppStatePolicy = {
      paths: input.statePaths ?? input.backupPolicy?.statePaths ?? [],
      backupOnPublish: input.backupOnPublish ?? true,
      restoreStrategy: 'in_place',
    }

    const existingAppInstance = await this.deps.cloudExposureDao.findAppInstance({
      appKey,
      deploymentId: deployment.id,
      serverId,
      userId: deployment.userId,
    })
    const appInstance = await this.deps.cloudExposureDao.upsertAppInstance({
      userId: deployment.userId,
      deploymentId: deployment.id,
      serverId,
      agentId: input.agentId,
      appKey,
      name: rewrittenManifest.name,
      stableHost,
      stableBaseUrl,
      manifestUrl: stableManifestUrl,
      status: existingAppInstance?.status ?? 'publishing',
      sourcePath: input.sourcePath ?? null,
      statePolicy,
      metadata: input.metadata ?? {},
    })

    const exposureHost = this.hostFor({
      deployment,
      agentId: input.agentId,
      localId: appKey,
      appKey,
    })
    const installation =
      input.install === false
        ? null
        : await this.deps.appIntegrationService.install(serverId, actor, {
            manifest: rewrittenManifest as ServerAppManifestInput,
            manifestUrl: stableManifestUrl,
          })

    if (installation && input.defaultPermissions) {
      await this.deps.appIntegrationService.updateAccessPolicy(serverId, appKey, actor, {
        defaultPermissions: input.defaultPermissions,
        defaultApprovalMode: input.defaultApprovalMode ?? 'none',
      })
    }

    const grants = []
    if (installation) {
      for (const grant of input.buddyGrants ?? []) {
        grants.push(
          await this.deps.appIntegrationService.grant(serverId, appKey, actor, {
            buddyAgentId: grant.buddyAgentId,
            permissions: grant.permissions,
            approvalMode: grant.approvalMode ?? 'none',
            mergePermissions: true,
          }),
        )
      }
    }

    const installedRow = installation
      ? await this.deps.appIntegrationDao.findByServerAndKey(serverId, appKey)
      : null
    const codeSha = sha256({
      manifest: rewrittenManifest,
      sourcePath: input.sourcePath ?? null,
      statePaths: statePolicy.paths,
    })
    const release = await this.deps.cloudExposureDao.createAppRelease({
      appInstanceId: appInstance.id,
      exposureId: null,
      serverAppIntegrationId: installedRow?.id ?? null,
      version: rewrittenManifest.version ?? codeSha.slice(0, 12),
      codeSha,
      releaseMode,
      status: 'pending',
      manifest: rewrittenManifest,
      manifestUrl: stableManifestUrl,
      sourcePath: input.sourcePath ?? null,
      metadata: input.metadata ?? {},
      activatedAt: null,
    })

    const exposure = await this.deps.cloudExposureDao.upsertExposure({
      userId: deployment.userId,
      deploymentId: deployment.id,
      serverId,
      appInstanceId: appInstance.id,
      appReleaseId: release.id,
      agentId: input.agentId,
      localId: appStorageLocalId(appKey),
      source: 'publish',
      exposureKind: 'server_app',
      releaseMode,
      visibility,
      authMode: 'server_app',
      status: 'active',
      host: exposureHost,
      stableHost,
      publicBaseUrl: stableBaseUrl,
      manifestUrl: stableManifestUrl,
      targetNamespace: deployment.namespace,
      targetWorkload: input.agentId,
      targetServiceName: `shadow-exp-${slugify(appKey)}`,
      targetPort: input.port,
      health: { path: '/health', status: 'unknown' },
      policy: { bodyLimitBytes: 512 * 1024, allowIframe: true },
      dynamicConfig: { appKey, localId: appKey, originalManifestUrl: input.manifestUrl },
      lastHeartbeatAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + INSTALLED_LEASE_SECONDS * 1000),
    })
    await this.syncExposureNetworking(exposure)
    await this.deps.cloudExposureDao.updateExposureRelease({
      id: exposure.id,
      appInstanceId: appInstance.id,
      appReleaseId: release.id,
      status: 'active',
    })
    const activatedRelease = await this.deps.cloudExposureDao.activateRelease({
      releaseId: release.id,
      appInstanceId: appInstance.id,
      exposureId: exposure.id,
      serverAppIntegrationId: installedRow?.id ?? null,
    })

    const backupPolicy = await this.deps.cloudExposureDao.upsertBackupPolicy({
      userId: deployment.userId,
      appInstanceId: appInstance.id,
      status: 'active',
      driver: input.backupPolicy?.driver ?? 'metadata',
      config: {
        statePaths: statePolicy.paths,
        backupOnPublish: statePolicy.backupOnPublish,
        retain: input.backupPolicy?.retain ?? 10,
        schedule: input.backupPolicy?.schedule,
        driver: input.backupPolicy?.driver ?? 'metadata',
      },
    })
    const backupSet =
      statePolicy.backupOnPublish === false
        ? null
        : await this.createBackupSetForApp(appInstance, {
            actor,
            releaseId: release.id,
            trigger: 'publish',
            manifestSnapshot: rewrittenManifest,
            statePaths: statePolicy.paths,
          })

    await this.deps.cloudExposureDao.createExposureEvent({
      exposureId: exposure.id,
      userId: deployment.userId,
      deploymentId: deployment.id,
      eventType: 'app_published',
      actorKind: actor.kind,
      actorUserId: actor.kind === 'system' ? deployment.userId : actor.userId,
      actorAgentId: actor.kind === 'agent' && actor.agentId ? actor.agentId : null,
      status: 'succeeded',
      metadata: { appKey, releaseId: release.id, stableHost, installed: Boolean(installation) },
    })

    const current = await this.deps.cloudExposureDao.findAppInstance({
      appKey,
      deploymentId: deployment.id,
      serverId,
      userId: deployment.userId,
    })

    return {
      ok: true,
      appInstance: redactAppInstance(current ?? appInstance),
      release: activatedRelease ?? release,
      exposure: redactExposure(
        (await this.deps.cloudExposureDao.findExposureById(exposure.id)) ?? exposure,
      ),
      manifest: rewrittenManifest,
      installation,
      grants,
      backupPolicy,
      backupSet,
    }
  }

  private async requireAppInstance(
    actor: Actor,
    appKey: string,
    options: { deploymentId?: string; serverId?: string } = {},
  ) {
    const userId = actorManagedUserId(actor)
    const serverId = options.serverId ? await this.resolveServerId(options.serverId) : undefined
    const instance = await this.deps.cloudExposureDao.findAppInstance({
      appKey,
      deploymentId: options.deploymentId,
      serverId,
      userId,
    })
    if (!instance) throw httpError('Cloud app instance not found', 404)
    if (actor.kind !== 'system' && instance.userId !== actor.userId) {
      if (!(actor.kind === 'agent' && actor.ownerId === instance.userId)) {
        throw httpError('Actor cannot manage this cloud app', 403)
      }
    }
    return instance
  }

  async status(
    actor: Actor,
    appKey: string,
    options: { deploymentId?: string; serverId?: string } = {},
  ) {
    const instance = await this.requireAppInstance(actor, appKey, options)
    const [releases, backups, exposure] = await Promise.all([
      this.deps.cloudExposureDao.listReleases(instance.id, 20),
      this.deps.cloudExposureDao.listBackupSets(instance.id, 20),
      instance.currentExposureId
        ? this.deps.cloudExposureDao.findExposureById(instance.currentExposureId)
        : Promise.resolve(null),
    ])
    return {
      ok: true,
      appInstance: redactAppInstance(instance),
      exposure: exposure ? redactExposure(exposure) : null,
      releases,
      backups,
    }
  }

  private async createBackupSetForApp(
    appInstance: NonNullable<CloudAppInstanceRow>,
    input: {
      actor: Actor
      releaseId?: string | null
      trigger: string
      manifestSnapshot?: Record<string, unknown> | null
      statePaths?: string[]
      deploymentBackupId?: string
      metadata?: Record<string, unknown>
    },
  ) {
    let linkedDeploymentBackup: Awaited<ReturnType<CloudDeploymentBackupDao['findById']>> | null =
      null
    if (input.deploymentBackupId) {
      linkedDeploymentBackup = await this.deps.cloudDeploymentBackupDao.findById(
        input.deploymentBackupId,
        appInstance.userId,
      )
      if (
        !linkedDeploymentBackup ||
        linkedDeploymentBackup.deploymentId !== appInstance.deploymentId
      ) {
        throw httpError('Deployment backup not found for this app', 404)
      }
      if (linkedDeploymentBackup.status !== 'succeeded') {
        throw httpError(`Deployment backup is not ready: ${linkedDeploymentBackup.status}`, 422)
      }
    }

    const statePaths = input.statePaths ?? appInstance.statePolicy.paths ?? []
    const stateReady = statePaths.length === 0 || Boolean(linkedDeploymentBackup)
    const backupSet = await this.deps.cloudExposureDao.createBackupSet({
      userId: appInstance.userId,
      appInstanceId: appInstance.id,
      releaseId: input.releaseId ?? appInstance.currentReleaseId,
      trigger: input.trigger,
      status: stateReady ? 'succeeded' : 'pending',
      manifestSnapshot: input.manifestSnapshot ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        actorKind: input.actor.kind,
        stateQueued: !stateReady,
      },
    })

    await this.deps.cloudExposureDao.createBackupComponent({
      backupSetId: backupSet.id,
      componentKind: 'manifest',
      status: 'succeeded',
      checksum: sha256(input.manifestSnapshot ?? {}),
      metadata: { manifestUrl: appInstance.manifestUrl },
    })
    await this.deps.cloudExposureDao.createBackupComponent({
      backupSetId: backupSet.id,
      componentKind: 'release',
      status: (input.releaseId ?? appInstance.currentReleaseId) ? 'succeeded' : 'missing',
      refKind: 'cloud_app_release',
      refId: input.releaseId ?? appInstance.currentReleaseId,
      metadata: { appKey: appInstance.appKey },
    })
    if (statePaths.length > 0) {
      await this.deps.cloudExposureDao.createBackupComponent({
        backupSetId: backupSet.id,
        componentKind: 'state',
        status: linkedDeploymentBackup ? 'succeeded' : 'pending',
        refKind: linkedDeploymentBackup ? 'cloud_deployment_backup' : 'runtime_state_paths',
        refId: linkedDeploymentBackup?.id ?? null,
        objectKey: linkedDeploymentBackup?.objectKey ?? null,
        metadata: { paths: statePaths, driver: linkedDeploymentBackup?.driver ?? 'queued' },
      })
    }
    return {
      ...backupSet,
      components: await this.deps.cloudExposureDao.listBackupComponents(backupSet.id),
    }
  }

  async backup(
    actor: Actor,
    appKey: string,
    input: { deploymentId?: string; serverId?: string; deploymentBackupId?: string } = {},
  ) {
    const instance = await this.requireAppInstance(actor, appKey, input)
    const release = instance.currentReleaseId
      ? await this.deps.cloudExposureDao.findReleaseById(instance.currentReleaseId)
      : null
    const backupSet = await this.createBackupSetForApp(instance, {
      actor,
      releaseId: release?.id ?? null,
      trigger: 'manual',
      manifestSnapshot: release?.manifest ?? null,
      statePaths: instance.statePolicy.paths,
      deploymentBackupId: input.deploymentBackupId,
    })
    return { ok: true, backupSet }
  }

  async restore(
    actor: Actor,
    appKey: string,
    input: {
      backupSetId: string
      deploymentId?: string
      serverId?: string
      strategy?: 'in_place' | 'new_release'
      createSafetyBackup?: boolean
    },
  ) {
    const instance = await this.requireAppInstance(actor, appKey, input)
    const backupSet = await this.deps.cloudExposureDao.findBackupSet(input.backupSetId)
    if (!backupSet || backupSet.appInstanceId !== instance.id) {
      throw httpError('Backup set not found for this app', 404)
    }
    if (backupSet.status !== 'succeeded') {
      throw httpError(`Backup set is not restorable in status "${backupSet.status}"`, 422)
    }
    const components = await this.deps.cloudExposureDao.listBackupComponents(backupSet.id)
    const unavailable = components.find((component) => component.status !== 'succeeded')
    if (unavailable) {
      throw httpError(`Backup component "${unavailable.componentKind}" is not ready`, 422)
    }

    const safetyBackup =
      input.createSafetyBackup === false
        ? null
        : await this.createBackupSetForApp(instance, {
            actor,
            releaseId: instance.currentReleaseId,
            trigger: 'pre_restore',
            manifestSnapshot: null,
            statePaths: [],
          })

    const restoreJob = await this.deps.cloudExposureDao.createRestoreJob({
      userId: instance.userId,
      appInstanceId: instance.id,
      backupSetId: backupSet.id,
      safetyBackupSetId: safetyBackup?.id ?? null,
      strategy: input.strategy ?? 'in_place',
      status: 'running',
      phase: 'restoring-manifest',
      metadata: { actorKind: actor.kind },
    })

    if (backupSet.manifestSnapshot) {
      await this.deps.appIntegrationService.install(instance.serverId, actor, {
        manifest: backupSet.manifestSnapshot as ServerAppManifestInput,
        manifestUrl: instance.manifestUrl,
      })
    }

    const completed = await this.deps.cloudExposureDao.updateRestoreJobStatus(
      restoreJob.id,
      'succeeded',
      'completed',
    )
    return { ok: true, restoreJob: completed ?? restoreJob, safetyBackup, backupSet }
  }

  async unpublish(
    actor: Actor,
    appKey: string,
    input: { deploymentId?: string; serverId?: string; uninstall?: boolean } = {},
  ) {
    const instance = await this.requireAppInstance(actor, appKey, input)
    const exposure = instance.currentExposureId
      ? await this.deps.cloudExposureDao.closeExposure(instance.currentExposureId, 'unpublished')
      : null
    if (input.uninstall) {
      await this.deps.appIntegrationService.delete(instance.serverId, appKey, actor)
    }
    const updated = await this.deps.cloudExposureDao.updateAppInstancePointers({
      id: instance.id,
      status: 'unpublished',
    })
    return {
      ok: true,
      appInstance: redactAppInstance(updated ?? instance),
      exposure: exposure ? redactExposure(exposure) : null,
      uninstalled: Boolean(input.uninstall),
    }
  }

  async gatewayManifest(host: string) {
    const exposure = await this.deps.cloudExposureDao.findExposureByHost(host.toLowerCase())
    if (!exposure) throw httpError('Cloud exposure not found', 404)
    if (exposure.status !== 'active') throw httpError('Cloud exposure is not active', 410)
    let release = exposure.appReleaseId
      ? await this.deps.cloudExposureDao.findReleaseById(exposure.appReleaseId)
      : null
    if (!release && exposure.appInstanceId) {
      const instance = exposure.appInstanceId
        ? await this.deps.cloudExposureDao.findAppInstance({
            appKey: (exposure.dynamicConfig?.appKey as string) ?? exposure.localId,
            deploymentId: exposure.deploymentId,
          })
        : null
      release = instance?.currentReleaseId
        ? await this.deps.cloudExposureDao.findReleaseById(instance.currentReleaseId)
        : null
    }
    if (!release) throw httpError('Cloud app release is not ready', 503)
    return rewriteServerAppManifestToBase(
      release.manifest as ServerAppManifest,
      exposure.publicBaseUrl,
    )
  }
}
