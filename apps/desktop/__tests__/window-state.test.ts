import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data'),
  },
}))

// Mock fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

describe('window-state', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getWindowState', () => {
    it('should return parsed state when file exists', async () => {
      const { readFileSync } = await import('node:fs')
      const state = { x: 100, y: 200, width: 1280, height: 800, isMaximized: false }
      ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(state))

      const { getWindowState } = await import('../src/main/window-state')
      const result = getWindowState()

      expect(result).toEqual(state)
    })

    it('should return null when file does not exist', async () => {
      const { readFileSync } = await import('node:fs')
      ;(readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT')
      })

      const { getWindowState } = await import('../src/main/window-state')
      const result = getWindowState()

      expect(result).toBeNull()
    })

    it('should return null when file contains invalid JSON', async () => {
      const { readFileSync } = await import('node:fs')
      ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('not json')

      const { getWindowState } = await import('../src/main/window-state')
      const result = getWindowState()

      expect(result).toBeNull()
    })
  })

  describe('saveWindowState', () => {
    it('should write state to file', async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { saveWindowState } = await import('../src/main/window-state')

      const state = { x: 100, y: 200, width: 1280, height: 800, isMaximized: false }
      saveWindowState(state)

      expect(mkdirSync).toHaveBeenCalledWith('/tmp/test-user-data', { recursive: true })
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('window-state.json'),
        JSON.stringify(state),
      )
    })

    it('should log error when write fails', async () => {
      const { writeFileSync } = await import('node:fs')
      ;(writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('EACCES')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { saveWindowState } = await import('../src/main/window-state')

      saveWindowState({ x: 0, y: 0, width: 1280, height: 800, isMaximized: false })

      expect(consoleSpy).toHaveBeenCalledWith('Failed to save window state:', expect.any(Error))
    })
  })
})
