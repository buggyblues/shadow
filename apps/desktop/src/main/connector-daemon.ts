import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { hostname } from 'node:os'
import { delimiter, join } from 'node:path'
import { app, BrowserWindow, ipcMain, net } from 'electron'
import { DESKTOP_COMMUNITY_AUTH_REQUIRED } from '../shared/community-auth'
import {
  fetchCommunityWithAuth,
  readCommunityAccessToken,
  refreshCommunityAccessToken,
} from './community-session'
import {
  connectorWorkDirMapFilePath,
  type DesktopRuntimeSettings,
  normalizeConnectorApiKey,
  readDesktopSettingsAsync,
  resolveDesktopServerBaseUrl,
  saveDesktopSettingsAsync,
  writeConnectorWorkDirMapAsync,
} from './desktop-settings'
import { resolveElectronNodeBinaryAsync } from './process-manager'
import { getConnectorAuthWindow, showConnectorAuthWindow } from './window'

export {
  fetchCommunityUrlWithAuth,
  fetchCommunityWithAuth,
  forgetCommunityAccessToken,
  forgetCommunityAuthTokens,
  readCommunityAccessToken,
  rememberCommunityAuthSnapshot,
} from './community-session'

type ConnectorDaemonState = {
  running: boolean
  pid: number | null
  startedAt: number | null
  uptimeMs: number
  serverBaseUrl: string
  hasApiKey: boolean
  autoStart: boolean
  phase: ConnectorDaemonPhase
  progress: number
  progressMessage: string
  connections: ConnectorConnection[]
  lastExitCode: number | null
  lastError: string | null
  logTail: string[]
  connectorPath: string | null
}

type ConnectorDaemonPhase =
  | 'idle'
  | 'authorizing'
  | 'connecting'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export type ConnectorConnection = {
  agentId: string
  label: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  runtimeId: string
  runtimeLabel: string
  computerId: string
  computerName: string
  workDir: string
  status: 'running' | 'stopped' | 'error'
}

export type ConnectorRuntimeInfo = {
  id: string
  label: string
  kind: 'openclaw' | 'cli'
  status: 'available' | 'missing'
  version?: string | null
  command?: string | null
  iconId?: string | null
  installCommand?: string | null
  installCommands?: string[]
  helpUrl?: string | null
  detectedAt?: string | null
}

export type ConnectorRuntimeSessionState =
  | 'idle'
  | 'running'
  | 'streaming'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'unknown'

export type ConnectorRuntimeInstanceStatus =
  | 'running'
  | 'available'
  | 'stopped'
  | 'missing'
  | 'error'

export type ConnectorRuntimeInstanceInfo = {
  runtimeId: string
  instanceId: string
  label: string
  status: ConnectorRuntimeInstanceStatus
  endpoint?: string | null
  capabilities: string[]
  error?: string | null
  metadata?: Record<string, unknown>
}

export type ConnectorRuntimeSessionInfo = {
  runtimeId: string
  instanceId: string
  sessionId: string
  title?: string | null
  workDir?: string | null
  state: ConnectorRuntimeSessionState
  model?: string | null
  lastActivityAt?: string | null
  startedAt?: string | null
  source: 'server' | 'cli' | 'transcript' | string
  native?: Record<string, unknown>
}

export type ConnectorRuntimeSessionSnapshot = {
  scannedAt: string
  runtimeIds: string[]
  instances: ConnectorRuntimeInstanceInfo[]
  sessions: ConnectorRuntimeSessionInfo[]
}

export type ConnectorRuntimeScanResult = {
  runtimes: ConnectorRuntimeInfo[]
  runtimeSessions?: ConnectorRuntimeSessionSnapshot | null
  cached?: boolean
}

export type ConnectorRuntimeSessionScanResult = {
  runtimes?: ConnectorRuntimeInfo[]
  runtimeSessions: ConnectorRuntimeSessionSnapshot
  cached?: boolean
}

type ConnectorComputerView = {
  id: string
  name: string
  status?: 'pending' | 'online' | 'offline'
  hostname: string | null
  os: string | null
  arch: string | null
  runtimes: Array<{ id: string; label: string; status: string }>
  lastSeenAt?: string | null
  updatedAt?: string | null
}

