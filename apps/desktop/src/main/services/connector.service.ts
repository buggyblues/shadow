import type { DesktopSettingsDao } from '../dao/desktop-settings.dao'
import type { ClipperConnectorService } from './clipper-connector.service'
import type {
  ConnectorConnection,
  ConnectorDaemonService,
  ConnectorDaemonState,
  ConnectorRuntimeScanResult,
  ConnectorRuntimeSessionScanResult,
  CreateConnectorBuddyInput,
} from './connector-daemon.service'
import { connectorDaemonService } from './connector-daemon.service'
import type { DesktopRuntimeSettings } from './desktop-settings.service'

type ConnectorServiceDeps = {
  desktopSettingsDao: DesktopSettingsDao
  clipperConnectorService: ClipperConnectorService
}

export class ConnectorService {
  readonly #desktopSettingsDao: DesktopSettingsDao
  readonly #clipperConnectorService: ClipperConnectorService

  constructor({ desktopSettingsDao, clipperConnectorService }: ConnectorServiceDeps) {
    this.#desktopSettingsDao = desktopSettingsDao
    this.#clipperConnectorService = clipperConnectorService
  }

  async getStatus(): Promise<ConnectorDaemonState> {
    await connectorDaemonService.resolveCliPath()
    return connectorDaemonService.getState(await this.#desktopSettingsDao.read())
  }

  start(settings: Partial<DesktopRuntimeSettings> = {}): Promise<ConnectorDaemonState> {
    return connectorDaemonService.start(settings)
  }

  stop(): Promise<ConnectorDaemonState> {
    return connectorDaemonService.stop()
  }

  scan(): Promise<{ output: string }> {
    return connectorDaemonService.scanConnectorRuntimes()
  }

  scanRuntimes(input: { force?: boolean } = {}): Promise<ConnectorRuntimeScanResult> {
    return connectorDaemonService.scanAgentRuntimes({ force: input.force === true })
  }

  scanRuntimeSessions(input: { force?: boolean } = {}): Promise<ConnectorRuntimeSessionScanResult> {
    return connectorDaemonService.scanAgentRuntimeSessions({ force: input.force === true })
  }

  async installRuntime(input: { runtimeId?: string }): Promise<
    ConnectorRuntimeScanResult & {
      installed: ConnectorRuntimeScanResult['runtimes'][number] | null
    }
  > {
    const runtimeId = typeof input?.runtimeId === 'string' ? input.runtimeId.trim() : ''
    if (!runtimeId) throw new Error('Missing runtime id')
    return connectorDaemonService.installAgentRuntime(runtimeId)
  }

  createBuddy(input: CreateConnectorBuddyInput): ReturnType<ConnectorDaemonService['createBuddy']> {
    return connectorDaemonService.createBuddy(input)
  }

  getConnections(): Promise<ConnectorConnection[]> {
    return connectorDaemonService.refreshConnections()
  }

  setConnectionEnabled(input: {
    agentId: string
    enabled: boolean
  }): Promise<ConnectorConnection[]> {
    return connectorDaemonService.setConnectionEnabled(input.agentId, input.enabled)
  }

  deleteConnection(input: {
    agentId: string
    deleteCloudBuddy?: boolean
  }): Promise<ConnectorConnection[]> {
    return connectorDaemonService.deleteConnection(input)
  }

  setConnectionWorkDir(input: {
    agentId: string
    workDir?: string
  }): Promise<ConnectorConnection[]> {
    return connectorDaemonService.setConnectionWorkDir(input.agentId, input.workDir ?? '')
  }

  getClipperStatus(): ReturnType<ClipperConnectorService['getStatus']> {
    return this.#clipperConnectorService.getStatus()
  }

  startClipper(): ReturnType<ClipperConnectorService['start']> {
    return this.#clipperConnectorService.start()
  }

  stopClipper(): ReturnType<ClipperConnectorService['stop']> {
    return this.#clipperConnectorService.stop()
  }

  syncClipperCommunitySession(
    input: { force?: boolean } = {},
  ): ReturnType<ClipperConnectorService['syncCommunitySession']> {
    return this.#clipperConnectorService.syncCommunitySession(input.force !== false)
  }
}
