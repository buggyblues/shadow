import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import JSZip from 'jszip'
import { parse as parseYaml } from 'yaml'

const MAX_ZIP_BYTES = 512 * 1024 * 1024
const MAX_EXPANDED_ZIP_BYTES = 1024 * 1024 * 1024
const MAX_JSON_BYTES = 1024 * 1024
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024
const MAX_RESOURCE_BYTES = 5 * 1024 * 1024
const MAX_RUNTIME_OUTPUT_BYTES = 16 * 1024 * 1024
const MAX_MCP_OUTPUT_BYTES = 16 * 1024 * 1024
const DEFAULT_RUNTIME_TIMEOUT_MS = 120_000
const MAX_RUNTIME_TIMEOUT_MS = 600_000
const DEFAULT_MCP_TIMEOUT_MS = 30_000
const MCP_PROTOCOL_VERSION = '2025-06-18'
const TASK_LEASE_MS = 30 * 60_000
const CONNECTED_CLIENT_WINDOW_MS = 6 * 60_000
const MAX_MCP_PAGE_SIZE = 200
const MAX_LIBRARY_SEARCH_FILES = 10_000
const DEFAULT_TASK_WAIT_MS = 30_000
const MAX_TASK_WAIT_MS = 60_000
const PAIRING_TTL_MS = 10 * 60_000

type JsonRecord = Record<string, unknown>

export interface LocalMcpServerDefinition {
  executable: string
  args?: string[]
}

export interface LocalBridgeOptions {
  root?: string
  token?: string
  localRuntimeEnabled?: boolean
  mcpServers?: Record<string, LocalMcpServerDefinition>
  allowedOrigins?: string[]
  onClientConnected?: (clientId: string) => void
}

export interface LocalBridgeCommunitySession {
  accessToken: string
  clear?: boolean
  endpoint: string
  refreshToken: string
}

export interface LocalBridgeCommunitySessionAuthorization {
  expiresAt: string
  taskId: string
}

export interface LocalBridgeInstance {
  instanceId: string
  startedAt: string
  server: Server
  root: string
  token: string
  localRuntimeEnabled: boolean
  authorizeCommunitySession: (
    session: LocalBridgeCommunitySession,
  ) => Promise<LocalBridgeCommunitySessionAuthorization>
  shutdown: () => Promise<void>
}

interface ManagedFilesManifest {
  version?: number
  files: string[]
  hashes: Record<string, string>
  syncedAt?: string
}

interface LibraryOverviewCache {
  syncedAt?: string
  overview?: JsonRecord
}

interface LibrarySyncHistoryEntry {
  completedAt: string
  error?: string
  files?: number
  id: string
  issues?: number
  removed?: number
  startedAt: string
  status: 'succeeded' | 'failed'
  unchanged?: number
  written?: number
}

interface PluginTaskCapability {
  id: string
  label?: LocalizedCapability
  description?: LocalizedCapability
  options: TaskOptionCapability[]
}

interface PluginCapability {
  capabilities: string[]
  id: string
  interfaces: PluginInterfaceCapability[]
  name?: string
  tasks: PluginTaskCapability[]
}

interface PluginInterfaceCapability {
  capability: string
  description?: LocalizedCapability
  id: string
  kind: 'automation-task'
  label?: LocalizedCapability
  source?: string
  taskId: string
}

interface LocalizedCapability {
  en: string
  zh: string
}

interface TaskOptionCapability {
  id: string
  type?: string
  label?: LocalizedCapability
  description?: LocalizedCapability
  choices?: Array<{ value: string; label?: LocalizedCapability }>
  defaultValue?: string | number | boolean
  required?: boolean
  allowUnlimited?: boolean
  min?: number
  max?: number
  step?: number
}

interface ClientCapabilities {
  buildRevision?: string
  protocolVersion: 2 | 3
  extensionVersion: string
  plugins: PluginCapability[]
  resources: Record<string, string[]>
}

interface ClientRecord {
  clientId: string
  capabilities: ClientCapabilities
  seenAt: string
}

interface ConnectedClient {
  buildRevision?: string
  clientId: string
  extensionVersion: string
  plugins: PluginCapability[]
  protocolVersion: 2 | 3
  resources: Record<string, string[]>
  seenAt: string
}

interface ClientCredential {
  clientId: string
  createdAt: string
  lastUsedAt?: string
  tokenHash: string
}

interface ClientPairing {
  clientId: string
  codeHash: string
  createdAt: string
  expiresAt: string
}

interface BridgeAuthentication {
  clientId?: string
  kind: 'admin' | 'client'
}

interface AvailablePluginTask extends PluginTaskCapability {
  clientIds: string[]
  pluginId: string
  pluginName?: string
}

interface ResourceOperation {
  resource: string
  action: string
  id?: string
  payload?: JsonRecord
  artifactId?: string
}

interface TaskLease {
  claimId: string
  runtimeInstanceId: string
  attempt: number
  fence: number
  revision: number
  expiresAt: string
}

type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

interface BridgeTask {
  id: string
  name?: string
  kind: 'plugin-task' | 'resource-operation'
  pluginId?: string
  taskId?: string
  options?: Record<string, string | number | boolean>
  operation?: ResourceOperation
  idempotencyKey?: string
  status: TaskStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  clientId?: string
  revision: number
  attempt: number
  fence: number
  leaseUntil?: string
  lease?: TaskLease
  result?: {
    ok: boolean
    taskId?: string
    itemCount?: number
    error?: string
    data?: unknown
  }
  resultDigest?: string
}

interface TaskState {
  version: 2
  tasks: Record<string, BridgeTask>
  order: string[]
}

interface LocalRuntime {
  id: 'javascript' | 'python'
  label: string
  available: boolean
  executable?: string
  version?: string
  error?: string
}

interface ChildProcessResult {
  stdout: string
  stderr: string
  exitCode: number
  signal?: NodeJS.Signals
  timedOut: boolean
  outputExceeded: boolean
}

interface LocalBridgeMcpContext {
  localRuntimeEnabled: boolean
  mcpServers: Map<string, LocalMcpServerDefinition>
}

let taskStateLock = Promise.resolve()
let librarySyncLock = Promise.resolve()
let authenticationStateLock = Promise.resolve()

export function resolveLocalBridgeRoot(input?: string): string {
  const configured =
    input?.trim() || process.env.SHADOWOB_LOCAL_BRIDGE_ROOT || process.env.CLIPPER_LIBRARY
  return resolve(expandHome(configured || '~/ClipperLibrary'))
}

export async function resolveLocalBridgeToken(root: string, explicit?: string): Promise<string> {
  const configured =
    explicit?.trim() || process.env.SHADOWOB_LOCAL_BRIDGE_TOKEN || process.env.CLIPPER_TOKEN
  if (configured) {
    await writePrivateToken(localBridgeTokenPath(root), configured)
    return configured
  }

  const tokenPath = localBridgeTokenPath(root)
  try {
    const stored = (await readFile(tokenPath, 'utf8')).trim()
    if (stored) return stored
  } catch {
    // The token is created below on first use.
  }

  const token = randomBytes(32).toString('base64url')
  await writePrivateToken(tokenPath, token)
  return token
}

export async function readLocalBridgeToken(root: string, explicit?: string): Promise<string> {
  const configured =
    explicit?.trim() || process.env.SHADOWOB_LOCAL_BRIDGE_TOKEN || process.env.CLIPPER_TOKEN
  if (configured) return configured
  const stored = (await readFile(localBridgeTokenPath(root), 'utf8')).trim()
  if (!stored) throw new Error('The Local Bridge token file is empty')
  return stored
}

export async function createLocalBridge(
  options: LocalBridgeOptions = {},
): Promise<LocalBridgeInstance> {
  const root = resolveLocalBridgeRoot(options.root)
  const metadataDir = join(root, '.clipper')
  await mkdir(metadataDir, { recursive: true })
  let activeToken = await resolveLocalBridgeToken(root, options.token)
  let pendingCommunitySession:
    | { expiresAt: string; session: LocalBridgeCommunitySession }
    | undefined
  const mcpServers = resolveLocalMcpServers(options.mcpServers)
  const observedClients = new Set<string>()
  const localRuntimeEnabled = options.localRuntimeEnabled === true
  const instanceId = randomUUID()
  const startedAt = new Date().toISOString()
  let shuttingDown: Promise<void> | undefined
  const authorizeCommunitySession = async (
    session: LocalBridgeCommunitySession,
  ): Promise<LocalBridgeCommunitySessionAuthorization> => {
    const normalized = normalizeCommunitySession(session)
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
    pendingCommunitySession = { expiresAt, session: normalized }
    try {
      const task = await enqueueDeclaredResourceOperation(metadataDir, {
        action: 'claim',
        resource: 'community-session',
      })
      return { expiresAt, taskId: task.id }
    } catch (error) {
      pendingCommunitySession = undefined
      throw error
    }
  }
  let server!: Server
  const shutdown = (): Promise<void> => {
    if (shuttingDown) return shuttingDown
    shuttingDown = new Promise((resolveClose, rejectClose) => {
      if (!server.listening) {
        resolveClose()
        return
      }
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    })
    return shuttingDown
  }
  server = createServer((request, response) => {
    handleRequest({
      allowedOrigins: options.allowedOrigins ?? [],
      authorizeCommunitySession,
      instanceId,
      localRuntimeEnabled,
      mcpServers,
      metadataDir,
      onClientHeartbeat: (clientId) => {
        if (observedClients.has(clientId)) return
        observedClients.add(clientId)
        queueMicrotask(() => options.onClientConnected?.(clientId))
      },
      request,
      requestShutdown: () => {
        setImmediate(() => void shutdown())
      },
      authenticate: (request) => authenticateBridgeRequest(metadataDir, request, activeToken),
      claimCommunitySession: () => {
        const pending = pendingCommunitySession
        pendingCommunitySession = undefined
        if (!pending || Date.parse(pending.expiresAt) <= Date.now()) {
          throw bridgeError('The community login authorization has expired', 410)
        }
        return pending.session
      },
      response,
      root,
      rotateToken: async () => {
        const nextToken = randomBytes(32).toString('base64url')
        await writePrivateToken(localBridgeTokenPath(root), nextToken)
        activeToken = nextToken
        return nextToken
      },
      startedAt,
    }).catch((error: unknown) => {
      const status = errorStatus(error)
      sendJson(response, status, {
        error: error instanceof Error ? error.message : 'Local Bridge error',
        ok: false,
      })
    })
  })
  return {
    authorizeCommunitySession,
    instanceId,
    localRuntimeEnabled,
    root,
    server,
    shutdown,
    startedAt,
    token: activeToken,
  }
}