type CommunityAgentView = {
  id: string
  userId?: string | null
  status: 'running' | 'stopped' | 'error'
  config?: Record<string, unknown> | null
  botUser?: {
    id?: string | null
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

type ConnectorJobView = {
  id: string
  type: string
  agentId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string | null
  result?: Record<string, unknown> | null
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
}

type ConnectorDiagnosticCheck = {
  target: string
  status: 'ok' | 'warn' | 'fail'
  label: string
  detail?: string
  fix?: string
}

type ConnectorDiagnosticsView = {
  ok: boolean
  checks: ConnectorDiagnosticCheck[]
}

type CreateConnectorBuddyInput = {
  runtimeId: string
  name: string
  username: string
  description?: string
  avatarUrl?: string | null
}

let daemonProcess: ChildProcess | null = null
let startedAt: number | null = null
let lastExitCode: number | null = null
let lastError: string | null = null
let daemonPhase: ConnectorDaemonPhase = 'idle'
let daemonProgress = 0
let daemonProgressMessage = ''
let connectorConnections: ConnectorConnection[] = []
const logTail: string[] = []
const AUTH_POLL_INTERVAL_MS = 800
const AUTH_TIMEOUT_MS = 120_000
const RUNTIME_SCAN_CACHE_MS = 30_000
const RUNTIME_SESSION_SCAN_CACHE_MS = 12_000
let connectorCliPathCache: string | null = null
let runtimeScanCache: (ConnectorRuntimeScanResult & { cachedAt: number }) | null = null
let runtimeScanInFlight: Promise<ConnectorRuntimeScanResult> | null = null
let runtimeSessionScanCache:
  | (ConnectorRuntimeSessionScanResult & {
      cachedAt: number
    })
  | null = null
let runtimeSessionScanInFlight: Promise<ConnectorRuntimeSessionScanResult> | null = null
let cachedDesktopSettings: DesktopRuntimeSettings | null = null

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveConnectorCliPath(): Promise<string | null> {
  const candidates = [
    join(process.resourcesPath, 'dist/cli.js'),
    join(process.resourcesPath, 'connector', 'dist/cli.js'),
    join(__dirname, '../../../../packages/connector/dist/cli.js'),
  ]
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      connectorCliPathCache = candidate
      return candidate
    }
  }
  connectorCliPathCache = null
  return null
}

function appendLog(chunk: Buffer | string): void {
  const text = chunk.toString()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    logTail.push(trimmed)
  }
  while (logTail.length > 80) logTail.shift()
  broadcastConnectorState()
}

function setConnectorProgress(
  phase: ConnectorDaemonPhase,
  progress: number,
  message: string,
): void {
  daemonPhase = phase
  daemonProgress = Math.max(0, Math.min(100, progress))
  daemonProgressMessage = message
  broadcastConnectorState()
}

function connectorEnv(settings: DesktopRuntimeSettings): NodeJS.ProcessEnv {
  const connectorHome = join(app.getPath('home'), '.shadowob', 'connector')
  const managedNodeVersion = process.env.SHADOW_CONNECTOR_NODE_VERSION || '22.16.0'
  const managedPaths = [
    join(app.getPath('home'), '.local', 'bin'),
    join(connectorHome, 'node-global', 'bin'),
    join(connectorHome, 'node', `v${managedNodeVersion}`, 'bin'),
  ]
  const pathValue = [managedPaths.join(delimiter), process.env.PATH].filter(Boolean).join(delimiter)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1',
    NPM_CONFIG_PREFIX: join(connectorHome, 'node-global'),
    SHADOW_CONNECTOR_HOME: connectorHome,
    SHADOW_CONNECTOR_USE_MANAGED_NODE: '1',
    PATH: pathValue,
  }
  if (settings.httpProxy || settings.httpsProxy) {
    if (settings.httpProxy) {
      env.HTTP_PROXY = settings.httpProxy
      env.http_proxy = settings.httpProxy
    }
    env.HTTPS_PROXY = settings.httpsProxy || settings.httpProxy
    env.https_proxy = settings.httpsProxy || settings.httpProxy
  }
  return env
}

