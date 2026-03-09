import { useQuery } from '@tanstack/react-query'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { fetchApi } from '../../lib/api'
import { connectSocket, disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { useUIStore } from '../../stores/ui.store'
import { ConfirmDialog } from '../common/confirm-dialog'
import { ServerSidebar } from '../server/server-sidebar'

export function AppLayout() {
  const navigate = useNavigate()
  const { setUser, logout } = useAuthStore()
  const { mobileServerSidebarOpen, closeMobileServerSidebar } = useUIStore()

  // Fetch current user on mount
  const { data: me, error: meError } = useQuery({
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
    <div className="flex h-screen w-screen overflow-hidden bg-bg-tertiary">
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
        <Outlet />
      </div>

      <ConfirmDialog />
    </div>
  )
}
