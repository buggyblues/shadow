import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants, type Dirent } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import type { ConnectorRuntimeId } from './runtime-catalog.js'
import { connectorProcessEnv } from './toolchain.js'

export type RuntimeSessionState =
  | 'idle'
  | 'running'
  | 'streaming'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'unknown'

export type RuntimeInstanceStatus = 'running' | 'available' | 'stopped' | 'missing' | 'error'

export interface RuntimeInstanceInfo {
  runtimeId: ConnectorRuntimeId
  instanceId: string
  label: string
  status: RuntimeInstanceStatus
  endpoint?: string | null
  capabilities: string[]
  error?: string | null
  metadata?: Record<string, unknown>
}

export interface RuntimeSessionInfo {
  runtimeId: ConnectorRuntimeId
  instanceId: string
  sessionId: string
  title?: string | null
  workDir?: string | null
  state: RuntimeSessionState
  model?: string | null
  lastActivityAt?: string | null
  startedAt?: string | null
  source: 'server' | 'cli' | 'database' | 'storage' | 'transcript'
  native?: Record<string, unknown>
}

export interface RuntimeSessionSnapshot {
  scannedAt: string
  runtimeIds: ConnectorRuntimeId[]
  instances: RuntimeInstanceInfo[]
  sessions: RuntimeSessionInfo[]
}

export type RuntimeSessionEventType =
  | 'snapshot'
  | 'session_added'
  | 'session_removed'
  | 'session_changed'

export interface RuntimeSessionEvent {
  type: RuntimeSessionEventType
  at: string
  runtimeId?: ConnectorRuntimeId
  sessionId?: string
  previousState?: RuntimeSessionState
  state?: RuntimeSessionState
  session?: RuntimeSessionInfo
  snapshot?: RuntimeSessionSnapshot
}

export interface RuntimeSessionScanOptions {
  runtimeId?: string
  opencodeUrl?: string
  homeDir?: string
  env?: NodeJS.ProcessEnv
  limit?: number
}

export interface RuntimeSessionSendOptions extends RuntimeSessionScanOptions {
  runtimeId: string
  sessionId: string
  message: string
  timeoutMs?: number
}

export interface RuntimeSessionSendResult {
  runtimeId: ConnectorRuntimeId
  sessionId: string
  accepted: boolean
  mode: 'server' | 'process'
  events?: unknown[]
  stdout?: string
  stderr?: string
  exitCode?: number | null
}

const SESSION_RUNTIME_IDS: ConnectorRuntimeId[] = ['opencode', 'claude-code']
const DEFAULT_OPENCODE_URL = 'http://127.0.0.1:4096'

interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
}

function runCommand(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
    input?: string
  } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: connectorProcessEnv(options.env ?? process.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    const finish = (result: CommandResult) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      resolve(result)
    }
    const timeout =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
          }, options.timeoutMs)
        : null

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      finish({ status: null, stdout, stderr: stderr || error.message })
    })
    child.on('close', (code) => {
      finish({
        status: code,
        stdout,
        stderr: timedOut ? `${stderr}${stderr ? '\n' : ''}Command timed out` : stderr,
      })
    })
    if (options.input !== undefined) {
      child.stdin?.end(options.input)
    } else {
      child.stdin?.end()
    }
  })
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function runtimeIdsFor(input?: string): ConnectorRuntimeId[] {
  if (!input || input === 'all') return SESSION_RUNTIME_IDS
  if (input === 'opencode' || input === 'claude-code') return [input]
  return []
}

async function commandAvailable(command: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const result =
    process.platform === 'win32'
      ? await runCommand('where', [command], { env, timeoutMs: 1500 })
      : await runCommand('sh', ['-lc', `command -v ${shellQuote(command)}`], {
          env,
          timeoutMs: 1500,
        })
  return result.status === 0 && Boolean(result.stdout.trim())
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const entry = value[key]
    if (typeof entry === 'string' && entry.trim()) return entry.trim()
  }
  return null
}

function readValue(value: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key]
  }
  return null
}

