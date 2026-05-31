import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { hostname } from 'node:os'
import { delimiter, join } from 'node:path'
import { app, BrowserWindow, ipcMain, net } from 'electron'
import {
  COMMUNITY_AUTH_TOKENS_FROM_STORAGE_SCRIPT,
  type CommunityAuthTokens,
  communityAccessTokenFromAuthorizationHeader,
  DESKTOP_COMMUNITY_AUTH_REQUIRED,
  normalizeCommunityAccessToken,
} from '../shared/community-auth'
import {
  connectorWorkDirMapFilePath,
  type DesktopRuntimeSettings,
  normalizeConnectorApiKey,
  readDesktopSettings,
  saveDesktopSettings,
  writeConnectorWorkDirMap,
} from './desktop-settings'
import { resolveElectronNodeBinary } from './process-manager'
import { getConnectorAuthWindow, getMainWindow, showConnectorAuthWindow } from './window'

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

type ConnectorComputerView = {
  id: string
  name: string
  hostname: string | null
  os: string | null
  arch: string | null
  runtimes: Array<{ id: string; label: string; status: string }>
}

type CommunityAgentView = {
  id: string
  status: 'running' | 'stopped' | 'error'
  config?: Record<string, unknown> | null
  botUser?: {
    username?: string | null
    displayName?: string | null
  } | null
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
const HOSTED_COMMUNITY_ORIGIN = 'https://shadowob.com'
let lastCommunityAccessToken = ''
let lastCommunityRefreshToken = ''
let communityTokenRefreshPromise: Promise<string> | null = null

function connectorRoot(): string {
  const packagedRoot = process.resourcesPath
  if (existsSync(join(packagedRoot, 'dist/cli.js'))) return packagedRoot
  const resourceRoot = join(process.resourcesPath, 'connector')
  if (existsSync(join(resourceRoot, 'dist/cli.js'))) return resourceRoot
  const workspaceRoot = join(__dirname, '../../../../packages/connector')
  if (existsSync(join(workspaceRoot, 'dist/cli.js'))) return workspaceRoot
  return resourceRoot
}

function connectorCliPath(): string {
  return join(connectorRoot(), 'dist/cli.js')
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

function connectorEnv(settings = readDesktopSettings()): NodeJS.ProcessEnv {
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

function buildArgs(settings: DesktopRuntimeSettings): string[] {
  const args = [
    connectorCliPath(),
    'daemon',
    '--server-url',
    settings.serverBaseUrl,
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
  return Array.from(
    new Set(
      [
        settings.serverBaseUrl,
        process.env.DESKTOP_API_ORIGIN,
        process.env.VITE_API_BASE,
        HOSTED_COMMUNITY_ORIGIN,
      ]
        .map(normalizeHttpOrigin)
        .filter((origin): origin is string => Boolean(origin)),
    ),
  )
}

function normalizeCommunityAuthTokens(tokens: unknown): CommunityAuthTokens {
  const record = tokens && typeof tokens === 'object' ? (tokens as Record<string, unknown>) : {}
  return {
    accessToken: normalizeCommunityAccessToken(record.accessToken),
    refreshToken: normalizeCommunityAccessToken(record.refreshToken),
  }
}

function rememberCommunityAuthTokens(tokens: Partial<CommunityAuthTokens>): void {
  const accessToken = normalizeCommunityAccessToken(tokens.accessToken)
  const refreshToken = normalizeCommunityAccessToken(tokens.refreshToken)
  if (accessToken) lastCommunityAccessToken = accessToken
  if (refreshToken) lastCommunityRefreshToken = refreshToken
}

async function readAuthTokensFromWindow(win: BrowserWindow | null): Promise<CommunityAuthTokens> {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isLoading()) {
    return { accessToken: '', refreshToken: '' }
  }
  try {
    const tokens = (await win.webContents.executeJavaScript(
      COMMUNITY_AUTH_TOKENS_FROM_STORAGE_SCRIPT,
      true,
    )) as unknown
    const normalizedTokens = normalizeCommunityAuthTokens(tokens)
    rememberCommunityAuthTokens(normalizedTokens)
    return normalizedTokens
  } catch {
    return { accessToken: '', refreshToken: '' }
  }
}

async function readAuthTokensFromOpenWindows(): Promise<CommunityAuthTokens> {
  let refreshToken = ''
  for (const win of BrowserWindow.getAllWindows()) {
    const tokens = await readAuthTokensFromWindow(win)
    if (tokens.accessToken) return tokens
    refreshToken ||= tokens.refreshToken
  }
  return { accessToken: '', refreshToken }
}

export function rememberCommunityAccessToken(token: string | null | undefined): void {
  const normalizedToken = normalizeCommunityAccessToken(token)
  if (normalizedToken) lastCommunityAccessToken = normalizedToken
}

export function rememberCommunityAuthSnapshot(tokens: Partial<CommunityAuthTokens>): void {
  rememberCommunityAuthTokens(tokens)
}

export function rememberCommunityAuthorizationHeader(header: string | null | undefined): void {
  rememberCommunityAccessToken(communityAccessTokenFromAuthorizationHeader(header))
}

export function forgetCommunityAccessToken(token?: string | null): void {
  const normalizedToken = normalizeCommunityAccessToken(token)
  if (!normalizedToken || normalizedToken === lastCommunityAccessToken) {
    lastCommunityAccessToken = ''
  }
}

export function forgetCommunityAuthTokens(token?: string | null): void {
  forgetCommunityAccessToken(token)
  if (!token || !lastCommunityAccessToken) lastCommunityRefreshToken = ''
}

export async function readCommunityAuthTokens(): Promise<CommunityAuthTokens> {
  const mainTokens = await readAuthTokensFromWindow(getMainWindow())
  if (mainTokens.accessToken) {
    return {
      accessToken: mainTokens.accessToken,
      refreshToken: mainTokens.refreshToken || lastCommunityRefreshToken,
    }
  }

  const authWindowTokens = await readAuthTokensFromWindow(getConnectorAuthWindow())
  if (authWindowTokens.accessToken) {
    return {
      accessToken: authWindowTokens.accessToken,
      refreshToken: authWindowTokens.refreshToken || lastCommunityRefreshToken,
    }
  }

  const openWindowTokens = await readAuthTokensFromOpenWindows()
  if (openWindowTokens.accessToken) {
    return {
      accessToken: openWindowTokens.accessToken,
      refreshToken: openWindowTokens.refreshToken || lastCommunityRefreshToken,
    }
  }

  return {
    accessToken: lastCommunityAccessToken,
    refreshToken:
      mainTokens.refreshToken ||
      authWindowTokens.refreshToken ||
      openWindowTokens.refreshToken ||
      lastCommunityRefreshToken,
  }
}

export async function readCommunityAccessToken(): Promise<string> {
  return (await readCommunityAuthTokens()).accessToken
}

function communityApiUrl(settings: DesktopRuntimeSettings, path: string): string {
  const origin = normalizeHttpOrigin(settings.serverBaseUrl) ?? HOSTED_COMMUNITY_ORIGIN
  return `${origin}${path}`
}

function shouldWriteCommunityAuthToWindow(win: BrowserWindow): boolean {
  try {
    const url = new URL(win.webContents.getURL())
    return url.protocol === 'app:' || url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function writeCommunityAuthTokensToWindow(
  win: BrowserWindow,
  tokens: Partial<CommunityAuthTokens>,
): Promise<void> {
  if (
    win.isDestroyed() ||
    win.webContents.isDestroyed() ||
    win.webContents.isLoading() ||
    !shouldWriteCommunityAuthToWindow(win)
  ) {
    return
  }
  const accessToken = normalizeCommunityAccessToken(tokens.accessToken)
  const refreshToken = normalizeCommunityAccessToken(tokens.refreshToken)
  const script = `(() => {
    try {
      const accessToken = ${JSON.stringify(accessToken)}
      const refreshToken = ${JSON.stringify(refreshToken)}
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      else localStorage.removeItem('accessToken')
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      else localStorage.removeItem('refreshToken')
    } catch {}
  })()`
  await win.webContents.executeJavaScript(script, true).catch(() => undefined)
}

async function writeCommunityAuthTokensToOpenWindows(
  tokens: Partial<CommunityAuthTokens>,
): Promise<void> {
  await Promise.all(
    BrowserWindow.getAllWindows().map((win) => writeCommunityAuthTokensToWindow(win, tokens)),
  )
}

async function refreshCommunityAccessTokenOnce(): Promise<string> {
  const tokens = await readCommunityAuthTokens()
  if (!tokens.refreshToken) return ''

  const response = await net.fetch(communityApiUrl(readDesktopSettings(), '/api/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      forgetCommunityAuthTokens()
      await writeCommunityAuthTokensToOpenWindows({ accessToken: '', refreshToken: '' })
    }
    return ''
  }

  const payload = normalizeCommunityAuthTokens(await response.json().catch(() => ({})))
  if (!payload.accessToken) return ''
  rememberCommunityAuthTokens(payload)
  await writeCommunityAuthTokensToOpenWindows(payload)
  return payload.accessToken
}

export async function refreshCommunityAccessToken(): Promise<string> {
  communityTokenRefreshPromise ??= refreshCommunityAccessTokenOnce().finally(() => {
    communityTokenRefreshPromise = null
  })
  return communityTokenRefreshPromise
}

function withCommunityAuthorization(
  options: RequestInit,
  token: string,
): RequestInit & { headers: Record<string, string> } {
  return {
    ...options,
    headers: {
      ...((options.headers as Record<string, string> | undefined) ?? {}),
      Authorization: `Bearer ${token}`,
    },
  }
}

export async function fetchCommunityUrlWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = await readCommunityAccessToken()
  if (!token) token = await refreshCommunityAccessToken()
  if (!token) throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)

  let response = await net.fetch(url, withCommunityAuthorization(options, token))
  if (response.status === 401 || response.status === 403) {
    const refreshedToken = await refreshCommunityAccessToken()
    if (refreshedToken && refreshedToken !== token) {
      token = refreshedToken
      response = await net.fetch(url, withCommunityAuthorization(options, token))
    }
  }
  if (response.status === 401 || response.status === 403) {
    forgetCommunityAuthTokens(token)
    await writeCommunityAuthTokensToOpenWindows({ accessToken: '', refreshToken: '' })
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  }
  return response
}

export function fetchCommunityWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
  return fetchCommunityUrlWithAuth(communityApiUrl(readDesktopSettings(), path), options)
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
  const localWorkDirs = readDesktopSettings().connectorBuddyWorkDirs
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

export async function setConnectorConnectionEnabled(
  agentId: string,
  enabled: boolean,
): Promise<ConnectorConnection[]> {
  await fetchCommunityJson(`/api/agents/${agentId}/${enabled ? 'start' : 'stop'}`, {
    method: 'POST',
  })
  return refreshConnectorConnections()
}

export async function setConnectorConnectionWorkDir(
  agentId: string,
  workDir: string,
): Promise<ConnectorConnection[]> {
  const normalizedWorkDir = typeof workDir === 'string' ? workDir.trim() : ''
  const settings = readDesktopSettings()
  const connectorBuddyWorkDirs = { ...settings.connectorBuddyWorkDirs }
  if (normalizedWorkDir) {
    connectorBuddyWorkDirs[agentId] = normalizedWorkDir
  } else {
    delete connectorBuddyWorkDirs[agentId]
  }
  saveDesktopSettings({ connectorBuddyWorkDirs })
  writeConnectorWorkDirMap(readDesktopSettings())
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
  saveDesktopSettings({ connectorApiKey: apiKey, serverBaseUrl: bootstrap.serverBaseUrl })
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

export function getConnectorDaemonState(): ConnectorDaemonState {
  const settings = readDesktopSettings()
  const cliPath = connectorCliPath()
  const running = Boolean(daemonProcess && !daemonProcess.killed)
  const phase =
    running && (daemonPhase === 'idle' || daemonPhase === 'error') ? 'running' : daemonPhase
  return {
    running,
    pid: daemonProcess?.pid ?? null,
    startedAt,
    uptimeMs: startedAt ? Date.now() - startedAt : 0,
    serverBaseUrl: settings.serverBaseUrl,
    hasApiKey: Boolean(settings.connectorApiKey),
    autoStart: settings.connectorAutoStart,
    phase,
    progress: running && daemonProgress === 0 ? 100 : daemonProgress,
    progressMessage: daemonProgressMessage,
    connections: [...connectorConnections],
    lastExitCode,
    lastError,
    logTail: [...logTail],
    connectorPath: existsSync(cliPath) ? cliPath : null,
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
      ? saveDesktopSettings(incoming)
      : readDesktopSettings()

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
      setConnectorProgress('connecting', 48, 'Authorization complete')
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      setConnectorProgress('error', 0, 'Connector authorization failed')
      broadcastConnectorState()
      throw error
    }
  }

  const cliPath = connectorCliPath()
  if (!existsSync(cliPath)) {
    lastError = `Connector is not bundled: ${cliPath}`
    setConnectorProgress('error', 0, 'Connector is not bundled')
    throw new Error(lastError)
  }

  lastError = null
  lastExitCode = null
  logTail.length = 0
  writeConnectorWorkDirMap(launchSettings)
  setConnectorProgress('starting', 72, 'Starting local Connector')

  daemonProcess = spawn(
    resolveElectronNodeBinary(),
    buildArgs({ ...launchSettings, connectorApiKey: apiKey }),
    {
      env: connectorEnv(launchSettings),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  startedAt = Date.now()
  appendLog(`[desktop] connector starting on ${launchSettings.serverBaseUrl}`)

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
  const settings = readDesktopSettings()
  const cliPath = connectorCliPath()
  if (!existsSync(cliPath)) throw new Error(`Connector is not bundled: ${cliPath}`)
  return new Promise((resolve, reject) => {
    execFile(
      resolveElectronNodeBinary(),
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
  const settings = readDesktopSettings()
  const cliPath = connectorCliPath()
  if (!existsSync(cliPath)) throw new Error(`Connector is not bundled: ${cliPath}`)
  return new Promise((resolve, reject) => {
    execFile(
      resolveElectronNodeBinary(),
      [cliPath, 'scan', '--json', '--server-url', settings.serverBaseUrl],
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

export async function scanAgentRuntimes(): Promise<{ runtimes: ConnectorRuntimeInfo[] }> {
  return runConnectorCliJson<{ runtimes: ConnectorRuntimeInfo[] }>(['runtime-scan', '--json'])
}

export async function installAgentRuntime(
  runtimeId: string,
): Promise<{ runtimes: ConnectorRuntimeInfo[]; installed: ConnectorRuntimeInfo | null }> {
  const result = await runConnectorCliJson<{
    runtime?: ConnectorRuntimeInfo
  }>(['runtime-install', '--runtime', runtimeId, '--json'], 10 * 60_000)
  const scan = await scanAgentRuntimes()
  return { runtimes: scan.runtimes, installed: result.runtime ?? null }
}

export function setupConnectorDaemonHandlers(): void {
  ipcMain.handle('desktop:connector:getStatus', () => getConnectorDaemonState())
  ipcMain.handle(
    'desktop:connector:start',
    (_event, incoming: Partial<DesktopRuntimeSettings> = {}) => startConnectorDaemon(incoming),
  )
  ipcMain.handle('desktop:connector:stop', () => stopConnectorDaemon())
  ipcMain.handle('desktop:connector:scan', () => scanConnectorRuntimes())
  ipcMain.handle('desktop:connector:scanRuntimes', () => scanAgentRuntimes())
  ipcMain.handle('desktop:connector:installRuntime', (_event, input: { runtimeId?: string }) => {
    const runtimeId = typeof input?.runtimeId === 'string' ? input.runtimeId.trim() : ''
    if (!runtimeId) throw new Error('Missing runtime id')
    return installAgentRuntime(runtimeId)
  })
  ipcMain.handle('desktop:connector:getConnections', () => refreshConnectorConnections())
  ipcMain.handle(
    'desktop:connector:setConnectionEnabled',
    (_event, input: { agentId: string; enabled: boolean }) =>
      setConnectorConnectionEnabled(input.agentId, input.enabled),
  )
  ipcMain.handle(
    'desktop:connector:setConnectionWorkDir',
    (_event, input: { agentId: string; workDir?: string }) =>
      setConnectorConnectionWorkDir(input.agentId, input.workDir ?? ''),
  )
}

export function startConnectorDaemonIfEnabled(): void {
  const settings = readDesktopSettings()
  if (!settings.connectorAutoStart || !settings.connectorApiKey) return
  startConnectorDaemon().catch((error) => {
    lastError = error instanceof Error ? error.message : String(error)
    broadcastConnectorState()
  })
}

app.on('before-quit', () => {
  if (daemonProcess && !daemonProcess.killed) daemonProcess.kill('SIGTERM')
})