function buildArgs(settings: DesktopRuntimeSettings, cliPath: string): string[] {
  const args = [
    cliPath,
    'daemon',
    '--server-url',
    resolveDesktopServerBaseUrl(settings),
    '--api-key',
    settings.connectorApiKey,
    '--poll-interval-ms',
    '5000',
    '--work-dir-map-file',
    connectorWorkDirMapFilePath(),
  ]
  return args
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeHttpOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function connectorBootstrapOrigins(settings: DesktopRuntimeSettings): string[] {
  const origin = normalizeHttpOrigin(resolveDesktopServerBaseUrl(settings))
  return origin ? [origin] : []
}

async function fetchCommunityJson<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const response = await fetchCommunityWithAuth(path, options).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes(DESKTOP_COMMUNITY_AUTH_REQUIRED)) {
      return null
    }
    throw error
  })
  if (!response) return null
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Community API ${path} failed (${response.status})${body ? `: ${body}` : ''}`)
  }
  return (await response.json()) as T
}

function connectorConfigString(config: Record<string, unknown> | null | undefined, key: string) {
  const value = config?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function computerName(computer: ConnectorComputerView | undefined, fallback: string): string {
  if (!computer) return fallback
  const platform = [computer.os, computer.arch].filter(Boolean).join(' ')
  const detail = [computer.hostname, platform].filter(Boolean).join(' / ')
  const name = computer.name.trim()
  const isGenericDesktopName = ['shadow', 'shadow desktop'].includes(name.toLowerCase())
  if (!detail) return computer.name || fallback
  if (name && !isGenericDesktopName && computer.name !== computer.hostname) {
    return `${name} - ${detail}`
  }
  return detail
}

export async function refreshConnectorConnections(): Promise<ConnectorConnection[]> {
  const localWorkDirs = (await readDesktopSettingsAsync()).connectorBuddyWorkDirs
  const [computerData, agents] = await Promise.all([
    fetchCommunityJson<{ computers: ConnectorComputerView[] }>('/api/connector/computers'),
    fetchCommunityJson<CommunityAgentView[]>('/api/agents'),
  ])
  if (!computerData || !agents) return connectorConnections

  const computers = new Map(computerData.computers.map((computer) => [computer.id, computer]))
  connectorConnections = agents
    .map((agent): ConnectorConnection | null => {
      const computerId = connectorConfigString(agent.config, 'connectorComputerId')
      const runtimeId = connectorConfigString(agent.config, 'connectorRuntimeId')
      if (!computerId || !runtimeId) return null
      const computer = computers.get(computerId)
      const runtime = computer?.runtimes.find((item) => item.id === runtimeId)
      const runtimeLabel =
        connectorConfigString(agent.config, 'connectorRuntimeLabel') || runtime?.label || runtimeId
      const label = agent.botUser?.displayName || agent.botUser?.username || agent.id.slice(0, 8)
      return {
        agentId: agent.id,
        label,
        username: agent.botUser?.username ?? null,
        displayName: agent.botUser?.displayName ?? null,
        avatarUrl: agent.botUser?.avatarUrl ?? null,
        runtimeId,
        runtimeLabel,
        computerId,
        computerName: computerName(computer, computerId.slice(0, 8)),
        workDir: localWorkDirs[agent.id] ?? '',
        status: agent.status,
      }
    })
    .filter((connection): connection is ConnectorConnection => Boolean(connection))
  broadcastConnectorState()
  return connectorConnections
}

function onlineComputerScore(computer: ConnectorComputerView, runtimeId: string): number {
  const runtime = computer.runtimes.find(
    (item) => item.id === runtimeId && item.status === 'available',
  )
  if (!runtime) return -1
  let score = 0
  if (computer.status === 'online') score += 100
  if (computer.hostname === hostname()) score += 20
  const lastSeenAt = computer.lastSeenAt ? Date.parse(computer.lastSeenAt) : Number.NaN
  if (Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt < 120_000) score += 10
  return score
}

async function findConnectorComputerForRuntime(
  runtimeId: string,
): Promise<ConnectorComputerView | null> {
  const computerData = await fetchCommunityJson<{ computers: ConnectorComputerView[] }>(
    '/api/connector/computers',
  )
  if (!computerData) return null
  return (
    computerData.computers
      .map((computer) => ({ computer, score: onlineComputerScore(computer, runtimeId) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.computer ?? null
  )
}

async function waitForConnectorComputerForRuntime(
  runtimeId: string,
  timeoutMs = 20_000,
): Promise<ConnectorComputerView | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const computer = await findConnectorComputerForRuntime(runtimeId)
    if (computer) return computer
    await delay(1000)
  }
  return findConnectorComputerForRuntime(runtimeId)
}

async function waitForConnectorJob(jobId: string, timeoutMs = 90_000): Promise<ConnectorJobView> {
  const deadline = Date.now() + timeoutMs
  let lastJob: ConnectorJobView | null = null
  while (Date.now() < deadline) {
    const result = await fetchCommunityJson<{ job: ConnectorJobView }>(
      `/api/connector/jobs/${encodeURIComponent(jobId)}`,
    )
    if (result?.job) {
      lastJob = result.job
      if (result.job.status === 'completed') return result.job
      if (result.job.status === 'failed') {
        throw new Error(result.job.error || 'Connector failed to configure this Buddy')
      }
    }
    await delay(1000)
  }
  throw new Error(
    lastJob?.status
      ? `Connector job is still ${lastJob.status}. Check the Connector log and try again.`
      : 'Timed out waiting for Connector to configure this Buddy',
  )
}

async function waitForConnectorConnection(
  agentId: string,
  timeoutMs = 30_000,
): Promise<ConnectorConnection[]> {
  const deadline = Date.now() + timeoutMs
  let lastConnections = await refreshConnectorConnections()
  while (Date.now() < deadline) {
    if (
      lastConnections.some(
        (connection) => connection.agentId === agentId && connection.status === 'running',
      )
    ) {
      return lastConnections
    }
    await delay(1000)
    lastConnections = await refreshConnectorConnections()
  }
  return lastConnections
}

function connectorTargetForRuntime(runtimeId: string): 'openclaw' | 'hermes' | 'cc-connect' {
  if (runtimeId === 'openclaw') return 'openclaw'
  if (runtimeId === 'hermes') return 'hermes'
  return 'cc-connect'
}

function summarizeConnectorDiagnostics(diagnostics: ConnectorDiagnosticsView | null): string {
  if (!diagnostics?.checks?.length) return ''
  const actionable = diagnostics.checks.filter((item) => item.status === 'fail')
  const warnings = diagnostics.checks.filter((item) => item.status === 'warn')
  const checks = (actionable.length ? actionable : warnings).slice(0, 3)
  if (!checks.length) return ''
  return `Diagnostics: ${checks
    .map((item) => [item.label, item.detail, item.fix].filter(Boolean).join(' - '))
    .join('; ')}`
}

async function connectorDiagnosticsForConnection(connection: ConnectorConnection): Promise<string> {
  const target = connectorTargetForRuntime(connection.runtimeId)
  const args = ['doctor', '--target', target, '--json']
  if (target === 'cc-connect') {
    const projectName = connection.username?.trim() || connection.label.trim()
    if (projectName) args.push('--project-name', projectName)
    if (connection.workDir?.trim()) args.push('--work-dir', connection.workDir.trim())
  }
  try {
    return summarizeConnectorDiagnostics(
      await runConnectorCliJson<ConnectorDiagnosticsView>(args, 20_000),
    )
  } catch (error) {
    return `Diagnostics failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function describeConnectorConnectionFailure(
  connection: ConnectorConnection,
  cause?: unknown,
): Promise<string> {
  const causeMessage =
    cause instanceof Error ? cause.message : typeof cause === 'string' ? cause.trim() : ''
  const diagnostics = await connectorDiagnosticsForConnection(connection)
  return [
    causeMessage ||
      `${connection.runtimeLabel} finished setup, but ${connection.label} did not come online within 45 seconds.`,
    `Runtime: ${connection.runtimeLabel}. Buddy: ${connection.displayName || connection.label}.`,
    diagnostics,
  ]
    .filter(Boolean)
    .join(' ')
}

