import { afterEach, describe, expect, it, vi } from 'vitest'

const originalPlatform = process.platform

describe('connector toolchain', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: originalPlatform,
    })
    vi.resetModules()
  })

  it('includes Windows npm and user-local shim directories in connector PATH', async () => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32',
    })
    vi.resetModules()
    const { connectorPath } = await import('../src/toolchain')

    const pathValue = connectorPath({
      APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
      USERPROFILE: 'C:\\Users\\alice',
      PATH: 'C:\\Windows\\System32',
    })

    expect(pathValue).toContain('AppData\\Roaming/npm')
    expect(pathValue).toContain('AppData\\Local/agy/bin')
    expect(pathValue).toContain('AppData\\Local/Microsoft/WinGet/Links')
    expect(pathValue).toContain('AppData\\Local/Microsoft/WindowsApps')
    expect(pathValue).toContain('C:\\Users\\alice/.local/bin')
    expect(pathValue).toContain('C:\\Windows\\System32')
  })
})
