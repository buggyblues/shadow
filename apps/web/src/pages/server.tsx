import { GlassPanel } from '@shadowob/ui'
import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  type BuddyInboxEntry,
  ChannelSidebar,
  type ServerAppSummary,
} from '../components/channel/channel-sidebar'
import {
  type ChannelSwitcherOption,
  type ChatInitialMessagesPage,
} from '../components/chat/chat-area'
import { chatMessagesQueryKey } from '../components/chat/chat-messages-query'
import { type MemberListInitialMember } from '../components/member/member-list'
import { ServerLandingPanel } from '../components/server/server-landing'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import {
  invalidateServerChannelState,
  seedBuddyInboxSnapshot,
  seedServerChannelSnapshot,
  serverChannelCacheKeys,
} from '../lib/channel-cache'
import { buildCopilotMessageMetadata } from '../lib/copilot-message-metadata'
import {
  getCopilotChannelIdFromSearch,
  type RouteSearch,
  withCopilotChannelSearch,
} from '../lib/copilot-route'
import { clearLastChannelId } from '../lib/last-channel'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'
import { ChannelView } from './channel-view'
import { ServerAppsPageRoute } from './server-apps'

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

type ServerCacheMeta = ServerMeta & { inviteCode?: string }

interface ChannelMeta {
  id: string
  name: string
  serverId: string
  type?: string
  isArchived?: boolean
}

interface ChannelAccessMeta {
  canAccess: boolean
  channel: ChannelMeta
  isServerMember?: boolean
  isChannelMember?: boolean
  canManage?: boolean
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

interface ChannelBootstrap {
  access: ChannelAccessMeta
  channel?: ChannelMeta
  server: ServerMeta | null
  channels: ChannelMeta[]
  buddyInboxes?: BuddyInboxEntry[]
  appSummaries?: ServerAppSummary[]
  members: MemberListInitialMember[]
  messages: ChatInitialMessagesPage
  slashCommands: { commands: unknown[] }
}

const SERVER_ROUTE_STALE_MS = 5 * 60 * 1000
const SERVER_ROUTE_GC_MS = 30 * 60 * 1000
const COPILOT_PANEL_WIDTH_KEY = 'shadow.copilot.channelPanelWidth'
const COPILOT_DEFAULT_CHANNEL_WIDTH = 360
const COPILOT_MIN_CHANNEL_WIDTH = 280
const COPILOT_MIN_APP_WIDTH = 420

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function readSavedCopilotPanelWidth() {
  if (typeof window === 'undefined') return COPILOT_DEFAULT_CHANNEL_WIDTH
  const value = Number(window.localStorage.getItem(COPILOT_PANEL_WIDTH_KEY))
  return Number.isFinite(value)
    ? clamp(value, COPILOT_MIN_CHANNEL_WIDTH, 720)
    : COPILOT_DEFAULT_CHANNEL_WIDTH
}

function persistCopilotPanelWidth(width: number) {
  try {
    window.localStorage.setItem(COPILOT_PANEL_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // Panel width persistence is non-critical.
  }
}

function getServerAppKeyFromPath(pathname: string) {
  const match = pathname.match(/\/servers\/[^/]+\/apps\/([^/?#]+)/u)
  if (!match?.[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function useCopilotPanelResize() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    maxWidth: number
  } | null>(null)
  const [channelWidth, setChannelWidth] = useState(readSavedCopilotPanelWidth)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    if (!isResizing || typeof document === 'undefined') return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [isResizing])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const bounds = containerRef.current?.getBoundingClientRect()
      if (!bounds) return
      const maxWidth = Math.max(COPILOT_MIN_CHANNEL_WIDTH, bounds.width - COPILOT_MIN_APP_WIDTH)
      const startWidth = clamp(channelWidth, COPILOT_MIN_CHANNEL_WIDTH, maxWidth)
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth,
        maxWidth,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
      setIsResizing(true)
    },
    [channelWidth],
  )

  const handlePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const nextWidth = clamp(
      drag.startWidth + event.clientX - drag.startX,
      COPILOT_MIN_CHANNEL_WIDTH,
      drag.maxWidth,
    )
    setChannelWidth(nextWidth)
  }, [])

  const finishResize = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsResizing(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }
    setChannelWidth((current) => {
      const nextWidth = clamp(current, COPILOT_MIN_CHANNEL_WIDTH, drag.maxWidth)
      persistCopilotPanelWidth(nextWidth)
      return nextWidth
    })
  }, [])

  return {
    channelWidth,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: finishResize,
    isResizing,
  }
}

