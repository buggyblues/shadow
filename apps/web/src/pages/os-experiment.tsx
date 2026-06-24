import { cn, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  AppWindow,
  Cloud,
  Compass,
  EyeOff,
  Files,
  FileText,
  Folder,
  LayoutGrid,
  Loader2,
  Monitor,
  PanelBottom,
  PawPrint,
  Pin,
  Settings,
  ShoppingBag,
  Store,
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
import type { Attachment as ChatAttachment } from '../components/chat/message-bubble/types'
import { ContextMenu, type ContextMenuGroup } from '../components/common/context-menu'
import { ServerIcon } from '../components/server/server-icon'
import { useSocketEvent } from '../hooks/use-socket'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'
import type { WorkspaceNode } from '../stores/workspace.store'
import type { ChannelCreateType } from './os-experiment/channel-ui'
import {
  AppIcon,
  OsDockButton,
  OsDockSeparator,
  OsWindowFrame,
  osBuiltinIconToneClassName,
  type ResizeMode,
} from './os-experiment/components'
import { defaultDesktopFilePosition, OsDesktop, snapDesktopPoint } from './os-experiment/desktop'
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
  OsDesktopFile,
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
  loadOsDesktopFiles,
  loadOsServerWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  OS_GC_MS,
  OS_STALE_MS,
  saveOsDesktopFiles,
  saveOsServerWindowState,
  serverRouteKey,
  windowKey,
} from './os-experiment/utils'
import { OsBuiltinWindowContent, OsFileWindowContent } from './os-experiment/window-content'

const OS_BUILTIN_APP_KEYS: readonly OsBuiltinAppKey[] = [
  'workspace',
  'app-store',
  'shop',
  'settings',
  'profile',
  'server-settings',
  'shadow-cloud',
  'discover',
  'my-buddies',
]

type DockIconVisibility = 'hidden' | 'pinned'
type DockIconState = Record<string, DockIconVisibility>

const OS_DOCK_ICON_STATE_STORAGE_KEY = 'shadow:os-dock-icon-state:v1'
const DEFAULT_HIDDEN_DOCK_ICON_KEYS = new Set(['builtin:shadow-cloud', 'builtin:shop'])

function builtinDockIconKey(key: OsBuiltinAppKey) {
  return `builtin:${key}`
}

