/**
 * OpenClaw Runner — container entrypoint.
 *
 * 1. Read agent config from ConfigMap (/etc/openclaw/config.json)
 * 2. Resolve ${env:VAR} references from environment
 * 3. Write generated OpenClaw config outside the mutable state directory
 * 4. Verify extensions are loaded
 * 5. Start OpenClaw gateway
 * 6. Forward signals for graceful shutdown
 */

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { basename, dirname, join, resolve } from 'node:path'

const RUNNER_HOME = process.env.HOME ?? '/home/shadow'
const OPENCLAW_STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? join(RUNNER_HOME, '.openclaw')
const CONFIG_MOUNT =
  process.env.SHADOWOB_RUNNER_CONFIG_MOUNT ?? process.env.OPENCLAW_CONFIG_MOUNT ?? '/etc/openclaw'
const EXTENSIONS_DIR = '/app/extensions'
const RUNTIME_FILES_PATH = join(CONFIG_MOUNT, 'runtime-files.json')
const RUNTIME_EXTENSIONS_PATH = join(CONFIG_MOUNT, 'runtime-extensions.json')
const DEFAULT_SHADOWOB_SLASH_COMMANDS_PATH = '/etc/shadowob/slash-commands.json'
const TEMPLATE_ROUTINES_PATH =
  process.env.SHADOWOB_TEMPLATE_ROUTINES_PATH ?? '/etc/shadowob/template-routines.json'
const RUNTIME_CONFIG_DIR = process.env.OPENCLAW_RUNTIME_CONFIG_DIR || '/tmp/openclaw/config'
const RUNTIME_CONFIG_PATH = join(RUNTIME_CONFIG_DIR, 'openclaw.json')
const OPENCLAW_BOOTSTRAP_WORKSPACE = '/opt/openclaw/bootstrap-workspace'
const HEALTH_PORT = parseInt(process.env.OPENCLAW_HEALTH_PORT ?? '3100', 10)
const OPENCLAW_HTTP_PORT = parseInt(
  process.env.OPENCLAW_GATEWAY_PORT ?? String(HEALTH_PORT + 1),
  10,
)
const OPENCLAW_GATEWAY_BIND = normalizeEnvString(process.env.OPENCLAW_GATEWAY_BIND) || 'loopback'
const OPENCLAW_DISCOVERY_MDNS_MODE =
  normalizeEnvString(process.env.OPENCLAW_DISCOVERY_MDNS_MODE) || 'off'
const OPENCLAW_MEMORY_VECTOR_ENABLED = normalizeEnvString(
  process.env.OPENCLAW_MEMORY_VECTOR_ENABLED,
)
const LOG_DIR = '/var/log/openclaw'
const SHARED_WORKSPACE_PATH = process.env.SHARED_WORKSPACE_PATH ?? ''
const SKILLS_DIR = process.env.SKILLS_DIR ?? ''
const OPENCLAW_VERSION = resolveOpenClawVersion()
const ALLOWED_RUNTIME_FILE_ROOTS = [RUNNER_HOME, '/home/openclaw', '/workspace', '/etc/shadowob']
const CLOUD_DISABLED_BUILTIN_PLUGINS = [
  'device-pair',
  'file-transfer',
  'phone-control',
  'talk-voice',
]

function installFileLogging() {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const stream = createWriteStream(join(LOG_DIR, 'entrypoint.log'), { flags: 'a' })
    const mirror = (original) => {
      return (chunk, encoding, callback) => {
        try {
          stream.write(chunk)
        } catch {
          // Keep stdout/stderr healthy even if file logging fails.
        }
        return original(chunk, encoding, callback)
      }
    }
    process.stdout.write = mirror(process.stdout.write.bind(process.stdout))
    process.stderr.write = mirror(process.stderr.write.bind(process.stderr))
    process.on('uncaughtException', (err) => {
      console.error('[entrypoint] Uncaught exception:', err)
    })
    process.on('unhandledRejection', (reason) => {
      console.error('[entrypoint] Unhandled rejection:', reason)
    })
  } catch (err) {
    console.error('[entrypoint] Failed to install file logging:', err)
  }
}

installFileLogging()

// ─── Config Loading ─────────────────────────────────────────────────────────

function loadMountedConfig() {
  const configPath = join(CONFIG_MOUNT, 'config.json')
  if (!existsSync(configPath)) {
    console.log('[entrypoint] No mounted config found, using defaults')
    return {}
  }

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    console.log('[entrypoint] Loaded config from ConfigMap')
    return config
  } catch (err) {
    console.error('[entrypoint] Failed to parse mounted config:', err.message)
    return {}
  }
}

function loadRuntimeExtensions() {
  if (!existsSync(RUNTIME_EXTENSIONS_PATH)) {
    return {}
  }

  try {
    const raw = readFileSync(RUNTIME_EXTENSIONS_PATH, 'utf-8')
    const extensions = JSON.parse(raw)
    if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
      console.warn('[entrypoint] Ignoring invalid runtime extensions payload')
      return {}
    }
    console.log('[entrypoint] Loaded runtime extensions from ConfigMap')
    return extensions
  } catch (err) {
    console.warn(`[entrypoint] Failed to parse runtime extensions: ${err.message}`)
    return {}
  }
}

