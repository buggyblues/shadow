import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
  userDataDir: '',
  setProxy: vi.fn(),
  windows: [] as Array<{
    isDestroyed: () => boolean
    webContents: { send: ReturnType<typeof vi.fn> }
  }>,
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => (name === 'userData' ? electronState.userDataDir : tmpdir())),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => electronState.windows),
  },
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
  },
  session: {
    defaultSession: {
      setProxy: electronState.setProxy,
    },
  },
}))

async function loadDesktopSettings() {
  return import('../src/main/services/desktop-settings.service')
}

describe('desktop settings', () => {
  beforeEach(() => {
    electronState.userDataDir = mkdtempSync(join(tmpdir(), 'shadow-desktop-settings-'))
    electronState.setProxy.mockReset()
    electronState.windows = []
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(electronState.userDataDir, { recursive: true, force: true })
  })

  it('persists blank server url while resolving it to the hosted community', async () => {
    const settings = await loadDesktopSettings()

    settings.desktopSettingsService.saveSettingsSync({ serverBaseUrl: '' })

    expect(settings.desktopSettingsService.readSettingsSync().serverBaseUrl).toBe('')
    expect(settings.desktopSettingsService.resolveDesktopServerBaseUrl()).toBe(
      'https://shadowob.com',
    )
    expect(settings.desktopSettingsService.resolveDesktopAppBaseUrl()).toBe(
      'https://shadowob.com/app',
    )
  })

  it('preserves configured app base path while resolving api origin separately', async () => {
    const settings = await loadDesktopSettings()

    settings.desktopSettingsService.saveSettingsSync({ serverBaseUrl: 'https://shadowob.com/app' })

    expect(settings.desktopSettingsService.readSettingsSync().serverBaseUrl).toBe(
      'https://shadowob.com/app',
    )
    expect(settings.desktopSettingsService.resolveDesktopServerBaseUrl()).toBe(
      'https://shadowob.com',
    )
    expect(settings.desktopSettingsService.resolveDesktopAppBaseUrl()).toBe(
      'https://shadowob.com/app',
    )
  })

  it('allows global shortcuts to be cleared', async () => {
    const settings = await loadDesktopSettings()

    settings.desktopSettingsService.saveSettingsSync({
      shortcuts: {
        ...settings.defaultDesktopShortcuts,
        petChat: '',
      },
    })

    expect(settings.desktopSettingsService.readSettingsSync().shortcuts.petChat).toBe('')
  })

  it('persists the local connector computer id', async () => {
    const settings = await loadDesktopSettings()

    settings.desktopSettingsService.saveSettingsSync({ connectorComputerId: ' computer-1 ' })

    expect(settings.desktopSettingsService.readSettingsSync().connectorComputerId).toBe(
      'computer-1',
    )
  })

  it('migrates legacy conflicting shortcut defaults', async () => {
    const settings = await loadDesktopSettings()

    settings.desktopSettingsService.saveSettingsSync({
      shortcuts: {
        openCommunity: 'CommandOrControl+Shift+S',
        togglePet: 'CommandOrControl+Shift+P',
        petVoice: 'CommandOrControl+Shift+V',
        petChat: 'CommandOrControl+Shift+C',
        showNotifications: 'CommandOrControl+Shift+N',
      },
    })

    expect(settings.desktopSettingsService.readSettingsSync().shortcuts).toEqual(
      settings.defaultDesktopShortcuts,
    )
  })

  it('applies saved network settings through the same runtime path', async () => {
    const win = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }
    electronState.windows = [win]
    const settings = await loadDesktopSettings()
    const applied: string[] = []
    settings.desktopSettingsService.onApplied((next) => applied.push(next.serverBaseUrl))
    const saved = settings.desktopSettingsService.saveSettingsSync({
      serverBaseUrl: 'https://self-hosted.example',
      httpProxy: '',
      httpsProxy: '',
    })

    await settings.desktopSettingsService.applyNetworkSettings(saved)

    expect(electronState.setProxy).toHaveBeenCalledWith({ mode: 'system' })
    expect(win.webContents.send).toHaveBeenCalledWith('desktop:settingsChanged', saved)
    expect(applied).toEqual(['https://self-hosted.example'])
  })

  it('keeps desktop pet visibility in one persisted service state', async () => {
    const win = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }
    electronState.windows = [win]
    const settings = await loadDesktopSettings()
    const visibility = await import('../src/main/services/pet-visibility.service')
    const events: boolean[] = []
    visibility.petVisibilityService.onDesktopPetVisibilityChanged((state) =>
      events.push(state.visible),
    )

    visibility.petVisibilityService.setDesktopPetVisible(true, 'tray')

    expect(settings.desktopSettingsService.readSettingsSync().desktopPetVisible).toBe(true)
    expect(visibility.petVisibilityService.isDesktopPetVisible()).toBe(true)
    expect(win.webContents.send).toHaveBeenLastCalledWith(
      'desktop:settingsChanged',
      expect.objectContaining({ desktopPetVisible: true }),
    )

    visibility.petVisibilityService.setDesktopPetVisible(false, 'window')

    expect(settings.desktopSettingsService.readSettingsSync().desktopPetVisible).toBe(false)
    expect(events).toEqual([true, false])
  })
})
