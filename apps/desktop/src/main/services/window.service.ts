import { join } from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
import { appIconService } from './app-icon.service'
import { desktopSettingsService } from './desktop-settings.service'
import { i18nService } from './i18n.service'
import { loggerService } from './logger.service'
import { petVisibilityService } from './pet-visibility.service'
import { petWindowStateService } from './pet-window-state.service'
import { windowStateService } from './window-state.service'

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let petWindow: BrowserWindow | null = null
let connectorAuthWindow: BrowserWindow | null = null
let readerWindow: BrowserWindow | null = null
let allowMainClose = false
let allowPetClose = false
let petPanelMode: 'compact' | 'expanded' = 'compact'
let petStageOffsetY = 0

const isDev = process.env.NODE_ENV === 'development'
const PET_COMPACT_SIZE = { width: 336, height: 336 }
const PET_EXPANDED_STAGE_WIDTH = 240
const PET_EXPANDED_SIZE = { width: 960, height: 600 }
const PET_WINDOW_PADDING = 8
const PET_STAGE_VISUAL_RADIUS = 112
const PET_WINDOW_ANIMATE = true
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

function desktopWindowIcon() {
  const icon = appIconService.resolveDesktopIconPathSync(['png', 'icns'])
  return icon ? { icon } : {}
}

type PetPanelLayout = {
  stageOffsetY: number
}

type SavedWindowState = NonNullable<ReturnType<typeof windowStateService.getWindowState>>

type PetWindowDragPoint = {
  pointerId?: number
  screenX?: number
  screenY?: number
}

type PetWindowMoveInput = PetWindowDragPoint & {
  x?: number
  y?: number
}

type PetWindowDragSession = {
  pointerId: number
  pointerStart: { x: number; y: number }
  windowStart: { x: number; y: number }
}

let petWindowDragSession: PetWindowDragSession | null = null
let petMouseInteractive = false
let loggedLargePetDragDelta = false

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function hasVisibleIntersection(
  bounds: { x: number; y: number; width: number; height: number },
  area: { x: number; y: number; width: number; height: number },
): boolean {
  const left = Math.max(bounds.x, area.x)
  const right = Math.min(bounds.x + bounds.width, area.x + area.width)
  const top = Math.max(bounds.y, area.y)
  const bottom = Math.min(bounds.y + bounds.height, area.y + area.height)
  return right - left >= 80 && bottom - top >= 80
}

function restorableWindowState(state: SavedWindowState | null): SavedWindowState | null {
  if (!state) return null
  const bounds = {
    x: state.x,
    y: state.y,
    width: Math.max(state.width, 940),
    height: Math.max(state.height, 560),
  }
  const visible = screen
    .getAllDisplays()
    .some((display) => hasVisibleIntersection(bounds, display.workArea))
  return visible ? { ...state, ...bounds } : null
}

function applyPetWindowLevel(_mode: 'compact' | 'expanded'): void {
  if (!petWindow || petWindow.isDestroyed()) return
  const level = 'floating'
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.setAlwaysOnTop(true, level)
}

function applyPetMouseInteractivity(): void {
  if (!petWindow || petWindow.isDestroyed()) return
  if (petPanelMode === 'expanded' || petMouseInteractive || petWindowDragSession) {
    petWindow.setIgnoreMouseEvents(false)
    return
  }
  petWindow.setIgnoreMouseEvents(true, { forward: true })
}

function setPetMouseInteractive(interactive: boolean): void {
  petMouseInteractive = interactive
  applyPetMouseInteractivity()
}

function normalizePetCompactBounds(bounds: {
  x: number
  y: number
  width: number
  height: number
}): { x: number; y: number; width: number; height: number } {
  return {
    x: bounds.x,
    y: bounds.y,
    ...PET_COMPACT_SIZE,
  }
}

function screenPointToDipPoint(point: { x: number; y: number }): { x: number; y: number } {
  const converter = screen.screenToDipPoint?.bind(screen)
  return converter ? converter(point) : point
}

