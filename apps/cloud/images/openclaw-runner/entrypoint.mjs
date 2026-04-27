/**
 * OpenClaw Runner — container entrypoint.
 *
 * 1. Read agent config from ConfigMap (/etc/openclaw/config.json)
 * 2. Resolve ${env:VAR} references from environment
 * 3. Write OpenClaw config to ~/.openclaw/openclaw.json
 * 4. Verify extensions are loaded
 * 5. Start OpenClaw gateway
 * 6. Forward signals for graceful shutdown
 */

import { spawn, spawnSync } from 'node:child_process'
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { basename, join } from 'node:path'

const OPENCLAW_STATE_DIR = '/home/openclaw/.openclaw'
const CONFIG_MOUNT = '/etc/openclaw'
const EXTENSIONS_DIR = '/app/extensions'
const RUNTIME_EXTENSIONS_PATH = join(CONFIG_MOUNT, 'runtime-extensions.json')
const GATEWAY_PORT = parseInt(process.env.OPENCLAW_GATEWAY_PORT ?? '3100', 10)
const OPENCLAW_HTTP_PORT = GATEWAY_PORT + 1
const LOG_DIR = '/var/log/openclaw'
const SHARED_WORKSPACE_PATH = process.env.SHARED_WORKSPACE_PATH ?? ''
const SKILLS_DIR = process.env.SKILLS_DIR ?? ''
const RUNTIME_DEPS_WARM_SCRIPT = '/app/warm-runtime-deps.mjs'
const DEFAULT_PLUGIN_STAGE_DIR = '/opt/openclaw-runtime-deps'
let runtimeDepsStageDir = process.env.OPENCLAW_PLUGIN_STAGE_DIR || DEFAULT_PLUGIN_STAGE_DIR

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

function runtimeArtifactPath(runtimeExtensions, kind) {
  const artifacts = Array.isArray(runtimeExtensions?.artifacts) ? runtimeExtensions.artifacts : []
  const artifact = artifacts.find((item) => item?.kind === kind && typeof item.path === 'string')
  return artifact?.path
}

function applyRuntimeArtifacts(runtimeExtensions) {
  const slashIndexPath =
    runtimeArtifactPath(runtimeExtensions, 'shadow.slashCommands') ??
    runtimeExtensions?.slashCommands?.indexPath
  if (typeof slashIndexPath === 'string' && slashIndexPath.trim()) {
    process.env.SHADOW_SLASH_COMMANDS_PATH = slashIndexPath.trim()
    console.log(`[entrypoint] Slash command index: ${slashIndexPath.trim()}`)
  }
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

  // Set gateway port. The runner health server uses GATEWAY_PORT, so OpenClaw
  // itself must bind to the adjacent port in both CLI args and persisted config.
  if (!config.gateway) {
    config.gateway = {}
  }
  config.gateway.port = OPENCLAW_HTTP_PORT
  // Use "lan" bind (0.0.0.0) so the gateway is reachable from outside the container.
  config.gateway.bind = 'lan'
  // Ensure gateway.mode is set — required by OpenClaw to start without cloud setup
  if (!config.gateway.mode) {
    config.gateway.mode = 'local'
  }
  // LAN binding requires authentication — use token mode with auto-generated token.
  if (!config.gateway.auth) {
    config.gateway.auth = {}
  }
  if (!config.gateway.auth.mode || config.gateway.auth.mode === 'none') {
    config.gateway.auth.mode = 'token'
  }

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

  return config
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

  server.listen(GATEWAY_PORT, '0.0.0.0', () => {
    console.log(`[entrypoint] Health server listening on :${GATEWAY_PORT}`)
  })

  return server
}

// ─── Gateway Process ────────────────────────────────────────────────────────

