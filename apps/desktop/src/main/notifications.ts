import { app, ipcMain, Notification } from 'electron'
import { getMainWindow } from './window'

export function setupNotificationHandler(): void {
  ipcMain.handle(
    'desktop:showNotification',
    (_event, args: { title: string; body: string; channelId?: string }) => {
      if (!Notification.isSupported()) return

      const notification = new Notification({
        title: args.title,
        body: args.body,
        silent: false,
      })

      notification.on('click', () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
          if (args.channelId) {
            win.webContents.send('desktop:navigateToChannel', args.channelId)
          }
        }
      })

      notification.show()
    },
  )

  ipcMain.handle('desktop:setBadgeCount', (_event, count: number) => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge(count > 0 ? String(count) : '')
    }
    // Windows badge is handled via taskbar overlay (requires icon)
  })

  ipcMain.handle('desktop:setNotificationMode', (_event, _mode: string) => {
    // Store notification mode preference - can be extended to filter notifications
  })
}
