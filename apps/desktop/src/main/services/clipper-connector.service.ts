import {
  type ClipperConnectorInstance,
  createClipperConnector,
  readClipperConnectorToken,
  resolveClipperConnectorRoot,
} from '@shadowob/connector/clipper'
import { communitySessionService } from './community-session.service'
import { loggerService } from './logger.service'

const DEFAULT_URL = 'http://127.0.0.1:32145'
const DEFAULT_PORT = 32145
const CLIPPER_PRODUCT_URL = 'https://clipper.shadowob.com/'
const CLIPPER_PROTOCOL_VERSION = 3

type JsonRecord = Record<string, unknown>

function isClipperConnectorHealth(value: JsonRecord | null): boolean {
  return value?.service === 'shadow-clipper-connector' || value?.service === 'shadow-local-bridge'
}

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
  communitySyncState: 'error' | 'signed-out' | 'synced' | 'syncing' | 'waiting'
  connectionState: 'connected' | 'incompatible' | 'stopped' | 'waiting'
  connectionToken: string
  extensionVersion: string | null
  extensionUrl: string
  files: number
  lastSyncedAt: string | null
  libraryRoot: string
  ownedByDesktop: boolean
  running: boolean
  tokenAvailable: boolean
  url: string
}

export interface ClipperCommunitySyncResult {
  expiresAt: string
  taskId: string
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
  #bridge: ClipperConnectorInstance | null = null
  #bridgeUpgradePromise: Promise<ClipperConnectorStatus> | null = null
  #communitySyncPromise: Promise<ClipperCommunitySyncResult> | null = null
  #communitySyncFailed = false
  #lastBrowserClients = 0
  #lastAuthorizedAccessToken = ''
  #startPromise: Promise<ClipperConnectorStatus> | null = null

  constructor() {
    communitySessionService.onAuthChanged(() => {
      this.#lastAuthorizedAccessToken = ''
      this.#communitySyncFailed = false
      void this.syncCommunitySession(true).catch(() => undefined)
    })
  }