function clearStaleRuntimeDependencyLocks() {
  const depsRoots = [runtimeDepsStageDir, join(OPENCLAW_STATE_DIR, 'plugin-runtime-deps')].filter(
    (entry, index, values) => entry && values.indexOf(entry) === index,
  )

  for (const depsRoot of depsRoots) {
    if (!existsSync(depsRoot)) continue

    for (const runtimeDir of listChildDirs(depsRoot)) {
      const lockDir = join(runtimeDir, '.openclaw-runtime-deps.lock')
      if (!existsSync(lockDir)) continue

      let ownerPid = null
      try {
        const owner = JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf-8'))
        if (typeof owner.pid === 'number') ownerPid = owner.pid
      } catch {
        // Treat unreadable lock metadata as stale; the gateway will recreate it.
      }

      const ownerAlive = ownerPid !== null && existsSync(`/proc/${ownerPid}`)
      if (!ownerAlive) {
        rmSync(lockDir, { recursive: true, force: true })
        console.log(`[entrypoint] Removed stale OpenClaw runtime dependency lock: ${lockDir}`)
      }
    }
  }
}

function prepareWritableRuntimeDepsStage() {
  const imageStageDir = DEFAULT_PLUGIN_STAGE_DIR
  const writableStageDir = join(OPENCLAW_STATE_DIR, 'plugin-runtime-deps')
  const explicitStageDir = process.env.OPENCLAW_PLUGIN_STAGE_DIR

  if (explicitStageDir && explicitStageDir !== imageStageDir) {
    runtimeDepsStageDir = explicitStageDir
    return
  }

  mkdirSync(writableStageDir, { recursive: true })
  if (existsSync(imageStageDir)) {
    for (const runtimeDir of listChildDirs(imageStageDir)) {
      const dest = join(writableStageDir, basename(runtimeDir))
      if (existsSync(dest)) continue
      try {
        cpSync(runtimeDir, dest, { recursive: true, dereference: false })
        console.log(`[entrypoint] Seeded OpenClaw runtime deps from image: ${dest}`)
      } catch (err) {
        console.warn(`[entrypoint] Failed to seed runtime deps ${dest}: ${err.message}`)
      }
    }
  }
  runtimeDepsStageDir = writableStageDir
}

function runRuntimeDepsWarmup(configPath, stageDir) {
  if (!existsSync(RUNTIME_DEPS_WARM_SCRIPT)) {
    return { ok: false, reason: 'Bundled runtime dependency warmup script is missing' }
  }

  const timeout = Number.parseInt(process.env.OPENCLAW_RUNTIME_DEPS_WARM_TIMEOUT_MS ?? '240000', 10)
  const env = {
    ...process.env,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR,
    OPENCLAW_PLUGIN_STAGE_DIR: stageDir,
    HOME: '/home/openclaw',
    NODE_ENV: 'production',
    npm_config_cache: '/tmp/npm-cache',
  }

  console.log(`[entrypoint] Warming OpenClaw bundled runtime dependencies in ${stageDir}...`)
  const result = spawnSync('node', [RUNTIME_DEPS_WARM_SCRIPT, configPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  })

  const stdout = result.stdout?.toString().trim()
  if (stdout) {
    for (const line of stdout.split('\n')) process.stdout.write(`${redact(line)}\n`)
  }
  const stderr = result.stderr?.toString().trim()
  if (stderr) {
    for (const line of stderr.split('\n')) process.stderr.write(`${redact(line)}\n`)
  }

  if (result.error) {
    return { ok: false, reason: result.error.message }
  }
  if (result.status !== 0) {
    return { ok: false, reason: `exited ${result.status}` }
  }
  return { ok: true }
}

function warmBundledPluginRuntimeDeps(configPath) {
  if (process.env.OPENCLAW_SKIP_RUNTIME_DEPS_WARMUP === '1') {
    console.log('[entrypoint] Skipping bundled runtime dependency warmup')
    return
  }

  const preferredStageDir = runtimeDepsStageDir
  const first = runRuntimeDepsWarmup(configPath, preferredStageDir)
  if (first.ok) {
    runtimeDepsStageDir = preferredStageDir
    console.log('[entrypoint] ✓ bundled runtime dependencies warmed')
    return
  }

  const fallbackStageDir = join(OPENCLAW_STATE_DIR, 'plugin-runtime-deps')
  console.warn(
    `[entrypoint] Runtime dependency warmup in ${preferredStageDir} failed: ${first.reason}`,
  )
  if (preferredStageDir === fallbackStageDir) return

  const fallback = runRuntimeDepsWarmup(configPath, fallbackStageDir)
  if (fallback.ok) {
    runtimeDepsStageDir = fallbackStageDir
    console.log('[entrypoint] ✓ bundled runtime dependencies warmed in writable state dir')
    return
  }
  console.warn(`[entrypoint] Runtime dependency fallback warmup failed: ${fallback.reason}`)
}

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