function loadRuntimeFiles() {
  if (!existsSync(RUNTIME_FILES_PATH)) {
    return {}
  }

  try {
    const raw = readFileSync(RUNTIME_FILES_PATH, 'utf-8')
    const files = JSON.parse(raw)
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      console.warn('[entrypoint] Ignoring invalid runtime files payload')
      return {}
    }
    console.log('[entrypoint] Loaded runtime files from ConfigMap')
    return files
  } catch (err) {
    console.warn(`[entrypoint] Failed to parse runtime files: ${err.message}`)
    return {}
  }
}

function resolveRuntimeFilePlaceholders(value) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => process.env[key] ?? '')
}

function assertAllowedRuntimeFilePath(path) {
  const absolute = resolve(path)
  if (
    !ALLOWED_RUNTIME_FILE_ROOTS.some((root) => absolute === root || absolute.startsWith(`${root}/`))
  ) {
    throw new Error(`Refusing to materialize runtime file outside allowed roots: ${path}`)
  }
  return absolute
}

function modeForRuntimeFile(path) {
  if (
    path.endsWith('/.env') ||
    path.endsWith('.toml') ||
    path.endsWith('.yaml') ||
    path.endsWith('.json')
  ) {
    return 0o600
  }
  return 0o644
}

function materializeRuntimeFiles() {
  const files = loadRuntimeFiles()
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue
    const absolute = assertAllowedRuntimeFilePath(path)
    const mode = modeForRuntimeFile(absolute)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, resolveRuntimeFilePlaceholders(content), {
      encoding: 'utf-8',
      mode,
    })
    chmodSync(absolute, mode)
    console.log(`[entrypoint] Wrote runtime file: ${absolute}`)
  }
}

function runtimeArtifactPath(runtimeExtensions, kind) {
  const artifacts = Array.isArray(runtimeExtensions?.artifacts) ? runtimeExtensions.artifacts : []
  const artifact = artifacts.find((item) => item?.kind === kind && typeof item.path === 'string')
  return artifact?.path
}

function applyRuntimeArtifacts(runtimeExtensions) {
  if (
    !process.env.SHADOWOB_SLASH_COMMANDS_PATH &&
    existsSync(DEFAULT_SHADOWOB_SLASH_COMMANDS_PATH)
  ) {
    process.env.SHADOWOB_SLASH_COMMANDS_PATH = DEFAULT_SHADOWOB_SLASH_COMMANDS_PATH
    console.log(`[entrypoint] Slash command index: ${DEFAULT_SHADOWOB_SLASH_COMMANDS_PATH}`)
  }

  const slashIndexPath =
    runtimeArtifactPath(runtimeExtensions, 'shadow.slashCommands') ??
    runtimeExtensions?.slashCommands?.indexPath
  if (typeof slashIndexPath === 'string' && slashIndexPath.trim()) {
    console.log(`[entrypoint] Additional slash command index: ${slashIndexPath.trim()}`)
  }
}

function parseFileMode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !/^[0-7]{3,4}$/.test(value)) return 0o600
  return Number.parseInt(value, 8)
}

function materializeCredentialFiles(runtimeExtensions) {
  const files = Array.isArray(runtimeExtensions?.credentialFiles)
    ? runtimeExtensions.credentialFiles
    : []
  for (const file of files) {
    if (!file || typeof file.envKey !== 'string' || typeof file.path !== 'string') continue
    if (!file.path.startsWith('/')) {
      console.warn(`[entrypoint] Ignoring credential file with non-absolute path: ${file.path}`)
      continue
    }

    const value = process.env[file.envKey]
    if (!value) continue

    try {
      mkdirSync(dirname(file.path), { recursive: true })
      const mode = parseFileMode(file.mode)
      writeFileSync(file.path, value, { encoding: 'utf-8', mode })
      chmodSync(file.path, mode)
      console.log(`[entrypoint] Materialized credential file: ${file.path}`)
    } catch (err) {
      console.warn(
        `[entrypoint] Failed to materialize credential file ${file.path}: ${err.message}`,
      )
    }
  }
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
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
  } catch (err) {
    console.warn(`[entrypoint] Failed to parse ${path}: ${err.message}`)
    return fallback
  }
}

function resolveRunnerHomePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null
  const trimmed = rawPath.trim()
  if (trimmed === '~') return RUNNER_HOME
  if (trimmed.startsWith('~/')) return join(RUNNER_HOME, trimmed.slice(2))
  return resolve(trimmed)
}

function resolveOpenClawCronStorePath(openclawConfig) {
  const configured = isPlainObject(openclawConfig.cron) ? openclawConfig.cron.store : undefined
  const candidate =
    resolveRunnerHomePath(configured) ?? join(OPENCLAW_STATE_DIR, 'cron', 'jobs.json')
  const allowedRoots = [RUNNER_HOME, '/home/openclaw']
  if (!allowedRoots.some((root) => candidate === root || candidate.startsWith(`${root}/`))) {
    console.warn(
      `[entrypoint] Skipping template routine sync; cron store outside runner home: ${candidate}`,
    )
    return null
  }
  return candidate
}

function parseRoutineEveryMs(interval) {
  if (typeof interval !== 'string') return null
  const match = interval.trim().match(/^(\d+)\s*(s|m|h|d)$/i)
  if (!match) return null
  const amount = Number.parseInt(match[1], 10)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2].toLowerCase()
  const multiplier =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return amount * multiplier
}

