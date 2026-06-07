import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  Tray,
} from 'electron'
import {
  type ConnectorConnection,
  type ConnectorDaemonService,
  connectorDaemonService,
} from './connector-daemon.service'
import { i18nService } from './i18n.service'
import { petVisibilityService } from './pet-visibility.service'
import { windowService } from './window.service'

type TrayIconState = 'idle' | 'active' | 'attention'

let tray: Tray | null = null
let trayIconState: TrayIconState = 'idle'
let hasAttention = false
let connectionRefreshInFlight = false
let lastConnectionRefreshAt = 0

function trayIconPath(state: TrayIconState): string {
  if (process.platform === 'darwin') {
    return join(__dirname, '../../assets/trayTemplate@2x.png')
  }

  if (state === 'attention') return join(__dirname, '../../assets/trayAttention.png')
  if (state === 'active') return join(__dirname, '../../assets/trayActive.png')
  return join(__dirname, '../../assets/tray.png')
}

function createTrayIcon(state: TrayIconState): Electron.NativeImage {
  let icon = nativeImage.createFromPath(trayIconPath(state))
  if (icon.isEmpty() && state !== 'idle') {
    icon = nativeImage.createFromPath(trayIconPath('idle'))
  }
  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 18, height: 18 })
    icon.setTemplateImage(true)
  }
  return icon
}

function applyTrayIcon(state: TrayIconState): void {
  trayIconState = state
  if (!tray) return
  tray.setImage(createTrayIcon(state))
  tray.setToolTip(
    state === 'attention'
      ? 'Shadow - needs attention'
      : state === 'active'
        ? 'Shadow - active'
        : 'Shadow',
  )
}

function refreshTrayIconState(): void {
  if (hasAttention) {
    applyTrayIcon('attention')
    refreshTrayContextMenu()
    return
  }
  const mainWindow = windowService.getMainWindow()
  const active =
    Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) ||
    petVisibilityService.isDesktopPetVisible()
  applyTrayIcon(active ? 'active' : 'idle')
  refreshTrayContextMenu()
}

function setTrayAttention(active: boolean): void {
  hasAttention = active
  refreshTrayIconState()
}

function refreshSoon(): void {
  setTimeout(refreshTrayIconState, 0)
}

function refreshTrayContextMenu(): void {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate(buildDesktopContextMenuTemplate()))
}

function showDesktopContextMenu(window?: BrowserWindow | null): void {
  const menu = Menu.buildFromTemplate(buildDesktopContextMenuTemplate())
  const targetWindow =
    window && !window.isDestroyed()
      ? window
      : BrowserWindow.getFocusedWindow() ||
        windowService.getPetWindow() ||
        windowService.getMainWindow() ||
        undefined
  if (targetWindow) menu.popup({ window: targetWindow })
  else menu.popup()
}

function buildDesktopContextMenuTemplate(): MenuItemConstructorOptions[] {
  const petVisible = petVisibilityService.isDesktopPetVisible()
  const connectorState = connectorDaemonService.getState()
  refreshConnectorConnectionsIfNeeded(connectorState.running)
  return [
    {
      label: i18nService.text('community'),
      click: () => {
        windowService.showCommunityWindow()
        refreshSoon()
      },
    },
    {
      label: i18nService.text('desktopPet'),
      type: 'checkbox',
      checked: petVisible,
      click: (item) => {
        petVisibilityService.setDesktopPetVisible(item.checked, 'tray')
        if (item.checked) windowService.showPetWindow()
        else windowService.hidePetWindow()
        refreshSoon()
      },
    },
    { type: 'separator' },
    connectorMenuItem(connectorState),
    {
      label: i18nService.text('preferences'),
      click: () => {
        windowService.showDesktopSettingsWindow()
        refreshSoon()
      },
    },
    { type: 'separator' },
    {
      label: i18nService.text('quit'),
      click: () => {
        app.quit()
      },
    },
  ]
}