function startGateway(_healthServer) {
  clearStaleRuntimeDependencyLocks()

  const entry = findGatewayEntry()
  const configPath = join(OPENCLAW_STATE_DIR, 'openclaw.json')
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
    OPENCLAW_PLUGIN_STAGE_DIR: runtimeDepsStageDir,
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
        startGateway(_healthServer)
      }, RESTART_DELAY_MS)
    } else {
      console.log('[entrypoint] Gateway exceeded max restarts, shutting down container')
      process.exit(code ?? 1)
    }
  })

  return proc
}

// ─── Signal Handling ────────────────────────────────────────────────────────

function setupSignalHandlers(proc) {
  const shutdown = (signal) => {
    console.log(`[entrypoint] Received ${signal}, shutting down...`)
    gatewayHealthy = false

    if (proc && !proc.killed) {
      proc.kill('SIGTERM')

      // Force kill after 10s
      setTimeout(() => {
        if (!proc.killed) {
          console.log('[entrypoint] Force killing gateway...')
          proc.kill('SIGKILL')
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
  console.log(`[entrypoint] Agent: ${process.env.AGENT_ID ?? 'default'}`)
  console.log(`[entrypoint] Node: ${process.version}`)

  // 1. Load config
  const mountedConfig = loadMountedConfig()
  const runtimeExtensions = loadRuntimeExtensions()
  applyRuntimeArtifacts(runtimeExtensions)
  const baseConfig = generateOpenClawConfig(mountedConfig)
  const openclawConfig = baseConfig
  healthRequiresShadowChannel =
    isPlainObject(openclawConfig.channels?.shadowob) &&
    openclawConfig.channels.shadowob.enabled !== false

  // 2. Write config
  mkdirSync(OPENCLAW_STATE_DIR, { recursive: true })
  const configPath = join(OPENCLAW_STATE_DIR, 'openclaw.json')
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

  // 2d. Run `openclaw setup` to initialize workspace with bootstrap files.
  // This seeds AGENTS.md, SOUL.md, IDENTITY.md, etc. from OpenClaw's internal templates.
  const workspaceDir =
    openclawConfig.agents?.defaults?.workspace ||
    SHARED_WORKSPACE_PATH ||
    join(OPENCLAW_STATE_DIR, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })
  console.log(`[entrypoint] Initializing workspace: ${workspaceDir}`)
  const setupResult = spawnSync('openclaw', ['setup', '--workspace', workspaceDir], {
    env: { ...process.env, OPENCLAW_CONFIG_PATH: configPath, HOME: '/home/openclaw' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  })
  if (setupResult.status === 0) {
    console.log('[entrypoint] ✓ openclaw setup completed')
  } else {
    const stderr = setupResult.stderr?.toString().trim()
    console.warn(
      `[entrypoint] ⚠ openclaw setup exited ${setupResult.status}: ${stderr || '(no output)'}`,
    )
  }

  // 2e. Overlay workspace files from ConfigMap (SOUL.md, AGENTS.md, etc.)
  // These are agent-specific files generated by the cloud config builder that
  // override the default bootstrap files created by `openclaw setup`.
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

  // 3. Apply plugin-provided runtime metadata, then pre-stage plugin runtime deps
  // before chat traffic.
  applyRuntimeManifestPatches(runtimeExtensions)
  verifyExtensions()
  prepareWritableRuntimeDepsStage()
  warmBundledPluginRuntimeDeps(configPath)

  // 4. Start gateway
  const proc = startGateway(healthServer)

  // 5. Setup signal handlers
  setupSignalHandlers(proc)
}

main().catch((err) => {
  console.error('[entrypoint] Fatal error:', err)
  process.exit(1)
})
