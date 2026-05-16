import { GlassPanel } from '@shadowob/ui'
import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, useNavigate, useParams } from '@tanstack/react-router'
import { Clock, Loader2, Lock, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  requiresApproval?: boolean
  joinRequestStatus?: 'pending' | 'approved' | 'rejected' | null
  joinRequestId?: string | null
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

interface MessagePage {
  messages: unknown[]
  hasMore: boolean
}

interface ChannelBootstrap {
  access: ChannelAccessMeta
  channel?: ChannelMeta
  server: ServerMeta | null
  channels: unknown[]
  members: unknown[]
  messages: MessagePage
  slashCommands: { commands: unknown[] }
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
  const [bootstrapSeededChannelId, setBootstrapSeededChannelId] = useState<string | null>(null)

  const {
    data: serverAccess,
    isLoading: isServerAccessLoading,
    isError: isServerAccessError,
  } = useQuery({
    queryKey: ['server-access', serverSlug],
    queryFn: () => fetchApi<ServerAccessMeta>(`/api/servers/${serverSlug}/access`),
    enabled: !!serverSlug && !channelId,
    retry: false,
  })

  const {
    data: channelBootstrap,
    isLoading: isChannelBootstrapLoading,
    isError: isChannelBootstrapError,
  } = useQuery({
    queryKey: ['channel-bootstrap', channelId],
    queryFn: () =>
      fetchApi<ChannelBootstrap>(`/api/channels/${channelId}/bootstrap?messagesLimit=50`),
    enabled: !!channelId,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const canAccessServer = channelId
    ? Boolean(channelBootstrap?.server)
    : serverAccess?.canAccess === true

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerMeta>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug && !channelId && canAccessServer,
    staleTime: 30_000,
  })
  const serverMeta = channelBootstrap?.server ?? server ?? serverAccess?.server

  useEffect(() => {
    if (!channelId || !channelBootstrap) return
    queryClient.setQueryData(['channel-access', channelId], channelBootstrap.access)
    queryClient.setQueryData(['channel', channelId], channelBootstrap.channel)
    queryClient.setQueryData(['channel-slash-commands', channelId], channelBootstrap.slashCommands)
    queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(['messages', channelId], {
      pages: [channelBootstrap.messages],
      pageParams: [null],
    })

    if (channelBootstrap.server) {
      const serverKey = channelBootstrap.server.slug ?? serverSlug
      queryClient.setQueryData(['server', channelBootstrap.server.id], channelBootstrap.server)
      queryClient.setQueryData(['server', serverKey], channelBootstrap.server)
      queryClient.setQueryData(['server', serverSlug], channelBootstrap.server)
      queryClient.setQueryData(['channels', serverKey], channelBootstrap.channels)
      queryClient.setQueryData(['channels', serverSlug], channelBootstrap.channels)
      queryClient.setQueryData(
        ['members', channelBootstrap.server.id, channelId],
        channelBootstrap.members,
      )
    }

    setBootstrapSeededChannelId(channelId)
  }, [channelBootstrap, channelId, queryClient, serverSlug])

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

  const routeChannelAccess = channelBootstrap?.access
  const isChannelBootstrapSeedPending =
    !!channelId && Boolean(channelBootstrap) && bootstrapSeededChannelId !== channelId
  const isRouteChannelLoading =
    !!channelId && (isChannelBootstrapLoading || isChannelBootstrapSeedPending)
  const isRouteChannelError = isChannelBootstrapError
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
    if (serverMeta?.id && serverMeta.id !== activeServerId) {
      setActiveServer(serverMeta.id)
    }
  }, [serverMeta?.id, activeServerId, setActiveServer])

  useEffect(() => {
    if (!channelId || !serverMeta?.id) return

    if (isRouteChannelError || (routeChannel && routeChannel.serverId !== serverMeta.id)) {
      clearLastChannelId(serverMeta.id)
      const prev = useChatStore.getState().activeChannelId
      if (prev === channelId) {
        useChatStore.getState().setActiveChannel(null)
      }
      navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: serverMeta.slug ?? serverSlug },
        replace: true,
      })
    }
  }, [
    channelId,
    isRouteChannelError,
    navigate,
    routeChannel,
    serverMeta?.id,
    serverMeta?.slug,
    serverSlug,
  ])

  // Channel name for title bar
  const { data: channel } = useQuery({
    queryKey: ['channel', activeChannelId],
    queryFn: () => fetchApi<ChannelMeta>(`/api/channels/${activeChannelId}`),
    enabled:
      !!activeChannelId &&
      (!channelId || routeChannelAccess?.canAccess === true) &&
      activeChannelId !== channelBootstrap?.channel?.id,
    staleTime: 30_000,
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

  if (channelId && isRouteChannelLoading) {
    return <ServerRouteLoadingShell mobileView={mobileView} />
  }

  if (!channelId && (isServerAccessLoading || (canAccessServer && isServerLoading))) {
    return (
      <GlassPanel className="flex-1 flex items-center justify-center text-text-muted">
        <Loader2 size={20} className="animate-spin opacity-60" />
      </GlassPanel>
    )
  }

  if (!channelId && serverAccess && !serverAccess.canAccess) {
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

  if ((!channelId && isServerAccessError) || isRouteChannelError || !serverMeta) {
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
      (!!serverMeta?.id && !!routeChannel && routeChannel.serverId !== serverMeta.id))

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full gap-3 bg-transparent">
      {/* Channel sidebar */}
      <div
        className={`${
          mobileView === 'channels' ? 'flex absolute inset-0 z-20 md:relative' : 'hidden'
        } md:flex flex-col w-full md:w-[240px] flex-shrink-0 transition-transform duration-300 ease-in-out`}
      >
        <ChannelSidebar
          serverSlug={serverSlug}
          deferInitialQueries={Boolean(channelId && bootstrapSeededChannelId !== channelId)}
        />
      </div>

      {/* Content: child routes render here via Outlet */}
      <div
        className={`${
          mobileView === 'chat' ? 'flex absolute inset-0 z-10 md:relative md:z-auto' : 'hidden'
        } md:flex flex-1 min-w-0 overflow-hidden transition-all duration-300 ease-in-out gap-3`}
      >
        {routeChannelBlocked ? (
          <GlassPanel className="flex-1 flex items-center justify-center text-text-muted">
            <Loader2 size={18} className="animate-spin opacity-60" />
          </GlassPanel>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  )
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-white/8 ${className}`} />
}

function ChannelSidebarLoadingPanel() {
  return (
    <GlassPanel className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex h-[74px] shrink-0 items-center border-b border-border-subtle/30 px-5">
        <SkeletonBlock className="h-5 w-32 rounded-full" />
      </div>
      <div className="space-y-6 px-4 py-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <SkeletonBlock className="h-3 w-16 rounded-full" />
            <SkeletonBlock className="h-8 w-8 rounded-xl" />
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-[86%] rounded-2xl" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <SkeletonBlock className="h-3 w-20 rounded-full" />
            <SkeletonBlock className="h-8 w-8 rounded-xl" />
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-10 w-full rounded-2xl" />
            <SkeletonBlock className="h-10 w-[78%] rounded-2xl" />
            <SkeletonBlock className="h-10 w-[92%] rounded-2xl" />
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

function ChatLoadingPanel() {
  return (
    <GlassPanel
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        background: 'var(--chat-panel-bg)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <div className="app-header flex items-center gap-3 border-b border-border-subtle/30 px-6">
        <SkeletonBlock className="h-8 w-8 rounded-full" />
        <SkeletonBlock className="h-5 w-28 rounded-full" />
        <SkeletonBlock className="hidden h-5 w-40 rounded-full sm:block" />
        <div className="ml-auto flex gap-2">
          <SkeletonBlock className="h-8 w-8 rounded-full" />
          <SkeletonBlock className="h-8 w-8 rounded-full" />
        </div>
      </div>
      <div className="flex-1 space-y-6 px-6 py-7">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex gap-4">
            <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-4 w-24 rounded-full" />
                <SkeletonBlock className="h-3 w-20 rounded-full" />
              </div>
              <SkeletonBlock className="h-4 w-[min(78%,34rem)] rounded-full" />
              <SkeletonBlock className="h-4 w-[min(58%,24rem)] rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-5">
        <SkeletonBlock className="h-14 w-full rounded-[28px]" />
      </div>
    </GlassPanel>
  )
}

function MemberLoadingPanel() {
  return (
    <GlassPanel className="hidden h-full w-[240px] shrink-0 overflow-hidden pt-4 lg:block">
      <div className="px-4 pb-4 pt-2">
        <SkeletonBlock className="h-[54px] w-full rounded-full" />
      </div>
      <div className="space-y-5 px-4">
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <div className="space-y-2">
            <SkeletonBlock className="h-[66px] w-full rounded-2xl" />
            <SkeletonBlock className="h-[56px] w-[88%] rounded-2xl" />
          </div>
        </div>
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <SkeletonBlock className="h-[56px] w-[78%] rounded-2xl" />
        </div>
      </div>
    </GlassPanel>
  )
}

function ServerRouteLoadingShell({ mobileView }: { mobileView: 'servers' | 'channels' | 'chat' }) {
  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-transparent gap-3" aria-hidden>
      <div
        className={`${
          mobileView === 'channels' ? 'flex absolute inset-0 z-20 md:relative' : 'hidden'
        } md:flex w-full md:w-[240px] flex-shrink-0 transition-transform duration-300 ease-in-out`}
      >
        <ChannelSidebarLoadingPanel />
      </div>
      <div
        className={`${
          mobileView === 'chat' ? 'flex absolute inset-0 z-10 md:relative md:z-auto' : 'hidden'
        } md:flex min-w-0 flex-1 overflow-hidden transition-all duration-300 ease-in-out gap-3`}
      >
        <ChatLoadingPanel />
        <MemberLoadingPanel />
      </div>
    </div>
  )
}
