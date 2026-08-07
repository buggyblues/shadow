import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  createLocalBridge,
  type LocalBridgeInstance,
  readLocalBridgeToken,
  resolveLocalBridgeRoot,
} from '@shadowob/connector/local-bridge'
import { app, clipboard, shell } from 'electron'
import { communitySessionService } from './community-session.service'
import { loggerService } from './logger.service'

const DEFAULT_URL = 'http://127.0.0.1:32145'
const DEFAULT_PORT = 32145

type JsonRecord = Record<string, unknown>

export interface ClipperConnectorStatus {
  browserClients: number
  communitySignedIn: boolean
  connectionToken: string
  extensionPath: string | null
  files: number
  lastSyncedAt: string | null
  libraryRoot: string
  ownedByDesktop: boolean
  running: boolean
  tokenAvailable: boolean
  url: string
}

export interface ClipperExtensionInstallResult {
  automatic: false
  extensionPath: string
  instructions: 'load-unpacked'
}

export interface ClipperCommunitySyncResult {
  expiresAt: string
  taskId: string
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function libraryFileCount(library: JsonRecord): number {
  const files = library.files
  const count = Number(record(files).total ?? files ?? 0)
  return Number.isFinite(count) ? count : 0
}

export class ClipperConnectorService {
  #bridge: LocalBridgeInstance | null = null
  #communitySyncPromise: Promise<ClipperCommunitySyncResult> | null = null
  #lastBrowserClients = 0
  #lastAuthorizedAccessToken = ''
  #startPromise: Promise<ClipperConnectorStatus> | null = null

  constructor() {
    communitySessionService.onAuthChanged(() => {
      this.#lastAuthorizedAccessToken = ''
      void this.syncCommunitySession(true).catch(() => undefined)
    })
  }

  root(): string {
    return resolveLocalBridgeRoot(process.env.SHADOWOB_LOCAL_BRIDGE_ROOT)
  }

  async start(): Promise<ClipperConnectorStatus> {
    if (this.#startPromise) return this.#startPromise
    this.#startPromise = this.#start().finally(() => {
      this.#startPromise = null
    })
    return this.#startPromise
  }

  async #start(): Promise<ClipperConnectorStatus> {
    const existing = await this.#health().catch(() => null)
    if (existing?.service === 'shadow-local-bridge') return this.getStatus()
    if (existing)
      throw new Error('Another local service is already using the Clipper connection port')

