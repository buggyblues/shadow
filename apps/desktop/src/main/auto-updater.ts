import { app, ipcMain, net, shell } from 'electron'

const UPDATE_CHECK_URL = 'https://shadowob.com/api/desktop/update'

interface UpdateInfo {
  hasUpdate: boolean
  version: string
  downloadUrl: string
  releaseNotes: string
}

export function setupAutoUpdater(): void {
  ipcMain.handle('desktop:getVersion', () => app.getVersion())

  ipcMain.handle('desktop:checkForUpdate', async () => {
    try {
      const platform = process.platform
      const arch = process.arch
      const currentVersion = app.getVersion()

      const url = `${UPDATE_CHECK_URL}?platform=${platform}&arch=${arch}&version=${currentVersion}`
      const response = await net.fetch(url)
      if (!response.ok) {
        return { hasUpdate: false, version: currentVersion, downloadUrl: '', releaseNotes: '' }
      }
      return (await response.json()) as UpdateInfo
    } catch {
      return { hasUpdate: false, version: app.getVersion(), downloadUrl: '', releaseNotes: '' }
    }
  })

  ipcMain.handle('desktop:downloadUpdate', async (_event, downloadUrl: string) => {
    if (!downloadUrl || typeof downloadUrl !== 'string') return false
    try {
      const parsed = new URL(downloadUrl)
      if (!['https:'].includes(parsed.protocol)) return false
      await shell.openExternal(downloadUrl)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('desktop:setOpenAtLogin', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin })
  })

  ipcMain.handle('desktop:getOpenAtLogin', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('desktop:quitAndRestart', () => {
    app.relaunch()
    app.exit(0)
  })
}