function normalizeIsoDate(value: unknown): string | null {
  if (!value) return null
  const time =
    typeof value === 'number'
      ? value < 1_000_000_000_000
        ? value * 1000
        : value
      : typeof value === 'string'
        ? Date.parse(value)
        : Number.NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function opencodeUrl(options: RuntimeSessionScanOptions): string {
  const value =
    options.opencodeUrl ??
    options.env?.SHADOW_CONNECTOR_OPENCODE_URL ??
    options.env?.OPENCODE_SERVER_URL ??
    DEFAULT_OPENCODE_URL
  return value.replace(/\/+$/, '')
}

function opencodeHeaders(options: RuntimeSessionScanOptions): Record<string, string> {
  const password = options.env?.OPENCODE_SERVER_PASSWORD
  if (!password) return {}
  const username = options.env?.OPENCODE_SERVER_USERNAME || 'opencode'
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  }
}

function opencodeDataDir(options: RuntimeSessionScanOptions): string {
  const env = options.env ?? process.env
  const explicit = env.OPENCODE_DATA_DIR?.trim()
  if (explicit) return explicit
  const home = options.homeDir ?? homedir()
  const xdgDataHome = env.XDG_DATA_HOME?.trim()
  if (xdgDataHome) return join(xdgDataHome, 'opencode')
  if (process.platform === 'win32' && env.APPDATA?.trim()) return join(env.APPDATA, 'opencode')
  return join(home, '.local', 'share', 'opencode')
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs = 2500): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

function mapNativeState(value: unknown): RuntimeSessionState {
  const text =
    typeof value === 'string' ? value.toLowerCase() : JSON.stringify(value ?? {}).toLowerCase()
  if (text.includes('approval') || text.includes('permission')) return 'waiting_for_approval'
  if (text.includes('stream')) return 'streaming'
  if (text.includes('run') || text.includes('busy') || text.includes('work')) return 'running'
  if (text.includes('idle') || text.includes('ready')) return 'idle'
  if (text.includes('complete') || text.includes('success')) return 'completed'
  if (text.includes('fail') || text.includes('error')) return 'failed'
  if (text.includes('stop') || text.includes('abort')) return 'stopped'
  if (text.includes('block') || text.includes('wait')) return 'blocked'
  return 'unknown'
}

function sessionFromOpenCode(
  item: unknown,
  statusValue: unknown,
  endpoint: string,
): RuntimeSessionInfo | null {
  const root = asRecord(item)
  const sessionId = readString(root, ['id', 'sessionID', 'sessionId'])
  if (!sessionId) return null
  const title = readString(root, ['title', 'name', 'summary'])
  const time = asRecord(root.time)
  const createdAt =
    normalizeIsoDate(readValue(root, ['createdAt', 'created_at', 'created'])) ??
    normalizeIsoDate(readValue(time, ['created', 'createdAt']))
  const updatedAt =
    normalizeIsoDate(readValue(root, ['updatedAt', 'updated_at', 'updated'])) ??
    normalizeIsoDate(readValue(time, ['updated', 'updatedAt'])) ??
    createdAt
  const model = asRecord(root.model)
  const modelId = readString(root, ['model', 'modelID', 'modelId']) ?? readString(model, ['id'])
  const providerId = readString(model, ['providerID', 'providerId', 'provider'])
  return {
    runtimeId: 'opencode',
    instanceId: endpoint,
    sessionId,
    title,
    workDir: readString(root, ['cwd', 'directory', 'path']),
    state:
      statusValue !== undefined && statusValue !== null
        ? mapNativeState(statusValue)
        : endpoint === 'cli'
          ? 'unknown'
          : 'idle',
    model: providerId && modelId ? `${providerId}/${modelId}` : modelId,
    startedAt: createdAt,
    lastActivityAt: updatedAt,
    source: 'server',
    native: {
      status: statusValue ?? null,
      slug: readString(root, ['slug']),
      agent: readString(root, ['agent']),
      version: readString(root, ['version']),
    },
  }
}

