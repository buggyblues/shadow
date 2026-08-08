import { beforeEach, describe, expect, it, vi } from 'vitest'

const trayState = vi.hoisted(() => ({
  instances: [] as Array<{
    destroyed: boolean
    destroy: ReturnType<typeof vi.fn>
    isDestroyed: () => boolean
    on: ReturnType<typeof vi.fn>
    setContextMenu: ReturnType<typeof vi.fn>
    setImage: ReturnType<typeof vi.fn>
    setToolTip: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock('electron', () => ({
  app: { quit: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      resize: () => ({ isEmpty: () => false, setTemplateImage: vi.fn() }),
      setTemplateImage: vi.fn(),
    })),
  },
  Tray: class {
    destroyed = false
    destroy = vi.fn(() => {
      this.destroyed = true
    })
    isDestroyed = () => this.destroyed
    on = vi.fn()
    setContextMenu = vi.fn()
    setImage = vi.fn()
    setToolTip = vi.fn()

    constructor() {
      trayState.instances.push(this)
    }
  },
}))

vi.mock('../src/main/services/connector-daemon.service', () => ({
  connectorDaemonService: {
    getState: vi.fn(() => ({ connections: [], running: false })),
    refreshConnections: vi.fn(async () => []),
    setConnectionEnabled: vi.fn(async () => []),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  },
}))

vi.mock('../src/main/services/i18n.service', () => ({
  i18nService: { text: (key: string) => key },
}))

vi.mock('../src/main/services/pet-visibility.service', () => ({
  petVisibilityService: {
    isDesktopPetVisible: vi.fn(() => false),
    onDesktopPetVisibilityChanged: vi.fn(),
    setDesktopPetVisible: vi.fn(),
  },
}))

vi.mock('../src/main/services/window.service', () => ({
  windowService: {
    getMainWindow: vi.fn(() => null),
    getPetWindow: vi.fn(() => null),
    hidePetWindow: vi.fn(),
    showCommunityWindow: vi.fn(),
    showCreateBuddyWindow: vi.fn(),
    showDesktopSettingsWindow: vi.fn(),
    showPetWindow: vi.fn(),
  },
}))

describe('tray visibility', () => {
  beforeEach(() => {
    trayState.instances = []
    vi.resetModules()
  })

  it('does not duplicate the tray and can restore it after hiding', async () => {
    const { trayService } = await import('../src/main/services/tray.service')

    trayService.createTray()
    trayService.createTray()
    expect(trayState.instances).toHaveLength(1)
    expect(trayService.getTray()).toBe(trayState.instances[0])

    trayService.setVisible(false)
    expect(trayState.instances[0]?.destroy).toHaveBeenCalledOnce()
    expect(trayService.getTray()).toBeNull()

    trayService.setVisible(true)
    expect(trayState.instances).toHaveLength(2)
    expect(trayService.getTray()).toBe(trayState.instances[1])
  })
})
