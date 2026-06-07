import type { DesktopSettingsDao } from '../dao/desktop-settings.dao'
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
}

export class ConnectorService {
  readonly #desktopSettingsDao: DesktopSettingsDao

  constructor({ desktopSettingsDao }: ConnectorServiceDeps) {
    this.#desktopSettingsDao = desktopSettingsDao
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
}
