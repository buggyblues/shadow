/**
 * cc-connect runner entrypoint.
 *
 * Native runner flow:
 * 1. Read runtime-files.json from the mounted ConfigMap.
 * 2. Materialize cc-connect, CLI, skills, and workspace files.
 * 3. Resolve ${ENV_VAR} placeholders from Kubernetes Secret/env.
 * 4. Start cc-connect with the generated config.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'

const RUNTIME_NAME = process.env.SHADOW_RUNNER_NAME ?? 'cc-connect-runner'
const CONFIG_MOUNT = process.env.SHADOW_RUNNER_CONFIG_MOUNT ?? '/etc/openclaw'
const RUNTIME_FILES_PATH = join(CONFIG_MOUNT, 'runtime-files.json')
const RUNTIME_EXTENSIONS_PATH = join(CONFIG_MOUNT, 'runtime-extensions.json')
const RUNNER_HOME = process.env.HOME ?? '/home/shadow'
const TEMPLATE_ROUTINES_PATH =
  process.env.SHADOW_TEMPLATE_ROUTINES_PATH ?? '/etc/shadowob/template-routines.json'
const CC_CONNECT_CONFIG_PATH =
  process.env.CC_CONNECT_CONFIG_PATH ?? join(RUNNER_HOME, '.cc-connect/config.toml')
const CC_CONNECT_DATA_DIR = process.env.CC_CONNECT_DATA_DIR ?? join(RUNNER_HOME, '.cc-connect')
const CC_CONNECT_CRON_STORE_PATH =
  process.env.CC_CONNECT_CRON_STORE_PATH ?? join(CC_CONNECT_DATA_DIR, 'crons', 'jobs.json')
const HEALTH_PORT = Number.parseInt(
  process.env.SHADOW_RUNNER_HEALTH_PORT ??
    process.env.OPENCLAW_GATEWAY_PORT ??
    process.env.PORT ??
    '3100',
  10,
)
const LOG_DIR = process.env.SHADOW_RUNNER_LOG_DIR ?? '/var/log/shadowob'
const ALLOWED_FILE_ROOTS = [RUNNER_HOME, '/home/openclaw', '/workspace', '/etc/shadowob']

let ready = false
let child = null

const KEY_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bgsk_[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{20,}/g,
  /\bshadow-[A-Za-z0-9._-]{20,}/g,
]

function redact(line) {
  let result = line
  for (const pattern of KEY_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback
  const raw = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
  return parsed
}

function resolveEnvPlaceholders(value) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => process.env[key] ?? '')
}

function assertAllowedPath(path) {
  const absolute = resolve(path)
  if (!ALLOWED_FILE_ROOTS.some((root) => absolute === root || absolute.startsWith(`${root}/`))) {
    throw new Error(`Refusing to materialize runtime file outside allowed roots: ${path}`)
  }
  return absolute
}

function modeForPath(path) {
  if (path.endsWith('/.env') || path.endsWith('.toml') || path.endsWith('.json')) return 0o600
  return 0o644
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

function stableHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch (err) {
    console.warn(`[entrypoint] Failed to parse ${path}: ${err.message}`)
    return fallback
  }
}

function parseRoutineEveryCron(interval) {
  if (typeof interval !== 'string') return null
  const match = interval.trim().match(/^(\d+)\s*(m|h|d)$/i)
  if (!match) return null
  const amount = Number.parseInt(match[1], 10)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2].toLowerCase()
  if (unit === 'm') return amount < 60 ? `*/${amount} * * * *` : null
  if (unit === 'h') return amount < 24 ? `0 */${amount} * * *` : null
  return `0 0 */${amount} * *`
}

function buildCcConnectRoutineCronExpr(routine) {
  const schedule = isPlainObject(routine.schedule) ? routine.schedule : {}
  let expr = null
  if (typeof schedule.cron === 'string' && schedule.cron.trim()) {
    expr = schedule.cron.trim()
  } else {
    expr = parseRoutineEveryCron(schedule.interval)
  }
  if (!expr) return null
  if (typeof schedule.timezone === 'string' && schedule.timezone.trim()) {
    return `CRON_TZ=${schedule.timezone.trim()} ${expr}`
  }
  return expr
}

function resolveShadowobRoutineDelivery(routine) {
  const deliveries = Array.isArray(routine.deliveries) ? routine.deliveries : []
  for (const delivery of deliveries) {
    if (
      !isPlainObject(delivery) ||
      delivery.pluginId !== 'shadowob' ||
      delivery.kind !== 'channel'
    ) {
      continue
    }
    const target = isPlainObject(delivery.target) ? delivery.target : {}
    const channelEnvKey =
      typeof target.channelEnvKey === 'string' && target.channelEnvKey.trim()
        ? target.channelEnvKey.trim()
        : null
    const channelId =
      (channelEnvKey ? process.env[channelEnvKey] : undefined) ??
      (typeof target.channelId === 'string' ? target.channelId : undefined)
    if (!channelId) continue
    return {
      channelId,
      threadId:
        typeof target.threadId === 'string' && target.threadId.trim()
          ? target.threadId.trim()
          : null,
    }
  }
  return null
}

function managedRoutineJobId(routine) {
  const raw = `shadow-template-${routine.agentId ?? 'agent'}-${routine.id ?? 'routine'}`
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (raw.length >= 8 && raw.length <= 64) return raw
  return `shadow-template-${stableHash({ agentId: routine.agentId, id: routine.id }).slice(0, 20)}`
}

function ccConnectRoutineSessionKey(delivery) {
  if (delivery.threadId) return `shadowob:channel:${delivery.channelId}:thread:${delivery.threadId}`
  return `shadowob:channel:${delivery.channelId}`
}

function ccConnectManagedJobShape(job) {
  return {
    id: job.id,
    project: job.project,
    session_key: job.session_key,
    cron_expr: job.cron_expr,
    prompt: job.prompt,
    exec: job.exec,
    work_dir: job.work_dir,
    description: job.description,
    enabled: job.enabled,
    silent: job.silent,
    mute: job.mute,
    session_mode: job.session_mode,
    mode: job.mode,
    timeout_mins: job.timeout_mins,
  }
}

function buildCcConnectRoutineJob(routine, now) {
  if (
    !isPlainObject(routine) ||
    typeof routine.id !== 'string' ||
    typeof routine.agentId !== 'string'
  ) {
    return null
  }
  const cronExpr = buildCcConnectRoutineCronExpr(routine)
  const delivery = resolveShadowobRoutineDelivery(routine)
  if (!cronExpr || !delivery) return null
  const job = {
    id: managedRoutineJobId(routine),
    project: routine.agentId,
    session_key: ccConnectRoutineSessionKey(delivery),
    cron_expr: cronExpr,
    prompt: String(routine.prompt ?? ''),
    description:
      typeof routine.title === 'string' && routine.title.trim() ? routine.title.trim() : routine.id,
    enabled: routine.enabled !== false,
    session_mode: 'new_per_run',
    created_at: now,
    last_run: '0001-01-01T00:00:00Z',
  }
  const managedSpecHash = stableHash(ccConnectManagedJobShape(job))
  return {
    ...job,
    shadowTemplateRoutine: {
      version: 1,
      routineId: routine.id,
      agentId: routine.agentId,
      sourceHash: typeof routine.sourceHash === 'string' ? routine.sourceHash : null,
      managedSpecHash,
    },
  }
}

function syncTemplateRoutinesToCcConnectCron() {
  if (!existsSync(TEMPLATE_ROUTINES_PATH)) return
  const seed = readJsonFile(TEMPLATE_ROUTINES_PATH, null)
  const routines = Array.isArray(seed?.routines) ? seed.routines : []
  if (routines.length === 0) return

  const now = new Date().toISOString()
  const existing = readJsonFile(CC_CONNECT_CRON_STORE_PATH, [])
  const jobs = Array.isArray(existing) ? existing.filter(Boolean) : []
  let changed = false

  for (const routine of routines) {
    const desired = buildCcConnectRoutineJob(routine, now)
    if (!desired) {
      console.warn(
        `[entrypoint] Skipping invalid template routine: ${JSON.stringify(routine?.id ?? null)}`,
      )
      continue
    }
    const existingIndex = jobs.findIndex((job) => {
      const marker = isPlainObject(job?.shadowTemplateRoutine) ? job.shadowTemplateRoutine : null
      return marker?.routineId === desired.shadowTemplateRoutine.routineId || job?.id === desired.id
    })
    if (existingIndex < 0) {
      jobs.push(desired)
      changed = true
      console.log(`[entrypoint] Seeded cc-connect cron routine: ${desired.id}`)
      continue
    }
    const current = jobs[existingIndex]
    const marker = isPlainObject(current.shadowTemplateRoutine)
      ? current.shadowTemplateRoutine
      : null
    const currentManagedSpecHash = stableHash(ccConnectManagedJobShape(current))
    if (!marker || marker.managedSpecHash !== currentManagedSpecHash) {
      console.log(
        `[entrypoint] Preserved user-edited cc-connect cron routine: ${current.id ?? desired.id}`,
      )
      continue
    }
    if (marker.managedSpecHash === desired.shadowTemplateRoutine.managedSpecHash) continue
    jobs[existingIndex] = {
      ...desired,
      id: current.id ?? desired.id,
      created_at: current.created_at ?? desired.created_at,
      last_run: current.last_run ?? desired.last_run,
      last_error: current.last_error,
    }
    changed = true
    console.log(
      `[entrypoint] Updated cc-connect cron routine from template: ${jobs[existingIndex].id}`,
    )
  }

  if (!changed) return
  mkdirSync(dirname(CC_CONNECT_CRON_STORE_PATH), { recursive: true })
  writeFileSync(CC_CONNECT_CRON_STORE_PATH, `${JSON.stringify(jobs, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  })
  chmodSync(CC_CONNECT_CRON_STORE_PATH, 0o600)
}

