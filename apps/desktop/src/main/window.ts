import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { getWindowState, saveWindowState } from './window-state'

let mainWindow: BrowserWindow | null = null

const isDev = !!process.env.DESKTOP_DEV_URL

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function getRendererURL(): string {
  if (process.env.DESKTOP_DEV_URL) {
    return process.env.DESKTOP_DEV_URL
  }
  // Use custom app:// protocol so absolute paths (e.g., /Logo.svg) resolve correctly
  return 'app://shadow/index.html'
}

export function createWindow(): BrowserWindow {
  const savedState = getWindowState()
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: savedState?.width ?? Math.min(1280, screenWidth),
    height: savedState?.height ?? Math.min(800, screenHeight),
    x: savedState?.x,
    y: savedState?.y,
    minWidth: 940,
    minHeight: 560,
    title: 'Shadow',
    titleBarStyle:
      process.platform === 'linux'
        ? 'default'
        : process.platform === 'darwin'
          ? 'hiddenInset'
          : 'hidden',
    ...(process.platform === 'darwin' && { trafficLightPosition: { x: 8, y: 8 } }),
    ...(process.platform === 'win32' && {
      titleBarOverlay: { color: '#1a1a2e', symbolColor: '#e1e1e6', height: 48 },
    }),
    icon: join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    backgroundColor: '#1a1a2e',
  })

  // Load the renderer
  mainWindow.loadURL(getRendererURL())

  // Open DevTools in development only
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // Show when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Save window state on resize/move
  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const bounds = mainWindow.getBounds()
    const isMaximized = mainWindow.isMaximized()
    saveWindowState({ ...bounds, isMaximized })
  }

  mainWindow.on('resize', saveState)
  mainWindow.on('move', saveState)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