function buildOpenClawRoutineSchedule(routine) {
  const schedule = isPlainObject(routine.schedule) ? routine.schedule : {}
  if (typeof schedule.cron === 'string' && schedule.cron.trim()) {
    return {
      kind: 'cron',
      expr: schedule.cron.trim(),
      ...(typeof schedule.timezone === 'string' && schedule.timezone.trim()
        ? { tz: schedule.timezone.trim() }
        : {}),
    }
  }
  const everyMs = parseRoutineEveryMs(schedule.interval)
  if (everyMs) return { kind: 'every', everyMs }
  return null
}

function resolveRoutineDeliveryTarget(delivery) {
  if (!isPlainObject(delivery) || delivery.pluginId !== 'shadowob' || delivery.kind !== 'channel') {
    return null
  }
  const target = isPlainObject(delivery.target) ? delivery.target : {}
  const channelEnvKey =
    typeof target.channelEnvKey === 'string' && target.channelEnvKey.trim()
      ? target.channelEnvKey.trim()
      : null
  const channelId =
    (channelEnvKey ? process.env[channelEnvKey] : undefined) ??
    (typeof target.channelId === 'string' ? target.channelId : undefined)
  if (!channelId) return null
  return {
    mode: 'announce',
    channel: 'shadowob',
    to: `shadowob:channel:${channelId}`,
    ...(typeof target.threadId === 'string' && target.threadId.trim()
      ? { threadId: target.threadId.trim() }
      : {}),
    ...(typeof target.accountId === 'string' && target.accountId.trim()
      ? { accountId: target.accountId.trim() }
      : {}),
    bestEffort: true,
  }
}

function managedRoutineJobId(routine) {
  const raw = `shadow-template-${routine.agentId ?? 'agent'}-${routine.id ?? 'routine'}`
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (raw.length >= 12 && raw.length <= 96) return raw
  return `shadow-template-${stableHash({ agentId: routine.agentId, id: routine.id }).slice(0, 24)}`
}

function openClawManagedJobShape(job) {
  return {
    agentId: job.agentId,
    sessionKey: job.sessionKey,
    name: job.name,
    description: job.description,
    enabled: job.enabled,
    deleteAfterRun: job.deleteAfterRun,
    schedule: job.schedule,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    payload: job.payload,
    delivery: job.delivery,
  }
}

