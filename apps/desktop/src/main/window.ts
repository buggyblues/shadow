import { join } from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
import { readPetWindowState, savePetWindowState } from './pet-window-state'
import { getWindowState, saveWindowState } from './window-state'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let petWindow: BrowserWindow | null = null
let connectorAuthWindow: BrowserWindow | null = null
let readerWindow: BrowserWindow | null = null
let allowPetClose = false

const isDev = !!(process.env.DESKTOP_WEB_DEV_URL || process.env.DESKTOP_DEV_URL)
const PET_COMPACT_SIZE = { width: 240, height: 240 }
const PET_EXPANDED_SIZE = { width: 960, height: 600 }
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 500
const SETTINGS_TABS = new Set([
  'general',
  'connector',
  'shortcuts',
  'voice',
  'pet',
  'network',
  'about',
])

let mainWindowStateSaveTimer: ReturnType<typeof setTimeout> | null = null
let petWindowStateSaveTimer: ReturnType<typeof setTimeout> | null = null

function applyPetWindowLevel(mode: 'compact' | 'expanded'): void {
  if (!petWindow || petWindow.isDestroyed()) return
  const level = mode === 'compact' ? 'screen-saver' : 'floating'
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.setAlwaysOnTop(true, level)
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function getWebRendererURL(): string {
  if (process.env.DESKTOP_WEB_DEV_URL || process.env.DESKTOP_DEV_URL) {
    return process.env.DESKTOP_WEB_DEV_URL || process.env.DESKTOP_DEV_URL || ''
  }
  return 'app://shadow'
}

function getLocalRendererURL(): string {
  if (process.env.DESKTOP_LOCAL_DEV_URL) {
    return process.env.DESKTOP_LOCAL_DEV_URL
  }
  return 'desktop-local://shadow'
}

function getPetRendererURL(): string {
  return getDesktopLocalURL('pet')
}

function getWebAppRouteURL(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const rendererURL = getWebRendererURL()
  const base = rendererURL.endsWith('/') ? rendererURL : `${rendererURL}/`
  return new URL(`app${normalizedPath}`, base).toString()
}

function normalizeSettingsTab(tab: string | null | undefined): string | null {
  const normalized = tab?.trim()
  return normalized && SETTINGS_TABS.has(normalized) ? normalized : null
}

function getDesktopLocalURL(view: 'pet' | 'settings' | 'reader', tab?: string | null): string {
  const rendererURL = getLocalRendererURL()
  const base = rendererURL.endsWith('/') ? rendererURL : `${rendererURL}/`
  const url = new URL('desktop-local.html', base)
  url.searchParams.set('view', view)
  const normalizedTab = view === 'settings' ? normalizeSettingsTab(tab) : null
  if (normalizedTab) url.searchParams.set('tab', normalizedTab)
  return url.toString()
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
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
    icon: join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    backgroundColor: '#000000',
  })

  // Load the renderer
  mainWindow.loadURL(getWebAppRouteURL('/'))

  // Open external links (target="_blank") in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

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
  const scheduleSaveState = () => {
    if (mainWindowStateSaveTimer) clearTimeout(mainWindowStateSaveTimer)
    mainWindowStateSaveTimer = setTimeout(() => {
      mainWindowStateSaveTimer = null
      saveState()
    }, WINDOW_STATE_SAVE_DEBOUNCE_MS)
  }

  mainWindow.on('resize', scheduleSaveState)
  mainWindow.on('move', scheduleSaveState)
  mainWindow.on('close', () => {
    if (mainWindowStateSaveTimer) {
      clearTimeout(mainWindowStateSaveTimer)
      mainWindowStateSaveTimer = null
    }
    saveState()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function showMainWindow(): void {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow()
  win.show()
  win.focus()
}

export function showCommunityWindow(path?: string): void {
  const existingWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  const win = existingWindow ?? createWindow()
  if (path || !existingWindow) {
    win.loadURL(getWebAppRouteURL(path ?? '/discover'))
  }
  win.show()
  win.focus()
}

export function showCreateBuddyWindow(): void {
  showCommunityWindow(`/discover?createBuddy=1&desktopCreateBuddyAt=${Date.now()}`)
}

export function hideMainWindow(): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.hide()
}

export function showConnectorAuthWindow(): BrowserWindow {
  let win = connectorAuthWindow && !connectorAuthWindow.isDestroyed() ? connectorAuthWindow : null
  if (!win) {
    win = new BrowserWindow({
      width: 640,
      height: 760,
      minWidth: 520,
      minHeight: 560,
      title: 'Shadow Connector Authorization',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
      icon: join(__dirname, '../../assets/icon.png'),
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      show: false,
      backgroundColor: '#000000',
    })
    connectorAuthWindow = win
    win.loadURL(getWebAppRouteURL('/login?redirect=/discover'))
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })
    const createdWindow = win
    win.once('ready-to-show', () => {
      if (!createdWindow.isDestroyed()) createdWindow.show()
    })
    win.on('closed', () => {
      if (connectorAuthWindow === createdWindow) connectorAuthWindow = null
    })
  }
  win.show()
  win.focus()
  return win
}

export function getConnectorAuthWindow(): BrowserWindow | null {
  return connectorAuthWindow
}

