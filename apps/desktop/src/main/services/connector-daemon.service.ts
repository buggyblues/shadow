import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { hostname } from 'node:os'
import { delimiter, join } from 'node:path'
import type {
  RuntimeSessionPetActivity,
  RuntimeSessionPetReaction,
  RuntimeSessionState,
} from '@shadowob/shared/types'
import { app, BrowserWindow, net } from 'electron'
import { DESKTOP_COMMUNITY_AUTH_REQUIRED } from '../../shared/community-auth'
import { type CommunitySessionService, communitySessionService } from './community-session.service'
import { type DesktopRuntimeSettings, desktopSettingsService } from './desktop-settings.service'
import { loggerService } from './logger.service'
import { processManagerService } from './process-manager.service'
import { windowService } from './window.service'

export type ConnectorDaemonState = {
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

export type ConnectorDaemonPhase =
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

export type ConnectorRuntimeSessionState = RuntimeSessionState

export type ConnectorRuntimeSessionPetReaction = RuntimeSessionPetReaction

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
  petReaction?: ConnectorRuntimeSessionPetReaction
  petActivity?: RuntimeSessionPetActivity
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

export type CreateConnectorBuddyInput = {
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
let activeDaemonApiKey = ''
let daemonAuthRejected = false
let daemonAuthRetryAttempts = 0
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
let loggedConnectorCliPathKey: string | null = null

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
      logConnectorCliPathResolution(candidate, candidates)
      return candidate
    }
  }
  connectorCliPathCache = null
  logConnectorCliPathResolution(null, candidates)
  return null
}

function appendLog(chunk: Buffer | string): void {
  const text = chunk.toString()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = redactConnectorLogText(line.trim())
    if (!trimmed) continue
    if (/^\[daemon\] heartbeat sent \(\d+\/\d+ runtimes available\)$/.test(trimmed)) {
      continue
    }
    if (isConnectorDaemonAuthError(trimmed)) {
      daemonAuthRejected = true
      loggerService.write('warn', 'connector.daemon', 'connector daemon authorization rejected', {
        hasActiveApiKey: Boolean(activeDaemonApiKey),
        retryAttempts: daemonAuthRetryAttempts,
      })
    }
    logTail.push(trimmed)
    loggerService.write('info', 'connector.daemon', trimmed)
  }
  while (logTail.length > 80) logTail.shift()
  broadcastConnectorState()
}