function currentCursorPoint(): { x: number; y: number } {
  return screen.getCursorScreenPoint()
}

function normalizedPetDragPoint(input: PetWindowDragPoint): { x: number; y: number } | null {
  const x = Number(input?.screenX)
  const y = Number(input?.screenY)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return screenPointToDipPoint({ x, y })
}

function normalizedPointerId(value: unknown): number {
  const pointerId = Number(value)
  return Number.isFinite(pointerId) ? pointerId : -1
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function getWebRendererURL(): string {
  return desktopSettingsService.resolveDesktopAppBaseUrl(desktopSettingsService.readSettingsSync())
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
  const inputPath = path.trim()
  const routePath =
    inputPath === '/app'
      ? ''
      : inputPath.startsWith('/app/')
        ? inputPath.slice('/app/'.length)
        : inputPath
  const normalizedPath = routePath.replace(/^\/+/, '')
  const rendererURL = getWebRendererURL()
  const base = rendererURL.endsWith('/') ? rendererURL : `${rendererURL}/`
  return normalizedPath ? new URL(normalizedPath, base).toString() : rendererURL
}

function isAuthEntryRouteURL(rawUrl: string): boolean {
  if (!rawUrl || rawUrl === 'about:blank') return true
  try {
    const url = new URL(rawUrl)
    return (
      url.pathname === '/app/login' ||
      url.pathname === '/app/register' ||
      url.pathname === '/app/desktop-auth-callback'
    )
  } catch {
    return false
  }
}

function shouldLoadCommunityRoute(win: BrowserWindow, path?: string): boolean {
  if (path) return true
  return isAuthEntryRouteURL(win.webContents.getURL())
}

function attachWindowDiagnostics(win: BrowserWindow, scope: string): void {
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return
    loggerService.write('error', scope, 'window failed to load', {
      errorCode,
      errorDescription,
      url: validatedURL,
    })
  })
  win.webContents.on(
    'did-fail-provisional-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return
      loggerService.write('error', scope, 'window failed provisional load', {
        errorCode,
        errorDescription,
        url: validatedURL,
      })
    },
  )
  win.webContents.on('render-process-gone', (_event, details) => {
    loggerService.write('error', scope, 'window renderer process gone', details)
  })
  win.on('unresponsive', () => {
    loggerService.write('warn', scope, 'window became unresponsive', {
      url: win.webContents.getURL(),
    })
  })
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

