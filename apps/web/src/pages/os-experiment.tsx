import { Button, cn, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { Copy, Loader2, LogOut, Monitor, PawPrint, Plus, Settings } from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  type CreateBuddyTarget,
  QuickCreateBuddyModal,
} from '../components/buddy-management/quick-create-buddy-modal'
import {
  type Agent,
  getAgentAllowedServerIds,
  getAgentBuddyMode,
} from '../components/buddy-management/types'
import type { Attachment as ChatAttachment } from '../components/chat/message-bubble/types'
import { useConfirmStore } from '../components/common/confirm-dialog'
import { ContextMenu, type ContextMenuGroup } from '../components/common/context-menu'
import { ServerLandingPanel } from '../components/server/server-landing'
import { SpaceJoinPromptModal } from '../components/server/space-join-prompt-modal'
import { useVoiceSession } from '../components/voice/voice-session-context'
import { useAppStatus } from '../hooks/use-app-status'
import { useSocketEvent } from '../hooks/use-socket'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { getDesktopSettingsBridge } from '../lib/desktop-settings-bridge'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'
import {
  useWorkspaceStore,
  type WorkspaceInfo,
  type WorkspaceNode,
} from '../stores/workspace.store'
import { myBuddyMessageWindowInput } from './os-experiment/buddy-window'
import { OsBuiltinAppIcon } from './os-experiment/builtin-icons'
import type { ChannelCreateType } from './os-experiment/channel-ui'
import { OsWindowLayer } from './os-experiment/components/layouts/os-window-layer'
import { defaultDesktopFilePosition, OsDesktop } from './os-experiment/desktop'
import { OsDockBar } from './os-experiment/dock-bar'
import { useStableArray } from './os-experiment/hooks/use-stable-array'
import { useWindowEdgeClassById } from './os-experiment/hooks/use-window-edge-classes'
import { OsAvatarMenu, OsBackground, OsTopBar } from './os-experiment/shell'
import { getOsSpaceContextMenuActions } from './os-experiment/space-context-menu'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
  OsChannelTab,
  OsCommandDetail,
  OsDesktopLayout,
  OsRemoteWidgetCatalogEntry,
  OsServerMember,
  OsStickyNoteMentionContext,
  OsStickyNoteMentionTarget,
  OsWindowState,
  ScopedUnread,
  ServerEntry,
  SpaceAppInstallation,
} from './os-experiment/types'
import { useOsDesktopLayout } from './os-experiment/use-desktop-layout'
import { useOsDockState } from './os-experiment/use-os-dock'
import { useOsWindowManager } from './os-experiment/use-os-window-manager'
import {
  channelSort,
  normalizeOsDesktopLayout,
  OS_GC_MS,
  OS_STALE_MS,
  serverRouteKey,
} from './os-experiment/utils'
import { OsWallpaperSettingsModal } from './os-experiment/wallpaper-settings'
import type { SettingsModalTab } from './settings/settings-modal'

const OS_FLOATING_LAYER_Z_INDEX = 2_147_482_000
const OS_BUILTIN_APP_KEYS: readonly OsBuiltinAppKey[] = [
  'workspace',
  'app-store',
  'shop',
  'settings',
  'profile',
  'server-settings',
  'cloud-computers',
  'discover',
  'my-buddies',
  'contacts',
  'tasks',
  'wallet',
]

type BridgeBuddyCreatorRequest = {
  initialTarget?: CreateBuddyTarget
  landing?: {
    title?: string
    description?: string
  }
}

type OsSpaceAccessStatus = {
  server: ServerEntry['server']
  isMember: boolean
  canManage: boolean
  canAccess: boolean
  requiresApproval: boolean
  joinRequestStatus?: 'pending' | 'approved' | 'rejected' | null
  joinRequestId?: string | null
}

type AddAgentsResponse = {
  added?: Array<string | { agentId: string }>
  failed?: Array<{ agentId: string; error: string }>
  results?: Array<{ agentId: string; success: boolean; error?: string }>
}

const EMPTY_SERVER_ENTRIES: ServerEntry[] = []
const EMPTY_CHANNELS: ChannelMeta[] = []
const EMPTY_SPACE_APP_INSTALLATIONS: SpaceAppInstallation[] = []
const EMPTY_BUDDY_INBOXES: BuddyInboxEntry[] = []
const EMPTY_WORKSPACE_NODES: WorkspaceNode[] = []
const EMPTY_SERVER_MEMBERS: OsServerMember[] = []
const LAST_OS_SPACE_STORAGE_KEY = 'shadow:last-os-space'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

const isUuid = (value: string | null | undefined): value is string =>
  typeof value === 'string' && UUID_RE.test(value)

const parseAddAgentsResult = (result: AddAgentsResponse | undefined | null) => {
  if (!result) {
    return { added: [] as string[], failed: [] as Array<{ agentId: string; error: string }> }
  }

  if (Array.isArray(result.added) && Array.isArray(result.failed)) {
    return {
      added: result.added
        .map((item) => (typeof item === 'string' ? item : item.agentId))
        .filter(Boolean),
      failed: result.failed,
    }
  }

  const results = Array.isArray(result.results) ? result.results : []
  return {
    added: results.filter((item) => item.success).map((item) => item.agentId),
    failed: results
      .filter((item) => !item.success)
      .map((item) => ({ agentId: item.agentId, error: item.error ?? '' })),
  }
}

function flattenWorkspaceNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [node, ...flattenWorkspaceNodes(node.children ?? [])])
}

function matchesServerRouteKey(entry: ServerEntry, routeKey: string) {
  return (
    entry.server.id === routeKey ||
    entry.server.slug === routeKey ||
    serverRouteKey(entry.server) === routeKey
  )
}

function supportsGuestDesktop(server?: ServerEntry['server'] | null) {
  if (!server) return false
  const flags = server as ServerEntry['server'] & {
    allowGuestAccess?: boolean
    guestAccess?: boolean
    guestAccessEnabled?: boolean
  }
  return Boolean(
    flags.guestAccessEnabled === true ||
      flags.allowGuestAccess === true ||
      flags.guestAccess === true ||
      server.isPublic === true,
  )
}

const SETUP_TOUR_STEPS = [
  {
    titleKey: 'os.setupTourWidgetsTitle',
    descriptionKey: 'os.setupTourWidgetsDesc',
  },
  {
    titleKey: 'os.setupTourChannelsTitle',
    descriptionKey: 'os.setupTourChannelsDesc',
  },
  {
    titleKey: 'os.setupTourBuddyTitle',
    descriptionKey: 'os.setupTourBuddyDesc',
  },
  {
    titleKey: 'os.setupTourAppsTitle',
    descriptionKey: 'os.setupTourAppsDesc',
  },
] as const

type SetupTourAction = {
  label: string
  onClick: () => void
  advanceOnClick?: boolean
}

