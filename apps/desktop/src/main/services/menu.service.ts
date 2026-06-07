import { app, Menu, shell } from 'electron'
import { i18nService } from './i18n.service'

export class MenuService {
  createAppMenu(): void {
    const isMac = process.platform === 'darwin'

    if (!isMac) {
      Menu.setApplicationMenu(null)
      return
    }

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' as const },
          { type: 'separator' as const },
          { role: 'services' as const },
          { type: 'separator' as const },
          { role: 'hide' as const },
          { role: 'hideOthers' as const },
          { role: 'unhide' as const },
          { type: 'separator' as const },
          { role: 'quit' as const },
        ],
      },
      {
        label: i18nService.text('edit'),
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: i18nService.text('view'),
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: i18nService.text('window'),
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac
            ? [{ type: 'separator' as const }, { role: 'front' as const }]
            : [{ role: 'close' as const }]),
        ],
      },
      {
        label: i18nService.text('help'),
        submenu: [
          {
            label: i18nService.text('documentation'),
            click: () => {
              shell.openExternal('https://shadowob.com')
            },
          },
        ],
      },
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  }
}

export const menuService = new MenuService()