async function handleRequest(context: {
  allowedOrigins: string[]
  authorizeCommunitySession: (
    session: LocalBridgeCommunitySession,
  ) => Promise<LocalBridgeCommunitySessionAuthorization>
  instanceId: string
  localRuntimeEnabled: boolean
  mcpServers: Map<string, LocalMcpServerDefinition>
  metadataDir: string
  onClientHeartbeat: (clientId: string) => void
  claimCommunitySession: () => LocalBridgeCommunitySession
  authenticate: (request: IncomingMessage) => Promise<BridgeAuthentication | undefined>
  request: IncomingMessage
  requestShutdown: () => void
  response: ServerResponse
  root: string
  rotateToken: () => Promise<string>
  startedAt: string
}): Promise<void> {
  const {
    allowedOrigins,
    authorizeCommunitySession,
    instanceId,
    localRuntimeEnabled,
    mcpServers,
    metadataDir,
    onClientHeartbeat,
    claimCommunitySession,
    authenticate,
    request,
    requestShutdown,
    response,
    root,
    rotateToken,
    startedAt,
  } = context
  applyCors(request, response, allowedOrigins)
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  const url = new URL(request.url || '/', 'http://127.0.0.1')
  if (url.pathname === '/v1/health') {
    sendJson(response, 200, {
      instanceId,
      localRuntimeEnabled,
      ok: true,
      protocolVersion: 3,
      service: 'shadow-local-bridge',
      startedAt,
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)),
    })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/pairings/claim') {
    const body = record(await readJson(request))
    const claimed = await withLock('authentication', () =>
      claimClientPairing(metadataDir, body.clientId, body.code),
    )
    sendJson(response, 200, { ...claimed, ok: true })
    return
  }

  const authentication = await authenticate(request)
  if (!authentication) {
    sendJson(response, 401, { error: 'Unauthorized', ok: false })
    return
  }
  if (authentication.kind === 'client') {
    assertClientRequestAllowed(request, url, authentication.clientId as string)
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/stop') {
    assertAdminAuthentication(authentication)
    sendJson(response, 202, { instanceId, ok: true, stopping: true })
    requestShutdown()
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/token/rotate') {
    assertAdminAuthentication(authentication)
    const token = await rotateToken()
    sendJson(response, 200, { ok: true, token })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/pairings') {
    assertAdminAuthentication(authentication)
    const body = record(await readJson(request))
    const pairing = await withLock('authentication', () =>
      createClientPairing(metadataDir, body.clientId),
    )
    sendJson(response, 201, { ok: true, pairing })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/admin/clients') {
    assertAdminAuthentication(authentication)
    sendJson(response, 200, { clients: await listClientCredentials(metadataDir), ok: true })
    return
  }

  const revokeClientMatch = url.pathname.match(/^\/v1\/admin\/clients\/([^/]+)\/credential$/)
  if (request.method === 'DELETE' && revokeClientMatch?.[1]) {
    assertAdminAuthentication(authentication)
    const clientId = safeIdentifier(decodeURIComponent(revokeClientMatch[1]), 'client ID')
    await withLock('authentication', () => revokeClientCredential(metadataDir, clientId))
    sendJson(response, 200, { clientId, ok: true, revoked: true })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/community/session/claim') {
    requestClientId(request)
    sendJson(response, 200, { ok: true, session: claimCommunitySession() })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/community/session/authorize') {
    assertAdminAuthentication(authentication)
    const authorization = await authorizeCommunitySession(
      record(await readJson(request)) as unknown as LocalBridgeCommunitySession,
    )
    sendJson(response, 201, { authorization, ok: true })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/library/sync') {
    const startedAt = new Date().toISOString()
    const buffer = await readBody(request, MAX_ZIP_BYTES)
    const result = await withLock('library', async () => {
      try {
        const synced = await syncZip(buffer, root, metadataDir)
        await appendLibrarySyncHistory(metadataDir, {
          completedAt: String(synced.completedAt),
          files: Number(synced.files),
          id: `sync_${randomUUID()}`,
          issues: Number(synced.issues),
          removed: Number(synced.removed),
          startedAt,
          status: 'succeeded',
          unchanged: Number(synced.unchanged),
          written: Number(synced.written),
        })
        return synced
      } catch (error) {
        await appendLibrarySyncHistory(metadataDir, {
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Library sync failed',
          id: `sync_${randomUUID()}`,
          startedAt,
          status: 'failed',
        }).catch(() => undefined)
        throw error
      }
    })
    sendJson(response, 200, { ...result, ok: true, root })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/artifacts') {
    assertAdminAuthentication(authentication)
    const artifact = await storeArtifact(metadataDir, request)
    sendJson(response, 201, { artifact, ok: true })
    return
  }

  const artifactMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)$/)
  if (request.method === 'GET' && artifactMatch?.[1]) {
    await sendArtifact(
      response,
      metadataDir,
      safeIdentifier(decodeURIComponent(artifactMatch[1]), 'artifact ID'),
    )
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/library/status') {
    const [overview, clients] = await Promise.all([
      buildLibraryOverview(root, metadataDir),
      connectedClientCapabilities(metadataDir),
    ])
    sendJson(response, 200, { ...overview, clients, ok: true, root })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/library/overview') {
    sendJson(response, 200, {
      ...toolStructuredContent(
        await callMcpTool('clipper_library_overview', {}, root, metadataDir),
      ),
      ok: true,
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/library/files') {
    sendJson(response, 200, {
      ...toolStructuredContent(
        await callMcpTool(
          'clipper_list_library_files',
          {
            cursor: url.searchParams.get('cursor') ?? undefined,
            limit: url.searchParams.get('limit') ?? undefined,
            pathPrefix: url.searchParams.get('pathPrefix') ?? undefined,
          },
          root,
          metadataDir,
        ),
      ),
      ok: true,
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/library/read') {
    sendJson(response, 200, {
      ...toolStructuredContent(
        await callMcpTool(
          'clipper_read_library_file',
          {
            endLine: url.searchParams.get('endLine') ?? undefined,
            path: url.searchParams.get('path') ?? undefined,
            startLine: url.searchParams.get('startLine') ?? undefined,
            uri: url.searchParams.get('uri') ?? undefined,
          },
          root,
          metadataDir,
        ),
      ),
      ok: true,
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/library/search') {
    sendJson(response, 200, {
      ...toolStructuredContent(
        await callMcpTool(
          'clipper_search_library',
          {
            cursor: url.searchParams.get('cursor') ?? undefined,
            limit: url.searchParams.get('limit') ?? undefined,
            pathPrefix: url.searchParams.get('pathPrefix') ?? undefined,
            query: url.searchParams.get('query') ?? undefined,
          },
          root,
          metadataDir,
        ),
      ),
      ok: true,
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/library/history') {
    const limit = integerInRange(url.searchParams.get('limit') ?? undefined, 1, 100, 20, 'limit')
    const history = await readLibrarySyncHistory(metadataDir)
    sendJson(response, 200, { history: history.slice(0, limit), ok: true })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/plugins') {
    const clients = await connectedClientCapabilities(metadataDir)
    sendJson(response, 200, { clients, connected: clients.length > 0, ok: true })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/plugin-tasks') {
    const clients = await connectedClientCapabilities(metadataDir)
    sendJson(response, 200, {
      connected: clients.length > 0,
      ok: true,
      tasks: availablePluginTasks(clients),
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/resources/capabilities') {
    const clients = await connectedClientCapabilities(metadataDir)
    sendJson(response, 200, {
      clients: clients.map(
        ({ buildRevision, clientId, extensionVersion, protocolVersion, resources, seenAt }) => ({
          ...(buildRevision ? { buildRevision } : {}),
          clientId,
          extensionVersion,
          protocolVersion,
          resources,
          seenAt,
        }),
      ),
      connected: clients.length > 0,
      ok: true,
    })
    return
  }

  const resourceMatch = url.pathname.match(/^\/v1\/resources\/([^/]+)\/([^/]+)$/)
  if (request.method === 'POST' && resourceMatch?.[1] && resourceMatch[2]) {
    const task = await enqueueDeclaredResourceOperation(metadataDir, {
      ...record(await readJson(request)),
      resource: decodeURIComponent(resourceMatch[1]),
      action: decodeURIComponent(resourceMatch[2]),
    })
    sendJson(response, 201, { ok: true, task })
    return
  }

  const pluginInterfaceMatch = url.pathname.match(
    /^\/v1\/plugins\/([^/]+)\/interfaces\/([^/]+)\/run$/,
  )
  if (request.method === 'POST' && pluginInterfaceMatch?.[1] && pluginInterfaceMatch[2]) {
    const task = await enqueueDeclaredInterface(metadataDir, {
      ...record(await readJson(request)),
      interfaceId: decodeURIComponent(pluginInterfaceMatch[2]),
      pluginId: decodeURIComponent(pluginInterfaceMatch[1]),
    })
    sendJson(response, 201, { ok: true, task })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/runtimes') {
    if (!localRuntimeEnabled) {
      sendJson(response, 404, { error: 'Local runtimes are disabled', ok: false })
      return
    }
    sendJson(response, 200, { ok: true, runtimes: await listLocalRuntimes() })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/runtimes/execute') {
    if (!localRuntimeEnabled) {
      sendJson(response, 404, { error: 'Local runtimes are disabled', ok: false })
      return
    }
    sendJson(response, 200, await executeLocalRuntime(await readJson(request)))
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/mcp-servers') {
    sendJson(response, 200, {
      ok: true,
      servers: [...mcpServers.keys()].sort().map((id) => ({ id })),
    })
    return
  }

  const localMcpMatch = url.pathname.match(/^\/v1\/mcp-servers\/([^/]+)\/request$/)
  if (request.method === 'POST' && localMcpMatch?.[1]) {
    const serverId = safeIdentifier(decodeURIComponent(localMcpMatch[1]), 'MCP server ID')
    const definition = mcpServers.get(serverId)
    if (!definition) {
      sendJson(response, 404, { error: 'Local MCP server is not configured', ok: false })
      return
    }
    const result = await invokeStdioMcp(definition, await readJson(request))
    sendJson(response, 200, { ok: true, result, serverId })
    return
  }

  if (url.pathname === '/mcp') {
    assertAdminAuthentication(authentication)
    await handleMcpRequest(request, response, root, metadataDir, {
      localRuntimeEnabled,
      mcpServers,
    })
    return
  }

  const clientMatch = url.pathname.match(/^\/v1\/clients\/([^/]+)\/heartbeat$/)
  if (request.method === 'POST' && clientMatch?.[1]) {
    const clientId = safeIdentifier(decodeURIComponent(clientMatch[1]), 'client ID')
    assertAuthenticatedClient(authentication, clientId)
    const body = record(await readJson(request))
    const result = await withLock('tasks', () => heartbeat(metadataDir, root, clientId, body))
    onClientHeartbeat(clientId)
    sendJson(response, 200, result)
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/tasks') {
    assertAdminAuthentication(authentication)
    const body = await readJson(request)
    const task = await enqueueDeclaredTask(metadataDir, body)
    sendJson(response, 201, { ok: true, task })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/tasks') {
    assertAdminAuthentication(authentication)
    const state = await readTaskState(metadataDir)
    sendJson(response, 200, {
      ok: true,
      tasks: state.order.map((id) => state.tasks[id]).filter(Boolean),
    })
    return
  }

  const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)$/)
  if (request.method === 'GET' && taskMatch?.[1]) {
    assertAdminAuthentication(authentication)
    const taskId = safeIdentifier(decodeURIComponent(taskMatch[1]), 'task ID')
    const state = await readTaskState(metadataDir)
    const task = state.tasks[taskId]
    if (!task) {
      sendJson(response, 404, { error: 'Task not found', ok: false })
      return
    }
    sendJson(response, 200, { ok: true, task })
    return
  }

  const cancelMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/cancel$/)
  if (request.method === 'POST' && cancelMatch?.[1]) {
    assertAdminAuthentication(authentication)
    const task = await withLock('tasks', () =>
      cancelTask(
        metadataDir,
        safeIdentifier(decodeURIComponent(cancelMatch[1] as string), 'task ID'),
      ),
    )
    sendJson(response, 200, { ok: true, task })
    return
  }

  const renewMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/lease\/renew$/)
  if (request.method === 'POST' && renewMatch?.[1]) {
    const body = record(await readJson(request))
    const task = await withLock('tasks', () =>
      renewTaskLease(
        metadataDir,
        safeIdentifier(decodeURIComponent(renewMatch[1] as string), 'task ID'),
        requestClientId(request),
        normalizeLease(body.lease),
      ),
    )
    sendJson(response, 200, { lease: task.lease, ok: true, task })
    return
  }

  const resultMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/result$/)
  if (request.method === 'POST' && resultMatch?.[1]) {
    const body = record(await readJson(request))
    const task = await withLock('tasks', () =>
      finishTask(
        metadataDir,
        safeIdentifier(decodeURIComponent(resultMatch[1] as string), 'task ID'),
        requestClientId(request),
        normalizeLease(body.lease),
        record(body.result ?? body),
      ),
    )
    sendJson(response, 200, { ok: true, task })
    return
  }

  sendJson(response, 404, { error: 'Not found', ok: false })
}

async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  metadataDir: string,
  context: LocalBridgeMcpContext,
): Promise<void> {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, {
      error: { code: -32600, message: 'MCP uses POST requests' },
      id: null,
      jsonrpc: '2.0',
    })
    return
  }

  let message: JsonRecord
  try {
    message = record(await readJson(request))
  } catch (error) {
    sendJson(response, 400, {
      error: { code: -32700, message: error instanceof Error ? error.message : 'Parse error' },
      id: null,
      jsonrpc: '2.0',
    })
    return
  }
  const id = message.id ?? null
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    sendJson(response, 400, {
      error: { code: -32600, message: 'Invalid JSON-RPC request' },
      id,
      jsonrpc: '2.0',
    })
    return
  }
  if (message.id === undefined) {
    response.writeHead(202)
    response.end()
    return
  }

  try {
    const result = await dispatchMcpMethod(
      message.method,
      record(message.params),
      root,
      metadataDir,
      context,
    )
    sendJson(response, 200, { id, jsonrpc: '2.0', result })
  } catch (error) {
    const code = Number(record(error).mcpCode)
    sendJson(response, 200, {
      error: {
        code: Number.isInteger(code) ? code : -32603,
        message: error instanceof Error ? error.message : 'MCP request failed',
      },
      id,
      jsonrpc: '2.0',
    })
  }
}

async function dispatchMcpMethod(
  method: string,
  params: JsonRecord,
  root: string,
  metadataDir: string,
  context: LocalBridgeMcpContext,
): Promise<unknown> {
  if (method === 'initialize') {
    return {
      capabilities: {
        prompts: { listChanged: false },
        resources: { listChanged: false },
        tools: { listChanged: false },
      },
      instructions:
        'Start with clipper_library_overview, search before reading whole files, and invoke only plugin tasks or resource operations declared by a currently connected Shadow Clipper client.',
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: 'shadow-local-bridge', version: '1.1.0' },
    }
  }
  if (method === 'ping') return {}
  if (method === 'resources/list') {
    return listMcpResources(metadataDir, params.cursor, params.limit)
  }
  if (method === 'resources/templates/list') {
    return {
      resourceTemplates: [
        {
          mimeType: 'text/markdown',
          name: 'Shadow Clipper library file',
          uriTemplate: 'clipper://library/{path}',
        },
      ],
    }
  }
  if (method === 'resources/read') {
    return readMcpResource(String(params.uri ?? ''), root, metadataDir)
  }
  if (method === 'prompts/list') {
    return {
      prompts: [
        {
          description: 'Inspect the library overview, then find the strongest sources for a topic.',
          name: 'explore-library',
          arguments: [
            { description: 'Topic or question to investigate', name: 'topic', required: true },
          ],
        },
        {
          description: 'Inspect available browser tasks before sending one to Shadow Clipper.',
          name: 'run-browser-task',
          arguments: [{ description: 'Desired collection outcome', name: 'goal', required: true }],
        },
      ],
    }
  }
  if (method === 'prompts/get')
    return getMcpPrompt(String(params.name ?? ''), record(params.arguments))
  if (method === 'tools/list') return { tools: mcpTools(context.localRuntimeEnabled) }
  if (method === 'tools/call') {
    try {
      return await callMcpTool(
        String(params.name ?? ''),
        record(params.arguments),
        root,
        metadataDir,
        context,
      )
    } catch (error) {
      return mcpToolError(error instanceof Error ? error.message : 'Tool call failed')
    }
  }
  throw mcpError(-32601, `Unsupported MCP method: ${method}`)
}

