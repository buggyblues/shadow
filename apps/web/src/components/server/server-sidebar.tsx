import {
  Avatar,
  AvatarFallback,
  Button,
  cn,
  GlassPanel,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ServerAvatar,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  Check,
  Cloud,
  Compass,
  Copy,
  Globe,
  Lock,
  LogOut,
  MessageCircle,
  PawPrint,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  UserPlus,
  Volume2,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeferredQueryEnabled } from '../../hooks/use-deferred-query-enabled'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { clearLastChannelId, getLastChannelId, setLastChannelId } from '../../lib/last-channel'
import { scheduleIdleAfterDelay } from '../../lib/schedule'
import { showToast } from '../../lib/toast'
import { UnifiedContactSidebar } from '../../pages/friends'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import {
  CLOUD_RUNTIME_LABELS,
  type CloudBuddyRuntimeId,
  CreateAgentDialog,
  getBuddyIntroPrompt,
  RuntimeIcon,
} from '../buddy-management/agent-dialogs'
import { DesktopConnectorDownloadCard } from '../buddy-management/desktop-connector-download-card'
import {
  type Agent,
  type ConnectorComputer,
  type ConnectorRuntimeInfo,
  connectorComputerDisplayName,
  connectorRuntimeDisplayDetail,
} from '../buddy-management/types'
import { UserAvatar } from '../common/avatar'
import { useConfirmStore } from '../common/confirm-dialog'
import { ContextMenu } from '../common/context-menu'
import { InvitePanel } from '../common/invite-panel'

const SERVER_NAVIGATION_STALE_MS = 5 * 60 * 1000
const SERVER_NAVIGATION_GC_MS = 30 * 60 * 1000

interface ServerEntry {
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
    ownerId: string
    isPublic?: boolean
  }
  member: { role: string }
}

interface DirectChannelEntry {
  id: string
  lastMessageAt: string | null
  createdAt: string
  otherUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  } | null
}

interface ServerNavigationChannel {
  id: string
  type?: string
  isArchived?: boolean
}

type ConnectorBootstrapResult = {
  computer: ConnectorComputer
  command: string
}

function availableRuntimes(computer: ConnectorComputer | null | undefined) {
  return (computer?.runtimes ?? []).filter((runtime) => runtime.status === 'available')
}

function runtimeSortKey(runtime: ConnectorRuntimeInfo) {
  const priority: Record<string, number> = {
    openclaw: 0,
    hermes: 1,
    'claude-code': 2,
    codex: 3,
    opencode: 4,
    gemini: 5,
  }
  return priority[runtime.id] ?? 50
}

const directStatusColors: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
}

function normalizePresenceStatus(status?: string | null) {
  return status === 'online' || status === 'idle' || status === 'dnd' ? status : 'offline'
}

function pickServerNavigationChannel(channels: ServerNavigationChannel[]) {
  return (
    channels.find((channel) => !channel.isArchived && channel.type !== 'voice') ??
    channels.find((channel) => !channel.isArchived) ??
    channels[0] ??
    null
  )
}

// Individual server item component to properly use hooks
const ServerItem = memo(function ServerItem({
  server,
  member,
  isActive,
  unreadCount,
  isMuted,
  onSelect,
  onContextMenu,
}: {
  server: ServerEntry['server']
  member: ServerEntry['member']
  isActive: boolean
  unreadCount: number
  isMuted: boolean
  onSelect: (id: string, slug?: string | null) => void
  onContextMenu: (e: React.MouseEvent, serverEntry: ServerEntry) => void
}) {
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      onContextMenu(e, { server, member })
    },
    [onContextMenu, server, member],
  )

  return (
    <div className="relative shrink-0 flex items-center justify-center group/item w-[56px] h-[56px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(server.id, server.slug)}
            onContextMenu={handleContextMenu}
            className={cn(
              'w-[56px] h-[56px] transition-all duration-300 flex items-center justify-center overflow-visible bouncy',
              isActive
                ? // Server item should be rounded rect to distinguish from user avatar, with stronger highlight when active
                  'rounded-3xl ring-[3px] ring-primary ring-offset-2 ring-offset-bg-deep shadow-[0_0_24px_rgba(0,243,255,0.4)]'
                : 'rounded-3xl ring-0 hover:ring-[3px] hover:ring-primary/50 hover:shadow-[0_0_16px_rgba(0,243,255,0.15)] opacity-80 hover:opacity-100',
            )}
          >
            <ServerAvatar iconUrl={server.iconUrl} name={server.name} />{' '}
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="right"
            className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
          >
            {server.name}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      {server.isPublic === false && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-bg-deep/80 backdrop-blur flex items-center justify-center shadow-sm">
          <Lock size={10} className="text-text-muted" />
        </span>
      )}
      {unreadCount > 0 && !isMuted && (
        <span className="absolute -bottom-0.5 -right-0.5 min-w-[12px] h-3 rounded-full border-2 border-[#12121a] bg-danger shadow-[0_0_8px_rgba(239,68,68,0.45)] z-10" />
      )}
    </div>
  )
})

