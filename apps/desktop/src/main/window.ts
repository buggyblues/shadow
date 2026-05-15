import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { readWindowState, saveWindowState } from './window-state'

let petWindow: BrowserWindow | null = null
let allowClose = false

const isDev = Boolean(process.env.DESKTOP_DEV_URL)

function preloadPath() {
  return join(__dirname, '../preload/index.js')
}

function rendererUrl() {
  return process.env.DESKTOP_DEV_URL || 'app://shadow/index.html'
}

export function createPetWindow() {
  const bounds = readWindowState()

  petWindow = new BrowserWindow({
    ...bounds,
    minWidth: 320,
    minHeight: 380,
    width: bounds.width,
    height: bounds.height,
    title: 'XiaDou Desktop Pet',
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
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  })

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.setAlwaysOnTop(true, 'screen-saver')
  petWindow.loadURL(rendererUrl())

  petWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (isDev) {
    petWindow.webContents.openDevTools({ mode: 'detach' })
  }

  petWindow.once('ready-to-show', () => {
    petWindow?.showInactive()
  })

  const persist = () => {
    if (!petWindow || petWindow.isDestroyed()) return
    saveWindowState(petWindow.getBounds())
  }
  petWindow.on('resize', persist)
  petWindow.on('move', persist)
  petWindow.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    petWindow?.hide()
  })
  petWindow.on('closed', () => {
    petWindow = null
  })

  return petWindow
}

export function getPetWindow() {
  return petWindow
}

export function showPetWindow() {
  if (!petWindow || petWindow.isDestroyed()) {
    createPetWindow()
    return
  }
  petWindow.show()
  petWindow.focus()
}

export function setPetPanelMode(mode: 'compact' | 'expanded') {
  const win = getPetWindow()
  if (!win || win.isDestroyed()) return
  const [width, height] = mode === 'compact' ? [300, 380] : [460, 700]
  win.setSize(width, height, true)
}

export function allowPetWindowClose() {
  allowClose = true
}