async function listMcpResources(
  metadataDir: string,
  cursorValue: unknown,
  limitValue: unknown,
): Promise<JsonRecord> {
  const files = (await managedLibraryFiles(metadataDir)).filter((path) =>
    /\.(?:md|markdown|txt|json)$/i.test(path),
  )
  const offset = decodeCursor(cursorValue)
  const limit = integerInRange(limitValue, 1, MAX_MCP_PAGE_SIZE, 100, 'limit')
  const catalog = [
    {
      description: 'Library counts, platforms, dates, tags, and reading state',
      mimeType: 'application/json',
      name: 'Shadow Clipper library overview',
      uri: 'clipper://library/overview',
    },
    ...files.map((path) => ({
      description: path,
      mimeType: resourceMimeType(path),
      name: posix.basename(path),
      uri: libraryResourceUri(path),
    })),
  ]
  if (offset > catalog.length) throw mcpError(-32602, 'Resource cursor is out of range')
  const resources = catalog.slice(offset, offset + limit)
  const nextOffset = offset + limit
  return {
    ...(nextOffset < catalog.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
    resources,
  }
}

async function readMcpResource(
  uri: string,
  root: string,
  metadataDir: string,
): Promise<JsonRecord> {
  if (uri === 'clipper://library/overview') {
    return {
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(await buildLibraryOverview(root, metadataDir), null, 2),
          uri,
        },
      ],
    }
  }
  if (uri === 'clipper://library' || uri === 'clipper://library/') {
    const files = await managedLibraryFiles(metadataDir)
    return {
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify({ files }, null, 2),
          uri: 'clipper://library',
        },
      ],
    }
  }
  const relativePath = resourcePathFromUri(uri)
  const files = await managedLibraryFiles(metadataDir)
  if (!files.includes(relativePath) || !/\.(?:md|markdown|txt|json)$/i.test(relativePath)) {
    throw new Error('Resource is not a managed text file')
  }
  const target = resolve(root, ...relativePath.split('/'))
  assertWithinRoot(root, target)
  await assertNoSymbolicLinks(root, target)
  const info = await stat(target)
  if (!info.isFile() || info.size > MAX_RESOURCE_BYTES) {
    throw new Error('Resource is missing or too large')
  }
  return {
    contents: [
      {
        mimeType: resourceMimeType(relativePath),
        text: await readFile(target, 'utf8'),
        uri: libraryResourceUri(relativePath),
      },
    ],
  }
}

function mcpTools(localRuntimeEnabled: boolean): JsonRecord[] {
  return [
    {
      annotations: { readOnlyHint: true },
      description:
        'Summarize the synced library: file types, source platforms, date range, tags, favorites, reading state, and latest sync.',
      inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
      name: 'clipper_library_overview',
    },
    {
      annotations: { readOnlyHint: true },
      description: 'List managed library files with stable pagination and an optional path prefix.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          cursor: { type: 'string' },
          limit: { maximum: MAX_MCP_PAGE_SIZE, minimum: 1, type: 'integer' },
          pathPrefix: { type: 'string' },
        },
        type: 'object',
      },
      name: 'clipper_list_library_files',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'Read a managed Markdown, text, or JSON file by path or clipper:// URI, optionally selecting a line range.',
      inputSchema: {
        additionalProperties: false,
        oneOf: [{ required: ['path'] }, { required: ['uri'] }],
        properties: {
          endLine: { minimum: 1, type: 'integer' },
          path: { type: 'string' },
          startLine: { minimum: 1, type: 'integer' },
          uri: { type: 'string' },
        },
        type: 'object',
      },
      name: 'clipper_read_library_file',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'List connected Shadow Clipper plugins with capability tags, callable interfaces, tasks, and task options.',
      inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
      name: 'clipper_list_plugins',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'List resource-management operations exposed by connected Shadow Clipper clients, including custom plugins, settings, plugin agents, pets, themes, wallpapers, and skills.',
      inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
      name: 'clipper_list_resource_capabilities',
    },
    {
      annotations: { destructiveHint: true },
      description:
        'Run a declared Shadow Clipper resource operation. A local path may be staged for plugin manifests, Codex Pet packages, wallpapers, or Skill packages.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          action: { type: 'string' },
          confirm: { description: 'Required for remove operations', type: 'boolean' },
          id: { type: 'string' },
          idempotencyKey: { maxLength: 240, type: 'string' },
          mimeType: { type: 'string' },
          path: { type: 'string' },
          payload: { additionalProperties: true, type: 'object' },
          resource: { type: 'string' },
          timeoutMs: { maximum: MAX_TASK_WAIT_MS, minimum: 0, type: 'integer' },
          wait: { type: 'boolean' },
        },
        required: ['resource', 'action'],
        type: 'object',
      },
      name: 'clipper_manage_resource',
    },
    {
      description:
        'Send a bounded task provided by a connected Shadow Clipper plugin. Arbitrary JavaScript is not accepted.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          idempotencyKey: { maxLength: 240, type: 'string' },
          name: { type: 'string' },
          options: {
            additionalProperties: { type: ['string', 'number', 'boolean'] },
            type: 'object',
          },
          pluginId: { type: 'string' },
          taskId: { type: 'string' },
        },
        required: ['pluginId', 'taskId'],
        type: 'object',
      },
      name: 'clipper_enqueue_task',
    },
    {
      description:
        'Invoke a callable interface declared by a connected Shadow Clipper plugin. The interface resolves to a validated plugin task.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          idempotencyKey: { maxLength: 240, type: 'string' },
          interfaceId: { type: 'string' },
          name: { type: 'string' },
          options: {
            additionalProperties: { type: ['string', 'number', 'boolean'] },
            type: 'object',
          },
          pluginId: { type: 'string' },
        },
        required: ['pluginId', 'interfaceId'],
        type: 'object',
      },
      name: 'clipper_invoke_plugin',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'List currently available plugin task definitions together with queued, running, and completed task runs.',
      inputSchema: {
        additionalProperties: false,
        properties: { limit: { maximum: 200, minimum: 1, type: 'integer' } },
        type: 'object',
      },
      name: 'clipper_list_tasks',
    },
    {
      description:
        'Ask the connected Shadow Clipper browser to export the latest library snapshot to Local Bridge. Waits for completion by default.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          idempotencyKey: { maxLength: 240, type: 'string' },
          timeoutMs: { maximum: MAX_TASK_WAIT_MS, minimum: 0, type: 'integer' },
          wait: { type: 'boolean' },
        },
        type: 'object',
      },
      name: 'clipper_sync_library',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'List recent Local Bridge library sync attempts, including completion time and incremental written, unchanged, and removed counts.',
      inputSchema: {
        additionalProperties: false,
        properties: { limit: { maximum: 100, minimum: 1, type: 'integer' } },
        type: 'object',
      },
      name: 'clipper_list_library_syncs',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'List automations saved in the connected Shadow Clipper browser, including plugin, task, schedule, state, options, and latest run information.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          timeoutMs: { maximum: MAX_TASK_WAIT_MS, minimum: 0, type: 'integer' },
          wait: { type: 'boolean' },
        },
        type: 'object',
      },
      name: 'clipper_list_automations',
    },
    {
      description: 'Run one saved Shadow Clipper automation by its automation ID.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          automationId: { type: 'string' },
          idempotencyKey: { maxLength: 240, type: 'string' },
          timeoutMs: { maximum: MAX_TASK_WAIT_MS, minimum: 0, type: 'integer' },
          wait: { type: 'boolean' },
        },
        required: ['automationId'],
        type: 'object',
      },
      name: 'clipper_run_automation',
    },
    {
      annotations: { readOnlyHint: true },
      description: 'Read the current state and result of one Shadow Clipper task.',
      inputSchema: {
        additionalProperties: false,
        properties: { taskId: { type: 'string' } },
        required: ['taskId'],
        type: 'object',
      },
      name: 'clipper_get_task',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'Wait briefly for one Shadow Clipper task to finish and return its latest state. The maximum wait is 60 seconds.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          taskId: { type: 'string' },
          timeoutMs: { maximum: MAX_TASK_WAIT_MS, minimum: 0, type: 'integer' },
        },
        required: ['taskId'],
        type: 'object',
      },
      name: 'clipper_wait_for_task',
    },
    {
      annotations: { destructiveHint: true, idempotentHint: true },
      description: 'Cancel a queued Shadow Clipper task before a browser extension claims it.',
      inputSchema: {
        additionalProperties: false,
        properties: { taskId: { type: 'string' } },
        required: ['taskId'],
        type: 'object',
      },
      name: 'clipper_cancel_task',
    },
    {
      annotations: { readOnlyHint: true },
      description:
        'Search managed Markdown files with relevance ranking, stable pagination, path filtering, and contextual excerpts.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          cursor: { type: 'string' },
          limit: { maximum: 50, minimum: 1, type: 'integer' },
          pathPrefix: { type: 'string' },
          query: { minLength: 1, type: 'string' },
        },
        required: ['query'],
        type: 'object',
      },
      name: 'clipper_search_library',
    },
    {
      annotations: { readOnlyHint: true },
      description: 'List local MCP servers configured behind this Local Bridge.',
      inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
      name: 'clipper_list_mcp_servers',
    },
    {
      description:
        'Send one supported tools, resources, prompts, or ping request to a configured local MCP server.',
      inputSchema: {
        additionalProperties: false,
        properties: {
          method: { type: 'string' },
          params: { additionalProperties: true, type: 'object' },
          serverId: { type: 'string' },
        },
        required: ['serverId', 'method'],
        type: 'object',
      },
      name: 'clipper_call_mcp_server',
    },
    ...(localRuntimeEnabled
      ? [
          {
            annotations: { readOnlyHint: true },
            description: 'List explicitly enabled local JavaScript and Python runtimes.',
            inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
            name: 'clipper_list_runtimes',
          },
          {
            description:
              'Run explicitly supplied JavaScript or Python in an isolated temporary directory. This capability is available only when Local Bridge starts with --enable-runtime.',
            inputSchema: {
              additionalProperties: false,
              properties: {
                code: { minLength: 1, type: 'string' },
                runtime: { enum: ['javascript', 'python'], type: 'string' },
                stdin: { type: 'string' },
                timeoutMs: {
                  maximum: MAX_RUNTIME_TIMEOUT_MS,
                  minimum: 1_000,
                  type: 'integer',
                },
              },
              required: ['runtime', 'code'],
              type: 'object',
            },
            name: 'clipper_execute_runtime',
          },
        ]
      : []),
  ]
}

