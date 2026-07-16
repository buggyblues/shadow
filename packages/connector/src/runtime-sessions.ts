import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants, type Dirent } from 'node:fs'
import { access, open, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import {
  type RuntimeSessionPetActivity,
  type RuntimeSessionPetReaction,
  type RuntimeSessionState,
  runtimeSessionPetReactionForState,
  runtimeSessionStateLooksActive,
} from '@shadowob/shared/types'
import type { ConnectorRuntimeId } from './runtime-catalog.js'
import { connectorProcessEnv } from './toolchain.js'

export type {
  RuntimeSessionPetActivity,
  RuntimeSessionPetReaction,
  RuntimeSessionState,
} from '@shadowob/shared/types'

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
  petReaction: RuntimeSessionPetReaction
  petActivity?: RuntimeSessionPetActivity
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
  previousPetReaction?: RuntimeSessionPetReaction
  petReaction?: RuntimeSessionPetReaction
  previousPetActivity?: RuntimeSessionPetActivity
  petActivity?: RuntimeSessionPetActivity
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

const SESSION_RUNTIME_IDS: ConnectorRuntimeId[] = ['opencode', 'claude-code', 'codex']
const DEFAULT_OPENCODE_URL = 'http://127.0.0.1:4096'
// Transcript files are append-only history, not a liveness source. Without process
// confirmation, an unfinished final record only drives active UI briefly.
const TRANSCRIPT_ACTIVE_GRACE_MS = 90_000
const TRANSCRIPT_FUTURE_SKEW_MS = 30_000
const TRANSCRIPT_HEAD_READ_BYTES = 512 * 1024
const TRANSCRIPT_TAIL_READ_BYTES = 2 * 1024 * 1024
const TRANSCRIPT_RECORD_MAX_BYTES = 256 * 1024
const TRANSCRIPT_SCAN_CONCURRENCY = 2

interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
}

type RuntimeSessionInfoInput = Omit<RuntimeSessionInfo, 'petReaction'> & {
  petReaction?: RuntimeSessionPetReaction
}

type RuntimeSessionRecordSignal = {
  state: RuntimeSessionState
  petReaction?: RuntimeSessionPetReaction
  petActivity?: RuntimeSessionPetActivity
}

export { runtimeSessionPetReactionForState } from '@shadowob/shared/types'

export function runtimeSessionPetReaction(
  session: Pick<RuntimeSessionInfo, 'state'> & {
    petReaction?: RuntimeSessionPetReaction
  },
): RuntimeSessionPetReaction {
  return session.petReaction ?? runtimeSessionPetReactionForState(session.state)
}

function withRuntimeSessionPetReaction(session: RuntimeSessionInfoInput): RuntimeSessionInfo {
  return {
    ...session,
    petReaction: session.petReaction ?? runtimeSessionPetReactionForState(session.state),
  }
}

function transcriptActivityLooksFresh(lastActivityAt: string | null, now = Date.now()): boolean {
  if (!lastActivityAt) return false
  const activityMs = Date.parse(lastActivityAt)
  if (!Number.isFinite(activityMs)) return false
  if (activityMs > now + TRANSCRIPT_FUTURE_SKEW_MS) return false
  return now - activityMs <= TRANSCRIPT_ACTIVE_GRACE_MS
}

function settleStaleTranscriptActivity(session: RuntimeSessionInfoInput): RuntimeSessionInfoInput {
  if (!runtimeSessionStateLooksActive(session.state)) return session
  if (transcriptActivityLooksFresh(session.lastActivityAt ?? null)) return session
  return {
    ...session,
    state: 'unknown',
    petReaction: undefined,
    petActivity: undefined,
  }
}

const TEST_LIKE_COMMAND_PATTERN =
  /\b(test|vitest|jest|pytest|npm\s+test|pnpm\s+test|yarn\s+test|cargo\s+test|go\s+test)\b/i

function textForRuntimeSignal(value: unknown, depth = 0): string {
  if (depth > 4) return ''
  if (typeof value === 'string') return value.slice(0, 1000)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => textForRuntimeSignal(item, depth + 1))
      .filter(Boolean)
      .join(' ')
      .slice(0, 1000)
  }
  if (!value || typeof value !== 'object') return ''
  try {
    return JSON.stringify(value).slice(0, 1000)
  } catch {
    return ''
  }
}

