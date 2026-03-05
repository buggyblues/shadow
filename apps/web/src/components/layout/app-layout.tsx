import { useQuery } from '@tanstack/react-query'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { fetchApi } from '../../lib/api'
import { connectSocket, disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { NotificationBell } from '../notification/notification-bell'
import { ServerSidebar } from '../server/server-sidebar'

export function AppLayout() {
  const navigate = useNavigate()
  const { setUser, logout } = useAuthStore()

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
      <ServerSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar with notification bell */}
        <div className="h-0 relative z-30">
          <div className="absolute top-2 right-4">
            <NotificationBell />
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
