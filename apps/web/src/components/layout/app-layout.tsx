import { useQuery } from '@tanstack/react-query'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { connectSocket, disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { useUIStore } from '../../stores/ui.store'
import { ConfirmDialog } from '../common/confirm-dialog'
import { OnboardingModal } from '../onboarding/onboarding-modal'
import { ServerSidebar } from '../server/server-sidebar'

export function AppLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setUser, logout } = useAuthStore()
  const { mobileServerSidebarOpen, closeMobileServerSidebar, openMobileServerSidebar } =
    useUIStore()
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Fetch current user on mount
  const {
    data: me,
    error: meError,
    isLoading: isLoadingMe,
  } = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      fetchApi<{
        id: string
        email: string
        username: string
        displayName: string | null
        avatarUrl: string | null
        status: string
      }>('/api/auth/me'),
    retry: false,
  })

  useEffect(() => {
    if (me) setUser(me)
  }, [me, setUser])

  // Show onboarding for new users (check if user has any servers)
  useEffect(() => {
    if (me) {
      // Check if user has any servers - this is per-user, not global
      fetchApi<Array<{ id: string }>>('/api/servers')
        .then((servers) => {
          // Show onboarding only if user has no servers
          setShowOnboarding(servers.length === 0)
        })
        .catch(() => {
          // On error, don't show onboarding
          setShowOnboarding(false)
        })
    }
  }, [me])

  // Redirect to login on auth failure
  useEffect(() => {
    if (meError && (meError as Error & { status?: number }).status === 401) {
      logout()
      navigate({ to: '/login' })
    }
  }, [meError, logout, navigate])

  // WebSocket connection
  useEffect(() => {
    connectSocket()
    return () => disconnectSocket()
  }, [])

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-bg-tertiary">
      {/* Server sidebar — always visible on md+, overlay on mobile */}
      <div className="hidden md:flex">
        <ServerSidebar />
      </div>

      {/* Mobile server sidebar overlay */}
      {mobileServerSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobileServerSidebar} />
          <div className="relative z-10 animate-slide-in-left">
            <ServerSidebar onNavigate={closeMobileServerSidebar} />
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {isLoadingMe && !me ? (
          <div className="desktop-loading-state flex-1 bg-bg-primary">
            <div className="inline-flex items-center gap-2 text-sm animate-pulse">
              {t('common.loading')}
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </div>

      {/* Mobile hamburger button to open server sidebar */}
      {!mobileServerSidebarOpen && (
        <button
          type="button"
          onClick={openMobileServerSidebar}
          className="fixed bottom-20 left-4 z-40 md:hidden flex items-center justify-center w-10 h-10 bg-primary/80 backdrop-blur rounded-full shadow-lg text-white"
        >
          <Menu size={18} />
        </button>
      )}

      <ConfirmDialog />

      {/* Onboarding for new users */}
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  )
}