function appDockIconKey(appKey: string) {
  return `app:${appKey}`
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
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [windows, setWindows] = useState<OsWindowState[]>([])
  const [openChannelTabs, setOpenChannelTabs] = useState<Omit<OsChannelTab, 'active'>[]>([])
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null)
  const [channelBubbleRequest, setChannelBubbleRequest] = useState<{
    channelId: string
    nonce: number
  } | null>(null)
  const [desktopFiles, setDesktopFiles] = useState<OsDesktopFile[]>([])
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null)
  const [pendingOsCommand, setPendingOsCommand] = useState<OsCommandDetail | null>(null)
  const [dockIconState, setDockIconState] = useState<DockIconState>(() => readDockIconState())
  const [dockIconContextMenu, setDockIconContextMenu] = useState<{
    x: number
    y: number
    target: { iconKey: string; hidden: boolean }
  } | null>(null)
  const [inboxBubbleRequest, setInboxBubbleRequest] = useState<{
    agentId?: string
    channelId?: string
    nonce: number
  } | null>(null)
  const [localMessageUnread, setLocalMessageUnread] = useState<Record<string, number>>({})
  const windowsRef = useRef(windows)
  const focusedWindowIdRef = useRef(focusedWindowId)
  const selectedServerIdRef = useRef<string | null>(null)
  const resizeSessionRef = useRef<{ id: string; windows: OsWindowState[] } | null>(null)
  const localUnreadEventIdsRef = useRef<Set<string>>(new Set())
  const isRestoringWindowsRef = useRef(false)
  const isRestoringDesktopRef = useRef(false)
  const initialContextOpenedRef = useRef<string | null>(null)

  const { data: servers = [], isLoading: isServersLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const selectedServer =
    servers.find((entry) => entry.server.id === selectedServerId) ?? servers[0] ?? null
  const selectedServerSlug = serverRouteKey(selectedServer?.server)

  const { data: channels = [] } = useQuery({
    queryKey: ['os-server-channels', selectedServerSlug],
    queryFn: () => fetchApi<ChannelMeta[]>(`/api/servers/${selectedServerSlug}/channels`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: apps = [], isLoading: isAppsLoading } = useQuery({
    queryKey: ['os-server-apps', selectedServerSlug, i18n.language],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${selectedServerSlug}/apps`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: inboxes = [], isLoading: isInboxesLoading } = useQuery({
    queryKey: ['os-server-inboxes', selectedServerSlug],
    queryFn: () => fetchApi<BuddyInboxEntry[]>(`/api/servers/${selectedServerSlug}/inboxes`),
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const { data: workspaceRootNodes = [] } = useQuery({
    queryKey: ['os-workspace-root', selectedServerSlug],
    queryFn: async () => {
      const nodes = await fetchApi<WorkspaceNode[]>(
        `/api/servers/${selectedServerSlug}/workspace/tree`,
      )
      return nodes
        .filter((node) => node.parentId === null)
        .sort((left, right) => left.pos - right.pos || left.name.localeCompare(right.name))
    },
    enabled: Boolean(selectedServerSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

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
        icon: <Folder size={25} strokeWidth={2.2} />,
        toneClassName: osBuiltinIconToneClassName('workspace'),
      },
      {
        key: 'discover' as const,
        label: t('os.discoverApp'),
        icon: <Compass size={25} strokeWidth={2.2} />,
        toneClassName: osBuiltinIconToneClassName('discover'),
      },
      {
        key: 'app-store' as const,
        label: t('os.appStoreApp'),
        icon: <Store size={25} strokeWidth={2.2} />,
        toneClassName: osBuiltinIconToneClassName('app-store'),
      },
      {
        key: 'shop' as const,
        label: t('os.shopApp'),
        icon: <ShoppingBag size={25} strokeWidth={2.2} />,
        toneClassName: osBuiltinIconToneClassName('shop'),
      },
      {
        key: 'settings' as const,
        label: t('settings.sectionSettings'),
        icon: <Settings size={25} strokeWidth={2.2} />,
        toneClassName: osBuiltinIconToneClassName('settings'),
      },
      {
        key: 'shadow-cloud' as const,
        label: t('os.shadowCloudApp'),
        icon: <Cloud size={25} strokeWidth={2.2} />,
        toneClassName: osBuiltinIconToneClassName('shadow-cloud'),
      },
      {
        key: 'my-buddies' as const,
        label: t('os.myBuddiesApp'),
        icon: <PawPrint size={25} strokeWidth={2.2} />,
        toneClassName: osBuiltinIconToneClassName('my-buddies'),
      },
    ],
    [t],
  )

  useEffect(() => {
    windowsRef.current = windows
  }, [windows])

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
  })

  const recordOsMessageActivity = useCallback(
    (event: { id?: string; channelId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
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
    [activeChannelTabId, openChannelTabs, queryClient],
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
          ? { ...item, maximized: true, minimized: false }
          : item,
      )
    setOpenChannelTabs([])
    setActiveChannelTabId(null)
    setChannelBubbleRequest(null)
    setLocalMessageUnread({})
    isRestoringDesktopRef.current = true
    setDesktopFiles(
      loadOsDesktopFiles(selectedServerId).map((file) => ({
        ...file,
        ...snapDesktopPoint({ x: file.x, y: file.y }),
      })),
    )
    isRestoringWindowsRef.current = true
    setWindows(restoredWindows)
    setFocusedWindowId(
      restoredWindows.some((item) => item.id === restored?.focusedWindowId)
        ? (restored?.focusedWindowId ?? null)
        : null,
    )
  }, [selectedServerId, setActiveServer])

  useEffect(() => {
    if (!selectedServerId) return
    if (isRestoringDesktopRef.current) {
      isRestoringDesktopRef.current = false
      return
    }
    saveOsDesktopFiles(selectedServerId, desktopFiles)
  }, [desktopFiles, selectedServerId])

  useEffect(() => {
    if (!selectedServerId) return
    if (isRestoringWindowsRef.current) {
      isRestoringWindowsRef.current = false
      return
    }
    saveOsServerWindowState(selectedServerId, { windows, focusedWindowId })
  }, [focusedWindowId, selectedServerId, windows])

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
      const topZ = Math.max(10, ...current.map((item) => item.z)) + 1
      return current.map((item) =>
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
        focusWindow(existingWindow.id)
        return
      }
      setWindows((current) => {
        const existing = findSemanticWindow(current, id, input)
        const topZ = Math.max(10, ...current.map((item) => item.z)) + 1
        if (existing) {
          return current.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
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
        const offset = (current.length % 5) * 28
        const size =
          input.kind === 'builtin'
            ? input.builtinKey === 'workspace'
              ? { width: 1080, height: 700 }
              : input.builtinKey === 'discover'
                ? { width: 1180, height: 740 }
                : input.builtinKey === 'shadow-cloud'
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
          ...current,
          {
            id,
            kind: input.kind,
            title: input.title,
            subtitle: input.subtitle,
            channelId: input.channelId,
            appKey: input.appKey,
            builtinKey: input.builtinKey,
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

  const openBuiltinWindow = useCallback(
    (key: OsBuiltinAppKey) => {
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
        return
      }
      openBuiltinWindow('workspace')
    },
    [openBuiltinWindow, openWorkspaceFileWindow],
  )

  const pinWorkspaceFileToDesktop = useCallback(
    (node: WorkspaceNode, point?: { x: number; y: number }) => {
      setDesktopFiles((current) => {
        const existingIndex = current.findIndex((item) => item.node.id === node.id)
        const position = point ?? defaultDesktopFilePosition(current.length)
        if (existingIndex >= 0) {
          return current.map((item, index) =>
            index === existingIndex ? { ...item, node, ...position } : item,
          )
        }
        return [
          ...current,
          {
            id: node.id,
            node,
            source: 'pinned',
            ...position,
          },
        ]
      })
    },
    [],
  )

  const moveDesktopFile = useCallback(
    (id: string, point: { x: number; y: number }) => {
      setDesktopFiles((current) => {
        const existingIndex = current.findIndex((item) => item.id === id)
        if (existingIndex >= 0) {
          return current.map((item, index) =>
            index === existingIndex ? { ...item, ...point } : item,
          )
        }
        const rootNode = workspaceRootNodes.find((node) => node.id === id)
        if (!rootNode) return current
        return [
          ...current,
          {
            id,
            node: rootNode,
            source: 'workspace-root',
            ...point,
          },
        ]
      })
    },
    [workspaceRootNodes],
  )

  const removeDesktopFile = useCallback((id: string) => {
    setDesktopFiles((current) => current.filter((item) => item.id !== id))
  }, [])

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
        toneClassName: app.toneClassName,
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
          icon:
            window.builtinKey === 'profile' ? (
              <AppWindow size={18} />
            ) : (
              <Settings size={18} className={osBuiltinIconToneClassName(window.builtinKey)} />
            ),
          toneClassName: osBuiltinIconToneClassName(window.builtinKey),
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
    [dockIconContextMenu, setDockIconVisibility, t],
  )
  const desktopItems = useMemo(() => {
    const storedByNodeId = new Map(desktopFiles.map((item) => [item.node.id, item]))
    const rootIds = new Set(workspaceRootNodes.map((node) => node.id))
    const rootItems = workspaceRootNodes.map((node, index) => {
      const stored = storedByNodeId.get(node.id)
      return {
        id: node.id,
        node,
        source: 'workspace-root' as const,
        ...(stored ? { x: stored.x, y: stored.y } : defaultDesktopFilePosition(index)),
      }
    })
    const pinnedItems = desktopFiles
      .filter((item) => !rootIds.has(item.node.id))
      .map((item) => ({ ...item, source: 'pinned' as const }))
    return [...rootItems, ...pinnedItems]
  }, [desktopFiles, workspaceRootNodes])

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
        <header className="absolute left-0 right-0 top-0 z-[400] flex h-10 items-center gap-2 border-b border-white/12 bg-black/30 px-3 text-white backdrop-blur-2xl">
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
      <OsBackground />
      <OsTopBar
        selectedServer={selectedServer}
        selectedServerSlug={selectedServerSlug}
        servers={servers}
        channels={activeChannels}
        inboxes={inboxes}
        channelTabs={channelTabs}
        channelBubbleRequest={channelBubbleRequest}
        inboxBubbleRequest={inboxBubbleRequest}
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

      <main className="absolute inset-0">
        <OsDesktop
          files={desktopItems}
          serverId={selectedServerSlug}
          onOpenFile={openWorkspaceDesktopNode}
          onPinFile={pinWorkspaceFileToDesktop}
          onMoveFile={moveDesktopFile}
          onRemoveFile={removeDesktopFile}
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
                onPinWorkspaceFile={pinWorkspaceFileToDesktop}
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

      <div
        className="absolute bottom-1 left-1/2 z-[450] flex max-w-[calc(100%-1.25rem)] -translate-x-1/2 items-center gap-1 overflow-visible rounded-[18px] border border-white/18 bg-black/28 px-1.5 py-1 shadow-[0_16px_52px_rgba(0,0,0,0.30)] backdrop-blur-2xl"
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
            className={cn(
              app.toneClassName,
              app.key === 'workspace'
                ? 'hover:text-cyan-100'
                : app.key === 'discover'
                  ? 'hover:text-emerald-100'
                  : app.key === 'app-store'
                    ? 'hover:text-violet-100'
                    : app.key === 'shop'
                      ? 'hover:text-amber-100'
                      : app.key === 'settings'
                        ? 'hover:text-lime-100'
                        : app.key === 'shadow-cloud'
                          ? 'hover:text-sky-100'
                          : 'hover:text-fuchsia-100',
            )}
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
              icon={<AppIcon iconUrl={app.iconUrl} className="h-full w-full rounded-xl" />}
              onClick={() => openAppWindow(app)}
              onContextMenu={(event) => openDockIconContextMenu(event, appDockIconKey(app.appKey))}
              surface="bare"
              wrapIcon={false}
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
          zIndex={760}
          onClose={() => setDockIconContextMenu(null)}
        />
      ) : null}
    </div>
  )
}