/**
 * Server layout route — wraps all server child routes with the channel sidebar.
 *
 * URL: /app/servers/$serverSlug
 * Children: ServerHomeView, ChannelView, ShopView, WorkspaceView, etc.
 */
export function ServerLayout() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { serverSlug, channelId, appKey } = useParams({ strict: false }) as {
    serverSlug: string
    channelId?: string
    appKey?: string
  }
  const location = useLocation()
  const routeSearch = useSearch({ strict: false }) as RouteSearch
  const activeServerId = useChatStore((state) => state.activeServerId)
  const activeChannelId = useChatStore((state) => state.activeChannelId)
  const setActiveServer = useChatStore((state) => state.setActiveServer)
  const mobileView = useUIStore((state) => state.mobileView)
  const copilotChannel = useUIStore((state) => state.copilotChannel)
  const setMobileView = useUIStore((state) => state.setMobileView)
  const openCopilotChannel = useUIStore((state) => state.openCopilotChannel)
  const closeCopilotChannel = useUIStore((state) => state.closeCopilotChannel)
  const [bootstrapSeededChannelId, setBootstrapSeededChannelId] = useState<string | null>(null)
  const [stableServerMeta, setStableServerMeta] = useState<ServerMeta | null>(null)
  const copilotResize = useCopilotPanelResize()

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
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
    refetchOnWindowFocus: false,
  })

  const {
    data: serverAccess,
    isLoading: isServerAccessLoading,
    isError: isServerAccessError,
  } = useQuery({
    queryKey: ['server-access', serverSlug],
    queryFn: () => fetchApi<ServerAccessMeta>(`/api/servers/${serverSlug}/access`),
    enabled:
      !!serverSlug &&
      (!channelId || isChannelBootstrapError || channelBootstrap?.access.isServerMember === false),
    retry: false,
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })

  const cachedServerMeta = serverSlug
    ? queryClient.getQueryData<ServerMeta>(['server', serverSlug])
    : undefined
  const stableServerMetaForRoute =
    stableServerMeta && (stableServerMeta.slug === serverSlug || stableServerMeta.id === serverSlug)
      ? stableServerMeta
      : undefined
  const canAccessServer = channelId
    ? Boolean(
        channelBootstrap?.server ??
          cachedServerMeta ??
          stableServerMetaForRoute ??
          (serverAccess?.canAccess ? serverAccess.server : null),
      )
    : serverAccess?.canAccess === true

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerMeta>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug && !channelId && canAccessServer,
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })
  const freshServerMeta =
    channelBootstrap?.server ?? server ?? serverAccess?.server ?? cachedServerMeta
  const serverMeta = freshServerMeta ?? stableServerMetaForRoute

  useEffect(() => {
    if (!freshServerMeta) return
    setStableServerMeta(freshServerMeta)
  }, [freshServerMeta])

  useLayoutEffect(() => {
    if (!channelId || !channelBootstrap) return
    queryClient.setQueryData(['channel-access', channelId], channelBootstrap.access)
    queryClient.setQueryData(['channel', channelId], channelBootstrap.channel)
    queryClient.setQueryData(['channel-slash-commands', channelId], channelBootstrap.slashCommands)
    queryClient.setQueryData<InfiniteData<ChatInitialMessagesPage, string | null>>(
      chatMessagesQueryKey(channelId),
      {
        pages: [channelBootstrap.messages],
        pageParams: [null],
      },
    )

    if (channelBootstrap.server) {
      const serverKey = channelBootstrap.server.slug ?? serverSlug
      const serverChannelKeys = serverChannelCacheKeys(
        serverSlug,
        serverKey,
        channelBootstrap.server.id,
      )
      const mergeServerCache = (queryKey: unknown[]) => {
        queryClient.setQueryData<ServerCacheMeta>(queryKey, (current) => ({
          ...(current ?? {}),
          ...channelBootstrap.server!,
        }))
      }
      mergeServerCache(['server', channelBootstrap.server.id])
      mergeServerCache(['server', serverKey])
      mergeServerCache(['server', serverSlug])
      seedServerChannelSnapshot(queryClient, serverChannelKeys, channelBootstrap.channels)
      if (channelBootstrap.buddyInboxes) {
        seedBuddyInboxSnapshot(queryClient, serverChannelKeys, channelBootstrap.buddyInboxes)
      }
      if (channelBootstrap.appSummaries) {
        for (const key of [serverKey, serverSlug]) {
          queryClient.setQueryData(['server-app-summaries', key], channelBootstrap.appSummaries)
          queryClient.setQueryData(
            ['server-app-summaries', key, i18n.language],
            channelBootstrap.appSummaries,
          )
        }
      }
      queryClient.setQueryData(
        ['members', channelBootstrap.server.id, channelId],
        channelBootstrap.members,
      )
    }

    setBootstrapSeededChannelId(channelId)
  }, [channelBootstrap, channelId, queryClient, serverSlug])

  const requestServerAccess = useMutation({
    mutationFn: () =>
      fetchApi<{ ok: boolean; status: 'approved' | 'pending'; requestId?: string }>(
        `/api/servers/${serverSlug}/join-requests`,
        {
          method: 'POST',
        },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['server-access', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] })
      invalidateServerChannelState(
        queryClient,
        serverChannelCacheKeys(serverSlug, serverAccess?.server.id, serverAccess?.server.slug),
      )
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      if (result.status === 'approved') {
        navigate({
          to: '/servers/$serverSlug',
          params: { serverSlug: serverAccess?.server.slug ?? serverSlug },
          replace: true,
        })
      }
    },
  })

  const routeChannelAccess = channelBootstrap?.access
  const isChannelBootstrapSeedPending =
    !!channelId && Boolean(channelBootstrap) && bootstrapSeededChannelId !== channelId
  const isRouteChannelLoading =
    !!channelId && (isChannelBootstrapLoading || isChannelBootstrapSeedPending)
  const isRouteChannelError = isChannelBootstrapError
  const routeChannel = routeChannelAccess?.channel
  const routeAppKey = appKey ?? getServerAppKeyFromPath(location.pathname)

  // Redirect UUID URL → slug URL
  useEffect(() => {
    if (serverMeta?.slug && serverSlug !== serverMeta.slug) {
      const pathname = location.pathname
      const serverBase =
        [`/app/servers/${serverSlug}`, `/servers/${serverSlug}`].find((base) =>
          pathname.startsWith(base),
        ) ?? `/servers/${serverSlug}`
      const childPath = pathname.startsWith(serverBase) ? pathname.slice(serverBase.length) : ''
      const target =
        childPath.startsWith('/shop/admin') || childPath.startsWith('/shop/admin/')
          ? '/servers/$serverSlug/shop/admin'
          : childPath.startsWith('/shop') || childPath.startsWith('/shop/')
            ? '/servers/$serverSlug/shop'
            : childPath.startsWith('/workspace') || childPath.startsWith('/workspace/')
              ? '/servers/$serverSlug/workspace'
              : routeAppKey
                ? '/servers/$serverSlug/apps/$appKey'
                : childPath.startsWith('/apps') || childPath.startsWith('/apps/')
                  ? '/servers/$serverSlug/apps'
                  : channelId
                    ? '/servers/$serverSlug/channels/$channelId'
                    : '/servers/$serverSlug'
      navigate({
        to: target,
        params: routeAppKey
          ? { serverSlug: serverMeta.slug, appKey: routeAppKey }
          : channelId
            ? { serverSlug: serverMeta.slug, channelId }
            : { serverSlug: serverMeta.slug },
        search: routeSearch,
        replace: true,
      })
    }
  }, [
    channelId,
    location.pathname,
    navigate,
    routeAppKey,
    routeSearch,
    serverMeta?.slug,
    serverSlug,
  ])

  // Sync server to store
  useEffect(() => {
    if (serverMeta?.id && serverMeta.id !== activeServerId) {
      setActiveServer(serverMeta.id)
    }
  }, [serverMeta?.id, activeServerId, setActiveServer])

  useEffect(() => {
    if (!channelId || !serverMeta?.id) return

    if (routeChannel && routeChannel.serverId !== serverMeta.id) {
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
  }, [channelId, navigate, routeChannel, serverMeta?.id, serverMeta?.slug, serverSlug])

  // Channel name for title bar
  const titleChannelId = channelId ?? activeChannelId ?? null
  const { data: channel } = useQuery({
    queryKey: ['channel', titleChannelId],
    queryFn: () => fetchApi<ChannelMeta>(`/api/channels/${titleChannelId}`),
    enabled:
      !!titleChannelId &&
      (!channelId || routeChannelAccess?.canAccess === true) &&
      !routeChannel &&
      titleChannelId !== channelBootstrap?.channel?.id,
    staleTime: 30_000,
    refetchOnMount: false,
  })

  const unreadCount = useUnreadCount()
  const title =
    (channel?.name ?? routeChannel?.name)
      ? `#${channel?.name ?? routeChannel?.name} · ${serverMeta?.name ?? t('server.home')}`
      : (serverMeta?.name ?? t('common.selectServerToChat'))
  const isServerAppsRoute = /\/servers\/[^/]+\/apps(?:\/|$)/u.test(location.pathname)
  const routeCopilotChannelId = getCopilotChannelIdFromSearch(routeSearch)
  const routeServerSlug = serverMeta?.slug ?? serverSlug
  const activeCopilotChannelId = isServerAppsRoute ? routeCopilotChannelId : null
  const isCopilotMode = isServerAppsRoute && Boolean(activeCopilotChannelId)
  const isServerMember = channelId
    ? (channelBootstrap?.access.isServerMember ?? serverAccess?.isMember ?? Boolean(serverMeta)) ===
      true
    : serverAccess?.isMember === true
  const shouldRenderChannelSidebar = !isCopilotMode && isServerMember

  const { data: copilotChannels = [] } = useQuery<ChannelMeta[]>({
    queryKey: ['channels', serverSlug],
    queryFn: () => fetchApi<ChannelMeta[]>(`/api/servers/${serverSlug}/channels`),
    enabled: !!serverSlug && isCopilotMode && isServerMember,
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })

  const { data: copilotInboxes = [] } = useQuery<BuddyInboxEntry[]>({
    queryKey: ['buddy-inboxes', serverSlug],
    queryFn: () => fetchApi<BuddyInboxEntry[]>(`/api/servers/${serverSlug}/inboxes`),
    enabled: !!serverSlug && isCopilotMode && isServerMember,
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })

  const { data: copilotAppSummaries = [] } = useQuery<ServerAppSummary[]>({
    queryKey: ['server-app-summaries', serverSlug, i18n.language],
    queryFn: () => fetchApi<ServerAppSummary[]>(`/api/servers/${serverSlug}/apps?summary=1`),
    enabled: !!serverSlug && isCopilotMode && isServerMember && Boolean(routeAppKey),
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })

  const copilotSwitcherChannels = useMemo<ChannelSwitcherOption[]>(() => {
    const inboxChannelIds = new Set(
      copilotInboxes.flatMap((entry) => (entry.channel ? [entry.channel.id] : [])),
    )
    const channels = copilotChannels
      .filter((channel) => !inboxChannelIds.has(channel.id))
      .map<ChannelSwitcherOption>((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        isArchived: channel.isArchived,
        section: 'channel',
      }))
    const inboxes = copilotInboxes.flatMap<ChannelSwitcherOption>((entry) => {
      if (!entry.channel) return []
      const user = entry.agent.user
      return [
        {
          id: entry.channel.id,
          name: user.displayName?.trim() || user.username || entry.channel.name,
          type: 'inbox',
          isArchived: entry.channel.isArchived,
          section: 'inbox',
          userId: user.id,
          avatarUrl: user.avatarUrl,
          status: entry.agent.status || user.status || null,
        },
      ]
    })
    return [...inboxes, ...channels]
  }, [copilotChannels, copilotInboxes])

  const activeCopilotApp = useMemo(
    () =>
      routeAppKey
        ? copilotAppSummaries.find((summary) => summary.appKey === routeAppKey)
        : undefined,
    [copilotAppSummaries, routeAppKey],
  )
  const activeCopilotSwitcherOption = useMemo(
    () => copilotSwitcherChannels.find((option) => option.id === activeCopilotChannelId),
    [activeCopilotChannelId, copilotSwitcherChannels],
  )
  const copilotMessageMetadata = useMemo(
    () =>
      routeAppKey
        ? buildCopilotMessageMetadata({
            appKey: routeAppKey,
            serverAppId: activeCopilotApp?.id ?? null,
            appName: activeCopilotApp?.name ?? null,
            serverId: serverMeta?.id ?? null,
            serverSlug: routeServerSlug,
            channelId: activeCopilotChannelId ?? null,
            channelKind: activeCopilotSwitcherOption?.section ?? null,
          })
        : undefined,
    [
      activeCopilotApp?.id,
      activeCopilotApp?.name,
      activeCopilotChannelId,
      activeCopilotSwitcherOption?.section,
      routeAppKey,
      routeServerSlug,
      serverMeta?.id,
    ],
  )

  useEffect(() => {
    if (!isServerAppsRoute || !routeCopilotChannelId) return
    if (
      copilotChannel?.channelId === routeCopilotChannelId &&
      (copilotChannel.serverSlug === serverSlug || copilotChannel.serverSlug === serverMeta?.slug)
    ) {
      return
    }
    openCopilotChannel(serverSlug, routeCopilotChannelId)
  }, [
    copilotChannel?.channelId,
    copilotChannel?.serverSlug,
    isServerAppsRoute,
    openCopilotChannel,
    routeCopilotChannelId,
    serverMeta?.slug,
    serverSlug,
  ])

  useEffect(() => {
    if (copilotChannel && !isServerAppsRoute) {
      closeCopilotChannel()
    }
  }, [closeCopilotChannel, copilotChannel, isServerAppsRoute])

  useEffect(() => {
    if (copilotChannel && isServerAppsRoute && !routeCopilotChannelId) {
      closeCopilotChannel()
      setMobileView('channels')
    }
  }, [closeCopilotChannel, copilotChannel, isServerAppsRoute, routeCopilotChannelId, setMobileView])

  useEffect(() => {
    if (!copilotChannel) return
    if (
      copilotChannel.serverSlug !== serverSlug &&
      copilotChannel.serverSlug !== serverMeta?.slug
    ) {
      closeCopilotChannel()
    }
  }, [closeCopilotChannel, copilotChannel, serverMeta?.slug, serverSlug])

  useAppStatus({
    title,
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  if (!serverSlug) return null

  if (channelId && (isRouteChannelLoading || isServerAccessLoading) && !serverMeta) {
    return <ServerRouteLoadingShell mobileView={mobileView} />
  }

  if (!channelId && (isServerAccessLoading || (canAccessServer && isServerLoading))) {
    return (
      <GlassPanel className="flex-1 flex items-center justify-center text-text-muted">
        <Loader2 size={20} className="animate-spin opacity-60" />
      </GlassPanel>
    )
  }

  if (!channelId && serverAccess && !serverAccess.isMember) {
    const isPending = serverAccess.joinRequestStatus === 'pending' || requestServerAccess.isSuccess
    return (
      <>
        <ServerLandingPanel
          server={serverAccess.server}
          mode={serverAccess.server.isPublic ? 'public' : 'private'}
          pending={!serverAccess.server.isPublic && isPending}
          loading={requestServerAccess.isPending}
          onJoin={() => requestServerAccess.mutate()}
        />
      </>
    )
  }

  if ((!channelId && isServerAccessError) || !serverMeta) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center px-6 text-center text-sm font-bold text-text-muted">
        {t('server.accessUnavailable')}
      </GlassPanel>
    )
  }

  const routeChannelBlocked =
    !!channelId && !!serverMeta?.id && !!routeChannel && routeChannel.serverId !== serverMeta.id

  const navigateServerAppCopilot = (nextChannelId: string | null) => {
    navigate({
      to: routeAppKey ? '/servers/$serverSlug/apps/$appKey' : '/servers/$serverSlug/apps',
      params: routeAppKey
        ? { serverSlug: routeServerSlug, appKey: routeAppKey }
        : { serverSlug: routeServerSlug },
      search: withCopilotChannelSearch(routeSearch, nextChannelId),
      replace: true,
    })
  }

  const openChannelInCopilot = (channel: { id: string }) => {
    openCopilotChannel(serverSlug, channel.id)
    navigateServerAppCopilot(channel.id)
  }

  const closeCopilot = () => {
    closeCopilotChannel()
    setMobileView('channels')
    navigate({
      to: routeAppKey ? '/servers/$serverSlug/apps/$appKey' : '/servers/$serverSlug/apps',
      params: routeAppKey
        ? { serverSlug: routeServerSlug, appKey: routeAppKey }
        : { serverSlug: routeServerSlug },
      search: withCopilotChannelSearch(routeSearch, null),
      replace: true,
    })
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full gap-3 bg-transparent">
      {/* Channel sidebar */}
      {shouldRenderChannelSidebar && (
        <div
          className={`${
            mobileView === 'channels' ? 'flex absolute inset-0 z-20 md:relative' : 'hidden'
          } md:flex flex-col w-full md:w-[240px] flex-shrink-0 transition-transform duration-300 ease-in-out`}
        >
          <ChannelSidebar
            serverSlug={serverSlug}
            deferInitialQueries={Boolean(
              channelId && !serverMeta && bootstrapSeededChannelId !== channelId,
            )}
            onSelectChannel={isServerAppsRoute ? openChannelInCopilot : undefined}
          />
        </div>
      )}

      {/* Content: child routes render here via Outlet */}
      <div
        className={`${
          mobileView === 'chat' ? 'flex absolute inset-0 z-10 md:relative md:z-auto' : 'hidden'
        } md:flex flex-1 min-w-0 overflow-hidden transition-all duration-300 ease-in-out gap-3`}
      >
        {isServerAppsRoute ? (
          <div
            ref={copilotResize.containerRef}
            className={
              isCopilotMode
                ? `flex h-full min-w-0 flex-1 md:flex-row ${
                    copilotResize.isResizing ? 'select-none' : ''
                  }`
                : 'contents'
            }
          >
            {isCopilotMode && activeCopilotChannelId && (
              <div
                className="flex h-full min-w-0 flex-1 md:flex-none"
                style={{ width: copilotResize.channelWidth, minWidth: COPILOT_MIN_CHANNEL_WIDTH }}
              >
                <ChannelView
                  channelId={activeCopilotChannelId}
                  serverSlug={serverSlug}
                  copilot={{
                    channels: copilotSwitcherChannels,
                    messageMetadata: copilotMessageMetadata,
                    onSelectChannel: (nextChannelId) => {
                      openCopilotChannel(serverSlug, nextChannelId)
                      navigateServerAppCopilot(nextChannelId)
                    },
                    onEnter: () => {
                      closeCopilotChannel()
                      navigate({
                        to: '/servers/$serverSlug/channels/$channelId',
                        params: {
                          serverSlug: routeServerSlug,
                          channelId: activeCopilotChannelId,
                        },
                      })
                    },
                    onExit: closeCopilot,
                  }}
                />
              </div>
            )}
            {isCopilotMode && activeCopilotChannelId && (
              <button
                type="button"
                role="separator"
                aria-orientation="vertical"
                aria-label={t('channel.resizeCopilot')}
                title={t('channel.resizeCopilot')}
                className="group hidden w-3 shrink-0 cursor-col-resize items-center justify-center outline-none md:flex"
                onPointerDown={copilotResize.handlePointerDown}
                onPointerMove={copilotResize.handlePointerMove}
                onPointerUp={copilotResize.handlePointerUp}
                onPointerCancel={copilotResize.handlePointerUp}
              >
                <span className="h-16 w-1.5 rounded-full bg-white/35 shadow-[0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur transition group-hover:bg-white/55 group-focus-visible:bg-primary/70" />
              </button>
            )}
            <div
              className={isCopilotMode ? 'hidden min-w-0 flex-1 md:flex' : 'contents'}
              style={isCopilotMode ? { minWidth: COPILOT_MIN_APP_WIDTH } : undefined}
            >
              <ServerAppsPageRoute
                active={isServerAppsRoute}
                appKeyOverride={routeAppKey}
                preserveActiveChannel={isCopilotMode}
              />
            </div>
          </div>
        ) : routeChannelBlocked ? (
          <RouteChannelContentLoading />
        ) : channelId ? (
          <ChannelView
            channelId={channelId}
            serverSlug={serverSlug}
            initialAccess={channelBootstrap?.access ?? null}
            initialMessages={channelBootstrap?.messages}
            initialMembers={channelBootstrap?.members}
            routeAccessFallbackLoading={isChannelBootstrapLoading || isServerAccessLoading}
          />
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  )
}

function RouteChannelContentLoading() {
  return (
    <>
      <ChatLoadingPanel />
      <MemberLoadingPanel />
    </>
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
