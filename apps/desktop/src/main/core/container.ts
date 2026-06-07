import { type AwilixContainer, asClass, createContainer, InjectionMode } from 'awilix'
import { DesktopSettingsDao } from '../dao/desktop-settings.dao'
import { AppIconService } from '../services/app-icon.service'
import { AutoUpdaterService } from '../services/auto-updater.service'
import { ConnectorService } from '../services/connector.service'
import { DesktopSettingsService } from '../services/desktop-settings.service'
import { DiagnosticsService } from '../services/diagnostics.service'
import { MenuService } from '../services/menu.service'
import { NotificationsService } from '../services/notifications.service'
import { PetAssetsService } from '../services/pet-assets.service'
import { ProcessManagerService } from '../services/process-manager.service'
import { ShortcutsService } from '../services/shortcuts.service'
import { VoiceEngineService } from '../services/voice-engine.service'

export type DesktopContainerCradle = {
  desktopSettingsDao: DesktopSettingsDao
  appIconService: AppIconService
  autoUpdaterService: AutoUpdaterService
  connectorService: ConnectorService
  desktopSettingsService: DesktopSettingsService
  diagnosticsService: DiagnosticsService
  menuService: MenuService
  notificationsService: NotificationsService
  petAssetsService: PetAssetsService
  processManagerService: ProcessManagerService
  shortcutsService: ShortcutsService
  voiceEngineService: VoiceEngineService
}

export type DesktopContainer = AwilixContainer<DesktopContainerCradle>

export function createDesktopContainer(): DesktopContainer {
  const container = createContainer<DesktopContainerCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })

  container.register({
    // DAOs
    desktopSettingsDao: asClass(DesktopSettingsDao).singleton(),

    // Services
    appIconService: asClass(AppIconService).singleton(),
    autoUpdaterService: asClass(AutoUpdaterService).singleton(),
    connectorService: asClass(ConnectorService).singleton(),
    desktopSettingsService: asClass(DesktopSettingsService).singleton(),
    diagnosticsService: asClass(DiagnosticsService).singleton(),
    menuService: asClass(MenuService).singleton(),
    notificationsService: asClass(NotificationsService).singleton(),
    petAssetsService: asClass(PetAssetsService).singleton(),
    processManagerService: asClass(ProcessManagerService).singleton(),
    shortcutsService: asClass(ShortcutsService).singleton(),
    voiceEngineService: asClass(VoiceEngineService).singleton(),
  })

  return container
}