async function callMcpTool(
  name: string,
  args: JsonRecord,
  root: string,
  metadataDir: string,
  context: LocalBridgeMcpContext = { localRuntimeEnabled: false, mcpServers: new Map() },
): Promise<JsonRecord> {
  if (name === 'clipper_library_overview') {
    return mcpTextResult(await buildLibraryOverview(root, metadataDir))
  }
  if (name === 'clipper_list_library_files') {
    const cursor = decodeCursor(args.cursor)
    const limit = integerInRange(args.limit, 1, MAX_MCP_PAGE_SIZE, 100, 'limit')
    const pathPrefix = normalizePathPrefix(args.pathPrefix)
    const allFiles = (await managedLibraryFiles(metadataDir)).filter(
      (path) => !pathPrefix || path.startsWith(pathPrefix),
    )
    if (cursor > allFiles.length) throw mcpError(-32602, 'File cursor is out of range')
    const files = allFiles.slice(cursor, cursor + limit).map((path) => ({
      mimeType: resourceMimeType(path),
      path,
      uri: libraryResourceUri(path),
    }))
    const nextOffset = cursor + limit
    return mcpTextResult({
      files,
      ...(nextOffset < allFiles.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
      total: allFiles.length,
    })
  }
  if (name === 'clipper_read_library_file') {
    const path = libraryPathFromToolArgs(args)
    const files = await managedLibraryFiles(metadataDir)
    if (!files.includes(path) || !/\.(?:md|markdown|txt|json)$/i.test(path)) {
      throw mcpError(-32602, 'File is not a managed text resource')
    }
    const target = resolve(root, ...path.split('/'))
    assertWithinRoot(root, target)
    await assertNoSymbolicLinks(root, target)
    const info = await stat(target).catch(() => undefined)
    if (!info?.isFile() || info.size > MAX_RESOURCE_BYTES) {
      throw mcpError(-32602, 'File is missing or too large')
    }
    const lines = (await readFile(target, 'utf8')).split(/\r?\n/)
    const startLine = integerInRange(args.startLine, 1, Math.max(1, lines.length), 1, 'startLine')
    const requestedEndLine = integerInRange(
      args.endLine,
      1,
      10_000_000,
      Math.min(lines.length, startLine + 399),
      'endLine',
    )
    if (requestedEndLine < startLine) {
      throw mcpError(-32602, 'endLine must not be before startLine')
    }
    const endLine = Math.min(requestedEndLine, lines.length)
    return mcpTextResult({
      endLine,
      path,
      startLine,
      text: lines.slice(startLine - 1, endLine).join('\n'),
      totalLines: lines.length,
      truncated: endLine < lines.length,
      uri: libraryResourceUri(path),
    })
  }
  if (name === 'clipper_list_plugins') {
    const clients = await connectedClientCapabilities(metadataDir)
    return mcpTextResult({ clients, connected: clients.length > 0 })
  }
  if (name === 'clipper_list_resource_capabilities') {
    const clients = await connectedClientCapabilities(metadataDir)
    return mcpTextResult({
      clients: clients.map(
        ({ buildRevision, clientId, extensionVersion, protocolVersion, resources, seenAt }) => ({
          ...(buildRevision ? { buildRevision } : {}),
          clientId,
          extensionVersion,
          protocolVersion,
          resources,
          seenAt,
        }),
      ),
      connected: clients.length > 0,
    })
  }
  if (name === 'clipper_manage_resource') {
    let artifactId: string | undefined
    if (typeof args.path === 'string' && args.path.trim()) {
      const artifact = await stageArtifactFromPath(metadataDir, args.path, args.mimeType)
      artifactId = artifact.id
    }
    const payload = { ...record(args.payload), ...(args.confirm === true ? { confirm: true } : {}) }
    const task = await enqueueDeclaredResourceOperation(metadataDir, {
      action: args.action,
      ...(artifactId ? { artifactId } : {}),
      id: args.id,
      idempotencyKey: args.idempotencyKey,
      payload,
      resource: args.resource,
    })
    const waited =
      args.wait === true
        ? await waitForTask(
            metadataDir,
            task.id,
            integerInRange(args.timeoutMs, 0, MAX_TASK_WAIT_MS, DEFAULT_TASK_WAIT_MS, 'timeoutMs'),
          )
        : task
    return mcpTextResult({ task: waited })
  }
  if (name === 'clipper_enqueue_task') {
    return mcpTextResult({ task: await enqueueDeclaredTask(metadataDir, args) })
  }
  if (name === 'clipper_invoke_plugin') {
    return mcpTextResult({ task: await enqueueDeclaredInterface(metadataDir, args) })
  }
  if (name === 'clipper_list_tasks') {
    const state = await readTaskState(metadataDir)
    const limit = integerInRange(args.limit, 1, 200, 50, 'limit')
    const clients = await connectedClientCapabilities(metadataDir)
    return mcpTextResult({
      availableTasks: availablePluginTasks(clients),
      connected: clients.length > 0,
      runs: state.order
        .slice(0, limit)
        .map((id) => state.tasks[id])
        .filter(Boolean),
    })
  }
  if (name === 'clipper_sync_library') {
    return mcpTextResult({
      task: await enqueueAndMaybeWaitResourceOperation(metadataDir, {
        action: 'sync',
        idempotencyKey: args.idempotencyKey,
        resource: 'library',
        timeoutMs: args.timeoutMs,
        wait: args.wait,
      }),
    })
  }
  if (name === 'clipper_list_library_syncs') {
    const limit = integerInRange(args.limit, 1, 100, 20, 'limit')
    const history = await readLibrarySyncHistory(metadataDir)
    return mcpTextResult({ history: history.slice(0, limit) })
  }
  if (name === 'clipper_list_automations') {
    return mcpTextResult({
      task: await enqueueAndMaybeWaitResourceOperation(metadataDir, {
        action: 'list',
        resource: 'automations',
        timeoutMs: args.timeoutMs,
        wait: args.wait,
      }),
    })
  }
  if (name === 'clipper_run_automation') {
    return mcpTextResult({
      task: await enqueueAndMaybeWaitResourceOperation(metadataDir, {
        action: 'run',
        id: args.automationId,
        idempotencyKey: args.idempotencyKey,
        resource: 'automations',
        timeoutMs: args.timeoutMs,
        wait: args.wait,
      }),
    })
  }
  if (name === 'clipper_get_task') {
    return mcpTextResult({
      task: await readTask(metadataDir, safeIdentifier(args.taskId, 'task ID')),
    })
  }
  if (name === 'clipper_wait_for_task') {
    const taskId = safeIdentifier(args.taskId, 'task ID')
    const timeoutMs = integerInRange(
      args.timeoutMs,
      0,
      MAX_TASK_WAIT_MS,
      DEFAULT_TASK_WAIT_MS,
      'timeoutMs',
    )
    return mcpTextResult({ task: await waitForTask(metadataDir, taskId, timeoutMs) })
  }
  if (name === 'clipper_cancel_task') {
    return mcpTextResult({
      task: await withLock('tasks', () =>
        cancelTask(metadataDir, safeIdentifier(args.taskId, 'task ID')),
      ),
    })
  }
  if (name === 'clipper_search_library') {
    const query = String(args.query ?? '').trim()
    if (!query || query.length > 300) {
      throw mcpError(-32602, 'Search query must contain 1 to 300 characters')
    }
    const limit = integerInRange(args.limit, 1, 50, 20, 'limit')
    const cursor = decodeCursor(args.cursor)
    const pathPrefix = normalizePathPrefix(args.pathPrefix)
    const search = await searchManagedLibrary(query, root, metadataDir, pathPrefix)
    if (cursor > search.length) throw mcpError(-32602, 'Search cursor is out of range')
    const nextOffset = cursor + limit
    return mcpTextResult({
      matches: search.slice(cursor, nextOffset),
      ...(nextOffset < search.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
      query,
      total: search.length,
    })
  }
  if (name === 'clipper_list_mcp_servers') {
    return mcpTextResult({
      servers: [...context.mcpServers.keys()].sort().map((id) => ({ id })),
    })
  }
  if (name === 'clipper_call_mcp_server') {
    const serverId = safeIdentifier(args.serverId, 'MCP server ID')
    const definition = context.mcpServers.get(serverId)
    if (!definition) throw new Error('Local MCP server is not configured')
    return mcpTextResult({
      result: await invokeStdioMcp(definition, {
        method: args.method,
        params: record(args.params),
      }),
      serverId,
    })
  }
  if (name === 'clipper_list_runtimes') {
    if (!context.localRuntimeEnabled) throw new Error('Local runtimes are disabled')
    return mcpTextResult({ runtimes: await listLocalRuntimes() })
  }
  if (name === 'clipper_execute_runtime') {
    if (!context.localRuntimeEnabled) throw new Error('Local runtimes are disabled')
    return mcpTextResult(await executeLocalRuntime(args))
  }
  throw mcpError(-32602, `Unknown MCP tool: ${name}`)
}

async function searchManagedLibrary(
  query: string,
  root: string,
  metadataDir: string,
  pathPrefix = '',
): Promise<JsonRecord[]> {
  const terms = tokenizeSearchQuery(query)
  const matches: JsonRecord[] = []
  const files = (await managedLibraryFiles(metadataDir))
    .filter(
      (path) => /\.(?:md|markdown)$/i.test(path) && (!pathPrefix || path.startsWith(pathPrefix)),
    )
    .slice(0, MAX_LIBRARY_SEARCH_FILES)
  for (const relativePath of files) {
    const target = resolve(root, ...relativePath.split('/'))
    assertWithinRoot(root, target)
    await assertNoSymbolicLinks(root, target)
    const info = await stat(target).catch(() => undefined)
    if (!info?.isFile() || info.size > MAX_RESOURCE_BYTES) continue
    const content = await readFile(target, 'utf8')
    const searchable = `${relativePath}\n${content}`.toLocaleLowerCase()
    const indexes = terms.map((term) => searchable.indexOf(term))
    if (indexes.some((index) => index < 0)) continue
    const contentLower = content.toLocaleLowerCase()
    const contentIndexes = terms.map((term) => contentLower.indexOf(term))
    const firstContentIndex = contentIndexes.filter((index) => index >= 0).sort((a, b) => a - b)[0]
    const index = firstContentIndex ?? 0
    const from = Math.max(0, index - 180)
    const to = Math.min(content.length, index + Math.max(query.length, 40) + 260)
    const metadata = parseMarkdownMetadata(content)
    const pathLower = relativePath.toLocaleLowerCase()
    const title = markdownTitle(content, metadata, relativePath)
    const titleLower = title.toLocaleLowerCase()
    const occurrenceScore = terms.reduce(
      (score, term) => score + Math.min(10, countOccurrences(searchable, term)),
      0,
    )
    const score =
      occurrenceScore +
      terms.filter((term) => titleLower.includes(term)).length * 40 +
      terms.filter((term) => pathLower.includes(term)).length * 20
    matches.push({
      excerpt: content.slice(from, to).replace(/\s+/g, ' ').trim(),
      path: relativePath,
      score,
      title,
      uri: libraryResourceUri(relativePath),
    })
  }
  return matches.sort(
    (left, right) =>
      Number(right.score) - Number(left.score) ||
      String(left.path).localeCompare(String(right.path)),
  )
}

async function connectedClientCapabilities(metadataDir: string): Promise<ConnectedClient[]> {
  const clients = await readJsonFile<Record<string, ClientRecord>>(
    join(metadataDir, 'clients.json'),
    {},
  )
  return Object.values(clients)
    .filter(
      (client) =>
        client?.capabilities &&
        Date.now() - Date.parse(client.seenAt || '') < CONNECTED_CLIENT_WINDOW_MS,
    )
    .map((client) => ({
      ...(client.capabilities.buildRevision
        ? { buildRevision: client.capabilities.buildRevision }
        : {}),
      clientId: client.clientId,
      extensionVersion: client.capabilities.extensionVersion,
      plugins: client.capabilities.plugins,
      protocolVersion: client.capabilities.protocolVersion,
      resources: client.capabilities.resources ?? {},
      seenAt: client.seenAt,
    }))
}

function availablePluginTasks(clients: ConnectedClient[]): AvailablePluginTask[] {
  const tasks = new Map<string, AvailablePluginTask>()
  for (const client of clients) {
    for (const plugin of client.plugins) {
      for (const task of plugin.tasks) {
        const key = `${plugin.id}:${task.id}`
        const existing = tasks.get(key)
        if (existing) {
          if (!existing.clientIds.includes(client.clientId))
            existing.clientIds.push(client.clientId)
          continue
        }
        tasks.set(key, {
          ...task,
          clientIds: [client.clientId],
          pluginId: plugin.id,
          ...(plugin.name ? { pluginName: plugin.name } : {}),
        })
      }
    }
  }
  return [...tasks.values()].sort(
    (left, right) => left.pluginId.localeCompare(right.pluginId) || left.id.localeCompare(right.id),
  )
}

async function touchClientSeenAt(metadataDir: string, clientId: string): Promise<void> {
  const clientsPath = join(metadataDir, 'clients.json')
  const clients = await readJsonFile<Record<string, ClientRecord>>(clientsPath, {})
  const client = clients[clientId]
  if (!client) return
  client.seenAt = new Date().toISOString()
  await atomicJson(clientsPath, clients)
}

async function syncZip(buffer: Buffer, root: string, metadataDir: string): Promise<JsonRecord> {
  const zip = await JSZip.loadAsync(buffer)
  const manifestPath = join(metadataDir, 'managed-files.json')
  const previous = await readJsonFile<ManagedFilesManifest>(manifestPath, {
    files: [],
    hashes: {},
  })
  const nextFiles: string[] = []
  const nextHashes: Record<string, string> = {}
  const seenPaths = new Set<string>()
  const stagedFiles: Array<{ path: string; stagedPath: string }> = []
  const stagingRoot = await mkdtemp(join(metadataDir, 'sync-'))
  let expandedBytes = 0
  let unchanged = 0
  let written = 0
  try {
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      const relativePath = safeArchivePath(entry.unsafeOriginalName || entry.name)
      if (relativePath.startsWith('.clipper/')) continue
      if (seenPaths.has(relativePath)) throw bridgeError(`Duplicate ZIP path: ${relativePath}`, 400)
      seenPaths.add(relativePath)
      const target = resolve(root, ...relativePath.split('/'))
      assertWithinRoot(root, target)
      await assertNoSymbolicLinks(root, target)
      const expectedBytes = Number(
        (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ??
          0,
      )
      if (
        expectedBytes > MAX_EXPANDED_ZIP_BYTES ||
        expandedBytes + expectedBytes > MAX_EXPANDED_ZIP_BYTES
      ) {
        throw bridgeError('Expanded ZIP is too large', 413)
      }
      const content = await entry.async('nodebuffer')
      expandedBytes += content.byteLength
      if (expandedBytes > MAX_EXPANDED_ZIP_BYTES) {
        throw bridgeError('Expanded ZIP is too large', 413)
      }
      const hash = createHash('sha256').update(content).digest('hex')
      const stagedPath = resolve(stagingRoot, ...relativePath.split('/'))
      assertWithinRoot(stagingRoot, stagedPath)
      await mkdir(dirname(stagedPath), { recursive: true })
      await writeFile(stagedPath, content)
      nextFiles.push(relativePath)
      nextHashes[relativePath] = hash
      stagedFiles.push({ path: relativePath, stagedPath })
    }

    for (const staged of stagedFiles) {
      const target = resolve(root, ...staged.path.split('/'))
      assertWithinRoot(root, target)
      await assertNoSymbolicLinks(root, target)
      if (
        previous.hashes?.[staged.path] === nextHashes[staged.path] &&
        (await fileExists(target))
      ) {
        unchanged += 1
        continue
      }
      await mkdir(dirname(target), { recursive: true })
      await assertNoSymbolicLinks(root, target)
      await rename(staged.stagedPath, target)
      written += 1
    }

    const nextFileSet = new Set(nextFiles)
    let removed = 0
    for (const previousPath of previous.files ?? []) {
      const relativePath = safeArchivePath(previousPath)
      if (nextFileSet.has(relativePath)) continue
      const target = resolve(root, ...relativePath.split('/'))
      assertWithinRoot(root, target)
      await assertNoSymbolicLinks(root, target)
      if (await fileExists(target)) {
        await rm(target, { force: true })
        removed += 1
      }
    }

    const completedAt = new Date().toISOString()
    await atomicJson(manifestPath, {
      files: nextFiles.sort(),
      hashes: nextHashes,
      syncedAt: completedAt,
      version: 1,
    })
    return {
      completedAt,
      files: nextFiles.length,
      issues: 0,
      removed,
      unchanged,
      written,
    }
  } finally {
    await rm(stagingRoot, { force: true, recursive: true })
  }
}

async function heartbeat(
  metadataDir: string,
  root: string,
  clientId: string,
  body: JsonRecord,
): Promise<JsonRecord> {
  const capabilities = normalizeCapabilities(body.capabilities)
  const clientsPath = join(metadataDir, 'clients.json')
  const clients = await readJsonFile<Record<string, ClientRecord>>(clientsPath, {})
  clients[clientId] = { capabilities, clientId, seenAt: new Date().toISOString() }
  await atomicJson(clientsPath, clients)

  const state = await readTaskState(metadataDir)
  releaseExpiredLeases(state)
  let task: BridgeTask | undefined
  if (body.claim !== false) {
    task = state.order
      .map((id) => state.tasks[id])
      .find(
        (candidate): candidate is BridgeTask =>
          candidate?.status === 'queued' && supportsTask(capabilities, candidate),
      )
    if (task) {
      const now = new Date()
      task.attempt = Math.max(0, task.attempt) + 1
      task.fence = Math.max(0, task.fence) + 1
      task.revision = Math.max(1, task.revision)
      task.status = 'running'
      task.clientId = clientId
      task.startedAt = now.toISOString()
      task.leaseUntil = new Date(now.getTime() + TASK_LEASE_MS).toISOString()
      task.lease = {
        attempt: task.attempt,
        claimId: `claim_${randomUUID()}`,
        expiresAt: task.leaseUntil,
        fence: task.fence,
        revision: task.revision,
        runtimeInstanceId: clientId,
      }
    }
  }
  await writeTaskState(metadataDir, state)
  return {
    ok: true,
    queuedTasks: state.order.filter((id) => state.tasks[id]?.status === 'queued').length,
    root,
    task,
  }
}

async function enqueueTask(metadataDir: string, input: unknown): Promise<BridgeTask> {
  const body = record(input)
  const pluginId = safeIdentifier(body.pluginId, 'plugin ID')
  const taskId = safeIdentifier(body.taskId, 'task ID')
  const options = normalizeOptions(body.options)
  const state = await readTaskState(metadataDir)
  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey)
  if (idempotencyKey) {
    const existing = state.order
      .map((id) => state.tasks[id])
      .find((candidate) => candidate?.idempotencyKey === idempotencyKey)
    if (existing) return existing
  }
  const task: BridgeTask = {
    attempt: 0,
    createdAt: new Date().toISOString(),
    fence: 0,
    id: `agent_${randomUUID()}`,
    kind: 'plugin-task',
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(typeof body.name === 'string' && body.name.trim()
      ? { name: body.name.trim().slice(0, 120) }
      : {}),
    options,
    pluginId,
    revision: 1,
    status: 'queued',
    taskId,
  }
  state.tasks[task.id] = task
  state.order.unshift(task.id)
  await writeTaskState(metadataDir, state)
  return task
}

async function enqueueResourceOperation(metadataDir: string, input: unknown): Promise<BridgeTask> {
  const body = record(input)
  const operation = normalizeResourceOperation(body)
  const state = await readTaskState(metadataDir)
  const idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey)
  if (idempotencyKey) {
    const existing = state.order
      .map((id) => state.tasks[id])
      .find((candidate) => candidate?.idempotencyKey === idempotencyKey)
    if (existing) return existing
  }
  const task: BridgeTask = {
    attempt: 0,
    createdAt: new Date().toISOString(),
    fence: 0,
    id: `agent_${randomUUID()}`,
    kind: 'resource-operation',
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(typeof body.name === 'string' && body.name.trim()
      ? { name: body.name.trim().slice(0, 120) }
      : {}),
    operation,
    revision: 1,
    status: 'queued',
  }
  state.tasks[task.id] = task
  state.order.unshift(task.id)
  await writeTaskState(metadataDir, state)
  return task
}