function buildOpenClawRoutineJob(routine, now) {
  if (
    !isPlainObject(routine) ||
    typeof routine.id !== 'string' ||
    typeof routine.agentId !== 'string'
  ) {
    return null
  }
  const schedule = buildOpenClawRoutineSchedule(routine)
  if (!schedule) return null
  const delivery = Array.isArray(routine.deliveries)
    ? routine.deliveries.map(resolveRoutineDeliveryTarget).find(Boolean)
    : null
  if (!delivery) return null
  const job = {
    id: managedRoutineJobId(routine),
    agentId: routine.agentId,
    name:
      typeof routine.title === 'string' && routine.title.trim() ? routine.title.trim() : routine.id,
    description:
      typeof routine.description === 'string' && routine.description.trim()
        ? routine.description.trim()
        : `Shadow Cloud template routine ${routine.id}`,
    enabled: routine.enabled !== false,
    createdAtMs: now,
    updatedAtMs: now,
    schedule,
    sessionTarget: 'isolated',
    wakeMode: 'now',
    payload: { kind: 'agentTurn', message: String(routine.prompt ?? '') },
    delivery,
    state: {},
  }
  const managedSpecHash = stableHash(openClawManagedJobShape(job))
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

function syncTemplateRoutinesToOpenClawCron(openclawConfig) {
  if (!existsSync(TEMPLATE_ROUTINES_PATH)) return
  const seed = readJsonFile(TEMPLATE_ROUTINES_PATH, null)
  const routines = Array.isArray(seed?.routines) ? seed.routines : []
  if (routines.length === 0) return

  const storePath = resolveOpenClawCronStorePath(openclawConfig)
  if (!storePath) return

  const now = Date.now()
  const store = readJsonFile(storePath, { version: 1, jobs: [] })
  const jobs = Array.isArray(store.jobs) ? store.jobs.filter(Boolean) : []
  let changed = false

  for (const routine of routines) {
    const desired = buildOpenClawRoutineJob(routine, now)
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
      console.log(`[entrypoint] Seeded OpenClaw cron routine: ${desired.id}`)
      continue
    }

    const existing = jobs[existingIndex]
    const marker = isPlainObject(existing.shadowTemplateRoutine)
      ? existing.shadowTemplateRoutine
      : null
    const currentManagedSpecHash = stableHash(openClawManagedJobShape(existing))
    if (!marker || marker.managedSpecHash !== currentManagedSpecHash) {
      console.log(
        `[entrypoint] Preserved user-edited OpenClaw cron routine: ${existing.id ?? desired.id}`,
      )
      continue
    }

    if (marker.managedSpecHash === desired.shadowTemplateRoutine.managedSpecHash) continue
    jobs[existingIndex] = {
      ...desired,
      id: existing.id ?? desired.id,
      createdAtMs: existing.createdAtMs ?? desired.createdAtMs,
      updatedAtMs: now,
      state: isPlainObject(existing.state) ? existing.state : {},
    }
    changed = true
    console.log(
      `[entrypoint] Updated OpenClaw cron routine from template: ${jobs[existingIndex].id}`,
    )
  }

  if (!changed) return
  mkdirSync(dirname(storePath), { recursive: true })
  writeFileSync(storePath, `${JSON.stringify({ version: 1, jobs }, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  })
  chmodSync(storePath, 0o600)
}

function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{env:([^}]+)\}/g, (_, key) => {
      return process.env[key] ?? ''
    })
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars)
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value)
    }
    return result
  }
  return obj
}

// ─── OpenClaw Config Generation ─────────────────────────────────────────────

function generateOpenClawConfig(mountedConfig) {
  const config = resolveEnvVars(mountedConfig)

  // Set the actual OpenClaw gateway port. The runner health server is separate
  // so in-container OpenClaw CLI commands can rely on OPENCLAW_GATEWAY_PORT.
  if (!config.gateway) {
    config.gateway = {}
  }
  config.gateway.port = OPENCLAW_HTTP_PORT
  config.gateway.bind = OPENCLAW_GATEWAY_BIND
  // Ensure gateway.mode is set — required by OpenClaw to start without cloud setup
  if (!config.gateway.mode) {
    config.gateway.mode = 'local'
  }
  if (!config.gateway.auth) {
    config.gateway.auth = {}
  }
  if (!config.gateway.auth.mode || config.gateway.auth.mode === 'none') {
    config.gateway.auth.mode = 'token'
  }
  if (
    config.gateway.auth.mode === 'token' &&
    (typeof config.gateway.auth.token !== 'string' || !config.gateway.auth.token.trim())
  ) {
    config.gateway.auth.token =
      process.env.OPENCLAW_GATEWAY_TOKEN || randomBytes(24).toString('hex')
  }
  if (!config.gateway.controlUi || !isPlainObject(config.gateway.controlUi)) {
    config.gateway.controlUi = {}
  }
  if (!Array.isArray(config.gateway.controlUi.allowedOrigins)) {
    config.gateway.controlUi.allowedOrigins = [
      `http://localhost:${OPENCLAW_HTTP_PORT}`,
      `http://127.0.0.1:${OPENCLAW_HTTP_PORT}`,
    ]
  }
  ensureDiscoveryConfigured(config)

  // Set up shared workspace path — makes the PVC mount discoverable by OpenClaw
  if (SHARED_WORKSPACE_PATH) {
    if (!config.agents) config.agents = {}
    if (!config.agents.defaults) config.agents.defaults = {}
    if (!config.agents.defaults.workspace) {
      config.agents.defaults.workspace = SHARED_WORKSPACE_PATH
    }
    console.log(`[entrypoint] Shared workspace: ${SHARED_WORKSPACE_PATH}`)
  }

  // Set up skills extra directories — lets OpenClaw discover cloud-installed skills
  if (SKILLS_DIR) {
    if (!config.skills) config.skills = {}
    if (!config.skills.load) config.skills.load = {}
    const extraDirs = new Set(config.skills.load.extraDirs ?? [])
    extraDirs.add(SKILLS_DIR)
    config.skills.load.extraDirs = [...extraDirs]
    console.log(`[entrypoint] Skills directory: ${SKILLS_DIR}`)
  }

  ensureBundledExtensionsConfigured(config)
  ensureOpenClawBuiltInPluginsAllowed(config)
  ensureBonjourPluginDisabled(config)
  ensureCloudOptionalBuiltInPluginsDisabled(config)
  ensureCloudMemorySearchDefaults(config)
  ensureCloudBrowserDefaults(config)
  if (!config.meta || !isPlainObject(config.meta)) {
    config.meta = {}
  }
  config.meta.lastTouchedVersion = OPENCLAW_VERSION
  config.meta.lastTouchedAt = new Date().toISOString()

  return config
}

