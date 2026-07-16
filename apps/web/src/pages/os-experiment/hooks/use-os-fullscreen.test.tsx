import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type DesktopWindowChromeBridge,
  type DesktopWindowChromeState,
  useOsFullscreen,
} from './use-os-fullscreen'

function setDesktopWindowChromeBridge(bridge?: DesktopWindowChromeBridge): void {
  Object.defineProperty(window, 'desktopAPI', {
    configurable: true,
    value: bridge,
  })
}

describe('useOsFullscreen', () => {
  afterEach(() => {
    setDesktopWindowChromeBridge(undefined)
    vi.restoreAllMocks()
  })

  it('uses native desktop fullscreen and follows main-process state changes', async () => {
    let publishState: ((state: DesktopWindowChromeState) => void) | undefined
    const unsubscribe = vi.fn()
    const getWindowChromeState = vi.fn(async () => ({ fullscreen: false, maximized: false }))
    const setWindowFullScreen = vi.fn(async (fullscreen: boolean) => ({
      fullscreen,
      maximized: false,
    }))
    setDesktopWindowChromeBridge({
      getWindowChromeState,
      setWindowFullScreen,
      onWindowChromeStateChanged: (callback) => {
        publishState = callback
        return unsubscribe
      },
    })

    const { result, unmount } = renderHook(() => useOsFullscreen())
    await waitFor(() => expect(getWindowChromeState).toHaveBeenCalledOnce())

    await act(async () => result.current.toggleFullscreen())
    expect(setWindowFullScreen).toHaveBeenCalledWith(true)
    expect(result.current.fullscreen).toBe(true)

    act(() => publishState?.({ fullscreen: false, maximized: false }))
    expect(result.current.fullscreen).toBe(false)

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('keeps the browser fullscreen fallback outside the desktop app', async () => {
    const requestFullscreen = vi.fn(async () => undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    })

    const { result } = renderHook(() => useOsFullscreen())
    await act(async () => result.current.toggleFullscreen())

    expect(requestFullscreen).toHaveBeenCalledOnce()
  })
})
