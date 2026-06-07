import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerConnectorHandlers(container: DesktopContainer): void {
  const { connectorService } = container.cradle

  const connector = {
    getStatus: () => connectorService.getStatus(),
    start: (incoming) => connectorService.start(incoming),
    stop: () => connectorService.stop(),
    scan: () => connectorService.scan(),
    scanRuntimes: (input) => connectorService.scanRuntimes(input),
    scanRuntimeSessions: (input) => connectorService.scanRuntimeSessions(input),
    installRuntime: (input) => connectorService.installRuntime(input),
    createBuddy: (input) => connectorService.createBuddy(input),
    getConnections: () => connectorService.getConnections(),
    setConnectionEnabled: (input) => connectorService.setConnectionEnabled(input),
    deleteConnection: (input) => connectorService.deleteConnection(input),
    setConnectionWorkDir: (input) => connectorService.setConnectionWorkDir(input),
  } satisfies DesktopIPCServiceImplementation<'connector'>

  registerDesktopIPCService('connector', connector)
}
