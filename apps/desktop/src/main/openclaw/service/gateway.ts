/**
 * OpenClaw Gateway Service
 *
 * Manages the built-in OpenClaw gateway process lifecycle.
 * The gateway runs as a child process spawned from the bundled OpenClaw package.
 *
 * State Machine:
 *   offline → installing → starting → bootstrapping → running
 *   running → stopping → offline
 *   any → error → offline (via restart)
 *
 * Key isolation guarantees:
 * - Entry point is resolved ONLY from bundled/dev package (never system PATH)
 * - Data directory is locked to ~/.shadowob via env vars
 * - Gateway token is generated per-session (never reused from system config)
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GatewayLogEntry, GatewayState, GatewayStatus } from '../types'
import type { ConfigService } from './config'
import type { OpenClawPaths } from './paths'
import { resolveElectronNodeBinary } from './paths'

const HEALTH_CHECK_INTERVAL = 15_000
const MAX_RESTART_ATTEMPTS = 5
const RESTART_BACKOFF_BASE = 2_000
const DEFAULT_REQUIRED_NODE_VERSION = '22.16.0'

interface GatewayRunner {
  command: string
  args: string[]
  env: Record<string, string>
  mode: 'electron-run-as-node' | 'system-node'
  nodeVersion: string
}

export class GatewayService {
  private gatewayProcess: ChildProcess | null = null
  private currentState: GatewayState = 'offline'
  private port: number | null = null
  private token: string | null = null
  private startedAt: number | null = null
  private restartAttempts = 0
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private reloadDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private statusCallbacks = new Set<(status: GatewayStatus) => void>()
  private logCallbacks = new Set<(entry: GatewayLogEntry) => void>()
  private logBuffer: GatewayLogEntry[] = []
  private static readonly LOG_BUFFER_SIZE = 1000

  constructor(
    private paths: OpenClawPaths,
    private config: ConfigService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  getStatus(): GatewayStatus {
    return {
      state: this.currentState,
      port: this.port,
      pid: this.gatewayProcess?.pid ?? null,
      uptime: this.startedAt ? Date.now() - this.startedAt : null,
      version: this.getInstalledVersion(),
      gatewayToken: this.token,
      error: null,
      lastStartedAt: this.startedAt,
    }
  }

  onStatusChange(callback: (status: GatewayStatus) => void): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  onLog(callback: (entry: GatewayLogEntry) => void): () => void {
    this.logCallbacks.add(callback)
    return () => this.logCallbacks.delete(callback)
  }

  /** Retrieve recent log entries from the in-memory ring buffer. */
  getRecentLogs(limit = 500): GatewayLogEntry[] {
    if (limit >= this.logBuffer.length) return [...this.logBuffer]
    return this.logBuffer.slice(-limit)
  }

  isInstalled(): boolean {
    return this.paths.resolveOpenClawPackage() !== null
  }

  async install(): Promise<boolean> {
    if (this.isInstalled()) {
      this.emitLog('info', 'OpenClaw is already installed')
      return true
    }

    this.setState('installing')
    this.emitLog('info', 'Installing OpenClaw plugin...')

    return new Promise((resolve) => {
      const openclawDir = this.paths.root
      const npmArgs = ['install', '@shadowob/openclaw-shadowob@latest', '--save']

      const pkgJsonPath = join(openclawDir, 'package.json')
      if (!existsSync(pkgJsonPath)) {
        writeFileSync(
          pkgJsonPath,
          JSON.stringify({ name: 'openclaw-workspace', private: true, type: 'module' }, null, 2),
          'utf-8',
        )
      }

      const child = spawn('npm', npmArgs, {
        cwd: openclawDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      })

      let stderr = ''

      child.stdout?.on('data', (data: Buffer) => {
        this.emitLog('info', data.toString().trim(), 'openclaw')
      })

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
        this.emitLog('warn', data.toString().trim(), 'openclaw')
      })

      child.on('close', (code) => {
        if (code === 0) {
          this.emitLog('info', 'OpenClaw installed successfully')
          resolve(true)
        } else {
          this.emitLog('error', `Installation failed (code ${code}): ${stderr}`)
          this.setState('error', `Installation failed: ${stderr.slice(0, 200)}`)
          resolve(false)
        }
      })

      child.on('error', (err) => {
        this.emitLog('error', `Installation error: ${err.message}`)
        this.setState('error', err.message)
        resolve(false)
      })
    })
  }

  async start(): Promise<boolean> {
    if (
      this.currentState === 'running' ||
      this.currentState === 'starting' ||
      this.currentState === 'bootstrapping'
    ) {
      this.emitLog('info', 'Gateway is already running or starting')
      return this.currentState === 'running'
    }

    // Clear any pending restart when starting explicitly
    this.clearScheduledRestart()

    if (!this.isInstalled()) {
      const installed = await this.install()
      if (!installed) return false
    }

    this.setState('starting')
    this.emitLog('info', 'Starting OpenClaw gateway...')

    try {
      const config = this.config.read()

      const port = await this.findAvailablePort()
      const entryPoint = this.paths.resolveGatewayEntry()
      if (!entryPoint) {
        this.setState('error', 'Cannot find OpenClaw gateway entry point')
        this.emitLog('error', 'Gateway entry point not found')
        return false
      }

      // Use persistent auth token from config (stable across restarts)
      const token = config.gateway?.auth?.token || this.generateToken()
      this.token = token

      // Build env with model provider API keys
      const extraEnv: Record<string, string> = {}
      const providers = config.models.providers ?? {}
      for (const [providerId, provider] of Object.entries(providers)) {
        if (provider.apiKey) {
          const envKey = `${providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
          extraEnv[envKey] = provider.apiKey
        }
      }

      const baseEnv = this.paths.buildGatewayEnv(port, token, extraEnv)
      const runner = this.resolveRunner(entryPoint, port, token, baseEnv)

      if (runner.mode === 'electron-run-as-node') {
        this.emitLog('info', `Using Electron run-as-node: ${runner.command}`)
      } else {
        this.emitLog(
          'warn',
          `Electron Node ${process.versions.node} is below OpenClaw requirement; falling back to Node ${runner.nodeVersion} (${runner.command})`,
        )
      }

      // Spawn gateway as a plain Node.js process using ELECTRON_RUN_AS_NODE.
      // Using the Electron Helper binary avoids macOS Dock icons.
      // NOTE: utilityProcess.fork() is NOT used because it initialises a full
      // Chromium content layer which requires Helper (GPU/Plugin/Renderer) apps
      // to be resolvable by name — this fails in dev (name mismatch) and in
      // packaged builds (code-signature constraints), producing the FATAL
      // "Unable to find helper app" crash.
      this.gatewayProcess = spawn(runner.command, runner.args, {
        cwd: this.paths.root,
        env: runner.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const gatewayProcess = this.gatewayProcess
      if (!gatewayProcess) {
        this.setState('error', 'Failed to spawn gateway process')
        return false
      }

      this.port = port
      this.startedAt = Date.now()

      return new Promise((resolve) => {
        gatewayProcess.stdout?.on('data', (data: Buffer) => {
          const msg = data.toString().trim()
          if (msg) this.emitLog('info', msg, 'gateway')

          if (msg.includes('Gateway ready') || msg.includes('listening on')) {
            this.setState('running')
            this.restartAttempts = 0
            this.startHealthCheck()
            resolve(true)
          }
        })

        gatewayProcess.stderr?.on('data', (data: Buffer) => {
          const msg = data.toString().trim()
          if (msg) this.emitLog('warn', msg, 'gateway')
        })

        gatewayProcess.on('exit', (code) => {
          this.emitLog('info', `Gateway process exited with code ${code}`, 'gateway')
          this.gatewayProcess = null
          this.port = null
          this.token = null
          this.stopHealthCheck()

          if (this.currentState !== 'stopping') {
            this.setState('offline')
            this.scheduleRestart()
          } else {
            this.setState('offline')
          }
        })

        gatewayProcess.on('error', (err: Error) => {
          this.emitLog('error', `Gateway error: ${err.message}`, 'gateway')
          this.setState('error', err.message)
          resolve(false)
        })

        this.setState('bootstrapping')

        setTimeout(() => {
          if (this.currentState === 'bootstrapping' || this.currentState === 'starting') {
            this.emitLog('warn', 'Gateway startup timed out after 60s')
            resolve(false)
          }
        }, 60_000)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.setState('error', msg)
      this.emitLog('error', `Failed to start gateway: ${msg}`)
      return false
    }
  }

  async stop(): Promise<void> {
    if (!this.gatewayProcess) {
      this.setState('offline')
      return
    }

    this.setState('stopping')
    this.emitLog('info', 'Stopping OpenClaw gateway...')
    this.stopHealthCheck()
    this.clearScheduledRestart()

    return new Promise((resolve) => {
      if (!this.gatewayProcess) {
        this.setState('offline')
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        try {
          this.gatewayProcess?.kill('SIGKILL')
        } catch {
          /* already dead */
        }
        this.gatewayProcess = null
        this.port = null
        this.token = null
        this.startedAt = null
        this.setState('offline')
        resolve()
      }, 10_000)

      this.gatewayProcess.once('exit', () => {
        clearTimeout(timeout)
        this.gatewayProcess = null
        this.port = null
        this.token = null
        this.startedAt = null
        this.setState('offline')
        resolve()
      })

      this.gatewayProcess.kill()
    })
  }

  async restart(): Promise<boolean> {
    await this.stop()
    return this.start()
  }

  /** Signal the running gateway to reload config (debounced to avoid rapid SIGHUP spam) */
  signalConfigReload(): void {
    if (this.reloadDebounceTimer) clearTimeout(this.reloadDebounceTimer)
    this.reloadDebounceTimer = setTimeout(() => {
      this.reloadDebounceTimer = null
      if (this.gatewayProcess && this.currentState === 'running') {
        try {
          this.gatewayProcess.kill('SIGHUP')
          this.emitLog('info', 'Sent SIGHUP to gateway for config reload')
        } catch {
          this.emitLog('warn', 'Failed to signal config reload to gateway')
        }
      }
    }, 500)
  }

  cleanup(): void {
    this.stopHealthCheck()
    this.clearScheduledRestart()
    if (this.reloadDebounceTimer) {
      clearTimeout(this.reloadDebounceTimer)
      this.reloadDebounceTimer = null
    }
    if (this.gatewayProcess) {
      this.gatewayProcess.kill()
      this.gatewayProcess = null
    }
    this.token = null
  }

  // ─── Private: Version Detection ───────────────────────────────────────────

  private getInstalledVersion(): string | null {
    try {
      const pkgPath = this.paths.resolveOpenClawPackage('package.json')
      if (!pkgPath || !existsSync(pkgPath)) return null
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      return pkg.version ?? null
    } catch {
      return null
    }
  }

  private getRequiredNodeVersion(): string {
    try {
      const pkgPath = this.paths.resolveOpenClawPackage('package.json')
      if (!pkgPath || !existsSync(pkgPath)) return DEFAULT_REQUIRED_NODE_VERSION
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { engines?: { node?: string } }
      const engine = pkg.engines?.node
      if (!engine) return DEFAULT_REQUIRED_NODE_VERSION
      const match = engine.match(/(\d+\.\d+\.\d+)/)
      return match?.[1] ?? DEFAULT_REQUIRED_NODE_VERSION
    } catch {
      return DEFAULT_REQUIRED_NODE_VERSION
    }
  }

  // ─── Private: Runner Resolution ───────────────────────────────────────────

  private resolveRunner(
    entryPoint: string,
    port: number,
    token: string,
    baseEnv: Record<string, string>,
  ): GatewayRunner {
    const required = this.getRequiredNodeVersion()
    const electronNodeVersion = process.versions.node
    const resolvedElectronBinary = resolveElectronNodeBinary()

    if (this.isVersionGte(electronNodeVersion, required)) {
      // Use the Electron Helper binary with ELECTRON_RUN_AS_NODE — runs as plain
      // Node.js, no Chromium layer, no Dock icon on macOS.
      return {
        command: resolvedElectronBinary,
        args: [entryPoint, 'gateway', '--port', String(port), '--token', token],
        env: { ...baseEnv, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1' },
        mode: 'electron-run-as-node',
        nodeVersion: electronNodeVersion,
      }
    }

    // Fallback to system node (NOT system openclaw — we still use our entry point)
    const candidates = [
      process.env.OPENCLAW_NODE_PATH,
      'node',
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
    ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

    for (const candidate of candidates) {
      const version = this.readNodeVersion(candidate)
      if (version && this.isVersionGte(version, required)) {
        return {
          command: candidate,
          args: [entryPoint, 'gateway', '--port', String(port), '--token', token],
          env: baseEnv,
          mode: 'system-node',
          nodeVersion: version,
        }
      }
    }

    return {
      command: resolvedElectronBinary,
      args: [entryPoint, 'gateway', '--port', String(port), '--token', token],
      env: { ...baseEnv, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1' },
      mode: 'electron-run-as-node',
      nodeVersion: electronNodeVersion,
    }
  }

  private readNodeVersion(command: string): string | null {
    try {
      const { execFileSync } = require('node:child_process')
      const out = execFileSync(command, ['-p', 'process.versions.node'], {
        encoding: 'utf-8',
        env: process.env,
        shell: false,
        timeout: 3_000,
      })
      return String(out).trim() || null
    } catch {
      return null
    }
  }

  // ─── Private: Health Check ────────────────────────────────────────────────

  private startHealthCheck(): void {
    this.stopHealthCheck()
    this.healthCheckTimer = setInterval(() => {
      const proc = this.gatewayProcess
      if (!proc || proc.killed || !proc.pid) {
        this.emitLog('warn', 'Gateway process is not alive, scheduling restart')
        this.stopHealthCheck()
        this.scheduleRestart()
        return
      }

      if (!this.port) return
      try {
        const { request } = require('node:http')
        const req = request({
          hostname: '127.0.0.1',
          port: this.port,
          path: '/health',
          method: 'GET',
          timeout: 5000,
        })
        req.on('error', () => {
          this.emitLog('warn', 'Health check failed, gateway may be unresponsive')
        })
        req.end()
      } catch {
        this.emitLog('warn', 'Failed to health-check gateway')
      }
    }, HEALTH_CHECK_INTERVAL)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  // ─── Private: Restart Logic ───────────────────────────────────────────────

  private scheduleRestart(): void {
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.emitLog('error', `Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached, giving up`)
      this.setState('error', 'Gateway crashed repeatedly. Please restart manually.')
      this.restartAttempts = 0
      return
    }

    const delay = RESTART_BACKOFF_BASE * 2 ** this.restartAttempts
    this.restartAttempts++
    this.emitLog('info', `Scheduling restart attempt ${this.restartAttempts} in ${delay}ms`)

    this.restartTimer = setTimeout(() => {
      this.start().catch((err) => {
        this.emitLog('error', `Restart failed: ${err}`)
      })
    }, delay)
  }

  private clearScheduledRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.restartAttempts = 0
  }

  // ─── Private: Utilities ───────────────────────────────────────────────────

  private async findAvailablePort(): Promise<number> {
    const { createServer } = require('node:net')
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        server.close(() => resolve(port))
      })
      server.on('error', reject)
    })
  }

  private generateToken(): string {
    const { randomBytes } = require('node:crypto')
    return `shadow-${randomBytes(24).toString('hex')}`
  }

  private setState(state: GatewayState, error?: string): void {
    this.currentState = state
    const status = this.getStatus()
    if (error) status.error = error
    for (const cb of this.statusCallbacks) cb(status)
  }

  private emitLog(
    level: GatewayLogEntry['level'],
    message: string,
    source: GatewayLogEntry['source'] = 'system',
  ): void {
    const entry: GatewayLogEntry = { timestamp: Date.now(), level, message, source }
    this.logBuffer.push(entry)
    if (this.logBuffer.length > GatewayService.LOG_BUFFER_SIZE) {
      this.logBuffer = this.logBuffer.slice(-GatewayService.LOG_BUFFER_SIZE)
    }
    for (const cb of this.logCallbacks) cb(entry)
  }

  private parseVersionParts(version: string): [number, number, number] {
    const cleaned = version.trim().replace(/^v/, '')
    const [majorRaw, minorRaw, patchRaw] = cleaned.split('.')
    return [
      Number(majorRaw || 0),
      Number(minorRaw || 0),
      Number((patchRaw || '0').replace(/\D.*$/, '')),
    ]
  }

  private isVersionGte(actual: string, required: string): boolean {
    const [aMajor, aMinor, aPatch] = this.parseVersionParts(actual)
    const [rMajor, rMinor, rPatch] = this.parseVersionParts(required)
    if (aMajor !== rMajor) return aMajor > rMajor
    if (aMinor !== rMinor) return aMinor > rMinor
    return aPatch >= rPatch
  }
}