function logConnectorCliPathResolution(path: string | null, candidates: string[]): void {
  const key = path ?? 'missing'
  if (loggedConnectorCliPathKey === key) return
  loggedConnectorCliPathKey = key
  if (path) {
    loggerService.write('info', 'connector.daemon', 'resolved connector cli', {
      path,
    })
    return
  }
  loggerService.write('error', 'connector.daemon', 'connector cli missing', {
    candidates,
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
  })
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
  const managedPaths = connectorManagedPathEntries(connectorHome, managedNodeVersion)
  const pathValue = dedupePathEntries([
    ...managedPaths,
    ...splitPathEntries(process.env.PATH ?? process.env.Path),
  ]).join(delimiter)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1',
    NPM_CONFIG_PREFIX: join(connectorHome, 'node-global'),
    npm_config_prefix: join(connectorHome, 'node-global'),
    SHADOW_CONNECTOR_HOME: connectorHome,
    SHADOW_CONNECTOR_USE_MANAGED_NODE: '1',
    PATH: pathValue,
  }
  if (process.platform === 'win32') {
    env.Path = pathValue
    env.PATHEXT = env.PATHEXT || '.COM;.EXE;.BAT;.CMD'
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

function connectorManagedPathEntries(connectorHome: string, managedNodeVersion: string): string[] {
  const managedNodeRoot = join(connectorHome, 'node', `v${managedNodeVersion}`)
  const nodeGlobalRoot = join(connectorHome, 'node-global')
  if (process.platform === 'win32') {
    return [nodeGlobalRoot, managedNodeRoot]
  }
  return [
    join(app.getPath('home'), '.local', 'bin'),
    join(nodeGlobalRoot, 'bin'),
    join(managedNodeRoot, 'bin'),
  ]
}

function splitPathEntries(value: string | undefined): string[] {
  return (value ?? '').split(delimiter).filter(Boolean)
}

function dedupePathEntries(entries: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of entries) {
    const item = raw.trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function connectorArgsForLog(args: string[]): string[] {
  const redacted = [...args]
  const apiKeyIndex = redacted.indexOf('--api-key')
  if (apiKeyIndex >= 0 && redacted[apiKeyIndex + 1]) redacted[apiKeyIndex + 1] = '[redacted]'
  return redacted
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function redactConnectorLogText(text: string): string {
  return text
    .replace(/(--api-key\s+)(\S+)/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token)=)([^\s&]+)/gi, '$1[redacted]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token)["']?\s*:\s*["']?)([^"',}\s]+)/gi,
      '$1[redacted]',
    )
    .replace(/(Authorization:\s*Bearer\s+)(\S+)/gi, '$1[redacted]')
}

function buildArgs(settings: DesktopRuntimeSettings, cliPath: string): string[] {
  const args = [
    cliPath,
    'daemon',
    '--server-url',
    desktopSettingsService.resolveDesktopServerBaseUrl(settings),
    '--api-key',
    settings.connectorApiKey,
    '--poll-interval-ms',
    '5000',
    '--work-dir-map-file',
    desktopSettingsService.connectorWorkDirMapFilePath(),
  ]
  return args
}

function isConnectorDaemonAuthError(text: string): boolean {
  return (
    /Daemon API .* failed \((401|403)\)/.test(text) || /"error"\s*:\s*"Unauthorized"/.test(text)
  )
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
  const origin = normalizeHttpOrigin(desktopSettingsService.resolveDesktopServerBaseUrl(settings))
  return origin ? [origin] : []
}

async function fetchCommunityJson<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const response = await communitySessionService
    .fetchWithAuth(path, options)
    .catch((error: unknown) => {
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

function isLocalConnectorComputer(
  computer: ConnectorComputerView | undefined,
  settings: DesktopRuntimeSettings,
): boolean {
  if (!computer) return false
  if (settings.connectorComputerId && computer.id === settings.connectorComputerId) return true
  const localHostname = hostname()
  return Boolean(localHostname && computer.hostname === localHostname)
}

async function refreshConnectorConnections(): Promise<ConnectorConnection[]> {
  const settings = await desktopSettingsService.getSettings()
  const localWorkDirs = settings.connectorBuddyWorkDirs
  const locallyDeleted = new Set(settings.connectorDeletedConnectionIds)
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
      if (!isLocalConnectorComputer(computer, settings)) return null
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
    .filter((connection) => !locallyDeleted.has(connection.agentId))
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
  const settings = await desktopSettingsService.getSettings()
  const computerData = await fetchCommunityJson<{ computers: ConnectorComputerView[] }>(
    '/api/connector/computers',
  )
  if (!computerData) return null
  return (
    computerData.computers
      .filter((computer) => isLocalConnectorComputer(computer, settings))
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

function isCommunityRouteNotFound(error: unknown): boolean {
  return error instanceof Error && /\bfailed \(404\)\b/.test(error.message)
}

async function removeLocalConnectorRuntimeConfig(connection: ConnectorConnection): Promise<void> {
  const projectName = connection.username?.trim() || connection.label.trim()
  if (!projectName) throw new Error('Missing local Connector project name')
  await runConnectorCliJson<{ ok: boolean }>(
    ['remove-buddy', '--runtime', connection.runtimeId, '--project-name', projectName, '--json'],
    30_000,
  )
}

async function rememberDeletedConnectorConnection(agentId: string): Promise<void> {
  const settings = await desktopSettingsService.getSettings()
  if (settings.connectorDeletedConnectionIds.includes(agentId)) return
  await desktopSettingsService.setSettings({
    connectorDeletedConnectionIds: [...settings.connectorDeletedConnectionIds, agentId],
  })
}

async function forgetDeletedConnectorConnection(agentId: string): Promise<void> {
  const settings = await desktopSettingsService.getSettings()
  if (!settings.connectorDeletedConnectionIds.includes(agentId)) return
  await desktopSettingsService.setSettings({
    connectorDeletedConnectionIds: settings.connectorDeletedConnectionIds.filter(
      (item) => item !== agentId,
    ),
  })
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

async function createConnectorBuddy(input: CreateConnectorBuddyInput): Promise<{
  connections: ConnectorConnection[]
  agent: CommunityAgentView | null
  connectionError?: string | null
}> {
  const settings = await desktopSettingsService.getSettings()
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
      serverUrl: desktopSettingsService.resolveDesktopServerBaseUrl(settings),
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
  if (agentId) await forgetDeletedConnectorConnection(agentId)
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

async function setConnectorConnectionEnabled(
  agentId: string,
  enabled: boolean,
): Promise<ConnectorConnection[]> {
  const normalizedAgentId = typeof agentId === 'string' ? agentId.trim() : ''
  if (!normalizedAgentId) throw new Error('Missing Buddy id')
  if (enabled) {
    await forgetDeletedConnectorConnection(normalizedAgentId)
    if (!daemonProcess || daemonProcess.killed) {
      throw new Error('Connector is not running. Start the Connector before connecting this Buddy.')
    }
    const settings = await desktopSettingsService.getSettings()
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
          serverUrl: desktopSettingsService.resolveDesktopServerBaseUrl(settings),
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

async function reconnectRunningConnectorConnections(): Promise<void> {
  await delay(1500)
  const connections = await refreshConnectorConnections()
  for (const connection of connections.filter((item) => item.status === 'running')) {
    try {
      appendLog(`[desktop] reconnecting ${connection.label} on ${connection.runtimeLabel}`)
      await setConnectorConnectionEnabled(connection.agentId, true)
    } catch (error) {
      appendLog(
        `[desktop] reconnect failed for ${connection.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}

async function deleteConnectorConnection(input: {
  agentId: string
  deleteCloudBuddy?: boolean
}): Promise<ConnectorConnection[]> {
  const normalizedAgentId = typeof input?.agentId === 'string' ? input.agentId.trim() : ''
  if (!normalizedAgentId) throw new Error('Missing Buddy id')
  const deleteCloudBuddy = input.deleteCloudBuddy === true

  const settings = await desktopSettingsService.getSettings()
  const connections = await refreshConnectorConnections()
  const connection = connections.find((item) => item.agentId === normalizedAgentId)
  if (!connection) {
    throw new Error('This Buddy is not bound to a local Connector runtime yet.')
  }

  try {
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
  } catch (error) {
    if (!isCommunityRouteNotFound(error)) throw error
    appendLog(
      '[desktop] server does not support connector delete route yet; removing local runtime config directly',
    )
    await removeLocalConnectorRuntimeConfig(connection)
    if (deleteCloudBuddy) {
      await fetchCommunityJson(`/api/agents/${encodeURIComponent(normalizedAgentId)}`, {
        method: 'DELETE',
      })
    } else {
      await fetchCommunityJson(`/api/agents/${encodeURIComponent(normalizedAgentId)}/stop`, {
        method: 'POST',
      }).catch(() => null)
      await rememberDeletedConnectorConnection(normalizedAgentId)
    }
  }

  const connectorBuddyWorkDirs = { ...settings.connectorBuddyWorkDirs }
  delete connectorBuddyWorkDirs[normalizedAgentId]
  await desktopSettingsService.setSettings({ connectorBuddyWorkDirs })
  connectorConnections = connectorConnections.filter((item) => item.agentId !== normalizedAgentId)
  broadcastConnectorState()
  void reconnectRunningConnectorConnections().catch((error) => {
    appendLog(`[desktop] reconnect pass failed: ${error instanceof Error ? error.message : error}`)
  })
  return refreshConnectorConnections()
}

async function setConnectorConnectionWorkDir(
  agentId: string,
  workDir: string,
): Promise<ConnectorConnection[]> {
  const normalizedWorkDir = typeof workDir === 'string' ? workDir.trim() : ''
  const settings = await desktopSettingsService.getSettings()
  const connectorBuddyWorkDirs = { ...settings.connectorBuddyWorkDirs }
  if (normalizedWorkDir) {
    connectorBuddyWorkDirs[agentId] = normalizedWorkDir
  } else {
    delete connectorBuddyWorkDirs[agentId]
  }
  await desktopSettingsService.setSettings({ connectorBuddyWorkDirs })
  connectorConnections = connectorConnections.map((connection) =>
    connection.agentId === agentId ? { ...connection, workDir: normalizedWorkDir } : connection,
  )
  broadcastConnectorState()
  return connectorConnections
}

async function waitForCommunityAccessToken(): Promise<string> {
  return communitySessionService.requestInteractiveAuth({
    timeoutMs: AUTH_TIMEOUT_MS,
    redirect: '/discover',
  })
}

async function bootstrapConnectorApiKey(
  settings: DesktopRuntimeSettings,
): Promise<{ apiKey: string; serverBaseUrl: string }> {
  let token = await waitForCommunityAccessToken()
  let bootstrap = await requestConnectorBootstrap(settings, token)
  if (bootstrap.response.status === 401 || bootstrap.response.status === 403) {
    const refreshedToken = await communitySessionService.refreshAccessToken()
    if (refreshedToken) {
      token = refreshedToken
      bootstrap = await requestConnectorBootstrap(settings, refreshedToken)
    }
  }
  if (bootstrap.response.status === 401 || bootstrap.response.status === 403) {
    const deadline = Date.now() + AUTH_TIMEOUT_MS
    void communitySessionService
      .requestInteractiveAuth({
        timeoutMs: AUTH_TIMEOUT_MS,
        redirect: '/discover',
      })
      .catch(() => '')
    while (!bootstrap.response.ok && Date.now() < deadline) {
      await delay(AUTH_POLL_INTERVAL_MS)
      const nextToken = await communitySessionService.readAccessToken()
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
  const result = (await bootstrap.response.json()) as {
    apiKey?: unknown
    computer?: { id?: unknown } | null
  }
  const apiKey = desktopSettingsService.normalizeConnectorApiKey(result.apiKey)
  if (!apiKey) throw new Error('Connector authorization did not return a machine key')
  const connectorComputerId = typeof result.computer?.id === 'string' ? result.computer.id : ''
  await desktopSettingsService.setSettings({
    connectorApiKey: apiKey,
    ...(connectorComputerId ? { connectorComputerId } : {}),
  })
  windowService.getConnectorAuthWindow()?.close()
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

function getConnectorDaemonState(
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
    serverBaseUrl: settings ? desktopSettingsService.resolveDesktopServerBaseUrl(settings) : '',
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

async function startConnectorDaemon(
  incoming: Partial<DesktopRuntimeSettings> = {},
): Promise<ConnectorDaemonState> {
  const nextSettings =
    incoming.connectorApiKey !== undefined ||
    incoming.connectorAutoStart !== undefined ||
    incoming.httpProxy !== undefined ||
    incoming.httpsProxy !== undefined ||
    incoming.connectorBuddyWorkDirs !== undefined ||
    incoming.serverBaseUrl !== undefined
      ? await desktopSettingsService.setSettings(incoming)
      : await desktopSettingsService.getSettings()
  cachedDesktopSettings = nextSettings

  if (daemonProcess && !daemonProcess.killed) {
    setConnectorProgress('running', 100, 'Connector is running')
    void refreshConnectorConnections().catch(() => null)
    void reconnectRunningConnectorConnections().catch((error) => {
      appendLog(
        `[desktop] reconnect pass failed: ${error instanceof Error ? error.message : error}`,
      )
    })
    return getConnectorDaemonState()
  }

  let launchSettings = nextSettings
  let apiKey = desktopSettingsService.normalizeConnectorApiKey(nextSettings.connectorApiKey)
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
    loggerService.write('error', 'connector.daemon', lastError)
    throw new Error(lastError)
  }

  lastError = null
  lastExitCode = null
  daemonAuthRejected = false
  activeDaemonApiKey = apiKey
  logTail.length = 0
  await desktopSettingsService.writeConnectorWorkDirMapAsync(launchSettings)
  setConnectorProgress('starting', 72, 'Starting local Connector')

  const nodeBinary = await processManagerService.resolveElectronNodeBinary()
  const args = buildArgs({ ...launchSettings, connectorApiKey: apiKey }, cliPath)
  const env = connectorEnv(launchSettings)
  loggerService.write('info', 'connector.daemon', 'starting connector process', {
    nodeBinary,
    args: connectorArgsForLog(args),
    serverBaseUrl: desktopSettingsService.resolveDesktopServerBaseUrl(launchSettings),
    connectorHome: env.SHADOW_CONNECTOR_HOME,
    pathKey: process.platform === 'win32' ? 'Path' : 'PATH',
    pathPreview: (process.platform === 'win32' ? env.Path : env.PATH)?.split(delimiter).slice(0, 6),
  })

  daemonProcess = spawn(nodeBinary, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  startedAt = Date.now()
  appendLog(
    `[desktop] connector starting on ${desktopSettingsService.resolveDesktopServerBaseUrl(
      launchSettings,
    )}`,
  )

  daemonProcess.stdout?.on('data', appendLog)
  daemonProcess.stderr?.on('data', appendLog)
  daemonProcess.on('error', (error) => {
    lastError = error.message
    setConnectorProgress('error', 0, 'Connector failed')
    appendLog(`[desktop] connector error: ${error.message}`)
    loggerService.write('error', 'connector.daemon', 'connector process error', error)
  })
  daemonProcess.on('exit', (code) => {
    lastExitCode = code ?? null
    appendLog(`[desktop] connector exited (${code ?? 'unknown'})`)
    loggerService.write('warn', 'connector.daemon', 'connector process exited', {
      code: code ?? null,
    })
    daemonProcess = null
    startedAt = null
    setConnectorProgress('idle', 0, '')
    broadcastConnectorState()
    if (daemonAuthRejected && activeDaemonApiKey) {
      if (daemonAuthRetryAttempts < 1) {
        const rejectedApiKey = activeDaemonApiKey
        activeDaemonApiKey = ''
        daemonAuthRetryAttempts += 1
        loggerService.write(
          'warn',
          'connector.daemon',
          'connector machine key rejected; clearing key and reauthorizing',
          {
            code: code ?? null,
            retryAttempts: daemonAuthRetryAttempts,
            hadRejectedApiKey: Boolean(rejectedApiKey),
          },
        )
        void desktopSettingsService
          .setSettings({ connectorApiKey: '' })
          .then(() => startConnectorDaemon({ connectorApiKey: '' }))
          .catch((error) => {
            lastError = errorMessage(error)
            appendLog(`[desktop] connector reauthorization failed: ${lastError}`)
            loggerService.write('error', 'connector.daemon', 'connector reauthorization failed', {
              error: lastError,
              hadRejectedApiKey: Boolean(rejectedApiKey),
            })
            setConnectorProgress('error', 0, 'Connector authorization failed')
            broadcastConnectorState()
          })
      } else {
        activeDaemonApiKey = ''
        lastError = 'Connector machine key was rejected'
        loggerService.write(
          'error',
          'connector.daemon',
          'connector machine key rejected after retry',
          {
            code: code ?? null,
            retryAttempts: daemonAuthRetryAttempts,
          },
        )
        setConnectorProgress('error', 0, 'Connector authorization failed')
        broadcastConnectorState()
      }
    }
  })

  setConnectorProgress('running', 100, 'Connector is running')
  void refreshConnectorConnections().catch(() => null)
  void reconnectRunningConnectorConnections().catch((error) => {
    appendLog(`[desktop] reconnect pass failed: ${error instanceof Error ? error.message : error}`)
  })
  return getConnectorDaemonState()
}

async function stopConnectorDaemon(): Promise<ConnectorDaemonState> {
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
  const settings = await desktopSettingsService.getSettings()
  const cliPath = await resolveConnectorCliPath()
  if (!cliPath) throw new Error('Connector is not bundled')
  const nodeBinary = await processManagerService.resolveElectronNodeBinary()
  loggerService.write('debug', 'connector.cli', 'running connector cli json command', {
    nodeBinary,
    args: connectorArgsForLog([cliPath, ...args]),
    timeoutMs,
  })
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
          loggerService.write('error', 'connector.cli', 'connector cli command failed', {
            args: connectorArgsForLog([cliPath, ...args]),
            stderr: stderr.trim(),
            error: error.message,
          })
          reject(new Error(stderr.trim() || error.message))
          return
        }
        try {
          resolve(JSON.parse(stdout) as T)
        } catch (parseError) {
          loggerService.write('error', 'connector.cli', 'connector cli json parse failed', {
            args: connectorArgsForLog([cliPath, ...args]),
            stdoutPreview: stdout.slice(0, 1000),
            stderr: stderr.trim(),
            error: errorMessage(parseError),
          })
          reject(parseError instanceof Error ? parseError : new Error(String(parseError)))
        }
      },
    )
  })
}

async function scanConnectorRuntimes(): Promise<{ output: string }> {
  const settings = await desktopSettingsService.getSettings()
  const cliPath = await resolveConnectorCliPath()
  if (!cliPath) throw new Error('Connector is not bundled')
  const nodeBinary = await processManagerService.resolveElectronNodeBinary()
  loggerService.write('info', 'connector.scan', 'running connector scan command', {
    nodeBinary,
    args: connectorArgsForLog([
      cliPath,
      'scan',
      '--json',
      '--server-url',
      desktopSettingsService.resolveDesktopServerBaseUrl(settings),
    ]),
  })
  return new Promise((resolve, reject) => {
    execFile(
      nodeBinary,
      [
        cliPath,
        'scan',
        '--json',
        '--server-url',
        desktopSettingsService.resolveDesktopServerBaseUrl(settings),
      ],
      {
        env: connectorEnv(settings),
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          lastError = stderr.trim() || error.message
          appendLog(`[desktop] connector scan failed: ${lastError}`)
          loggerService.write('error', 'connector.scan', 'connector scan failed', {
            stderr: stderr.trim(),
            error: error.message,
          })
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

async function scanAgentRuntimes(
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
      lastError = `Runtime scan failed: ${errorMessage(error)}`
      appendLog(`[desktop] ${lastError}`)
      loggerService.write('warn', 'connector.scan', 'runtime scan with sessions failed', {
        error: errorMessage(error),
      })
      try {
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
      } catch (fallbackError) {
        lastError = `Runtime scan fallback failed: ${errorMessage(fallbackError)}`
        appendLog(`[desktop] ${lastError}`)
        loggerService.write('error', 'connector.scan', 'runtime scan fallback failed', {
          error: errorMessage(fallbackError),
          originalError: errorMessage(error),
        })
        broadcastConnectorState()
        throw fallbackError
      }
    } finally {
      runtimeScanInFlight = null
    }
  })()
  return runtimeScanInFlight
}

async function scanAgentRuntimeSessions(
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
    } catch (error) {
      lastError = `Runtime session scan failed: ${errorMessage(error)}`
      appendLog(`[desktop] ${lastError}`)
      loggerService.write('error', 'connector.scan', 'runtime session scan failed', {
        error: errorMessage(error),
      })
      broadcastConnectorState()
      throw error
    } finally {
      runtimeSessionScanInFlight = null
    }
  })()
  return runtimeSessionScanInFlight
}

async function installAgentRuntime(
  runtimeId: string,
): Promise<ConnectorRuntimeScanResult & { installed: ConnectorRuntimeInfo | null }> {
  loggerService.write('info', 'connector.runtime', 'installing connector runtime', { runtimeId })
  const result = await runConnectorCliJson<{
    ok?: boolean
    runtime?: ConnectorRuntimeInfo
  }>(['runtime-install', '--runtime', runtimeId, '--json'], 10 * 60_000)
  const scan = await scanAgentRuntimes({ force: true })
  const scannedRuntime = scan.runtimes.find((item) => item.id === runtimeId) ?? null
  if (scannedRuntime?.status === 'available') {
    return { ...scan, installed: scannedRuntime }
  }
  if (result.ok === false || result.runtime?.status === 'missing') {
    throw new Error(
      `${result.runtime?.label ?? runtimeId} install command completed, but the runtime command was not found on PATH.`,
    )
  }
  return { ...scan, installed: result.runtime ?? null }
}

function startConnectorDaemonIfEnabled(): void {
  desktopSettingsService
    .getSettings()
    .then((settings) => {
      cachedDesktopSettings = settings
      if (!settings.connectorAutoStart || !settings.connectorApiKey) return
      return startConnectorDaemon()
    })
    .catch((error) => {
      lastError = error instanceof Error ? error.message : String(error)
      appendLog(`[desktop] connector auto-start failed: ${lastError}`)
      loggerService.write('error', 'connector.daemon', 'connector auto-start failed', {
        error: lastError,
      })
      broadcastConnectorState()
    })
}

app.on('before-quit', () => {
  if (daemonProcess && !daemonProcess.killed) daemonProcess.kill('SIGTERM')
})

export class ConnectorDaemonService {
  resolveCliPath(): Promise<string | null> {
    return resolveConnectorCliPath()
  }

  refreshConnections(): Promise<ConnectorConnection[]> {
    return refreshConnectorConnections()
  }

  createBuddy(input: CreateConnectorBuddyInput): Promise<{
    connections: ConnectorConnection[]
    agent: CommunityAgentView | null
    connectionError?: string | null
  }> {
    return createConnectorBuddy(input)
  }

  setConnectionEnabled(agentId: string, enabled: boolean): Promise<ConnectorConnection[]> {
    return setConnectorConnectionEnabled(agentId, enabled)
  }

  deleteConnection(input: {
    agentId: string
    deleteCloudBuddy?: boolean
  }): Promise<ConnectorConnection[]> {
    return deleteConnectorConnection(input)
  }

  setConnectionWorkDir(agentId: string, workDir: string): Promise<ConnectorConnection[]> {
    return setConnectorConnectionWorkDir(agentId, workDir)
  }

  getState(settings: DesktopRuntimeSettings | null = cachedDesktopSettings): ConnectorDaemonState {
    return getConnectorDaemonState(settings)
  }

  start(incoming: Partial<DesktopRuntimeSettings> = {}): Promise<ConnectorDaemonState> {
    return startConnectorDaemon(incoming)
  }

  stop(): Promise<ConnectorDaemonState> {
    return stopConnectorDaemon()
  }

  scanConnectorRuntimes(): Promise<{ output: string }> {
    return scanConnectorRuntimes()
  }

  scanAgentRuntimes(options: { force?: boolean } = {}): Promise<ConnectorRuntimeScanResult> {
    return scanAgentRuntimes(options)
  }

  scanAgentRuntimeSessions(
    options: { force?: boolean } = {},
  ): Promise<ConnectorRuntimeSessionScanResult> {
    return scanAgentRuntimeSessions(options)
  }

  installAgentRuntime(
    runtimeId: string,
  ): Promise<ConnectorRuntimeScanResult & { installed: ConnectorRuntimeInfo | null }> {
    return installAgentRuntime(runtimeId)
  }

  startIfEnabled(): void {
    startConnectorDaemonIfEnabled()
  }

  fetchCommunityUrlWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    return communitySessionService.fetchUrlWithAuth(url, options)
  }

  fetchCommunityWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
    return communitySessionService.fetchWithAuth(path, options)
  }

  forgetCommunityAccessToken(token?: string | null): void {
    communitySessionService.forgetAccessToken(token)
  }

  forgetCommunityAuthTokens(token?: string | null): void {
    communitySessionService.forgetAuthTokens(token)
  }

  readCommunityAccessToken(): Promise<string> {
    return communitySessionService.readAccessToken()
  }

  rememberCommunityAuthSnapshot(
    tokens: Parameters<CommunitySessionService['rememberAuthSnapshot']>[0],
    options?: Parameters<CommunitySessionService['rememberAuthSnapshot']>[1],
  ): void {
    communitySessionService.rememberAuthSnapshot(tokens, options)
  }
}

export const connectorDaemonService = new ConnectorDaemonService()
