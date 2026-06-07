import type { DesktopContainer } from '../core/container'
import type { DesktopRuntimeSettings } from '../services/desktop-settings.service'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerDesktopSettingsHandlers(container: DesktopContainer): void {
  const { desktopSettingsService } = container.cradle

  const settingsService = {
    get: () => desktopSettingsService.getSettings(),
    set: (incoming) =>
      desktopSettingsService.setSettings(incoming as Partial<DesktopRuntimeSettings>),
  } satisfies DesktopIPCServiceImplementation<'settings'>

  registerDesktopIPCService('settings', settingsService)
}
