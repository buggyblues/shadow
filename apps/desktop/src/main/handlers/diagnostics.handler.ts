import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerDiagnosticsHandlers(container: DesktopContainer): void {
  const { diagnosticsService } = container.cradle

  const diagnostics = {
    getSnapshot: () => diagnosticsService.getSnapshot(),
    exportLogs: () => diagnosticsService.exportLogs(),
  } satisfies DesktopIPCServiceImplementation<'diagnostics'>

  registerDesktopIPCService('diagnostics', diagnostics)
}