async function sessionsFromOpenCodeCli(
  env: NodeJS.ProcessEnv,
  limit: number,
): Promise<RuntimeSessionInfo[]> {
  const result = await runCommand('opencode', ['session', 'list', '--format', 'json'], {
    env,
    timeoutMs: 5000,
  })
  if (result.status !== 0 || !result.stdout.trim()) return []
  try {
    const parsed = JSON.parse(result.stdout) as unknown
    const items = Array.isArray(parsed) ? parsed : []
    return items
      .slice(0, limit)
      .map((item) => sessionFromOpenCode(item, null, 'cli'))
      .filter((item): item is RuntimeSessionInfo => Boolean(item))
      .map((item) => ({ ...item, source: 'cli', instanceId: 'cli' }))
  } catch {
    return []
  }
}

function parseOpenCodeModel(value: unknown): string | null {
  const model = typeof value === 'string' ? asRecord(safeJson(value)) : asRecord(value)
  const modelId = readString(model, ['id', 'modelID', 'modelId', 'model'])
  const providerId = readString(model, ['providerID', 'providerId', 'provider'])
  return providerId && modelId ? `${providerId}/${modelId}` : modelId
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function openCodeSqlLimit(limit: number): number {
  return Math.max(1, Math.min(200, Math.floor(limit)))
}

async function sessionsFromOpenCodeDatabase(
  options: RuntimeSessionScanOptions,
  limit: number,
): Promise<RuntimeSessionInfo[]> {
  const dataDir = opencodeDataDir(options)
  const dbPath = join(dataDir, 'opencode.db')
  if (!(await pathExists(dbPath))) return []
  const query = [
    'select id,title,directory,agent,model,time_created,time_updated',
    'from session',
    'where time_archived is null',
    'order by time_updated desc',
    `limit ${openCodeSqlLimit(limit)}`,
  ].join(' ')
  const result = await runCommand('sqlite3', ['-readonly', '-json', dbPath, query], {
    env: options.env ?? process.env,
    timeoutMs: 1200,
  })
  if (result.status !== 0 || !result.stdout.trim()) return []
  const rows = safeJson(result.stdout)
  if (!Array.isArray(rows)) return []
  return rows
    .map((row): RuntimeSessionInfo | null => {
      const root = asRecord(row)
      const sessionId = readString(root, ['id'])
      if (!sessionId) return null
      const updatedAt = normalizeIsoDate(readValue(root, ['time_updated']))
      const createdAt = normalizeIsoDate(readValue(root, ['time_created']))
      return {
        runtimeId: 'opencode',
        instanceId: 'database',
        sessionId,
        title: readString(root, ['title']),
        workDir: readString(root, ['directory', 'path']),
        state: 'unknown',
        model: parseOpenCodeModel(root.model),
        startedAt: createdAt,
        lastActivityAt: updatedAt ?? createdAt,
        source: 'database',
        native: {
          agent: readString(root, ['agent']),
          dataDir,
        },
      }
    })
    .filter((item): item is RuntimeSessionInfo => Boolean(item))
}

async function sessionsFromOpenCodeStorage(
  options: RuntimeSessionScanOptions,
  limit: number,
): Promise<RuntimeSessionInfo[]> {
  const dataDir = opencodeDataDir(options)
  const diffDir = join(dataDir, 'storage', 'session_diff')
  if (!(await pathExists(diffDir))) return []
  let entries: Dirent<string>[]
  try {
    entries = await readdir(diffDir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
      .map(async (entry) => {
        const path = join(diffDir, entry.name)
        try {
          const stats = await stat(path)
          return {
            path,
            name: entry.name,
            mtimeMs: stats.mtimeMs,
            mtime: stats.mtime,
            size: stats.size,
          }
        } catch {
          return null
        }
      }),
  )
  return files
    .filter((item): item is NonNullable<(typeof files)[number]> => Boolean(item))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((file) => ({
      runtimeId: 'opencode' as const,
      instanceId: 'storage',
      sessionId: basename(file.name, '.json'),
      title: null,
      workDir: null,
      state: 'unknown' as const,
      lastActivityAt: file.mtime.toISOString(),
      startedAt: null,
      source: 'storage' as const,
      native: {
        dataDir,
        diffFile: file.name,
        diffBytes: file.size,
      },
    }))
}

async function scanOpenCode(
  options: RuntimeSessionScanOptions,
): Promise<{ instances: RuntimeInstanceInfo[]; sessions: RuntimeSessionInfo[] }> {
  const env = options.env ?? process.env
  const endpoint = opencodeUrl(options)
  const availablePromise = commandAvailable('opencode', env)
  const headers = opencodeHeaders(options)
  const capabilities = ['sessionList', 'sessionHistory', 'liveWatch', 'sendMessage', 'abort']
  const limit = options.limit ?? 50

  try {
    await fetchJson(`${endpoint}/global/health`, { headers }, 2000)
    const [sessionsValue, statusValue] = await Promise.all([
      fetchJson<unknown[]>(`${endpoint}/session`, { headers }, 3000),
      fetchJson<Record<string, unknown>>(`${endpoint}/session/status`, { headers }, 3000).catch(
        (): Record<string, unknown> => ({}),
      ),
    ])
    return {
      instances: [
        {
          runtimeId: 'opencode',
          instanceId: endpoint,
          label: 'OpenCode server',
          status: 'running',
          endpoint,
          capabilities,
        },
      ],
      sessions: sessionsValue
        .slice(0, limit)
        .map((item) => {
          const root = asRecord(item)
          const id = readString(root, ['id', 'sessionID', 'sessionId'])
          return sessionFromOpenCode(item, id ? statusValue[id] : undefined, endpoint)
        })
        .filter((item): item is RuntimeSessionInfo => Boolean(item))
        .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')),
    }
  } catch (error) {
    const [available, databaseSessions] = await Promise.all([
      availablePromise,
      sessionsFromOpenCodeDatabase(options, limit),
    ])
    const storageSessions =
      databaseSessions.length > 0 ? [] : await sessionsFromOpenCodeStorage(options, limit)
    const cliSessions =
      databaseSessions.length > 0 || storageSessions.length > 0 || !available
        ? []
        : await sessionsFromOpenCodeCli(env, limit)
    const sessions = databaseSessions.length
      ? databaseSessions
      : storageSessions.length
        ? storageSessions
        : cliSessions
    const localDataAvailable = databaseSessions.length > 0 || storageSessions.length > 0
    return {
      instances: [
        {
          runtimeId: 'opencode',
          instanceId: localDataAvailable ? 'local-data' : endpoint,
          label: localDataAvailable ? 'OpenCode local sessions' : 'OpenCode server',
          status: available ? 'available' : localDataAvailable ? 'stopped' : 'missing',
          endpoint,
          capabilities: available || localDataAvailable ? ['sessionList', 'sessionHistory'] : [],
          error: error instanceof Error ? error.message : String(error),
        },
      ],
      sessions,
    }
  }
}

async function walkJsonlFiles(root: string, limit: number): Promise<string[]> {
  if (limit <= 0 || !(await pathExists(root))) return []
  const found: string[] = []
  const visit = async (dir: string): Promise<void> => {
    if (found.length >= limit) return
    let entries: Dirent<string>[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) break
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
      } else if (entry.isFile() && extname(entry.name) === '.jsonl') {
        found.push(path)
      }
    }
  }
  await visit(root)
  return found
}