export async function createConnectorBuddy(input: CreateConnectorBuddyInput): Promise<{
  connections: ConnectorConnection[]
  agent: CommunityAgentView | null
  connectionError?: string | null
}> {
  const settings = await readDesktopSettingsAsync()
  const runtimeId = typeof input.runtimeId === 'string' ? input.runtimeId.trim() : ''
  if (!runtimeId) throw new Error('Missing runtime id')
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const username = typeof input.username === 'string' ? input.username.trim() : ''
  if (!name || !username) throw new Error('Missing Buddy name or username')

  const computer = await waitForConnectorComputerForRuntime(runtimeId)
  if (!computer) {
    throw new Error('No online Connector computer has this runtime yet')
  }
  const result = await fetchCommunityJson<{
    agent: CommunityAgentView
    job?: ConnectorJobView | null
  }>(`/api/connector/computers/${computer.id}/buddies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      runtimeId,
      serverUrl: resolveDesktopServerBaseUrl(settings),
      name,
      username,
      description: input.description?.trim() || undefined,
      avatarUrl: input.avatarUrl || undefined,
      buddyMode: 'private',
      allowedServerIds: [],
    }),
  })
  const agentId = result?.agent?.id
  let connectionError: string | null = null
  if (result?.job?.id) {
    try {
      await waitForConnectorJob(result.job.id)
    } catch (error) {
      connectionError =
        error instanceof Error ? error.message : `Connector setup failed: ${String(error)}`
    }
  }
  const connections = agentId
    ? await waitForConnectorConnection(agentId, connectionError ? 1_000 : 45_000)
    : await refreshConnectorConnections()
  if (agentId && !connectionError) {
    const connection = connections.find((item) => item.agentId === agentId)
    if (connection?.status !== 'running') {
      connectionError = connection
        ? await describeConnectorConnectionFailure(connection)
        : 'Connector setup finished, but this Buddy was not returned by the connection list.'
    }
  }
  return { connections, agent: result?.agent ?? null, connectionError }
}

export async function setConnectorConnectionEnabled(
  agentId: string,
  enabled: boolean,
): Promise<ConnectorConnection[]> {
  const normalizedAgentId = typeof agentId === 'string' ? agentId.trim() : ''
  if (!normalizedAgentId) throw new Error('Missing Buddy id')
  if (enabled) {
    if (!daemonProcess || daemonProcess.killed) {
      throw new Error('Connector is not running. Start the Connector before connecting this Buddy.')
    }
    const settings = await readDesktopSettingsAsync()
    const connections = await refreshConnectorConnections()
    const connection = connections.find((item) => item.agentId === normalizedAgentId)
    if (!connection) {
      throw new Error('This Buddy is not bound to a local Connector runtime yet.')
    }
    const result = await fetchCommunityJson<{
      agent: CommunityAgentView
      job?: ConnectorJobView | null
    }>(
      `/api/connector/computers/${encodeURIComponent(connection.computerId)}/buddies/${encodeURIComponent(normalizedAgentId)}/configure`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runtimeId: connection.runtimeId,
          serverUrl: resolveDesktopServerBaseUrl(settings),
        }),
      },
    )
    try {
      if (result?.job?.id) await waitForConnectorJob(result.job.id)
    } catch (error) {
      throw new Error(await describeConnectorConnectionFailure(connection, error))
    }
    const readyConnections = await waitForConnectorConnection(normalizedAgentId, 45_000)
    const readyConnection = readyConnections.find((item) => item.agentId === normalizedAgentId)
    if (readyConnection?.status !== 'running') {
      throw new Error(await describeConnectorConnectionFailure(readyConnection ?? connection))
    }
    return readyConnections
  }
  await fetchCommunityJson(`/api/agents/${encodeURIComponent(normalizedAgentId)}/stop`, {
    method: 'POST',
  })
  return refreshConnectorConnections()
}

export async function deleteConnectorConnection(input: {
  agentId: string
  deleteCloudBuddy?: boolean
}): Promise<ConnectorConnection[]> {
  const normalizedAgentId = typeof input?.agentId === 'string' ? input.agentId.trim() : ''
  if (!normalizedAgentId) throw new Error('Missing Buddy id')
  const deleteCloudBuddy = input.deleteCloudBuddy === true

  const settings = await readDesktopSettingsAsync()
  const connections = await refreshConnectorConnections()
  const connection = connections.find((item) => item.agentId === normalizedAgentId)
  if (!connection) {
    throw new Error('This Buddy is not bound to a local Connector runtime yet.')
  }

  const result = await fetchCommunityJson<{
    job?: ConnectorJobView | null
  }>(
    `/api/connector/computers/${encodeURIComponent(connection.computerId)}/buddies/${encodeURIComponent(normalizedAgentId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteCloudBuddy }),
    },
  )
  if (!result) throw new Error('Community authorization is required to delete this connection.')
  if (result?.job?.id && daemonProcess && !daemonProcess.killed) {
    await waitForConnectorJob(result.job.id, 45_000)
  }

  const connectorBuddyWorkDirs = { ...settings.connectorBuddyWorkDirs }
  delete connectorBuddyWorkDirs[normalizedAgentId]
  await saveDesktopSettingsAsync({ connectorBuddyWorkDirs })
  connectorConnections = connectorConnections.filter((item) => item.agentId !== normalizedAgentId)
  broadcastConnectorState()
  return refreshConnectorConnections()
}