async function enqueueDeclaredResourceOperation(
  metadataDir: string,
  input: unknown,
): Promise<BridgeTask> {
  const operation = normalizeResourceOperation(input)
  if (operation.action === 'remove' && operation.payload?.confirm !== true) {
    throw bridgeError('Remove operations require explicit confirmation', 400)
  }
  const clients = await connectedClientCapabilities(metadataDir)
  if (!clients.some((client) => client.resources[operation.resource]?.includes(operation.action))) {
    throw bridgeError('No connected Shadow Clipper client provides this resource operation', 400)
  }
  if (operation.artifactId) await assertArtifactExists(metadataDir, operation.artifactId)
  return withLock('tasks', () =>
    enqueueResourceOperation(metadataDir, { ...record(input), ...operation }),
  )
}

async function enqueueAndMaybeWaitResourceOperation(
  metadataDir: string,
  input: JsonRecord,
): Promise<BridgeTask> {
  const task = await enqueueDeclaredResourceOperation(metadataDir, input)
  if (input.wait === false) return task
  return waitForTask(
    metadataDir,
    task.id,
    integerInRange(input.timeoutMs, 0, MAX_TASK_WAIT_MS, DEFAULT_TASK_WAIT_MS, 'timeoutMs'),
  )
}

async function enqueueDeclaredTask(metadataDir: string, input: unknown): Promise<BridgeTask> {
  const body = record(input)
  const pluginId = safeIdentifier(body.pluginId, 'plugin ID')
  const taskId = safeIdentifier(body.taskId, 'task ID')
  const clients = await connectedClientCapabilities(metadataDir)
  const capability = clients
    .flatMap((client) => client.plugins)
    .find((plugin) => plugin.id === pluginId)
    ?.tasks.find((task) => task.id === taskId)
  if (!capability) {
    throw bridgeError('No connected Shadow Clipper plugin provides this task', 400)
  }
  const options = validateTaskOptions(body.options, capability)
  return withLock('tasks', () => enqueueTask(metadataDir, { ...body, options, pluginId, taskId }))
}

async function enqueueDeclaredInterface(metadataDir: string, input: unknown): Promise<BridgeTask> {
  const body = record(input)
  const pluginId = safeIdentifier(body.pluginId, 'plugin ID')
  const interfaceId = safeIdentifier(body.interfaceId, 'plugin interface ID')
  const clients = await connectedClientCapabilities(metadataDir)
  const agentInterface = clients
    .flatMap((client) => client.plugins)
    .filter((plugin) => plugin.id === pluginId)
    .flatMap((plugin) => plugin.interfaces)
    .find((item) => item.id === interfaceId)
  if (!agentInterface) {
    throw bridgeError('No connected Shadow Clipper plugin provides this interface', 400)
  }
  return enqueueDeclaredTask(metadataDir, {
    ...body,
    pluginId,
    taskId: agentInterface.taskId,
  })
}

async function renewTaskLease(
  metadataDir: string,
  taskId: string,
  clientId: string,
  lease: TaskLease,
): Promise<BridgeTask> {
  const state = await readTaskState(metadataDir)
  const task = state.tasks[taskId]
  if (!task) throw bridgeError('Task not found', 404)
  assertTaskLease(task, clientId, lease)
  if (task.status !== 'running') throw bridgeError('Task does not have an active lease', 409)
  const expiresAt = new Date(Date.now() + TASK_LEASE_MS).toISOString()
  task.leaseUntil = expiresAt
  task.lease = { ...task.lease, expiresAt } as TaskLease
  await writeTaskState(metadataDir, state)
  await touchClientSeenAt(metadataDir, clientId)
  return task
}

async function finishTask(
  metadataDir: string,
  taskId: string,
  clientId: string,
  lease: TaskLease,
  result: JsonRecord,
): Promise<BridgeTask> {
  const state = await readTaskState(metadataDir)
  const task = state.tasks[taskId]
  if (!task) throw bridgeError('Task not found', 404)
  assertTaskLease(task, clientId, lease)
  const resultDigest = createHash('sha256').update(JSON.stringify(result)).digest('hex')
  if (task.status === 'succeeded' || task.status === 'failed') {
    if (task.resultDigest === resultDigest) return task
    throw bridgeError('Task already finished with a different result', 409)
  }
  if (task.status !== 'running') throw bridgeError('Task does not have an active lease', 409)
  task.status = result.ok ? 'succeeded' : 'failed'
  task.finishedAt = new Date().toISOString()
  task.result = {
    ...(typeof result.error === 'string' ? { error: result.error.slice(0, 2000) } : {}),
    ...(Number.isFinite(result.itemCount) ? { itemCount: Number(result.itemCount) } : {}),
    ok: Boolean(result.ok),
    ...(result.data !== undefined ? { data: normalizeResultData(result.data) } : {}),
    ...(typeof result.taskId === 'string' ? { taskId: result.taskId } : {}),
  }
  task.resultDigest = resultDigest
  await writeTaskState(metadataDir, state)
  if (task.operation?.artifactId) await removeArtifact(metadataDir, task.operation.artifactId)
  await touchClientSeenAt(metadataDir, clientId)
  return task
}

async function readTask(metadataDir: string, taskId: string): Promise<BridgeTask> {
  const state = await readTaskState(metadataDir)
  const task = state.tasks[taskId]
  if (!task) throw bridgeError('Task not found', 404)
  return task
}

async function waitForTask(
  metadataDir: string,
  taskId: string,
  timeoutMs: number,
): Promise<BridgeTask> {
  const deadline = Date.now() + timeoutMs
  let task = await readTask(metadataDir, taskId)
  while (task.status === 'queued' || task.status === 'running') {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(250, remaining)))
    task = await readTask(metadataDir, taskId)
  }
  return task
}

async function cancelTask(metadataDir: string, taskId: string): Promise<BridgeTask> {
  const state = await readTaskState(metadataDir)
  const task = state.tasks[taskId]
  if (!task) throw bridgeError('Task not found', 404)
  if (task.status === 'cancelled') return task
  if (task.status !== 'queued') {
    throw bridgeError('Only queued tasks can be cancelled', 409)
  }
  task.status = 'cancelled'
  task.finishedAt = new Date().toISOString()
  task.result = { error: 'Cancelled before the browser started it', ok: false }
  task.resultDigest = createHash('sha256').update(JSON.stringify(task.result)).digest('hex')
  await writeTaskState(metadataDir, state)
  if (task.operation?.artifactId) await removeArtifact(metadataDir, task.operation.artifactId)
  return task
}

function assertTaskLease(task: BridgeTask, clientId: string, lease: TaskLease): void {
  const active = task.lease
  if (!active) throw bridgeError('Task lease is required', 409)
  if (
    task.clientId !== clientId ||
    active.claimId !== lease.claimId ||
    active.runtimeInstanceId !== clientId ||
    active.runtimeInstanceId !== lease.runtimeInstanceId ||
    active.attempt !== lease.attempt ||
    active.fence !== lease.fence ||
    active.revision !== lease.revision
  ) {
    throw bridgeError('Task lease is stale or belongs to another runtime', 409)
  }
  if (Date.parse(active.expiresAt) <= Date.now()) {
    throw bridgeError('Task lease has expired', 409)
  }
}

function normalizeCapabilities(value: unknown): ClientCapabilities {
  const input = record(value)
  const plugins = Array.isArray(input.plugins)
    ? input.plugins.slice(0, 256).map((pluginValue) => {
        const plugin = record(pluginValue)
        return {
          capabilities: stringList(plugin.capabilities).map((value) => value.slice(0, 120)),
          id: safeIdentifier(plugin.id, 'plugin ID'),
          interfaces: Array.isArray(plugin.interfaces)
            ? plugin.interfaces.slice(0, 128).map(normalizePluginInterfaceCapability)
            : [],
          ...(typeof plugin.name === 'string' && plugin.name.trim()
            ? { name: plugin.name.trim().slice(0, 120) }
            : {}),
          tasks: Array.isArray(plugin.tasks)
            ? plugin.tasks.slice(0, 128).map(normalizeTaskCapability)
            : [],
        }
      })
    : []
  return {
    ...(typeof input.buildRevision === 'string' && /^[0-9a-f]{40}$/i.test(input.buildRevision)
      ? { buildRevision: input.buildRevision.toLowerCase() }
      : {}),
    extensionVersion: String(input.extensionVersion ?? ''),
    plugins,
    protocolVersion: input.protocolVersion === 3 ? 3 : 2,
    resources: normalizeResourceCapabilities(input.resources),
  }
}

function normalizePluginInterfaceCapability(value: unknown): PluginInterfaceCapability {
  const agentInterface = record(value)
  if (agentInterface.kind !== 'automation-task') {
    throw new Error('Invalid plugin interface kind')
  }
  const description = normalizeLocalizedCapability(agentInterface.description)
  const label = normalizeLocalizedCapability(agentInterface.label)
  return {
    capability: safeIdentifier(agentInterface.capability, 'plugin interface capability'),
    ...(description ? { description } : {}),
    id: safeIdentifier(agentInterface.id, 'plugin interface ID'),
    kind: 'automation-task',
    ...(label ? { label } : {}),
    ...(typeof agentInterface.source === 'string' && agentInterface.source.trim()
      ? { source: agentInterface.source.trim().slice(0, 120) }
      : {}),
    taskId: safeIdentifier(agentInterface.taskId, 'task ID'),
  }
}

function normalizeTaskCapability(value: unknown): PluginTaskCapability {
  const task = record(value)
  const label = normalizeLocalizedCapability(task.label)
  const description = normalizeLocalizedCapability(task.description)
  return {
    ...(description ? { description } : {}),
    id: safeIdentifier(task.id, 'task ID'),
    ...(label ? { label } : {}),
    options: Array.isArray(task.options)
      ? task.options.slice(0, 64).map(normalizeTaskOptionCapability)
      : [],
  }
}

function normalizeTaskOptionCapability(value: unknown): TaskOptionCapability {
  const option = record(value)
  const label = normalizeLocalizedCapability(option.label)
  const description = normalizeLocalizedCapability(option.description)
  const choices = Array.isArray(option.choices)
    ? option.choices.slice(0, 128).flatMap((choiceValue) => {
        const choice = record(choiceValue)
        if (typeof choice.value !== 'string') return []
        const choiceLabel = normalizeLocalizedCapability(choice.label)
        return [
          {
            ...(choiceLabel ? { label: choiceLabel } : {}),
            value: choice.value.slice(0, 500),
          },
        ]
      })
    : []
  const defaultValue = option.defaultValue
  const hasDefault =
    typeof defaultValue === 'string' ||
    typeof defaultValue === 'number' ||
    typeof defaultValue === 'boolean'
  return {
    ...(option.allowUnlimited === true ? { allowUnlimited: true } : {}),
    ...(choices.length ? { choices } : {}),
    ...(hasDefault
      ? {
          defaultValue:
            typeof defaultValue === 'string' ? defaultValue.slice(0, 1_000) : defaultValue,
        }
      : {}),
    ...(description ? { description } : {}),
    id: safeIdentifier(option.id, 'task option ID'),
    ...(label ? { label } : {}),
    ...(Number.isFinite(option.max) ? { max: Number(option.max) } : {}),
    ...(Number.isFinite(option.min) ? { min: Number(option.min) } : {}),
    ...(option.required === true ? { required: true } : {}),
    ...(Number.isFinite(option.step) ? { step: Number(option.step) } : {}),
    ...(typeof option.type === 'string' ? { type: option.type.slice(0, 40) } : {}),
  }
}

