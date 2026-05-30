import './styles/globals.css'
import '@web/lib/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@web/lib/query-client'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { DesktopReaderPage } from './pages/desktop-reader'
import { DesktopSettingsPage } from './pages/desktop-settings'
import { PetApp } from './pet-app'

if ('desktopAPI' in window) {
  const api = (window as Record<string, unknown>).desktopAPI as { platform?: string }
  const platform = api.platform ?? 'desktop'
  document.documentElement.classList.add('desktop-app', `desktop-${platform}`)
}

function DesktopLocalApp() {
  const view = new URLSearchParams(window.location.search).get('view')
  if (view === 'settings') return <DesktopSettingsPage />
  if (view === 'reader') return <DesktopReaderPage />
  return <PetApp />
}

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <DesktopLocalApp />
      </QueryClientProvider>
    </React.StrictMode>,
  )
}