function resolveOpenClawVersion() {
  try {
    const pkg = JSON.parse(readFileSync('/app/node_modules/openclaw/package.json', 'utf-8'))
    if (typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim()
  } catch {
    // Keep entrypoint bootable in tests that do not mount node_modules.
  }
  return 'shadow-cloud-openclaw-runner'
}

function ensureOpenClawBuiltInPluginsAllowed(config) {
  if (!config.plugins || !isPlainObject(config.plugins)) config.plugins = {}

  const allow = new Set(
    Array.isArray(config.plugins.allow)
      ? config.plugins.allow.filter((value) => typeof value === 'string')
      : ['openclaw-shadowob'],
  )
  const browserExplicitlyEnabled = config.plugins?.entries?.browser?.enabled === true
  if (isPlainObject(config.browser) || browserExplicitlyEnabled) allow.add('browser')
  if (isPlainObject(config.agents?.defaults?.memorySearch) || OPENCLAW_MEMORY_VECTOR_ENABLED) {
    allow.add('memory-core')
  }
  config.plugins.allow = [...allow]
}

function ensureDiscoveryConfigured(config) {
  if (!config.discovery || !isPlainObject(config.discovery)) config.discovery = {}
  if (!config.discovery.mdns || !isPlainObject(config.discovery.mdns)) config.discovery.mdns = {}
  config.discovery.mdns.mode = OPENCLAW_DISCOVERY_MDNS_MODE
}

function ensureBonjourPluginDisabled(config) {
  if (!config.plugins || !isPlainObject(config.plugins)) config.plugins = {}
  if (!config.plugins.entries || !isPlainObject(config.plugins.entries)) {
    config.plugins.entries = {}
  }
  const existing = config.plugins.entries.bonjour
  config.plugins.entries.bonjour = isPlainObject(existing)
    ? { ...existing, enabled: false }
    : { enabled: false }
}

function ensureCloudOptionalBuiltInPluginsDisabled(config) {
  if (!config.plugins || !isPlainObject(config.plugins)) config.plugins = {}
  if (!config.plugins.entries || !isPlainObject(config.plugins.entries)) {
    config.plugins.entries = {}
  }

  for (const id of CLOUD_DISABLED_BUILTIN_PLUGINS) {
    const existing = config.plugins.entries[id]
    if (isPlainObject(existing)) {
      if (typeof existing.enabled !== 'boolean') {
        config.plugins.entries[id] = { ...existing, enabled: false }
      }
    } else if (existing == null) {
      config.plugins.entries[id] = { enabled: false }
    }
  }
}

function ensureCloudMemorySearchDefaults(config) {
  const hasMemoryConfig = isPlainObject(config.agents?.defaults?.memorySearch)
  if (!hasMemoryConfig && !OPENCLAW_MEMORY_VECTOR_ENABLED) return

  if (!config.agents || !isPlainObject(config.agents)) config.agents = {}
  if (!config.agents.defaults || !isPlainObject(config.agents.defaults)) {
    config.agents.defaults = {}
  }
  const defaults = config.agents.defaults
  if (!defaults.memorySearch || !isPlainObject(defaults.memorySearch)) {
    defaults.memorySearch = {}
  }
  if (!defaults.memorySearch.store || !isPlainObject(defaults.memorySearch.store)) {
    defaults.memorySearch.store = {}
  }
  if (!defaults.memorySearch.store.vector || !isPlainObject(defaults.memorySearch.store.vector)) {
    defaults.memorySearch.store.vector = {}
  }
  if (OPENCLAW_MEMORY_VECTOR_ENABLED) {
    defaults.memorySearch.store.vector.enabled = OPENCLAW_MEMORY_VECTOR_ENABLED !== 'false'
  } else if (typeof defaults.memorySearch.store.vector.enabled !== 'boolean') {
    defaults.memorySearch.store.vector.enabled = false
  }
  if (
    defaults.memorySearch.store.vector.enabled !== false &&
    typeof defaults.memorySearch.store.vector.extensionPath !== 'string'
  ) {
    const extensionPath = resolveSqliteVecExtensionPath()
    if (extensionPath) defaults.memorySearch.store.vector.extensionPath = extensionPath
  }
}

function ensureCloudBrowserDefaults(config) {
  const browserExplicitlyEnabled = config.plugins?.entries?.browser?.enabled === true
  if (!isPlainObject(config.browser) && !browserExplicitlyEnabled) return

  if (!config.browser || !isPlainObject(config.browser)) config.browser = {}
  const browser = config.browser
  if (typeof browser.headless !== 'boolean') browser.headless = true
  if (typeof browser.noSandbox !== 'boolean') browser.noSandbox = true
  if (typeof browser.executablePath !== 'string' || !browser.executablePath.trim()) {
    browser.executablePath = process.env.CHROME_BIN || '/usr/bin/chromium'
  }
  const extraArgs = Array.isArray(browser.extraArgs)
    ? browser.extraArgs.filter((value) => typeof value === 'string' && value.trim())
    : []
  const args = new Set(extraArgs)
  for (const arg of parseBrowserFlagEnv(process.env.CHROMIUM_FLAGS || process.env.CHROME_FLAGS)) {
    args.add(arg)
  }
  args.add('--no-sandbox')
  args.add('--disable-gpu')
  args.add('--disable-software-rasterizer')
  args.add('--single-process')
  args.add('--disable-dev-shm-usage')
  browser.extraArgs = [...args]
}

function normalizeEnvString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function parseBrowserFlagEnv(value) {
  return normalizeEnvString(value)
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean)
}

function resolveSqliteVecExtensionPath() {
  const os = process.platform === 'win32' ? 'windows' : process.platform
  const suffix =
    process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so'
  const packageName = `sqlite-vec-${os}-${process.arch}`
  const candidates = [
    join('/app/node_modules', packageName, `vec0.${suffix}`),
    join('/app/node_modules/openclaw/node_modules', packageName, `vec0.${suffix}`),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? ''
}

function listChildDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(dir, d.name))
  } catch {
    return []
  }
}

function resolveExtensionManifest(extensionDir) {
  const manifestPath = join(extensionDir, 'openclaw.plugin.json')
  if (!existsSync(manifestPath)) return null

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    return isPlainObject(manifest) ? manifest : null
  } catch (err) {
    console.warn(`[entrypoint] Failed to parse extension manifest ${manifestPath}: ${err.message}`)
    return null
  }
}

