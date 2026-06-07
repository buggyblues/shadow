import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerShortcutHandlers(container: DesktopContainer): void {
  const { shortcutsService } = container.cradle

  const shortcuts = {
    reload: () => shortcutsService.registerGlobalShortcuts(),
    suspend: () => shortcutsService.suspendGlobalShortcuts(),
    resume: () => shortcutsService.resumeGlobalShortcuts(),
  } satisfies DesktopIPCServiceImplementation<'shortcuts'>

  registerDesktopIPCService('shortcuts', shortcuts)
}