    const bridge = await createLocalBridge({
      onClientConnected: () => {
        void this.syncCommunitySession(true).catch(() => undefined)
      },
      root: this.root(),
    })
    await new Promise<void>((resolveListen, rejectListen) => {
      bridge.server.once('error', rejectListen)
      bridge.server.listen(DEFAULT_PORT, '127.0.0.1', resolveListen)
    })
    this.#bridge = bridge
    loggerService.write('info', 'connector.clipper', 'started Shadow Clipper connector', {
      root: bridge.root,
      url: DEFAULT_URL,
    })
    return this.getStatus()
  }

  async startIfAvailable(): Promise<void> {
    try {
      await this.start()
    } catch (error) {
      loggerService.write('warn', 'connector.clipper', 'could not start Shadow Clipper connector', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async stop(): Promise<ClipperConnectorStatus> {
    const bridge = this.#bridge
    this.#bridge = null
    if (bridge) {
      await bridge.shutdown()
    } else {
      const health = await this.#health().catch(() => null)
      if (health?.service === 'shadow-local-bridge') {
        const token = await readLocalBridgeToken(this.root())
        await this.#request('/v1/admin/stop', token, { method: 'POST' })
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (!(await this.#health().catch(() => null))) break
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
        }
      }
    }
    return this.getStatus()
  }

  async getStatus(): Promise<ClipperConnectorStatus> {
    const root = this.root()
    const extensionPath = await this.findExtensionPath()
    const session = communitySessionService.readStoredAuthTokens()
    const health = await this.#health().catch(() => null)
    if (health?.service !== 'shadow-local-bridge') {
      this.#lastBrowserClients = 0
      return {
        browserClients: 0,
        communitySignedIn: Boolean(session.accessToken || session.refreshToken),
        connectionToken: '',
        extensionPath,
        files: 0,
        lastSyncedAt: null,
        libraryRoot: root,
        ownedByDesktop: false,
        running: false,
        tokenAvailable: await this.#tokenAvailable(root),
        url: DEFAULT_URL,
      }
    }

    const token = await readLocalBridgeToken(root)
    const library = await this.#request('/v1/library/status', token).catch((): JsonRecord => ({}))
    const clients = Array.isArray(library.clients) ? library.clients.length : 0
    const status = {
      browserClients: clients,
      communitySignedIn: Boolean(session.accessToken || session.refreshToken),
      connectionToken: token,
      extensionPath,
      files: libraryFileCount(library),
      lastSyncedAt: typeof library.latestSync === 'string' ? library.latestSync : null,
      libraryRoot: typeof library.root === 'string' ? library.root : root,
      ownedByDesktop: Boolean(this.#bridge?.server.listening),
      running: true,
      tokenAvailable: true,
      url: DEFAULT_URL,
    } satisfies ClipperConnectorStatus
    if (clients > 0 && status.communitySignedIn) {
      void this.syncCommunitySession(clients > this.#lastBrowserClients).catch(() => undefined)
    }
    this.#lastBrowserClients = clients
    return status
  }

  async prepareExtensionInstall(): Promise<ClipperExtensionInstallResult> {
    const sourcePath = await this.#findExtensionSourcePath()
    if (!sourcePath) {
      throw new Error('Shadow Clipper is not included in this desktop build')
    }
    const status = await this.start()
    const extensionPath = this.#preparedExtensionPath()
    await mkdir(extensionPath, { recursive: true })
    await cp(sourcePath, extensionPath, { force: true, recursive: true })
    const connectionPath = join(extensionPath, 'shadow-connector.json')
    await writeFile(
      connectionPath,
      JSON.stringify(
        {
          clientId: `shadow-desktop-${createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0, 12)}`,
          syncOnChange: true,
          token: status.connectionToken,
          url: status.url,
          version: 1,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    )
    await chmod(connectionPath, 0o600)
    clipboard.writeText(extensionPath)
    await shell.openPath(extensionPath)
    this.#openBrowserExtensionsPage()
    return { automatic: false, extensionPath, instructions: 'load-unpacked' }
  }

  syncCommunitySession(force = true): Promise<ClipperCommunitySyncResult> {
    if (this.#communitySyncPromise) return this.#communitySyncPromise
    this.#communitySyncPromise = this.#syncCommunitySession(force).finally(() => {
      this.#communitySyncPromise = null
    })
    return this.#communitySyncPromise
  }

  async #syncCommunitySession(force: boolean): Promise<ClipperCommunitySyncResult> {
    const status = await this.#statusWithoutAutoSync()
    if (!status.running) throw new Error('Start the Shadow Clipper connection first')
    if (status.browserClients < 1)
      throw new Error('Connect Shadow Clipper before syncing your login')
    const session = await communitySessionService.readBridgeSession()
    if (!force && session.accessToken === this.#lastAuthorizedAccessToken) {
      return { expiresAt: new Date().toISOString(), taskId: '' }
    }
    const token = await readLocalBridgeToken(this.root())
    const result = await this.#request('/v1/community/session/authorize', token, {
      body: JSON.stringify({
        ...session,
        clear: !session.accessToken && !session.refreshToken,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const authorization = record(result.authorization)
    const taskId = typeof authorization.taskId === 'string' ? authorization.taskId : ''
    const expiresAt = typeof authorization.expiresAt === 'string' ? authorization.expiresAt : ''
    if (!taskId || !expiresAt) throw new Error('Shadow Clipper did not accept the login sync')
    this.#lastAuthorizedAccessToken = session.accessToken
    return { expiresAt, taskId }
  }

  async findExtensionPath(): Promise<string | null> {
    const preparedPath = this.#preparedExtensionPath()
    if (await this.#isExtensionPath(preparedPath)) return preparedPath
    return this.#findExtensionSourcePath()
  }

  async #findExtensionSourcePath(): Promise<string | null> {
    const candidates = [
      process.env.SHADOW_CLIPPER_EXTENSION_PATH,
      join(process.resourcesPath, 'clipper-extension'),
      join(app.getPath('home'), 'Documents', 'clipper', 'dist'),
      join(app.getPath('home'), 'Projects', 'clipper', 'dist'),
    ].filter((value): value is string => Boolean(value))
    for (const candidate of candidates) {
      const directory = resolve(candidate)
      if (await this.#isExtensionPath(directory)) return directory
    }
    return null
  }

  async #isExtensionPath(directory: string): Promise<boolean> {
    const manifestPath = join(directory, 'manifest.json')
    if (!existsSync(manifestPath)) return false
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as JsonRecord
      return manifest.manifest_version === 3 && typeof manifest.name === 'string'
    } catch {
      return false
    }
  }

  #preparedExtensionPath(): string {
    return join(app.getPath('userData'), 'shadow-clipper', 'extension')
  }

  async #statusWithoutAutoSync(): Promise<ClipperConnectorStatus> {
    const root = this.root()
    const health = await this.#health().catch(() => null)
    const session = communitySessionService.readStoredAuthTokens()
    if (health?.service !== 'shadow-local-bridge') {
      return {
        browserClients: 0,
        communitySignedIn: Boolean(session.accessToken || session.refreshToken),
        connectionToken: '',
        extensionPath: await this.findExtensionPath(),
        files: 0,
        lastSyncedAt: null,
        libraryRoot: root,
        ownedByDesktop: false,
        running: false,
        tokenAvailable: await this.#tokenAvailable(root),
        url: DEFAULT_URL,
      }
    }
    const token = await readLocalBridgeToken(root)
    const library = await this.#request('/v1/library/status', token)
    return {
      browserClients: Array.isArray(library.clients) ? library.clients.length : 0,
      communitySignedIn: Boolean(session.accessToken || session.refreshToken),
      connectionToken: token,
      extensionPath: await this.findExtensionPath(),
      files: libraryFileCount(library),
      lastSyncedAt: typeof library.latestSync === 'string' ? library.latestSync : null,
      libraryRoot: typeof library.root === 'string' ? library.root : root,
      ownedByDesktop: Boolean(this.#bridge?.server.listening),
      running: true,
      tokenAvailable: true,
      url: DEFAULT_URL,
    }
  }

  async #health(): Promise<JsonRecord> {
    const response = await fetch(`${DEFAULT_URL}/v1/health`, {
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) throw new Error('Local service is unavailable')
    return record(await response.json())
  }

  async #request(path: string, token: string, init: RequestInit = {}): Promise<JsonRecord> {
    const response = await fetch(`${DEFAULT_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(8_000),
    })
    const body = record(await response.json().catch(() => ({})))
    if (!response.ok) throw new Error(String(body.error ?? 'Shadow Clipper connection failed'))
    return body
  }

  async #tokenAvailable(root: string): Promise<boolean> {
    try {
      return Boolean(await readLocalBridgeToken(root))
    } catch {
      return false
    }
  }

  #openBrowserExtensionsPage(): void {
    if (process.platform === 'darwin') {
      const child = spawn('open', ['-a', 'Google Chrome', 'chrome://extensions/'], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      return
    }
    void shell.openExternal('chrome://extensions/').catch(() => undefined)
  }
}