  root(): string {
    return resolveClipperConnectorRoot(process.env.SHADOWOB_CONNECTOR_CLIPPER_ROOT)
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
    if (isClipperConnectorHealth(existing)) return this.getStatus()
    if (existing) throw new Error('CLIPPER_PORT_IN_USE')

    const bridge = await createClipperConnector({
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
      if (isClipperConnectorHealth(health)) {
        const token = await readClipperConnectorToken(this.root())
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
    const session = communitySessionService.readStoredAuthTokens()
    const health = await this.#health().catch(() => null)
    if (!isClipperConnectorHealth(health)) {
      this.#lastBrowserClients = 0
      return {
        browserClients: 0,
        clients: [],
        communitySignedIn: Boolean(session.accessToken || session.refreshToken),
        communitySyncState: this.#resolveCommunitySyncState(
          session.accessToken,
          Boolean(session.accessToken || session.refreshToken),
          0,
        ),
        connectionState: 'stopped',
        connectionToken: '',
        extensionVersion: null,
        extensionUrl: CLIPPER_PRODUCT_URL,
        files: 0,
        lastSyncedAt: null,
        libraryRoot: root,
        ownedByDesktop: false,
        running: false,
        tokenAvailable: await this.#tokenAvailable(root),
        url: DEFAULT_URL,
      }
    }

    const token = await readClipperConnectorToken(root)
    const library = await this.#request('/v1/library/status', token).catch((): JsonRecord => ({}))
    const connectedClients = this.#connectedClients(library.clients)
    const clients = connectedClients.length
    const incompatible = connectedClients.some(
      (client) => client.protocolVersion !== CLIPPER_PROTOCOL_VERSION,
    )
    const status = {
      browserClients: clients,
      clients: connectedClients,
      communitySignedIn: Boolean(session.accessToken || session.refreshToken),
      communitySyncState: this.#resolveCommunitySyncState(
        session.accessToken,
        Boolean(session.accessToken || session.refreshToken),
        clients,
      ),
      connectionState: clients < 1 ? 'waiting' : incompatible ? 'incompatible' : 'connected',
      connectionToken: token,
      extensionVersion: connectedClients[0]?.extensionVersion || null,
      extensionUrl: CLIPPER_PRODUCT_URL,
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

  syncCommunitySession(force = true): Promise<ClipperCommunitySyncResult> {
    if (this.#communitySyncPromise) return this.#communitySyncPromise
    this.#communitySyncPromise = this.#syncCommunitySession(force)
      .then((result) => {
        this.#communitySyncFailed = false
        return result
      })
      .catch((error) => {
        if (
          !(error instanceof Error) ||
          !['CLIPPER_NOT_RUNNING', 'CLIPPER_NOT_CONNECTED'].includes(error.message)
        ) {
          this.#communitySyncFailed = true
        }
        throw error
      })
      .finally(() => {
        this.#communitySyncPromise = null
      })
    return this.#communitySyncPromise
  }

  async #syncCommunitySession(force: boolean): Promise<ClipperCommunitySyncResult> {
    const status = await this.#statusWithoutAutoSync()
    if (!status.running) throw new Error('CLIPPER_NOT_RUNNING')
    if (status.browserClients < 1) throw new Error('CLIPPER_NOT_CONNECTED')
    const session = await communitySessionService.readBridgeSession()
    if (
      !force &&
      !this.#communitySyncFailed &&
      session.accessToken === this.#lastAuthorizedAccessToken
    ) {
      return { expiresAt: new Date().toISOString(), taskId: '' }
    }
    let token = await readClipperConnectorToken(this.root())
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
        token = await readClipperConnectorToken(this.root())
        result = await requestAuthorization()
      } catch (upgradeError) {
        loggerService.write('warn', 'connector.clipper', 'could not refresh Clipper Connector', {
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

  async #statusWithoutAutoSync(): Promise<ClipperConnectorStatus> {
    const root = this.root()
    const health = await this.#health().catch(() => null)
    const session = communitySessionService.readStoredAuthTokens()
    if (!isClipperConnectorHealth(health)) {
      return {
        browserClients: 0,
        clients: [],
        communitySignedIn: Boolean(session.accessToken || session.refreshToken),
        communitySyncState: this.#resolveCommunitySyncState(
          session.accessToken,
          Boolean(session.accessToken || session.refreshToken),
          0,
        ),
        connectionState: 'stopped',
        connectionToken: '',
        extensionVersion: null,
        extensionUrl: CLIPPER_PRODUCT_URL,
        files: 0,
        lastSyncedAt: null,
        libraryRoot: root,
        ownedByDesktop: false,
        running: false,
        tokenAvailable: await this.#tokenAvailable(root),
        url: DEFAULT_URL,
      }
    }
    const token = await readClipperConnectorToken(root)
    const library = await this.#request('/v1/library/status', token)
    const clients = this.#connectedClients(library.clients)
    return {
      browserClients: clients.length,
      clients,
      communitySignedIn: Boolean(session.accessToken || session.refreshToken),
      communitySyncState: this.#resolveCommunitySyncState(
        session.accessToken,
        Boolean(session.accessToken || session.refreshToken),
        clients.length,
      ),
      connectionState: clients.length > 0 ? 'connected' : 'waiting',
      connectionToken: token,
      extensionVersion: clients[0]?.extensionVersion || null,
      extensionUrl: CLIPPER_PRODUCT_URL,
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
    if (!response.ok) {
      throw new ClipperBridgeRequestError(
        response.status,
        String(body.error ?? 'Shadow Clipper connection failed'),
      )
    }
    return body
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
      return Boolean(await readClipperConnectorToken(root))
    } catch {
      return false
    }
  }

  #resolveCommunitySyncState(
    accessToken: string,
    signedIn: boolean,
    browserClients: number,
  ): ClipperConnectorStatus['communitySyncState'] {
    if (!signedIn) return 'signed-out'
    if (browserClients < 1) return 'waiting'
    if (this.#communitySyncFailed) return 'error'
    if (accessToken && this.#lastAuthorizedAccessToken === accessToken) return 'synced'
    return 'syncing'
  }
}
