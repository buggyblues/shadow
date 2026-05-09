import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { Clock, Loader2, Lock, Send } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChannelSidebar } from '../components/channel/channel-sidebar'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { clearLastChannelId } from '../lib/last-channel'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

interface ServerMeta {
  id: string
  name: string
  slug: string | null
  iconUrl?: string | null
  bannerUrl?: string | null
  description?: string | null
  isPublic?: boolean
  ownerId?: string
}

interface ChannelMeta {
  id: string
  name: string
  serverId: string
}

interface ChannelAccessMeta {
  canAccess: boolean
  channel: ChannelMeta
}

interface ServerAccessMeta {
  server: ServerMeta
  isMember: boolean
  canManage: boolean
  canAccess: boolean
  requiresApproval: boolean
  joinRequestStatus: 'pending' | 'approved' | 'rejected' | null
  joinRequestId: string | null
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
  const queryClient = useQueryClient()
  const { serverSlug, channelId } = useParams({ strict: false }) as {
    serverSlug: string
    channelId?: string
  }
  const { activeServerId, activeChannelId, setActiveServer } = useChatStore()
  const { mobileView } = useUIStore()

  const {
    data: serverAccess,
    isLoading: isServerAccessLoading,
    isError: isServerAccessError,
  } = useQuery({
    queryKey: ['server-access', serverSlug],
    queryFn: () => fetchApi<ServerAccessMeta>(`/api/servers/${serverSlug}/access`),
    enabled: !!serverSlug,
    retry: false,
  })
  const canAccessServer = serverAccess?.canAccess === true

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerMeta>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug && canAccessServer,
  })
  const serverMeta = server ?? serverAccess?.server

  const requestServerAccess = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${serverSlug}/join-requests`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-access', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const {
    data: routeChannelAccess,
    isLoading: isRouteChannelLoading,
    isError: isRouteChannelError,
  } = useQuery({
    queryKey: ['channel-access', channelId],
    queryFn: () => fetchApi<ChannelAccessMeta>(`/api/channels/${channelId}/access`),
    enabled: !!channelId && canAccessServer,
    retry: false,
  })
  const routeChannel = routeChannelAccess?.channel

  // Redirect UUID URL → slug URL
  useEffect(() => {
    if (serverMeta?.slug && serverSlug !== serverMeta.slug) {
      navigate({
        to: channelId ? '/servers/$serverSlug/channels/$channelId' : '/servers/$serverSlug',
        params: channelId
          ? { serverSlug: serverMeta.slug, channelId }
          : { serverSlug: serverMeta.slug },
        replace: true,
      })
    }
  }, [serverMeta?.slug, serverSlug, channelId, navigate])

  // Sync server to store
  useEffect(() => {
    if (server?.id && server.id !== activeServerId) {
      setActiveServer(server.id)
    }
  }, [server?.id, activeServerId, setActiveServer])

  useEffect(() => {
    if (!channelId || !server?.id) return

    if (isRouteChannelError || (routeChannel && routeChannel.serverId !== server.id)) {
      clearLastChannelId(server.id)
      const prev = useChatStore.getState().activeChannelId
      if (prev === channelId) {
        useChatStore.getState().setActiveChannel(null)
      }
      navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: server.slug ?? serverSlug },
        replace: true,
      })
    }
  }, [channelId, isRouteChannelError, navigate, routeChannel, server?.id, server?.slug, serverSlug])

  // Channel name for title bar
  const { data: channel } = useQuery({
    queryKey: ['channel', activeChannelId],
    queryFn: () => fetchApi<ChannelMeta>(`/api/channels/${activeChannelId}`),
    enabled: !!activeChannelId && (!channelId || routeChannelAccess?.canAccess === true),
  })

  const unreadCount = useUnreadCount()
  const title =
    (channel?.name ?? routeChannel?.name)
      ? `#${channel?.name ?? routeChannel?.name} · ${serverMeta?.name ?? t('server.home')}`
      : (serverMeta?.name ?? t('common.selectServerToChat'))

  useAppStatus({
    title,
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  if (!serverSlug) return null

  if (isServerAccessLoading || (canAccessServer && isServerLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary">
        <Loader2 size={20} className="animate-spin opacity-60" />
      </div>
    )
  }

  if (serverAccess && !serverAccess.canAccess) {
    const isPending = serverAccess.joinRequestStatus === 'pending' || requestServerAccess.isSuccess
    return (
      <div className="flex flex-1 items-center justify-center bg-bg-primary/70 px-6 backdrop-blur-xl">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-bg-primary/80 p-6 text-center shadow-[0_18px_64px_rgba(0,0,0,0.32)]">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            {isPending ? <Clock size={28} /> : <Lock size={28} />}
          </div>
          <h2 className="text-xl font-black text-text-primary">{serverAccess.server.name}</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            {t('server.privateServerGateDesc')}
          </p>
          <button
            type="button"
            className="mt-5 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-black shadow-[0_0_24px_rgba(0,243,255,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || requestServerAccess.isPending}
            onClick={() => requestServerAccess.mutate()}
          >
            {requestServerAccess.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isPending ? (
              <Clock size={16} />
            ) : (
              <Send size={16} />
            )}
            <span>{isPending ? t('server.requestPending') : t('server.requestAccess')}</span>
          </button>
        </div>
      </div>
    )
  }

  if (isServerAccessError || !serverMeta) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary">
        {t('server.accessUnavailable')}
      </div>
    )
  }

  const routeChannelBlocked =
    !!channelId &&
    (isRouteChannelLoading ||
      isRouteChannelError ||
      (!!server?.id && !!routeChannel && routeChannel.serverId !== server.id))

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
        {routeChannelBlocked ? (
          <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary/70 backdrop-blur-xl">
            <Loader2 size={18} className="animate-spin opacity-60" />
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  )
}