export async function setConnectorConnectionWorkDir(
  agentId: string,
  workDir: string,
): Promise<ConnectorConnection[]> {
  const normalizedWorkDir = typeof workDir === 'string' ? workDir.trim() : ''
  const settings = await readDesktopSettingsAsync()
  const connectorBuddyWorkDirs = { ...settings.connectorBuddyWorkDirs }
  if (normalizedWorkDir) {
    connectorBuddyWorkDirs[agentId] = normalizedWorkDir
  } else {
    delete connectorBuddyWorkDirs[agentId]
  }
  await saveDesktopSettingsAsync({ connectorBuddyWorkDirs })
  connectorConnections = connectorConnections.map((connection) =>
    connection.agentId === agentId ? { ...connection, workDir: normalizedWorkDir } : connection,
  )
  broadcastConnectorState()
  return connectorConnections
}

async function waitForCommunityAccessToken(): Promise<string> {
  const existingToken = await readCommunityAccessToken()
  if (existingToken) return existingToken

  showConnectorAuthWindow()
  const deadline = Date.now() + AUTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    const token = await readCommunityAccessToken()
    if (token) return token
    await delay(AUTH_POLL_INTERVAL_MS)
  }
  throw new Error('Community authorization timed out')
}

async function bootstrapConnectorApiKey(
  settings: DesktopRuntimeSettings,
): Promise<{ apiKey: string; serverBaseUrl: string }> {
  let token = await waitForCommunityAccessToken()
  let bootstrap = await requestConnectorBootstrap(settings, token)
  if (bootstrap.response.status === 401 || bootstrap.response.status === 403) {
    const refreshedToken = await refreshCommunityAccessToken()
    if (refreshedToken && refreshedToken !== token) {
      token = refreshedToken
      bootstrap = await requestConnectorBootstrap(settings, refreshedToken)
    }
  }
  if (bootstrap.response.status === 401 || bootstrap.response.status === 403) {
    showConnectorAuthWindow()
    const deadline = Date.now() + AUTH_TIMEOUT_MS
    while (!bootstrap.response.ok && Date.now() < deadline) {
      await delay(AUTH_POLL_INTERVAL_MS)
      const nextToken = await readCommunityAccessToken()
      if (!nextToken || nextToken === token) continue
      token = nextToken
      bootstrap = await requestConnectorBootstrap(settings, nextToken)
    }
  }
  if (!bootstrap.response.ok) {
    const body = await bootstrap.response.text().catch(() => '')
    throw new Error(
      `Connector authorization failed at ${bootstrap.serverBaseUrl} (${bootstrap.response.status}); tried ${bootstrap.attempts.join(', ')}${body ? `: ${body}` : ''}`,
    )
  }
  const result = (await bootstrap.response.json()) as { apiKey?: unknown }
  const apiKey = normalizeConnectorApiKey(result.apiKey)
  if (!apiKey) throw new Error('Connector authorization did not return a machine key')
  await saveDesktopSettingsAsync({ connectorApiKey: apiKey })
  getConnectorAuthWindow()?.close()
  return { apiKey, serverBaseUrl: bootstrap.serverBaseUrl }
}