function ensureBundledExtensionsConfigured(config) {
  const extensionDirs = listChildDirs(EXTENSIONS_DIR).filter((dir) => {
    return (
      existsSync(join(dir, 'openclaw.plugin.json')) ||
      existsSync(join(dir, 'package.json')) ||
      existsSync(join(dir, 'dist', 'index.js')) ||
      existsSync(join(dir, 'index.mjs'))
    )
  })
  if (extensionDirs.length === 0) return

  if (!config.plugins || !isPlainObject(config.plugins)) config.plugins = {}
  if (config.plugins.enabled !== false) config.plugins.enabled = true
  if (!config.plugins.load || !isPlainObject(config.plugins.load)) config.plugins.load = {}

  const existingPaths = Array.isArray(config.plugins.load.paths)
    ? config.plugins.load.paths.filter((value) => typeof value === 'string')
    : []
  config.plugins.load.paths = [...new Set([...existingPaths, ...extensionDirs])]

  if (!config.plugins.entries || !isPlainObject(config.plugins.entries)) {
    config.plugins.entries = {}
  }

  for (const extensionDir of extensionDirs) {
    const manifest = resolveExtensionManifest(extensionDir)
    const id =
      typeof manifest?.id === 'string' && manifest.id.trim()
        ? manifest.id.trim()
        : basename(extensionDir)
    const existing = config.plugins.entries[id]
    if (isPlainObject(existing)) {
      config.plugins.entries[id] = { enabled: true, ...existing }
    } else if (existing == null) {
      config.plugins.entries[id] = { enabled: true }
    }
  }

  console.log(
    `[entrypoint] Configured ${extensionDirs.length} bundled extension load path(s): ${extensionDirs.join(', ')}`,
  )
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergePlainObjects(target, source) {
  const out = { ...(isPlainObject(target) ? target : {}) }
  if (!isPlainObject(source)) return out

  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergePlainObjects(out[key], value)
    } else {
      out[key] = value
    }
  }
  return out
}

function resolveManifestPatchPath(patch) {
  if (typeof patch.manifestPath === 'string' && patch.manifestPath.trim()) {
    const manifestPath = patch.manifestPath.trim()
    return manifestPath.startsWith('/') ? manifestPath : join('/app', manifestPath)
  }

  if (typeof patch.extensionId === 'string' && /^[A-Za-z0-9._-]+$/.test(patch.extensionId)) {
    return join(EXTENSIONS_DIR, patch.extensionId, 'openclaw.plugin.json')
  }

  return null
}

function runtimeManifestPatches(runtimeExtensions) {
  const patches = runtimeExtensions?.openclaw?.manifestPatches
  return Array.isArray(patches) ? patches.filter((patch) => isPlainObject(patch)) : []
}

function applyRuntimeManifestPatches(runtimeExtensions) {
  for (const patch of runtimeManifestPatches(runtimeExtensions)) {
    const manifestPath = resolveManifestPatchPath(patch)
    if (!manifestPath || !existsSync(manifestPath)) continue

    try {
      let manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      if (!isPlainObject(manifest)) continue

      if (isPlainObject(patch.merge)) {
        manifest = mergePlainObjects(manifest, patch.merge)
      }
      if (isPlainObject(patch.channelEnvVars)) {
        manifest.channelEnvVars = mergePlainObjects(manifest.channelEnvVars, patch.channelEnvVars)
      }
      if (isPlainObject(patch.channelConfigs)) {
        manifest.channelConfigs = mergePlainObjects(manifest.channelConfigs, patch.channelConfigs)
      }

      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
      console.log(`[entrypoint] Applied runtime manifest patch: ${manifestPath}`)
    } catch (err) {
      console.warn(`[entrypoint] Failed to apply manifest patch ${manifestPath}: ${err.message}`)
    }
  }
}

function verifyExtensions() {
  if (!existsSync(EXTENSIONS_DIR)) {
    console.log('[entrypoint] No extensions directory')
    return
  }

  const extensions = readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  console.log(`[entrypoint] Found ${extensions.length} extension(s): ${extensions.join(', ')}`)

  for (const extensionId of extensions) {
    const extensionDir = join(EXTENSIONS_DIR, extensionId)
    const hasEntry =
      existsSync(join(extensionDir, 'index.mjs')) ||
      existsSync(join(extensionDir, 'dist', 'index.js')) ||
      existsSync(join(extensionDir, 'openclaw.plugin.json'))
    if (hasEntry) {
      console.log(`[entrypoint] ✓ extension verified: ${extensionId}`)
    } else {
      console.warn(`[entrypoint] ⚠ extension missing entry point: ${extensionId}`)
    }
  }
}

function seedWorkspaceFromBootstrap(workspaceDir) {
  if (!existsSync(OPENCLAW_BOOTSTRAP_WORKSPACE)) {
    console.warn(
      `[entrypoint] Bootstrap workspace missing at ${OPENCLAW_BOOTSTRAP_WORKSPACE}; continuing with mounted files only`,
    )
    return
  }

  let copied = 0
  for (const entry of readdirSync(OPENCLAW_BOOTSTRAP_WORKSPACE, { withFileTypes: true })) {
    const destPath = join(workspaceDir, entry.name)
    if (existsSync(destPath)) continue
    cpSync(join(OPENCLAW_BOOTSTRAP_WORKSPACE, entry.name), destPath, { recursive: true })
    copied += 1
  }
  console.log(`[entrypoint] Seeded workspace from baked bootstrap (${copied} item(s))`)
}