function contentText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (!Array.isArray(value)) return null
  const parts = value
    .map((part) => {
      const root = asRecord(part)
      return typeof root.text === 'string' ? root.text : ''
    })
    .filter(Boolean)
  return parts.join('\n').trim() || null
}

async function sessionFromClaudeTranscript(path: string): Promise<RuntimeSessionInfo | null> {
  const fallbackId = basename(path, '.jsonl')
  let statMtime: string | null = null
  try {
    statMtime = (await stat(path)).mtime.toISOString()
  } catch {
    statMtime = null
  }

  let lines: string[]
  try {
    lines = (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean)
  } catch {
    return null
  }
  const tail = lines.slice(-200)
  let sessionId = fallbackId
  let title: string | null = null
  let workDir: string | null = null
  let model: string | null = null
  let lastActivityAt: string | null = statMtime
  let startedAt: string | null = null

  for (const line of tail) {
    let parsed: Record<string, unknown>
    try {
      parsed = asRecord(JSON.parse(line) as unknown)
    } catch {
      continue
    }
    sessionId =
      readString(parsed, ['sessionId', 'session_id', 'sessionID', 'conversationId']) ?? sessionId
    workDir = workDir ?? readString(parsed, ['cwd', 'workingDirectory'])
    model = model ?? readString(parsed, ['model'])
    const timestamp = normalizeIsoDate(readString(parsed, ['timestamp', 'createdAt']))
    if (timestamp) {
      startedAt = startedAt ?? timestamp
      lastActivityAt = timestamp
    }
    const message = asRecord(parsed.message)
    const role = readString(message, ['role']) ?? readString(parsed, ['role'])
    if (!title && role === 'user') {
      title = contentText(message.content ?? parsed.content)?.slice(0, 100) ?? null
    }
  }

  return {
    runtimeId: 'claude-code',
    instanceId: 'transcripts',
    sessionId,
    title,
    workDir,
    state: 'unknown',
    model,
    lastActivityAt,
    startedAt,
    source: 'transcript',
    native: { transcriptFile: basename(path) },
  }
}

