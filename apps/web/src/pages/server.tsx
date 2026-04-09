import { useQuery } from '@tanstack/react-query'
import { Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChannelSidebar } from '../components/channel/channel-sidebar'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

interface ServerMeta {
  id: string
  name: string
  slug: string | null
}

interface ChannelMeta {
  id: string
  name: string
}

/**
 * Server layout route — wraps all server child routes with the channel sidebar.
 *
 * URL: /app/servers/$serverSlug
 * Children: ServerHomeView, ChannelView, ShopView, WorkspaceView, etc.
 */
export function ServerLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { serverSlug } = useParams({ strict: false }) as { serverSlug: string }
  const { activeServerId, activeChannelId, setActiveServer } = useChatStore()
  const { mobileView } = useUIStore()

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerMeta>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  // Redirect UUID URL → slug URL
  useEffect(() => {
    if (server?.slug && serverSlug !== server.slug) {
      navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: server.slug },
        replace: true,
      })
    }
  }, [server?.slug, serverSlug, navigate])

  // Sync server to store
  useEffect(() => {
    if (server?.id && server.id !== activeServerId) {
      setActiveServer(server.id)
    }
  }, [server?.id, activeServerId, setActiveServer])

  // Channel name for title bar
  const { data: channel } = useQuery({
    queryKey: ['channel', activeChannelId],
    queryFn: () => fetchApi<ChannelMeta>(`/api/channels/${activeChannelId}`),
    enabled: !!activeChannelId,
  })

  const unreadCount = useUnreadCount()
  const title = channel?.name
    ? `#${channel.name} · ${server?.name ?? t('server.home')}`
    : (server?.name ?? t('common.selectServerToChat'))

  useAppStatus({
    title,
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  if (!serverSlug) return null

  if (isServerLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary">
        <Loader2 size={20} className="animate-spin opacity-60" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full gap-3 bg-transparent">
      {/* Channel sidebar */}
      <div
        className={`${
          mobileView === 'channels' ? 'flex absolute inset-0 z-20 md:relative' : 'hidden'
        } md:flex flex-col w-full md:w-[240px] flex-shrink-0 transition-transform duration-300 ease-in-out`}
      >
        <ChannelSidebar serverSlug={serverSlug} />
      </div>

      {/* Content: child routes render here via Outlet */}
      <div
        className={`${
          mobileView === 'chat' ? 'flex absolute inset-0 z-10 md:relative md:z-auto' : 'hidden'
        } md:flex flex-1 min-w-0 overflow-hidden transition-all duration-300 ease-in-out gap-3`}
      >
        <Outlet />
      </div>
    </div>
  )
}
