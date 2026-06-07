import {
  type DesktopRuntimeSettings,
  desktopSettingsService,
} from '../services/desktop-settings.service'

export class DesktopSettingsDao {
  read(): Promise<DesktopRuntimeSettings> {
    return desktopSettingsService.getSettings()
  }

  save(patch: Partial<DesktopRuntimeSettings>): Promise<DesktopRuntimeSettings> {
    return desktopSettingsService.setSettings(patch)
  }
}