async function activeClaudeSessionIds(env: NodeJS.ProcessEnv): Promise<Set<string>> {
  const result = await runCommand('ps', ['-axo', 'command='], { env, timeoutMs: 2500 })
  if (result.status !== 0 || !result.stdout) return new Set()
  const ids = new Set<string>()
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes('claude')) continue
    const resume =
      line.match(/(?:--resume(?:=|\s+)|-r\s+)([0-9a-f]{8}-[0-9a-f-]{27,})/i) ??
      line.match(/--session-id(?:=|\s+)([0-9a-f]{8}-[0-9a-f-]{27,})/i)
    if (resume?.[1]) ids.add(resume[1])
  }
  return ids
}

async function scanClaudeCode(
  options: RuntimeSessionScanOptions,
): Promise<{ instances: RuntimeInstanceInfo[]; sessions: RuntimeSessionInfo[] }> {
  const env = options.env ?? process.env
  const home = options.homeDir ?? homedir()
  const root = resolve(home, '.claude/projects')
  const [available, files, activeSessions] = await Promise.all([
    commandAvailable('claude', env),
    walkJsonlFiles(root, options.limit ?? 100),
    activeClaudeSessionIds(env),
  ])
  const scannedSessions = await Promise.all(files.map(sessionFromClaudeTranscript))
  const sessions = scannedSessions
    .filter((item): item is RuntimeSessionInfo => Boolean(item))
    .map((session) =>
      activeSessions.has(session.sessionId) ? { ...session, state: 'running' as const } : session,
    )
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))

  return {
    instances: [
      {
        runtimeId: 'claude-code',
        instanceId: 'transcripts',
        label: 'Claude Code transcripts',
        status: available ? 'available' : sessions.length > 0 ? 'stopped' : 'missing',
        capabilities: available
          ? ['sessionList', 'processWatch', 'sendMessage', 'connectorOwnedOnly']
          : ['sessionList'],
        metadata: { transcriptRoot: '~/.claude/projects' },
      },
    ],
    sessions,
  }
}

export async function scanRuntimeSessions(
  options: RuntimeSessionScanOptions = {},
): Promise<RuntimeSessionSnapshot> {
  const runtimeIds = runtimeIdsFor(options.runtimeId)
  const scannedAt = new Date().toISOString()
  const parts = await Promise.all(
    runtimeIds.map((runtimeId) => {
      if (runtimeId === 'opencode') return scanOpenCode(options)
      return scanClaudeCode(options)
    }),
  )
  return {
    scannedAt,
    runtimeIds,
    instances: parts.flatMap((part) => part.instances),
    sessions: parts.flatMap((part) => part.sessions),
  }
}

function sessionKey(session: RuntimeSessionInfo): string {
  return `${session.runtimeId}:${session.instanceId}:${session.sessionId}`
}