function normalizeLocalizedCapability(value: unknown): LocalizedCapability | undefined {
  const localized = record(value)
  if (typeof localized.en !== 'string' || typeof localized.zh !== 'string') return undefined
  return {
    en: localized.en.slice(0, 500),
    zh: localized.zh.slice(0, 500),
  }
}

function normalizeOptions(value: unknown): Record<string, string | number | boolean> {
  const input = record(value)
  const entries = Object.entries(input)
    .slice(0, 128)
    .filter(
      ([key, item]) =>
        /^[a-zA-Z0-9_-]{1,80}$/.test(key) &&
        (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'),
    )
    .map(([key, item]) => [
      key,
      typeof item === 'string' ? item.slice(0, 1000) : (item as number | boolean),
    ])
  return Object.fromEntries(entries)
}

function validateTaskOptions(
  value: unknown,
  capability: PluginTaskCapability,
): Record<string, string | number | boolean> {
  const input = record(value)
  const definitions = new Map(capability.options.map((option) => [option.id, option]))
  for (const key of Object.keys(input)) {
    if (!definitions.has(key)) throw new Error(`Unknown task option: ${key}`)
  }
  const result: Record<string, string | number | boolean> = {}
  for (const option of capability.options) {
    const supplied = Object.hasOwn(input, option.id)
    const raw = supplied ? input[option.id] : option.defaultValue
    if (raw === undefined) {
      if (option.required) throw new Error(`Missing required task option: ${option.id}`)
      continue
    }
    if (option.type === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw new Error(`Task option ${option.id} must be a number`)
      }
      const unlimited = option.allowUnlimited && raw === 0
      if (!unlimited && option.min !== undefined && raw < option.min) {
        throw new Error(`Task option ${option.id} must be at least ${option.min}`)
      }
      if (!unlimited && option.max !== undefined && raw > option.max) {
        throw new Error(`Task option ${option.id} must be at most ${option.max}`)
      }
      result[option.id] = raw
      continue
    }
    if (option.type === 'boolean') {
      if (typeof raw !== 'boolean')
        throw new Error(`Task option ${option.id} must be true or false`)
      result[option.id] = raw
      continue
    }
    if (typeof raw !== 'string') throw new Error(`Task option ${option.id} must be text`)
    const normalized = raw.slice(0, 1_000)
    if (option.choices?.length && !option.choices.some((choice) => choice.value === normalized)) {
      throw new Error(`Task option ${option.id} must use one of its declared choices`)
    }
    if (option.required && !normalized.trim()) {
      throw new Error(`Task option ${option.id} cannot be empty`)
    }
    result[option.id] = normalized
  }
  return result
}

function normalizeLease(value: unknown): TaskLease {
  const lease = record(value)
  if (
    typeof lease.claimId !== 'string' ||
    typeof lease.runtimeInstanceId !== 'string' ||
    !Number.isInteger(lease.attempt) ||
    !Number.isInteger(lease.fence) ||
    !Number.isInteger(lease.revision) ||
    typeof lease.expiresAt !== 'string'
  ) {
    throw bridgeError('Task lease is required', 409)
  }
  return {
    attempt: Number(lease.attempt),
    claimId: lease.claimId,
    expiresAt: lease.expiresAt,
    fence: Number(lease.fence),
    revision: Number(lease.revision),
    runtimeInstanceId: lease.runtimeInstanceId,
  }
}

function supportsTask(capabilities: ClientCapabilities, task: BridgeTask): boolean {
  if (task.kind === 'resource-operation') {
    const operation = task.operation
    return Boolean(
      operation && capabilities.resources[operation.resource]?.includes(operation.action),
    )
  }
  return capabilities.plugins.some(
    (plugin) =>
      plugin.id === task.pluginId && plugin.tasks.some((candidate) => candidate.id === task.taskId),
  )
}

function normalizeResourceCapabilities(value: unknown): Record<string, string[]> {
  const input = record(value)
  return Object.fromEntries(
    Object.entries(input)
      .slice(0, 64)
      .flatMap(([resource, actions]) => {
        if (!/^[a-z][a-z0-9-]{0,79}$/.test(resource) || !Array.isArray(actions)) return []
        return [
          [
            resource,
            actions
              .slice(0, 64)
              .flatMap((action) =>
                typeof action === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(action) ? [action] : [],
              ),
          ],
        ]
      }),
  )
}

function normalizeResourceOperation(value: unknown): ResourceOperation {
  const input = record(value)
  const resource = safeIdentifier(input.resource, 'resource name')
  const action = safeIdentifier(input.action, 'resource action')
  const id =
    typeof input.id === 'string' && input.id.trim() ? input.id.trim().slice(0, 200) : undefined
  const artifactId =
    typeof input.artifactId === 'string' && input.artifactId.trim()
      ? safeIdentifier(input.artifactId, 'artifact ID')
      : undefined
  const payload = input.payload === undefined ? undefined : record(input.payload)
  return {
    resource,
    action,
    ...(id ? { id } : {}),
    ...(payload ? { payload } : {}),
    ...(artifactId ? { artifactId } : {}),
  }
}

function normalizeResultData(value: unknown): unknown {
  const serialized = JSON.stringify(value)
  if (serialized === undefined || Buffer.byteLength(serialized) > MAX_JSON_BYTES / 2)
    throw bridgeError('Task result data is too large', 413)
  return JSON.parse(serialized) as unknown
}

function releaseExpiredLeases(state: TaskState): void {
  for (const task of Object.values(state.tasks)) {
    if (task.status === 'running' && Date.parse(task.leaseUntil || '') < Date.now()) {
      task.status = 'queued'
      delete task.clientId
      delete task.startedAt
      delete task.leaseUntil
      delete task.lease
    }
  }
}

async function readTaskState(metadataDir: string): Promise<TaskState> {
  return readJsonFile<TaskState>(join(metadataDir, 'agent-tasks.json'), {
    order: [],
    tasks: {},
    version: 2,
  })
}

async function writeTaskState(metadataDir: string, state: TaskState): Promise<void> {
  await atomicJson(join(metadataDir, 'agent-tasks.json'), state)
}

async function readLibrarySyncHistory(metadataDir: string): Promise<LibrarySyncHistoryEntry[]> {
  const history = await readJsonFile<unknown[]>(join(metadataDir, 'library-sync-history.json'), [])
  return history.filter((value): value is LibrarySyncHistoryEntry => {
    const entry = record(value)
    return (
      typeof entry.id === 'string' &&
      typeof entry.startedAt === 'string' &&
      typeof entry.completedAt === 'string' &&
      (entry.status === 'succeeded' || entry.status === 'failed')
    )
  })
}

async function appendLibrarySyncHistory(
  metadataDir: string,
  entry: LibrarySyncHistoryEntry,
): Promise<void> {
  const history = await readLibrarySyncHistory(metadataDir)
  await atomicJson(
    join(metadataDir, 'library-sync-history.json'),
    [entry, ...history].slice(0, 100),
  )
}

async function managedLibraryFiles(metadataDir: string): Promise<string[]> {
  const manifest = await readJsonFile<ManagedFilesManifest>(
    join(metadataDir, 'managed-files.json'),
    { files: [], hashes: {} },
  )
  return Array.from(new Set((manifest.files ?? []).map(String).filter(Boolean))).sort()
}

async function buildLibraryOverview(root: string, metadataDir: string): Promise<JsonRecord> {
  const manifest = await readJsonFile<ManagedFilesManifest>(
    join(metadataDir, 'managed-files.json'),
    { files: [], hashes: {} },
  )
  const overviewCachePath = join(metadataDir, 'library-overview.json')
  const cached = await readJsonFile<LibraryOverviewCache>(overviewCachePath, {})
  if (manifest.syncedAt && cached.syncedAt === manifest.syncedAt && cached.overview) {
    return cached.overview
  }
  const files = await managedLibraryFiles(metadataDir)
  const extensionCounts = new Map<string, number>()
  const platformCounts = new Map<string, number>()
  const domainCounts = new Map<string, number>()
  const tagCounts = new Map<string, number>()
  const collectionCounts = new Map<string, number>()
  const topFolderCounts = new Map<string, number>()
  const dates: string[] = []
  let totalBytes = 0
  let markdownFiles = 0
  let textFiles = 0
  let sourcePages = 0
  let estimatedItems = 0
  let favorites = 0
  let readLater = 0
  let readItems = 0
  let aiSummaries = 0
  let locations = 0

  for (const relativePath of files) {
    const extension = posix.extname(relativePath).toLocaleLowerCase() || '(none)'
    incrementCount(extensionCounts, extension)
    incrementCount(
      topFolderCounts,
      relativePath.includes('/') ? relativePath.split('/')[0] || '(root)' : '(root)',
    )
    const target = resolve(root, ...relativePath.split('/'))
    assertWithinRoot(root, target)
    await assertNoSymbolicLinks(root, target)
    const info = await stat(target).catch(() => undefined)
    if (!info?.isFile()) continue
    totalBytes += info.size
    if (/\.(?:md|markdown)$/i.test(relativePath)) markdownFiles += 1
    if (/\.(?:md|markdown|txt|json)$/i.test(relativePath)) textFiles += 1
    if (!/\.(?:md|markdown)$/i.test(relativePath) || info.size > MAX_RESOURCE_BYTES) continue

    const content = await readFile(target, 'utf8')
    const metadata = parseMarkdownMetadata(content)
    if (typeof metadata.platform === 'string' && metadata.platform.trim()) {
      sourcePages += 1
      incrementCount(platformCounts, metadata.platform.trim())
      if (typeof metadata.domain === 'string' && metadata.domain.trim()) {
        incrementCount(domainCounts, metadata.domain.trim())
      }
      if (
        typeof metadata.updated_at === 'string' &&
        Number.isFinite(Date.parse(metadata.updated_at))
      ) {
        dates.push(new Date(metadata.updated_at).toISOString())
      }
      const items = Array.isArray(metadata.items) ? metadata.items.map(record) : []
      estimatedItems += items.length || markdownContentsCount(content)
      items.forEach((item) =>
        collectItemOverview(item, {
          aiSummary: () => {
            aiSummaries += 1
          },
          collectionCounts,
          favorite: () => {
            favorites += 1
          },
          location: (count) => {
            locations += count
          },
          read: () => {
            readItems += 1
          },
          readLater: () => {
            readLater += 1
          },
          tagCounts,
        }),
      )
    } else {
      collectItemOverview(metadata, {
        aiSummary: () => {
          aiSummaries += 1
        },
        collectionCounts,
        favorite: () => {
          favorites += 1
        },
        location: (count) => {
          locations += count
        },
        read: () => {
          readItems += 1
        },
        readLater: () => {
          readLater += 1
        },
        tagCounts,
      })
    }
  }

  dates.sort()
  const overview = {
    content: {
      aiSummaries,
      estimatedItems,
      favorites,
      locations,
      readItems,
      readLater,
      sourcePages,
    },
    files: {
      byExtension: countEntries(extensionCounts),
      markdown: markdownFiles,
      text: textFiles,
      total: files.length,
      totalBytes,
    },
    latestSync: manifest.syncedAt ?? null,
    organization: {
      collections: countEntries(collectionCounts, 20),
      tags: countEntries(tagCounts, 20),
      topFolders: countEntries(topFolderCounts, 20),
    },
    sources: {
      domains: countEntries(domainCounts, 20),
      platforms: countEntries(platformCounts, 20),
    },
    updatedRange: {
      earliest: dates[0] ?? null,
      latest: dates.at(-1) ?? null,
    },
  }
  if (manifest.syncedAt) {
    await atomicJson(overviewCachePath, { overview, syncedAt: manifest.syncedAt })
  }
  return overview
}

function collectItemOverview(
  item: JsonRecord,
  target: {
    aiSummary: () => void
    collectionCounts: Map<string, number>
    favorite: () => void
    location: (count: number) => void
    read: () => void
    readLater: () => void
    tagCounts: Map<string, number>
  },
): void {
  if (item.clipper_favorite === true) target.favorite()
  if (item.clipper_read_later === true) target.readLater()
  if (typeof item.clipper_read_at === 'string' && item.clipper_read_at) target.read()
  if (typeof item.clipper_ai_summary === 'string' && item.clipper_ai_summary) target.aiSummary()
  for (const tag of stringList(item.clipper_tags)) incrementCount(target.tagCounts, tag)
  for (const collection of stringList(item.clipper_collections)) {
    incrementCount(target.collectionCounts, collection)
  }
  if (Array.isArray(item.clipper_locations)) target.location(item.clipper_locations.length)
  else if (Array.isArray(item.locations)) target.location(item.locations.length)
}

function parseMarkdownMetadata(content: string): JsonRecord {
  const normalized = content.replace(/\r\n?/g, '\n')
  const matched = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  if (!matched?.[1]) return {}
  try {
    return record(parseYaml(matched[1], { maxAliasCount: 20, strict: false }))
  } catch {
    return {}
  }
}

function markdownTitle(content: string, metadata: JsonRecord, relativePath: string): string {
  if (typeof metadata.page_title === 'string' && metadata.page_title.trim()) {
    return metadata.page_title.trim()
  }
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || posix.basename(relativePath)
}

function markdownContentsCount(content: string): number {
  const section = content.match(/(?:^|\n)## Contents\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1] ?? ''
  return section.split('\n').filter((line) => /^\s*-\s+\[[^\]]+\]\([^)]+\)/.test(line)).length
}

