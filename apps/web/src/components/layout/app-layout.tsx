import { Button, cn } from '@shadowob/ui'
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
import { RechargeModal } from '../recharge/recharge-modal'
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
    <div className="relative flex h-dvh w-screen overflow-hidden bg-bg-deep p-3 gap-3">
      {/* ── Neon Frost atmosphere orbs ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-150px] left-[5%] w-[600px] h-[600px] rounded-full blur-[120px] animate-float opacity-50" style={{ background: 'radial-gradient(circle, #00F3FF 0%, transparent 70%)' }} />
        <div
          className="absolute top-[25%] right-[-150px] w-[700px] h-[700px] rounded-full blur-[120px] animate-float opacity-50"
          style={{ background: 'radial-gradient(circle, #FF2A55 0%, transparent 70%)', animationDelay: '-7s' }}
        />
      </div>

      {/* ── Server sidebar — always visible on md+, overlay on mobile ── */}
      <div className="relative z-10 hidden md:flex">
        <ServerSidebar />
      </div>

      {/* ── Mobile server sidebar overlay (glassmorphic) ── */}
      {mobileServerSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-bg-deep/80 backdrop-blur-md"
            onClick={closeMobileServerSidebar}
          />
          <div
            className={cn(
              'relative z-10 animate-slide-in-left',
              'rounded-r-[24px] border-r border-border-subtle',
              'bg-bg-deep/80 backdrop-blur-xl',
              'shadow-[0_0_40px_rgba(0,243,255,0.06)]',
            )}
          >
            <ServerSidebar onNavigate={closeMobileServerSidebar} />
          </div>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="relative z-10 flex flex-1 flex-col min-w-0 overflow-hidden">
        {isLoadingMe && !me ? (
          <div className="desktop-loading-state flex-1 bg-bg-deep/60 backdrop-blur-xl">
            <div className="inline-flex items-center gap-2 text-sm text-white/50 animate-pulse">
              {t('common.loading')}
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </div>

      {/* ── Mobile FAB to open server sidebar ── */}
      {!mobileServerSidebarOpen && (
        <Button
          size="icon"
          onClick={openMobileServerSidebar}
          className={cn(
            'fixed bottom-20 left-4 z-40 md:hidden',
            'h-11 w-11 rounded-full',
            'bg-primary/20 backdrop-blur-xl',
            'border border-primary/20',
            'text-primary shadow-[0_0_20px_rgba(0,243,255,0.25)]',
            'hover:bg-primary/30 hover:shadow-[0_0_28px_rgba(0,243,255,0.35)]',
            'transition-all duration-300',
          )}
        >
          <Menu size={18} />
        </Button>
      )}

      <ConfirmDialog />
      <RechargeModal />

      {/* Onboarding for new users */}
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  )
}
