import { join } from 'node:path'
import { app, Menu, nativeImage, Tray } from 'electron'
import { getMainWindow } from './window'

let tray: Tray | null = null

export function createTray(): void {
  let icon: Electron.NativeImage

  if (process.platform === 'darwin') {
    // macOS: use Template image (system handles light/dark coloring)
    icon = nativeImage.createFromPath(join(__dirname, '../../assets/trayTemplate.png'))
    icon.setTemplateImage(true)
  } else {
    // Windows/Linux: use colored app icon
    icon = nativeImage.createFromPath(join(__dirname, '../../assets/tray.png'))
  }

  tray = new Tray(icon)
  tray.setToolTip('Shadow')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Shadow',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isVisible()) {
        win.focus()
      } else {
        win.show()
      }
    }
  })
}

export function getTray(): Tray | null {
  return tray
}