const DirectMessageItem = memo(function DirectMessageItem({
  channel,
  isActive,
  unreadCount,
  onSelect,
}: {
  channel: DirectChannelEntry
  isActive: boolean
  unreadCount: number
  onSelect: (id: string) => void
}) {
  const peer = channel.otherUser
  if (!peer) return null
  const displayName = peer.displayName ?? peer.username
  const status = normalizePresenceStatus(peer.status)

  return (
    <div className="relative shrink-0 flex items-center justify-center group/item w-[56px] h-[56px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(channel.id)}
            className={cn(
              'w-[56px] h-[56px] rounded-full transition-all duration-300 flex items-center justify-center overflow-visible bouncy',
              isActive
                ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-bg-deep shadow-[0_0_24px_rgba(0,243,255,0.4)]'
                : 'ring-0 hover:ring-[3px] hover:ring-primary/50 hover:shadow-[0_0_16px_rgba(0,243,255,0.15)] opacity-80 hover:opacity-100',
            )}
          >
            <UserAvatar
              userId={peer.id}
              avatarUrl={peer.avatarUrl}
              displayName={displayName}
              size="md"
              className="w-[50px] h-[50px]"
            />
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="right"
            className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
          >
            {displayName}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-[#12121a] z-10',
          directStatusColors[status] ?? directStatusColors.offline,
        )}
      />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[12px] h-3 rounded-full border-2 border-[#12121a] bg-danger shadow-[0_0_8px_rgba(239,68,68,0.45)] z-20" />
      )}
    </div>
  )
})

interface NotificationPreference {
  strategy: 'all' | 'mention_only' | 'none'
  mutedServerIds: string[]
  mutedChannelIds: string[]
}

interface ScopedUnread {
  channelUnread: Record<string, number>
  serverUnread: Record<string, number>
}

type QuickBuddyStep = 'basic' | 'advanced'
type CreateBuddyTarget = 'local' | 'cloud'

const CLOUD_BUDDY_RUNTIME_OPTIONS: Array<{
  id: CloudBuddyRuntimeId
  label: string
  descriptionKey: string
}> = [
  {
    id: 'openclaw',
    label: CLOUD_RUNTIME_LABELS.openclaw,
    descriptionKey: 'agentMgmt.cloudRuntimeOpenClawDesc',
  },
  {
    id: 'hermes',
    label: CLOUD_RUNTIME_LABELS.hermes,
    descriptionKey: 'agentMgmt.cloudRuntimeHermesDesc',
  },
  {
    id: 'claude-code',
    label: CLOUD_RUNTIME_LABELS['claude-code'],
    descriptionKey: 'agentMgmt.cloudRuntimeClaudeCodeDesc',
  },
  {
    id: 'codex',
    label: CLOUD_RUNTIME_LABELS.codex,
    descriptionKey: 'agentMgmt.cloudRuntimeCodexDesc',
  },
  {
    id: 'opencode',
    label: CLOUD_RUNTIME_LABELS.opencode,
    descriptionKey: 'agentMgmt.cloudRuntimeOpenCodeDesc',
  },
  {
    id: 'gemini',
    label: CLOUD_RUNTIME_LABELS.gemini,
    descriptionKey: 'agentMgmt.cloudRuntimeGeminiDesc',
  },
]