function materializeRuntimeFiles() {
  const files = loadJson(RUNTIME_FILES_PATH, {})
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue
    const absolute = assertAllowedPath(path)
    const mode = modeForPath(absolute)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, resolveEnvPlaceholders(content), { encoding: 'utf-8', mode })
    chmodSync(absolute, mode)
    console.log(`[entrypoint] wrote ${absolute}`)
  }
}

function materializeCredentialFiles() {
  const runtimeExtensions = loadJson(RUNTIME_EXTENSIONS_PATH, {})
  const files = Array.isArray(runtimeExtensions.credentialFiles)
    ? runtimeExtensions.credentialFiles
    : []
  for (const file of files) {
    if (!file || typeof file.envKey !== 'string' || typeof file.path !== 'string') continue
    const value = process.env[file.envKey]
    if (!value) continue
    const absolute = assertAllowedPath(file.path)
    const mode =
      typeof file.mode === 'string' && /^[0-7]{3,4}$/.test(file.mode)
        ? Number.parseInt(file.mode, 8)
        : 0o600
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, value, { encoding: 'utf-8', mode })
    chmodSync(absolute, mode)
    console.log(`[entrypoint] materialized credential file ${absolute}`)
  }
}

function entriesWithMarker(root, marker) {
  if (!existsSync(root)) return []
  if (existsSync(join(root, marker))) return [{ source: root, name: root.split('/').pop() }]
  return readdirSync(root)
    .map((name) => ({ source: join(root, name), name }))
    .filter((entry) => {
      try {
        return statSync(entry.source).isDirectory() && existsSync(join(entry.source, marker))
      } catch {
        return false
      }
    })
}