// ─── Health Check Server ────────────────────────────────────────────────────

let gatewayHealthy = false
let gatewayReady = false
let shadowChannelReady = false
let healthRequiresShadowChannel = true
let gatewayProcess = null
let gatewayGraceTimer = null
let gatewayRestarts = 0
const MAX_GATEWAY_RESTARTS = 5
const RESTART_DELAY_MS = 5000

// ─── Log Redaction ──────────────────────────────────────────────────────────

const KEY_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bgsk_[A-Za-z0-9]{20,}\b/g,
  /\bxai-[A-Za-z0-9]{20,}\b/g,
  /\bkey-[A-Za-z0-9]{20,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
]

function redact(line) {
  let result = line
  for (const pattern of KEY_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.url === '/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'live',
          pid: gatewayProcess?.pid,
          gatewayReady,
          shadowChannelReady,
        }),
      )
      return
    }

    if (req.url === '/ready' || req.url === '/health') {
      const ready = healthRequiresShadowChannel ? shadowChannelReady : gatewayReady
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: ready ? 'ready' : 'starting',
          pid: gatewayProcess?.pid,
          gatewayReady,
          shadowChannelReady,
        }),
      )
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(HEALTH_PORT, '0.0.0.0', () => {
    console.log(`[entrypoint] Health server listening on :${HEALTH_PORT}`)
  })

  return server
}

// ─── Gateway Process ────────────────────────────────────────────────────────

function findGatewayEntry() {
  const candidates = [
    '/app/node_modules/openclaw/dist/cli/index.js',
    '/app/node_modules/openclaw/openclaw.mjs',
    '/app/node_modules/.bin/openclaw',
  ]

  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return 'openclaw' // Fallback to PATH
}

function startGateway(_healthServer, configPath) {
  const entry = findGatewayEntry()
  const gatewayPort = OPENCLAW_HTTP_PORT

  console.log(`[entrypoint] Starting OpenClaw gateway: ${entry}`)
  console.log(`[entrypoint] Config: ${configPath}`)
  console.log(`[entrypoint] Gateway port: ${gatewayPort}`)

  const env = {
    ...process.env,
    // OPENCLAW_CONFIG_PATH is what OpenClaw actually reads (not OPENCLAW_CONFIG).
    // Matches the desktop app's env setup in paths.ts buildGatewayEnv().
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR: OPENCLAW_STATE_DIR,
    OPENCLAW_GATEWAY_PORT: String(gatewayPort),
    OPENCLAW_LOG_DIR: LOG_DIR,
    NODE_ENV: 'production',
    // Disable OpenClaw's self-respawn mechanism — the original process would exit
    // after spawning a child, causing our entrypoint to think the gateway crashed.
    OPENCLAW_NO_RESPAWN: '1',
    // Avoid overhead from compile-cache setup in containers
    NODE_COMPILE_CACHE: '/tmp/openclaw-compile-cache',
    // npm/npx writes cache to $HOME/.npm by default; HOME is read-only in containers,
    // so redirect to /tmp to allow ACPX backend probes (e.g. npx @zed-industries/codex-acp)
    npm_config_cache: '/tmp/npm-cache',
  }

  const proc = spawn(
    'node',
    [entry, 'gateway', '--port', String(gatewayPort), '--allow-unconfigured'],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: OPENCLAW_STATE_DIR,
    },
  )

  gatewayProcess = proc

  // Keep the container unready until the gateway has actually started the
  // Shadow channel. A fixed grace period marks pods ready while OpenClaw is
  // still installing plugin runtime deps, which causes rolling updates to drop
  // channel messages during handoff.
  gatewayGraceTimer = setTimeout(() => {
    if (!proc.killed && proc.exitCode === null) {
      console.log('[entrypoint] Gateway still starting — waiting for channel readiness')
    }
  }, 120000)

  proc.stdout.on('data', (data) => {
    const line = data.toString().trim()
    process.stdout.write(`[openclaw] ${redact(line)}\n`)

    if (line.includes('[gateway] ready') || line.includes('Gateway ready')) {
      gatewayReady = true
      console.log('[entrypoint] Gateway HTTP server is ready')
      if (!healthRequiresShadowChannel && !gatewayHealthy) {
        gatewayHealthy = true
        console.log('[entrypoint] Gateway is ready')
      }
    }

    if (
      healthRequiresShadowChannel &&
      (line.includes('[ws] ✓ Joined channel room') ||
        line.includes('[ws] Shadow channel monitor ready'))
    ) {
      shadowChannelReady = true
      clearTimeout(gatewayGraceTimer)
      if (!gatewayHealthy) {
        gatewayHealthy = true
        // Keep health server running — it now returns 200 since gatewayHealthy=true
        console.log('[entrypoint] Shadow channel is ready')
      }
    }
  })

  proc.stderr.on('data', (data) => {
    process.stderr.write(`[openclaw:err] ${redact(data.toString().trim())}\n`)
  })

  proc.on('exit', (code, signal) => {
    console.log(`[entrypoint] Gateway exited: code=${code} signal=${signal}`)
    clearTimeout(gatewayGraceTimer)
    gatewayHealthy = false
    gatewayReady = false
    shadowChannelReady = false

    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      return // Normal shutdown, signal handlers will handle process.exit
    }

    // Graceful degradation: restart the gateway instead of crashing the container
    gatewayRestarts++
    if (gatewayRestarts <= MAX_GATEWAY_RESTARTS) {
      console.log(
        `[entrypoint] Gateway crashed (${gatewayRestarts}/${MAX_GATEWAY_RESTARTS}), restarting in ${RESTART_DELAY_MS}ms...`,
      )
      setTimeout(() => {
        startGateway(_healthServer, configPath)
      }, RESTART_DELAY_MS)
    } else {
      console.log('[entrypoint] Gateway exceeded max restarts, shutting down container')
      process.exit(code ?? 1)
    }
  })

  return proc
}

