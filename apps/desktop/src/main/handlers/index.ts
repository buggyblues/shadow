import type { DesktopContainer } from '../core/container'
import { registerAutoUpdaterHandlers } from './auto-updater.handler'
import { registerConnectorHandlers } from './connector.handler'
import { registerDesktopSettingsHandlers } from './desktop-settings.handler'
import { registerDiagnosticsHandlers } from './diagnostics.handler'
import { registerNotificationHandlers } from './notifications.handler'
import { registerPetAssetsHandlers } from './pet-assets.handler'
import { registerProcessManagerHandlers } from './process-manager.handler'
import { registerShortcutHandlers } from './shortcuts.handler'
import { registerVoiceHandlers } from './voice.handler'

export function registerDesktopServiceHandlers(container: DesktopContainer): void {
  registerAutoUpdaterHandlers(container)
  registerDesktopSettingsHandlers(container)
  registerConnectorHandlers(container)
  registerDiagnosticsHandlers(container)
  registerNotificationHandlers(container)
  registerPetAssetsHandlers(container)
  registerProcessManagerHandlers(container)
  registerShortcutHandlers(container)
  registerVoiceHandlers(container)
}