function OsSetupTourBubble({
  stepIndex,
  actions = [],
  onNext,
  onSkip,
}: {
  stepIndex: number
  actions?: SetupTourAction[]
  onNext: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const step = SETUP_TOUR_STEPS[stepIndex] ?? SETUP_TOUR_STEPS[0]
  const isLastStep = stepIndex >= SETUP_TOUR_STEPS.length - 1
  const handleActionClick = (action: SetupTourAction) => {
    action.onClick()
    if (action.advanceOnClick) {
      window.setTimeout(onNext, 160)
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[2147482100] flex justify-center px-4 sm:bottom-6 sm:justify-start sm:px-7">
      <section
        aria-label={t('os.setupTourLabel')}
        className="pointer-events-auto w-[min(430px,calc(100vw-32px))] rounded-[26px] border border-white/12 bg-black/68 p-4 text-white shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-amber-200/35 bg-amber-300 text-sm font-black text-slate-950 shadow-[0_10px_26px_rgba(252,211,77,0.22)]">
            {stepIndex + 1}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-white/44">
              {t('os.setupTourProgress', {
                current: stepIndex + 1,
                total: SETUP_TOUR_STEPS.length,
              })}
            </p>
            <h2 className="mt-2 text-lg font-black leading-snug text-white">{t(step.titleKey)}</h2>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/66">
          {t(step.descriptionKey)}
        </p>
        <ol className="mt-4 grid gap-2" aria-label={t('os.setupTourChecklistLabel')}>
          {SETUP_TOUR_STEPS.map((item, index) => {
            const completed = index < stepIndex
            const active = index === stepIndex
            return (
              <li
                key={item.titleKey}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black transition-colors',
                  active
                    ? 'border-amber-200/28 bg-amber-200/12 text-white'
                    : 'border-white/8 bg-white/[0.04] text-white/54',
                  completed ? 'border-emerald-200/20 bg-emerald-200/8 text-white/62' : '',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                    completed
                      ? 'bg-emerald-300 text-slate-950'
                      : active
                        ? 'bg-amber-300 text-slate-950'
                        : 'bg-white/10 text-white/55',
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 truncate">{t(item.titleKey)}</span>
              </li>
            )
          })}
        </ol>
        {actions.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant="ghost"
                size="sm"
                className="justify-start rounded-2xl border border-white/10 bg-white/8 px-3 font-black text-white hover:bg-white/14"
                onClick={() => handleActionClick(action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="font-black" onClick={onSkip}>
            {t('os.setupTourSkip')}
          </Button>
          <Button variant="primary" size="sm" className="font-black" onClick={onNext}>
            {t(isLastStep ? 'os.setupTourDone' : 'os.setupTourNext')}
          </Button>
        </div>
      </section>
    </div>
  )
}

export function OsDesktopPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const routeParams = useParams({ strict: false }) as {
    serverIdOrSlug?: string
  }
  const routeSearch = useSearch({ strict: false }) as {
    app?: string
    appPath?: string
    builtin?: OsBuiltinAppKey
    channel?: string
    dm?: string
    tour?: 'space-setup'
  }
  const requestedServerKey = routeParams.serverIdOrSlug?.trim() ?? ''
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const { connectedVoiceChannel, voice } = useVoiceSession()
  const desktopSettingsBridge = getDesktopSettingsBridge()
  const setActiveServer = useChatStore((state) => state.setActiveServer)
  const workspaceClipboard = useWorkspaceStore((state) => state.clipboard)
  const setWorkspaceClipboard = useWorkspaceStore((state) => state.setClipboard)
  const renamingWorkspaceNodeId = useWorkspaceStore((state) => state.renamingNodeId)
  const setRenamingWorkspaceNodeId = useWorkspaceStore((state) => state.setRenamingNodeId)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [showJoinPrompt, setShowJoinPrompt] = useState(false)
  const [createChannelRequestNonce, setCreateChannelRequestNonce] = useState(0)
  const [spaceContextMenu, setSpaceContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [setupTourStep, setSetupTourStep] = useState<number | null>(null)
  const [pendingOsCommand, setPendingOsCommand] = useState<OsCommandDetail | null>(null)
  const [showWallpaperSettings, setShowWallpaperSettings] = useState(false)
  const [inboxBubbleRequest, setInboxBubbleRequest] = useState<{
    agentId?: string
    channelId?: string
    nonce: number
  } | null>(null)
  const [buddyCreatorRequest, setBuddyCreatorRequest] = useState<BridgeBuddyCreatorRequest | null>(
    null,
  )
  const [localMessageUnread, setLocalMessageUnread] = useState<Record<string, number>>({})
  const localUnreadEventIdsRef = useRef<Set<string>>(new Set())
  const initialContextOpenedRef = useRef<string | null>(null)
  const restoredContextSyncedRef = useRef<string | null>(null)
  const buddyCreatorResolverRef = useRef<((agent: Agent | null) => void) | null>(null)
  const pendingChannelDesktopPointRef = useRef<{ x: number; y: number } | null>(null)
  const pendingBuddyDesktopPointRef = useRef<{ x: number; y: number } | null>(null)
  const pinChannelToDesktopRef = useRef<
    ((channel: ChannelMeta, point?: { x: number; y: number }) => void) | null
  >(null)
  const pinBuddyInboxToDesktopRef = useRef<
    ((entry: BuddyInboxEntry, point?: { x: number; y: number }) => void) | null
  >(null)

  const { data: servers = EMPTY_SERVER_ENTRIES, isLoading: isServersLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: requestedServerAccess, isLoading: isRequestedServerLoading } = useQuery({
    queryKey: ['os-space-access', requestedServerKey],
    queryFn: () =>
      fetchApi<OsSpaceAccessStatus>(
        `/api/servers/${encodeURIComponent(requestedServerKey)}/access`,
      ),
    enabled: Boolean(requestedServerKey),
    retry: false,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const requestedServerEntry = useMemo<ServerEntry | null>(() => {
    if (!requestedServerKey) return null
    const joinedEntry = servers.find((entry) => matchesServerRouteKey(entry, requestedServerKey))
    if (joinedEntry) return joinedEntry
    if (!requestedServerAccess) return null
    if (!requestedServerAccess.isMember && !supportsGuestDesktop(requestedServerAccess.server)) {
      return null
    }
    return {
      server: requestedServerAccess.server,
      member: {
        role: requestedServerAccess.isMember
          ? requestedServerAccess.canManage
            ? 'admin'
            : 'member'
          : 'guest',
      },
    }
  }, [
    requestedServerAccess?.canManage,
    requestedServerAccess?.isMember,
    requestedServerAccess?.server,
    requestedServerKey,
    servers,
  ])
  const preferredInitialServer = useMemo<ServerEntry | null>(() => {
    if (requestedServerKey) return null
    const rememberedKey = (() => {
      if (typeof window === 'undefined') return ''
      try {
        return window.localStorage.getItem(LAST_OS_SPACE_STORAGE_KEY)?.trim() ?? ''
      } catch {
        return ''
      }
    })()
    if (rememberedKey) {
      const rememberedServer = servers.find((entry) => matchesServerRouteKey(entry, rememberedKey))
      if (rememberedServer) return rememberedServer
    }
    const personalServer = servers.find(
      (entry) => entry.server.ownerId === user?.id && !entry.server.isPublic,
    )
    return personalServer ?? servers[0] ?? null
  }, [requestedServerKey, servers, user?.id])

  const selectedServer = requestedServerKey
    ? requestedServerEntry
    : (servers.find((entry) => entry.server.id === selectedServerId) ??
      preferredInitialServer ??
      null)
  const selectedServerSlug = serverRouteKey(selectedServer?.server)
  const effectiveSelectedServerId = selectedServer?.server.id ?? null
  const selectedServerIsGuest = selectedServer?.member.role === 'guest'
  const canUseMemberServerApis = Boolean(selectedServerSlug && !selectedServerIsGuest)
  const {
    activeChannelTabId,
    channelBubbleRequest,
    closeChannelTab,
    closeWindow,
    focusChannelTab,
    focusedWindowId,
    focusWindow,
    minimizeWindow,
    moveWindow,
    openChannelTabs,
    openChannelWindow,
    openWindow,
    reorderChannelTab,
    resizeWindow,
    restoredWindowServerId,
    restoreWindowForDrag,
    toggleMaximizeWindow,
    updateAppWindowRoute,
    windows,
  } = useOsWindowManager({
    selectedServerId: effectiveSelectedServerId,
    setActiveServer,
    setLocalMessageUnread,
  })
  const unreadCount = useUnreadCount()
  const osWindowsRef = useRef(windows)
  const osFocusedWindowIdRef = useRef(focusedWindowId)
  const osOpenChannelTabsRef = useRef(openChannelTabs)
  const osActiveChannelTabIdRef = useRef(activeChannelTabId)
  const routeAppKeyRef = useRef(routeSearch.app)
  osWindowsRef.current = windows
  osFocusedWindowIdRef.current = focusedWindowId
  osOpenChannelTabsRef.current = openChannelTabs
  osActiveChannelTabIdRef.current = activeChannelTabId
  routeAppKeyRef.current = routeSearch.app
  const activeVoiceScreenChannelId =
    connectedVoiceChannel && (voice.localScreenTrack || voice.remoteScreens.length > 0)
      ? connectedVoiceChannel.id
      : null
  const activeVoiceScreenWindow = activeVoiceScreenChannelId
    ? windows.find(
        (item) => item.kind === 'voice-screen' && item.channelId === activeVoiceScreenChannelId,
      )
    : undefined
  useEffect(() => {
    for (const item of windows) {
      if (item.kind !== 'voice-screen' || item.channelId === activeVoiceScreenChannelId) continue
      closeWindow(item.id)
    }
  }, [activeVoiceScreenChannelId, closeWindow, windows])
  const canManageDesktopLayout =
    !selectedServerIsGuest &&
    (selectedServer?.member.role === 'owner' || selectedServer?.member.role === 'admin')
  const leaveSpace = useMutation({
    mutationFn: (serverId: string) =>
      fetchApi(`/api/servers/${serverId}/leave`, { method: 'POST' }),
    onSuccess: async (_data, serverId) => {
      await queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.removeQueries({ queryKey: ['os-space-access'] })
      queryClient.removeQueries({ queryKey: ['os-server-channels'] })
      setSpaceContextMenu(null)
      setSelectedServerId(null)
      setActiveServer(null)
      navigate({ to: '/' })
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
    },
  })
  const { data: guestServerDesktopLayout } = useQuery({
    queryKey: ['os-server-desktop-layout', selectedServerSlug, 'guest'],
    queryFn: () => fetchApi<OsDesktopLayout>(`/api/servers/${selectedServerSlug}/desktop-layout`),
    enabled: Boolean(selectedServerSlug && selectedServerIsGuest),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })
  const selectedServerDesktopLayout = useMemo(
    () =>
      normalizeOsDesktopLayout(
        selectedServerIsGuest ? guestServerDesktopLayout : selectedServer?.server.desktopLayout,
      ),
    [guestServerDesktopLayout, selectedServer?.server.desktopLayout, selectedServerIsGuest],
  )
  const selectedServerDesktopLayoutKey = useMemo(
    () => JSON.stringify(selectedServerDesktopLayout),
    [selectedServerDesktopLayout],
  )

  const { data: channels = EMPTY_CHANNELS } = useQuery({
    queryKey: ['os-server-channels', selectedServerSlug],
    queryFn: () => fetchApi<ChannelMeta[]>(`/api/servers/${selectedServerSlug}/channels`),
    enabled: canUseMemberServerApis,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })
  const osPageTitle = useMemo(() => {
    const serverName = selectedServer?.server.name.trim()
    if (!serverName) return undefined

    const focusedWindow = windows.find((item) => item.id === focusedWindowId && !item.minimized)
    const activeChannelTab = openChannelTabs.find((item) => item.id === activeChannelTabId)
    const activeChannelId = routeSearch.channel ?? activeChannelTab?.channelId
    const activeChannelTitle =
      channels.find((channel) => channel.id === activeChannelId)?.name.trim() ??
      activeChannelTab?.title.trim()
    const focusedWindowTitle = focusedWindow?.title.trim()
    const contextTitle = routeSearch.channel
      ? activeChannelTitle
        ? `#${activeChannelTitle}`
        : undefined
      : routeSearch.app || routeSearch.builtin
        ? focusedWindowTitle
        : (focusedWindowTitle ?? (activeChannelTitle ? `#${activeChannelTitle}` : undefined))

    return contextTitle ? `${contextTitle} · ${serverName}` : serverName
  }, [
    activeChannelTabId,
    channels,
    focusedWindowId,
    openChannelTabs,
    routeSearch.app,
    routeSearch.builtin,
    routeSearch.channel,
    selectedServer?.server.name,
    windows,
  ])
  useAppStatus({
    title: osPageTitle,
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  const { data: serverMembers = EMPTY_SERVER_MEMBERS } = useQuery({
    queryKey: ['os-server-members', selectedServerSlug],
    queryFn: () => fetchApi<OsServerMember[]>(`/api/servers/${selectedServerSlug}/members`),
    enabled: canUseMemberServerApis,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: apps = EMPTY_SPACE_APP_INSTALLATIONS, isLoading: isAppsLoading } = useQuery({
    queryKey: ['os-space-apps', selectedServerSlug, i18n.language],
    queryFn: () =>
      fetchApi<SpaceAppInstallation[]>(`/api/servers/${selectedServerSlug}/space-apps`),
    enabled: canUseMemberServerApis,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: widgetCatalog = [] } = useQuery({
    queryKey: ['os-server-widgets', selectedServerSlug, i18n.language],
    queryFn: () =>
      fetchApi<OsRemoteWidgetCatalogEntry[]>(`/api/servers/${selectedServerSlug}/widgets`),
    enabled: canUseMemberServerApis,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: inboxes = EMPTY_BUDDY_INBOXES, isLoading: isInboxesLoading } = useQuery({
    queryKey: ['os-server-inboxes', selectedServerSlug],
    queryFn: () => fetchApi<BuddyInboxEntry[]>(`/api/servers/${selectedServerSlug}/inboxes`),
    enabled: canUseMemberServerApis,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: osWorkspace } = useQuery({
    queryKey: ['workspace', selectedServerSlug],
    queryFn: () => fetchApi<WorkspaceInfo>(`/api/servers/${selectedServerSlug}/workspace`),
    enabled: canUseMemberServerApis,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: osWorkspaceTree = EMPTY_WORKSPACE_NODES } = useQuery({
    queryKey: ['os-workspace-root', selectedServerSlug],
    queryFn: () => fetchApi<WorkspaceNode[]>(`/api/servers/${selectedServerSlug}/workspace/tree`),
    enabled: canUseMemberServerApis,
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const workspaceRootNodes = useMemo(
    () =>
      osWorkspaceTree
        .filter((node) => node.parentId === null)
        .sort((left, right) => left.pos - right.pos || left.name.localeCompare(right.name)),
    [osWorkspaceTree],
  )
  const workspaceNodes = useMemo(() => flattenWorkspaceNodes(osWorkspaceTree), [osWorkspaceTree])
  const workspaceNodeById = useMemo(
    () => new Map(workspaceNodes.map((node) => [node.id, node])),
    [workspaceNodes],
  )

  const { data: scopedUnread } = useQuery({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
    staleTime: 5_000,
    refetchInterval: 15_000,
  })

  const mergedScopedUnread = useMemo<ScopedUnread>(() => {
    const channelUnread = { ...(scopedUnread?.channelUnread ?? {}) }
    for (const [channelId, count] of Object.entries(localMessageUnread)) {
      if (count > 0) channelUnread[channelId] = (channelUnread[channelId] ?? 0) + count
    }
    return {
      ...scopedUnread,
      channelUnread,
    }
  }, [localMessageUnread, scopedUnread])

  const ensureInbox = useMutation({
    mutationFn: async (entry: BuddyInboxEntry) => {
      if (entry.channel) return entry.channel
      const result = await fetchApi<{ channel: ChannelMeta }>(
        `/api/servers/${selectedServerSlug}/inboxes/${entry.agent.id}`,
        { method: 'POST' },
      )
      return result.channel
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', selectedServerSlug] })
      queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', selectedServerSlug] })
      queryClient.invalidateQueries({ queryKey: ['channels', selectedServerSlug] })
    },
    onError: (error: Error) => showToast(error.message || t('common.unknown'), 'error'),
  })
  const ensureInboxMutateAsyncRef = useRef(ensureInbox.mutateAsync)
  ensureInboxMutateAsyncRef.current = ensureInbox.mutateAsync

  const desktopChannels = useMemo(
    () => channels.filter((channel) => channel.isArchived !== true).sort(channelSort),
    [channels],
  )
  const activeChannels = useMemo(() => desktopChannels.slice(0, 24), [desktopChannels])
  const stickyNoteMentionContext = useMemo<OsStickyNoteMentionContext>(
    () => ({
      workspaceNodes,
      apps,
      channels: activeChannels,
      members: serverMembers,
    }),
    [activeChannels, apps, serverMembers, workspaceNodes],
  )

  const rawTopAppWindows = useMemo(
    () => windows.filter((item) => item.kind === 'app').map((item) => item.appKey),
    [windows],
  )
  const topAppWindows = useStableArray(rawTopAppWindows)
  const rawActiveBuiltinWindowKeys = useMemo(
    () =>
      windows
        .flatMap((item) => (item.kind === 'builtin' && item.builtinKey ? [item.builtinKey] : []))
        .sort(),
    [windows],
  )
  const activeBuiltinWindowKeys = useStableArray(rawActiveBuiltinWindowKeys)
  const activeBuiltinWindows = useMemo(
    () => new Set(activeBuiltinWindowKeys),
    [activeBuiltinWindowKeys],
  )
  const builtinDockApps = useMemo(
    () => [
      {
        key: 'workspace' as const,
        label: t('os.workspaceApp'),
        icon: <OsBuiltinAppIcon appKey="workspace" />,
      },
      {
        key: 'discover' as const,
        label: t('os.discoverApp'),
        icon: <OsBuiltinAppIcon appKey="discover" />,
      },
      {
        key: 'app-store' as const,
        label: t('os.appStoreApp'),
        icon: <OsBuiltinAppIcon appKey="app-store" />,
      },
      {
        key: 'shop' as const,
        label: t('os.shopApp'),
        icon: <OsBuiltinAppIcon appKey="shop" />,
      },
      {
        key: 'settings' as const,
        label: t('settings.sectionSettings'),
        icon: <OsBuiltinAppIcon appKey="settings" />,
      },
      {
        key: 'cloud-computers' as const,
        label: t('os.cloudComputersApp'),
        icon: <OsBuiltinAppIcon appKey="cloud-computers" />,
      },
      {
        key: 'my-buddies' as const,
        label: t('os.myBuddiesApp'),
        icon: <OsBuiltinAppIcon appKey="my-buddies" />,
      },
      {
        key: 'contacts' as const,
        label: t('os.contactsApp'),
        icon: <OsBuiltinAppIcon appKey="contacts" />,
      },
    ],
    [t],
  )

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', selectedServerSlug] })
    queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', selectedServerSlug] })
  })

  const recordOsMessageActivity = useCallback(
    (event: { id?: string; channelId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', selectedServerSlug] })
      queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', selectedServerSlug] })
      const channelId = event.channelId
      if (!channelId) return
      const activeChannelId = openChannelTabs.find(
        (item) => item.id === activeChannelTabId,
      )?.channelId
      if (channelId === activeChannelId) return
      if (event.id) {
        if (localUnreadEventIdsRef.current.has(event.id)) return
        localUnreadEventIdsRef.current.add(event.id)
        if (localUnreadEventIdsRef.current.size > 300) {
          localUnreadEventIdsRef.current = new Set([...localUnreadEventIdsRef.current].slice(-150))
        }
      }
      setLocalMessageUnread((current) => ({
        ...current,
        [channelId]: (current[channelId] ?? 0) + 1,
      }))
    },
    [activeChannelTabId, openChannelTabs, queryClient, selectedServerSlug],
  )

  useSocketEvent<{ id?: string; channelId?: string }>('message:new', recordOsMessageActivity)
  useSocketEvent<{ id?: string; channelId?: string }>('message:created', recordOsMessageActivity)

  useEffect(() => {
    if (requestedServerKey) {
      if (requestedServerEntry) {
        if (requestedServerEntry.server.id !== selectedServerId) {
          setSelectedServerId(requestedServerEntry.server.id)
        }
        return
      }
      if (!isServersLoading && !isRequestedServerLoading && selectedServerId) {
        setSelectedServerId(null)
      }
      return
    }
    const firstServer = preferredInitialServer
    if (!firstServer) return
    const nextServerId = selectedServerId ?? firstServer.server.id
    if (nextServerId && nextServerId !== selectedServerId) {
      setSelectedServerId(nextServerId)
    }
  }, [
    isServersLoading,
    isRequestedServerLoading,
    requestedServerEntry,
    requestedServerKey,
    preferredInitialServer,
    selectedServerId,
    servers,
  ])

  useEffect(() => {
    if (!selectedServerSlug) return
    try {
      window.localStorage.setItem(LAST_OS_SPACE_STORAGE_KEY, selectedServerSlug)
    } catch {
      // Ignore storage failures; the route still works without a remembered space.
    }
  }, [selectedServerSlug])

  const exitOs = useCallback(() => {
    if (!selectedServerSlug) {
      navigate({ to: '/discover' })
      return
    }
    navigate({ to: '/servers/$serverSlug', params: { serverSlug: selectedServerSlug } })
  }, [navigate, selectedServerSlug])

  const selectServer = useCallback(
    (serverId: string) => {
      const entry = servers.find((candidate) => candidate.server.id === serverId)
      setSelectedServerId(serverId)
      navigate({
        to: '/spaces/$serverIdOrSlug',
        params: { serverIdOrSlug: entry ? serverRouteKey(entry.server) : serverId },
        replace: true,
      })
    },
    [navigate, servers],
  )

  const navigateToOsContext = useCallback(
    (
      context:
        | { app: string; appPath?: string | null }
        | { builtin: OsBuiltinAppKey; buddyDirectChannelId?: string | null }
        | { channel: string }
        | null,
    ) => {
      if (!selectedServerSlug) return
      navigate({
        to: '/spaces/$serverIdOrSlug',
        params: { serverIdOrSlug: selectedServerSlug },
        search: {
          ...(context && 'app' in context ? { app: context.app } : {}),
          ...(context && 'app' in context && context.appPath && context.appPath !== '/'
            ? { appPath: context.appPath }
            : {}),
          ...(context && 'builtin' in context ? { builtin: context.builtin } : {}),
          ...(context && 'buddyDirectChannelId' in context && context.buddyDirectChannelId
            ? { dm: context.buddyDirectChannelId }
            : {}),
          ...(context && 'channel' in context ? { channel: context.channel } : {}),
          ...(routeSearch.tour ? { tour: routeSearch.tour } : {}),
        },
        replace: true,
      })
    },
    [navigate, routeSearch.tour, selectedServerSlug],
  )

  useEffect(() => {
    if (routeSearch.tour !== 'space-setup' || !selectedServer) return
    setSetupTourStep((current) => current ?? 0)
  }, [routeSearch.tour, selectedServer])

  const clearSetupTourSearch = useCallback(() => {
    if (!selectedServerSlug) return
    navigate({
      to: '/spaces/$serverIdOrSlug',
      params: { serverIdOrSlug: selectedServerSlug },
      search: {
        ...(routeSearch.app ? { app: routeSearch.app } : {}),
        ...(routeSearch.app && routeSearch.appPath ? { appPath: routeSearch.appPath } : {}),
        ...(routeSearch.builtin ? { builtin: routeSearch.builtin } : {}),
        ...(routeSearch.channel ? { channel: routeSearch.channel } : {}),
        ...(routeSearch.dm ? { dm: routeSearch.dm } : {}),
      },
      replace: true,
    })
  }, [
    navigate,
    routeSearch.app,
    routeSearch.appPath,
    routeSearch.builtin,
    routeSearch.channel,
    routeSearch.dm,
    selectedServerSlug,
  ])

  const closeSetupTour = useCallback(() => {
    setSetupTourStep(null)
    clearSetupTourSearch()
  }, [clearSetupTourSearch])

  const advanceSetupTour = useCallback(() => {
    setSetupTourStep((current) => {
      if (current === null) return current
      if (current >= SETUP_TOUR_STEPS.length - 1) {
        window.setTimeout(closeSetupTour, 0)
        return current
      }
      return current + 1
    })
  }, [closeSetupTour])

  const joinPromptServer = selectedServer?.server ?? requestedServerAccess?.server ?? null
  const joinPromptServerRouteKey = serverRouteKey(joinPromptServer)
  const requestSpaceAccess = useMutation({
    mutationFn: () =>
      fetchApi<{ ok: boolean; status: 'approved' | 'pending'; requestId?: string }>(
        `/api/servers/${encodeURIComponent(joinPromptServerRouteKey)}/join-requests`,
        { method: 'POST' },
      ),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['servers'] }),
        queryClient.invalidateQueries({ queryKey: ['os-space-access'] }),
      ])
      if (result.status === 'approved') {
        setShowJoinPrompt(false)
      }
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
    },
  })
  const promptJoinSpace = useCallback(() => {
    setShowJoinPrompt(true)
  }, [])
  const joinPromptPending =
    requestedServerAccess?.joinRequestStatus === 'pending' ||
    requestSpaceAccess.data?.status === 'pending'

  const createChannel = useMutation({
    mutationFn: (input: { name: string; type: ChannelCreateType; isPrivate: boolean }) =>
      fetchApi<ChannelMeta>(`/api/servers/${selectedServerSlug}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name: input.name, type: input.type, isPrivate: input.isPrivate }),
      }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['os-server-channels', selectedServerSlug] })
      queryClient.invalidateQueries({ queryKey: ['channels', selectedServerSlug] })
      pinChannelToDesktopRef.current?.(channel, pendingChannelDesktopPointRef.current ?? undefined)
      pendingChannelDesktopPointRef.current = null
      openChannelWindow(channel)
      navigateToOsContext({ channel: channel.id })
    },
    onError: (error) => {
      pendingChannelDesktopPointRef.current = null
      showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
    },
  })
  const createChannelMutateRef = useRef(createChannel.mutate)
  createChannelMutateRef.current = createChannel.mutate

  const createOsChannel = useCallback(
    (
      input: { name: string; type: ChannelCreateType; isPrivate: boolean },
      point?: { x: number; y: number },
    ) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      pendingChannelDesktopPointRef.current = point ?? null
      createChannelMutateRef.current(input)
    },
    [promptJoinSpace, selectedServerIsGuest],
  )

  const openAppWindow = useCallback(
    (app: SpaceAppInstallation, appPath?: string | null) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      openWindow({
        kind: 'app',
        targetId: app.appKey,
        appKey: app.appKey,
        appPath,
        iconUrl: app.iconUrl,
        title: app.name,
        subtitle: t('os.applicationWindow'),
      })
      navigateToOsContext({ app: app.appKey, appPath })
    },
    [navigateToOsContext, openWindow, promptJoinSpace, selectedServerIsGuest, t],
  )

  const openBuiltinWindow = useCallback(
    (
      key: OsBuiltinAppKey,
      options: {
        workspaceNode?: WorkspaceNode
        settingsTab?: SettingsModalTab
        cloudComputerId?: string
        buddySection?: 'messages' | 'buddies' | 'market'
        buddyDirectChannelId?: string | null
        buddyAgentId?: string | null
      } = {},
    ) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      const titleKey =
        key === 'workspace'
          ? 'os.workspaceApp'
          : key === 'app-store'
            ? 'os.appStoreApp'
            : key === 'shop'
              ? 'os.shopApp'
              : key === 'settings'
                ? 'settings.sectionSettings'
                : key === 'server-settings'
                  ? 'channel.serverSettings'
                  : key === 'cloud-computers'
                    ? 'os.cloudComputersApp'
                    : key === 'discover'
                      ? 'os.discoverApp'
                      : key === 'my-buddies'
                        ? 'os.myBuddiesApp'
                        : key === 'contacts'
                          ? 'os.contactsApp'
                          : key === 'tasks'
                            ? 'settings.tabTasks'
                            : key === 'wallet'
                              ? 'settings.tabWallet'
                              : 'settings.menuViewProfile'
      openWindow({
        kind: 'builtin',
        targetId: key,
        builtinKey: key,
        workspaceNode: options.workspaceNode,
        settingsTab: options.settingsTab,
        cloudComputerId: options.cloudComputerId,
        buddySection: options.buddySection,
        buddyDirectChannelId: options.buddyDirectChannelId,
        buddyAgentId: options.buddyAgentId,
        title: t(titleKey),
        subtitle: t('os.applicationWindow'),
      })
      navigateToOsContext({
        builtin: key,
        buddyDirectChannelId: options.buddyDirectChannelId,
      })
    },
    [navigateToOsContext, openWindow, promptJoinSpace, selectedServerIsGuest, t],
  )

  const openSettingsWindow = useCallback(
    (tab: SettingsModalTab = 'profile') => {
      openBuiltinWindow('settings', { settingsTab: tab })
    },
    [openBuiltinWindow],
  )

  const openProfileWindow = useCallback(() => {
    if (selectedServerIsGuest) {
      promptJoinSpace()
      return
    }
    if (!user?.id) return
    const displayName = user.displayName || user.username || t('common.unknownUser')
    openWindow({
      kind: 'builtin',
      targetId: `profile:${user.id}`,
      builtinKey: 'profile',
      profileUserId: user.id,
      iconUrl: user.avatarUrl,
      title: displayName,
      subtitle: t('settings.menuViewProfile'),
    })
    navigateToOsContext({ builtin: 'profile' })
  }, [
    navigateToOsContext,
    openWindow,
    promptJoinSpace,
    selectedServerIsGuest,
    t,
    user?.avatarUrl,
    user?.displayName,
    user?.id,
    user?.username,
  ])

  const openServerMemberProfileWindow = useCallback(
    (member: OsServerMember) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      const profileUserId = member.user?.id ?? member.userId
      const displayName =
        member.nickname?.trim() ||
        member.user?.displayName?.trim() ||
        member.user?.username ||
        profileUserId
      openWindow({
        kind: 'builtin',
        targetId: `profile:${profileUserId}`,
        builtinKey: 'profile',
        profileUserId,
        iconUrl: member.user?.avatarUrl,
        title: displayName,
        subtitle: t('settings.menuViewProfile'),
      })
      navigateToOsContext({ builtin: 'profile' })
    },
    [navigateToOsContext, openWindow, promptJoinSpace, selectedServerIsGuest, t],
  )

  const openWorkspaceFileWindow = useCallback(
    (node: WorkspaceNode) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      openWindow({
        kind: 'workspace-file',
        targetId: node.id,
        workspaceNode: node,
        title: node.name,
        subtitle: t('os.workspaceFileWindow'),
      })
      navigateToOsContext(null)
    },
    [navigateToOsContext, openWindow, promptJoinSpace, selectedServerIsGuest, t],
  )

  const openWorkspaceDesktopNode = useCallback(
    (node: WorkspaceNode) => {
      if (node.kind === 'file') {
        openWorkspaceFileWindow(node)
        return
      }
      openBuiltinWindow('workspace', { workspaceNode: node })
    },
    [openBuiltinWindow, openWorkspaceFileWindow],
  )

  const openWorkspaceResourceFromBridge = useCallback(
    async (input: { workspaceFileId?: string; workspaceNodeId?: string }) => {
      const nodeId = input.workspaceNodeId ?? input.workspaceFileId
      const node = nodeId ? workspaceNodeById.get(nodeId) : null
      if (!node || node.kind !== 'file') return false
      openWorkspaceFileWindow(node)
      return true
    },
    [openWorkspaceFileWindow, workspaceNodeById],
  )

  const openChannelWindowForAccess = useCallback(
    (channel: ChannelMeta) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      openChannelWindow(channel)
      navigateToOsContext({ channel: channel.id })
    },
    [navigateToOsContext, openChannelWindow, promptJoinSpace, selectedServerIsGuest],
  )

  const activateVoiceScreenWindow = useCallback(() => {
    const channel = connectedVoiceChannel
    if (!channel || (!voice.localScreenTrack && voice.remoteScreens.length === 0)) return
    openWindow({
      kind: 'voice-screen',
      targetId: channel.id,
      channelId: channel.id,
      title: `${channel.name} · ${t('voice.shareScreen')}`,
      subtitle: t('os.voiceChannelWindow'),
    })
    navigateToOsContext({ channel: channel.id })
  }, [
    connectedVoiceChannel,
    navigateToOsContext,
    openWindow,
    t,
    voice.localScreenTrack,
    voice.remoteScreens.length,
  ])

  const openDirectMessageWindow = useCallback(
    (input: {
      channelId: string
      peerUserId?: string
      title?: string
      iconUrl?: string | null
    }) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      openWindow(
        myBuddyMessageWindowInput(input.channelId, {
          title: t('os.myBuddiesApp'),
          subtitle: t('os.applicationWindow'),
        }),
      )
      navigateToOsContext(null)
    },
    [navigateToOsContext, openWindow, promptJoinSpace, selectedServerIsGuest, t],
  )

  const syncOsWindowRoute = useCallback(
    (item: OsWindowState | undefined) => {
      if (!item) {
        navigateToOsContext(null)
        return
      }
      if (item.kind === 'app' && item.appKey) {
        navigateToOsContext({ app: item.appKey, appPath: item.appPath })
        return
      }
      if (item.kind === 'builtin' && item.builtinKey) {
        navigateToOsContext({
          builtin: item.builtinKey,
          buddyDirectChannelId: item.buddyDirectChannelId,
        })
        return
      }
      if ((item.kind === 'channel' || item.kind === 'voice-screen') && item.channelId) {
        navigateToOsContext({ channel: item.channelId })
        return
      }
      navigateToOsContext(null)
    },
    [navigateToOsContext],
  )

  const focusOsWindow = useCallback(
    (id: string) => {
      focusWindow(id)
      syncOsWindowRoute(osWindowsRef.current.find((item) => item.id === id))
    },
    [focusWindow, syncOsWindowRoute],
  )

  const closeOsWindow = useCallback(
    (id: string) => {
      closeWindow(id)
      if (osFocusedWindowIdRef.current === id) navigateToOsContext(null)
    },
    [closeWindow, navigateToOsContext],
  )

  const minimizeOsWindow = useCallback(
    (id: string) => {
      minimizeWindow(id)
      if (osFocusedWindowIdRef.current === id) navigateToOsContext(null)
    },
    [minimizeWindow, navigateToOsContext],
  )

  const focusOsChannelTab = useCallback(
    (id: string | null) => {
      focusChannelTab(id)
      const tab = id ? osOpenChannelTabsRef.current.find((item) => item.id === id) : null
      navigateToOsContext(tab ? { channel: tab.channelId } : null)
    },
    [focusChannelTab, navigateToOsContext],
  )

  const closeOsChannelTab = useCallback(
    (id: string) => {
      closeChannelTab(id)
      if (osActiveChannelTabIdRef.current === id) navigateToOsContext(null)
    },
    [closeChannelTab, navigateToOsContext],
  )

  const updateOsAppWindowRoute = useCallback(
    (id: string, appPath: string) => {
      updateAppWindowRoute(id, appPath)
      const item = osWindowsRef.current.find((candidate) => candidate.id === id)
      if (
        item?.appKey &&
        (osFocusedWindowIdRef.current === id || routeAppKeyRef.current === item.appKey)
      ) {
        navigateToOsContext({ app: item.appKey, appPath })
      }
    },
    [navigateToOsContext, updateAppWindowRoute],
  )

  useEffect(() => {
    if (
      !effectiveSelectedServerId ||
      restoredWindowServerId !== effectiveSelectedServerId ||
      restoredContextSyncedRef.current === effectiveSelectedServerId
    ) {
      return
    }
    if (routeSearch.app || routeSearch.builtin || routeSearch.channel) {
      restoredContextSyncedRef.current = effectiveSelectedServerId
      return
    }

    const focused = windows.find((item) => item.id === focusedWindowId && !item.minimized)
    if (focused) {
      if (
        (focused.kind === 'app' && focused.appKey) ||
        (focused.kind === 'builtin' && focused.builtinKey) ||
        (focused.kind === 'voice-screen' && focused.channelId)
      ) {
        syncOsWindowRoute(focused)
        restoredContextSyncedRef.current = effectiveSelectedServerId
      }
      return
    }

    const activeTab = openChannelTabs.find((item) => item.id === activeChannelTabId)
    if (activeTab) {
      navigateToOsContext({ channel: activeTab.channelId })
      restoredContextSyncedRef.current = effectiveSelectedServerId
    }
  }, [
    activeChannelTabId,
    effectiveSelectedServerId,
    focusedWindowId,
    navigateToOsContext,
    openChannelTabs,
    routeSearch.app,
    routeSearch.builtin,
    routeSearch.channel,
    restoredWindowServerId,
    syncOsWindowRoute,
    windows,
  ])

  const openChannelFromBridge = useCallback(
    async (input: { channelId: string; messageId?: string }) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return false
      }
      try {
        const channel =
          channels.find((candidate) => candidate.id === input.channelId) ??
          (await fetchApi<ChannelMeta>(`/api/channels/${encodeURIComponent(input.channelId)}`))
        openChannelWindowForAccess(channel)
        return true
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
        return false
      }
    },
    [channels, openChannelWindowForAccess, promptJoinSpace, selectedServerIsGuest, t],
  )

  const {
    desktopItems,
    desktopWidgets,
    pinWorkspaceFileToDesktop,
    moveDesktopFile,
    hideDesktopItem,
    uploadDesktopFiles,
    renameDesktopWorkspaceNode,
    copyDesktopWorkspaceNode,
    cutDesktopWorkspaceNode,
    pasteDesktopWorkspaceNodes,
    cloneDesktopWorkspaceFile,
    deleteDesktopWorkspaceNode,
    setDesktopWorkspaceWallpaper,
    createStickyNoteWidget,
    createChatInputWidget,
    createTypewriterWidget,
    createPhotoWidget,
    createVideoWidget,
    createWebEmbedWidget,
    createRemoteWidget,
    moveDesktopWidget,
    resizeDesktopWidget,
    rotateDesktopWidget,
    changeDesktopWidgetLayer,
    updateStickyNoteWidget,
    updateChatInputWidget,
    updateTypewriterWidget,
    updatePhotoWidget,
    updateVideoWidget,
    updateWebEmbedWidget,
    updateRemoteWidget,
    deleteDesktopWidget,
    pinBuiltinAppToDesktop,
    pinSpaceAppToDesktop,
    pinChannelToDesktop,
    pinBuddyInboxToDesktop,
    hideBuddyInboxFromDesktop,
  } = useOsDesktopLayout({
    apps,
    channels: desktopChannels,
    inboxes,
    canManageDesktopLayout,
    osWorkspace,
    queryClient,
    selectedServerDesktopLayout,
    selectedServerDesktopLayoutKey,
    selectedServerId,
    selectedServerSlug,
    setRenamingWorkspaceNodeId,
    setWorkspaceClipboard,
    t,
    workspaceClipboard,
    workspaceNodeById,
    workspaceRootNodes,
  })
  pinChannelToDesktopRef.current = pinChannelToDesktop
  pinBuddyInboxToDesktopRef.current = pinBuddyInboxToDesktop

  const openDesktopSpaceApp = useCallback(
    (appKey: string) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      const app = apps.find((candidate) => candidate.appKey === appKey)
      if (app) openAppWindow(app)
    },
    [apps, openAppWindow, promptJoinSpace, selectedServerIsGuest],
  )

  const desktopInboxAgentIds = useMemo(
    () =>
      new Set(
        desktopItems.flatMap((item) => (item.kind === 'buddy-inbox' ? [item.inbox.agent.id] : [])),
      ),
    [desktopItems],
  )

  const createChannelFromDesktop = useCallback(
    (point: { x: number; y: number }) => {
      createOsChannel(
        {
          name: t('os.quickChannelName', { count: activeChannels.length + 1 }),
          type: 'text',
          isPrivate: false,
        },
        point,
      )
    },
    [activeChannels.length, createOsChannel, t],
  )

  const createBuddyFromDesktop = useCallback(
    (point: { x: number; y: number }, options: { initialTarget?: CreateBuddyTarget } = {}) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      pendingBuddyDesktopPointRef.current = point
      buddyCreatorResolverRef.current?.(null)
      setBuddyCreatorRequest({
        initialTarget: options.initialTarget,
        landing: {
          title: t('os.quickBuddyLandingTitle'),
          description: t('os.quickBuddyLandingDesc'),
        },
      })
    },
    [promptJoinSpace, selectedServerIsGuest, t],
  )

  const createAppFromDesktop = useCallback(
    (_point: { x: number; y: number }) => {
      openBuiltinWindow('app-store')
    },
    [openBuiltinWindow],
  )

  const setupTourActions = useMemo(() => {
    if (setupTourStep === null) return []
    const baseIndex = desktopItems.length
    if (setupTourStep === 0) {
      return [
        {
          label: t('os.setupTourActionAddWidget'),
          onClick: () => createChatInputWidget(defaultDesktopFilePosition(baseIndex)),
          advanceOnClick: true,
        },
      ]
    }
    if (setupTourStep === 1) {
      return [
        {
          label: t('os.setupTourActionCreateChannel'),
          onClick: () => createChannelFromDesktop(defaultDesktopFilePosition(baseIndex)),
          advanceOnClick: true,
        },
      ]
    }
    if (setupTourStep === 2) {
      return [
        {
          label: t('os.setupTourActionCreateBuddy'),
          onClick: () =>
            createBuddyFromDesktop(defaultDesktopFilePosition(baseIndex), {
              initialTarget: 'cloud',
            }),
        },
      ]
    }
    return [
      {
        label: t('os.setupTourActionOpenApps'),
        onClick: () => createAppFromDesktop(defaultDesktopFilePosition(baseIndex)),
        advanceOnClick: true,
      },
    ]
  }, [
    createAppFromDesktop,
    createBuddyFromDesktop,
    createChannelFromDesktop,
    createChatInputWidget,
    desktopItems.length,
    setupTourStep,
    t,
  ])

  const openStickyNoteMentionTarget = useCallback(
    (target: OsStickyNoteMentionTarget) => {
      if (target.kind === 'workspace-node') {
        if (target.node.kind === 'file') {
          openWorkspaceFileWindow(target.node)
          return
        }
        openBuiltinWindow('workspace', { workspaceNode: target.node })
        return
      }
      if (target.kind === 'space-app') {
        openAppWindow(target.app)
        return
      }
      if (target.kind === 'channel') {
        openChannelWindowForAccess(target.channel)
        return
      }
      openServerMemberProfileWindow(target.member)
    },
    [
      openAppWindow,
      openBuiltinWindow,
      openChannelWindowForAccess,
      openServerMemberProfileWindow,
      openWorkspaceFileWindow,
    ],
  )

  const openChatFileWindow = useCallback(
    (attachment: ChatAttachment) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      openWindow({
        kind: 'chat-file',
        targetId: attachment.id,
        attachment: {
          id: attachment.id,
          filename: attachment.filename,
          url: attachment.url,
          contentType: attachment.contentType,
          size: attachment.size,
          downloadUrl: attachment.url,
          paidFileId: attachment.paidFileId,
        },
        title: attachment.filename,
        subtitle: t('os.chatFileWindow'),
      })
      navigateToOsContext(null)
    },
    [navigateToOsContext, openWindow, promptJoinSpace, selectedServerIsGuest, t],
  )

  const openInboxChannel = useCallback(
    async (entry: BuddyInboxEntry) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return null
      }
      try {
        const channel = entry.channel ?? (await ensureInboxMutateAsyncRef.current(entry))
        if (channel?.id) {
          setLocalMessageUnread((current) => {
            if (!current[channel.id]) return current
            const next = { ...current }
            delete next[channel.id]
            return next
          })
        }
        return channel
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
        return null
      }
    },
    [promptJoinSpace, selectedServerIsGuest, t],
  )

  const openInboxFromBridge = useCallback(
    async (input: { agentId?: string; channelId?: string }) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return false
      }
      const entry = inboxes.find(
        (candidate) =>
          candidate.agent.id === input.agentId || candidate.channel?.id === input.channelId,
      )
      if (entry) {
        const channel = await openInboxChannel(entry)
        if (!channel) return false
        setInboxBubbleRequest({
          agentId: entry.agent.id,
          channelId: channel.id,
          nonce: Date.now(),
        })
        return true
      }
      if (input.agentId) {
        try {
          const result = await fetchApi<{ channel: ChannelMeta }>(
            `/api/servers/${selectedServerSlug}/inboxes/${input.agentId}`,
            { method: 'POST' },
          )
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', selectedServerSlug] }),
            queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', selectedServerSlug] }),
          ])
          setInboxBubbleRequest({
            agentId: input.agentId,
            channelId: result.channel.id,
            nonce: Date.now(),
          })
          return true
        } catch (error) {
          showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
          return false
        }
      }
      if (input.channelId) {
        setInboxBubbleRequest({ channelId: input.channelId, nonce: Date.now() })
        return true
      }
      return false
    },
    [
      inboxes,
      openInboxChannel,
      promptJoinSpace,
      queryClient,
      selectedServerIsGuest,
      selectedServerSlug,
      t,
    ],
  )

  const resolveSelectedServerUuid = useCallback(async () => {
    if (isUuid(selectedServer?.server.id)) return selectedServer.server.id
    if (isUuid(selectedServerSlug)) return selectedServerSlug
    const server = await fetchApi<ServerEntry['server']>(
      `/api/servers/${encodeURIComponent(selectedServerSlug)}`,
    )
    if (!isUuid(server.id)) throw new Error(t('common.error'))
    return server.id
  }, [selectedServer?.server.id, selectedServerSlug, t])

  const openBuddyCreatorFromBridge = useCallback(
    (request: BridgeBuddyCreatorRequest) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return Promise.resolve({ opened: false })
      }
      pendingBuddyDesktopPointRef.current = null
      buddyCreatorResolverRef.current?.(null)
      setBuddyCreatorRequest(request)
      return new Promise<{ opened: boolean; agent?: Agent }>((resolve, reject) => {
        buddyCreatorResolverRef.current = (agent) => {
          buddyCreatorResolverRef.current = null
          if (!agent) {
            reject(new Error('cancelled'))
            return
          }
          resolve({ opened: true, agent })
        }
      })
    },
    [promptJoinSpace, selectedServerIsGuest],
  )

  const closeBuddyCreator = useCallback(() => {
    buddyCreatorResolverRef.current?.(null)
    buddyCreatorResolverRef.current = null
    pendingBuddyDesktopPointRef.current = null
    setBuddyCreatorRequest(null)
  }, [])

  const handleBuddyCreatedFromBridge = useCallback(
    async (agent: Agent) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      if (!selectedServerSlug) {
        throw new Error(t('common.error'))
      }

      if (getAgentBuddyMode(agent) === 'private') {
        const serverUuid = await resolveSelectedServerUuid()
        const allowedServerIds = new Set(getAgentAllowedServerIds(agent).filter(isUuid))
        if (!allowedServerIds.has(serverUuid)) {
          allowedServerIds.add(serverUuid)
          await fetchApi<Agent>(`/api/agents/${agent.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              buddyMode: 'private',
              allowedServerIds: Array.from(allowedServerIds),
            }),
          })
        }
      }

      const serverAddResult = await fetchApi<AddAgentsResponse>(
        `/api/servers/${selectedServerSlug}/agents`,
        {
          method: 'POST',
          body: JSON.stringify({ agentIds: [agent.id] }),
        },
      )
      const parsed = parseAddAgentsResult(serverAddResult)
      if (parsed.failed.length > 0 && !parsed.added.includes(agent.id)) {
        throw new Error(parsed.failed[0]?.error || t('common.error'))
      }

      const inboxResult = await fetchApi<{ channel: ChannelMeta }>(
        `/api/servers/${selectedServerSlug}/inboxes/${agent.id}`,
        { method: 'POST' },
      )
      const botUser = agent.botUser ?? {
        id: agent.userId,
        username: agent.id,
        displayName: null,
        avatarUrl: null,
      }
      pinBuddyInboxToDesktopRef.current?.(
        {
          agent: {
            id: agent.id,
            ownerId: agent.ownerId,
            status: agent.status,
            lastHeartbeat: agent.lastHeartbeat,
            user: {
              id: botUser.id,
              username: botUser.username || agent.id,
              displayName: botUser.displayName,
              avatarUrl: botUser.avatarUrl ?? null,
            },
          },
          channel: inboxResult.channel,
          canManage: true,
        },
        pendingBuddyDesktopPointRef.current ?? undefined,
      )
      pendingBuddyDesktopPointRef.current = null

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['os-server-channels', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['channels', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['os-server-members', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['server-members', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['members', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['my-buddies-for-invite'] }),
        queryClient.invalidateQueries({ queryKey: ['agents'] }),
      ])
      buddyCreatorResolverRef.current?.(agent)
      buddyCreatorResolverRef.current = null
      setBuddyCreatorRequest(null)
      setSetupTourStep((current) => (current === 2 ? 3 : current))
    },
    [
      promptJoinSpace,
      queryClient,
      resolveSelectedServerUuid,
      selectedServerIsGuest,
      selectedServerSlug,
      t,
    ],
  )

  useEffect(() => {
    if (!selectedServerId) return
    const contextKey = JSON.stringify({
      app: routeSearch.app,
      appPath: routeSearch.appPath,
      builtin: routeSearch.builtin,
      channel: routeSearch.channel,
      dm: routeSearch.dm,
      server: selectedServerId,
    })
    if (initialContextOpenedRef.current === contextKey) return

    if (selectedServerIsGuest && (routeSearch.channel || routeSearch.app || routeSearch.builtin)) {
      promptJoinSpace()
      initialContextOpenedRef.current = contextKey
      return
    }

    if (routeSearch.channel) {
      const channel = channels.find((candidate) => candidate.id === routeSearch.channel)
      if (!channel) return
      openChannelWindowForAccess(channel)
      initialContextOpenedRef.current = contextKey
      return
    }

    if (routeSearch.app) {
      const app = apps.find((candidate) => candidate.appKey === routeSearch.app)
      if (!app) return
      openAppWindow(app, routeSearch.appPath)
      initialContextOpenedRef.current = contextKey
      return
    }

    if (
      typeof routeSearch.builtin === 'string' &&
      OS_BUILTIN_APP_KEYS.includes(routeSearch.builtin as OsBuiltinAppKey)
    ) {
      openBuiltinWindow(routeSearch.builtin, {
        buddySection:
          routeSearch.builtin === 'my-buddies' && routeSearch.dm ? 'messages' : undefined,
        buddyDirectChannelId: routeSearch.builtin === 'my-buddies' ? routeSearch.dm : undefined,
      })
      initialContextOpenedRef.current = contextKey
    }
  }, [
    apps,
    channels,
    openAppWindow,
    openBuiltinWindow,
    openChannelWindowForAccess,
    promptJoinSpace,
    routeSearch.app,
    routeSearch.appPath,
    routeSearch.builtin,
    routeSearch.channel,
    routeSearch.dm,
    selectedServerId,
    selectedServerIsGuest,
  ])

  useEffect(() => {
    const handleOsCommand = (event: Event) => {
      const detail = (event as CustomEvent<OsCommandDetail>).detail
      if (
        !detail ||
        typeof detail.serverId !== 'string' ||
        (detail.action !== 'open-server' &&
          detail.action !== 'open-channel' &&
          detail.action !== 'open-builtin' &&
          detail.action !== 'open-app' &&
          detail.action !== 'open-inbox' &&
          detail.action !== 'open-direct-message' &&
          detail.action !== 'open-buddy-settings')
      ) {
        return
      }
      if (detail.action === 'open-builtin' && !OS_BUILTIN_APP_KEYS.includes(detail.builtinKey)) {
        return
      }
      setPendingOsCommand(detail)
    }

    window.addEventListener('shadow:os-command', handleOsCommand)
    return () => window.removeEventListener('shadow:os-command', handleOsCommand)
  }, [])

  useEffect(() => {
    if (!pendingOsCommand) return
    const targetEntry = servers.find(
      (entry) =>
        entry.server.id === pendingOsCommand.serverId ||
        entry.server.slug === pendingOsCommand.serverSlug ||
        serverRouteKey(entry.server) === pendingOsCommand.serverSlug,
    )
    if (!targetEntry) return

    if (selectedServerId !== targetEntry.server.id) {
      selectServer(targetEntry.server.id)
      return
    }

    if (selectedServerIsGuest) {
      promptJoinSpace()
      setPendingOsCommand(null)
      return
    }

    if (pendingOsCommand.action === 'open-server') {
      setPendingOsCommand(null)
      return
    }

    if (pendingOsCommand.action === 'open-builtin') {
      openBuiltinWindow(pendingOsCommand.builtinKey)
      setPendingOsCommand(null)
      return
    }

    if (pendingOsCommand.action === 'open-app') {
      const app = apps.find((candidate) => candidate.appKey === pendingOsCommand.appKey)
      if (!app) return
      openAppWindow(app, pendingOsCommand.appPath)
      setPendingOsCommand(null)
      return
    }

    if (pendingOsCommand.action === 'open-inbox') {
      void openInboxFromBridge({
        agentId: pendingOsCommand.agentId,
        channelId: pendingOsCommand.channelId,
      }).finally(() => setPendingOsCommand(null))
      return
    }

    if (pendingOsCommand.action === 'open-direct-message') {
      openDirectMessageWindow({
        channelId: pendingOsCommand.channelId,
        peerUserId: pendingOsCommand.peerUserId,
        title: pendingOsCommand.title,
        iconUrl: pendingOsCommand.iconUrl,
      })
      setPendingOsCommand(null)
      return
    }

    if (pendingOsCommand.action === 'open-buddy-settings') {
      openBuiltinWindow('my-buddies', {
        buddySection: 'buddies',
        buddyAgentId: pendingOsCommand.agentId,
      })
      setPendingOsCommand(null)
      return
    }

    const channel = channels.find((candidate) => candidate.id === pendingOsCommand.channelId)
    if (!channel) {
      if (pendingOsCommand.action !== 'open-channel' || !pendingOsCommand.channelId) return
      void fetchApi<ChannelMeta>(`/api/channels/${pendingOsCommand.channelId}`)
        .then((fetchedChannel) => {
          if (fetchedChannel.topic?.startsWith('shadow:buddy-inbox:')) {
            setInboxBubbleRequest({
              channelId: fetchedChannel.id,
              nonce: Date.now(),
            })
          } else {
            openChannelWindowForAccess(fetchedChannel)
          }
          setPendingOsCommand(null)
        })
        .catch(() => {
          setPendingOsCommand(null)
        })
      return
    }

    const inbox = inboxes.find((entry) => entry.channel?.id === channel.id)
    if (inbox || channel.topic?.startsWith('shadow:buddy-inbox:')) {
      setInboxBubbleRequest({
        agentId: inbox?.agent.id,
        channelId: channel.id,
        nonce: Date.now(),
      })
      setPendingOsCommand(null)
      return
    }

    openChannelWindowForAccess(channel)
    setPendingOsCommand(null)
  }, [
    apps,
    channels,
    inboxes,
    openAppWindow,
    openBuiltinWindow,
    openInboxFromBridge,
    openDirectMessageWindow,
    openChannelWindowForAccess,
    pendingOsCommand,
    promptJoinSpace,
    selectServer,
    selectedServerId,
    selectedServerIsGuest,
    servers,
  ])

  const openDesktopInboxBubble = useCallback(
    (input: { agentId?: string; channelId?: string }) => {
      if (selectedServerIsGuest) {
        promptJoinSpace()
        return
      }
      setInboxBubbleRequest({ ...input, nonce: Date.now() })
    },
    [promptJoinSpace, selectedServerIsGuest],
  )

  const openWallpaperSettings = useCallback(() => {
    if (selectedServerIsGuest) {
      promptJoinSpace()
      return
    }
    setShowWallpaperSettings(true)
  }, [promptJoinSpace, selectedServerIsGuest])
  const openDesktopSettings = useCallback(() => {
    void getDesktopSettingsBridge()
      ?.showSettings?.('general')
      .catch(() => undefined)
  }, [])

  const {
    dockAppStackEntries,
    dockIconContextMenu,
    dockIconContextMenuGroups,
    openDockIconContextMenu,
    visibleBuiltinDockApps,
    visibleDockApps,
    setDockIconContextMenu,
  } = useOsDockState({
    apps,
    builtinDockApps,
    canManageDesktopLayout,
    focusedWindowId,
    t,
    windows,
    onFocusWindow: focusOsWindow,
    onOpenAppWindow: openAppWindow,
    onOpenBuiltinWindow: openBuiltinWindow,
    onPinBuiltinAppToDesktop: pinBuiltinAppToDesktop,
    onPinSpaceAppToDesktop: pinSpaceAppToDesktop,
  })
  const openSpaceContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setDockIconContextMenu(null)
      setSpaceContextMenu({ x: event.clientX, y: event.clientY })
    },
    [setDockIconContextMenu],
  )
  const handleOpenDockIconContextMenu = useCallback(
    (event: ReactMouseEvent, iconKey: string) => {
      setSpaceContextMenu(null)
      openDockIconContextMenu(event, iconKey)
    },
    [openDockIconContextMenu],
  )
  const spaceContextMenuGroups = useMemo<ContextMenuGroup[]>(() => {
    if (!selectedServer) return []
    const isOwner =
      selectedServer.member.role === 'owner' || selectedServer.server.ownerId === user?.id
    const actions = getOsSpaceContextMenuActions({
      canManage: canManageDesktopLayout,
      isGuest: selectedServerIsGuest,
      isOwner,
    })
    const primaryItems: ContextMenuGroup['items'] = []

    if (actions.includes('create-channel')) {
      primaryItems.push({
        icon: Plus,
        label: t('channel.createChannel'),
        onClick: () => setCreateChannelRequestNonce((current) => current + 1),
      })
    }
    if (actions.includes('add-buddy')) {
      primaryItems.push({
        icon: PawPrint,
        label: t('channel.addAgent'),
        onClick: () =>
          createBuddyFromDesktop(defaultDesktopFilePosition(desktopItems.length), {
            initialTarget: 'cloud',
          }),
      })
    }
    if (actions.includes('settings')) {
      primaryItems.push({
        icon: Settings,
        label: t('channel.serverSettings'),
        onClick: () => openBuiltinWindow('server-settings'),
      })
    }
    if (actions.includes('copy-id')) {
      primaryItems.push({
        icon: Copy,
        label: t('server.copyServerId'),
        onClick: async () => {
          await copyToClipboard(selectedServer.server.id, {
            successMessage: t('common.copied'),
            errorMessage: t('chat.copyFailed'),
          })
        },
      })
    }

    return [
      { items: primaryItems },
      ...(actions.includes('leave')
        ? [
            {
              items: [
                {
                  icon: LogOut,
                  label: t('server.leaveServer'),
                  danger: true,
                  disabled: leaveSpace.isPending,
                  onClick: async () => {
                    const ok = await useConfirmStore.getState().confirm({
                      title: t('server.leaveServer'),
                      message: t('server.leaveConfirm', { name: selectedServer.server.name }),
                    })
                    if (ok) leaveSpace.mutate(selectedServer.server.id)
                  },
                },
              ],
            },
          ]
        : []),
    ]
  }, [
    canManageDesktopLayout,
    createBuddyFromDesktop,
    desktopItems.length,
    leaveSpace,
    openBuiltinWindow,
    selectedServer,
    selectedServerIsGuest,
    t,
    user?.id,
  ])

  const channelMetaById = useMemo(
    () => new Map(activeChannels.map((channel) => [channel.id, channel])),
    [activeChannels],
  )
  const channelTabs = useMemo(
    () =>
      openChannelTabs.map((item) => {
        const meta = channelMetaById.get(item.channelId)
        return {
          ...item,
          title: meta ? meta.name : item.title,
          type: meta?.type ?? item.type,
          topic: meta?.topic ?? item.topic ?? null,
          active: item.id === activeChannelTabId,
        }
      }),
    [activeChannelTabId, channelMetaById, openChannelTabs],
  )
  const rawWorkspaceFileStack = useMemo(
    () => windows.filter((item) => item.kind === 'workspace-file' || item.kind === 'chat-file'),
    [windows],
  )
  const workspaceFileStack = useStableArray(rawWorkspaceFileStack)
  const rawMinimizedWindowStack = useMemo(
    () =>
      windows.filter(
        (item) =>
          item.minimized &&
          item.kind !== 'builtin' &&
          item.kind !== 'app' &&
          item.kind !== 'workspace-file' &&
          item.kind !== 'chat-file',
      ),
    [windows],
  )
  const minimizedWindowStack = useStableArray(rawMinimizedWindowStack)
  const appByKey = useMemo(() => new Map(apps.map((app) => [app.appKey, app])), [apps])
  const windowEdgeClassById = useWindowEdgeClassById(windows)
  const maximizedWindowId = useMemo(() => {
    let topmostWindow: OsWindowState | undefined
    for (const item of windows) {
      if (item.minimized || !item.maximized) continue
      if (!topmostWindow || item.z > topmostWindow.z) topmostWindow = item
    }
    return topmostWindow?.id ?? null
  }, [windows])
  const restoreMaximizedWindow = useCallback(() => {
    if (maximizedWindowId) toggleMaximizeWindow(maximizedWindowId)
  }, [maximizedWindowId, toggleMaximizeWindow])
  const builtinWindowContentRevision = useMemo(
    () => ({}),
    [apps, canManageDesktopLayout, isAppsLoading, selectedServer, user],
  )
  const hasInstalledDockApps = isAppsLoading || visibleDockApps.length > 0
  const hasQuickStacks =
    dockAppStackEntries.length > 0 ||
    workspaceFileStack.length > 0 ||
    minimizedWindowStack.length > 0
  const selectedServerWallpaper = useMemo(
    () =>
      selectedServer?.server.wallpaperUrl
        ? {
            type:
              selectedServer.server.wallpaperType === 'html'
                ? ('html' as const)
                : ('image' as const),
            url: selectedServer.server.wallpaperUrl,
            serverId: selectedServerSlug,
            workspaceFileId: selectedServer.server.wallpaperWorkspaceFileId ?? null,
            interactive: Boolean(
              selectedServer.server.wallpaperType === 'html' &&
                selectedServer.server.wallpaperInteractive,
            ),
          }
        : null,
    [
      selectedServer?.server.wallpaperInteractive,
      selectedServer?.server.wallpaperType,
      selectedServer?.server.wallpaperUrl,
      selectedServer?.server.wallpaperWorkspaceFileId,
      selectedServerSlug,
    ],
  )
  const floatingLayerZIndex = OS_FLOATING_LAYER_Z_INDEX
  const wallpaperInteractive = Boolean(selectedServerWallpaper?.interactive)
  const dockBar = selectedServer ? (
    <OsDockBar
      activeBuiltinWindows={activeBuiltinWindows}
      dockAppStackEntries={dockAppStackEntries}
      focusedWindowId={focusedWindowId}
      hasInstalledDockApps={hasInstalledDockApps}
      hasQuickStacks={hasQuickStacks}
      isAppsLoading={isAppsLoading}
      minimizedWindowStack={minimizedWindowStack}
      selectedServer={selectedServer}
      topAppWindows={topAppWindows}
      visibleBuiltinDockApps={visibleBuiltinDockApps}
      visibleDockApps={visibleDockApps}
      workspaceFileStack={workspaceFileStack}
      onFocusWindow={focusOsWindow}
      onOpenAppWindow={openAppWindow}
      onOpenBuiltinWindow={openBuiltinWindow}
      onOpenDesktopSettings={desktopSettingsBridge ? openDesktopSettings : undefined}
      onOpenDockIconContextMenu={handleOpenDockIconContextMenu}
      onOpenSpaceContextMenu={openSpaceContextMenu}
    />
  ) : null
  const isRequestedSpaceLoading =
    Boolean(requestedServerKey) && isRequestedServerLoading && !requestedServerEntry
  const isRequestedSpaceUnavailable =
    Boolean(requestedServerKey) && !selectedServer && !isServersLoading && !isRequestedServerLoading

  if ((isServersLoading && servers.length === 0) || isRequestedSpaceLoading) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#071018]">
        <OsBackground />
        <GlassPanel className="relative z-10 grid h-full place-items-center text-text-muted">
          <Loader2 size={20} className="animate-spin" />
        </GlassPanel>
      </div>
    )
  }

  if (!selectedServer && requestedServerAccess) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#071018]">
        <OsBackground />
        <header className="absolute left-0 right-0 top-0 z-[400] flex h-10 select-none items-center gap-2 border-b border-white/12 bg-black/30 px-3 text-white backdrop-blur-2xl">
          <OsAvatarMenu user={user} onExit={exitOs} />
        </header>
        <div className="relative z-10 flex h-full pt-10">
          <ServerLandingPanel
            server={requestedServerAccess.server}
            mode={requestedServerAccess.server.isPublic ? 'public' : 'private'}
            pending={!requestedServerAccess.server.isPublic && joinPromptPending}
            loading={requestSpaceAccess.isPending}
            onJoin={() => requestSpaceAccess.mutate()}
          />
        </div>
      </div>
    )
  }

  if (!selectedServer) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#071018]">
        <OsBackground />
        <header className="absolute left-0 right-0 top-0 z-[400] flex h-10 select-none items-center gap-2 border-b border-white/12 bg-black/30 px-3 text-white backdrop-blur-2xl">
          <OsAvatarMenu user={user} onExit={exitOs} />
        </header>
        <div className="relative z-10 grid h-full place-items-center px-6 text-center">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/14 bg-white/10 text-white/76">
              <Monitor size={24} />
            </div>
            <h1 className="mt-4 text-xl font-black text-white">
              {t(isRequestedSpaceUnavailable ? 'os.spaceUnavailableTitle' : 'os.emptyTitle')}
            </h1>
            <p className="mt-2 text-sm font-semibold text-white/64">
              {t(isRequestedSpaceUnavailable ? 'os.spaceUnavailableDesc' : 'os.emptyDesc')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#071018]">
      <OsBackground serverWallpaper={selectedServerWallpaper} />
      <OsTopBar
        selectedServer={selectedServer}
        selectedServerSlug={selectedServerSlug}
        servers={servers}
        maximizedWindowId={maximizedWindowId}
        channels={activeChannels}
        inboxes={inboxes}
        desktopInboxAgentIds={desktopInboxAgentIds}
        channelTabs={channelTabs}
        channelBubbleRequest={channelBubbleRequest}
        inboxBubbleRequest={inboxBubbleRequest}
        floatingLayerZIndex={floatingLayerZIndex}
        scopedUnread={mergedScopedUnread}
        isInboxesLoading={isInboxesLoading}
        isCreatingChannel={createChannel.isPending}
        createChannelRequestNonce={createChannelRequestNonce}
        user={user}
        onExit={exitOs}
        onSelectServer={selectServer}
        onFocusWindow={focusOsChannelTab}
        onCloseWindow={closeOsChannelTab}
        onCreateChannel={createOsChannel}
        onOpenChannelWindow={openChannelWindowForAccess}
        voiceScreenSharePresentation={activeVoiceScreenWindow ? 'detached' : 'inline'}
        onActivateVoiceScreenWindow={activateVoiceScreenWindow}
        onOpenInbox={openInboxChannel}
        onPreviewFile={openChatFileWindow}
        onOpenProfile={openProfileWindow}
        onOpenSettings={openSettingsWindow}
        onOpenBuddy={() => openBuiltinWindow('my-buddies')}
        onOpenTasks={() => openBuiltinWindow('tasks')}
        onOpenWallet={() => openBuiltinWindow('wallet')}
        onOpenShop={() => openBuiltinWindow('shop')}
        onOpenCloudComputers={(cloudComputerId) =>
          openBuiltinWindow('cloud-computers', { cloudComputerId })
        }
        onReorderChannelTab={reorderChannelTab}
        onPinInboxToDesktop={canManageDesktopLayout ? pinBuddyInboxToDesktop : undefined}
        onUnpinInboxFromDesktop={canManageDesktopLayout ? hideBuddyInboxFromDesktop : undefined}
        onRestoreMaximizedWindow={restoreMaximizedWindow}
      />

      <main
        className={cn(
          'desktop-os-main-surface absolute inset-0',
          wallpaperInteractive && 'pointer-events-none',
        )}
      >
        <div
          className={maximizedWindowId ? 'hidden' : 'contents'}
          data-desktop-surface={maximizedWindowId ? 'occluded' : 'visible'}
        >
          <OsDesktop
            items={desktopItems}
            widgets={desktopWidgets}
            widgetCatalog={widgetCatalog}
            inboxes={inboxes}
            canEditLayout={canManageDesktopLayout}
            serverId={selectedServerSlug}
            hasClipboard={Boolean(workspaceClipboard)}
            renamingNodeId={renamingWorkspaceNodeId}
            mentionContext={stickyNoteMentionContext}
            onOpenWorkspaceNode={openWorkspaceDesktopNode}
            onOpenBuiltinApp={openBuiltinWindow}
            onOpenSpaceApp={openDesktopSpaceApp}
            onOpenChannelWindow={openChannelWindowForAccess}
            onOpenMention={openStickyNoteMentionTarget}
            onPinWorkspaceNode={pinWorkspaceFileToDesktop}
            onMoveItem={moveDesktopFile}
            onHideItem={hideDesktopItem}
            onUploadFiles={uploadDesktopFiles}
            onStartRename={setRenamingWorkspaceNodeId}
            onRenameWorkspaceNode={renameDesktopWorkspaceNode}
            onCopyWorkspaceNode={copyDesktopWorkspaceNode}
            onCutWorkspaceNode={cutDesktopWorkspaceNode}
            onPasteWorkspaceNodes={pasteDesktopWorkspaceNodes}
            onCloneWorkspaceFile={cloneDesktopWorkspaceFile}
            onDeleteWorkspaceNode={deleteDesktopWorkspaceNode}
            onSetWorkspaceWallpaper={setDesktopWorkspaceWallpaper}
            onCreateChannelShortcut={createChannelFromDesktop}
            onCreateBuddyShortcut={createBuddyFromDesktop}
            onCreateAppShortcut={createAppFromDesktop}
            onCreateStickyNote={createStickyNoteWidget}
            onCreateChatInputWidget={createChatInputWidget}
            onCreateTypewriterWidget={createTypewriterWidget}
            onCreatePhotoWidget={createPhotoWidget}
            onCreateVideoWidget={createVideoWidget}
            onCreateWebEmbedWidget={createWebEmbedWidget}
            onCreateRemoteWidget={createRemoteWidget}
            onMoveWidget={moveDesktopWidget}
            onResizeWidget={resizeDesktopWidget}
            onRotateWidget={rotateDesktopWidget}
            onChangeWidgetLayer={changeDesktopWidgetLayer}
            onUpdateStickyNote={updateStickyNoteWidget}
            onUpdateChatInputWidget={updateChatInputWidget}
            onUpdateTypewriterWidget={updateTypewriterWidget}
            onUpdatePhotoWidget={updatePhotoWidget}
            onUpdateVideoWidget={updateVideoWidget}
            onUpdateWebEmbedWidget={updateWebEmbedWidget}
            onUpdateRemoteWidget={updateRemoteWidget}
            onDeleteWidget={deleteDesktopWidget}
            onOpenInboxBubble={openDesktopInboxBubble}
            onOpenWallpaperSettings={openWallpaperSettings}
            wallpaperInteractive={wallpaperInteractive}
          />
        </div>
        <OsWindowLayer
          windows={windows}
          focusedWindowId={focusedWindowId}
          maximizedWindowId={maximizedWindowId}
          serverSlug={selectedServerSlug}
          selectedServer={selectedServer}
          user={user}
          apps={apps}
          appByKey={appByKey}
          isAppsLoading={isAppsLoading}
          windowEdgeClassById={windowEdgeClassById}
          builtinWindowContentRevision={builtinWindowContentRevision}
          canPinWorkspaceFiles={canManageDesktopLayout}
          onCloseWindow={closeOsWindow}
          onFocusWindow={focusOsWindow}
          onMinimizeWindow={minimizeOsWindow}
          onToggleMaximizeWindow={toggleMaximizeWindow}
          onRestoreWindowForDrag={restoreWindowForDrag}
          onMoveWindow={moveWindow}
          onResizeWindow={resizeWindow}
          onPreviewFile={openChatFileWindow}
          onAppRouteChange={updateOsAppWindowRoute}
          onOpenChannel={openChannelFromBridge}
          onOpenInbox={openInboxFromBridge}
          onOpenBuddyCreator={openBuddyCreatorFromBridge}
          onOpenWorkspaceResource={openWorkspaceResourceFromBridge}
          onOpenApp={openAppWindow}
          onOpenWorkspaceFile={openWorkspaceFileWindow}
          onPinWorkspaceFile={pinWorkspaceFileToDesktop}
        />
      </main>

      <QuickCreateBuddyModal
        open={!!buddyCreatorRequest}
        onClose={closeBuddyCreator}
        onSuccess={handleBuddyCreatedFromBridge}
        initialTarget={buddyCreatorRequest?.initialTarget}
        landing={buddyCreatorRequest?.landing}
      />

      <SpaceJoinPromptModal
        open={showJoinPrompt}
        server={joinPromptServer}
        mode={joinPromptServer?.isPublic ? 'public' : 'private'}
        pending={!joinPromptServer?.isPublic && joinPromptPending}
        loading={requestSpaceAccess.isPending}
        onClose={() => setShowJoinPrompt(false)}
        onJoin={() => requestSpaceAccess.mutate()}
      />

      {setupTourStep !== null ? (
        <OsSetupTourBubble
          stepIndex={setupTourStep}
          actions={setupTourActions}
          onNext={advanceSetupTour}
          onSkip={closeSetupTour}
        />
      ) : null}

      {dockBar}
      {spaceContextMenu ? (
        <ContextMenu
          x={spaceContextMenu.x}
          y={spaceContextMenu.y}
          groups={spaceContextMenuGroups}
          minWidth={210}
          zIndex={OS_FLOATING_LAYER_Z_INDEX}
          onClose={() => setSpaceContextMenu(null)}
        />
      ) : null}
      {dockIconContextMenu ? (
        <ContextMenu
          x={dockIconContextMenu.x}
          y={dockIconContextMenu.y}
          groups={dockIconContextMenuGroups}
          minWidth={190}
          zIndex={OS_FLOATING_LAYER_Z_INDEX}
          onClose={() => setDockIconContextMenu(null)}
        />
      ) : null}

      <OsWallpaperSettingsModal
        open={showWallpaperSettings}
        serverSlug={selectedServerSlug}
        server={selectedServer.server}
        onClose={() => setShowWallpaperSettings(false)}
      />
    </div>
  )
}
