import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useProfile } from '../hooks.js'
import { OAuthPrompt } from './OAuthPrompt.js'
import { TopNav } from './TopNav.js'

export function AppShell({ children }: { children: ReactNode }) {
  const profile = useProfile()
  const location = useLocation()
  const isPreview =
    location.pathname.includes('/preview/') || location.pathname.includes('/artworks/')

  if (isPreview) {
    return (
      <main className="previewRoot">
        {profile.data?.profile.customCss ? <style>{profile.data.profile.customCss}</style> : null}
        {children}
        <OAuthPrompt />
      </main>
    )
  }

  return (
    <main className="spaceShell">
      {profile.data?.profile.customCss ? <style>{profile.data.profile.customCss}</style> : null}
      <TopNav />
      <div className="pinContent">{children}</div>
      <OAuthPrompt />
    </main>
  )
}
