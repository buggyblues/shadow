/**
 * Hermes runner entrypoint.
 *
 * Materializes generated Hermes files and starts `hermes gateway` with the
 * ShadowOB platform plugin enabled.
 */

import { spawn, spawnSync } from 'node:child_process'
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

const RUNTIME_NAME = 'hermes-runner'
const CONFIG_MOUNT = process.env.SHADOW_RUNNER_CONFIG_MOUNT ?? '/etc/openclaw'
const RUNTIME_FILES_PATH = join(CONFIG_MOUNT, 'runtime-files.json')
const RUNTIME_EXTENSIONS_PATH = join(CONFIG_MOUNT, 'runtime-extensions.json')
const RUNNER_HOME = process.env.HOME ?? '/home/shadow'
const HEALTH_PORT = Number.parseInt(
  process.env.SHADOW_RUNNER_HEALTH_PORT ?? process.env.OPENCLAW_GATEWAY_PORT ?? '3100',
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

function startHermes() {
  mkdirSync(LOG_DIR, { recursive: true })
  const proc = spawn('hermes', ['gateway'], {
    env: {
      ...process.env,
      HERMES_HOME: process.env.HERMES_HOME ?? join(RUNNER_HOME, '.hermes'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: '/workspace',
  })
  child = proc
  proc.stdout.on('data', (chunk) => process.stdout.write(redact(chunk.toString())))
  proc.stderr.on('data', (chunk) => process.stderr.write(redact(chunk.toString())))
  proc.on('exit', (code, signal) => {
    ready = false
    console.error(`[entrypoint] hermes exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    process.exit(code ?? 1)
  })
  setTimeout(() => {
    if (!proc.killed) ready = true
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
