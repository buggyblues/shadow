import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
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

class ClipperBridgeRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ClipperBridgeRequestError'
    this.status = status
  }
}

export interface ClipperConnectorStatus {
  browserClients: number
  clients: Array<{
    buildRevision: string | null
    clientId: string
    extensionVersion: string
    protocolVersion: number
    seenAt: string
  }>
  communitySignedIn: boolean
  connectionState:
    | 'connected'
    | 'incompatible'
    | 'not-installed'
    | 'stopped'
    | 'update-available'
    | 'waiting'
  connectionToken: string
  extensionVersion: string | null
  extensionPath: string | null
  files: number
  lastSyncedAt: string | null
  libraryRoot: string
  ownedByDesktop: boolean
  running: boolean
  tokenAvailable: boolean
  updateAvailable: boolean
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

interface ClipperBuildMetadata {
  extensionVersion: string
  protocolVersion: number
  ref: string
  repository: string
  sha256: string
}

interface ConnectedClipperClient {
  buildRevision: string | null
  clientId: string
  extensionVersion: string
  protocolVersion: number
  seenAt: string
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
  #bridgeUpgradePromise: Promise<ClipperConnectorStatus> | null = null
  #communitySyncPromise: Promise<ClipperCommunitySyncResult> | null = null
  #lastBrowserClients = 0
  #lastAuthorizedAccessToken = ''
  #preparePromise: Promise<ClipperExtensionInstallResult> | null = null
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
    if (existing) throw new Error('CLIPPER_PORT_IN_USE')

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
      if (await this.#isExtensionPath(this.#preparedExtensionPath())) {
        await this.#installExtension(false)
      }
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
    const preparedPath = this.#preparedExtensionPath()
    const extensionPath = (await this.#isExtensionPath(preparedPath)) ? preparedPath : null
    const sourcePath = await this.#findExtensionSourcePath()
    const sourceMetadata = sourcePath ? await this.#readBuildMetadata(sourcePath) : null
    const installedMetadata = extensionPath ? await this.#readBuildMetadata(extensionPath) : null
    const session = communitySessionService.readStoredAuthTokens()
    const health = await this.#health().catch(() => null)
    if (health?.service !== 'shadow-local-bridge') {
      this.#lastBrowserClients = 0
      return {
        browserClients: 0,
        clients: [],
        communitySignedIn: Boolean(session.accessToken || session.refreshToken),
        connectionState: 'stopped',
        connectionToken: '',
        extensionVersion: installedMetadata?.extensionVersion ?? null,
        extensionPath,
        files: 0,
        lastSyncedAt: null,
        libraryRoot: root,
        ownedByDesktop: false,
        running: false,
        tokenAvailable: await this.#tokenAvailable(root),
        updateAvailable: Boolean(
          sourceMetadata && installedMetadata && sourceMetadata.ref !== installedMetadata.ref,
        ),
        url: DEFAULT_URL,
      }
    }

    const token = await readLocalBridgeToken(root)
    const library = await this.#request('/v1/library/status', token).catch((): JsonRecord => ({}))
    const connectedClients = this.#connectedClients(library.clients)
    const clients = connectedClients.length
    const updateAvailable = Boolean(
      sourceMetadata &&
        (installedMetadata?.ref !== sourceMetadata.ref ||
          connectedClients.some(
            (client) => client.buildRevision && client.buildRevision !== sourceMetadata.ref,
          )),
    )
    const incompatible = connectedClients.some(
      (client) => client.protocolVersion !== (sourceMetadata?.protocolVersion ?? 3),
    )
    const status = {
      browserClients: clients,
      clients: connectedClients,
      communitySignedIn: Boolean(session.accessToken || session.refreshToken),
      connectionState: !extensionPath
        ? 'not-installed'
        : clients < 1
          ? 'waiting'
          : incompatible
            ? 'incompatible'
            : updateAvailable
              ? 'update-available'
              : 'connected',
      connectionToken: token,
      extensionVersion: installedMetadata?.extensionVersion ?? null,
      extensionPath,
      files: libraryFileCount(library),
      lastSyncedAt: typeof library.latestSync === 'string' ? library.latestSync : null,
      libraryRoot: typeof library.root === 'string' ? library.root : root,
      ownedByDesktop: Boolean(this.#bridge?.server.listening),
      running: true,
      tokenAvailable: true,
      updateAvailable,
      url: DEFAULT_URL,
    } satisfies ClipperConnectorStatus
    if (clients > 0 && status.communitySignedIn) {
      void this.syncCommunitySession(clients > this.#lastBrowserClients).catch(() => undefined)
    }
    this.#lastBrowserClients = clients
    return status
  }

  async prepareExtensionInstall(): Promise<ClipperExtensionInstallResult> {
    if (this.#preparePromise) return this.#preparePromise
    this.#preparePromise = this.#installExtension(true).finally(() => {
      this.#preparePromise = null
    })
    const result = await this.#preparePromise
    clipboard.writeText(result.extensionPath)
    await shell.openPath(result.extensionPath)
    this.#openBrowserExtensionsPage()
    return result
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
    if (!status.running) throw new Error('CLIPPER_NOT_RUNNING')
    if (status.browserClients < 1) throw new Error('CLIPPER_NOT_CONNECTED')
    const session = await communitySessionService.readBridgeSession()
    if (!force && session.accessToken === this.#lastAuthorizedAccessToken) {
      return { expiresAt: new Date().toISOString(), taskId: '' }
    }
    let token = await readLocalBridgeToken(this.root())
    const requestAuthorization = () =>
      this.#request('/v1/community/session/authorize', token, {
        body: JSON.stringify({
          ...session,
          clear: !session.accessToken && !session.refreshToken,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    let result: JsonRecord
    try {
      result = await requestAuthorization()
    } catch (error) {
      if (!(error instanceof ClipperBridgeRequestError) || error.status !== 404) throw error
      try {
        await this.#upgradeBridge()
        token = await readLocalBridgeToken(this.root())
        result = await requestAuthorization()
      } catch (upgradeError) {
        loggerService.write('warn', 'connector.clipper', 'could not refresh Local Bridge', {
          error: upgradeError instanceof Error ? upgradeError.message : String(upgradeError),
        })
        throw new Error('CLIPPER_BRIDGE_UPDATE_FAILED')
      }
    }
    const authorization = record(result.authorization)
    const taskId = typeof authorization.taskId === 'string' ? authorization.taskId : ''
    const expiresAt = typeof authorization.expiresAt === 'string' ? authorization.expiresAt : ''
    if (!taskId || !expiresAt) throw new Error('CLIPPER_LOGIN_SYNC_REJECTED')
    this.#lastAuthorizedAccessToken = session.accessToken
    return { expiresAt, taskId }
  }

  async findExtensionPath(): Promise<string | null> {
    const preparedPath = this.#preparedExtensionPath()
    if (await this.#isExtensionPath(preparedPath)) return preparedPath
    return this.#findExtensionSourcePath()
  }

  async #installExtension(force: boolean): Promise<ClipperExtensionInstallResult> {
    const sourcePath = await this.#findExtensionSourcePath()
    if (!sourcePath) throw new Error('CLIPPER_EXTENSION_MISSING')
    const sourceMetadata = await this.#readBuildMetadata(sourcePath)
    if (!sourceMetadata || !(await this.#verifyBuild(sourcePath, sourceMetadata))) {
      throw new Error('CLIPPER_EXTENSION_INVALID')
    }
    const extensionPath = this.#preparedExtensionPath()
    const installedMetadata = await this.#readBuildMetadata(extensionPath)
    if (!force && installedMetadata?.ref === sourceMetadata.ref) {
      return { automatic: false, extensionPath, instructions: 'load-unpacked' }
    }

    let status = await this.start()
    const clientId = `shadow-desktop-${createHash('sha256')
      .update(app.getPath('userData'))
      .digest('hex')
      .slice(0, 12)}`
    let pairingResponse: JsonRecord
    try {
      pairingResponse = await this.#createPairing(status.connectionToken, clientId)
    } catch (error) {
      if (!(error instanceof ClipperBridgeRequestError) || error.status !== 404) throw error
      loggerService.write(
        'info',
        'connector.clipper',
        'restarting an older Local Bridge before pairing the extension',
      )
      try {
        status = await this.#upgradeBridge()
        pairingResponse = await this.#createPairing(status.connectionToken, clientId)
      } catch (restartError) {
        loggerService.write('warn', 'connector.clipper', 'could not refresh Local Bridge', {
          error: restartError instanceof Error ? restartError.message : String(restartError),
        })
        throw new Error('CLIPPER_BRIDGE_UPDATE_FAILED')
      }
    }
    const pairing = record(pairingResponse.pairing)
    const pairingCode = typeof pairing.code === 'string' ? pairing.code : ''
    if (!pairingCode) throw new Error('CLIPPER_PAIRING_FAILED')

    const parent = join(app.getPath('userData'), 'shadow-clipper')
    await mkdir(parent, { mode: 0o700, recursive: true })
    await chmod(parent, 0o700).catch(() => undefined)
    const stagingPath = await mkdtemp(join(parent, 'extension-stage-'))
    const backupPath = join(parent, `extension-backup-${randomUUID()}`)
    let backupCreated = false
    try {
      await cp(sourcePath, stagingPath, { force: true, recursive: true })
      const connectionPath = join(stagingPath, 'shadow-connector.json')
      await writeFile(
        connectionPath,
        `${JSON.stringify(
          {
            buildRevision: sourceMetadata.ref,
            clientId,
            extensionVersion: sourceMetadata.extensionVersion,
            pairingCode,
            pairingRevision: randomUUID(),
            syncOnChange: true,
            url: status.url,
            version: 2,
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      )
      await chmod(connectionPath, 0o600).catch(() => undefined)
      if (!(await this.#isExtensionPath(stagingPath))) throw new Error('CLIPPER_EXTENSION_INVALID')
      if (existsSync(extensionPath)) {
        await rename(extensionPath, backupPath)
        backupCreated = true
      }
      try {
        await rename(stagingPath, extensionPath)
      } catch (error) {
        if (backupCreated && !existsSync(extensionPath)) await rename(backupPath, extensionPath)
        throw error
      }
      if (backupCreated) {
        await rm(backupPath, { force: true, recursive: true }).catch(() => undefined)
      }
    } catch (error) {
      await rm(stagingPath, { force: true, recursive: true }).catch(() => undefined)
      throw error
    }
    return { automatic: false, extensionPath, instructions: 'load-unpacked' }
  }

  async #findExtensionSourcePath(): Promise<string | null> {
    const candidates = [
      ...(process.resourcesPath ? [join(process.resourcesPath, 'clipper-extension')] : []),
      join(app.getAppPath(), 'dist', 'clipper-extension'),
    ]
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

  async #readBuildMetadata(directory: string): Promise<ClipperBuildMetadata | null> {
    try {
      const metadata = record(
        JSON.parse(await readFile(join(directory, 'shadow-clipper-build.json'), 'utf8')),
      )
      const value = {
        extensionVersion: String(metadata.extensionVersion ?? ''),
        protocolVersion: Number(metadata.protocolVersion),
        ref: String(metadata.ref ?? '').toLowerCase(),
        repository: String(metadata.repository ?? ''),
        sha256: String(metadata.sha256 ?? '').toLowerCase(),
      }
      if (
        !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.extensionVersion) ||
        value.protocolVersion !== 3 ||
        !/^[0-9a-f]{40}$/.test(value.ref) ||
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository) ||
        !/^[0-9a-f]{64}$/.test(value.sha256)
      ) {
        return null
      }
      return value
    } catch {
      return null
    }
  }

  async #verifyBuild(directory: string, metadata: ClipperBuildMetadata): Promise<boolean> {
    return (await this.#hashDirectory(directory)) === metadata.sha256
  }

  async #hashDirectory(directory: string): Promise<string> {
    const digest = createHash('sha256')
    const visit = async (current: string, prefix = ''): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true })
      entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
      for (const entry of entries) {
        if (entry.name === 'shadow-clipper-build.json' || entry.name === 'shadow-connector.json') {
          continue
        }
        const path = join(current, entry.name)
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) await visit(path, relativePath)
        else if (entry.isFile()) {
          digest.update(relativePath)
          digest.update('\0')
          digest.update(await readFile(path))
          digest.update('\0')
        }
      }
    }
    await visit(directory)
    return digest.digest('hex')
  }

  #connectedClients(value: unknown): ConnectedClipperClient[] {
    if (!Array.isArray(value)) return []
    return value
      .map(record)
      .map((client) => ({
        buildRevision:
          typeof client.buildRevision === 'string' && /^[0-9a-f]{40}$/i.test(client.buildRevision)
            ? client.buildRevision.toLowerCase()
            : null,
        clientId: typeof client.clientId === 'string' ? client.clientId : '',
        extensionVersion:
          typeof client.extensionVersion === 'string' ? client.extensionVersion : '',
        protocolVersion: Number(client.protocolVersion),
        seenAt: typeof client.seenAt === 'string' ? client.seenAt : '',
      }))
      .filter((client) => client.clientId)
  }

  #preparedExtensionPath(): string {
    return join(app.getPath('userData'), 'shadow-clipper', 'extension')
  }

  async #statusWithoutAutoSync(): Promise<ClipperConnectorStatus> {
    const root = this.root()
    const preparedPath = this.#preparedExtensionPath()
    const extensionPath = (await this.#isExtensionPath(preparedPath)) ? preparedPath : null
    const installedMetadata = extensionPath ? await this.#readBuildMetadata(extensionPath) : null
    const health = await this.#health().catch(() => null)
    const session = communitySessionService.readStoredAuthTokens()
    if (health?.service !== 'shadow-local-bridge') {
      return {
        browserClients: 0,
        clients: [],
        communitySignedIn: Boolean(session.accessToken || session.refreshToken),
        connectionState: 'stopped',
        connectionToken: '',
        extensionVersion: installedMetadata?.extensionVersion ?? null,
        extensionPath,
        files: 0,
        lastSyncedAt: null,
        libraryRoot: root,
        ownedByDesktop: false,
        running: false,
        tokenAvailable: await this.#tokenAvailable(root),
        updateAvailable: false,
        url: DEFAULT_URL,
      }
    }
    const token = await readLocalBridgeToken(root)
    const library = await this.#request('/v1/library/status', token)
    const clients = this.#connectedClients(library.clients)
    return {
      browserClients: clients.length,
      clients,
      communitySignedIn: Boolean(session.accessToken || session.refreshToken),
      connectionState: !extensionPath
        ? 'not-installed'
        : clients.length > 0
          ? 'connected'
          : 'waiting',
      connectionToken: token,
      extensionVersion: installedMetadata?.extensionVersion ?? null,
      extensionPath,
      files: libraryFileCount(library),
      lastSyncedAt: typeof library.latestSync === 'string' ? library.latestSync : null,
      libraryRoot: typeof library.root === 'string' ? library.root : root,
      ownedByDesktop: Boolean(this.#bridge?.server.listening),
      running: true,
      tokenAvailable: true,
      updateAvailable: false,
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
    if (!response.ok) {
      throw new ClipperBridgeRequestError(
        response.status,
        String(body.error ?? 'Shadow Clipper connection failed'),
      )
    }
    return body
  }

  #createPairing(token: string, clientId: string): Promise<JsonRecord> {
    return this.#request('/v1/admin/pairings', token, {
      body: JSON.stringify({ clientId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  }

  #upgradeBridge(): Promise<ClipperConnectorStatus> {
    if (this.#bridgeUpgradePromise) return this.#bridgeUpgradePromise
    this.#bridgeUpgradePromise = (async () => {
      await this.stop()
      return this.start()
    })().finally(() => {
      this.#bridgeUpgradePromise = null
    })
    return this.#bridgeUpgradePromise
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
