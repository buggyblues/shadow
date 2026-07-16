import { useCallback, useEffect, useState } from 'react'

export type DesktopWindowChromeState = {
  fullscreen: boolean
  maximized: boolean
}

export type DesktopWindowChromeBridge = {
  getWindowChromeState?: () => Promise<DesktopWindowChromeState>
  setWindowFullScreen?: (fullscreen: boolean) => Promise<DesktopWindowChromeState>
  onWindowChromeStateChanged?: (callback: (state: DesktopWindowChromeState) => void) => () => void
}

function desktopWindowChromeBridge(): DesktopWindowChromeBridge | null {
  if (typeof window === 'undefined') return null
  const api = (window as Window & { desktopAPI?: DesktopWindowChromeBridge }).desktopAPI
  return api?.getWindowChromeState && api.setWindowFullScreen ? api : null
}

export function useOsFullscreen(): {
  fullscreen: boolean
  toggleFullscreen: () => Promise<void>
} {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const desktopChrome = desktopWindowChromeBridge()
    if (desktopChrome) {
      let active = true
      void desktopChrome
        .getWindowChromeState?.()
        .then((state) => {
          if (active) setFullscreen(state.fullscreen)
        })
        .catch(() => undefined)
      const unsubscribe = desktopChrome.onWindowChromeStateChanged?.((state) => {
        setFullscreen(state.fullscreen)
      })
      return () => {
        active = false
        unsubscribe?.()
      }
    }

    const handleFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement))
    handleFullscreenChange()
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return
    const desktopChrome = desktopWindowChromeBridge()
    if (desktopChrome?.setWindowFullScreen) {
      const state = await desktopChrome.setWindowFullScreen(!fullscreen)
      setFullscreen(state.fullscreen)
      return
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await document.documentElement.requestFullscreen()
  }, [fullscreen])

  return { fullscreen, toggleFullscreen }
}
