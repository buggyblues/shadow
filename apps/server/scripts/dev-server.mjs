#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync, watch } from 'node:fs'
import path from 'node:path'

const serverDir = path.resolve(import.meta.dirname, '..')
const rootDir = path.resolve(serverDir, '../..')
const cloudSourceDir = path.join(rootDir, 'apps/cloud/src')
const generatedCloudRuntimePaths = new Set([
  'application/plugin-library.generated.ts',
  'application/template-library.generated.ts',
])

try {
  process.loadEnvFile(path.join(rootDir, '.env'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const args = new Set(process.argv.slice(2))
const dbMode = args.has('--migrate') ? 'migrate' : 'push'

const debounceMs = parsePositiveIntegerEnv('SHADOWOB_SERVER_DEV_RELOAD_DEBOUNCE_MS', 1_200)
const minReloadIntervalMs = parsePositiveIntegerEnv(
  'SHADOWOB_SERVER_DEV_RELOAD_MIN_INTERVAL_MS',
  5_000,
)
const shutdownTimeoutMs = parsePositiveIntegerEnv('SHADOWOB_SERVER_DEV_SHUTDOWN_TIMEOUT_MS', 10_000)

const ignoredDirectoryNames = new Set([
  '.cache',
  '.turbo',
  '.vite',
  '.vite-temp',
  'coverage',
  'dist',
  'node_modules',
])
const watchedPaths = new Map()
const watchedFileSignatures = new Map()
const restartReasons = new Set()

let serverProcess = null
let serverPrettyProcess = null
let serverExitPromise = null
let restartTimer = null
let stopping = false
let restarting = false
let shuttingDown = false
let queuedRestart = false
let lastStartAt = 0

function parsePositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function log(message) {
  console.log(`[server-dev] ${message}`)
}

function normalizeRelative(candidate) {
  return path.relative(serverDir, candidate).split(path.sep).join('/')
}

function isIgnoredDirectory(candidate) {
  return ignoredDirectoryNames.has(path.basename(candidate))
}

function shouldRestartForPath(candidate) {
  const relativePath = normalizeRelative(candidate)
  const cloudRelativePath = path.relative(cloudSourceDir, candidate).split(path.sep).join('/')
  const supportedExtension = ['.js', '.jsx', '.json', '.ts', '.tsx'].includes(
    path.extname(candidate),
  )

  if (cloudRelativePath && !cloudRelativePath.startsWith('..')) {
    if (generatedCloudRuntimePaths.has(cloudRelativePath)) return false
    return supportedExtension
  }
  if (!relativePath || relativePath.startsWith('..')) return false
  if (relativePath.startsWith('src/db/migrations/')) return false
  if (relativePath === 'package.json') return true
  if (relativePath === 'tsconfig.json') return true
  if (relativePath === 'drizzle.config.ts') return true
  if (!relativePath.startsWith('src/')) return false

  return supportedExtension
}

function readFileSignature(candidate) {
  try {
    const stat = statSync(candidate)
    if (!stat.isFile()) return null
    return `${stat.mtimeMs}:${stat.size}:${stat.ino}`
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function rememberFileSignature(candidate) {
  if (!watchedFileSignatures.has(candidate)) {
    watchedFileSignatures.set(candidate, readFileSignature(candidate))
  }
}

function didFileChange(candidate) {
  const hadPreviousSignature = watchedFileSignatures.has(candidate)
  const previousSignature = watchedFileSignatures.get(candidate)
  const nextSignature = readFileSignature(candidate)
  watchedFileSignatures.set(candidate, nextSignature)

  // fs.watch can emit events when a file is merely opened or when a watcher
  // is first registered. Restart only after the on-disk file state changes.
  return hadPreviousSignature ? previousSignature !== nextSignature : nextSignature !== null
}

function createServerEnv(extra = {}) {
  const port = process.env.PORT ?? '3002'
  return {
    ...process.env,
    JWT_SECRET: process.env.JWT_SECRET ?? 'shadow-dev-jwt-secret-do-not-use-in-production',
    SERVER_CWD: process.env.SERVER_CWD ?? serverDir,
    SHADOWOB_SERVER_URL: process.env.SHADOWOB_SERVER_URL ?? `http://127.0.0.1:${port}`,
    SHADOWOB_AGENT_SERVER_URL:
      process.env.SHADOWOB_AGENT_SERVER_URL ?? `http://host.docker.internal:${port}`,
    ...extra,
  }
}

function spawnTsxServer(extraEnv, options = {}) {
  const prettyLogs = options.prettyLogs ?? false
  const child = spawn('tsx', ['src/index.ts'], {
    cwd: serverDir,
    env: createServerEnv(extraEnv),
    // tsx launches a worker process. Give the server tree its own process
    // group so a timed-out graceful shutdown cannot leave an orphan holding
    // active requests while the dev runner waits to restart.
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    stdio: prettyLogs ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  })
  child.on('error', (error) => {
    console.error(`[server-dev] failed to start tsx: ${error.message}`)
  })

  if (!prettyLogs) return { child, pretty: null }

  const pretty = spawn(
    'pino-pretty',
    ['--colorize', '--translateTime', 'SYS:standard', '--singleLine'],
    {
      cwd: serverDir,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  )
  pretty.on('error', (error) => {
    console.error(`[server-dev] failed to start pino-pretty: ${error.message}`)
  })
  pretty.stdin.on('error', () => {})

  child.stdout.pipe(pretty.stdin)
  child.on('close', () => {
    pretty.stdin.end()
  })

  return { child, pretty }
}

function waitForProcessClose(child) {
  return new Promise((resolve) => {
    child.once('close', (code, signal) => {
      resolve({ code, signal })
    })
  })
}

async function runBootstrap() {
  if (process.env.SHADOWOB_SERVER_DEV_BOOTSTRAP === 'false') {
    log('startup bootstrap skipped by SHADOWOB_SERVER_DEV_BOOTSTRAP=false')
    return
  }

  log(`running startup bootstrap once (${dbMode === 'push' ? 'drizzle push' : 'migrations'})`)
  const { child } = spawnTsxServer({
    DB_PUSH: dbMode === 'push' ? 'true' : 'false',
    SHADOWOB_SERVER_BOOTSTRAP_ONLY: 'true',
  })
  const { code, signal } = await waitForProcessClose(child)
  if (code !== 0) {
    throw new Error(`startup bootstrap failed with ${signal ?? `exit code ${code ?? 1}`}`)
  }
  log('startup bootstrap completed')
}

function startServer() {
  lastStartAt = Date.now()
  const { child, pretty } = spawnTsxServer(
    {
      DB_PUSH: 'false',
      SHADOWOB_SKIP_STARTUP_BOOTSTRAP: 'true',
    },
    { prettyLogs: true },
  )

  serverProcess = child
  serverPrettyProcess = pretty
  serverExitPromise = waitForProcessClose(child).then((result) => {
    if (serverProcess === child) {
      serverProcess = null
      serverPrettyProcess = null
      serverExitPromise = null
    }

    if (!stopping && !shuttingDown) {
      log(`server exited with ${result.signal ?? `exit code ${result.code ?? 1}`}`)
      log('waiting for the next file change before restarting')
    }

    return result
  })
}

async function stopServer() {
  if (!serverProcess || !serverExitPromise) return

  stopping = true
  const child = serverProcess
  const exitPromise = serverExitPromise
  let exited = false
  const killTimer = setTimeout(() => {
    if (!exited) killServerTree(child, 'SIGKILL')
  }, shutdownTimeoutMs)

  killServerTree(child, 'SIGTERM')
  try {
    await exitPromise
  } finally {
    exited = true
    clearTimeout(killTimer)
    stopping = false
  }
}

function killServerTree(child, signal) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    child.kill(signal)
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

function summarizeReasons() {
  const reasons = [...restartReasons]
  restartReasons.clear()
  const visible = reasons.slice(0, 5)
  const suffix = reasons.length > visible.length ? `, +${reasons.length - visible.length} more` : ''
  return `${visible.join(', ')}${suffix}`
}

function scheduleRestart(candidate) {
  if (shuttingDown) return

  restartReasons.add(normalizeRelative(candidate))
  const now = Date.now()
  const earliestRestartAt = Math.max(now + debounceMs, lastStartAt + minReloadIntervalMs)
  const delay = Math.max(0, earliestRestartAt - now)

  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    restartTimer = null
    void restartServer()
  }, delay)
}

async function restartServer() {
  if (stopping || restarting) {
    queuedRestart = true
    return
  }

  restarting = true
  const changedPaths = [...restartReasons]
  const reasons = summarizeReasons()
  try {
    // Keep the currently loaded cloud chunk graph alive until the server has
    // stopped. A clean tsup build can otherwise remove a lazily imported
    // chunk while an in-flight request still references it.
    await stopServer()
    if (changedPaths.some((candidate) => candidate.startsWith('../cloud/src/'))) {
      await rebuildCloudRuntime()
    }
    log(`restarting server after changes: ${reasons}`)
    if (shuttingDown) return
    startServer()
  } catch (error) {
    console.error('[server-dev] cloud runtime rebuild failed; restarting with the last build')
    console.error(error)
    if (!shuttingDown && !serverProcess) startServer()
  } finally {
    restarting = false

    if (queuedRestart && !shuttingDown) {
      queuedRestart = false
      scheduleRestart(path.join(serverDir, 'src/index.ts'))
    }
  }
}

async function rebuildCloudRuntime() {
  log('rebuilding @shadowob/cloud before server restart')
  const child = spawn('pnpm', ['--filter', '@shadowob/cloud', 'build:cli'], {
    cwd: rootDir,
    // During development, retain hashed chunks from the previous build until
    // the dev process exits. This makes lazy imports safe across rebuilds.
    env: { ...process.env, SHADOWOB_BUILD_CLEAN: '0' },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
  const { code, signal } = await waitForProcessClose(child)
  if (code !== 0) {
    throw new Error(`cloud runtime build failed with ${signal ?? `exit code ${code ?? 1}`}`)
  }
  log('cloud runtime rebuild completed')
}

function watchFile(filePath) {
  if (watchedPaths.has(filePath)) return
  rememberFileSignature(filePath)
  const watcher = watch(filePath, () => {
    if (didFileChange(filePath) && shouldRestartForPath(filePath)) scheduleRestart(filePath)
  })
  watchedPaths.set(filePath, watcher)
}

function watchDirectory(directory) {
  if (watchedPaths.has(directory) || isIgnoredDirectory(directory)) return

  const watcher = watch(directory, (eventType, filename) => {
    if (!filename) return

    const changedPath = path.join(directory, filename.toString())
    const fileChanged = didFileChange(changedPath)
    if (eventType === 'rename') {
      addWatchers(changedPath)
    }
    if (fileChanged && shouldRestartForPath(changedPath)) {
      scheduleRestart(changedPath)
    }
  })
  watchedPaths.set(directory, watcher)

  for (const entry of readdirSync(directory)) {
    addWatchers(path.join(directory, entry))
  }
}

function addWatchers(candidate) {
  if (!existsSync(candidate)) return

  const stat = statSync(candidate)
  if (stat.isDirectory()) {
    watchDirectory(candidate)
    return
  }

  if (shouldRestartForPath(candidate)) {
    watchFile(candidate)
  }
}

function startWatching() {
  for (const relativePath of ['src', 'package.json', 'tsconfig.json', 'drizzle.config.ts']) {
    addWatchers(path.join(serverDir, relativePath))
  }

  addWatchers(cloudSourceDir)

  log(
    `watching server and cloud runtime files (debounce ${debounceMs}ms, min interval ${minReloadIntervalMs}ms)`,
  )
}

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
  for (const watcher of watchedPaths.values()) watcher.close()

  log(`received ${signal}; stopping server`)
  await stopServer()
  if (serverPrettyProcess) serverPrettyProcess.kill('SIGTERM')
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

try {
  await runBootstrap()
  startWatching()
  startServer()
} catch (error) {
  console.error(error)
  process.exit(1)
}