function commandFromRuntimeSignal(value: unknown, depth = 0): string {
  if (depth > 4) return ''
  if (typeof value === 'string') {
    const parsed = safeJson(value)
    if (parsed && typeof parsed === 'object') {
      const nested = commandFromRuntimeSignal(parsed, depth + 1)
      if (nested) return nested
    }
    return value.slice(0, 500)
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => commandFromRuntimeSignal(item, depth + 1))
      .filter(Boolean)
      .join(' ')
      .slice(0, 500)
  }
  const root = asRecord(value)
  if (Object.keys(root).length === 0) return ''
  for (const key of ['command', 'cmd', 'shellCommand', 'script']) {
    const entry = root[key]
    if (typeof entry === 'string' && entry.trim()) return entry.slice(0, 500)
    if (Array.isArray(entry)) {
      const command = entry
        .map((part) =>
          typeof part === 'string' ? part : commandFromRuntimeSignal(part, depth + 1),
        )
        .filter(Boolean)
        .join(' ')
        .trim()
      if (command) return command.slice(0, 500)
    }
  }
  for (const key of ['tool_input', 'input', 'args', 'arguments', 'params', 'payload', 'data']) {
    const command = commandFromRuntimeSignal(root[key], depth + 1)
    if (command) return command
  }
  return ''
}

function isTestLikeCommand(command: string): boolean {
  return TEST_LIKE_COMMAND_PATTERN.test(command)
}

function runtimeToolReaction(
  toolName: string | null | undefined,
  input?: unknown,
): RuntimeSessionPetReaction | null {
  const normalized = (toolName ?? '').toLowerCase()
  if (!normalized) return null
  if (/edit|write|patch|apply_patch|multi.?edit/.test(normalized)) return 'editing'
  if (/bash|shell|terminal|exec|command|run/.test(normalized)) {
    const command = commandFromRuntimeSignal(input)
    return isTestLikeCommand(command || normalized) ? 'testing' : 'running'
  }
  if (/search|reason|think|read|grep|find|list/.test(normalized)) return 'thinking'
  return 'working'
}