function subagentEntries(root) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .map((name) => ({ source: join(root, name), name }))
    .filter((entry) => {
      try {
        const stat = statSync(entry.source)
        if (stat.isFile()) return entry.name.endsWith('.md')
        return stat.isDirectory()
      } catch {
        return false
      }
    })
}

function copyIfMissing(source, destination) {
  if (existsSync(destination)) return false
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true })
  return true
}

function isAllowedPluginAssetRoot(path) {
  const absolute = resolve(path)
  return [RUNNER_HOME, '/home/openclaw', '/workspace'].some(
    (root) => absolute === root || absolute.startsWith(`${root}/`),
  )
}

function materializePluginRuntimeAssets() {
  const runtimeExtensions = loadJson(RUNTIME_EXTENSIONS_PATH, {})
  const skillRoots = Array.isArray(runtimeExtensions.skillSources)
    ? runtimeExtensions.skillSources
        .map((source) => (typeof source?.targetPath === 'string' ? source.targetPath : undefined))
        .filter((path) => path && isAllowedPluginAssetRoot(path))
        .filter(Boolean)
    : []
  const subagentRoots = Array.isArray(runtimeExtensions.subagentSources)
    ? runtimeExtensions.subagentSources
        .map((source) => (typeof source?.targetPath === 'string' ? source.targetPath : undefined))
        .filter((path) => path && isAllowedPluginAssetRoot(path))
        .filter(Boolean)
    : []
  const skillDestinations = [
    '/workspace/.agents/skills',
    '/workspace/.claude/skills',
    '/workspace/.opencode/skills',
    join(RUNNER_HOME, '.codex/skills'),
  ]
  const subagentDestinations = [
    '/workspace/.agents/agents',
    '/workspace/.claude/agents',
    '/workspace/.opencode/agents',
    join(RUNNER_HOME, '.codex/agents'),
  ]

  for (const root of skillRoots) {
    for (const entry of entriesWithMarker(root, 'SKILL.md')) {
      for (const destinationRoot of skillDestinations) {
        if (copyIfMissing(entry.source, join(destinationRoot, entry.name))) {
          console.log(`[entrypoint] mirrored plugin skill ${entry.name} to ${destinationRoot}`)
        }
      }
    }
  }
  for (const root of subagentRoots) {
    for (const entry of subagentEntries(root)) {
      for (const destinationRoot of subagentDestinations) {
        if (copyIfMissing(entry.source, join(destinationRoot, entry.name))) {
          console.log(`[entrypoint] mirrored plugin subagent ${entry.name} to ${destinationRoot}`)
        }
      }
    }
  }
}