export function diffRuntimeSessionSnapshots(
  previous: RuntimeSessionSnapshot | null,
  next: RuntimeSessionSnapshot,
): RuntimeSessionEvent[] {
  if (!previous) return [{ type: 'snapshot', at: next.scannedAt, snapshot: next }]
  const events: RuntimeSessionEvent[] = []
  const before = new Map(previous.sessions.map((session) => [sessionKey(session), session]))
  const after = new Map(next.sessions.map((session) => [sessionKey(session), session]))

  for (const [key, session] of after) {
    const old = before.get(key)
    if (!old) {
      events.push({
        type: 'session_added',
        at: next.scannedAt,
        runtimeId: session.runtimeId,
        sessionId: session.sessionId,
        state: session.state,
        session,
      })
      continue
    }
    if (old.state !== session.state || old.lastActivityAt !== session.lastActivityAt) {
      events.push({
        type: 'session_changed',
        at: next.scannedAt,
        runtimeId: session.runtimeId,
        sessionId: session.sessionId,
        previousState: old.state,
        state: session.state,
        session,
      })
    }
  }

  for (const [key, session] of before) {
    if (after.has(key)) continue
    events.push({
      type: 'session_removed',
      at: next.scannedAt,
      runtimeId: session.runtimeId,
      sessionId: session.sessionId,
      previousState: session.state,
      state: 'stopped',
      session,
    })
  }
  return events
}

export function renderRuntimeSessionPanel(snapshot: RuntimeSessionSnapshot): string {
  const lines = [
    `Shadow Connector Runtime Monitor  ${snapshot.scannedAt}`,
    '',
    'Instances',
    'runtime        status      instance                 capabilities',
    '-------------  ----------  -----------------------  ------------------------------',
  ]
  for (const instance of snapshot.instances) {
    lines.push(
      `${instance.runtimeId.padEnd(13)}  ${instance.status.padEnd(10)}  ${instance.instanceId
        .slice(0, 23)
        .padEnd(23)}  ${instance.capabilities.join(', ') || '-'}`,
    )
    if (instance.error) lines.push(`  ${instance.error}`)
  }
  lines.push('', 'Sessions')
  if (snapshot.sessions.length === 0) {
    lines.push('No sessions detected.')
    return lines.join('\n')
  }
  lines.push('runtime        state       last activity          session                 title')
  lines.push(
    '-------------  ----------  ---------------------  ----------------------  ----------------',
  )
  for (const session of snapshot.sessions.slice(0, 30)) {
    lines.push(
      `${session.runtimeId.padEnd(13)}  ${session.state.padEnd(10)}  ${(
        session.lastActivityAt ?? '-'
      )
        .slice(0, 21)
        .padEnd(21)}  ${session.sessionId.slice(0, 22).padEnd(22)}  ${
        session.title?.replace(/\s+/g, ' ').slice(0, 80) ?? '-'
      }`,
    )
  }
  return lines.join('\n')
}

async function sendOpenCodeMessage(
  options: RuntimeSessionSendOptions,
): Promise<RuntimeSessionSendResult> {
  const endpoint = opencodeUrl(options)
  const headers = {
    ...opencodeHeaders(options),
    'Content-Type': 'application/json',
  }
  await fetch(`${endpoint}/session/${encodeURIComponent(options.sessionId)}/prompt_async`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messageID: `msg_${randomUUID().replace(/-/g, '')}`,
      parts: [{ type: 'text', text: options.message }],
    }),
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenCode push failed (${response.status}): ${body}`)
    }
  })
  return { runtimeId: 'opencode', sessionId: options.sessionId, accepted: true, mode: 'server' }
}

function parseJsonLines(output: string): unknown[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        return null
      }
    })
    .filter((item) => item !== null)
}

async function sendClaudeMessage(
  options: RuntimeSessionSendOptions,
): Promise<RuntimeSessionSendResult> {
  const result = await runCommand(
    'claude',
    [
      '-p',
      '--resume',
      options.sessionId,
      '--output-format',
      'stream-json',
      '--verbose',
      options.message,
    ],
    {
      env: options.env ?? process.env,
      timeoutMs: options.timeoutMs ?? 180_000,
    },
  )
  return {
    runtimeId: 'claude-code',
    sessionId: options.sessionId,
    accepted: result.status === 0,
    mode: 'process',
    events: parseJsonLines(result.stdout ?? ''),
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status,
  }
}

export async function sendRuntimeSessionMessage(
  options: RuntimeSessionSendOptions,
): Promise<RuntimeSessionSendResult> {
  if (options.runtimeId === 'opencode') return sendOpenCodeMessage(options)
  if (options.runtimeId === 'claude-code') return sendClaudeMessage(options)
  throw new Error(`Runtime ${options.runtimeId} does not support session-send yet`)
}