function refreshConnectorConnectionsIfNeeded(connectorRunning: boolean): void {
  if (!connectorRunning || connectionRefreshInFlight) return
  if (Date.now() - lastConnectionRefreshAt < 3000) return
  connectionRefreshInFlight = true
  lastConnectionRefreshAt = Date.now()
  connectorDaemonService
    .refreshConnections()
    .catch(() => null)
    .finally(() => {
      connectionRefreshInFlight = false
      if (tray) refreshTrayContextMenu()
    })
}

function connectorMenuItem(
  state: ReturnType<ConnectorDaemonService['getState']>,
): MenuItemConstructorOptions {
  return {
    label: i18nService.text('connector'),
    submenu: [
      {
        label: i18nService.text('enableConnector'),
        type: 'checkbox',
        checked: state.running,
        click: (item) => {
          const action = item.checked
            ? connectorDaemonService.start()
            : connectorDaemonService.stop()
          action
            .catch(() => {
              windowService.showDesktopSettingsWindow('connector')
            })
            .finally(refreshSoon)
        },
      },
      {
        label: i18nService.text('addBuddy'),
        click: () => {
          connectorDaemonService
            .start()
            .then(() => {
              windowService.showCreateBuddyWindow()
            })
            .catch(() => {
              windowService.showDesktopSettingsWindow('connector')
            })
            .finally(refreshSoon)
        },
      },
      {
        label: i18nService.text('preferences'),
        click: () => {
          windowService.showDesktopSettingsWindow('connector')
          refreshSoon()
        },
      },
      { type: 'separator' },
      ...(state.connections.length
        ? state.connections.map(connectorConnectionMenuItem)
        : [
            {
              label: i18nService.text('noConnectorConnections'),
              enabled: false,
            },
          ]),
    ],
  }
}

function connectorConnectionMenuItem(connection: ConnectorConnection): MenuItemConstructorOptions {
  const enabled = connection.status === 'running'
  return {
    label: `${connection.label} - ${connection.runtimeLabel}`,
    type: 'checkbox',
    checked: enabled,
    submenu: [
      {
        label: i18nService.text('enableConnection'),
        type: 'checkbox',
        checked: enabled,
        click: (item) => {
          connectorDaemonService
            .setConnectionEnabled(connection.agentId, item.checked)
            .catch(() => {
              windowService.showDesktopSettingsWindow('connector')
            })
            .finally(refreshSoon)
        },
      },
      {
        label: i18nService.text('disconnectConnection'),
        click: () => {
          connectorDaemonService
            .setConnectionEnabled(connection.agentId, false)
            .catch(() => {
              windowService.showDesktopSettingsWindow('connector')
            })
            .finally(refreshSoon)
        },
      },
      {
        label: connection.computerName,
        enabled: false,
      },
    ],
  }
}

function createTray(): void {
  tray = new Tray(createTrayIcon(trayIconState))
  petVisibilityService.onDesktopPetVisibilityChanged(refreshTrayIconState)
  refreshTrayIconState()

  for (const win of [windowService.getMainWindow(), windowService.getPetWindow()]) {
    win?.on('show', refreshTrayIconState)
    win?.on('hide', refreshTrayIconState)
    win?.on('focus', refreshTrayIconState)
    win?.on('blur', refreshTrayIconState)
    win?.on('closed', refreshTrayIconState)
  }

  refreshTrayContextMenu()

  tray.on('click', refreshTrayContextMenu)
  tray.on('right-click', refreshTrayContextMenu)
}

function getTray(): Tray | null {
  return tray
}

export class TrayService {
  refreshIconState(): void {
    refreshTrayIconState()
  }

  setAttention(active: boolean): void {
    setTrayAttention(active)
  }

  refreshContextMenu(): void {
    refreshTrayContextMenu()
  }

  showDesktopContextMenu(window?: BrowserWindow | null): void {
    showDesktopContextMenu(window)
  }

  createTray(): void {
    createTray()
  }

  getTray(): Tray | null {
    return getTray()
  }
}

export const trayService = new TrayService()