async function requestConnectorBootstrap(
  settings: DesktopRuntimeSettings,
  token: string,
): Promise<{ response: Response; serverBaseUrl: string; attempts: string[] }> {
  const origins = connectorBootstrapOrigins(settings)
  const attempts: string[] = []
  let lastNotFound: { response: Response; serverBaseUrl: string } | null = null
  for (const origin of origins) {
    attempts.push(origin)
    const response = await requestConnectorBootstrapAt(origin, token)
    if (response.status !== 404) return { response, serverBaseUrl: origin, attempts }
    lastNotFound = { response, serverBaseUrl: origin }
  }
  if (lastNotFound) return { ...lastNotFound, attempts }
  throw new Error('No connector API origin configured')
}

function requestConnectorBootstrapAt(serverBaseUrl: string, token: string): Promise<Response> {
  return net.fetch(`${serverBaseUrl}/api/connector/computers/bootstrap`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      serverUrl: serverBaseUrl,
      name: hostname() || 'My Computer',
    }),
  })
}

export function getConnectorDaemonState(
  settings: DesktopRuntimeSettings | null = cachedDesktopSettings,
): ConnectorDaemonState {
  if (settings) cachedDesktopSettings = settings
  const running = Boolean(daemonProcess && !daemonProcess.killed)
  const phase =
    running && (daemonPhase === 'idle' || daemonPhase === 'error') ? 'running' : daemonPhase
  return {
    running,
    pid: daemonProcess?.pid ?? null,
    startedAt,
    uptimeMs: startedAt ? Date.now() - startedAt : 0,
    serverBaseUrl: settings ? resolveDesktopServerBaseUrl(settings) : '',
    hasApiKey: Boolean(settings?.connectorApiKey),
    autoStart: settings?.connectorAutoStart ?? false,
    phase,
    progress: running && daemonProgress === 0 ? 100 : daemonProgress,
    progressMessage: daemonProgressMessage,
    connections: [...connectorConnections],
    lastExitCode,
    lastError,
    logTail: [...logTail],
    connectorPath: connectorCliPathCache,
  }
}

function broadcastConnectorState(): void {
  const state = getConnectorDaemonState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('desktop:connectorState', state)
    }
  }
}

