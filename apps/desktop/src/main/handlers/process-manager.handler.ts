import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerProcessManagerHandlers(container: DesktopContainer): void {
  const { processManagerService } = container.cradle

  const agents = {
    start: (input, event) => processManagerService.startAgent(event.sender, input),
    stop: (processId) => processManagerService.stopAgent(processId),
    getStatus: (processId) => processManagerService.getAgentStatus(processId),
    list: () => processManagerService.listAgents(),
  } satisfies DesktopIPCServiceImplementation<'agents'>

  registerDesktopIPCService('agents', agents)
}
