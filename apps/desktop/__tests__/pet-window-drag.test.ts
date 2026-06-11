import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
  setPosition: vi.fn(),
  setBounds: vi.fn(),
  setIgnoreMouseEvents: vi.fn(),
  cursorPoint: { x: 150, y: 150 },
  screenToDipPoint: vi.fn(({ x, y }: { x: number; y: number }) => ({ x: x / 1.5, y: y / 1.5 })),
  browserWindowOptions: [] as Array<Record<string, unknown>>,
}))

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = {
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      getURL: vi.fn(() => 'https://shadowob.com/app/discover'),
    }

    constructor(options: Record<string, unknown>) {
      electronState.browserWindowOptions.push(options)
    }

    setVisibleOnAllWorkspaces = vi.fn()
    setAlwaysOnTop = vi.fn()
    loadURL = vi.fn()
    once = vi.fn()
    on = vi.fn()
    isDestroyed = vi.fn(() => false)
    getBounds = vi.fn(() => ({ x: 120, y: 80, width: 240, height: 240 }))
    getPosition = vi.fn(() => [120, 80])
    setPosition = electronState.setPosition
    setBounds = electronState.setBounds
    setIgnoreMouseEvents = electronState.setIgnoreMouseEvents
    show = vi.fn()
    showInactive = vi.fn()
    focus = vi.fn()
  }

  return {
    BrowserWindow,
    screen: {
      screenToDipPoint: electronState.screenToDipPoint,
      getCursorScreenPoint: vi.fn(() => electronState.cursorPoint),
      getPrimaryDisplay: vi.fn(() => ({ workAreaSize: { width: 1440, height: 900 } })),
      getAllDisplays: vi.fn(() => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }]),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
    },
    shell: {
      openExternal: vi.fn(),
    },
  }
})

vi.mock('../src/main/services/app-icon.service', () => ({
  appIconService: {
    ensureDesktopDockIcon: vi.fn(),
    resolveDesktopIconPathSync: vi.fn(() => null),
  },
}))

vi.mock('../src/main/services/desktop-settings.service', () => ({
  desktopSettingsService: {
    readSettingsSync: vi.fn(() => ({ serverBaseUrl: '', desktopPetVisible: true })),
    resolveDesktopAppBaseUrl: vi.fn(() => 'https://shadowob.com/app'),
  },
}))

vi.mock('../src/main/services/i18n.service', () => ({
  i18nService: {
    appName: vi.fn(() => 'Shadow'),
    text: vi.fn((key: string) => key),
  },
}))

vi.mock('../src/main/services/logger.service', () => ({
  loggerService: {
    write: vi.fn(),
  },
}))

vi.mock('../src/main/services/pet-window-state.service', () => ({
  petWindowStateService: {
    readPetWindowState: vi.fn(() => ({ x: 120, y: 80, width: 240, height: 240 })),
    savePetWindowState: vi.fn(),
  },
}))

vi.mock('../src/main/services/pet-visibility.service', () => ({
  petVisibilityService: {
    isDesktopPetVisible: vi.fn(() => true),
    setDesktopPetVisible: vi.fn(),
  },
}))

vi.mock('../src/main/services/window-state.service', () => ({
  windowStateService: {
    getWindowState: vi.fn(() => null),
    saveWindowState: vi.fn(),
  },
}))

describe('desktop pet window drag', () => {
  beforeEach(() => {
    vi.resetModules()
    electronState.setPosition.mockReset()
    electronState.setBounds.mockReset()
    electronState.setIgnoreMouseEvents.mockReset()
    electronState.cursorPoint = { x: 150, y: 150 }
    electronState.screenToDipPoint.mockClear()
    electronState.browserWindowOptions = []
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32',
    })
  })

  it('keeps the native Windows frame on the community window', async () => {
    const windowModule = await import('../src/main/services/window.service')

    windowModule.windowService.createWindow()

    expect(electronState.browserWindowOptions[0]?.titleBarStyle).toBe('default')
    expect(electronState.browserWindowOptions[0]?.autoHideMenuBar).toBe(true)
  })

  it('moves the pet window from the main-process cursor position', async () => {
    const windowModule = await import('../src/main/services/window.service')

    windowModule.windowService.createPetWindow()
    windowModule.windowService.beginPetWindowDrag({ pointerId: 7, screenX: 150, screenY: 150 })
    electronState.cursorPoint = { x: 180, y: 210 }
    windowModule.windowService.movePetWindow({
      pointerId: 7,
    })

    expect(electronState.setPosition).toHaveBeenCalledWith(150, 140, false)
  })

  it('starts compact pet windows large enough for the wheel while mouse passthrough is enabled', async () => {
    const windowModule = await import('../src/main/services/window.service')

    windowModule.windowService.createPetWindow()

    expect(electronState.browserWindowOptions[0]).toMatchObject({
      width: 336,
      height: 336,
      minWidth: 336,
      minHeight: 336,
    })
    expect(electronState.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
  })

  it('toggles compact pet mouse pass-through from renderer hit testing', async () => {
    const windowModule = await import('../src/main/services/window.service')

    windowModule.windowService.createPetWindow()
    windowModule.windowService.setPetMouseInteractive(true)
    windowModule.windowService.setPetMouseInteractive(false)

    expect(electronState.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
    expect(electronState.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true })
  })

  it('ignores invalid pet drag movement payloads before calling Electron', async () => {
    const windowModule = await import('../src/main/services/window.service')

    windowModule.windowService.createPetWindow()
    windowModule.windowService.movePetWindow({
      pointerId: 7,
      x: Number.NaN,
      y: Number.NaN,
    })

    expect(electronState.setPosition).not.toHaveBeenCalled()
  })
})
