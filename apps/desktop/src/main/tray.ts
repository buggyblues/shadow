import { join } from 'node:path'
import { app, Menu, nativeImage, shell, Tray } from 'electron'
import { getPetWindow, showPetWindow } from './window'

let tray: Tray | null = null

export function createTray(webOrigin: string) {
  const iconPath = join(__dirname, '../../assets/trayTemplate.png')
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(join(__dirname, '../../assets/icon.png'))
  }
  image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip('XiaDou Desktop Pet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show XiaDou',
        click: () => showPetWindow(),
      },
      {
        label: 'Open Shadow',
        click: () => {
          void shell.openExternal(`${webOrigin}/app/discover`)
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]),
  )
  tray.on('click', () => {
    const win = getPetWindow()
    if (win?.isVisible()) {
      win.hide()
      return
    }
    showPetWindow()
  })
  return tray
}
