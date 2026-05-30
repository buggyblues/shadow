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
  getConnectorDaemonState,
  refreshConnectorConnections,
  setConnectorConnectionEnabled,
  startConnectorDaemon,
  stopConnectorDaemon,
} from './connector-daemon'
import { desktopText } from './i18n'
import {
  getMainWindow,
  getPetWindow,
  hidePetWindow,
  showCommunityWindow,
  showCreateBuddyWindow,
  showDesktopSettingsWindow,
  showPetWindow,
} from './window'

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

export function refreshTrayIconState(): void {
  if (hasAttention) {
    applyTrayIcon('attention')
    refreshTrayContextMenu()
    return
  }
  const mainWindow = getMainWindow()
  const petWindow = getPetWindow()
  const active =
    Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) ||
    Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
  applyTrayIcon(active ? 'active' : 'idle')
  refreshTrayContextMenu()
}

export function setTrayAttention(active: boolean): void {
  hasAttention = active
  refreshTrayIconState()
}

function refreshSoon(): void {
  setTimeout(refreshTrayIconState, 0)
}

function isVisible(win: Electron.BrowserWindow | null): boolean {
  return Boolean(win && !win.isDestroyed() && win.isVisible())
}

export function refreshTrayContextMenu(): void {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate(buildDesktopContextMenuTemplate()))
}

export function showDesktopContextMenu(window?: BrowserWindow | null): void {
  const menu = Menu.buildFromTemplate(buildDesktopContextMenuTemplate())
  const targetWindow =
    window && !window.isDestroyed()
      ? window
      : BrowserWindow.getFocusedWindow() || getPetWindow() || getMainWindow() || undefined
  if (targetWindow) menu.popup({ window: targetWindow })
  else menu.popup()
}

function buildDesktopContextMenuTemplate(): MenuItemConstructorOptions[] {
  const petVisible = isVisible(getPetWindow())
  const connectorState = getConnectorDaemonState()
  refreshConnectorConnectionsIfNeeded(connectorState.running)
  return [
    {
      label: desktopText('community'),
      click: () => {
        showCommunityWindow()
        refreshSoon()
      },
    },
    {
      label: desktopText('desktopPet'),
      type: 'checkbox',
      checked: petVisible,
      click: (item) => {
        if (item.checked) showPetWindow()
        else hidePetWindow()
        refreshSoon()
      },
    },
    { type: 'separator' },
    connectorMenuItem(connectorState),
    {
      label: desktopText('preferences'),
      click: () => {
        showDesktopSettingsWindow()
        refreshSoon()
      },
    },
    { type: 'separator' },
    {
      label: desktopText('quit'),
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
  refreshConnectorConnections()
    .catch(() => null)
    .finally(() => {
      connectionRefreshInFlight = false
      if (tray) refreshTrayContextMenu()
    })
}

function connectorMenuItem(
  state: ReturnType<typeof getConnectorDaemonState>,
): MenuItemConstructorOptions {
  return {
    label: desktopText('connector'),
    submenu: [
      {
        label: desktopText('enableConnector'),
        type: 'checkbox',
        checked: state.running,
        click: (item) => {
          const action = item.checked ? startConnectorDaemon() : stopConnectorDaemon()
          action
            .catch(() => {
              showDesktopSettingsWindow('connector')
            })
            .finally(refreshSoon)
        },
      },
      {
        label: desktopText('addBuddy'),
        click: () => {
          startConnectorDaemon()
            .then(() => {
              showCreateBuddyWindow()
            })
            .catch(() => {
              showDesktopSettingsWindow('connector')
            })
            .finally(refreshSoon)
        },
      },
      {
        label: desktopText('preferences'),
        click: () => {
          showDesktopSettingsWindow('connector')
          refreshSoon()
        },
      },
      { type: 'separator' },
      ...(state.connections.length
        ? state.connections.map(connectorConnectionMenuItem)
        : [
            {
              label: desktopText('noConnectorConnections'),
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
        label: desktopText('enableConnection'),
        type: 'checkbox',
        checked: enabled,
        click: (item) => {
          setConnectorConnectionEnabled(connection.agentId, item.checked)
            .catch(() => {
              showDesktopSettingsWindow('connector')
            })
            .finally(refreshSoon)
        },
      },
      {
        label: desktopText('disconnectConnection'),
        click: () => {
          setConnectorConnectionEnabled(connection.agentId, false)
            .catch(() => {
              showDesktopSettingsWindow('connector')
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

export function createTray(): void {
  tray = new Tray(createTrayIcon(trayIconState))
  refreshTrayIconState()

  for (const win of [getMainWindow(), getPetWindow()]) {
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

export function getTray(): Tray | null {
  return tray
}