function incrementCount(target: Map<string, number>, value: string): void {
  target.set(value, (target.get(value) ?? 0) + 1)
}

function countEntries(target: Map<string, number>, limit = 100): JsonRecord[] {
  return [...target.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ count, value }))
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 1_000)
    : []
}

function resolveLocalMcpServers(
  overrides?: Record<string, LocalMcpServerDefinition>,
): Map<string, LocalMcpServerDefinition> {
  const definitions = overrides ?? defaultLocalMcpServers()
  return new Map(
    Object.entries(definitions).map(([id, value]) => [
      safeIdentifier(id, 'MCP server ID'),
      {
        args: Array.isArray(value.args) ? value.args.map(String) : [],
        executable: String(value.executable || ''),
      },
    ]),
  )
}

function defaultLocalMcpServers(): Record<string, LocalMcpServerDefinition> {
  if (process.platform !== 'darwin') return {}
  return {
    bear: {
      args: ['mcp-server'],
      executable: '/Applications/Bear.app/Contents/MacOS/bearcli',
    },
  }
}

async function invokeStdioMcp(server: LocalMcpServerDefinition, input: unknown): Promise<unknown> {
  const request = record(input)
  const method = typeof request.method === 'string' ? request.method : ''
  if (
    !/^(?:ping|tools\/(?:list|call)|resources\/(?:list|read|templates\/list)|prompts\/(?:list|get))$/.test(
      method,
    )
  ) {
    throw new Error(`Unsupported local MCP method: ${method || 'missing'}`)
  }
  const params = record(request.params)

  return new Promise((resolveRequest, rejectRequest) => {
    const child = spawn(server.executable, server.args ?? [], {
      cwd: homedir(),
      env: { ...process.env, HOME: homedir(), LANG: process.env.LANG || 'en_US.UTF-8' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let initialized = false
    let outputBytes = 0
    let settled = false
    let stderr = ''
    let stdout = ''
    let timeout: NodeJS.Timeout | undefined

    const finish = (error?: Error, value?: unknown) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 500).unref()
      if (error) rejectRequest(error)
      else resolveRequest(value)
    }
    const send = (message: JsonRecord) => child.stdin.write(`${JSON.stringify(message)}\n`)
    const consumeLines = () => {
      const lines = stdout.split(/\r?\n/)
      stdout = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        let message: JsonRecord
        try {
          message = record(JSON.parse(line))
        } catch {
          continue
        }
        if (message.id === 1 && !initialized) {
          if (message.error) {
            finish(new Error(errorMessage(message.error, 'MCP initialization failed')))
            return
          }
          initialized = true
          send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
          send({ id: 2, jsonrpc: '2.0', method, params })
        } else if (message.id === 2) {
          if (message.error) finish(new Error(errorMessage(message.error, 'MCP request failed')))
          else finish(undefined, message.result)
        }
      }
    }
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > MAX_MCP_OUTPUT_BYTES) {
        finish(new Error('MCP response exceeded the safety buffer'))
        return
      }
      stdout += chunk.toString('utf8')
      consumeLines()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > MAX_MCP_OUTPUT_BYTES) {
        finish(new Error('MCP response exceeded the safety buffer'))
        return
      }
      stderr += chunk.toString('utf8')
    })
    child.once('error', (error) =>
      finish(new Error(`Unable to start local MCP server: ${error.message}`)),
    )
    child.once('close', (code) => {
      if (!settled) {
        finish(new Error(stderr.trim() || `Local MCP server exited with code ${code ?? 1}`))
      }
    })
    child.stdin.on('error', () => undefined)
    timeout = setTimeout(
      () => finish(new Error('Local MCP request timed out')),
      DEFAULT_MCP_TIMEOUT_MS,
    )
    send({
      id: 1,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'shadow-local-bridge', version: '1.0.0' },
        protocolVersion: MCP_PROTOCOL_VERSION,
      },
    })
  })
}

async function listLocalRuntimes(): Promise<LocalRuntime[]> {
  return Promise.all([resolveRuntime('javascript'), resolveRuntime('python')])
}

async function executeLocalRuntime(input: unknown): Promise<JsonRecord> {
  const body = record(input)
  const runtimeId = body.runtime === 'python' || body.runtime === 'javascript' ? body.runtime : null
  if (!runtimeId) throw new Error('Runtime must be python or javascript')
  const code = typeof body.code === 'string' ? body.code : ''
  if (!code.trim()) throw new Error('Runtime code is empty')
  const stdin = typeof body.stdin === 'string' ? body.stdin : ''
  const timeoutMs = integerInRange(
    body.timeoutMs,
    1_000,
    MAX_RUNTIME_TIMEOUT_MS,
    DEFAULT_RUNTIME_TIMEOUT_MS,
    'timeoutMs',
  )
  const runtime = await resolveRuntime(runtimeId)
  if (!runtime.available || !runtime.executable) {
    return {
      error: runtime.error || `${runtime.label} is not installed`,
      ok: false,
      runtime: runtimeId,
    }
  }

  const cwd = await mkdtemp(join(tmpdir(), 'shadow-local-bridge-runtime-'))
  const startedAt = Date.now()
  try {
    const scriptPath = join(cwd, runtimeId === 'python' ? 'main.py' : 'main.mjs')
    await writeFile(scriptPath, code, 'utf8')
    const result = await runChildProcess({
      args: runtimeId === 'python' ? ['-I', scriptPath] : [scriptPath],
      cwd,
      executable: runtime.executable,
      input: stdin,
      timeoutMs,
    })
    const ok = result.exitCode === 0 && !result.timedOut && !result.outputExceeded
    return {
      durationMs: Date.now() - startedAt,
      ...(ok
        ? {}
        : {
            error: result.timedOut
              ? `Runtime exceeded the ${Math.round(timeoutMs / 1000)} second safety timeout`
              : result.outputExceeded
                ? 'Runtime output exceeded the safety buffer'
                : 'Runtime exited with an error',
          }),
      exitCode: result.exitCode,
      ok,
      outputExceeded: result.outputExceeded,
      runtime: runtimeId,
      signal: result.signal,
      stderr: result.stderr,
      stdout: result.stdout,
      timedOut: result.timedOut,
      version: runtime.version,
    }
  } finally {
    await rm(cwd, { force: true, recursive: true })
  }
}

async function resolveRuntime(id: LocalRuntime['id']): Promise<LocalRuntime> {
  const definition =
    id === 'python'
      ? { candidates: ['python3', 'python'], id, label: 'Python', versionArgs: ['--version'] }
      : {
          candidates: [process.execPath],
          id,
          label: 'JavaScript',
          versionArgs: ['--version'],
        }
  for (const executable of definition.candidates) {
    const probe = await probeExecutable(executable, definition.versionArgs)
    if (probe.available) {
      return { ...definition, available: true, executable, version: probe.version }
    }
  }
  return {
    available: false,
    error: `${definition.label} runtime was not found on this computer`,
    id,
    label: definition.label,
  }
}

async function probeExecutable(
  executable: string,
  args: string[],
): Promise<{ available: boolean; version?: string }> {
  try {
    const result = await runChildProcess({
      args,
      cwd: tmpdir(),
      executable,
      input: '',
      timeoutMs: 5_000,
    })
    const version = `${result.stdout}\n${result.stderr}`.trim().split('\n')[0]
    return { available: result.exitCode === 0, ...(version ? { version } : {}) }
  } catch {
    return { available: false }
  }
}

function runChildProcess(input: {
  executable: string
  args: string[]
  cwd: string
  input: string
  timeoutMs: number
}): Promise<ChildProcessResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      env: {
        HOME: input.cwd,
        LANG: process.env.LANG || 'en_US.UTF-8',
        PATH: process.env.PATH || '',
        TMPDIR: input.cwd,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: Buffer[] = []
    const stdout: Buffer[] = []
    let outputBytes = 0
    let outputExceeded = false
    let settled = false
    let timedOut = false

    const stop = (reason: 'output' | 'timeout') => {
      if (reason === 'timeout') timedOut = true
      if (reason === 'output') outputExceeded = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 500).unref()
    }
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > MAX_RUNTIME_OUTPUT_BYTES) {
        stop('output')
        return
      }
      target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      rejectRun(error)
    })
    child.once('close', (exitCode, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolveRun({
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        outputExceeded,
        ...(signal ? { signal } : {}),
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
        timedOut,
      })
    })
    const timeout = setTimeout(() => stop('timeout'), input.timeoutMs)
    child.stdin.on('error', () => undefined)
    child.stdin.end(input.input)
  })
}

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
): void {
  const originHeader = request.headers.origin
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader
  const allowed =
    origin && (allowedOrigins.includes(origin) || /^chrome-extension:\/\/[a-p]{32}$/.test(origin))
  if (allowed) response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Clipper-Client, X-Clipper-Filename, Mcp-Session-Id, Last-Event-ID',
  )
  response.setHeader('Access-Control-Allow-Methods', 'DELETE, GET, POST, OPTIONS')
  response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, X-Clipper-Filename')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Vary', 'Origin')
}

function requestClientId(request: IncomingMessage): string {
  const value = request.headers['x-clipper-client']
  const input = Array.isArray(value) ? value[0] : value
  return safeIdentifier(input, 'client ID')
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization
  const value = Array.isArray(authorization) ? authorization[0] : authorization
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

function credentialHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function authenticateBridgeRequest(
  metadataDir: string,
  request: IncomingMessage,
  adminToken: string,
): Promise<BridgeAuthentication | undefined> {
  const token = bearerToken(request)
  if (!token) return undefined
  if (token === adminToken) return { kind: 'admin' }
  const credentials = await readJsonFile<Record<string, ClientCredential>>(
    join(metadataDir, 'client-credentials.json'),
    {},
  )
  const tokenHash = credentialHash(token)
  const credential = Object.values(credentials).find(
    (candidate) => candidate?.tokenHash === tokenHash,
  )
  return credential ? { clientId: credential.clientId, kind: 'client' } : undefined
}

function assertAdminAuthentication(authentication: BridgeAuthentication): void {
  if (authentication.kind !== 'admin') throw bridgeError('Administrator access is required', 403)
}

function assertAuthenticatedClient(
  authentication: BridgeAuthentication,
  requestedClientId: string,
): void {
  if (authentication.kind === 'client' && authentication.clientId !== requestedClientId) {
    throw bridgeError('Client credential does not match this client', 403)
  }
}

function assertClientRequestAllowed(request: IncomingMessage, url: URL, clientId: string): void {
  const requestedClientId = requestClientId(request)
  if (requestedClientId !== clientId) {
    throw bridgeError('Client credential does not match this client', 403)
  }
  const method = request.method ?? ''
  const allowed =
    (method === 'POST' && url.pathname === '/v1/community/session/claim') ||
    (method === 'POST' && url.pathname === '/v1/library/sync') ||
    (method === 'GET' && /^\/v1\/artifacts\/[^/]+$/.test(url.pathname)) ||
    ((method === 'GET' || method === 'POST') && url.pathname === '/v1/runtimes') ||
    ((method === 'GET' || method === 'POST') &&
      /^\/v1\/mcp-servers(?:\/[^/]+\/request)?$/.test(url.pathname)) ||
    (method === 'POST' && /^\/v1\/clients\/[^/]+\/heartbeat$/.test(url.pathname)) ||
    (method === 'POST' && /^\/v1\/tasks\/[^/]+\/(?:lease\/renew|result)$/.test(url.pathname))
  if (!allowed) throw bridgeError('Client credential cannot access this operation', 403)
}

async function createClientPairing(
  metadataDir: string,
  inputClientId: unknown,
): Promise<{ clientId: string; code: string; expiresAt: string }> {
  const clientId = safeIdentifier(inputClientId, 'client ID')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString()
  const code = `pair_${randomBytes(32).toString('base64url')}`
  const pairings = await readJsonFile<Record<string, ClientPairing>>(
    join(metadataDir, 'client-pairings.json'),
    {},
  )
  const active = Object.fromEntries(
    Object.entries(pairings).filter(([, pairing]) => Date.parse(pairing.expiresAt) > now.getTime()),
  )
  active[clientId] = {
    clientId,
    codeHash: credentialHash(code),
    createdAt: now.toISOString(),
    expiresAt,
  }
  await atomicJson(join(metadataDir, 'client-pairings.json'), active)
  return { clientId, code, expiresAt }
}

async function claimClientPairing(
  metadataDir: string,
  inputClientId: unknown,
  inputCode: unknown,
): Promise<{ clientId: string; token: string }> {
  const clientId = safeIdentifier(inputClientId, 'client ID')
  const code = typeof inputCode === 'string' ? inputCode.trim() : ''
  if (!/^pair_[A-Za-z0-9_-]{40,64}$/.test(code)) throw bridgeError('Pairing code is invalid', 401)
  const pairingsPath = join(metadataDir, 'client-pairings.json')
  const pairings = await readJsonFile<Record<string, ClientPairing>>(pairingsPath, {})
  const pairing = pairings[clientId]
  if (
    !pairing ||
    Date.parse(pairing.expiresAt) <= Date.now() ||
    pairing.codeHash !== credentialHash(code)
  ) {
    throw bridgeError('Pairing code is invalid or expired', 401)
  }
  delete pairings[clientId]
  await atomicJson(pairingsPath, pairings)

  const token = `client_${randomBytes(32).toString('base64url')}`
  const credentialsPath = join(metadataDir, 'client-credentials.json')
  const credentials = await readJsonFile<Record<string, ClientCredential>>(credentialsPath, {})
  credentials[clientId] = {
    clientId,
    createdAt: new Date().toISOString(),
    tokenHash: credentialHash(token),
  }
  await atomicJson(credentialsPath, credentials)
  return { clientId, token }
}

async function listClientCredentials(
  metadataDir: string,
): Promise<Array<{ clientId: string; createdAt: string }>> {
  const credentials = await readJsonFile<Record<string, ClientCredential>>(
    join(metadataDir, 'client-credentials.json'),
    {},
  )
  return Object.values(credentials)
    .map(({ clientId, createdAt }) => ({ clientId, createdAt }))
    .sort((left, right) => left.clientId.localeCompare(right.clientId))
}

async function revokeClientCredential(metadataDir: string, clientId: string): Promise<void> {
  const credentialsPath = join(metadataDir, 'client-credentials.json')
  const credentials = await readJsonFile<Record<string, ClientCredential>>(credentialsPath, {})
  delete credentials[clientId]
  await atomicJson(credentialsPath, credentials)
}

async function storeArtifact(
  metadataDir: string,
  request: IncomingMessage,
): Promise<{ id: string; filename: string; mimeType: string; bytes: number; createdAt: string }> {
  const body = await readBody(request, MAX_ARTIFACT_BYTES)
  if (!body.byteLength) throw bridgeError('Artifact is empty', 400)
  const rawFilename = request.headers['x-clipper-filename']
  const headerFilename = Array.isArray(rawFilename) ? rawFilename[0] : rawFilename
  const filename = safeArtifactFilename(
    headerFilename ? decodeURIComponent(headerFilename) : 'artifact.bin',
  )
  const rawMimeType = request.headers['content-type']
  const mimeType = (
    Array.isArray(rawMimeType) ? rawMimeType[0] : rawMimeType || 'application/octet-stream'
  )
    .split(';', 1)[0]
    .trim()
    .slice(0, 120)
  const id = `artifact_${randomUUID()}`
  const directory = join(metadataDir, 'artifacts')
  const createdAt = new Date().toISOString()
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, `${id}.bin`), body)
  await atomicJson(join(directory, `${id}.json`), {
    bytes: body.byteLength,
    createdAt,
    filename,
    id,
    mimeType,
  })
  return { bytes: body.byteLength, createdAt, filename, id, mimeType }
}

