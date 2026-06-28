import { cn, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  AppWindow,
  EyeOff,
  Files,
  FileText,
  LayoutGrid,
  Loader2,
  Monitor,
  PanelBottom,
  Pin,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { QuickCreateBuddyModal } from '../components/buddy-management/quick-create-buddy-modal'
import type { Agent } from '../components/buddy-management/types'
import type { Attachment as ChatAttachment } from '../components/chat/message-bubble/types'
import { useConfirmStore } from '../components/common/confirm-dialog'
import { ContextMenu, type ContextMenuGroup } from '../components/common/context-menu'
import { ServerIcon } from '../components/server/server-icon'
import { useSocketEvent } from '../hooks/use-socket'
import { fetchApi } from '../lib/api'
import { setServerWallpaperFromWorkspaceFile } from '../lib/server-wallpaper'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'
import {
  useWorkspaceStore,
  type WorkspaceInfo,
  type WorkspaceNode,
} from '../stores/workspace.store'
import { OsBuiltinAppIcon } from './os-experiment/builtin-icons'
import type { ChannelCreateType } from './os-experiment/channel-ui'
import {
  AppIcon,
  OsDockButton,
  OsDockSeparator,
  OsWindowFrame,
  type ResizeMode,
} from './os-experiment/components'
import {
  defaultDesktopFilePosition,
  desktopRowsPerColumn,
  OsDesktop,
  snapDesktopIconPoint,
  snapDesktopPoint,
} from './os-experiment/desktop'
import {
  OsDockAppStack,
  type OsDockAppStackEntry,
  OsDockWindowStack,
} from './os-experiment/dock-stacks'
import { OsAvatarMenu, OsBackground, OsTopBar } from './os-experiment/shell'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
  OsChannelTab,
  OsCommandDetail,
  OsDesktopChatInputWidget,
  OsDesktopItem,
  OsDesktopPhotoWidget,
  OsDesktopTypewriterWidget,
  OsDesktopVideoWidget,
  OsDesktopWebEmbedWidget,
  OsDesktopWidget,
  OsDesktopWorkspaceItem,
  OsServerMember,
  OsStickyNoteMentionContext,
  OsStickyNoteMentionTarget,
  OsWindowKind,
  OsWindowState,
  ScopedUnread,
  ServerAppIntegration,
  ServerEntry,
} from './os-experiment/types'
import {
  channelSort,
  clampWindowPosition,
  clampWindowResize,
  loadOsServerWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  normalizeOsDesktopLayout,
  OS_GC_MS,
  OS_STALE_MS,
  saveOsServerWindowState,
  serializeOsDesktopLayout,
  serverRouteKey,
  windowKey,
} from './os-experiment/utils'
import { OsWallpaperSettingsModal } from './os-experiment/wallpaper-settings'
import { OsBuiltinWindowContent, OsFileWindowContent } from './os-experiment/window-content'

const OS_FLOATING_LAYER_Z_INDEX = 2_147_482_000
const OS_WINDOW_BASE_Z_INDEX = 20

const OS_BUILTIN_APP_KEYS: readonly OsBuiltinAppKey[] = [
  'workspace',
  'app-store',
  'shop',
  'settings',
  'profile',
  'server-settings',
  'cloud-computers',
  'shadow-cloud',
  'discover',
  'my-buddies',
]

type DockIconVisibility = 'hidden' | 'pinned'
type DockIconState = Record<string, DockIconVisibility>
type BridgeBuddyCreatorRequest = {
  landing?: {
    title?: string
    description?: string
  }
}

const OS_DOCK_ICON_STATE_STORAGE_KEY = 'shadow:os-dock-icon-state:v1'

function normalizeWindowZOrder<T extends { id: string; z: number }>(windows: T[]): T[] {
  const zByWindowId = new Map(
    [...windows]
      .sort((a, b) => {
        const zA = Number.isFinite(a.z) ? a.z : OS_WINDOW_BASE_Z_INDEX
        const zB = Number.isFinite(b.z) ? b.z : OS_WINDOW_BASE_Z_INDEX
        if (zA !== zB) return zA - zB
        return a.id.localeCompare(b.id)
      })
      .map((item, index) => [item.id, OS_WINDOW_BASE_Z_INDEX + index]),
  )

  return windows.map((item) => {
    const z = zByWindowId.get(item.id) ?? OS_WINDOW_BASE_Z_INDEX
    return item.z === z ? item : { ...item, z }
  })
}
const DEFAULT_HIDDEN_DOCK_ICON_KEYS = new Set(['builtin:shadow-cloud', 'builtin:shop'])
const EMPTY_SERVER_ENTRIES: ServerEntry[] = []
const EMPTY_CHANNELS: ChannelMeta[] = []
const EMPTY_SERVER_APP_INTEGRATIONS: ServerAppIntegration[] = []
const EMPTY_BUDDY_INBOXES: BuddyInboxEntry[] = []
const EMPTY_WORKSPACE_NODES: WorkspaceNode[] = []
const EMPTY_SERVER_MEMBERS: OsServerMember[] = []

function builtinDockIconKey(key: OsBuiltinAppKey) {
  return `builtin:${key}`
}

function appDockIconKey(appKey: string) {
  return `app:${appKey}`
}

function workspaceDesktopItemId(nodeId: string) {
  return `workspace:${nodeId}`
}

function builtinDesktopItemId(key: OsBuiltinAppKey) {
  return `builtin:${key}`
}

function serverAppDesktopItemId(appKey: string) {
  return `app:${appKey}`
}

function desktopWidgetId() {
  return `widget:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36)}`
}

function flattenWorkspaceNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [node, ...flattenWorkspaceNodes(node.children ?? [])])
}

function desktopOccupiedPoints(items: OsDesktopItem[], excludeId?: string) {
  return items
    .filter((item) => item.id !== excludeId && item.hidden !== true)
    .map((item) => ({ x: item.x, y: item.y }))
}

function nextDesktopPoint(
  items: OsDesktopItem[],
  preferred?: { x: number; y: number },
  excludeId?: string,
) {
  return snapDesktopIconPoint(preferred ?? defaultDesktopFilePosition(items.length), {
    occupied: desktopOccupiedPoints(items, excludeId),
  })
}

function hydrateDesktopLayoutItems(input: {
  layoutItems: ReturnType<typeof normalizeOsDesktopLayout>['items']
  workspaceNodeById: Map<string, WorkspaceNode>
  apps: ServerAppIntegration[]
}) {
  return input.layoutItems.flatMap((item): OsDesktopItem[] => {
    if (item.kind === 'workspace-node') {
      const node = input.workspaceNodeById.get(item.workspaceNodeId)
      if (!node) return []
      return [
        {
          id: workspaceDesktopItemId(node.id),
          kind: 'workspace-node',
          node,
          source: item.source,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        },
      ]
    }
    if (item.kind === 'builtin-app') {
      if (!OS_BUILTIN_APP_KEYS.includes(item.builtinKey)) return []
      return [
        {
          id: builtinDesktopItemId(item.builtinKey),
          kind: 'builtin-app',
          builtinKey: item.builtinKey,
          title: item.title,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        },
      ]
    }
    const app = input.apps.find((candidate) => candidate.appKey === item.appKey)
    return [
      {
        id: serverAppDesktopItemId(item.appKey),
        kind: 'server-app',
        appKey: item.appKey,
        appId: item.appId ?? app?.id,
        title: app?.name ?? item.title,
        iconUrl: app?.iconUrl ?? item.iconUrl,
        hidden: item.hidden,
        x: item.x,
        y: item.y,
      },
    ]
  })
}

function readDockIconState(): DockIconState {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OS_DOCK_ICON_STATE_STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, DockIconVisibility] =>
          typeof entry[0] === 'string' && (entry[1] === 'hidden' || entry[1] === 'pinned'),
      ),
    )
  } catch {
    return {}
  }
}

function isDockIconHidden(iconKey: string, state: DockIconState) {
  const explicit = state[iconKey]
  if (explicit) return explicit === 'hidden'
  return DEFAULT_HIDDEN_DOCK_ICON_KEYS.has(iconKey)
}

type OpenWindowInput = {
  kind: OsWindowKind
  targetId: string
  title: string
  subtitle: string
  channelId?: string
  appKey?: string
  builtinKey?: OsBuiltinAppKey
  workspaceNode?: WorkspaceNode
  attachment?: OsWindowState['attachment']
  profileUserId?: string
  iconUrl?: string | null
}