function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/ready') {
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: ready ? 'ready' : 'starting', runtime: RUNTIME_NAME }))
      return
    }
    if (req.url === '/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'live', runtime: RUNTIME_NAME }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(HEALTH_PORT, '0.0.0.0', () => {
    console.log(`[entrypoint] health server listening on :${HEALTH_PORT}`)
  })
  return server
}

function verifyBinary(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr?.toString() ?? ''}`)
  }
}

function markReady(reason) {
  if (ready) return
  ready = true
  console.log(`[entrypoint] ${RUNTIME_NAME} ready (${reason})`)
}

function observeCcConnectOutput(chunk) {
  const text = chunk.toString()
  for (const line of text.split(/\r?\n/)) {
    if (
      line.includes('platform ready') ||
      line.includes('cc-connect is running') ||
      line.includes('api server started')
    ) {
      markReady('cc-connect')
      return
    }
  }
}

function startCcConnect() {
  if (!existsSync(CC_CONNECT_CONFIG_PATH)) {
    throw new Error(`Missing generated cc-connect config: ${CC_CONNECT_CONFIG_PATH}`)
  }

  mkdirSync(LOG_DIR, { recursive: true })
  const env = {
    ...process.env,
    CC_LOG_FILE: process.env.CC_LOG_FILE ?? join(LOG_DIR, 'cc-connect.log'),
  }
  const proc = spawn('cc-connect', ['--config', CC_CONNECT_CONFIG_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: '/workspace',
  })
  child = proc
  proc.stdout.on('data', (chunk) => {
    observeCcConnectOutput(chunk)
    process.stdout.write(redact(chunk.toString()))
  })
  proc.stderr.on('data', (chunk) => {
    observeCcConnectOutput(chunk)
    process.stderr.write(redact(chunk.toString()))
  })
  proc.on('exit', (code, signal) => {
    ready = false
    console.error(
      `[entrypoint] cc-connect exited code=${code ?? 'null'} signal=${signal ?? 'null'}`,
    )
    process.exit(code ?? 1)
  })
  setTimeout(() => {
    if (!proc.killed) markReady('startup fallback')
  }, 3000)
}

function setupSignals(server) {
  const shutdown = (signal) => {
    ready = false
    server.close()
    if (child && !child.killed) child.kill(signal)
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

async function main() {
  console.log(`[entrypoint] ${RUNTIME_NAME} starting`)
  mkdirSync('/workspace', { recursive: true })
  mkdirSync('/etc/shadowob', { recursive: true })
  materializeRuntimeFiles()
  materializeCredentialFiles()
  materializePluginRuntimeAssets()
  syncTemplateRoutinesToCcConnectCron()

  if (process.env.SHADOW_RUNNER_VALIDATE_ONLY === '1') {
    verifyBinary('cc-connect', ['--help'])
    verifyBinary('shadowob', ['--help'])
    verifyBinary('shadowob-connector', ['--help'])
    markReady('validation')
    console.log('[entrypoint] validation completed')
    return
  }

  const server = startHealthServer()
  setupSignals(server)
  startCcConnect()
}

main().catch((err) => {
  console.error('[entrypoint] Fatal:', err)
  process.exit(1)
})