export async function startConnectorDaemon(
  incoming: Partial<DesktopRuntimeSettings> = {},
): Promise<ConnectorDaemonState> {
  const nextSettings =
    incoming.connectorApiKey !== undefined ||
    incoming.connectorAutoStart !== undefined ||
    incoming.httpProxy !== undefined ||
    incoming.httpsProxy !== undefined ||
    incoming.connectorBuddyWorkDirs !== undefined ||
    incoming.serverBaseUrl !== undefined
      ? await saveDesktopSettingsAsync(incoming)
      : await readDesktopSettingsAsync()
  cachedDesktopSettings = nextSettings

  if (daemonProcess && !daemonProcess.killed) {
    setConnectorProgress('running', 100, 'Connector is running')
    void refreshConnectorConnections().catch(() => null)
    return getConnectorDaemonState()
  }

  let launchSettings = nextSettings
  let apiKey = normalizeConnectorApiKey(nextSettings.connectorApiKey)
  if (!apiKey) {
    lastError = null
    setConnectorProgress('authorizing', 18, 'Waiting for community authorization')
    try {
      const bootstrap = await bootstrapConnectorApiKey(nextSettings)
      apiKey = bootstrap.apiKey
      launchSettings = {
        ...nextSettings,
        connectorApiKey: apiKey,
        serverBaseUrl: bootstrap.serverBaseUrl,
      }
      cachedDesktopSettings = launchSettings
      setConnectorProgress('connecting', 48, 'Authorization complete')
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      setConnectorProgress('error', 0, 'Connector authorization failed')
      broadcastConnectorState()
      throw error
    }
  }

  const cliPath = await resolveConnectorCliPath()
  if (!cliPath) {
    lastError = 'Connector is not bundled'
    setConnectorProgress('error', 0, 'Connector is not bundled')
    throw new Error(lastError)
  }

  lastError = null
  lastExitCode = null
  logTail.length = 0
  await writeConnectorWorkDirMapAsync(launchSettings)
  setConnectorProgress('starting', 72, 'Starting local Connector')

  daemonProcess = spawn(
    await resolveElectronNodeBinaryAsync(),
    buildArgs({ ...launchSettings, connectorApiKey: apiKey }, cliPath),
    {
      env: connectorEnv(launchSettings),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  startedAt = Date.now()
  appendLog(`[desktop] connector starting on ${resolveDesktopServerBaseUrl(launchSettings)}`)

  daemonProcess.stdout?.on('data', appendLog)
  daemonProcess.stderr?.on('data', appendLog)
  daemonProcess.on('error', (error) => {
    lastError = error.message
    setConnectorProgress('error', 0, 'Connector failed')
    appendLog(`[desktop] connector error: ${error.message}`)
  })
  daemonProcess.on('exit', (code) => {
    lastExitCode = code ?? null
    appendLog(`[desktop] connector exited (${code ?? 'unknown'})`)
    daemonProcess = null
    startedAt = null
    setConnectorProgress('idle', 0, '')
    broadcastConnectorState()
  })

  setConnectorProgress('running', 100, 'Connector is running')
  void refreshConnectorConnections().catch(() => null)
  return getConnectorDaemonState()
}

export async function stopConnectorDaemon(): Promise<ConnectorDaemonState> {
  if (!daemonProcess || daemonProcess.killed) return getConnectorDaemonState()
  setConnectorProgress('stopping', 40, 'Stopping Connector')
  daemonProcess.kill('SIGTERM')
  daemonProcess = null
  startedAt = null
  setConnectorProgress('idle', 0, '')
  appendLog('[desktop] connector stopped')
  broadcastConnectorState()
  return getConnectorDaemonState()
}

async function runConnectorCliJson<T>(args: string[], timeoutMs = 60_000): Promise<T> {
  const settings = await readDesktopSettingsAsync()
  const cliPath = await resolveConnectorCliPath()
  if (!cliPath) throw new Error('Connector is not bundled')
  const nodeBinary = await resolveElectronNodeBinaryAsync()
  return new Promise((resolve, reject) => {
    execFile(
      nodeBinary,
      [cliPath, ...args],
      {
        env: connectorEnv(settings),
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }
        try {
          resolve(JSON.parse(stdout) as T)
        } catch (parseError) {
          reject(parseError instanceof Error ? parseError : new Error(String(parseError)))
        }
      },
    )
  })
}

export async function scanConnectorRuntimes(): Promise<{ output: string }> {
  const settings = await readDesktopSettingsAsync()
  const cliPath = await resolveConnectorCliPath()
  if (!cliPath) throw new Error('Connector is not bundled')
  const nodeBinary = await resolveElectronNodeBinaryAsync()
  return new Promise((resolve, reject) => {
    execFile(
      nodeBinary,
      [cliPath, 'scan', '--json', '--server-url', resolveDesktopServerBaseUrl(settings)],
      {
        env: connectorEnv(settings),
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }
        resolve({ output: stdout })
      },
    )
  })
}

function broadcastConnectorRuntimeState(result: ConnectorRuntimeScanResult): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('desktop:connectorRuntimeState', result)
    }
  }
}

export async function scanAgentRuntimes(
  options: { force?: boolean } = {},
): Promise<ConnectorRuntimeScanResult> {
  const now = Date.now()
  if (
    !options.force &&
    runtimeScanCache &&
    now - runtimeScanCache.cachedAt < RUNTIME_SCAN_CACHE_MS
  ) {
    const { cachedAt: _cachedAt, ...cachedResult } = runtimeScanCache
    return { ...cachedResult, cached: true }
  }
  if (!options.force && runtimeScanInFlight) return runtimeScanInFlight

  runtimeScanInFlight = (async () => {
    try {
      const result = await runConnectorCliJson<ConnectorRuntimeScanResult>(
        ['runtime-scan', '--sessions', '--json'],
        20_000,
      )
      runtimeScanCache = { ...result, cachedAt: Date.now() }
      broadcastConnectorRuntimeState(result)
      return result
    } catch (error) {
      const fallback = await runConnectorCliJson<{ runtimes: ConnectorRuntimeInfo[] }>(
        ['runtime-scan', '--json'],
        15_000,
      )
      const result: ConnectorRuntimeScanResult = {
        runtimes: fallback.runtimes,
        runtimeSessions: null,
      }
      runtimeScanCache = { ...result, cachedAt: Date.now() }
      broadcastConnectorRuntimeState(result)
      if (fallback.runtimes.length > 0) return result
      throw error
    } finally {
      runtimeScanInFlight = null
    }
  })()
  return runtimeScanInFlight
}