function findSemanticWindow(windows: OsWindowState[], id: string, input: OpenWindowInput) {
  return windows.find((item) => {
    if (item.id === id) return true
    if (input.kind === 'channel') {
      return item.kind === 'channel' && item.channelId === input.channelId
    }
    if (input.kind === 'app') {
      return item.kind === 'app' && item.appKey === input.appKey
    }
    if (input.kind === 'builtin') {
      return (
        item.kind === 'builtin' &&
        item.builtinKey === input.builtinKey &&
        (input.builtinKey !== 'profile' || item.profileUserId === input.profileUserId)
      )
    }
    if (input.kind === 'workspace-file') {
      return item.kind === 'workspace-file' && item.workspaceNode?.id === input.workspaceNode?.id
    }
    if (input.kind === 'chat-file') {
      return item.kind === 'chat-file' && item.attachment?.id === input.attachment?.id
    }
    return false
  })
}

export function OsExperimentPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const routeSearch = useSearch({ strict: false }) as {
    app?: string
    builtin?: OsBuiltinAppKey
    channel?: string
    server?: string
  }
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const setActiveServer = useChatStore((state) => state.setActiveServer)
  const workspaceClipboard = useWorkspaceStore((state) => state.clipboard)
  const setWorkspaceClipboard = useWorkspaceStore((state) => state.setClipboard)
  const renamingWorkspaceNodeId = useWorkspaceStore((state) => state.renamingNodeId)
  const setRenamingWorkspaceNodeId = useWorkspaceStore((state) => state.setRenamingNodeId)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [windows, setWindows] = useState<OsWindowState[]>([])
  const [openChannelTabs, setOpenChannelTabs] = useState<Omit<OsChannelTab, 'active'>[]>([])
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null)
  const [channelBubbleRequest, setChannelBubbleRequest] = useState<{
    channelId: string
    nonce: number
  } | null>(null)
  const [desktopFiles, setDesktopFiles] = useState<OsDesktopItem[]>([])
  const [desktopWidgets, setDesktopWidgets] = useState<OsDesktopWidget[]>([])
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null)
  const [pendingOsCommand, setPendingOsCommand] = useState<OsCommandDetail | null>(null)
  const [dockIconState, setDockIconState] = useState<DockIconState>(() => readDockIconState())
  const [dockIconContextMenu, setDockIconContextMenu] = useState<{
    x: number
    y: number
    target: { iconKey: string; hidden: boolean }
  } | null>(null)
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
  const windowsRef = useRef(windows)
  const focusedWindowIdRef = useRef(focusedWindowId)
  const openChannelTabsRef = useRef(openChannelTabs)
  const activeChannelTabIdRef = useRef(activeChannelTabId)
  const selectedServerIdRef = useRef<string | null>(null)
  const resizeSessionRef = useRef<{ id: string; windows: OsWindowState[] } | null>(null)
  const localUnreadEventIdsRef = useRef<Set<string>>(new Set())
  const isRestoringWindowsRef = useRef(false)
  const isRestoringDesktopRef = useRef(false)
  const lastSavedDesktopLayoutRef = useRef<string | null>(null)
  const initialContextOpenedRef = useRef<string | null>(null)
  const buddyCreatorResolverRef = useRef<((agent: Agent | null) => void) | null>(null)

  const { data: servers = EMPTY_SERVER_ENTRIES, isLoading: isServersLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const selectedServer =
    servers.find((entry) => entry.server.id === selectedServerId) ?? servers[0] ?? null
  const selectedServerSlug = serverRouteKey(selectedServer?.server)
  const canManageDesktopLayout =
    selectedServer?.member.role === 'owner' || selectedServer?.member.role === 'admin'
  const selectedServerDesktopLayout = useMemo(
    () => normalizeOsDesktopLayout(selectedServer?.server.desktopLayout),
    [selectedServer?.server.desktopLayout],
  )
  const selectedServerDesktopLayoutKey = useMemo(
    () => JSON.stringify(selectedServerDesktopLayout),
    [selectedServerDesktopLayout],
  )

  const { data: channels = EMPTY_CHANNELS } = useQuery({
    queryKey: ['os-server-channels', selectedServerSlug],
    queryFn: () => fetchApi<ChannelMeta[]>(`/api/servers/${selectedServerSlug}/channels`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: serverMembers = EMPTY_SERVER_MEMBERS } = useQuery({
    queryKey: ['os-server-members', selectedServerSlug],
    queryFn: () => fetchApi<OsServerMember[]>(`/api/servers/${selectedServerSlug}/members`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: apps = EMPTY_SERVER_APP_INTEGRATIONS, isLoading: isAppsLoading } = useQuery({
    queryKey: ['os-server-apps', selectedServerSlug, i18n.language],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${selectedServerSlug}/apps`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: inboxes = EMPTY_BUDDY_INBOXES, isLoading: isInboxesLoading } = useQuery({
    queryKey: ['os-server-inboxes', selectedServerSlug],
    queryFn: () => fetchApi<BuddyInboxEntry[]>(`/api/servers/${selectedServerSlug}/inboxes`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: osWorkspace } = useQuery({
    queryKey: ['workspace', selectedServerSlug],
    queryFn: () => fetchApi<WorkspaceInfo>(`/api/servers/${selectedServerSlug}/workspace`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: osWorkspaceTree = EMPTY_WORKSPACE_NODES } = useQuery({
    queryKey: ['os-workspace-root', selectedServerSlug],
    queryFn: () => fetchApi<WorkspaceNode[]>(`/api/servers/${selectedServerSlug}/workspace/tree`),
    enabled: Boolean(selectedServerSlug),
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

  const activeChannels = useMemo(
    () =>
      channels
        .filter((channel) => channel.isArchived !== true)
        .sort(channelSort)
        .slice(0, 24),
    [channels],
  )
  const stickyNoteMentionContext = useMemo<OsStickyNoteMentionContext>(
    () => ({
      workspaceNodes,
      apps,
      channels: activeChannels,
      members: serverMembers,
    }),
    [activeChannels, apps, serverMembers, workspaceNodes],
  )

  const topAppWindows = useMemo(
    () => windows.filter((item) => item.kind === 'app').map((item) => item.appKey),
    [windows],
  )
  const activeBuiltinWindows = useMemo(
    () =>
      new Set(
        windows.flatMap((item) =>
          item.kind === 'builtin' && item.builtinKey ? [item.builtinKey] : [],
        ),
      ),
    [windows],
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
        key: 'shadow-cloud' as const,
        label: t('os.shadowCloudApp'),
        icon: <OsBuiltinAppIcon appKey="shadow-cloud" />,
      },
      {
        key: 'my-buddies' as const,
        label: t('os.myBuddiesApp'),
        icon: <OsBuiltinAppIcon appKey="my-buddies" />,
      },
    ],
    [t],
  )

  useEffect(() => {
    windowsRef.current = windows
  }, [windows])

  useEffect(() => {
    openChannelTabsRef.current = openChannelTabs
  }, [openChannelTabs])

  useEffect(() => {
    activeChannelTabIdRef.current = activeChannelTabId
  }, [activeChannelTabId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(OS_DOCK_ICON_STATE_STORAGE_KEY, JSON.stringify(dockIconState))
  }, [dockIconState])

  useEffect(() => {
    setWindows((current) => {
      const next = current.filter((item) => item.kind !== 'channel' && item.kind !== 'inbox')
      return next.length === current.length ? current : next
    })
  }, [])

  useEffect(() => {
    focusedWindowIdRef.current = focusedWindowId
  }, [focusedWindowId])

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
    if (servers.length === 0) return
    const requestedServer = routeSearch.server?.trim()
    const requestedEntry = requestedServer
      ? servers.find(
          (entry) =>
            entry.server.id === requestedServer ||
            entry.server.slug === requestedServer ||
            serverRouteKey(entry.server) === requestedServer,
        )
      : null
    const nextServerId = requestedEntry?.server.id ?? selectedServerId ?? servers[0]?.server.id
    if (nextServerId && nextServerId !== selectedServerId) {
      setSelectedServerId(nextServerId)
    }
  }, [routeSearch.server, selectedServerId, servers])

  useEffect(() => {
    if (!selectedServerId) return
    setActiveServer(selectedServerId)
    const previousServerId = selectedServerIdRef.current
    if (previousServerId && previousServerId !== selectedServerId) {
      saveOsServerWindowState(previousServerId, {
        windows: windowsRef.current,
        focusedWindowId: focusedWindowIdRef.current,
        channelTabs: openChannelTabsRef.current,
        activeChannelTabId: activeChannelTabIdRef.current,
      })
    }
    selectedServerIdRef.current = selectedServerId
    const restored = loadOsServerWindowState(selectedServerId)
    const restoredKeys = new Set<string>()
    const restoredWindows = (restored?.windows ?? [])
      .filter((item) => {
        if (item.kind === 'inbox' || item.kind === 'channel') return false
        const key =
          item.kind === 'app' && item.appKey
            ? `app:${item.appKey}`
            : item.kind === 'builtin' && item.builtinKey
              ? `builtin:${item.builtinKey}:${item.profileUserId ?? ''}`
              : item.kind === 'workspace-file' && item.workspaceNode
                ? `workspace-file:${item.workspaceNode.id}`
                : item.kind === 'chat-file' && item.attachment
                  ? `chat-file:${item.attachment.id}`
                  : item.id
        if (restoredKeys.has(key)) return false
        restoredKeys.add(key)
        return true
      })
      .map((item) =>
        item.kind === 'builtin' && item.builtinKey === 'server-settings'
          ? { ...item, maximized: item.minimized ? item.maximized : true }
          : item,
      )
    const restoredTabs = (restored?.channelTabs ?? []).filter(
      (tab) =>
        tab &&
        typeof tab.id === 'string' &&
        typeof tab.channelId === 'string' &&
        typeof tab.title === 'string',
    )
    const visibleRestoredTabs = restoredTabs.slice(-8)
    setOpenChannelTabs(visibleRestoredTabs)
    setActiveChannelTabId(
      visibleRestoredTabs.some((tab) => tab.id === restored?.activeChannelTabId)
        ? (restored?.activeChannelTabId ?? null)
        : (visibleRestoredTabs.at(-1)?.id ?? null),
    )
    setChannelBubbleRequest(null)
    setLocalMessageUnread({})
    isRestoringWindowsRef.current = true
    const normalizedRestoredWindows = normalizeWindowZOrder(restoredWindows)
    setWindows(normalizedRestoredWindows)
    setFocusedWindowId(
      normalizedRestoredWindows.some((item) => item.id === restored?.focusedWindowId)
        ? (restored?.focusedWindowId ?? null)
        : null,
    )
  }, [selectedServerId, setActiveServer])

  useEffect(() => {
    if (!selectedServerId) return
    const nextFiles = hydrateDesktopLayoutItems({
      layoutItems: selectedServerDesktopLayout.items,
      workspaceNodeById,
      apps,
    })

    if (isRestoringDesktopRef.current) {
      isRestoringDesktopRef.current = false
    }
    isRestoringDesktopRef.current = true
    lastSavedDesktopLayoutRef.current = selectedServerDesktopLayoutKey
    setDesktopFiles(nextFiles)
    setDesktopWidgets(selectedServerDesktopLayout.widgets)
  }, [
    apps,
    selectedServerDesktopLayout,
    selectedServerDesktopLayoutKey,
    selectedServerId,
    workspaceNodeById,
  ])

  useEffect(() => {
    if (!selectedServerSlug) return
    if (!canManageDesktopLayout) return
    if (isRestoringDesktopRef.current) {
      isRestoringDesktopRef.current = false
      return
    }

    const layout = serializeOsDesktopLayout(desktopFiles, desktopWidgets)
    const serialized = JSON.stringify(layout)
    if (serialized === lastSavedDesktopLayoutRef.current) return

    const timeout = window.setTimeout(() => {
      void fetchApi(`/api/servers/${selectedServerSlug}/desktop-layout`, {
        method: 'PATCH',
        body: JSON.stringify(layout),
      })
        .then(() => {
          lastSavedDesktopLayoutRef.current = serialized
          queryClient.setQueryData<ServerEntry[]>(['servers'], (current) =>
            current?.map((entry) =>
              serverRouteKey(entry.server) === selectedServerSlug ||
              entry.server.id === selectedServerId
                ? { ...entry, server: { ...entry.server, desktopLayout: layout } }
                : entry,
            ),
          )
        })
        .catch((error) => {
          showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
        })
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [
    desktopFiles,
    desktopWidgets,
    canManageDesktopLayout,
    queryClient,
    selectedServerId,
    selectedServerSlug,
    t,
  ])

  useEffect(() => {
    if (!selectedServerId) return
    if (isRestoringWindowsRef.current) {
      isRestoringWindowsRef.current = false
      return
    }
    saveOsServerWindowState(selectedServerId, {
      windows,
      focusedWindowId,
      channelTabs: openChannelTabs,
      activeChannelTabId,
    })
  }, [activeChannelTabId, focusedWindowId, openChannelTabs, selectedServerId, windows])

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
        to: '/os',
        search: entry ? { server: serverRouteKey(entry.server) } : {},
        replace: true,
      })
    },
    [navigate, servers],
  )

  const focusWindow = useCallback((id: string) => {
    setWindows((current) => {
      const normalized = normalizeWindowZOrder(current)
      const topZ = OS_WINDOW_BASE_Z_INDEX + normalized.length
      return normalized.map((item) =>
        item.id === id
          ? {
              ...item,
              z: topZ,
              minimized: false,
              maximized:
                item.kind === 'builtin' && item.builtinKey === 'server-settings'
                  ? true
                  : item.maximized,
            }
          : item,
      )
    })
    setFocusedWindowId(id)
  }, [])

  const floatingLayerZIndex = OS_FLOATING_LAYER_Z_INDEX

  const moveWindow = useCallback(
    (id: string, rect: { x: number; y: number; width: number; height: number }) => {
      setWindows((current) =>
        current.map((item) => {
          if (item.id !== id) return item
          const next = clampWindowPosition(rect)
          return { ...item, ...next, maximized: false }
        }),
      )
    },
    [],
  )

  const restoreWindowForDrag = useCallback(
    (id: string, rect: { x: number; y: number; width: number; height: number }) => {
      setWindows((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, ...clampWindowPosition(rect), maximized: false, minimized: false }
            : item,
        ),
      )
    },
    [],
  )

  const resizeWindow = useCallback(
    (
      id: string,
      rect: { x: number; y: number; width: number; height: number },
      mode: ResizeMode,
      phase: 'preview' | 'commit',
    ) => {
      setWindows((current) => {
        const session =
          resizeSessionRef.current?.id === id ? resizeSessionRef.current : { id, windows: current }
        if (phase === 'preview' && resizeSessionRef.current?.id !== id) {
          resizeSessionRef.current = session
        }
        const baseline = session.windows
        const source = baseline.find((item) => item.id === id)
        if (!source) return current
        const next = clampWindowResize({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
        const tolerance = 2
        const oldLeft = source.x
        const oldTop = source.y
        const oldRight = source.x + source.width
        const oldBottom = source.y + source.height
        const newLeft = next.x
        const newTop = next.y
        const newRight = next.x + next.width
        const newBottom = next.y + next.height
        const sourceHorizontalStart = source.x
        const sourceHorizontalEnd = source.x + source.width
        const sourceVerticalStart = source.y
        const sourceVerticalEnd = source.y + source.height

        const resized = current.map((item) => {
          if (item.id === id) return { ...item, ...next }
          const baselineItem = baseline.find((candidate) => candidate.id === item.id) ?? item
          if (baselineItem.minimized || baselineItem.maximized) return item

          const verticalOverlap =
            Math.max(sourceVerticalStart, baselineItem.y) <
            Math.min(sourceVerticalEnd, baselineItem.y + baselineItem.height)
          const horizontalOverlap =
            Math.max(sourceHorizontalStart, baselineItem.x) <
            Math.min(sourceHorizontalEnd, baselineItem.x + baselineItem.width)
          let linked = item

          if (
            mode.includes('right') &&
            verticalOverlap &&
            Math.abs(baselineItem.x - oldRight) <= tolerance
          ) {
            const fixedRight = baselineItem.x + baselineItem.width
            const width = fixedRight - newRight
            if (width >= MIN_WINDOW_WIDTH) linked = { ...linked, x: newRight, width }
          }

          if (
            mode.includes('left') &&
            verticalOverlap &&
            Math.abs(baselineItem.x + baselineItem.width - oldLeft) <= tolerance
          ) {
            const width = newLeft - baselineItem.x
            if (width >= MIN_WINDOW_WIDTH) linked = { ...linked, width }
          }

          if (
            mode.includes('bottom') &&
            horizontalOverlap &&
            Math.abs(baselineItem.y - oldBottom) <= tolerance
          ) {
            const fixedBottom = baselineItem.y + baselineItem.height
            const height = fixedBottom - newBottom
            if (height >= MIN_WINDOW_HEIGHT) linked = { ...linked, y: newBottom, height }
          }

          if (
            mode.includes('top') &&
            horizontalOverlap &&
            Math.abs(baselineItem.y + baselineItem.height - oldTop) <= tolerance
          ) {
            const height = newTop - baselineItem.y
            if (height >= MIN_WINDOW_HEIGHT) linked = { ...linked, height }
          }

          return linked
        })
        if (phase === 'commit' && resizeSessionRef.current?.id === id) {
          resizeSessionRef.current = null
        }
        return resized
      })
    },
    [],
  )

  const openWindow = useCallback(
    (input: OpenWindowInput) => {
      const id = windowKey(input.kind, input.targetId)
      const existingWindow = findSemanticWindow(windowsRef.current, id, input)
      if (existingWindow) {
        if (input.kind === 'builtin' && input.builtinKey === 'workspace' && input.workspaceNode) {
          setWindows((current) =>
            current.map((item) =>
              item.id === existingWindow.id
                ? { ...item, workspaceNode: input.workspaceNode }
                : item,
            ),
          )
        }
        focusWindow(existingWindow.id)
        return
      }
      setWindows((current) => {
        const existing = findSemanticWindow(current, id, input)
        const normalized = normalizeWindowZOrder(current)
        const topZ = OS_WINDOW_BASE_Z_INDEX + normalized.length
        if (existing) {
          return normalized.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  workspaceNode:
                    input.kind === 'builtin' && input.builtinKey === 'workspace'
                      ? input.workspaceNode
                      : item.workspaceNode,
                  minimized: false,
                  z: topZ,
                  maximized:
                    item.kind === 'builtin' && item.builtinKey === 'server-settings'
                      ? true
                      : item.maximized,
                }
              : item,
          )
        }
        const offset = (normalized.length % 5) * 28
        const size =
          input.kind === 'builtin'
            ? input.builtinKey === 'workspace'
              ? { width: 1080, height: 700 }
              : input.builtinKey === 'discover'
                ? { width: 1180, height: 740 }
                : input.builtinKey === 'shadow-cloud'
                  ? { width: 1180, height: 740 }
                  : input.builtinKey === 'cloud-computers'
                    ? { width: 1180, height: 740 }
                    : input.builtinKey === 'my-buddies'
                      ? { width: 1060, height: 690 }
                      : input.builtinKey === 'server-settings'
                        ? { width: 1160, height: 720 }
                        : { width: 980, height: 660 }
            : input.kind === 'chat-file'
              ? { width: 920, height: 680 }
              : input.kind === 'workspace-file'
                ? { width: 920, height: 680 }
                : input.kind === 'app'
                  ? { width: 760, height: 660 }
                  : input.kind === 'inbox'
                    ? { width: 760, height: 600 }
                    : { width: 820, height: 600 }
        const position = clampWindowPosition({
          x: 92 + offset,
          y: 92 + offset,
          ...size,
        })
        return [
          ...normalized,
          {
            id,
            kind: input.kind,
            title: input.title,
            subtitle: input.subtitle,
            channelId: input.channelId,
            appKey: input.appKey,
            builtinKey: input.builtinKey,
            appPath: input.kind === 'app' ? '/' : undefined,
            workspaceNode: input.workspaceNode,
            attachment: input.attachment,
            profileUserId: input.profileUserId,
            iconUrl: input.iconUrl,
            ...position,
            z: topZ,
            minimized: false,
            maximized: input.kind === 'builtin' && input.builtinKey === 'server-settings',
          },
        ]
      })
      setFocusedWindowId(id)
    },
    [focusWindow],
  )

  const openChannelWindow = useCallback((channel: ChannelMeta) => {
    const id = windowKey('channel', channel.id)
    const title = channel.name
    setLocalMessageUnread((current) => {
      if (!current[channel.id]) return current
      const next = { ...current }
      delete next[channel.id]
      return next
    })
    setOpenChannelTabs((current) => {
      const existing = current.find((item) => item.channelId === channel.id)
      if (existing) {
        return current.map((item) =>
          item.id === existing.id
            ? { ...item, title, type: channel.type, topic: channel.topic ?? null }
            : item,
        )
      }
      return [
        ...current,
        {
          channelId: channel.id,
          id,
          title,
          type: channel.type,
          topic: channel.topic ?? null,
        },
      ].slice(-8)
    })
    setActiveChannelTabId(id)
    setChannelBubbleRequest({ channelId: channel.id, nonce: Date.now() })
  }, [])

  const createChannel = useMutation({
    mutationFn: (input: { name: string; type: ChannelCreateType; isPrivate: boolean }) =>
      fetchApi<ChannelMeta>(`/api/servers/${selectedServerSlug}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name: input.name, type: input.type, isPrivate: input.isPrivate }),
      }),
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['os-server-channels', selectedServerSlug] })
      queryClient.invalidateQueries({ queryKey: ['channels', selectedServerSlug] })
      openChannelWindow(channel)
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
    },
  })

  const openAppWindow = useCallback(
    (app: ServerAppIntegration) => {
      openWindow({
        kind: 'app',
        targetId: app.appKey,
        appKey: app.appKey,
        iconUrl: app.iconUrl,
        title: app.name,
        subtitle: t('os.applicationWindow'),
      })
    },
    [openWindow, t],
  )

  const updateAppWindowRoute = useCallback((id: string, appPath: string) => {
    setWindows((current) =>
      current.map((item) => (item.id === id && item.kind === 'app' ? { ...item, appPath } : item)),
    )
  }, [])

  const openBuiltinWindow = useCallback(
    (key: OsBuiltinAppKey, options: { workspaceNode?: WorkspaceNode } = {}) => {
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
                    : key === 'shadow-cloud'
                      ? 'os.shadowCloudApp'
                      : key === 'discover'
                        ? 'os.discoverApp'
                        : key === 'my-buddies'
                          ? 'os.myBuddiesApp'
                          : 'settings.menuViewProfile'
      openWindow({
        kind: 'builtin',
        targetId: key,
        builtinKey: key,
        workspaceNode: options.workspaceNode,
        title: t(titleKey),
        subtitle: t('os.applicationWindow'),
      })
    },
    [openWindow, t],
  )

  const openSettingsWindow = useCallback(() => {
    openWindow({
      kind: 'builtin',
      targetId: 'settings',
      builtinKey: 'settings',
      title: t('settings.sectionSettings'),
      subtitle: t('os.applicationWindow'),
    })
  }, [openWindow, t])

  const openProfileWindow = useCallback(() => {
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
  }, [openWindow, t, user?.avatarUrl, user?.displayName, user?.id, user?.username])

  const openServerMemberProfileWindow = useCallback(
    (member: OsServerMember) => {
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
    },
    [openWindow, t],
  )

  const openWorkspaceFileWindow = useCallback(
    (node: WorkspaceNode) => {
      openWindow({
        kind: 'workspace-file',
        targetId: node.id,
        workspaceNode: node,
        title: node.name,
        subtitle: t('os.workspaceFileWindow'),
      })
    },
    [openWindow, t],
  )

  const openWorkspaceDesktopNode = useCallback(
    (node: WorkspaceNode) => {
      if (node.kind === 'file') {
        openWorkspaceFileWindow(node)
      }
    },
    [openWorkspaceFileWindow],
  )

  const invalidateOsWorkspaceData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['os-workspace-root', selectedServerSlug] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-tree', selectedServerSlug] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-stats', selectedServerSlug] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-search', selectedServerSlug] }),
    ])
  }, [queryClient, selectedServerSlug])

  const pinWorkspaceFileToDesktop = useCallback(
    (node: WorkspaceNode, point?: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = workspaceDesktopItemId(node.id)
        const existingIndex = current.findIndex((item) => item.id === id)
        const position = nextDesktopPoint(current, point, id)
        if (existingIndex >= 0) {
          return current.map((item, index) =>
            index === existingIndex
              ? {
                  id,
                  kind: 'workspace-node',
                  node,
                  source: node.parentId === null ? 'workspace-root' : 'pinned',
                  hidden: false,
                  ...position,
                }
              : item,
          )
        }
        return [
          ...current,
          {
            id,
            kind: 'workspace-node',
            node,
            source: node.parentId === null ? 'workspace-root' : 'pinned',
            hidden: false,
            ...position,
          },
        ]
      })
    },
    [canManageDesktopLayout],
  )

  const moveDesktopFile = useCallback(
    (
      id: string,
      point: { x: number; y: number },
      options?: { swapWith?: { id: string; point: { x: number; y: number } } },
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const upsertPosition = (
          items: OsDesktopItem[],
          itemId: string,
          nextPoint: { x: number; y: number },
        ) => {
          const existingIndex = items.findIndex((item) => item.id === itemId)
          if (existingIndex >= 0) {
            return items.map((item, index) =>
              index === existingIndex ? { ...item, ...nextPoint, hidden: false } : item,
            )
          }
          const nodeId = itemId.startsWith('workspace:')
            ? itemId.slice('workspace:'.length)
            : itemId
          const rootNode = workspaceRootNodes.find((node) => node.id === nodeId)
          if (!rootNode) return items
          return [
            ...items,
            {
              id: workspaceDesktopItemId(rootNode.id),
              kind: 'workspace-node' as const,
              node: rootNode,
              source: 'workspace-root' as const,
              hidden: false,
              ...nextPoint,
            },
          ]
        }

        let next = upsertPosition(current, id, point)
        if (options?.swapWith) {
          next = upsertPosition(next, options.swapWith.id, options.swapWith.point)
        }
        return next
      })
    },
    [canManageDesktopLayout, workspaceRootNodes],
  )

  const createStickyNoteWidget = useCallback(
    (point: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'sticky-note',
          ...point,
          widthCells: 6,
          heightCells: 4,
          content: t('os.stickyNoteDefaultContent'),
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout, t],
  )

  const createChatInputWidget = useCallback(
    (point: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'chat-input',
          ...point,
          widthCells: 10,
          heightCells: 2,
          defaultAgentId: null,
          inboxViewMode: 'chat',
          placeholder: undefined,
          completionItems: [],
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createPhotoWidget = useCallback(
    (
      point: { x: number; y: number },
      input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'photo',
          ...point,
          widthCells: 6,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createTypewriterWidget = useCallback(
    (
      point: { x: number; y: number },
      input: Omit<
        OsDesktopTypewriterWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'typewriter',
          ...point,
          widthCells: 8,
          heightCells: 6,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createVideoWidget = useCallback(
    (
      provider: OsDesktopVideoWidget['provider'],
      point: { x: number; y: number },
      input: Omit<
        OsDesktopVideoWidget,
        'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'video-player',
          provider,
          ...point,
          widthCells: 10,
          heightCells: 6,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createWebEmbedWidget = useCallback(
    (
      point: { x: number; y: number },
      input: Omit<
        OsDesktopWebEmbedWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'web-embed',
          ...point,
          widthCells: 10,
          heightCells: 8,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const moveDesktopWidget = useCallback(
    (id: string, point: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) => (widget.id === id ? { ...widget, ...point } : widget)),
      )
    },
    [canManageDesktopLayout],
  )

  const resizeDesktopWidget = useCallback(
    (id: string, size: { widthCells: number; heightCells: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) => {
          if (widget.id !== id) return widget
          if (widget.kind === 'photo') {
            return {
              ...widget,
              widthCells: Math.min(8, Math.max(4, size.widthCells)),
              updatedAt: new Date().toISOString(),
            }
          }
          if (widget.kind === 'chat-input') {
            return {
              ...widget,
              widthCells: Math.min(16, Math.max(6, size.widthCells)),
              heightCells: Math.min(8, Math.max(2, size.heightCells)),
              updatedAt: new Date().toISOString(),
            }
          }
          const isFrameWidget = widget.kind === 'video-player' || widget.kind === 'web-embed'
          const isTypewriterWidget = widget.kind === 'typewriter'
          const minWidthCells = isFrameWidget || isTypewriterWidget ? 4 : 2
          const maxWidthCells = isFrameWidget || isTypewriterWidget ? 16 : 12
          const minHeightCells = isFrameWidget ? 4 : 2
          return {
            ...widget,
            widthCells: Math.min(maxWidthCells, Math.max(minWidthCells, size.widthCells)),
            heightCells: Math.min(12, Math.max(minHeightCells, size.heightCells)),
          }
        }),
      )
    },
    [canManageDesktopLayout],
  )

  const updateStickyNoteWidget = useCallback(
    (id: string, content: string) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id ? { ...widget, content, updatedAt: new Date().toISOString() } : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateChatInputWidget = useCallback(
    (
      id: string,
      input: Partial<
        Pick<
          OsDesktopChatInputWidget,
          'defaultAgentId' | 'inboxViewMode' | 'placeholder' | 'completionItems'
        >
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'chat-input'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateTypewriterWidget = useCallback(
    (
      id: string,
      input: Omit<
        OsDesktopTypewriterWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'typewriter'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const rotateDesktopWidget = useCallback(
    (id: string, rotation: number) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id
            ? {
                ...widget,
                rotation: Math.min(45, Math.max(-45, rotation)),
                updatedAt: new Date().toISOString(),
              }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updatePhotoWidget = useCallback(
    (
      id: string,
      input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'photo'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateVideoWidget = useCallback(
    (
      id: string,
      input: Omit<
        OsDesktopVideoWidget,
        'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'video-player'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateWebEmbedWidget = useCallback(
    (
      id: string,
      input: Omit<
        OsDesktopWebEmbedWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'web-embed'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const deleteDesktopWidget = useCallback(
    (id: string) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => current.filter((widget) => widget.id !== id))
    },
    [canManageDesktopLayout],
  )

  const hideDesktopItem = useCallback(
    (item: OsDesktopItem) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const existingIndex = current.findIndex((stored) => stored.id === item.id)
        if (existingIndex >= 0) {
          return current.map((stored, index) =>
            index === existingIndex ? { ...stored, hidden: true } : stored,
          )
        }
        return [...current, { ...item, hidden: true }]
      })
    },
    [canManageDesktopLayout],
  )

  const pinBuiltinAppToDesktop = useCallback(
    (key: OsBuiltinAppKey, title: string) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = builtinDesktopItemId(key)
        const existingIndex = current.findIndex((item) => item.id === id)
        const position = nextDesktopPoint(current, undefined, id)
        const item: OsDesktopItem = {
          id,
          kind: 'builtin-app',
          builtinKey: key,
          title,
          hidden: false,
          ...position,
        }
        return existingIndex >= 0
          ? current.map((entry, index) => (index === existingIndex ? item : entry))
          : [...current, item]
      })
    },
    [canManageDesktopLayout],
  )

  const pinServerAppToDesktop = useCallback(
    (app: ServerAppIntegration) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = serverAppDesktopItemId(app.appKey)
        const existingIndex = current.findIndex((item) => item.id === id)
        const position = nextDesktopPoint(current, undefined, id)
        const item: OsDesktopItem = {
          id,
          kind: 'server-app',
          appId: app.id,
          appKey: app.appKey,
          title: app.name,
          iconUrl: app.iconUrl,
          hidden: false,
          ...position,
        }
        return existingIndex >= 0
          ? current.map((entry, index) => (index === existingIndex ? item : entry))
          : [...current, item]
      })
    },
    [canManageDesktopLayout],
  )

  const openDesktopServerApp = useCallback(
    (appKey: string) => {
      const app = apps.find((candidate) => candidate.appKey === appKey)
      if (app) openAppWindow(app)
    },
    [apps, openAppWindow],
  )

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
      if (target.kind === 'server-app') {
        openAppWindow(target.app)
        return
      }
      if (target.kind === 'channel') {
        openChannelWindow(target.channel)
        return
      }
      openServerMemberProfileWindow(target.member)
    },
    [
      openAppWindow,
      openBuiltinWindow,
      openChannelWindow,
      openServerMemberProfileWindow,
      openWorkspaceFileWindow,
    ],
  )

  const renameDesktopWorkspaceNode = useCallback(
    async (node: WorkspaceNode, name: string) => {
      try {
        const endpoint =
          node.kind === 'dir'
            ? `/api/servers/${selectedServerSlug}/workspace/folders/${node.id}`
            : `/api/servers/${selectedServerSlug}/workspace/files/${node.id}`
        await fetchApi(endpoint, { method: 'PATCH', body: JSON.stringify({ name }) })
        setRenamingWorkspaceNodeId(null)
        await invalidateOsWorkspaceData()
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [invalidateOsWorkspaceData, selectedServerSlug, setRenamingWorkspaceNodeId, t],
  )

  const copyDesktopWorkspaceNode = useCallback(
    (nodeId: string) => {
      if (!osWorkspace) return
      setWorkspaceClipboard({
        mode: 'copy',
        sourceWorkspaceId: osWorkspace.id,
        nodeIds: [nodeId],
        updatedAt: Date.now(),
      })
      showToast(t('workspace.clipboardCopied', { count: 1 }), 'info')
    },
    [osWorkspace, setWorkspaceClipboard, t],
  )

  const cutDesktopWorkspaceNode = useCallback(
    (nodeId: string) => {
      if (!osWorkspace) return
      setWorkspaceClipboard({
        mode: 'cut',
        sourceWorkspaceId: osWorkspace.id,
        nodeIds: [nodeId],
        updatedAt: Date.now(),
      })
      showToast(t('workspace.clipboardCut', { count: 1 }), 'info')
    },
    [osWorkspace, setWorkspaceClipboard, t],
  )

  const pasteDesktopWorkspaceNodes = useCallback(
    async (targetParentId: string | null) => {
      if (!workspaceClipboard || !osWorkspace) return
      try {
        await fetchApi(`/api/servers/${selectedServerSlug}/workspace/nodes/paste`, {
          method: 'POST',
          body: JSON.stringify({
            sourceWorkspaceId: workspaceClipboard.sourceWorkspaceId,
            targetParentId,
            nodeIds: workspaceClipboard.nodeIds,
            mode: workspaceClipboard.mode,
          }),
        })
        setWorkspaceClipboard(null)
        await invalidateOsWorkspaceData()
        showToast(t('workspace.pasteComplete'), 'success')
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [
      invalidateOsWorkspaceData,
      osWorkspace,
      selectedServerSlug,
      setWorkspaceClipboard,
      t,
      workspaceClipboard,
    ],
  )

  const cloneDesktopWorkspaceFile = useCallback(
    async (fileId: string) => {
      try {
        await fetchApi(`/api/servers/${selectedServerSlug}/workspace/files/${fileId}/clone`, {
          method: 'POST',
        })
        await invalidateOsWorkspaceData()
        showToast(t('workspace.fileCloned'), 'success')
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [invalidateOsWorkspaceData, selectedServerSlug, t],
  )

  const setDesktopWorkspaceWallpaper = useCallback(
    async (node: WorkspaceNode) => {
      try {
        await setServerWallpaperFromWorkspaceFile(selectedServerSlug, node)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['servers'] }),
          queryClient.invalidateQueries({ queryKey: ['server', selectedServerSlug] }),
          queryClient.invalidateQueries({ queryKey: ['os-workspace-root', selectedServerSlug] }),
          queryClient.invalidateQueries({ queryKey: ['workspace-tree', selectedServerSlug] }),
        ])
        showToast(t('os.wallpaperSaved'), 'success')
      } catch (error) {
        showToast(
          error instanceof Error && error.message !== 'UNSUPPORTED_WALLPAPER_FILE'
            ? error.message
            : t('os.wallpaperUnsupportedFile'),
          'error',
        )
      }
    },
    [queryClient, selectedServerSlug, t],
  )

  const deleteDesktopWorkspaceNode = useCallback(
    async (node: WorkspaceNode) => {
      const ok = await useConfirmStore.getState().confirm({
        title: t('common.delete'),
        message:
          node.kind === 'dir'
            ? t('workspace.deleteFolderMessage', { name: node.name })
            : t('workspace.deleteFileMessage', { name: node.name }),
        confirmLabel: t('common.delete'),
        danger: true,
      })
      if (!ok) return

      try {
        const endpoint =
          node.kind === 'dir'
            ? `/api/servers/${selectedServerSlug}/workspace/folders/${node.id}`
            : `/api/servers/${selectedServerSlug}/workspace/files/${node.id}`
        await fetchApi(endpoint, { method: 'DELETE' })
        setDesktopFiles((current) =>
          current.filter((item) => item.kind !== 'workspace-node' || item.node.id !== node.id),
        )
        await invalidateOsWorkspaceData()
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [invalidateOsWorkspaceData, selectedServerSlug, t],
  )

  const uploadDesktopFiles = useCallback(
    async (files: globalThis.File[], point: { x: number; y: number }) => {
      try {
        for (const [index, file] of files.entries()) {
          const form = new FormData()
          form.append('file', file)
          const node = await fetchApi<WorkspaceNode>(
            `/api/servers/${selectedServerSlug}/workspace/upload`,
            {
              method: 'POST',
              body: form,
            },
          )
          pinWorkspaceFileToDesktop(node, {
            x: point.x + Math.floor(index / desktopRowsPerColumn()) * 104,
            y: point.y + (index % desktopRowsPerColumn()) * 112,
          })
        }
        await invalidateOsWorkspaceData()
        showToast(t('workspace.fileUploaded'), 'success')
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('workspace.uploadFailed'), 'error')
      }
    },
    [invalidateOsWorkspaceData, pinWorkspaceFileToDesktop, selectedServerSlug, t],
  )

  const openChatFileWindow = useCallback(
    (attachment: ChatAttachment) => {
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
    },
    [openWindow, t],
  )

  const openInboxChannel = useCallback(
    async (entry: BuddyInboxEntry) => {
      try {
        const channel = entry.channel ?? (await ensureInbox.mutateAsync(entry))
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
    [ensureInbox, t],
  )

  const openInboxFromBridge = useCallback(
    async (input: { agentId?: string; channelId?: string }) => {
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
    [inboxes, openInboxChannel, queryClient, selectedServerSlug, t],
  )

  const openBuddyCreatorFromBridge = useCallback((request: BridgeBuddyCreatorRequest) => {
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
  }, [])

  const closeBuddyCreator = useCallback(() => {
    buddyCreatorResolverRef.current?.(null)
    buddyCreatorResolverRef.current = null
    setBuddyCreatorRequest(null)
  }, [])

  const handleBuddyCreatedFromBridge = useCallback(
    async (agent: Agent) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', selectedServerSlug] }),
        queryClient.invalidateQueries({ queryKey: ['my-buddies-for-invite'] }),
      ])
      buddyCreatorResolverRef.current?.(agent)
      buddyCreatorResolverRef.current = null
      setBuddyCreatorRequest(null)
    },
    [queryClient, selectedServerSlug],
  )

  useEffect(() => {
    if (!selectedServerId) return
    const contextKey = JSON.stringify({
      app: routeSearch.app,
      builtin: routeSearch.builtin,
      channel: routeSearch.channel,
      server: selectedServerId,
    })
    if (initialContextOpenedRef.current === contextKey) return

    if (routeSearch.channel) {
      const channel = channels.find((candidate) => candidate.id === routeSearch.channel)
      if (!channel) return
      openChannelWindow(channel)
      initialContextOpenedRef.current = contextKey
      return
    }

    if (routeSearch.app) {
      const app = apps.find((candidate) => candidate.appKey === routeSearch.app)
      if (!app) return
      openAppWindow(app)
      initialContextOpenedRef.current = contextKey
      return
    }

    if (
      typeof routeSearch.builtin === 'string' &&
      OS_BUILTIN_APP_KEYS.includes(routeSearch.builtin as OsBuiltinAppKey)
    ) {
      openBuiltinWindow(routeSearch.builtin)
      initialContextOpenedRef.current = contextKey
    }
  }, [
    apps,
    channels,
    openAppWindow,
    openBuiltinWindow,
    openChannelWindow,
    routeSearch.app,
    routeSearch.builtin,
    routeSearch.channel,
    selectedServerId,
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
          detail.action !== 'open-inbox')
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
      openAppWindow(app)
      setPendingOsCommand(null)
      return
    }

    if (pendingOsCommand.action === 'open-inbox') {
      setInboxBubbleRequest({
        agentId: pendingOsCommand.agentId,
        channelId: pendingOsCommand.channelId,
        nonce: Date.now(),
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
            openChannelWindow(fetchedChannel)
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

    openChannelWindow(channel)
    setPendingOsCommand(null)
  }, [
    apps,
    channels,
    inboxes,
    openAppWindow,
    openBuiltinWindow,
    openChannelWindow,
    pendingOsCommand,
    selectServer,
    selectedServerId,
    servers,
  ])

  const closeWindow = (id: string) => {
    setWindows((current) => current.filter((item) => item.id !== id))
    if (focusedWindowId === id) setFocusedWindowId(null)
  }

  const minimizeWindow = (id: string) => {
    setWindows((current) =>
      current.map((item) => (item.id === id ? { ...item, minimized: true } : item)),
    )
  }

  const focusChannelTab = (id: string | null) => {
    if (!id) {
      setActiveChannelTabId(null)
      return
    }
    const tab = openChannelTabs.find((item) => item.id === id)
    if (!tab) return
    setActiveChannelTabId(id)
  }

  const closeChannelTab = (id: string) => {
    setOpenChannelTabs((current) => {
      const next = current.filter((item) => item.id !== id)
      if (activeChannelTabId === id) {
        setActiveChannelTabId(null)
        setChannelBubbleRequest(null)
      }
      return next
    })
  }

  const reorderChannelTab = (sourceId: string, targetId: string) => {
    setOpenChannelTabs((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current
      const next = [...current]
      const [source] = next.splice(sourceIndex, 1)
      if (!source) return current
      next.splice(targetIndex, 0, source)
      return next
    })
  }

  const toggleMaximizeWindow = (id: string) => {
    setWindows((current) =>
      current.map((item) =>
        item.id === id ? { ...item, maximized: !item.maximized, minimized: false } : item,
      ),
    )
    focusWindow(id)
  }

  const setDockIconVisibility = useCallback((iconKey: string, visibility: DockIconVisibility) => {
    setDockIconState((current) => ({ ...current, [iconKey]: visibility }))
  }, [])

  const openDockIconContextMenu = useCallback(
    (event: ReactMouseEvent, iconKey: string) => {
      event.preventDefault()
      event.stopPropagation()
      setDockIconContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: {
          iconKey,
          hidden: isDockIconHidden(iconKey, dockIconState),
        },
      })
    },
    [dockIconState],
  )

  const dockApps = apps.slice(0, 10)
  const visibleBuiltinDockApps = builtinDockApps.filter(
    (app) => !isDockIconHidden(builtinDockIconKey(app.key), dockIconState),
  )
  const visibleDockApps = dockApps.filter(
    (app) => !isDockIconHidden(appDockIconKey(app.appKey), dockIconState),
  )
  const builtinWindowByKey = new Map(
    windows
      .filter((item) => item.kind === 'builtin' && item.builtinKey)
      .map((item) => [item.builtinKey, item]),
  )
  const appWindowByKey = new Map(
    windows.filter((item) => item.kind === 'app' && item.appKey).map((item) => [item.appKey, item]),
  )
  const dockAppStackEntries = useMemo<OsDockAppStackEntry[]>(() => {
    const builtinKeys = new Set<OsBuiltinAppKey>()
    const entries: OsDockAppStackEntry[] = builtinDockApps.map((app) => {
      builtinKeys.add(app.key)
      const window = builtinWindowByKey.get(app.key)
      return {
        id: builtinDockIconKey(app.key),
        label: app.label,
        icon: app.icon,
        active: Boolean(window && !window.minimized),
        minimized: window?.minimized,
        onSelect: () => openBuiltinWindow(app.key),
        onContextMenu: (event) => openDockIconContextMenu(event, builtinDockIconKey(app.key)),
      }
    })

    const dockAppKeys = new Set<string>()
    for (const app of dockApps) {
      dockAppKeys.add(app.appKey)
      const window = appWindowByKey.get(app.appKey)
      entries.push({
        id: appDockIconKey(app.appKey),
        label: app.name,
        icon: <AppIcon iconUrl={app.iconUrl} className="h-full w-full rounded-lg" />,
        active: Boolean(window && !window.minimized),
        minimized: window?.minimized,
        onSelect: () => openAppWindow(app),
        onContextMenu: (event) => openDockIconContextMenu(event, appDockIconKey(app.appKey)),
      })
    }

    for (const window of windows) {
      if (window.kind === 'builtin' && window.builtinKey && !builtinKeys.has(window.builtinKey)) {
        entries.push({
          id: `window:${window.id}`,
          label: window.title,
          icon: <OsBuiltinAppIcon appKey={window.builtinKey} />,
          active: window.id === focusedWindowId && !window.minimized,
          minimized: window.minimized,
          onSelect: () => focusWindow(window.id),
        })
      }
      if (window.kind === 'app' && window.appKey && !dockAppKeys.has(window.appKey)) {
        entries.push({
          id: `window:${window.id}`,
          label: window.title,
          icon: <AppIcon iconUrl={window.iconUrl} className="h-full w-full rounded-lg" />,
          active: window.id === focusedWindowId && !window.minimized,
          minimized: window.minimized,
          onSelect: () => focusWindow(window.id),
        })
      }
    }

    return entries
  }, [
    appWindowByKey,
    builtinDockApps,
    builtinWindowByKey,
    dockApps,
    focusedWindowId,
    focusWindow,
    openAppWindow,
    openBuiltinWindow,
    openDockIconContextMenu,
    windows,
  ])
  const channelMetaById = new Map(activeChannels.map((channel) => [channel.id, channel]))
  const channelTabs = openChannelTabs.map((item) => {
    const meta = channelMetaById.get(item.channelId)
    return {
      ...item,
      title: meta ? meta.name : item.title,
      type: meta?.type ?? item.type,
      topic: meta?.topic ?? item.topic ?? null,
      active: item.id === activeChannelTabId,
    }
  })
  const workspaceFileStack = windows.filter(
    (item) => item.kind === 'workspace-file' || item.kind === 'chat-file',
  )
  const minimizedWindowStack = windows.filter(
    (item) =>
      item.minimized &&
      item.kind !== 'builtin' &&
      item.kind !== 'app' &&
      item.kind !== 'workspace-file' &&
      item.kind !== 'chat-file',
  )
  const hasInstalledDockApps = isAppsLoading || visibleDockApps.length > 0
  const hasQuickStacks =
    dockAppStackEntries.length > 0 ||
    workspaceFileStack.length > 0 ||
    minimizedWindowStack.length > 0
  const dockIconContextMenuGroups = useMemo<ContextMenuGroup[]>(
    () => [
      {
        title: t('os.dockOptions'),
        items: [
          ...(canManageDesktopLayout
            ? [
                {
                  icon: Pin,
                  label: t('os.pinAppToDesktop'),
                  onClick: () => {
                    const iconKey = dockIconContextMenu?.target.iconKey
                    if (!iconKey) return
                    if (iconKey.startsWith('builtin:')) {
                      const key = iconKey.slice('builtin:'.length) as OsBuiltinAppKey
                      const app = builtinDockApps.find((candidate) => candidate.key === key)
                      if (app) pinBuiltinAppToDesktop(app.key, app.label)
                      return
                    }
                    if (iconKey.startsWith('app:')) {
                      const appKey = iconKey.slice('app:'.length)
                      const app = apps.find((candidate) => candidate.appKey === appKey)
                      if (app) pinServerAppToDesktop(app)
                    }
                  },
                },
              ]
            : []),
          {
            icon: dockIconContextMenu?.target.hidden ? Pin : EyeOff,
            label: dockIconContextMenu?.target.hidden ? t('os.pinDockIcon') : t('os.hideDockIcon'),
            onClick: () => {
              const iconKey = dockIconContextMenu?.target.iconKey
              if (!iconKey) return
              setDockIconVisibility(
                iconKey,
                dockIconContextMenu.target.hidden ? 'pinned' : 'hidden',
              )
            },
          },
        ],
      },
    ],
    [
      apps,
      builtinDockApps,
      canManageDesktopLayout,
      dockIconContextMenu,
      pinBuiltinAppToDesktop,
      pinServerAppToDesktop,
      setDockIconVisibility,
      t,
    ],
  )
  const desktopItems = useMemo(() => {
    const storedByNodeId = new Map(
      desktopFiles
        .filter((item): item is OsDesktopWorkspaceItem => item.kind === 'workspace-node')
        .map((item) => [item.node.id, item]),
    )
    const rootIds = new Set(workspaceRootNodes.map((node) => node.id))
    const placedItems: OsDesktopItem[] = []

    for (const item of desktopFiles) {
      if (item.hidden) continue
      if (item.kind === 'workspace-node') {
        const latestNode = workspaceNodeById.get(item.node.id)
        if (!latestNode) continue
        placedItems.push({
          ...item,
          node: latestNode,
          source: rootIds.has(item.node.id) ? 'workspace-root' : 'pinned',
        })
        continue
      }
      placedItems.push(item)
    }

    for (const [index, node] of workspaceRootNodes.entries()) {
      const stored = storedByNodeId.get(node.id)
      if (stored) continue
      const point = nextDesktopPoint(placedItems, defaultDesktopFilePosition(index))
      placedItems.push({
        id: workspaceDesktopItemId(node.id),
        kind: 'workspace-node' as const,
        node,
        source: 'workspace-root' as const,
        ...point,
      })
    }

    return placedItems
  }, [desktopFiles, workspaceNodeById, workspaceRootNodes])

  const selectedServerWallpaper = selectedServer?.server.wallpaperUrl
    ? {
        type:
          selectedServer.server.wallpaperType === 'html' ? ('html' as const) : ('image' as const),
        url: selectedServer.server.wallpaperUrl,
        serverId: selectedServerSlug,
        workspaceFileId: selectedServer.server.wallpaperWorkspaceFileId ?? null,
        interactive: Boolean(
          selectedServer.server.wallpaperType === 'html' &&
            selectedServer.server.wallpaperInteractive,
        ),
      }
    : null
  const wallpaperInteractive = Boolean(selectedServerWallpaper?.interactive)

  if (isServersLoading && servers.length === 0) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#071018]">
        <OsBackground />
        <GlassPanel className="relative z-10 grid h-full place-items-center text-text-muted">
          <Loader2 size={20} className="animate-spin" />
        </GlassPanel>
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
            <h1 className="mt-4 text-xl font-black text-white">{t('os.emptyTitle')}</h1>
            <p className="mt-2 text-sm font-semibold text-white/64">{t('os.emptyDesc')}</p>
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
        channels={activeChannels}
        inboxes={inboxes}
        channelTabs={channelTabs}
        channelBubbleRequest={channelBubbleRequest}
        inboxBubbleRequest={inboxBubbleRequest}
        floatingLayerZIndex={floatingLayerZIndex}
        scopedUnread={mergedScopedUnread}
        isInboxesLoading={isInboxesLoading}
        isCreatingChannel={createChannel.isPending}
        user={user}
        onExit={exitOs}
        onSelectServer={selectServer}
        onFocusWindow={focusChannelTab}
        onCloseWindow={closeChannelTab}
        onCreateChannel={(input) => createChannel.mutate(input)}
        onOpenChannelWindow={openChannelWindow}
        onOpenInbox={openInboxChannel}
        onPreviewFile={openChatFileWindow}
        onOpenProfile={openProfileWindow}
        onOpenSettings={openSettingsWindow}
        onReorderChannelTab={reorderChannelTab}
      />

      <main className={cn('absolute inset-0', wallpaperInteractive && 'pointer-events-none')}>
        <OsDesktop
          items={desktopItems}
          widgets={desktopWidgets}
          inboxes={inboxes}
          canEditLayout={canManageDesktopLayout}
          serverId={selectedServerSlug}
          hasClipboard={Boolean(workspaceClipboard)}
          renamingNodeId={renamingWorkspaceNodeId}
          mentionContext={stickyNoteMentionContext}
          onOpenWorkspaceNode={openWorkspaceDesktopNode}
          onOpenBuiltinApp={openBuiltinWindow}
          onOpenServerApp={openDesktopServerApp}
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
          onCreateStickyNote={createStickyNoteWidget}
          onCreateChatInputWidget={createChatInputWidget}
          onCreateTypewriterWidget={createTypewriterWidget}
          onCreatePhotoWidget={createPhotoWidget}
          onCreateVideoWidget={createVideoWidget}
          onCreateWebEmbedWidget={createWebEmbedWidget}
          onMoveWidget={moveDesktopWidget}
          onResizeWidget={resizeDesktopWidget}
          onRotateWidget={rotateDesktopWidget}
          onUpdateStickyNote={updateStickyNoteWidget}
          onUpdateChatInputWidget={updateChatInputWidget}
          onUpdateTypewriterWidget={updateTypewriterWidget}
          onUpdatePhotoWidget={updatePhotoWidget}
          onUpdateVideoWidget={updateVideoWidget}
          onUpdateWebEmbedWidget={updateWebEmbedWidget}
          onDeleteWidget={deleteDesktopWidget}
          onOpenWallpaperSettings={() => setShowWallpaperSettings(true)}
          wallpaperInteractive={wallpaperInteractive}
        />
        {windows.map((item) => (
          <OsWindowFrame
            key={item.id}
            item={item}
            focused={focusedWindowId === item.id}
            serverSlug={selectedServerSlug}
            app={item.appKey ? (apps.find((app) => app.appKey === item.appKey) ?? null) : null}
            onClose={closeWindow}
            onFocus={focusWindow}
            onMinimize={minimizeWindow}
            onToggleMaximize={toggleMaximizeWindow}
            onRestoreForDrag={restoreWindowForDrag}
            onMove={moveWindow}
            onResize={resizeWindow}
            onPreviewFile={openChatFileWindow}
            onAppRouteChange={updateAppWindowRoute}
            onOpenInbox={openInboxFromBridge}
            onOpenBuddyCreator={openBuddyCreatorFromBridge}
            siblingWindows={windows}
          >
            {item.kind === 'builtin' ? (
              <OsBuiltinWindowContent
                item={item}
                serverSlug={selectedServerSlug}
                selectedServer={selectedServer}
                user={user}
                apps={apps}
                isAppsLoading={isAppsLoading}
                onOpenApp={openAppWindow}
                onOpenWorkspaceFile={openWorkspaceFileWindow}
                onPinWorkspaceFile={canManageDesktopLayout ? pinWorkspaceFileToDesktop : undefined}
                onCloseWindow={closeWindow}
              />
            ) : item.kind === 'workspace-file' || item.kind === 'chat-file' ? (
              <OsFileWindowContent
                item={item}
                serverSlug={selectedServerSlug}
                onCloseWindow={closeWindow}
              />
            ) : null}
          </OsWindowFrame>
        ))}
      </main>

      <QuickCreateBuddyModal
        open={!!buddyCreatorRequest}
        onClose={closeBuddyCreator}
        onSuccess={handleBuddyCreatedFromBridge}
        landing={buddyCreatorRequest?.landing}
      />

      <div
        className="absolute bottom-1 left-1/2 z-[450] flex max-w-[calc(100%-1.25rem)] -translate-x-1/2 select-none items-center gap-1 overflow-visible rounded-[18px] border border-white/18 bg-black/28 px-1.5 py-1 shadow-[0_16px_52px_rgba(0,0,0,0.30)] backdrop-blur-2xl"
        data-os-dock-bar="true"
      >
        <OsDockButton
          active
          label={selectedServer.server.name}
          icon={
            <ServerIcon
              iconUrl={selectedServer.server.iconUrl}
              name={selectedServer.server.name}
              size="sm"
              variant="plain"
              isPublic={selectedServer.server.isPublic}
            />
          }
          onClick={() => openBuiltinWindow('server-settings')}
          surface="bare"
          wrapIcon={false}
        />
        <OsDockSeparator visible={visibleBuiltinDockApps.length > 0} />
        {visibleBuiltinDockApps.map((app) => (
          <OsDockButton
            key={app.key}
            active={activeBuiltinWindows.has(app.key)}
            label={app.label}
            icon={app.icon}
            onClick={() => openBuiltinWindow(app.key)}
            onContextMenu={(event) => openDockIconContextMenu(event, builtinDockIconKey(app.key))}
          />
        ))}
        <OsDockSeparator visible={hasInstalledDockApps} />
        {isAppsLoading ? (
          <OsDockButton
            label={t('common.loading')}
            icon={<Loader2 size={18} className="animate-spin" />}
            onClick={() => undefined}
          />
        ) : (
          visibleDockApps.map((app) => (
            <OsDockButton
              key={app.id}
              active={topAppWindows.includes(app.appKey)}
              label={app.name}
              icon={<AppIcon iconUrl={app.iconUrl} className="rounded-xl" />}
              onClick={() => openAppWindow(app)}
              onContextMenu={(event) => openDockIconContextMenu(event, appDockIconKey(app.appKey))}
            />
          ))
        )}
        <OsDockSeparator visible={hasQuickStacks} />
        <OsDockAppStack
          label={t('os.applications')}
          icon={<LayoutGrid size={19} />}
          entries={dockAppStackEntries}
        />
        <OsDockWindowStack
          stackKey="files"
          label={t('os.workspaceFiles')}
          icon={<Files size={19} />}
          windows={workspaceFileStack}
          focusedWindowId={focusedWindowId}
          onSelect={focusWindow}
        />
        <OsDockWindowStack
          stackKey="minimized"
          label={t('os.minimizedWindows')}
          icon={<PanelBottom size={19} />}
          windows={minimizedWindowStack}
          focusedWindowId={focusedWindowId}
          onSelect={focusWindow}
        />
      </div>
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
