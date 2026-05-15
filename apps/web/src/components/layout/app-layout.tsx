import { Button, cn, GlassPanel } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Outlet, useLocation } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { clearAuthenticatedSession } from '../../lib/auth-session'
import { connectSocket, disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { useUIStore } from '../../stores/ui.store'
import { ConfirmDialog } from '../common/confirm-dialog'
import { RechargeModal } from '../recharge/recharge-modal'
import { ServerSidebar } from '../server/server-sidebar'
import { DynamicBackground } from './dynamic-background'

export function AppLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const pathname = location?.pathname ?? ''
  const { setUser } = useAuthStore()
  const { backgroundImage } = useUIStore()
  const { mobileServerSidebarOpen, closeMobileServerSidebar, openMobileServerSidebar } =
    useUIStore()
  const isCloudRoute = /^\/app\/cloud(?:\/|$)/.test(pathname)
  const showAtmosphereOrbs = !backgroundImage

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

  // Redirect to login on auth failure
  useEffect(() => {
    if (meError && (meError as Error & { status?: number }).status === 401) {
      clearAuthenticatedSession({ redirectToLogin: true })
    }
  }, [meError])

  // WebSocket connection
  useEffect(() => {
    connectSocket()
    return () => disconnectSocket()
  }, [])

  return (
    <div className="relative flex h-dvh w-screen overflow-hidden bg-transparent p-3 gap-3">
      {!isCloudRoute && (
        <>
          <DynamicBackground />
          {/* ── Neon Frost atmosphere orbs ── */}
          {showAtmosphereOrbs && (
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
              <div
                className="absolute top-[-180px] left-[8%] w-[520px] h-[520px] rounded-full blur-[130px] animate-float opacity-[0.13]"
                style={{ background: 'radial-gradient(circle, #00F3FF 0%, transparent 70%)' }}
              />
              <div
                className="absolute top-[25%] right-[-150px] w-[640px] h-[640px] rounded-full blur-[120px] animate-float opacity-16"
                style={{
                  background: 'radial-gradient(circle, #FF2A55 0%, transparent 70%)',
                  animationDelay: '-7s',
                }}
              />
            </div>
          )}
        </>
      )}

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
          <GlassPanel className="flex-1 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 text-sm text-white/50 animate-pulse">
              {t('common.loading')}
            </div>
          </GlassPanel>
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
    </div>
  )
}
