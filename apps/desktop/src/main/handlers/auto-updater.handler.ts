import type { DesktopContainer } from '../core/container'
import { type DesktopIPCServiceImplementation, registerDesktopIPCService } from './ipc-server'

export function registerAutoUpdaterHandlers(container: DesktopContainer): void {
  const { autoUpdaterService } = container.cradle

  const appService = {
    getVersion: () => autoUpdaterService.getVersion(),
    setOpenAtLogin: (openAtLogin) => autoUpdaterService.setOpenAtLogin(openAtLogin),
    getOpenAtLogin: () => autoUpdaterService.getOpenAtLogin(),
    quitAndRestart: () => autoUpdaterService.quitAndRestart(),
  } satisfies DesktopIPCServiceImplementation<'app'>

  const updatesService = {
    check: () => autoUpdaterService.checkForUpdate(),
    getState: () => autoUpdaterService.getUpdateState(),
    getSettings: () => autoUpdaterService.getUpdateSettings(),
    setSettings: (input) => autoUpdaterService.setUpdateSettings(input),
    download: (downloadUrl) => autoUpdaterService.downloadUpdate(downloadUrl),
  } satisfies DesktopIPCServiceImplementation<'updates'>

  registerDesktopIPCService('app', appService)
  registerDesktopIPCService('updates', updatesService)
}
