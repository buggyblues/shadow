/**
 * Claude Runner — container entrypoint.
 *
 * OpenClaw serves as the gateway, forwarding requests to Claude Code
 * via ACP (Agent Client Protocol) through the ACPX harness.
 *
 * 1. Read agent config from ConfigMap (/etc/openclaw/config.json)
 * 2. Merge ACP config for Claude Code harness
 * 3. Write OpenClaw config to ~/.openclaw/openclaw.json
 * 4. Verify extensions (shadowob plugin)
 * 5. Start OpenClaw gateway (which manages Claude Code via ACP)
 * 6. Health check endpoint
 * 7. Graceful shutdown
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const OPENCLAW_STATE_DIR = '/home/openclaw/.openclaw'
const CONFIG_MOUNT = '/etc/openclaw'
const EXTENSIONS_DIR = '/app/extensions'
const GATEWAY_PORT = parseInt(process.env.OPENCLAW_GATEWAY_PORT ?? '3100', 10)
const LOG_DIR = '/var/log/openclaw'
const WORKSPACE_DIR = '/workspace'

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

function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{env:([^}]+)\}/g, (_, key) => process.env[key] ?? '')
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars)
  if (obj !== null && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value)
    }
    return result
  }
  return obj
}

// ─── OpenClaw + ACP Config Generation ───────────────────────────────────────

function generateOpenClawConfig(mountedConfig) {
  const config = resolveEnvVars(mountedConfig)

  // Ensure ACP is configured for Claude Code harness
  if (!config.acp) {
    config.acp = {}
  }
  config.acp.enabled = config.acp.enabled ?? true
  config.acp.backend = config.acp.backend ?? 'acpx'
  config.acp.defaultAgent = config.acp.defaultAgent ?? config.agents?.list?.[0]?.id ?? 'default'
  config.acp.allowedAgents = config.acp.allowedAgents ?? [config.acp.defaultAgent]

  // Ensure ACPX plugin is enabled
  if (!config.plugins) {
    config.plugins = {}
  }
  if (!config.plugins.entries) {
    config.plugins.entries = {}
  }
  config.plugins.entries.acpx = {
    enabled: true,
    ...config.plugins.entries.acpx,
  }

  // Configure agent runtime to use ACP → Claude Code
  if (config.agents?.list) {
    for (const agent of config.agents.list) {
      if (!agent.runtime) {
        agent.runtime = {
          type: 'acp',
          acp: {
            agent: 'claude',
            backend: 'acpx',
            mode: 'persistent',
            cwd: WORKSPACE_DIR,
          },
        }
      }
    }
  }

  // Ensure extensions directory is configured
  if (!config.extensions) {
    config.extensions = {}
  }
  config.extensions.searchPaths = [EXTENSIONS_DIR]

  // Set gateway config for container environment
  if (!config.gateway) {
    config.gateway = {}
  }
  config.gateway.port = GATEWAY_PORT
  config.gateway.host = '0.0.0.0'

  return config
}

// ─── Extension Verification ─────────────────────────────────────────────────

function verifyExtensions() {
  if (!existsSync(EXTENSIONS_DIR)) {
    console.log('[entrypoint] No extensions directory')
    return
  }

  const extensions = readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  console.log(`[entrypoint] Found ${extensions.length} extension(s): ${extensions.join(', ')}`)

  const shadowobDir = join(EXTENSIONS_DIR, 'shadowob')
  if (existsSync(shadowobDir)) {
    const hasEntry =
      existsSync(join(shadowobDir, 'index.mjs')) ||
      existsSync(join(shadowobDir, 'dist', 'index.js'))
    if (hasEntry) {
      console.log('[entrypoint] ✓ shadowob plugin verified')
    } else {
      console.warn('[entrypoint] ⚠ shadowob plugin missing entry point')
    }
  }

  // Verify Claude Code CLI is available
  const claudeBin = '/app/node_modules/.bin/claude'
  if (existsSync(claudeBin)) {
    console.log('[entrypoint] ✓ Claude Code CLI verified')
  } else {
    console.warn('[entrypoint] ⚠ Claude Code CLI not found at', claudeBin)
  }
}

// ─── Health Check Server ────────────────────────────────────────────────────

let gatewayHealthy = false
let gatewayProcess = null
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
    if (req.url === '/health') {
      if (gatewayHealthy) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ status: 'healthy', pid: gatewayProcess?.pid, runtime: 'claude-runner' }),
        )
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'starting', runtime: 'claude-runner' }))
      }
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

function findGatewayEntry() {
  const candidates = [
    '/app/node_modules/openclaw/dist/cli/index.js',
    '/app/node_modules/openclaw/openclaw.mjs',
    '/app/node_modules/.bin/openclaw',
  ]

  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return 'openclaw'
}

function startGateway(healthServer) {
  const entry = findGatewayEntry()
  const configPath = join(OPENCLAW_STATE_DIR, 'openclaw.json')
  const gatewayPort = GATEWAY_PORT + 1

  console.log(`[entrypoint] Starting OpenClaw gateway with ACP → Claude Code`)
  console.log(`[entrypoint] Config: ${configPath}`)
  console.log(`[entrypoint] Gateway port: ${gatewayPort}`)

  const env = {
    ...process.env,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR: OPENCLAW_STATE_DIR,
    OPENCLAW_GATEWAY_PORT: String(gatewayPort),
    OPENCLAW_LOG_DIR: LOG_DIR,
    // Claude Code env
    CLAUDE_CONFIG_DIR: '/home/openclaw/.claude',
    NODE_ENV: 'production',
    OPENCLAW_NO_RESPAWN: '1',
    NODE_COMPILE_CACHE: '/tmp/openclaw-compile-cache',
  }

  // Pass through API key if configured
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  }

  const proc = spawn('node', [entry, 'gateway', '--port', String(gatewayPort)], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: OPENCLAW_STATE_DIR,
  })

  gatewayProcess = proc

  proc.stdout.on('data', (data) => {
    const line = data.toString().trim()
    process.stdout.write(`[openclaw] ${redact(line)}\n`)

    if (line.includes('Gateway ready') || line.includes('listening on')) {
      gatewayHealthy = true
      console.log('[entrypoint] Gateway is ready (ACP → Claude Code)')
    }
  })

  proc.stderr.on('data', (data) => {
    process.stderr.write(`[openclaw:err] ${redact(data.toString().trim())}\n`)
  })

  proc.on('exit', (code, signal) => {
    console.log(`[entrypoint] Gateway exited: code=${code} signal=${signal}`)
    gatewayHealthy = false

    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      return // Normal shutdown
    }

    // Graceful degradation: restart instead of crashing
    gatewayRestarts++
    if (gatewayRestarts <= MAX_GATEWAY_RESTARTS) {
      console.log(
        `[entrypoint] Gateway crashed (${gatewayRestarts}/${MAX_GATEWAY_RESTARTS}), restarting in ${RESTART_DELAY_MS}ms...`,
      )
      setTimeout(() => {
        startGateway(healthServer)
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

// ─── Workspace Initialization ───────────────────────────────────────────────

const WORKSPACE_BOOTSTRAP_FILES = [
  'SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'AGENTS.md',
  'USER.md', 'HEARTBEAT.md', 'BOOTSTRAP.md',
]

function initializeWorkspace(workspaceDir, configPath) {
  if (!workspaceDir) return
  mkdirSync(workspaceDir, { recursive: true })

  // Run `openclaw setup` to seed workspace with internal bootstrap templates
  console.log(`[entrypoint] Initializing workspace: ${workspaceDir}`)
  const setupResult = spawnSync('openclaw', ['setup', '--workspace', workspaceDir], {
    env: { ...process.env, OPENCLAW_CONFIG_PATH: configPath, HOME: '/home/openclaw' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  })
  if (setupResult.status === 0) {
    console.log('[entrypoint] \u2713 openclaw setup completed')
  } else {
    const stderr = setupResult.stderr?.toString().trim()
    console.warn(`[entrypoint] \u26a0 openclaw setup exited ${setupResult.status}: ${stderr || '(no output)'}`)
  }

  // Overlay agent-specific files from ConfigMap over bootstrap defaults
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
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[entrypoint] Shadow Cloud Claude Runner starting...')
  console.log('[entrypoint] Runtime: OpenClaw gateway + ACP → Claude Code')
  console.log(`[entrypoint] Agent: ${process.env.AGENT_ID ?? 'default'}`)
  console.log(`[entrypoint] Node: ${process.version}`)

  // 1. Load config
  const mountedConfig = loadMountedConfig()
  const openclawConfig = generateOpenClawConfig(mountedConfig)

  // 2. Write config
  mkdirSync(OPENCLAW_STATE_DIR, { recursive: true })
  mkdirSync(WORKSPACE_DIR, { recursive: true })
  mkdirSync(LOG_DIR, { recursive: true })
  const configPath = join(OPENCLAW_STATE_DIR, 'openclaw.json')
  writeFileSync(configPath, JSON.stringify(openclawConfig, null, 2), 'utf-8')
  console.log(`[entrypoint] Config written to ${configPath}`)

  // 2b. Initialize workspace (openclaw setup + ConfigMap overlay)
  const workspaceDir = openclawConfig.agents?.defaults?.workspace || WORKSPACE_DIR
  initializeWorkspace(workspaceDir, configPath)

  // 3. Verify extensions + Claude Code
  verifyExtensions()

  // 4. Start health server (temporary, until gateway is ready)
  const healthServer = startHealthServer()

  // 5. Start OpenClaw gateway (manages Claude Code via ACP)
  const proc = startGateway(healthServer)

  // 6. Setup signal handlers
  setupSignalHandlers(proc)
}

main().catch((err) => {
  console.error('[entrypoint] Fatal error:', err)
  process.exit(1)
})