async function stageArtifactFromPath(
  metadataDir: string,
  inputPath: unknown,
  inputMimeType?: unknown,
): Promise<{ id: string; filename: string; mimeType: string; bytes: number; createdAt: string }> {
  const source = resolve(expandHome(String(inputPath ?? '').trim()))
  const info = await stat(source).catch(() => undefined)
  if (!info?.isFile()) throw bridgeError('Artifact path is not a file', 400)
  if (!info.size || info.size > MAX_ARTIFACT_BYTES)
    throw bridgeError('Artifact must be between 1 byte and 32 MB', 413)
  const body = await readFile(source)
  const filename = safeArtifactFilename(source)
  const mimeType =
    typeof inputMimeType === 'string' && inputMimeType.trim()
      ? inputMimeType.trim().slice(0, 120)
      : artifactMimeType(filename)
  const id = `artifact_${randomUUID()}`
  const directory = join(metadataDir, 'artifacts')
  const createdAt = new Date().toISOString()
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, `${id}.bin`), body)
  await atomicJson(join(directory, `${id}.json`), {
    bytes: body.byteLength,
    createdAt,
    filename,
    id,
    mimeType,
  })
  return { bytes: body.byteLength, createdAt, filename, id, mimeType }
}

async function sendArtifact(
  response: ServerResponse,
  metadataDir: string,
  id: string,
): Promise<void> {
  const directory = join(metadataDir, 'artifacts')
  const metadata = await readJsonFile<JsonRecord | undefined>(
    join(directory, `${id}.json`),
    undefined,
  )
  if (!metadata) throw bridgeError('Artifact not found', 404)
  const body = await readFile(join(directory, `${id}.bin`)).catch(() => undefined)
  if (!body) throw bridgeError('Artifact not found', 404)
  response.writeHead(200, {
    'Content-Type':
      typeof metadata.mimeType === 'string' ? metadata.mimeType : 'application/octet-stream',
    'Content-Length': body.byteLength,
    'X-Clipper-Filename': encodeURIComponent(String(metadata.filename ?? 'artifact.bin')),
  })
  response.end(body)
}

async function assertArtifactExists(metadataDir: string, id: string): Promise<void> {
  const artifactPath = join(metadataDir, 'artifacts', `${safeIdentifier(id, 'artifact ID')}.bin`)
  if (!(await fileExists(artifactPath))) throw bridgeError('Artifact not found', 404)
}

async function removeArtifact(metadataDir: string, id: string): Promise<void> {
  const safeId = safeIdentifier(id, 'artifact ID')
  const directory = join(metadataDir, 'artifacts')
  await Promise.all([
    rm(join(directory, `${safeId}.bin`), { force: true }),
    rm(join(directory, `${safeId}.json`), { force: true }),
  ])
}

function safeArtifactFilename(value: string): string {
  const filename = value.replace(/\\/g, '/').split('/').pop()?.trim() || 'artifact.bin'
  if (filename.includes('\0')) throw bridgeError('Invalid artifact filename', 400)
  return filename.slice(0, 240)
}

function artifactMimeType(filename: string): string {
  if (/\.json$/i.test(filename)) return 'application/json'
  if (/\.png$/i.test(filename)) return 'image/png'
  if (/\.webp$/i.test(filename)) return 'image/webp'
  if (/\.jpe?g$/i.test(filename)) return 'image/jpeg'
  if (/\.gif$/i.test(filename)) return 'image/gif'
  if (/\.svg$/i.test(filename)) return 'image/svg+xml'
  if (/\.md$/i.test(filename)) return 'text/markdown'
  if (/\.zip$/i.test(filename)) return 'application/zip'
  return 'application/octet-stream'
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request, MAX_JSON_BYTES)
  try {
    return JSON.parse(body.toString('utf8') || '{}')
  } catch {
    throw bridgeError('Invalid JSON', 400)
  }
}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    size += chunk.length
    if (size > limit) throw bridgeError('Request body too large', 413)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, path)
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return structuredClone(fallback)
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function safeArchivePath(input: unknown): string {
  const normalized = posix.normalize(String(input || '').replaceAll('\\', '/')).replace(/^\/+/, '')
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw bridgeError('Unsafe ZIP path', 400)
  }
  return normalized
}

function assertWithinRoot(root: string, target: string): void {
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error('Path escaped library root')
  }
}

async function assertNoSymbolicLinks(root: string, target: string): Promise<void> {
  assertWithinRoot(root, target)
  const pathFromRoot = relative(root, target)
  if (!pathFromRoot) return

  let current = root
  for (const segment of pathFromRoot.split(sep)) {
    current = join(current, segment)
    const info = await lstat(current).catch((error: unknown) => {
      if (record(error).code === 'ENOENT') return undefined
      throw error
    })
    if (!info) return
    if (info.isSymbolicLink()) {
      throw bridgeError('Managed library paths cannot traverse symbolic links', 400)
    }
  }
}

function safeIdentifier(value: unknown, label: string): string {
  const text = String(value || '')
  if (!/^[a-zA-Z0-9_.:-]{1,120}$/.test(text)) throw new Error(`Invalid ${label}`)
  return text
}

function normalizeIdempotencyKey(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return undefined
  const hasControlCharacter = Array.from(text).some(
    (character) => (character.codePointAt(0) ?? 0) <= 0x1f,
  )
  if (text.length > 240 || hasControlCharacter) throw new Error('Invalid idempotency key')
  return text
}

function libraryResourceUri(path: string): string {
  return `clipper://library/${path.split('/').map(encodeURIComponent).join('/')}`
}

function resourcePathFromUri(uri: string): string {
  const parsed = new URL(uri)
  if (parsed.protocol !== 'clipper:' || parsed.hostname !== 'library') {
    throw new Error('Unsupported resource URI')
  }
  return safeArchivePath(
    parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/'),
  )
}

function resourceMimeType(path: string): string {
  if (/\.json$/i.test(path)) return 'application/json'
  if (/\.(?:md|markdown)$/i.test(path)) return 'text/markdown'
  return 'text/plain'
}

function mcpTextResult(value: unknown): JsonRecord {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' }],
    structuredContent: record(value),
  }
}

function toolStructuredContent(result: JsonRecord): JsonRecord {
  return record(result.structuredContent)
}

function mcpToolError(message: string): JsonRecord {
  return { content: [{ text: message, type: 'text' }], isError: true }
}

function getMcpPrompt(name: string, args: JsonRecord): JsonRecord {
  if (name === 'explore-library') {
    const topic = String(args.topic ?? '').trim()
    if (!topic) throw mcpError(-32602, 'The explore-library prompt requires a topic')
    return {
      description: `Explore the local library for ${topic}`,
      messages: [
        {
          content: {
            text: `Use clipper_library_overview first. Search for ${JSON.stringify(topic)}, follow pagination when useful, read only the strongest matching files, and distinguish direct library evidence from inference.`,
            type: 'text',
          },
          role: 'user',
        },
      ],
    }
  }
  if (name === 'run-browser-task') {
    const goal = String(args.goal ?? '').trim()
    if (!goal) throw mcpError(-32602, 'The run-browser-task prompt requires a goal')
    return {
      description: `Choose a browser task for ${goal}`,
      messages: [
        {
          content: {
            text: `Call clipper_list_plugins and select only a currently declared task that directly supports this goal: ${goal}. Explain the task and options before enqueueing it, then use clipper_wait_for_task to observe the result.`,
            type: 'text',
          },
          role: 'user',
        },
      ],
    }
  }
  throw mcpError(-32602, `Unknown MCP prompt: ${name}`)
}

function normalizeCommunitySession(
  value: LocalBridgeCommunitySession,
): LocalBridgeCommunitySession {
  const accessToken = typeof value.accessToken === 'string' ? value.accessToken.trim() : ''
  const refreshToken = typeof value.refreshToken === 'string' ? value.refreshToken.trim() : ''
  const clear = value.clear === true
  if (!clear && !accessToken && !refreshToken) {
    throw new Error('The community login is not available')
  }
  if (accessToken.length > 16_384 || refreshToken.length > 16_384) {
    throw new Error('The community login is invalid')
  }

  let endpoint: URL
  try {
    endpoint = new URL(value.endpoint)
  } catch {
    throw new Error('The community server address is invalid')
  }
  const loopback =
    endpoint.hostname === 'localhost' ||
    endpoint.hostname === '127.0.0.1' ||
    endpoint.hostname === '[::1]'
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('The community server address is invalid')
  }
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
    throw new Error('The community server address must use HTTPS')
  }
  return { accessToken, clear, endpoint: endpoint.origin, refreshToken }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = Number(value)
  return Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : fallback))
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
  label: string,
): number {
  if (value === undefined || value === null || value === '') return fallback
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw mcpError(-32602, `${label} must be an integer between ${minimum} and ${maximum}`)
  }
  return numeric
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url')
}

function decodeCursor(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
    throw mcpError(-32602, 'Cursor is invalid')
  }
  const decoded = Buffer.from(value, 'base64url').toString('utf8')
  const offset = Number(decoded)
  if (!/^\d+$/.test(decoded) || !Number.isSafeInteger(offset) || offset < 0) {
    throw mcpError(-32602, 'Cursor is invalid')
  }
  return offset
}

function normalizePathPrefix(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ''
  return safeArchivePath(text).replace(/\/+$/, '')
}

function libraryPathFromToolArgs(args: JsonRecord): string {
  if (typeof args.uri === 'string' && args.uri.trim()) return resourcePathFromUri(args.uri.trim())
  if (typeof args.path === 'string' && args.path.trim()) return safeArchivePath(args.path.trim())
  throw mcpError(-32602, 'Provide a managed file path or clipper:// URI')
}

function tokenizeSearchQuery(query: string): string[] {
  const terms = Array.from(
    new Set(
      (query.match(/"[^"]+"|'[^']+'|\S+/g) ?? [])
        .map((term) =>
          term
            .replace(/^['"]|['"]$/g, '')
            .trim()
            .toLocaleLowerCase(),
        )
        .filter(Boolean),
    ),
  )
  if (!terms.length) throw mcpError(-32602, 'Search query must contain searchable text')
  return terms
}

function countOccurrences(content: string, term: string): number {
  let count = 0
  let offset = 0
  while (count < 10) {
    const index = content.indexOf(term, offset)
    if (index < 0) break
    count += 1
    offset = index + Math.max(1, term.length)
  }
  return count
}

function bridgeError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

function mcpError(messageCode: number, message: string): Error & { mcpCode: number } {
  return Object.assign(new Error(message), { mcpCode: messageCode })
}

function errorStatus(error: unknown): number {
  const status = Number(record(error).status)
  if (Number.isInteger(status) && status >= 400 && status < 600) return status
  const mcpCode = Number(record(error).mcpCode)
  if (mcpCode === -32600 || mcpCode === -32602) return 400
  if (mcpCode === -32601) return 404
  return 500
}

function errorMessage(value: unknown, fallback: string): string {
  const message = record(value).message
  return typeof message === 'string' && message ? message : fallback
}

function expandHome(path: string): string {
  return path === '~' ? homedir() : path.startsWith('~/') ? join(homedir(), path.slice(2)) : path
}

function localBridgeTokenPath(root: string): string {
  return join(root, '.clipper', 'bridge-token')
}

async function writePrivateToken(path: string, token: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${token}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
}

function withLock<T>(
  kind: 'authentication' | 'library' | 'tasks',
  operation: () => Promise<T>,
): Promise<T> {
  const current =
    kind === 'tasks'
      ? taskStateLock
      : kind === 'authentication'
        ? authenticationStateLock
        : librarySyncLock
  const running = current.then(operation, operation)
  const settled = running.then(
    () => undefined,
    () => undefined,
  )
  if (kind === 'tasks') taskStateLock = settled
  else if (kind === 'authentication') authenticationStateLock = settled
  else librarySyncLock = settled
  return running
}