// ─── Signal Handling ────────────────────────────────────────────────────────

function setupSignalHandlers() {
  const shutdown = (signal) => {
    console.log(`[entrypoint] Received ${signal}, shutting down...`)
    gatewayHealthy = false

    if (gatewayProcess && !gatewayProcess.killed) {
      gatewayProcess.kill('SIGTERM')

      // Force kill after 10s
      setTimeout(() => {
        if (gatewayProcess && !gatewayProcess.killed) {
          console.log('[entrypoint] Force killing gateway...')
          gatewayProcess.kill('SIGKILL')
        }
        process.exit(0)
      }, 10_000)
    } else {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[entrypoint] Shadow Cloud OpenClaw Runner starting...')
  console.log(`[entrypoint] Agent: ${process.env.SHADOWOB_AGENT_ID ?? 'default'}`)
  console.log(`[entrypoint] Node: ${process.version}`)

  // 1. Load config
  const mountedConfig = loadMountedConfig()
  const runtimeExtensions = loadRuntimeExtensions()
  materializeRuntimeFiles()
  applyRuntimeArtifacts(runtimeExtensions)
  materializeCredentialFiles(runtimeExtensions)
  const baseConfig = generateOpenClawConfig(mountedConfig)
  const openclawConfig = baseConfig
  healthRequiresShadowChannel =
    isPlainObject(openclawConfig.channels?.shadowob) &&
    openclawConfig.channels.shadowob.enabled !== false

  // 2. Write config. Keep generated config out of ~/.openclaw so OpenClaw's
  // state/config writer cannot clobber it and trigger a gateway reload loop.
  mkdirSync(OPENCLAW_STATE_DIR, { recursive: true })
  mkdirSync(RUNTIME_CONFIG_DIR, { recursive: true })
  const configPath = RUNTIME_CONFIG_PATH
  writeFileSync(configPath, JSON.stringify(openclawConfig, null, 2), 'utf-8')
  console.log(`[entrypoint] Config written to ${configPath}`)

  // 2b. Start live health server early. Readiness remains false until the
  // gateway has joined Shadow channel rooms.
  const healthServer = startHealthServer()

  // 2c. Ensure shared workspace directory exists
  if (SHARED_WORKSPACE_PATH) {
    mkdirSync(SHARED_WORKSPACE_PATH, { recursive: true })
    console.log(`[entrypoint] Shared workspace ready: ${SHARED_WORKSPACE_PATH}`)
  }

  // 2d. Seed default OpenClaw workspace files from the image. Running
  // `openclaw setup` in every Pod costs several seconds, so the Docker image
  // prepares this bootstrap workspace at build time.
  const workspaceDir =
    openclawConfig.agents?.defaults?.workspace ||
    SHARED_WORKSPACE_PATH ||
    join(OPENCLAW_STATE_DIR, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })
  console.log(`[entrypoint] Initializing workspace from baked bootstrap: ${workspaceDir}`)
  seedWorkspaceFromBootstrap(workspaceDir)
  syncTemplateRoutinesToOpenClawCron(openclawConfig)

  // 2e. Overlay workspace files from ConfigMap (SOUL.md, AGENTS.md, etc.)
  // These are agent-specific files generated by the cloud config builder.
  const WORKSPACE_BOOTSTRAP_FILES = [
    'SOUL.md',
    'IDENTITY.md',
    'TOOLS.md',
    'AGENTS.md',
    'USER.md',
    'HEARTBEAT.md',
    'BOOTSTRAP.md',
  ]
  for (const filename of WORKSPACE_BOOTSTRAP_FILES) {
    const srcPath = join(CONFIG_MOUNT, filename)
    if (existsSync(srcPath)) {
      const destPath = join(workspaceDir, filename)
      try {
        writeFileSync(destPath, readFileSync(srcPath, 'utf-8'), 'utf-8')
        console.log(`[entrypoint] Wrote ${filename} to workspace`)
      } catch (err) {
        console.warn(`[entrypoint] Failed to write ${filename}: ${err.message}`)
      }
    }
  }

  // 2f. Ensure skills directory exists
  if (SKILLS_DIR) {
    mkdirSync(SKILLS_DIR, { recursive: true })
    console.log(`[entrypoint] Skills directory ready: ${SKILLS_DIR}`)
  }

  // 3. Apply plugin-provided runtime metadata before chat traffic.
  applyRuntimeManifestPatches(runtimeExtensions)
  verifyExtensions()

  // 4. Start gateway
  startGateway(healthServer, configPath)

  // 5. Setup signal handlers
  setupSignalHandlers()
}

main().catch((err) => {
  console.error('[entrypoint] Fatal error:', err)
  process.exit(1)
})