function createWindow(): BrowserWindow {
  const savedState = restorableWindowState(windowStateService.getWindowState())
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: savedState?.width ?? Math.min(1280, screenWidth),
    height: savedState?.height ?? Math.min(800, screenHeight),
    x: savedState?.x,
    y: savedState?.y,
    minWidth: 940,
    minHeight: 560,
    title: i18nService.appName(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
    ...desktopWindowIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    backgroundColor: '#000000',
  })

  attachWindowDiagnostics(mainWindow, 'window.main')

  // Load the renderer
  mainWindow.loadURL(getWebRendererURL())

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
    if (savedState?.isMaximized && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize()
    }
    mainWindow?.show()
  })

  // Save window state on resize/move
  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const isMaximized = mainWindow.isMaximized()
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    windowStateService.saveWindowState({ ...bounds, isMaximized })
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
  mainWindow.on('close', (event) => {
    if (mainWindowStateSaveTimer) {
      clearTimeout(mainWindowStateSaveTimer)
      mainWindowStateSaveTimer = null
    }
    saveState()
    if (!allowMainClose) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function allowMainWindowClose(): void {
  allowMainClose = true
}

function showMainWindow(): void {
  appIconService.ensureDesktopDockIcon()
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow()
  win.show()
  win.focus()
}

function showCommunityWindow(path?: string): void {
  appIconService.ensureDesktopDockIcon()
  const existingWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  const win = existingWindow ?? createWindow()
  if (!existingWindow || shouldLoadCommunityRoute(win, path)) {
    win.loadURL(getWebAppRouteURL(path ?? '/discover'))
  }
  win.show()
  win.focus()
}

function showCreateBuddyWindow(): void {
  showCommunityWindow(`/discover?createBuddy=1&desktopCreateBuddyAt=${Date.now()}`)
}

function hideMainWindow(): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.hide()
}

function showConnectorAuthWindow(redirect?: string | null): BrowserWindow {
  let win = connectorAuthWindow && !connectorAuthWindow.isDestroyed() ? connectorAuthWindow : null
  const loginRedirect = redirect?.trim() || '/discover'
  if (!win) {
    win = new BrowserWindow({
      width: 640,
      height: 760,
      minWidth: 520,
      minHeight: 560,
      title: `${i18nService.appName()} Connector Authorization`,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
      ...desktopWindowIcon(),
      autoHideMenuBar: true,
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
    attachWindowDiagnostics(win, 'window.connectorAuth')
    win.loadURL(getWebAppRouteURL(`/login?redirect=${encodeURIComponent(loginRedirect)}`))
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

function getConnectorAuthWindow(): BrowserWindow | null {
  return connectorAuthWindow
}

function showDesktopSettingsWindow(tab?: string | null): void {
  appIconService.ensureDesktopDockIcon()
  const normalizedTab = normalizeSettingsTab(tab)
  let win = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : null
  if (!win) {
    win = new BrowserWindow({
      width: 760,
      height: 560,
      minWidth: 680,
      minHeight: 480,
      title: i18nService.text('settings'),
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      ...(process.platform === 'darwin' && { trafficLightPosition: { x: 14, y: 14 } }),
      ...desktopWindowIcon(),
      autoHideMenuBar: true,
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

function showReaderWindow(title = 'Shadow Reader'): BrowserWindow {
  appIconService.ensureDesktopDockIcon()
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
      ...desktopWindowIcon(),
      autoHideMenuBar: true,
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

function getReaderWindow(): BrowserWindow | null {
  return readerWindow
}

function createPetWindow(): BrowserWindow {
  if (petWindow && !petWindow.isDestroyed()) return petWindow
  appIconService.ensureDesktopDockIcon()

  const savedState = petWindowStateService.readPetWindowState()
  petPanelMode = 'compact'
  petStageOffsetY = 0
  petMouseInteractive = false

  petWindow = new BrowserWindow({
    ...normalizePetCompactBounds(savedState),
    minWidth: PET_COMPACT_SIZE.width,
    minHeight: PET_COMPACT_SIZE.height,
    maxWidth: 1080,
    maxHeight: 760,
    title: `${i18nService.appName()} ${i18nService.text('desktopPet')}`,
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
    ...desktopWindowIcon(),
    autoHideMenuBar: true,
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
  applyPetMouseInteractivity()
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
    if (petVisibilityService.isDesktopPetVisible()) petWindow?.showInactive()
  })

  const savePetState = () => {
    if (!petWindow || petWindow.isDestroyed()) return
    if (petPanelMode !== 'compact') return
    petWindowStateService.savePetWindowState(normalizePetCompactBounds(petWindow.getBounds()))
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
    petVisibilityService.setDesktopPetVisible(false, 'window')
    petWindow?.hide()
  })
  petWindow.on('closed', () => {
    petWindowDragSession = null
    petMouseInteractive = false
    petWindow = null
  })

  return petWindow
}

function getPetWindow(): BrowserWindow | null {
  return petWindow
}

function showPetWindow(): void {
  appIconService.ensureDesktopDockIcon()
  petVisibilityService.setDesktopPetVisible(true, 'ipc')
  const win = createPetWindow()
  setPetPanelMode('compact')
  win.show()
  win.focus()
}

function setPetPanelMode(mode: 'compact' | 'expanded'): PetPanelLayout {
  const win = createPetWindow()
  const requestedSize = mode === 'expanded' ? PET_EXPANDED_SIZE : PET_COMPACT_SIZE
  const display = screen.getDisplayMatching(win.getBounds())
  const bounds = display.workArea
  const currentBounds = win.getBounds()
  const size = {
    width: Math.min(requestedSize.width, bounds.width),
    height: Math.min(requestedSize.height, bounds.height),
  }
  const currentStageCenterOffset =
    petPanelMode === 'expanded'
      ? PET_WINDOW_PADDING + Math.min(PET_EXPANDED_STAGE_WIDTH, currentBounds.width) / 2
      : currentBounds.width / 2
  const nextStageCenterOffset =
    mode === 'expanded'
      ? PET_WINDOW_PADDING + Math.min(PET_EXPANDED_STAGE_WIDTH, size.width) / 2
      : size.width / 2
  const stageCenterX = currentBounds.x + currentStageCenterOffset
  const stageCenterY =
    currentBounds.y + currentBounds.height / 2 + (petPanelMode === 'expanded' ? petStageOffsetY : 0)
  const x = Math.min(
    Math.max(stageCenterX - nextStageCenterOffset, bounds.x),
    bounds.x + bounds.width - size.width,
  )
  const desiredY = stageCenterY - size.height / 2
  const y = Math.min(Math.max(desiredY, bounds.y), bounds.y + bounds.height - size.height)
  const maxStageOffsetY =
    mode === 'expanded'
      ? Math.max(0, size.height / 2 - PET_WINDOW_PADDING - PET_STAGE_VISUAL_RADIUS)
      : 0
  const nextStageOffsetY =
    mode === 'expanded'
      ? Math.round(
          clampNumber(stageCenterY - (y + size.height / 2), -maxStageOffsetY, maxStageOffsetY),
        )
      : 0
  petPanelMode = mode
  petStageOffsetY = nextStageOffsetY
  win.setBounds({ x, y, ...size }, PET_WINDOW_ANIMATE)
  applyPetWindowLevel(mode)
  applyPetMouseInteractivity()
  return { stageOffsetY: nextStageOffsetY }
}

function hidePetWindow(): void {
  petVisibilityService.setDesktopPetVisible(false, 'ipc')
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  petWindowDragSession = null
  applyPetMouseInteractivity()
  win.hide()
}

function sendPetShortcut(action: 'voice' | 'chat' | 'notifications' | 'services' | 'care'): void {
  appIconService.ensureDesktopDockIcon()
  petVisibilityService.setDesktopPetVisible(true, 'shortcut')
  const win = createPetWindow()
  applyPetWindowLevel('expanded')
  win.showInactive()
  win.webContents.send('desktop:pet:shortcut', action)
}

function togglePetWindow(): void {
  appIconService.ensureDesktopDockIcon()
  if (petVisibilityService.isDesktopPetVisible()) {
    petVisibilityService.setDesktopPetVisible(false, 'shortcut')
    const win = getPetWindow()
    petWindowDragSession = null
    applyPetMouseInteractivity()
    if (!win || win.isDestroyed()) return
    win.hide()
    return
  }
  petVisibilityService.setDesktopPetVisible(true, 'shortcut')
  const win = createPetWindow()
  setPetPanelMode('compact')
  win.showInactive()
}

function beginPetWindowDrag(input: PetWindowDragPoint): void {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  const pointerStart = currentCursorPoint()
  const { x, y } = win.getBounds()
  petWindowDragSession = {
    pointerId: normalizedPointerId(input.pointerId),
    pointerStart,
    windowStart: { x, y },
  }
  loggedLargePetDragDelta = false
  applyPetMouseInteractivity()
}

function movePetWindow(input: PetWindowMoveInput): void {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  if (
    petWindowDragSession &&
    input?.pointerId !== undefined &&
    normalizedPointerId(input.pointerId) !== petWindowDragSession.pointerId
  ) {
    loggerService.write('warn', 'window.pet', 'ignored pet drag move for stale pointer', {
      pointerId: input?.pointerId,
      activePointerId: petWindowDragSession.pointerId,
    })
    return
  }
  const pointer = petWindowDragSession ? currentCursorPoint() : normalizedPetDragPoint(input)
  if (!pointer) {
    loggerService.write('warn', 'window.pet', 'ignored pet drag move without cursor point', {
      pointerId: input?.pointerId,
    })
    return
  }
  const windowStart =
    petWindowDragSession?.windowStart ??
    (() => {
      const [x = 0, y = 0] = win.getPosition()
      return { x, y }
    })()
  const pointerStart = petWindowDragSession?.pointerStart ?? pointer
  const dx = pointer.x - pointerStart.x
  const dy = pointer.y - pointerStart.y
  if (!loggedLargePetDragDelta && (Math.abs(dx) > 400 || Math.abs(dy) > 400)) {
    loggedLargePetDragDelta = true
    loggerService.write('warn', 'window.pet', 'large pet cursor drag delta', {
      pointerId: input?.pointerId,
      dx,
      dy,
    })
  }
  const nextX = windowStart.x + dx
  const nextY = windowStart.y + dy
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    loggerService.write('warn', 'window.pet', 'ignored pet drag move with invalid target', {
      pointerId: input?.pointerId,
      windowStartX: windowStart.x,
      windowStartY: windowStart.y,
      pointerX: pointer.x,
      pointerY: pointer.y,
      dx,
      dy,
    })
    return
  }
  win.setPosition(Math.round(nextX), Math.round(nextY), false)
}

function endPetWindowDrag(pointerId?: number): void {
  if (
    petWindowDragSession &&
    pointerId !== undefined &&
    normalizedPointerId(pointerId) !== petWindowDragSession.pointerId
  ) {
    return
  }
  petWindowDragSession = null
  loggedLargePetDragDelta = false
  applyPetMouseInteractivity()
}

function allowPetWindowClose(): void {
  allowPetClose = true
}

export class WindowService {
  createWindow(): BrowserWindow {
    return createWindow()
  }

  getMainWindow(): BrowserWindow | null {
    return getMainWindow()
  }

  allowMainWindowClose(): void {
    allowMainWindowClose()
  }

  showMainWindow(): void {
    showMainWindow()
  }

  showCommunityWindow(path?: string): void {
    showCommunityWindow(path)
  }

  showCreateBuddyWindow(): void {
    showCreateBuddyWindow()
  }

  hideMainWindow(): void {
    hideMainWindow()
  }

  showConnectorAuthWindow(redirect?: string | null): BrowserWindow {
    return showConnectorAuthWindow(redirect)
  }

  getConnectorAuthWindow(): BrowserWindow | null {
    return getConnectorAuthWindow()
  }

  showDesktopSettingsWindow(tab?: string | null): void {
    showDesktopSettingsWindow(tab)
  }

  showReaderWindow(title = 'Shadow Reader'): BrowserWindow {
    return showReaderWindow(title)
  }

  getReaderWindow(): BrowserWindow | null {
    return getReaderWindow()
  }

  createPetWindow(): BrowserWindow {
    return createPetWindow()
  }

  getPetWindow(): BrowserWindow | null {
    return getPetWindow()
  }

  showPetWindow(): void {
    showPetWindow()
  }

  setPetPanelMode(mode: 'compact' | 'expanded'): PetPanelLayout {
    return setPetPanelMode(mode)
  }

  hidePetWindow(): void {
    hidePetWindow()
  }

  sendPetShortcut(action: 'voice' | 'chat' | 'notifications' | 'services' | 'care'): void {
    sendPetShortcut(action)
  }

  togglePetWindow(): void {
    togglePetWindow()
  }

  beginPetWindowDrag(input: PetWindowDragPoint): void {
    beginPetWindowDrag(input)
  }

  movePetWindow(input: PetWindowMoveInput): void {
    movePetWindow(input)
  }

  endPetWindowDrag(pointerId?: number): void {
    endPetWindowDrag(pointerId)
  }

  setPetMouseInteractive(interactive: boolean): void {
    setPetMouseInteractive(interactive)
  }

  allowPetWindowClose(): void {
    allowPetWindowClose()
  }
}

export const windowService = new WindowService()