export function ServerSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { channelId } = useParams({ strict: false }) as { channelId?: string }
  const queryClient = useQueryClient()
  const activeServerId = useChatStore((state) => state.activeServerId)
  const activeChannelId = useChatStore((state) => state.activeChannelId)
  const setActiveServer = useChatStore((state) => state.setActiveServer)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showDmPicker, setShowDmPicker] = useState(false)
  const [showCreateBuddy, setShowCreateBuddy] = useState(false)
  const [quickBuddyStep, setQuickBuddyStep] = useState<QuickBuddyStep>('basic')
  const [createBuddyTarget, setCreateBuddyTarget] = useState<CreateBuddyTarget>('local')
  const [selectedCloudRuntimeId, setSelectedCloudRuntimeId] =
    useState<CloudBuddyRuntimeId>('openclaw')
  const [selectedConnectorComputerId, setSelectedConnectorComputerId] = useState<string | null>(
    null,
  )
  const [selectedConnectorRuntimeId, setSelectedConnectorRuntimeId] = useState<string | null>(null)
  const [connectorSelectionConfirmed, setConnectorSelectionConfirmed] = useState(false)
  const [connectorCommand, setConnectorCommand] = useState<string | null>(null)
  const [isWaitingForDesktopConnector, setIsWaitingForDesktopConnector] = useState(false)
  const [newName, setNewName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [copiedId, setCopiedId] = useState(false)
  const [inviteServerId, setInviteServerId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    server: ServerEntry
  } | null>(null)
  const scopeReadCooldownRef = useRef<Map<string, number>>(new Map())
  const scopeReadInFlightRef = useRef<Set<string>>(new Set())
  const serverNavigationRequestRef = useRef(0)
  const connectorBootstrapStartedRef = useRef(false)
  const { user } = useAuthStore()
  const createServerNameInputRef = useRef<HTMLInputElement>(null)
  const loadServerNavigation = useDeferredQueryEnabled({
    stage: 'navigation',
    priority: 'high',
  })
  const loadNotifications = useDeferredQueryEnabled({
    stage: 'background',
    priority: 'low',
    delayMs: 2200,
  })

  // Listen for 'create-server' pending action from task center
  const pendingAction = useUIStore((s) => s.pendingAction)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'create-server') {
      setShowCreate(true)
      setPendingAction(null)
    }
  }, [pendingAction, setPendingAction])

  useEffect(() => {
    if (showCreate) {
      requestAnimationFrame(() => createServerNameInputRef.current?.focus())
    }
  }, [showCreate])

  const { data: servers = [], isLoading: isServersLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
    enabled: loadServerNavigation,
    staleTime: SERVER_NAVIGATION_STALE_MS,
    gcTime: SERVER_NAVIGATION_GC_MS,
    placeholderData: (previous) => previous,
  })
  const showServerSkeleton = servers.length === 0 && (!loadServerNavigation || isServersLoading)

  const { data: directChannels = [] } = useQuery({
    queryKey: ['direct-channels'],
    queryFn: () => fetchApi<DirectChannelEntry[]>('/api/channels/dm'),
    enabled: loadServerNavigation,
    staleTime: SERVER_NAVIGATION_STALE_MS,
    gcTime: SERVER_NAVIGATION_GC_MS,
    placeholderData: (previous) => previous,
  })

  const { data: scopedUnread } = useQuery({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
    enabled: loadNotifications,
    staleTime: 5_000,
    refetchInterval: 15_000,
  })

  const { data: connectorData, isFetching: isConnectorFetching } = useQuery({
    queryKey: ['connector-computers'],
    queryFn: () => fetchApi<{ computers: ConnectorComputer[] }>('/api/connector/computers'),
    enabled: showCreateBuddy && createBuddyTarget === 'local',
    refetchInterval:
      showCreateBuddy && createBuddyTarget === 'local' && isWaitingForDesktopConnector
        ? 3000
        : false,
  })

  const connectorComputers = connectorData?.computers ?? []
  const connectorRuntimeOptions = useMemo(
    () =>
      connectorComputers
        .flatMap((computer) =>
          availableRuntimes(computer).map((runtime) => ({
            key: `${computer.id}:${runtime.id}`,
            computer,
            runtime,
          })),
        )
        .sort(
          (a, b) =>
            runtimeSortKey(a.runtime) - runtimeSortKey(b.runtime) ||
            a.runtime.label.localeCompare(b.runtime.label),
        ),
    [connectorComputers],
  )
  const selectedConnectorRuntimeOption =
    connectorRuntimeOptions.find(
      (option) =>
        option.computer.id === selectedConnectorComputerId &&
        option.runtime.id === selectedConnectorRuntimeId,
    ) ??
    connectorRuntimeOptions[0] ??
    null
  const selectedConnectorComputer = selectedConnectorRuntimeOption?.computer ?? null
  const selectedConnectorRuntime = selectedConnectorRuntimeOption?.runtime ?? null
  const connectorRuntimeOptionKeys = connectorRuntimeOptions
    .map((option) => option.key)
    .join('\u0000')
  const canCreateConnectorBuddy = Boolean(selectedConnectorRuntimeOption)
  const selectedCloudRuntime =
    CLOUD_BUDDY_RUNTIME_OPTIONS.find((option) => option.id === selectedCloudRuntimeId) ??
    CLOUD_BUDDY_RUNTIME_OPTIONS[0]
  const canContinueCreateBuddy =
    createBuddyTarget === 'cloud' ? Boolean(selectedCloudRuntime) : canCreateConnectorBuddy
  const isCreateBuddyDetailsStep = connectorSelectionConfirmed && canContinueCreateBuddy

  const connectorBootstrap = useMutation({
    mutationFn: () =>
      fetchApi<ConnectorBootstrapResult>('/api/connector/computers/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          serverUrl: window.location.origin,
          name: t('agentMgmt.connectorDefaultComputerName'),
        }),
      }),
    onSuccess: (result) => {
      setConnectorCommand(result.command)
      queryClient.invalidateQueries({ queryKey: ['connector-computers'] })
    },
    onError: (error: Error) => {
      showToast(error.message || t('agentMgmt.connectorCreateFailed'), 'error')
    },
  })

  const { data: notificationPreference } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => fetchApi<NotificationPreference>('/api/notifications/preferences'),
    enabled: loadNotifications,
    staleTime: 60_000,
  })

  const sortedServers = useMemo(() => {
    return servers
      .map((entry, index) => ({
        entry,
        index,
        unreadCount: scopedUnread?.serverUnread?.[entry.server.id] ?? 0,
      }))
      .sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount
        return a.index - b.index
      })
      .map((item) => item.entry)
  }, [scopedUnread?.serverUnread, servers])

  const sortedDirectChannels = useMemo(() => {
    return [...directChannels]
      .filter((channel) => {
        const peer = channel.otherUser
        if (!peer) return false
        return !(peer.isBot && normalizePresenceStatus(peer.status) === 'offline')
      })
      .sort((a, b) => {
        const aUnread = scopedUnread?.channelUnread?.[a.id] ?? 0
        const bUnread = scopedUnread?.channelUnread?.[b.id] ?? 0
        if (aUnread !== bUnread) return bUnread - aUnread
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bTime - aTime
      })
  }, [directChannels, scopedUnread?.channelUnread])

  const isQuickBuddyAdvanced = quickBuddyStep === 'advanced'

  useEffect(() => {
    if (!showCreateBuddy || createBuddyTarget !== 'local' || connectorData === undefined) return
    if (
      connectorRuntimeOptions.length > 0 ||
      connectorCommand ||
      connectorBootstrap.isPending ||
      connectorBootstrapStartedRef.current
    ) {
      return
    }
    connectorBootstrapStartedRef.current = true
    connectorBootstrap.mutate()
  }, [
    connectorBootstrap,
    connectorCommand,
    connectorRuntimeOptions.length,
    connectorData,
    createBuddyTarget,
    showCreateBuddy,
  ])

  useEffect(() => {
    if (!showCreateBuddy || createBuddyTarget !== 'local') return
    if (!connectorRuntimeOptionKeys) {
      if (selectedConnectorComputerId) setSelectedConnectorComputerId(null)
      if (selectedConnectorRuntimeId) setSelectedConnectorRuntimeId(null)
      return
    }
    if (!selectedConnectorRuntimeOption) return
    if (selectedConnectorComputerId !== selectedConnectorRuntimeOption.computer.id) {
      setSelectedConnectorComputerId(selectedConnectorRuntimeOption.computer.id)
    }
    if (selectedConnectorRuntimeId !== selectedConnectorRuntimeOption.runtime.id) {
      setSelectedConnectorRuntimeId(selectedConnectorRuntimeOption.runtime.id)
    }
  }, [
    connectorRuntimeOptionKeys,
    createBuddyTarget,
    selectedConnectorComputerId,
    selectedConnectorRuntimeId,
    selectedConnectorRuntimeOption,
    showCreateBuddy,
  ])

  useEffect(() => {
    if (connectorRuntimeOptions.length > 0 && isWaitingForDesktopConnector) {
      setIsWaitingForDesktopConnector(false)
    }
  }, [connectorRuntimeOptions.length, isWaitingForDesktopConnector])

  const updateNotificationPreference = useMutation({
    mutationFn: (payload: Partial<NotificationPreference>) =>
      fetchApi<NotificationPreference>('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const createServer = useMutation({
    mutationFn: ({ name, isPublic }: { name: string; isPublic: boolean }) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreate(false)
      setNewName('')
      setIsPublic(true)
      handleSelect(data.id, data.slug)
    },
  })

  const requestMarkScopeRead = useCallback(
    async (payload: { serverId?: string; channelId?: string }) => {
      const key = payload.channelId
        ? `channel:${payload.channelId}`
        : payload.serverId
          ? `server:${payload.serverId}`
          : ''
      if (!key) return

      const now = Date.now()
      const last = scopeReadCooldownRef.current.get(key) ?? 0
      if (now - last < 1200) return
      if (scopeReadInFlightRef.current.has(key)) return

      scopeReadCooldownRef.current.set(key, now)
      scopeReadInFlightRef.current.add(key)
      try {
        await fetchApi('/api/notifications/read-scope', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      } finally {
        scopeReadInFlightRef.current.delete(key)
      }
    },
    [queryClient],
  )

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  useSocketEvent('server:joined', () => {
    queryClient.invalidateQueries({ queryKey: ['servers'] })
  })

  useSocketEvent('message:new', () => {
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  useSocketEvent('message:created', () => {
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  useSocketEvent('presence:change', () => {
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  useSocketEvent('connector:computer-updated', () => {
    queryClient.invalidateQueries({ queryKey: ['connector-computers'] })
  })

  useSocketEvent('connector:job-updated', () => {
    queryClient.invalidateQueries({ queryKey: ['agents'] })
  })

  const joinServer = useMutation({
    mutationFn: (inviteCode: string) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowJoin(false)
      setJoinCode('')
      handleSelect(data.id, data.slug)
    },
  })

  const setMobileView = useUIStore((state) => state.setMobileView)

  const leaveServer = useMutation({
    mutationFn: (serverId: string) =>
      fetchApi(`/api/servers/${serverId}/leave`, { method: 'POST' }),
    onSuccess: (_data, serverId) => {
      clearLastChannelId(serverId)
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.removeQueries({ queryKey: ['server', serverId] })
      queryClient.removeQueries({ queryKey: ['channels', serverId] })
      setContextMenu(null)
      setActiveServer(null)
      navigate({ to: '/' })
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('server.deleteServerFailed'), 'error')
    },
  })

  const deleteServer = useMutation({
    mutationFn: (serverId: string) => fetchApi(`/api/servers/${serverId}`, { method: 'DELETE' }),
    onSuccess: (_data, serverId) => {
      clearLastChannelId(serverId)
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.removeQueries({ queryKey: ['server', serverId] })
      queryClient.removeQueries({ queryKey: ['channels', serverId] })
      setContextMenu(null)
      setActiveServer(null)
      navigate({ to: '/' })
    },
  })

  const handleContextMenu = useCallback((e: React.MouseEvent, server: ServerEntry) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, server })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const closeCreateBuddy = useCallback(() => {
    setShowCreateBuddy(false)
    setQuickBuddyStep('basic')
    setCreateBuddyTarget('local')
    setSelectedCloudRuntimeId('openclaw')
    setSelectedConnectorComputerId(null)
    setSelectedConnectorRuntimeId(null)
    setConnectorSelectionConfirmed(false)
    setConnectorCommand(null)
    setIsWaitingForDesktopConnector(false)
    connectorBootstrapStartedRef.current = false
  }, [])

  const openFirstChannelForServer = useCallback(
    async (serverId: string, serverSlug: string, requestId: number) => {
      try {
        const channels = await queryClient.fetchQuery({
          queryKey: ['channels', serverSlug],
          queryFn: ({ signal }) =>
            fetchApi<ServerNavigationChannel[]>(`/api/servers/${serverSlug}/channels`, {
              signal,
            }),
          staleTime: SERVER_NAVIGATION_STALE_MS,
          gcTime: SERVER_NAVIGATION_GC_MS,
        })
        if (serverNavigationRequestRef.current !== requestId) return

        const channel = pickServerNavigationChannel(channels)
        if (channel) {
          setLastChannelId(serverId, channel.id)
          navigate({
            to: '/servers/$serverSlug/channels/$channelId',
            params: { serverSlug, channelId: channel.id },
          })
          return
        }
      } catch (error) {
        if (serverNavigationRequestRef.current !== requestId) return
        if ((error as { name?: string }).name === 'AbortError') return
      }

      if (serverNavigationRequestRef.current === requestId) {
        navigate({ to: '/servers/$serverSlug', params: { serverSlug } })
      }
    },
    [navigate, queryClient],
  )

  const handleSelect = useCallback(
    (serverId: string, slug?: string | null) => {
      setActiveServer(serverId)
      setMobileView('channels')
      const serverSlug = slug ?? serverId
      const requestId = ++serverNavigationRequestRef.current
      // Navigate directly into chat; the server index triggers a slower first-paint waterfall.
      const lastChannelId = getLastChannelId(serverId)
      if (lastChannelId) {
        navigate({
          to: '/servers/$serverSlug/channels/$channelId',
          params: { serverSlug, channelId: lastChannelId },
        })
      } else {
        void openFirstChannelForServer(serverId, serverSlug, requestId)
      }
      scheduleIdleAfterDelay(() => {
        void requestMarkScopeRead({ serverId })
      }, 1800)
      onNavigate?.()
    },
    [
      navigate,
      onNavigate,
      openFirstChannelForServer,
      requestMarkScopeRead,
      setActiveServer,
      setMobileView,
    ],
  )

  const handleSelectDirectChannel = useCallback(
    (dmChannelId: string) => {
      setActiveServer(null)
      setMobileView('chat')
      navigate({ to: '/dm/$dmChannelId', params: { dmChannelId } })
      scheduleIdleAfterDelay(() => {
        void requestMarkScopeRead({ channelId: dmChannelId })
      }, 1600)
      onNavigate?.()
    },
    [navigate, onNavigate, requestMarkScopeRead, setActiveServer, setMobileView],
  )

  const openCreatedBuddyDm = async (agent: Agent) => {
    const userId = agent.botUser?.id ?? agent.userId
    try {
      const data = await fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      })
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      await fetchApi(`/api/channels/${data.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: getBuddyIntroPrompt(t) }),
      }).catch(() => null)
      queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
      queryClient.invalidateQueries({ queryKey: ['messages', data.id] })
      closeCreateBuddy()
      handleSelectDirectChannel(data.id)
    } catch (error) {
      showToast((error as Error).message || t('agentMgmt.createFailed'), 'error')
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <GlassPanel className="w-[88px] !overflow-visible flex flex-col items-center py-4 shrink-0 h-full z-50">
        {/* User avatar → settings/profile */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: '/settings/buddy' })}
              className="w-[56px] h-[56px] rounded-full p-0 overflow-visible hover:ring-[3px] hover:ring-primary hover:shadow-[0_0_24px_rgba(0,243,255,0.4)] transition-all duration-300 flex items-center justify-center relative bouncy"
            >
              <Avatar
                avatarUrl={user?.avatarUrl}
                displayName={user?.displayName || user?.username}
                className="w-[56px] h-[56px]"
              >
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                  {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="right"
              className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
            >
              {user?.displayName || user?.username}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>

        <div className="w-8 h-0.5 bg-border/20 rounded-full my-1 shrink-0" />

        {/* Scrollable server list */}
        <div className="flex-1 overflow-y-auto overflow-x-visible px-4 flex flex-col items-center gap-3 min-h-0 py-3 scrollbar-hidden w-full">
          {showServerSkeleton
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[56px] w-[56px] shrink-0 animate-pulse rounded-3xl bg-white/8 ring-1 ring-white/5"
                />
              ))
            : sortedServers.map((s) => (
                <ServerItem
                  key={s.server.id}
                  server={s.server}
                  member={s.member}
                  isActive={activeServerId === s.server.id}
                  unreadCount={scopedUnread?.serverUnread?.[s.server.id] ?? 0}
                  isMuted={notificationPreference?.mutedServerIds?.includes(s.server.id) ?? false}
                  onSelect={handleSelect}
                  onContextMenu={handleContextMenu}
                />
              ))}
          {sortedDirectChannels.length > 0 && sortedServers.length > 0 && (
            <div className="w-8 h-0.5 bg-border/10 rounded-full shrink-0" />
          )}
          {sortedDirectChannels.map((channel) => (
            <DirectMessageItem
              key={channel.id}
              channel={channel}
              isActive={!activeServerId && activeChannelId === channel.id}
              unreadCount={scopedUnread?.channelUnread?.[channel.id] ?? 0}
              onSelect={handleSelectDirectChannel}
            />
          ))}
        </div>

        {/* Action buttons — fixed at bottom */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-4 shrink-0">
          <div className="w-8 h-0.5 bg-border/10 rounded-full mb-1" />
          <Tooltip open={showAddMenu ? false : undefined}>
            <TooltipTrigger asChild>
              <div>
                <Popover open={showAddMenu} onOpenChange={setShowAddMenu}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-[48px] h-[48px] rounded-2xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-primary transition-all bouncy"
                    >
                      <Plus size={22} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="end" className="w-56 p-2">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-text-secondary hover:bg-bg-tertiary/70 hover:text-text-primary"
                      onClick={() => {
                        setShowAddMenu(false)
                        setShowCreate(true)
                      }}
                    >
                      <Plus size={15} />
                      {t('server.addMenuServer')}
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-text-secondary hover:bg-bg-tertiary/70 hover:text-text-primary"
                      onClick={() => {
                        setShowAddMenu(false)
                        setQuickBuddyStep('basic')
                        setCreateBuddyTarget('local')
                        setSelectedCloudRuntimeId('openclaw')
                        setSelectedConnectorComputerId(null)
                        setSelectedConnectorRuntimeId(null)
                        setConnectorSelectionConfirmed(false)
                        setConnectorCommand(null)
                        connectorBootstrapStartedRef.current = false
                        setShowCreateBuddy(true)
                      }}
                    >
                      <PawPrint size={15} />
                      {t('server.addMenuBuddy')}
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-text-secondary hover:bg-bg-tertiary/70 hover:text-text-primary"
                      onClick={() => {
                        setShowAddMenu(false)
                        setShowDmPicker(true)
                      }}
                    >
                      <MessageCircle size={15} />
                      {t('server.addMenuDm')}
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
              >
                {t('server.add')}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-[48px] h-[48px] rounded-2xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-primary transition-all bouncy"
                onClick={() => window.dispatchEvent(new Event('shadow:open-command-palette'))}
                title={t('commandPalette.open')}
                aria-label={t('commandPalette.open')}
              >
                <Search size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
              >
                {t('commandPalette.open')}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          {/* Join server */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-[48px] h-[48px] rounded-2xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-primary transition-all bouncy"
                onClick={() => navigate({ to: '/cloud' })}
              >
                <Cloud size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
              >
                {t('server.shadowCloud')}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          {/* Discover servers */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-[48px] h-[48px] rounded-2xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-primary transition-all bouncy"
                onClick={() => navigate({ to: '/discover' })}
              >
                <Compass size={22} className="opacity-80" />
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
              >
                {t('server.discover')}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </div>

        <Modal open={showDmPicker} onClose={() => setShowDmPicker(false)}>
          <ModalContent maxWidth="max-w-sm" className="h-[560px]">
            <ModalHeader
              overline={t('server.addDm')}
              icon={<MessageCircle size={18} strokeWidth={2.5} />}
              title={t('server.addDm')}
              closeLabel={t('common.close', '关闭')}
            />
            <ModalBody className="min-h-0 flex-1 p-0">
              <UnifiedContactSidebar
                activeDirectChannelId={activeChannelId ?? null}
                filterMode="all"
                onSelectChannel={(id) => {
                  setShowDmPicker(false)
                  handleSelectDirectChannel(id)
                }}
                onStartChatWithUser={async (userId) => {
                  const data = await fetchApi<{ id: string }>('/api/channels/dm', {
                    method: 'POST',
                    body: JSON.stringify({ userId }),
                  })
                  queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
                  setShowDmPicker(false)
                  handleSelectDirectChannel(data.id)
                }}
              />
            </ModalBody>
          </ModalContent>
        </Modal>

        <Modal open={showCreateBuddy} onClose={closeCreateBuddy}>
          <ModalContent
            maxWidth={
              isQuickBuddyAdvanced || !isCreateBuddyDetailsStep ? 'max-w-2xl' : 'max-w-[560px]'
            }
            className={cn(
              'transition-[max-width,height] duration-300 ease-out max-h-[calc(100vh-48px)]',
              !isCreateBuddyDetailsStep
                ? createBuddyTarget === 'cloud'
                  ? 'h-[560px]'
                  : 'h-[520px]'
                : isQuickBuddyAdvanced
                  ? 'h-[520px]'
                  : 'h-[760px]',
            )}
          >
            <ModalHeader
              icon={<PawPrint size={18} strokeWidth={2.5} />}
              title={t('agentMgmt.createTitle')}
              closeLabel={t('common.close', '关闭')}
              onClose={closeCreateBuddy}
            />
            {isCreateBuddyDetailsStep ? (
              <CreateAgentDialog
                onClose={closeCreateBuddy}
                onSuccess={(agent) => {
                  queryClient.invalidateQueries({ queryKey: ['agents'] })
                  queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
                  queryClient.invalidateQueries({ queryKey: ['cloud-saas'] })
                  setQuickBuddyStep('basic')
                  showToast(t('agentMgmt.createSuccess'), 'success')
                  void openCreatedBuddyDm(agent)
                }}
                onError={(message) => showToast(message || t('agentMgmt.createFailed'), 'error')}
                t={t}
                embedded
                quick
                hideTitle
                modalSections
                onBack={() => {
                  setConnectorSelectionConfirmed(false)
                  setQuickBuddyStep('basic')
                }}
                onQuickStepChange={setQuickBuddyStep}
                connectorComputerId={
                  createBuddyTarget === 'local' ? selectedConnectorComputer?.id : undefined
                }
                connectorRuntimeId={
                  createBuddyTarget === 'local' ? selectedConnectorRuntime?.id : undefined
                }
                connectorRuntimeLabel={
                  createBuddyTarget === 'local' ? selectedConnectorRuntime?.label : undefined
                }
                serverUrl={createBuddyTarget === 'local' ? window.location.origin : undefined}
                cloudRuntimeId={
                  createBuddyTarget === 'cloud' ? selectedCloudRuntime?.id : undefined
                }
                cloudRuntimeLabel={
                  createBuddyTarget === 'cloud' ? selectedCloudRuntime?.label : undefined
                }
              />
            ) : (
              <>
                <ModalBody className="min-h-0 space-y-5 overflow-y-auto py-5">
                  <div
                    role="tablist"
                    aria-label={t('agentMgmt.createRunTarget')}
                    className="grid grid-cols-2 rounded-2xl border border-border-subtle bg-bg-deep/40 p-1"
                  >
                    {(['local', 'cloud'] as const).map((target) => {
                      const selected = createBuddyTarget === target
                      const Icon = target === 'cloud' ? Cloud : Terminal
                      return (
                        <button
                          key={target}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => {
                            setCreateBuddyTarget(target)
                            setConnectorSelectionConfirmed(false)
                            setIsWaitingForDesktopConnector(false)
                            setQuickBuddyStep('basic')
                          }}
                          className={cn(
                            'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition',
                            selected
                              ? 'bg-primary/15 text-primary shadow-sm'
                              : 'text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary',
                          )}
                        >
                          <Icon size={16} />
                          <span>
                            {t(
                              target === 'cloud'
                                ? 'agentMgmt.createRunTargetCloud'
                                : 'agentMgmt.createRunTargetLocal',
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {createBuddyTarget === 'local' ? (
                    <>
                      {connectorRuntimeOptions.length === 0 && (
                        <DesktopConnectorDownloadCard
                          connectorCommand={connectorCommand}
                          isWaitingForConnector={isWaitingForDesktopConnector}
                          onWaitingForConnectorChange={setIsWaitingForDesktopConnector}
                          t={t}
                        />
                      )}

                      {connectorComputers.some((computer) => computer.runtimes.length > 0) && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                              {t('agentMgmt.connectorRuntime')}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                queryClient.invalidateQueries({
                                  queryKey: ['connector-computers'],
                                })
                              }
                              disabled={isConnectorFetching}
                            >
                              <RefreshCw
                                size={14}
                                className={cn(isConnectorFetching && 'animate-spin')}
                              />
                              {t('common.refresh')}
                            </Button>
                          </div>
                          {connectorComputers.map((computer) => {
                            const runtimes = [...computer.runtimes].sort(
                              (a, b) =>
                                runtimeSortKey(a) - runtimeSortKey(b) ||
                                a.label.localeCompare(b.label),
                            )
                            if (runtimes.length === 0) return null
                            return (
                              <div key={computer.id} className="space-y-2">
                                <div className="text-xs font-black text-text-secondary">
                                  {connectorComputerDisplayName(computer)}
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {runtimes.map((runtime) => {
                                    const optionKey = `${computer.id}:${runtime.id}`
                                    const selected =
                                      selectedConnectorRuntimeOption?.key === optionKey
                                    const available = runtime.status === 'available'
                                    return (
                                      <button
                                        key={optionKey}
                                        type="button"
                                        disabled={!available}
                                        onClick={() => {
                                          if (!available) return
                                          setSelectedConnectorComputerId(computer.id)
                                          setSelectedConnectorRuntimeId(runtime.id)
                                          setConnectorSelectionConfirmed(false)
                                        }}
                                        className={cn(
                                          'rounded-2xl border px-4 py-3 text-left transition',
                                          !available
                                            ? 'border-border-subtle bg-bg-tertiary/20 opacity-75'
                                            : selected
                                              ? 'border-primary/50 bg-primary/10'
                                              : 'border-border-subtle bg-bg-tertiary/40 hover:bg-bg-tertiary/70',
                                        )}
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-deep/50">
                                            <RuntimeIcon
                                              iconId={runtime.iconId}
                                              runtimeId={runtime.id}
                                              label={runtime.label}
                                              className="h-5 w-5"
                                            />
                                          </span>
                                          <span className="min-w-0">
                                            <span className="block truncate text-sm font-black text-text-primary">
                                              {runtime.label}
                                            </span>
                                            <span
                                              className={cn(
                                                'mt-0.5 block text-xs text-text-muted',
                                                available ? 'truncate' : 'leading-5',
                                              )}
                                            >
                                              {available
                                                ? connectorRuntimeDisplayDetail(computer, runtime)
                                                : t('agentMgmt.runtimeMissing')}
                                            </span>
                                          </span>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                        {t('agentMgmt.cloudRuntime')}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {CLOUD_BUDDY_RUNTIME_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setSelectedCloudRuntimeId(option.id)
                              setConnectorSelectionConfirmed(false)
                            }}
                            className={cn(
                              'rounded-2xl border px-4 py-3 text-left transition',
                              selectedCloudRuntime?.id === option.id
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border-subtle bg-bg-tertiary/40 hover:bg-bg-tertiary/70',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-deep/50">
                                <RuntimeIcon
                                  runtimeId={option.id}
                                  label={option.label}
                                  className="h-6 w-6"
                                />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-black text-text-primary">
                                  {option.label}
                                </span>
                                <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                                  {t(option.descriptionKey)}
                                </span>
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </ModalBody>
                <ModalFooter className="justify-end">
                  <ModalButtonGroup>
                    <Button variant="ghost" size="sm" onClick={closeCreateBuddy}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setConnectorSelectionConfirmed(true)}
                      disabled={!canContinueCreateBuddy}
                    >
                      {t('agentMgmt.connectorContinue')}
                    </Button>
                  </ModalButtonGroup>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* Simple create dialog */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)}>
          <ModalContent maxWidth="max-w-sm">
            <ModalHeader
              overline={t('server.createServer')}
              icon={<Plus size={18} strokeWidth={2.6} />}
              title={t('server.createServer')}
              closeLabel={t('common.close', '关闭')}
            />
            <ModalBody className="space-y-5 py-5">
              <Input
                type="text"
                ref={createServerNameInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    e.keyCode !== 229 &&
                    newName.trim()
                  ) {
                    e.preventDefault()
                    createServer.mutate({ name: newName.trim(), isPublic })
                  }
                }}
                placeholder={t('server.serverName')}
                className="w-full rounded-2xl px-5 py-3.5 font-bold"
              />
              {/* Public/Private toggle */}
              <div className="flex items-center justify-between p-4 bg-bg-tertiary/50 rounded-2xl border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-bg-tertiary/50 flex items-center justify-center shadow-inner">
                    {isPublic ? (
                      <Globe size={16} className="text-text-primary" />
                    ) : (
                      <Lock size={16} className="text-text-primary" />
                    )}
                  </div>
                  <div>
                    <div className="text-text-primary font-bold text-sm">
                      {isPublic ? t('server.publicServer') : t('server.privateServer')}
                    </div>
                    <div className="text-text-muted text-xs font-bold opacity-60">
                      {isPublic ? t('server.publicServerDesc') : t('server.privateServerDesc')}
                    </div>
                  </div>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalButtonGroup>
                <Button
                  variant="ghost"
                  onClick={() => setShowCreate(false)}
                  className="uppercase tracking-widest font-black"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={() =>
                    newName.trim() && createServer.mutate({ name: newName.trim(), isPublic })
                  }
                  disabled={!newName.trim() || createServer.isPending}
                  loading={createServer.isPending}
                  className="uppercase tracking-widest font-black"
                >
                  {t('common.create')}
                </Button>
              </ModalButtonGroup>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Join server dialog */}
        <Modal open={showJoin} onClose={() => setShowJoin(false)}>
          <ModalContent maxWidth="max-w-sm">
            <ModalHeader
              overline={t('server.joinServer')}
              icon={<UserPlus size={18} strokeWidth={2.4} />}
              title={t('server.joinServer')}
              subtitle={t('server.joinServerDesc')}
              closeLabel={t('common.close', '关闭')}
            />
            <ModalBody className="space-y-4 py-5">
              <Input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    e.keyCode !== 229 &&
                    joinCode.trim().length === 8
                  ) {
                    e.preventDefault()
                    joinServer.mutate(joinCode.trim())
                  }
                }}
                placeholder={t('server.inviteCodePlaceholder')}
                maxLength={8}
                className="w-full rounded-2xl px-5 py-3.5 font-mono text-center text-lg tracking-widest"
              />
            </ModalBody>
            <ModalFooter>
              <ModalButtonGroup>
                <Button
                  variant="ghost"
                  onClick={() => setShowJoin(false)}
                  className="uppercase tracking-widest font-black"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => joinCode.trim() && joinServer.mutate(joinCode.trim())}
                  disabled={joinCode.trim().length !== 8 || joinServer.isPending}
                  loading={joinServer.isPending}
                  className="uppercase tracking-widest font-black"
                >
                  {t('server.joinButton')}
                </Button>
              </ModalButtonGroup>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {inviteServerId && (
          <InvitePanel
            serverId={inviteServerId}
            initialTab="members"
            onClose={() => setInviteServerId(null)}
          />
        )}

        {/* Server context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={closeContextMenu}
            groups={[
              {
                items: [
                  {
                    icon: UserPlus,
                    label: t('server.inviteMembers'),
                    onClick: () => setInviteServerId(contextMenu.server.server.id),
                  },
                ],
              },
              {
                items: [
                  {
                    icon: Volume2,
                    label: (notificationPreference?.mutedServerIds ?? []).includes(
                      contextMenu.server.server.id,
                    )
                      ? t('server.unmuteNotifications')
                      : t('server.muteNotifications'),
                    onClick: () => {
                      const targetId = contextMenu.server.server.id
                      const current = notificationPreference?.mutedServerIds ?? []
                      const isMuted = current.includes(targetId)
                      const next = isMuted
                        ? current.filter((id) => id !== targetId)
                        : [...current, targetId]
                      updateNotificationPreference.mutate({ mutedServerIds: next })
                    },
                  },
                  {
                    icon: copiedId ? Check : Copy,
                    label: copiedId ? t('common.copied') : t('server.copyServerId'),
                    onClick: () => {
                      navigator.clipboard.writeText(contextMenu.server.server.id)
                      setCopiedId(true)
                      setTimeout(() => setCopiedId(false), 2000)
                    },
                  },
                ],
              },
              ...(user?.id === contextMenu.server.server.ownerId
                ? [
                    {
                      items: [
                        {
                          icon: Trash2,
                          label: t('server.deleteServer'),
                          danger: true,
                          disabled: deleteServer.isPending,
                          onClick: async () => {
                            const server = contextMenu.server.server
                            const ok = await useConfirmStore.getState().confirm({
                              title: t('server.deleteServer'),
                              message: t('server.deleteServerConfirm'),
                            })
                            if (ok) deleteServer.mutate(server.id)
                          },
                        },
                      ],
                    },
                  ]
                : []),
              ...(user?.id !== contextMenu.server.server.ownerId
                ? [
                    {
                      items: [
                        {
                          icon: LogOut,
                          label: t('server.leaveServer'),
                          danger: true,
                          onClick: async () => {
                            const name = contextMenu.server.server.name
                            const ok = await useConfirmStore.getState().confirm({
                              title: t('server.leaveServer'),
                              message: t('server.leaveConfirm', { name }),
                            })
                            if (ok) {
                              leaveServer.mutate(contextMenu.server.server.id)
                            }
                          },
                        },
                      ],
                    },
                  ]
                : []),
            ]}
          />
        )}
      </GlassPanel>
    </TooltipProvider>
  )
}