function clipActivityLabel(value: string, maxLength = 36): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`
}

function basenameActivityLabel(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, '/')
  if (!normalized) return null
  const [withoutQuery] = normalized.split(/[?#]/)
  const parts = (withoutQuery || normalized).split('/').filter(Boolean)
  return clipActivityLabel(parts.at(-1) ?? normalized)
}

function stringFieldFromRuntimeSignal(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 4) return null
  if (typeof value === 'string') {
    const parsed = safeJson(value)
    return parsed && typeof parsed === 'object'
      ? stringFieldFromRuntimeSignal(parsed, keys, depth + 1)
      : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = stringFieldFromRuntimeSignal(item, keys, depth + 1)
      if (found) return found
    }
    return null
  }
  const root = asRecord(value)
  if (Object.keys(root).length === 0) return null
  for (const key of keys) {
    const entry = root[key]
    if (typeof entry === 'string' && entry.trim()) return entry.trim()
  }
  for (const key of ['tool_input', 'input', 'args', 'arguments', 'params', 'payload', 'data']) {
    const found = stringFieldFromRuntimeSignal(root[key], keys, depth + 1)
    if (found) return found
  }
  return null
}

function commandActivityLabel(input: unknown): string | null {
  const command = commandFromRuntimeSignal(input)
  if (!command) return null
  const words = command.split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
  return clipActivityLabel(words || command, 32)
}

function runtimeToolActivity(
  toolName: string | null | undefined,
  input?: unknown,
): RuntimeSessionPetActivity | undefined {
  const normalized = (toolName ?? '').toLowerCase()
  if (!normalized) return undefined
  if (/edit|write|patch|apply_patch|multi.?edit/.test(normalized)) {
    const path = stringFieldFromRuntimeSignal(input, ['file_path', 'path', 'filename'])
    return { kind: 'editing', label: path ? basenameActivityLabel(path) : null }
  }
  if (/bash|shell|terminal|exec|command|run/.test(normalized)) {
    const command = commandFromRuntimeSignal(input)
    return {
      kind: isTestLikeCommand(command || normalized) ? 'testing' : 'running',
      label: commandActivityLabel(input),
    }
  }
  if (/read/.test(normalized)) {
    const path = stringFieldFromRuntimeSignal(input, ['file_path', 'path', 'filename'])
    return { kind: 'reading', label: path ? basenameActivityLabel(path) : null }
  }
  if (/grep|find|search/.test(normalized)) {
    const pattern = stringFieldFromRuntimeSignal(input, ['pattern', 'query'])
    return { kind: 'reading', label: clipActivityLabel(pattern ?? '') }
  }
  if (/list|glob/.test(normalized)) {
    const pattern = stringFieldFromRuntimeSignal(input, ['pattern', 'path'])
    return { kind: 'reading', label: clipActivityLabel(pattern ?? '') }
  }
  if (/reason|think/.test(normalized)) return { kind: 'thinking' }
  return { kind: 'working', label: clipActivityLabel(toolName ?? '') }
}

function activeRuntimePetReaction(
  reaction: RuntimeSessionPetReaction | undefined,
): RuntimeSessionPetReaction {
  if (
    reaction === 'thinking' ||
    reaction === 'working' ||
    reaction === 'editing' ||
    reaction === 'running' ||
    reaction === 'testing' ||
    reaction === 'waiting'
  ) {
    return reaction
  }
  return 'working'
}

function activeRuntimeState(state: RuntimeSessionState): RuntimeSessionState {
  if (state === 'tool_call' || state === 'waiting_for_approval' || state === 'blocked') {
    return state
  }
  return 'running'
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
  if (input === 'opencode' || input === 'claude-code' || input === 'codex') return [input]
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
    options.env?.SHADOWOB_CONNECTOR_OPENCODE_URL ??
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
  if (text.includes('tool') || text.includes('function_call')) return 'tool_call'
  if (text.includes('stream')) return 'streaming'
  if (text.includes('run') || text.includes('busy') || text.includes('work')) return 'running'
  if (text.includes('idle') || text.includes('ready')) return 'idle'
  if (text.includes('complete') || text.includes('success')) return 'completed'
  if (text.includes('fail') || text.includes('error')) return 'failed'
  if (text.includes('stop') || text.includes('abort')) return 'stopped'
  if (text.includes('block') || text.includes('wait')) return 'blocked'
  return 'unknown'
}

function mapNativePetReaction(
  value: unknown,
  state: RuntimeSessionState,
): RuntimeSessionPetReaction {
  const text = textForRuntimeSignal(value).toLowerCase()
  if (text.includes('approval') || text.includes('permission')) return 'waiting'
  if (text.includes('fail') || text.includes('error')) return 'error'
  if (/edit|write|patch|apply_patch|multi.?edit/.test(text)) return 'editing'
  if (isTestLikeCommand(text)) return 'testing'
  if (/bash|shell|terminal|exec|command/.test(text)) return 'running'
  if (/stream|reason|think|review|read/.test(text)) return 'thinking'
  if (text.includes('complete') || text.includes('success') || text.includes('idle')) {
    return 'success'
  }
  if (text.includes('run') || text.includes('busy') || text.includes('work')) return 'working'
  if (text.includes('ready')) return 'idle'
  return runtimeSessionPetReactionForState(state)
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
  const state =
    statusValue !== undefined && statusValue !== null
      ? mapNativeState(statusValue)
      : endpoint === 'cli'
        ? 'unknown'
        : 'idle'
  return withRuntimeSessionPetReaction({
    runtimeId: 'opencode',
    instanceId: endpoint,
    sessionId,
    title,
    workDir: readString(root, ['cwd', 'directory', 'path']),
    state,
    petReaction:
      statusValue !== undefined && statusValue !== null
        ? mapNativePetReaction(statusValue, state)
        : undefined,
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
  })
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
      return withRuntimeSessionPetReaction({
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
      })
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
    .map((file) =>
      withRuntimeSessionPetReaction({
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
      }),
    )
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
    entries.sort((a, b) => b.name.localeCompare(a.name))
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

function messageText(value: Record<string, unknown>): string | null {
  const payload = asRecord(value.payload)
  const message = asRecord(payload.message ?? value.message)
  const content =
    payload.content ?? message.content ?? value.content ?? asRecord(value.item).content ?? null
  return contentText(content)
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

function headTailLines(lines: string[], headCount: number, tailCount: number): string[] {
  if (lines.length <= headCount + tailCount) return lines
  return [...lines.slice(0, headCount), ...lines.slice(-tailCount)]
}

function usableTranscriptLines(lines: string[]): string[] {
  return lines.filter(
    (line) => line.length > 0 && Buffer.byteLength(line, 'utf8') <= TRANSCRIPT_RECORD_MAX_BYTES,
  )
}

async function readTranscriptHeadTail(
  path: string,
  headCount: number,
  tailCount: number,
): Promise<string[]> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    if (size <= 0) return []

    const readRange = async (position: number, length: number): Promise<string> => {
      const buffer = Buffer.allocUnsafe(length)
      const { bytesRead } = await file.read(buffer, 0, length, position)
      return buffer.subarray(0, bytesRead).toString('utf8')
    }

    if (size <= TRANSCRIPT_HEAD_READ_BYTES + TRANSCRIPT_TAIL_READ_BYTES) {
      const text = await readRange(0, size)
      return headTailLines(usableTranscriptLines(text.split(/\r?\n/)), headCount, tailCount)
    }

    const [headText, tailText] = await Promise.all([
      readRange(0, TRANSCRIPT_HEAD_READ_BYTES),
      readRange(size - TRANSCRIPT_TAIL_READ_BYTES, TRANSCRIPT_TAIL_READ_BYTES),
    ])
    const headParts = headText.split(/\r?\n/)
    headParts.pop()
    const tailParts = tailText.split(/\r?\n/)
    tailParts.shift()
    return [
      ...usableTranscriptLines(headParts).slice(0, headCount),
      ...usableTranscriptLines(tailParts).slice(-tailCount),
    ]
  } finally {
    await file.close()
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await mapper(items[index]!)
      }
    },
  )
  await Promise.all(workers)
  return results
}

function contentHasBlockType(value: unknown, type: string): boolean {
  return Array.isArray(value) && value.some((part) => readString(asRecord(part), ['type']) === type)
}

function claudeToolSignal(
  content: unknown,
): Pick<RuntimeSessionRecordSignal, 'petReaction' | 'petActivity'> | null {
  if (!Array.isArray(content)) return null
  for (const part of content) {
    const root = asRecord(part)
    if (readString(root, ['type']) !== 'tool_use') continue
    const toolName = readString(root, ['name'])
    const reaction = runtimeToolReaction(toolName, root.input)
    if (reaction) {
      return {
        petReaction: reaction,
        petActivity: runtimeToolActivity(toolName, root.input),
      }
    }
  }
  return null
}

function claudeSignalFromRecord(
  parsed: Record<string, unknown>,
): RuntimeSessionRecordSignal | null {
  const type = readString(parsed, ['type'])
  const message = asRecord(parsed.message)
  const role = readString(message, ['role']) ?? readString(parsed, ['role'])
  if (type === 'assistant' || role === 'assistant') {
    const stopReason = readString(message, ['stop_reason'])
    const toolSignal = claudeToolSignal(message.content)
    if (stopReason === 'tool_use' || contentHasBlockType(message.content, 'tool_use')) {
      return {
        state: 'tool_call',
        petReaction: toolSignal?.petReaction ?? 'working',
        petActivity: toolSignal?.petActivity ?? { kind: 'tool_call' },
      }
    }
    if (stopReason === 'max_tokens') {
      return { state: 'blocked', petReaction: 'waiting', petActivity: { kind: 'waiting' } }
    }
    if (stopReason) {
      return { state: 'completed', petReaction: 'success', petActivity: { kind: 'success' } }
    }
    return { state: 'streaming', petReaction: 'thinking', petActivity: { kind: 'thinking' } }
  }
  if (type === 'user' || role === 'user') {
    return { state: 'running', petReaction: 'thinking', petActivity: { kind: 'thinking' } }
  }
  if (type === 'queue-operation') {
    return { state: 'running', petReaction: 'working', petActivity: { kind: 'working' } }
  }
  if (type === 'error')
    return { state: 'failed', petReaction: 'error', petActivity: { kind: 'error' } }
  return null
}

async function sessionFromClaudeTranscript(path: string): Promise<RuntimeSessionInfo | null> {
  const fallbackId = basename(path, '.jsonl')
  let statMtime: string | null = null
  try {
    statMtime = (await stat(path)).mtime.toISOString()
  } catch {
    statMtime = null
  }

  let records: string[]
  try {
    records = await readTranscriptHeadTail(path, 50, 300)
  } catch {
    return null
  }
  let sessionId = fallbackId
  let title: string | null = null
  let workDir: string | null = null
  let model: string | null = null
  let lastActivityAt: string | null = statMtime
  let startedAt: string | null = null
  let state: RuntimeSessionState = 'unknown'
  let petReaction: RuntimeSessionPetReaction | undefined
  let petActivity: RuntimeSessionPetActivity | undefined

  for (const line of records) {
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
    const signal = claudeSignalFromRecord(parsed)
    if (signal) {
      state = signal.state
      petReaction = signal.petReaction ?? petReaction
      petActivity = signal.petActivity ?? petActivity
    }
  }

  return withRuntimeSessionPetReaction(
    settleStaleTranscriptActivity({
      runtimeId: 'claude-code',
      instanceId: 'transcripts',
      sessionId,
      title,
      workDir,
      state,
      petReaction,
      petActivity,
      model,
      lastActivityAt,
      startedAt,
      source: 'transcript',
      native: { transcriptFile: basename(path) },
    }),
  )
}

function codexSessionIdFromFilename(path: string): string {
  const name = basename(path, '.jsonl')
  return name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1] ?? name
}

function codexToolName(payload: Record<string, unknown>): string | null {
  return (
    readString(payload, ['name', 'tool', 'toolName', 'call_name']) ??
    readString(asRecord(payload.tool), ['name']) ??
    readString(asRecord(payload.call), ['name'])
  )
}

function codexToolInput(payload: Record<string, unknown>): unknown {
  return (
    readValue(payload, ['arguments', 'args', 'input', 'tool_input', 'params']) ??
    asRecord(payload.call).arguments ??
    asRecord(payload.tool).input ??
    payload
  )
}

function codexCommandReaction(payload: Record<string, unknown>): RuntimeSessionPetReaction {
  const command = commandFromRuntimeSignal(payload)
  return isTestLikeCommand(command) ? 'testing' : 'running'
}

function codexCommandActivity(payload: Record<string, unknown>): RuntimeSessionPetActivity {
  const command = commandFromRuntimeSignal(payload)
  return {
    kind: isTestLikeCommand(command) ? 'testing' : 'running',
    label: commandActivityLabel(payload),
  }
}

function codexSignalFromRecord(parsed: Record<string, unknown>): RuntimeSessionRecordSignal | null {
  const payload = asRecord(parsed.payload)
  const payloadType = readString(payload, ['type'])
  if (parsed.type === 'event_msg') {
    if (payloadType === 'task_complete') {
      return { state: 'completed', petReaction: 'success', petActivity: { kind: 'success' } }
    }
    if (payloadType === 'turn_aborted' || payloadType === 'thread_rolled_back') {
      return { state: 'stopped', petReaction: 'idle' }
    }
    if (payloadType?.includes('error') || payloadType?.includes('failed')) {
      return { state: 'failed', petReaction: 'error', petActivity: { kind: 'error' } }
    }
    if (payloadType === 'task_started') {
      return { state: 'running', petReaction: 'thinking', petActivity: { kind: 'thinking' } }
    }
    if (payloadType === 'exec_command_begin' || payloadType === 'exec_command_end') {
      return {
        state: 'running',
        petReaction: codexCommandReaction(payload),
        petActivity: codexCommandActivity(payload),
      }
    }
    if (payloadType === 'patch_apply_begin' || payloadType === 'patch_apply_end') {
      return { state: 'running', petReaction: 'editing', petActivity: { kind: 'editing' } }
    }
    if (payloadType === 'mcp_tool_call_begin' || payloadType === 'mcp_tool_call_end') {
      const toolName = codexToolName(payload)
      return {
        state: 'tool_call',
        petReaction: runtimeToolReaction(toolName, codexToolInput(payload)) ?? 'working',
        petActivity: runtimeToolActivity(toolName, codexToolInput(payload)) ?? {
          kind: 'tool_call',
        },
      }
    }
    if (
      payloadType === 'agent_message' ||
      payloadType === 'web_search_end' ||
      payloadType === 'image_generation_end'
    ) {
      return { state: 'streaming', petReaction: 'thinking', petActivity: { kind: 'thinking' } }
    }
    return null
  }
  if (parsed.type === 'response_item') {
    if (payloadType === 'message') {
      const phase = readString(payload, ['phase'])
      const role = readString(payload, ['role'])
      if (role === 'user') {
        return { state: 'running', petReaction: 'thinking', petActivity: { kind: 'thinking' } }
      }
      return {
        state: phase === 'final_answer' ? 'streaming' : 'running',
        petReaction: 'thinking',
        petActivity: { kind: 'thinking' },
      }
    }
    if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
      const toolName = codexToolName(payload)
      return {
        state: 'tool_call',
        petReaction: runtimeToolReaction(toolName, codexToolInput(payload)) ?? 'working',
        petActivity: runtimeToolActivity(toolName, codexToolInput(payload)) ?? {
          kind: 'tool_call',
        },
      }
    }
    if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
      return { state: 'tool_call', petReaction: 'working', petActivity: { kind: 'tool_call' } }
    }
    if (
      payloadType === 'web_search_call' ||
      payloadType === 'image_generation_call' ||
      payloadType === 'tool_search_call' ||
      payloadType === 'tool_search_output'
    ) {
      return { state: 'tool_call', petReaction: 'working', petActivity: { kind: 'tool_call' } }
    }
    if (payloadType === 'reasoning') {
      return { state: 'streaming', petReaction: 'thinking', petActivity: { kind: 'thinking' } }
    }
  }
  if (parsed.type === 'turn_context') {
    return { state: 'running', petReaction: 'thinking', petActivity: { kind: 'thinking' } }
  }
  return null
}

async function sessionFromCodexTranscript(path: string): Promise<RuntimeSessionInfo | null> {
  const fallbackId = codexSessionIdFromFilename(path)
  let statMtime: string | null = null
  try {
    statMtime = (await stat(path)).mtime.toISOString()
  } catch {
    statMtime = null
  }

  let records: string[]
  try {
    records = await readTranscriptHeadTail(path, 80, 400)
  } catch {
    return null
  }
  let sessionId = fallbackId
  let title: string | null = null
  let workDir: string | null = null
  let model: string | null = null
  let lastActivityAt: string | null = statMtime
  let startedAt: string | null = null
  let state: RuntimeSessionState = 'unknown'
  let petReaction: RuntimeSessionPetReaction | undefined
  let petActivity: RuntimeSessionPetActivity | undefined

  for (const line of records) {
    let parsed: Record<string, unknown>
    try {
      parsed = asRecord(JSON.parse(line) as unknown)
    } catch {
      continue
    }
    const payload = asRecord(parsed.payload)
    const timestamp =
      normalizeIsoDate(readString(parsed, ['timestamp', 'createdAt'])) ??
      normalizeIsoDate(readString(payload, ['timestamp', 'createdAt']))
    if (timestamp) {
      startedAt = startedAt ?? timestamp
      lastActivityAt = timestamp
    }

    if (parsed.type === 'session_meta') {
      sessionId = readString(payload, ['id', 'sessionId', 'session_id']) ?? sessionId
      workDir = workDir ?? readString(payload, ['cwd', 'workDir', 'workingDirectory'])
      model = model ?? readString(payload, ['model'])
      continue
    }

    if (parsed.type === 'turn_context') {
      workDir = workDir ?? readString(payload, ['cwd'])
      model = model ?? readString(payload, ['model'])
      continue
    }

    const role = readString(payload, ['role']) ?? readString(asRecord(payload.message), ['role'])
    if (!title && role === 'user') {
      title = messageText(parsed)?.slice(0, 100) ?? null
    }
    const signal = codexSignalFromRecord(parsed)
    if (signal) {
      state = signal.state
      petReaction = signal.petReaction ?? petReaction
      petActivity = signal.petActivity ?? petActivity
    }
  }

  return withRuntimeSessionPetReaction(
    settleStaleTranscriptActivity({
      runtimeId: 'codex',
      instanceId: 'transcripts',
      sessionId,
      title,
      workDir,
      state,
      petReaction,
      petActivity,
      model,
      lastActivityAt,
      startedAt,
      source: 'transcript',
      native: { transcriptFile: basename(path) },
    }),
  )
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

async function activeCodexSessionIds(env: NodeJS.ProcessEnv): Promise<Set<string>> {
  const result = await runCommand('ps', ['-axo', 'command='], { env, timeoutMs: 2500 })
  if (result.status !== 0 || !result.stdout) return new Set()
  const ids = new Set<string>()
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.includes('codex')) continue
    const resume =
      line.match(/\bresume\s+([0-9a-f]{8}-[0-9a-f-]{27,})/i) ??
      line.match(/(?:--resume(?:=|\s+)|--session-id(?:=|\s+))([0-9a-f]{8}-[0-9a-f-]{27,})/i)
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
  const scannedSessions = await mapWithConcurrency(
    files,
    TRANSCRIPT_SCAN_CONCURRENCY,
    sessionFromClaudeTranscript,
  )
  const sessions = scannedSessions
    .filter((item): item is RuntimeSessionInfo => Boolean(item))
    .map((session) =>
      activeSessions.has(session.sessionId)
        ? withRuntimeSessionPetReaction({
            ...session,
            state: activeRuntimeState(session.state),
            petReaction: activeRuntimePetReaction(session.petReaction),
          })
        : session,
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

async function scanCodex(
  options: RuntimeSessionScanOptions,
): Promise<{ instances: RuntimeInstanceInfo[]; sessions: RuntimeSessionInfo[] }> {
  const env = options.env ?? process.env
  const home = options.homeDir ?? homedir()
  const root = resolve(home, '.codex/sessions')
  const [available, files, activeSessions] = await Promise.all([
    commandAvailable('codex', env),
    walkJsonlFiles(root, options.limit ?? 100),
    activeCodexSessionIds(env),
  ])
  const scannedSessions = await mapWithConcurrency(
    files,
    TRANSCRIPT_SCAN_CONCURRENCY,
    sessionFromCodexTranscript,
  )
  const sessions = scannedSessions
    .filter((item): item is RuntimeSessionInfo => Boolean(item))
    .map((session) =>
      activeSessions.has(session.sessionId)
        ? withRuntimeSessionPetReaction({
            ...session,
            state: activeRuntimeState(session.state),
            petReaction: activeRuntimePetReaction(session.petReaction),
          })
        : session,
    )
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))

  return {
    instances: [
      {
        runtimeId: 'codex',
        instanceId: 'transcripts',
        label: 'Codex CLI transcripts',
        status: available ? 'available' : sessions.length > 0 ? 'stopped' : 'missing',
        capabilities: available
          ? ['sessionList', 'processWatch', 'sendMessage', 'connectorOwnedOnly']
          : ['sessionList'],
        metadata: { transcriptRoot: '~/.codex/sessions' },
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
      if (runtimeId === 'codex') return scanCodex(options)
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

function runtimeSessionPetActivityKey(session: Pick<RuntimeSessionInfo, 'petActivity'>): string {
  return session.petActivity
    ? `${session.petActivity.kind}:${session.petActivity.label?.trim() ?? ''}`
    : ''
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
        petReaction: runtimeSessionPetReaction(session),
        petActivity: session.petActivity,
        session,
      })
      continue
    }
    if (
      old.state !== session.state ||
      old.lastActivityAt !== session.lastActivityAt ||
      runtimeSessionPetReaction(old) !== runtimeSessionPetReaction(session) ||
      runtimeSessionPetActivityKey(old) !== runtimeSessionPetActivityKey(session)
    ) {
      events.push({
        type: 'session_changed',
        at: next.scannedAt,
        runtimeId: session.runtimeId,
        sessionId: session.sessionId,
        previousState: old.state,
        state: session.state,
        previousPetReaction: runtimeSessionPetReaction(old),
        petReaction: runtimeSessionPetReaction(session),
        previousPetActivity: old.petActivity,
        petActivity: session.petActivity,
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
      previousPetReaction: runtimeSessionPetReaction(session),
      petReaction: runtimeSessionPetReactionForState('stopped'),
      previousPetActivity: session.petActivity,
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
  lines.push(
    'runtime        state       reaction     last activity          session                 title',
  )
  lines.push(
    '-------------  ----------  -----------  ---------------------  ----------------------  ----------------',
  )
  for (const session of snapshot.sessions.slice(0, 30)) {
    lines.push(
      `${session.runtimeId.padEnd(13)}  ${session.state.padEnd(10)}  ${runtimeSessionPetReaction(
        session,
      )
        .slice(0, 11)
        .padEnd(11)}  ${(session.lastActivityAt ?? '-')
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

async function sendCodexMessage(
  options: RuntimeSessionSendOptions,
): Promise<RuntimeSessionSendResult> {
  const env = options.env ?? process.env
  const result = await runCommand(
    env.CODEX_CLI_PATH?.trim() || 'codex',
    ['exec', 'resume', '--json', options.sessionId, options.message],
    {
      env,
      timeoutMs: options.timeoutMs ?? 180_000,
    },
  )
  return {
    runtimeId: 'codex',
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
  if (options.runtimeId === 'codex') return sendCodexMessage(options)
  throw new Error(`Runtime ${options.runtimeId} does not support session-send yet`)
}
