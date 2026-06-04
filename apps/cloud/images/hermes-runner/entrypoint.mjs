/**
 * Hermes runner entrypoint.
 *
 * Materializes generated Hermes files and starts `hermes gateway` with the
 * ShadowOB platform plugin enabled.
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
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'

const RUNTIME_NAME = 'hermes-runner'
const CONFIG_MOUNT = process.env.SHADOW_RUNNER_CONFIG_MOUNT ?? '/etc/openclaw'
const RUNTIME_FILES_PATH = join(CONFIG_MOUNT, 'runtime-files.json')
const RUNTIME_EXTENSIONS_PATH = join(CONFIG_MOUNT, 'runtime-extensions.json')
const RUNNER_HOME = process.env.HOME ?? '/home/shadow'
const HERMES_HOME = process.env.HERMES_HOME ?? join(RUNNER_HOME, '.hermes')
const BUNDLED_SHADOWOB_PLUGIN_SOURCE = '/opt/shadowob/hermes-shadowob-plugin'
const HERMES_SHADOWOB_PLUGIN_DIR = join(HERMES_HOME, 'plugins', 'shadowob')
const TEMPLATE_ROUTINES_PATH =
  process.env.SHADOW_TEMPLATE_ROUTINES_PATH ?? '/etc/shadowob/template-routines.json'
const HERMES_CRON_STORE_PATH =
  process.env.HERMES_CRON_STORE_PATH ?? join(HERMES_HOME, 'cron', 'jobs.json')
const HEALTH_PORT = Number.parseInt(
  process.env.SHADOW_RUNNER_HEALTH_PORT ?? process.env.OPENCLAW_GATEWAY_PORT ?? '3100',
  10,
)
const LOG_DIR = process.env.SHADOW_RUNNER_LOG_DIR ?? '/var/log/shadowob'
const ALLOWED_FILE_ROOTS = [RUNNER_HOME, '/home/openclaw', '/workspace', '/etc/shadowob']
const READY_FILE = process.env.SHADOW_RUNNER_READY_FILE ?? '/tmp/shadowob-ready.json'

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
  const parsed = JSON.parse(readFileSync(path, 'utf-8'))
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
  if (path.endsWith('/.env') || path.endsWith('.yaml') || path.endsWith('.json')) return 0o600
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

function parseRoutineEveryMinutes(interval) {
  if (typeof interval !== 'string') return null
  const match = interval.trim().match(/^(\d+)\s*(m|h|d)$/i)
  if (!match) return null
  const amount = Number.parseInt(match[1], 10)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2].toLowerCase()
  return amount * (unit === 'm' ? 1 : unit === 'h' ? 60 : 1440)
}

function isoNow() {
  return new Date().toISOString()
}

function addMinutesIso(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function buildHermesRoutineSchedule(routine) {
  const schedule = isPlainObject(routine.schedule) ? routine.schedule : {}
  if (typeof schedule.cron === 'string' && schedule.cron.trim()) {
    const expr = schedule.cron.trim()
    return {
      schedule: { kind: 'cron', expr, display: expr },
      scheduleDisplay: expr,
      nextRunAt: null,
    }
  }
  const minutes = parseRoutineEveryMinutes(schedule.interval)
  if (minutes) {
    const display = `every ${minutes}m`
    return {
      schedule: { kind: 'interval', minutes, display },
      scheduleDisplay: display,
      nextRunAt: addMinutesIso(minutes),
    }
  }
  return null
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

function hermesManagedJobShape(job) {
  return {
    id: job.id,
    name: job.name,
    prompt: job.prompt,
    skills: job.skills,
    skill: job.skill,
    model: job.model,
    provider: job.provider,
    base_url: job.base_url,
    script: job.script,
    no_agent: job.no_agent,
    context_from: job.context_from,
    schedule: job.schedule,
    schedule_display: job.schedule_display,
    repeat: job.repeat,
    enabled: job.enabled,
    state: job.state,
    deliver: job.deliver,
    origin: job.origin,
    enabled_toolsets: job.enabled_toolsets,
    workdir: job.workdir,
    profile: job.profile,
  }
}

function buildHermesRoutineJob(routine, now) {
  if (
    !isPlainObject(routine) ||
    typeof routine.id !== 'string' ||
    typeof routine.agentId !== 'string'
  ) {
    return null
  }
  const schedule = buildHermesRoutineSchedule(routine)
  const delivery = resolveShadowobRoutineDelivery(routine)
  if (!schedule || !delivery) return null

  const origin = {
    platform: 'shadowob',
    chat_id: delivery.channelId,
    ...(delivery.threadId ? { thread_id: delivery.threadId } : {}),
  }
  const job = {
    id: managedRoutineJobId(routine),
    name:
      typeof routine.title === 'string' && routine.title.trim() ? routine.title.trim() : routine.id,
    prompt: String(routine.prompt ?? ''),
    skills: [],
    skill: null,
    model: null,
    provider: null,
    base_url: null,
    script: null,
    no_agent: false,
    context_from: null,
    schedule: schedule.schedule,
    schedule_display: schedule.scheduleDisplay,
    repeat: { times: null, completed: 0 },
    enabled: routine.enabled !== false,
    state: routine.enabled === false ? 'paused' : 'scheduled',
    paused_at: null,
    paused_reason: null,
    created_at: now,
    next_run_at: schedule.nextRunAt,
    last_run_at: null,
    last_status: null,
    last_error: null,
    last_delivery_error: null,
    deliver: delivery.threadId ? 'origin' : `shadowob:${delivery.channelId}`,
    origin,
    enabled_toolsets: null,
    workdir: '/workspace',
    profile: null,
  }
  const managedSpecHash = stableHash(hermesManagedJobShape(job))
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

function syncTemplateRoutinesToHermesCron() {
  if (!existsSync(TEMPLATE_ROUTINES_PATH)) return
  const seed = readJsonFile(TEMPLATE_ROUTINES_PATH, null)
  const routines = Array.isArray(seed?.routines) ? seed.routines : []
  if (routines.length === 0) return

  const now = isoNow()
  const store = readJsonFile(HERMES_CRON_STORE_PATH, { jobs: [] })
  const jobs = Array.isArray(store.jobs) ? store.jobs.filter(Boolean) : []
  let changed = false

  for (const routine of routines) {
    const desired = buildHermesRoutineJob(routine, now)
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
      console.log(`[entrypoint] Seeded Hermes cron routine: ${desired.id}`)
      continue
    }
    const existing = jobs[existingIndex]
    const marker = isPlainObject(existing.shadowTemplateRoutine)
      ? existing.shadowTemplateRoutine
      : null
    const currentManagedSpecHash = stableHash(hermesManagedJobShape(existing))
    if (!marker || marker.managedSpecHash !== currentManagedSpecHash) {
      console.log(
        `[entrypoint] Preserved user-edited Hermes cron routine: ${existing.id ?? desired.id}`,
      )
      continue
    }
    if (marker.managedSpecHash === desired.shadowTemplateRoutine.managedSpecHash) continue
    jobs[existingIndex] = {
      ...desired,
      id: existing.id ?? desired.id,
      created_at: existing.created_at ?? desired.created_at,
      last_run_at: existing.last_run_at ?? null,
      last_status: existing.last_status ?? null,
      last_error: existing.last_error ?? null,
      last_delivery_error: existing.last_delivery_error ?? null,
    }
    changed = true
    console.log(`[entrypoint] Updated Hermes cron routine from template: ${jobs[existingIndex].id}`)
  }

  if (!changed) return
  mkdirSync(dirname(HERMES_CRON_STORE_PATH), { recursive: true })
  writeFileSync(HERMES_CRON_STORE_PATH, `${JSON.stringify({ jobs, updated_at: now }, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  })
  chmodSync(HERMES_CRON_STORE_PATH, 0o600)
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

function seedBundledShadowobPlugin() {
  const requiredFiles = ['plugin.yaml', 'adapter.py']
  for (const file of requiredFiles) {
    if (!existsSync(join(BUNDLED_SHADOWOB_PLUGIN_SOURCE, file))) {
      throw new Error(`Missing bundled Hermes ShadowOB plugin file: ${file}`)
    }
  }

  mkdirSync(dirname(HERMES_SHADOWOB_PLUGIN_DIR), { recursive: true })
  rmSync(HERMES_SHADOWOB_PLUGIN_DIR, { recursive: true, force: true })
  cpSync(BUNDLED_SHADOWOB_PLUGIN_SOURCE, HERMES_SHADOWOB_PLUGIN_DIR, { recursive: true })
  console.log(`[entrypoint] seeded bundled ShadowOB Hermes plugin to ${HERMES_SHADOWOB_PLUGIN_DIR}`)
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
  const skillDestinations = ['/workspace/.agents/skills', join(RUNNER_HOME, '.hermes/skills')]
  const subagentDestinations = ['/workspace/.agents/agents', join(RUNNER_HOME, '.hermes/agents')]

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
      const runtimeReady = ready && existsSync(READY_FILE)
      res.writeHead(runtimeReady ? 200 : 503, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({ status: runtimeReady ? 'ready' : 'starting', runtime: RUNTIME_NAME }),
      )
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

function startHermes() {
  mkdirSync(LOG_DIR, { recursive: true })
  rmSync(READY_FILE, { force: true })
  const proc = spawn('hermes', ['gateway'], {
    env: {
      ...process.env,
      HERMES_HOME,
      SHADOW_READY_FILE: READY_FILE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: '/workspace',
  })
  child = proc
  proc.stdout.on('data', (chunk) => process.stdout.write(redact(chunk.toString())))
  proc.stderr.on('data', (chunk) => process.stderr.write(redact(chunk.toString())))
  proc.on('exit', (code, signal) => {
    ready = false
    rmSync(READY_FILE, { force: true })
    console.error(`[entrypoint] hermes exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    process.exit(code ?? 1)
  })
  ready = true
}

function setupSignals(server) {
  const shutdown = (signal) => {
    ready = false
    rmSync(READY_FILE, { force: true })
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
  seedBundledShadowobPlugin()
  materializeCredentialFiles()
  materializePluginRuntimeAssets()
  syncTemplateRoutinesToHermesCron()

  if (process.env.SHADOW_RUNNER_VALIDATE_ONLY === '1') {
    verifyBinary('hermes', ['--version'])
    verifyBinary('shadowob', ['--help'])
    verifyBinary('shadowob-connector', ['--help'])
    ready = true
    console.log('[entrypoint] validation completed')
    return
  }

  const server = startHealthServer()
  setupSignals(server)
  startHermes()
}

main().catch((err) => {
  console.error('[entrypoint] Fatal:', err)
  process.exit(1)
})