export async function scanAgentRuntimeSessions(
  options: { force?: boolean } = {},
): Promise<ConnectorRuntimeSessionScanResult> {
  const now = Date.now()
  if (
    !options.force &&
    runtimeSessionScanCache &&
    now - runtimeSessionScanCache.cachedAt < RUNTIME_SESSION_SCAN_CACHE_MS
  ) {
    const { cachedAt: _cachedAt, ...cachedResult } = runtimeSessionScanCache
    return { ...cachedResult, cached: true }
  }
  if (!options.force && runtimeSessionScanInFlight) return runtimeSessionScanInFlight

  runtimeSessionScanInFlight = (async () => {
    try {
      const runtimeSessions = await runConnectorCliJson<ConnectorRuntimeSessionSnapshot>(
        ['session-list', '--json'],
        15_000,
      )
      const result: ConnectorRuntimeSessionScanResult = {
        runtimes: runtimeScanCache?.runtimes ?? [],
        runtimeSessions,
      }
      runtimeSessionScanCache = { ...result, cachedAt: Date.now() }
      return result
    } finally {
      runtimeSessionScanInFlight = null
    }
  })()
  return runtimeSessionScanInFlight
}

export async function installAgentRuntime(
  runtimeId: string,
): Promise<{ runtimes: ConnectorRuntimeInfo[]; installed: ConnectorRuntimeInfo | null }> {
  const result = await runConnectorCliJson<{
    runtime?: ConnectorRuntimeInfo
  }>(['runtime-install', '--runtime', runtimeId, '--json'], 10 * 60_000)
  const scan = await scanAgentRuntimes({ force: true })
  return { runtimes: scan.runtimes, installed: result.runtime ?? null }
}

export function setupConnectorDaemonHandlers(): void {
  ipcMain.handle('desktop:connector:getStatus', async () => {
    await resolveConnectorCliPath()
    return getConnectorDaemonState(await readDesktopSettingsAsync())
  })
  ipcMain.handle(
    'desktop:connector:start',
    (_event, incoming: Partial<DesktopRuntimeSettings> = {}) => startConnectorDaemon(incoming),
  )
  ipcMain.handle('desktop:connector:stop', () => stopConnectorDaemon())
  ipcMain.handle('desktop:connector:scan', () => scanConnectorRuntimes())
  ipcMain.handle('desktop:connector:scanRuntimes', (_event, input: { force?: boolean } = {}) =>
    scanAgentRuntimes({ force: input.force === true }),
  )
  ipcMain.handle(
    'desktop:connector:scanRuntimeSessions',
    (_event, input: { force?: boolean } = {}) =>
      scanAgentRuntimeSessions({ force: input.force === true }),
  )
  ipcMain.handle('desktop:connector:installRuntime', (_event, input: { runtimeId?: string }) => {
    const runtimeId = typeof input?.runtimeId === 'string' ? input.runtimeId.trim() : ''
    if (!runtimeId) throw new Error('Missing runtime id')
    return installAgentRuntime(runtimeId)
  })
  ipcMain.handle('desktop:connector:createBuddy', (_event, input: CreateConnectorBuddyInput) =>
    createConnectorBuddy(input),
  )
  ipcMain.handle('desktop:connector:getConnections', () => refreshConnectorConnections())
  ipcMain.handle(
    'desktop:connector:setConnectionEnabled',
    (_event, input: { agentId: string; enabled: boolean }) =>
      setConnectorConnectionEnabled(input.agentId, input.enabled),
  )
  ipcMain.handle(
    'desktop:connector:deleteConnection',
    (_event, input: { agentId: string; deleteCloudBuddy?: boolean }) =>
      deleteConnectorConnection(input),
  )
  ipcMain.handle(
    'desktop:connector:setConnectionWorkDir',
    (_event, input: { agentId: string; workDir?: string }) =>
      setConnectorConnectionWorkDir(input.agentId, input.workDir ?? ''),
  )
}

export function startConnectorDaemonIfEnabled(): void {
  readDesktopSettingsAsync()
    .then((settings) => {
      cachedDesktopSettings = settings
      if (!settings.connectorAutoStart || !settings.connectorApiKey) return
      return startConnectorDaemon()
    })
    .catch((error) => {
      lastError = error instanceof Error ? error.message : String(error)
      broadcastConnectorState()
    })
}

app.on('before-quit', () => {
  if (daemonProcess && !daemonProcess.killed) daemonProcess.kill('SIGTERM')
})