export function showDesktopSettingsWindow(tab?: string | null): void {
  const normalizedTab = normalizeSettingsTab(tab)
  let win = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null
  if (!win) {
    win = new BrowserWindow({
      width: 760,
      height: 560,
      minWidth: 680,
      minHeight: 480,
      title: 'Shadow Desktop Settings',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
      icon: join(__dirname, '../../assets/icon.png'),
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      show: false,
      backgroundColor: '#000000',
    })
    settingsWindow = win
    win.loadURL(getDesktopLocalURL('settings', normalizedTab))
    const createdWindow = win
    win.once('ready-to-show', () => {
      if (!createdWindow.isDestroyed()) createdWindow.show()
    })
    win.on('closed', () => {
      if (settingsWindow === createdWindow) settingsWindow = null
    })
  } else if (normalizedTab) {
    const sendTab = () => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('desktop:settings:selectTab', normalizedTab)
    }
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', sendTab)
    } else {
      sendTab()
    }
  }
  win.show()
  win.focus()
}

export function showReaderWindow(title = 'Shadow Reader'): BrowserWindow {
  let win = readerWindow && !readerWindow.isDestroyed() ? readerWindow : null
  if (!win) {
    win = new BrowserWindow({
      width: 1080,
      height: 760,
      minWidth: 720,
      minHeight: 520,
      title,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
      icon: join(__dirname, '../../assets/icon.png'),
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      show: false,
      backgroundColor: '#000000',
    })
    readerWindow = win
    win.loadURL(getDesktopLocalURL('reader'))
    win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        shell.openExternal(targetUrl)
      }
      return { action: 'deny' }
    })
    const createdWindow = win
    win.once('ready-to-show', () => {
      if (!createdWindow.isDestroyed()) createdWindow.show()
    })
    win.on('closed', () => {
      if (readerWindow === createdWindow) readerWindow = null
    })
  }
  win.setTitle(title)
  win.show()
  win.focus()
  return win
}

export function getReaderWindow(): BrowserWindow | null {
  return readerWindow
}

export function createPetWindow(): BrowserWindow {
  if (petWindow && !petWindow.isDestroyed()) return petWindow

  const savedState = readPetWindowState()

  petWindow = new BrowserWindow({
    ...savedState,
    minWidth: 180,
    minHeight: 180,
    maxWidth: 1080,
    maxHeight: 760,
    title: 'Shadow Desktop Pet',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    acceptFirstMouse: true,
    icon: join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  })

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  applyPetWindowLevel('compact')
  petWindow.loadURL(getPetRendererURL())

  petWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (isDev) {
    petWindow.webContents.openDevTools({ mode: 'detach' })
  }

  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive()
  })

  const savePetState = () => {
    if (!petWindow || petWindow.isDestroyed()) return
    savePetWindowState(petWindow.getBounds())
  }
  const scheduleSavePetState = () => {
    if (petWindowStateSaveTimer) clearTimeout(petWindowStateSaveTimer)
    petWindowStateSaveTimer = setTimeout(() => {
      petWindowStateSaveTimer = null
      savePetState()
    }, WINDOW_STATE_SAVE_DEBOUNCE_MS)
  }

  petWindow.on('resize', scheduleSavePetState)
  petWindow.on('move', scheduleSavePetState)
  petWindow.on('close', (event) => {
    if (petWindowStateSaveTimer) {
      clearTimeout(petWindowStateSaveTimer)
      petWindowStateSaveTimer = null
    }
    savePetState()
    if (allowPetClose) return
    event.preventDefault()
    petWindow?.hide()
  })
  petWindow.on('closed', () => {
    petWindow = null
  })

  return petWindow
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow
}

export function showPetWindow(): void {
  const win = createPetWindow()
  applyPetWindowLevel('compact')
  win.show()
  win.focus()
}

export function setPetPanelMode(mode: 'compact' | 'expanded'): void {
  const win = createPetWindow()
  const requestedSize = mode === 'expanded' ? PET_EXPANDED_SIZE : PET_COMPACT_SIZE
  const display = screen.getDisplayMatching(win.getBounds())
  const bounds = display.workArea
  const currentBounds = win.getBounds()
  const size = {
    width: Math.min(requestedSize.width, bounds.width),
    height: Math.min(requestedSize.height, bounds.height),
  }
  const stageCenterX = currentBounds.x + PET_COMPACT_SIZE.width / 2
  const stageCenterY = currentBounds.y + currentBounds.height / 2
  const x = Math.min(
    Math.max(stageCenterX - PET_COMPACT_SIZE.width / 2, bounds.x),
    bounds.x + bounds.width - size.width,
  )
  const y = Math.min(
    Math.max(stageCenterY - size.height / 2, bounds.y),
    bounds.y + bounds.height - size.height,
  )
  win.setBounds({ x, y, ...size }, true)
  applyPetWindowLevel(mode)
}

export function hidePetWindow(): void {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  win.hide()
}

export function sendPetShortcut(
  action: 'voice' | 'chat' | 'notifications' | 'services' | 'care',
): void {
  const win = createPetWindow()
  applyPetWindowLevel('expanded')
  win.showInactive()
  win.webContents.send('desktop:pet:shortcut', action)
}

export function togglePetWindow(): void {
  const win = createPetWindow()
  if (win.isVisible()) {
    win.hide()
    return
  }
  applyPetWindowLevel('compact')
  win.showInactive()
}

export function movePetWindow(delta: { x: number; y: number }): void {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  const [x = 0, y = 0] = win.getPosition()
  const dx = Number.isFinite(delta?.x) ? delta.x : 0
  const dy = Number.isFinite(delta?.y) ? delta.y : 0
  win.setPosition(Math.round(x + dx), Math.round(y + dy), false)
}

export function allowPetWindowClose(): void {
  allowPetClose = true
}
