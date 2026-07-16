import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { VoiceSessionProvider } from '../voice/voice-session-context'

export function RootLayout() {
  useEffect(() => {
    const root = document.documentElement
    const syncVisibility = () => {
      root.toggleAttribute('data-shadow-page-hidden', document.hidden)
    }

    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      root.removeAttribute('data-shadow-page-hidden')
    }
  }, [])

  return (
    <VoiceSessionProvider>
      <Outlet />
    </VoiceSessionProvider>
  )
}
