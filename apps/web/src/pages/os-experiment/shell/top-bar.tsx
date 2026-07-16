import type { ShadowCloudComputer, ShadowCloudComputerBuddy } from '@shadowob/sdk'
import { resolveCloudComputerShellColor } from '@shadowob/shared'
import {
  Button,
  cn,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import {
  Archive,
  Check,
  Copy,
  Edit3,
  Eye,
  Loader2,
  Lock,
  Monitor,
  PictureInPicture2,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import {
  type MutableRefObject,
  memo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '../../../components/chat/message-bubble/types'
import { CloudComputerShell } from '../../../components/cloud-computer-shell'
import { UserAvatar } from '../../../components/common/avatar'
import { useConfirmStore } from '../../../components/common/confirm-dialog'
import { ContextMenu, type ContextMenuGroup } from '../../../components/common/context-menu'
import { MemberList } from '../../../components/member/member-list'
import { NotificationBell } from '../../../components/notification/notification-bell'
import { ServerIcon } from '../../../components/server/server-icon'
import { UserAvatarMenu } from '../../../components/server/user-avatar-menu'
import { useVoiceSession } from '../../../components/voice/voice-session-context'
import { useSocketEvent } from '../../../hooks/use-socket'
import type { VoiceState } from '../../../hooks/use-voice-channel'
import { fetchApi } from '../../../lib/api'
import type { AuthenticatedUser } from '../../../lib/auth-session'
import {
  invalidateServerChannelState,
  removeServerChannel,
  serverChannelCacheKeys,
  upsertServerChannel,
} from '../../../lib/channel-cache'
import { copyToClipboard } from '../../../lib/clipboard'
import { showToast } from '../../../lib/toast'
import { ChannelView } from '../../channel-view'
import type { SettingsModalTab } from '../../settings/settings-modal'
import { CHANNEL_CREATE_TYPES, type ChannelCreateType, ChannelTypeIcon } from '../channel-ui'
import { maximizedWindowTabPortalId } from '../components/widgets/maximized-window-tab'
import {
  OsTopBarChannelTab,
  type VoiceActivityState,
} from '../components/widgets/top-bar-channel-tab'
import { OsTopBarInboxButton } from '../components/widgets/top-bar-inbox-button'
import { useOsFullscreen } from '../hooks/use-os-fullscreen'
import { OsHtmlWallpaperFrame } from '../html-wallpaper-frame'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsChannelTab,
  ScopedUnread,
  ServerEntry,
} from '../types'
import { OS_GC_MS, OS_STALE_MS, OS_TOP_BAR_HEIGHT } from '../utils'
import {
  BubbleArrow,
  OS_FLOATING_BUBBLE_INTERACTIVE_SELECTOR,
  OsFloatingBubbleSurface,
  resolveBubblePosition,
} from './bubble-surface'
import { OsServerSwitcher } from './server-switcher'

const MemoUserAvatarMenu = memo(UserAvatarMenu)
const MemoOsServerSwitcher = memo(OsServerSwitcher)
const MemoNotificationBell = memo(NotificationBell)

type ActiveTopBarChannelBubble = {
  anchor?: DOMRect
  channel: ChannelMeta
  inboxEntry?: BuddyInboxEntry
  source: 'channel' | 'inbox'
  tab?: OsChannelTab
}

type TopBarCloudComputer = ShadowCloudComputer
type TopBarCloudComputerBuddy = ShadowCloudComputerBuddy
type VoicePresenceEvent = {
  channelId?: string
  state?: VoiceState
}

function topBarCloudComputerHealth(computer: TopBarCloudComputer) {
  if (computer.health?.state) return computer.health.state
  if (computer.status === 'deployed') return 'ready'
  if (computer.status === 'paused') return 'paused'
  if (computer.status === 'failed') return 'failed'
  return 'preparing'
}

function topBarCloudComputerStatusClass(state: ReturnType<typeof topBarCloudComputerHealth>) {
  if (state === 'ready') return 'bg-emerald-400'
  if (state === 'paused') return 'bg-amber-400'
  if (state === 'failed') return 'bg-rose-400'
  if (state === 'degraded') return 'bg-orange-400'
  return 'bg-sky-400'
}

function TopBarCloudComputerBuddyStack({ computer }: { computer: TopBarCloudComputer }) {
  const { t } = useTranslation()
  const buddiesQuery = useQuery({
    queryKey: ['cloud-computer-buddies', computer.id],
    enabled: computer.buddyCount > 0,
    staleTime: 30_000,
    queryFn: () =>
      fetchApi<{
        ok: true
        buddies: TopBarCloudComputerBuddy[]
      }>(`/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies`),
  })
  const buddies = buddiesQuery.data?.buddies ?? []
  const total = buddiesQuery.isSuccess ? buddies.length : computer.buddyCount
  const visible = buddies.slice(0, 3)
  const overflow = Math.max(total - visible.length, 0)

  if (total <= 0) return null
  return (
    <span
      className="flex min-h-6 items-center"
      aria-label={t('cloudComputers.buddyStackLabel', { count: total })}
      title={
        visible.length > 0
          ? visible.map((buddy) => buddy.name).join(', ')
          : t('cloudComputers.buddyStackLabel', { count: total })
      }
    >
      {buddiesQuery.isLoading
        ? Array.from({ length: Math.min(total, 3) }, (_, index) => (
            <span
              key={`cloud-buddy-loading-${index}`}
              className={cn(
                'h-6 w-6 animate-pulse rounded-full border-2 border-bg-primary bg-white/10',
                index > 0 && '-ml-1.5',
              )}
            />
          ))
        : visible.map((buddy, index) => (
            <UserAvatar
              key={buddy.id}
              size="xs"
              userId={buddy.botUser?.id ?? buddy.id}
              avatarUrl={buddy.botUser?.avatarUrl}
              displayName={buddy.botUser?.displayName ?? buddy.name}
              className={cn(
                'h-6 w-6 border-2 border-bg-primary shadow-[0_3px_10px_rgba(0,0,0,0.28)]',
                index > 0 && '-ml-1.5',
              )}
            />
          ))}
      {overflow > 0 ? (
        <span className="-ml-1.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-bg-primary bg-bg-tertiary px-1 text-[9px] font-black text-text-primary">
          +{overflow}
        </span>
      ) : null}
    </span>
  )
}

function channelFromTab(tab: OsChannelTab): ChannelMeta {
  return {
    id: tab.channelId,
    name: tab.title,
    type: tab.type,
    topic: tab.topic,
  }
}

type OsTopBarHeaderProps = {
  selectedServer: ServerEntry
  servers: ServerEntry[]
  maximizedWindowId: string | null
  channelTabs: OsChannelTab[]
  voiceActivityByChannelId: ReadonlyMap<string, VoiceActivityState>
  hasChannels: boolean
  visibleInboxes: BuddyInboxEntry[]
  desktopInboxAgentIds?: ReadonlySet<string>
  scopedUnread?: ScopedUnread
  activeInboxAgentId: string | null
  activeInboxChannelId: string | null
  loadingInboxId: string | null
  draggingTabId: string | null
  floatingLayerZIndex: number
  floatingPreviewLayerZIndex: number
  isDocumentFullscreen: boolean
  isInboxesLoading: boolean
  user: AuthenticatedUser | null | undefined
  channelTabRefs: MutableRefObject<Map<string, HTMLDivElement>>
  inboxButtonRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  isChannelPreviewSuppressed: () => boolean
  isInboxPreviewSuppressed: () => boolean
  onExit: () => void
  onSelectServer: (serverId: string) => void
  onOpenProfile: () => void
  onOpenSettings: (tab?: SettingsModalTab) => void
  onOpenBuddy: () => void
  onOpenTasks: () => void
  onOpenWallet: () => void
  onOpenShop: () => void
  onToggleFullscreen: () => void
  onDraggingTabChange: (id: string | null) => void
  onCloseChannelTab: (tab: OsChannelTab) => void
  onOpenChannelContextMenu: (channel: ChannelMeta, event: ReactMouseEvent<HTMLElement>) => void
  onOpenChannelTab: (tab: OsChannelTab, anchor: DOMRect) => void
  onReorderChannelTab: (sourceId: string, targetId: string) => void
  onOpenChannelPicker: (anchor: DOMRect) => void
  onOpenInbox: (entry: BuddyInboxEntry, anchor: DOMRect) => void
  onPinInboxToDesktop?: (entry: BuddyInboxEntry) => void
  onUnpinInboxFromDesktop?: (entry: BuddyInboxEntry) => void
  onToggleServerMembers: (anchor: DOMRect) => void
  onToggleCloudComputers: (anchor: DOMRect) => void
  onOpenCommandPalette: () => void
  onRestoreMaximizedWindow: () => void
}

const OsTopBarHeader = memo(function OsTopBarHeader({
  selectedServer,
  servers,
  maximizedWindowId,
  channelTabs,
  voiceActivityByChannelId,
  hasChannels,
  visibleInboxes,
  desktopInboxAgentIds,
  scopedUnread,
  activeInboxAgentId,
  activeInboxChannelId,
  loadingInboxId,
  draggingTabId,
  floatingLayerZIndex,
  floatingPreviewLayerZIndex,
  isDocumentFullscreen,
  isInboxesLoading,
  user,
  channelTabRefs,
  inboxButtonRefs,
  isChannelPreviewSuppressed,
  isInboxPreviewSuppressed,
  onExit,
  onSelectServer,
  onOpenProfile,
  onOpenSettings,
  onOpenBuddy,
  onOpenTasks,
  onOpenWallet,
  onOpenShop,
  onToggleFullscreen,
  onDraggingTabChange,
  onCloseChannelTab,
  onOpenChannelContextMenu,
  onOpenChannelTab,
  onReorderChannelTab,
  onOpenChannelPicker,
  onOpenInbox,
  onPinInboxToDesktop,
  onUnpinInboxFromDesktop,
  onToggleServerMembers,
  onToggleCloudComputers,
  onOpenCommandPalette,
  onRestoreMaximizedWindow,
}: OsTopBarHeaderProps) {
  const { t } = useTranslation()
  const notificationPanelStyle = useMemo(
    () => ({ zIndex: floatingLayerZIndex }),
    [floatingLayerZIndex],
  )

  return (
    <header
      className={cn(
        'desktop-os-top-bar absolute left-0 right-0 top-0 z-[600] flex h-10 select-none items-center gap-1.5 bg-bg-primary/62 pr-3 text-white backdrop-blur-[32px] backdrop-saturate-150',
        maximizedWindowId ? 'pl-1' : 'pl-3',
      )}
    >
      {!maximizedWindowId ? (
        <>
          <MemoUserAvatarMenu
            user={user}
            mode="os"
            variant="os-topbar"
            menuZIndex={floatingLayerZIndex}
            onExit={onExit}
            onOpenProfile={onOpenProfile}
            onOpenSettings={onOpenSettings}
            onOpenBuddy={onOpenBuddy}
            onOpenTasks={onOpenTasks}
            onOpenWallet={onOpenWallet}
            onOpenShop={onOpenShop}
            isFullscreen={isDocumentFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
          <MemoOsServerSwitcher
            selectedServer={selectedServer}
            servers={servers}
            floatingLayerZIndex={floatingLayerZIndex}
            onSelectServer={onSelectServer}
          />
        </>
      ) : null}
      {maximizedWindowId || channelTabs.length > 0 || hasChannels ? (
        <div
          className="flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden"
          role="tablist"
          aria-label={t('os.windowTabs')}
        >
          {maximizedWindowId ? (
            <div id={maximizedWindowTabPortalId(maximizedWindowId)} className="contents" />
          ) : null}
          {channelTabs.slice(-6).map((tab) => (
            <OsTopBarChannelTab
              key={tab.id}
              tab={tab}
              unread={scopedUnread?.channelUnread?.[tab.channelId] ?? 0}
              voiceActivity={voiceActivityByChannelId.get(tab.channelId) ?? 'idle'}
              draggingTabId={draggingTabId}
              floatingPreviewLayerZIndex={floatingPreviewLayerZIndex}
              tabRefs={channelTabRefs}
              isPreviewSuppressed={isChannelPreviewSuppressed}
              onDraggingTabChange={onDraggingTabChange}
              onClose={onCloseChannelTab}
              onContextMenu={(targetTab, event) =>
                onOpenChannelContextMenu(channelFromTab(targetTab), event)
              }
              onOpen={onOpenChannelTab}
              onReorder={onReorderChannelTab}
            />
          ))}
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/64 transition hover:bg-white/10 hover:text-white"
            title={t('channel.switchChannel')}
            aria-label={t('channel.switchChannel')}
            data-os-floating-bubble-trigger="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onOpenChannelPicker(event.currentTarget.getBoundingClientRect())
            }}
          >
            <Plus size={15} />
          </button>
        </div>
      ) : null}
      <div className="ml-auto flex h-10 shrink-0 items-center gap-1">
        {isInboxesLoading ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center text-white/70">
            <Loader2 size={14} className="animate-spin" />
          </span>
        ) : visibleInboxes.length > 0 ? (
          visibleInboxes.map((entry) => (
            <OsTopBarInboxButton
              key={entry.agent.id}
              entry={entry}
              unread={entry.channel ? (scopedUnread?.channelUnread?.[entry.channel.id] ?? 0) : 0}
              active={
                activeInboxAgentId === entry.agent.id ||
                (entry.channel ? activeInboxChannelId === entry.channel.id : false)
              }
              pinnedToDesktop={desktopInboxAgentIds?.has(entry.agent.id) ?? false}
              loading={loadingInboxId === entry.agent.id}
              floatingPreviewLayerZIndex={floatingPreviewLayerZIndex}
              floatingLayerZIndex={floatingLayerZIndex}
              inboxButtonRefs={inboxButtonRefs}
              isPreviewSuppressed={isInboxPreviewSuppressed}
              onOpen={onOpenInbox}
              onPinToDesktop={onPinInboxToDesktop}
              onUnpinFromDesktop={onUnpinInboxFromDesktop}
            />
          ))
        ) : null}
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-white/76 transition hover:bg-white/10 hover:text-white"
          title={t('member.members')}
          aria-label={t('member.members')}
          data-os-floating-bubble-trigger="true"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onToggleServerMembers(event.currentTarget.getBoundingClientRect())
          }}
        >
          <Users size={16} />
        </button>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-white/76 transition hover:bg-white/10 hover:text-white"
          title={t('cloudComputers.title')}
          aria-label={t('cloudComputers.title')}
          data-os-floating-bubble-trigger="true"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onToggleCloudComputers(event.currentTarget.getBoundingClientRect())
          }}
        >
          <Monitor size={16} />
        </button>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-lg text-white/76 transition hover:bg-white/10 hover:text-white"
          title={t('os.menuSearch')}
          aria-label={t('os.menuSearch')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onOpenCommandPalette()
          }}
        >
          <Search size={16} />
        </button>
        <span
          className="contents"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MemoNotificationBell
            compact
            desktopMode
            desktopServerId={selectedServer.server.id}
            iconSize={16}
            panelPlacement="bottom-end"
            panelVariant="bubble"
            className="!h-8 !w-8 !rounded-lg !border-transparent !bg-transparent !text-white/76 hover:!bg-white/10 hover:!text-white data-[unread=true]:!text-danger data-[unread=true]:hover:!text-danger"
            panelClassName="!border-white/14 !bg-bg-primary/96"
            panelStyle={notificationPanelStyle}
          />
        </span>
        {maximizedWindowId ? (
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-lg text-white/76 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            title={t('os.restoreWindow')}
            aria-label={t('os.restoreWindow')}
            onClick={onRestoreMaximizedWindow}
          >
            <PictureInPicture2 size={16} />
          </button>
        ) : null}
      </div>
    </header>
  )
})

export const OsTopBar = memo(function OsTopBar({
  selectedServer,
  selectedServerSlug,
  servers,
  maximizedWindowId,
  channels,
  inboxes,
  desktopInboxAgentIds,
  channelTabs,
  channelBubbleRequest,
  inboxBubbleRequest,
  floatingLayerZIndex,
  scopedUnread,
  isInboxesLoading,
  isCreatingChannel,
  createChannelRequestNonce,
  user,
  onExit,
  onSelectServer,
  onFocusWindow,
  onCloseWindow,
  onCreateChannel,
  onOpenChannelWindow,
  voiceScreenSharePresentation = 'inline',
  onActivateVoiceScreenWindow,
  onOpenInbox,
  onPreviewFile,
  onOpenProfile,
  onOpenSettings,
  onOpenBuddy,
  onOpenTasks,
  onOpenWallet,
  onOpenShop,
  onOpenCloudComputers,
  onReorderChannelTab,
  onPinInboxToDesktop,
  onUnpinInboxFromDesktop,
  onRestoreMaximizedWindow,
}: {
  selectedServer: ServerEntry
  selectedServerSlug: string
  servers: ServerEntry[]
  maximizedWindowId: string | null
  channels: ChannelMeta[]
  inboxes: BuddyInboxEntry[]
  desktopInboxAgentIds?: ReadonlySet<string>
  channelTabs: OsChannelTab[]
  channelBubbleRequest?: { channelId: string; nonce: number } | null
  inboxBubbleRequest?: { agentId?: string; channelId?: string; nonce: number } | null
  floatingLayerZIndex: number
  scopedUnread?: ScopedUnread
  isInboxesLoading: boolean
  isCreatingChannel?: boolean
  createChannelRequestNonce?: number
  user: AuthenticatedUser | null | undefined
  onExit: () => void
  onSelectServer: (serverId: string) => void
  onFocusWindow: (id: string | null) => void
  onCloseWindow: (id: string) => void
  onCreateChannel: (input: { name: string; type: ChannelCreateType; isPrivate: boolean }) => void
  onOpenChannelWindow: (channel: ChannelMeta) => void
  voiceScreenSharePresentation?: 'inline' | 'detached'
  onActivateVoiceScreenWindow?: () => void
  onOpenInbox: (entry: BuddyInboxEntry) => Promise<ChannelMeta | null>
  onPreviewFile?: (attachment: Attachment) => void
  onOpenProfile: () => void
  onOpenSettings: (tab?: SettingsModalTab) => void
  onOpenBuddy: () => void
  onOpenTasks: () => void
  onOpenWallet: () => void
  onOpenShop: () => void
  onOpenCloudComputers: (computerId?: string) => void
  onReorderChannelTab: (sourceId: string, targetId: string) => void
  onPinInboxToDesktop?: (entry: BuddyInboxEntry) => void
  onUnpinInboxFromDesktop?: (entry: BuddyInboxEntry) => void
  onRestoreMaximizedWindow: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { connectedVoiceChannel } = useVoiceSession()
  const voiceTabs = useMemo(() => channelTabs.filter((tab) => tab.type === 'voice'), [channelTabs])
  const voiceStateQueries = useQueries({
    queries: voiceTabs.map((tab) => ({
      queryKey: ['voice-state', tab.channelId],
      queryFn: () => fetchApi<VoiceState>(`/api/channels/${tab.channelId}/voice/state`),
      staleTime: 5_000,
      refetchInterval: 10_000,
      retry: false,
    })),
  })
  const applyVoicePresenceEvent = useCallback(
    (event: VoicePresenceEvent) => {
      if (event.state?.channelId) {
        queryClient.setQueryData<VoiceState>(['voice-state', event.state.channelId], event.state)
        return
      }
      if (event.channelId) {
        void queryClient.invalidateQueries({ queryKey: ['voice-state', event.channelId] })
      }
    },
    [queryClient],
  )
  useSocketEvent<VoicePresenceEvent>('voice:participant-joined', applyVoicePresenceEvent)
  useSocketEvent<VoicePresenceEvent>('voice:participant-left', applyVoicePresenceEvent)
  useSocketEvent<VoicePresenceEvent>('voice:participant-updated', applyVoicePresenceEvent)
  const voiceActivityByChannelId = useMemo(() => {
    const activity = new Map<string, VoiceActivityState>()
    voiceTabs.forEach((tab, index) => {
      if ((voiceStateQueries[index]?.data?.participantCount ?? 0) > 0) {
        activity.set(tab.channelId, 'active')
      }
    })
    if (connectedVoiceChannel) activity.set(connectedVoiceChannel.id, 'joined')
    return activity
  }, [connectedVoiceChannel, voiceStateQueries, voiceTabs])
  const [channelFilter, setChannelFilter] = useState('')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [channelDraftName, setChannelDraftName] = useState('')
  const [channelDraftType, setChannelDraftType] = useState<ChannelCreateType>('text')
  const [channelDraftPrivate, setChannelDraftPrivate] = useState(false)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [channelContextMenu, setChannelContextMenu] = useState<{
    x: number
    y: number
    channel: ChannelMeta
  } | null>(null)
  const [renamingChannel, setRenamingChannel] = useState<ChannelMeta | null>(null)
  const [renameChannelDraft, setRenameChannelDraft] = useState('')
  const channelPickerInputRef = useRef<HTMLInputElement>(null)
  const createChannelNameInputRef = useRef<HTMLInputElement>(null)
  const renameChannelInputRef = useRef<HTMLInputElement>(null)
  const channelTabRefs = useRef(new Map<string, HTMLDivElement>())
  const inboxButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const [activeChannelBubble, setActiveChannelBubble] = useState<ActiveTopBarChannelBubble | null>(
    null,
  )
  const [activeChannelMembersBubble, setActiveChannelMembersBubble] = useState<{
    anchor: DOMRect
    channelId: string
  } | null>(null)
  const [activeServerMembersBubble, setActiveServerMembersBubble] = useState<DOMRect | null>(null)
  const [activeCloudComputersBubble, setActiveCloudComputersBubble] = useState<DOMRect | null>(null)
  const { fullscreen: isDocumentFullscreen, toggleFullscreen: toggleDocumentFullscreen } =
    useOsFullscreen()
  const [activeChannelPicker, setActiveChannelPicker] = useState<{
    anchor: DOMRect
    nonce: number
  } | null>(null)
  const [loadingInboxId, setLoadingInboxId] = useState<string | null>(null)
  const handledChannelBubbleRequestNonceRef = useRef<number | null>(null)
  const handledInboxBubbleRequestNonceRef = useRef<number | null>(null)
  const activeChannelBubbleRef = useRef(activeChannelBubble)
  const loadingInboxIdRef = useRef(loadingInboxId)
  const floatingPreviewLayerZIndex = Math.max(0, floatingLayerZIndex - 10)

  const cloudComputersQuery = useQuery({
    queryKey: ['cloud-computers'],
    enabled: Boolean(activeCloudComputersBubble),
    queryFn: () => fetchApi<TopBarCloudComputer[]>('/api/cloud-computers?limit=100&offset=0'),
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!createChannelRequestNonce) return
    setShowCreateChannel(true)
  }, [createChannelRequestNonce])
  const visibleInboxes = useMemo(() => inboxes.slice(0, 5), [inboxes])
  const openChannelIds = useMemo(
    () => new Set(channelTabs.map((tab) => tab.channelId)),
    [channelTabs],
  )
  const normalizedChannelFilter = channelFilter.trim().toLocaleLowerCase()
  const remainingChannels = useMemo(
    () =>
      channels
        .filter((channel) => !openChannelIds.has(channel.id))
        .filter((channel) => {
          if (!normalizedChannelFilter) return true
          return channel.name.toLocaleLowerCase().includes(normalizedChannelFilter)
        })
        .slice(0, 18),
    [channels, normalizedChannelFilter, openChannelIds],
  )
  const serverChannelKeys = useMemo(
    () =>
      serverChannelCacheKeys(
        selectedServer.server.id,
        selectedServer.server.slug,
        selectedServerSlug,
      ),
    [selectedServer.server.id, selectedServer.server.slug, selectedServerSlug],
  )

  const upsertOsChannel = useCallback(
    (channel: ChannelMeta) => {
      queryClient.setQueryData<ChannelMeta[]>(
        ['os-server-channels', selectedServerSlug],
        (current) => {
          if (!current?.length) return [channel]
          let found = false
          const next = current.map((item) => {
            if (item.id !== channel.id) return item
            found = true
            return { ...item, ...channel }
          })
          if (!found) next.push(channel)
          return next
        },
      )
      upsertServerChannel(queryClient, serverChannelKeys, channel)
      invalidateServerChannelState(queryClient, serverChannelKeys)
      void queryClient.invalidateQueries({ queryKey: ['os-server-channels', selectedServerSlug] })
    },
    [queryClient, selectedServerSlug, serverChannelKeys],
  )

  const removeOsChannel = useCallback(
    (channelId: string) => {
      queryClient.setQueryData<ChannelMeta[]>(
        ['os-server-channels', selectedServerSlug],
        (current) => current?.filter((item) => item.id !== channelId) ?? current,
      )
      removeServerChannel(queryClient, serverChannelKeys, channelId)
      invalidateServerChannelState(queryClient, serverChannelKeys)
      void queryClient.invalidateQueries({ queryKey: ['os-server-channels', selectedServerSlug] })
    },
    [queryClient, selectedServerSlug, serverChannelKeys],
  )

  const updateChannel = useMutation({
    mutationFn: (input: { channelId: string; name?: string; isPrivate?: boolean }) =>
      fetchApi<ChannelMeta>(`/api/channels/${input.channelId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
        }),
      }),
    onSuccess: (channel) => {
      upsertOsChannel(channel)
      setRenamingChannel(null)
      setRenameChannelDraft('')
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
    },
  })

  const archiveChannel = useMutation({
    mutationFn: (channelId: string) =>
      fetchApi<{ channel: ChannelMeta }>(`/api/channels/${channelId}/archive`, {
        method: 'POST',
      }),
    onSuccess: (data, channelId) => {
      upsertOsChannel(data.channel)
      const tab = channelTabs.find((item) => item.channelId === channelId)
      if (tab) closeChannelTabFromTopBar(tab)
      showToast(t('channel.archiveSuccess'), 'success')
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('channel.archiveChannelFailed'), 'error')
    },
  })

  const unarchiveChannel = useMutation({
    mutationFn: (channelId: string) =>
      fetchApi<{ channel: ChannelMeta }>(`/api/channels/${channelId}/unarchive`, {
        method: 'POST',
      }),
    onSuccess: (data) => {
      upsertOsChannel(data.channel)
      showToast(t('channel.unarchiveSuccess'), 'success')
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : t('channel.unarchiveChannelFailed'),
        'error',
      )
    },
  })

  const deleteChannel = useMutation({
    mutationFn: (channelId: string) =>
      fetchApi(`/api/channels/${channelId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_result, channelId) => {
      removeOsChannel(channelId)
      const tab = channelTabs.find((item) => item.channelId === channelId)
      if (tab) closeChannelTabFromTopBar(tab)
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
    },
  })

  useEffect(() => {
    activeChannelBubbleRef.current = activeChannelBubble
  }, [activeChannelBubble])

  useEffect(() => {
    loadingInboxIdRef.current = loadingInboxId
  }, [loadingInboxId])
  useEffect(() => {
    activeChannelBubbleRef.current = null
    setActiveChannelBubble(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    setActiveCloudComputersBubble(null)
    setActiveChannelPicker(null)
    setShowCreateChannel(false)
    setChannelFilter('')
    onFocusWindow(null)
  }, [onFocusWindow, selectedServer.server.id])

  useEffect(() => {
    if (!activeChannelPicker) return
    const frame = window.requestAnimationFrame(() => {
      channelPickerInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeChannelPicker])

  useEffect(() => {
    if (!showCreateChannel) return
    const frame = window.requestAnimationFrame(() => {
      createChannelNameInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showCreateChannel])

  useEffect(() => {
    if (!renamingChannel) return
    const frame = window.requestAnimationFrame(() => {
      renameChannelInputRef.current?.focus({ preventScroll: true })
      renameChannelInputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [renamingChannel])

  const channelBubblePosition = (() => {
    if (!activeChannelBubble || typeof window === 'undefined') return null
    return resolveBubblePosition(
      activeChannelBubble.anchor,
      460,
      activeChannelBubble.source === 'inbox'
        ? window.innerWidth - 84
        : Math.min(280, window.innerWidth / 2),
    )
  })()

  const channelPickerPosition = (() => {
    if (!activeChannelPicker || typeof window === 'undefined') return null
    return resolveBubblePosition(
      activeChannelPicker.anchor,
      360,
      Math.min(300, window.innerWidth / 2),
    )
  })()

  const activeChannelMembersPosition = (() => {
    if (!activeChannelMembersBubble || typeof window === 'undefined') return null
    return resolveBubblePosition(activeChannelMembersBubble.anchor, 360, window.innerWidth - 132)
  })()

  const activeServerMembersPosition = (() => {
    if (!activeServerMembersBubble || typeof window === 'undefined') return null
    return resolveBubblePosition(activeServerMembersBubble, 400, window.innerWidth - 160)
  })()

  const activeCloudComputersPosition = (() => {
    if (!activeCloudComputersBubble || typeof window === 'undefined') return null
    return resolveBubblePosition(activeCloudComputersBubble, 390, window.innerWidth - 132)
  })()

  const closeFloatingBubbles = useCallback(() => {
    activeChannelBubbleRef.current = null
    setActiveChannelBubble(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    setActiveCloudComputersBubble(null)
    setActiveChannelPicker(null)
    onFocusWindow(null)
  }, [onFocusWindow])

  const hasFloatingBubble = Boolean(
    activeChannelBubble ||
      activeChannelMembersBubble ||
      activeServerMembersBubble ||
      activeCloudComputersBubble ||
      activeChannelPicker,
  )

  useEffect(() => {
    if (!hasFloatingBubble || typeof document === 'undefined') return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(OS_FLOATING_BUBBLE_INTERACTIVE_SELECTOR)) return
      closeFloatingBubbles()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFloatingBubbles()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [closeFloatingBubbles, hasFloatingBubble])

  const handleToggleDocumentFullscreen = useCallback(() => {
    void toggleDocumentFullscreen().catch(() => undefined)
  }, [toggleDocumentFullscreen])

  const isChannelPreviewSuppressed = useCallback(() => Boolean(activeChannelBubbleRef.current), [])

  const isInboxPreviewSuppressed = useCallback(() => Boolean(activeChannelBubbleRef.current), [])

  const handleOpenInbox = useCallback(
    async (entry: BuddyInboxEntry, anchor?: DOMRect, options?: { forceOpen?: boolean }) => {
      if (loadingInboxIdRef.current) return
      setActiveChannelMembersBubble(null)
      setActiveServerMembersBubble(null)
      setActiveCloudComputersBubble(null)
      setActiveChannelPicker(null)
      onFocusWindow(null)
      const currentActiveInbox = activeChannelBubbleRef.current
      const isActiveInbox =
        currentActiveInbox?.source === 'inbox' &&
        (currentActiveInbox.inboxEntry?.agent.id === entry.agent.id ||
          Boolean(entry.channel && currentActiveInbox.channel.id === entry.channel.id))
      if (isActiveInbox && !options?.forceOpen) {
        activeChannelBubbleRef.current = null
        setActiveChannelBubble(null)
        return
      }
      loadingInboxIdRef.current = entry.agent.id
      setLoadingInboxId(entry.agent.id)
      try {
        const channel = await onOpenInbox(entry)
        if (channel) {
          const nextActiveInbox: ActiveTopBarChannelBubble = {
            anchor,
            channel,
            inboxEntry: entry,
            source: 'inbox',
          }
          activeChannelBubbleRef.current = nextActiveInbox
          setActiveChannelBubble(nextActiveInbox)
        }
      } finally {
        loadingInboxIdRef.current = null
        setLoadingInboxId(null)
      }
    },
    [onFocusWindow, onOpenInbox],
  )

  useEffect(() => {
    if (!channelBubbleRequest) return
    if (handledChannelBubbleRequestNonceRef.current === channelBubbleRequest.nonce) return
    const tab = channelTabs.find(
      (candidate) => candidate.channelId === channelBubbleRequest.channelId,
    )
    if (!tab) return
    handledChannelBubbleRequestNonceRef.current = channelBubbleRequest.nonce
    const nextActiveChannelBubble: ActiveTopBarChannelBubble = {
      anchor: channelTabRefs.current.get(tab.id)?.getBoundingClientRect(),
      channel: channelFromTab(tab),
      source: 'channel',
      tab,
    }
    activeChannelBubbleRef.current = nextActiveChannelBubble
    setActiveChannelPicker(null)
    setActiveChannelMembersBubble(null)
    setActiveServerMembersBubble(null)
    setActiveCloudComputersBubble(null)
    onFocusWindow(tab.id)
    setActiveChannelBubble(nextActiveChannelBubble)
  }, [channelBubbleRequest, channelTabs, onFocusWindow])

  useEffect(() => {
    if (!inboxBubbleRequest) return
    if (handledInboxBubbleRequestNonceRef.current === inboxBubbleRequest.nonce) return
    const entry = inboxes.find(
      (candidate) =>
        candidate.agent.id === inboxBubbleRequest.agentId ||
        candidate.channel?.id === inboxBubbleRequest.channelId,
    )
    if (!entry) {
      if (!inboxBubbleRequest.channelId) return
      handledInboxBubbleRequestNonceRef.current = inboxBubbleRequest.nonce
      let cancelled = false
      void fetchApi<ChannelMeta>(`/api/channels/${inboxBubbleRequest.channelId}`)
        .then((channel) => {
          if (cancelled) return
          setActiveChannelMembersBubble(null)
          setActiveServerMembersBubble(null)
          setActiveCloudComputersBubble(null)
          setActiveChannelPicker(null)
          onFocusWindow(null)
          const nextActiveInbox: ActiveTopBarChannelBubble = {
            channel,
            source: 'inbox',
          }
          activeChannelBubbleRef.current = nextActiveInbox
          setActiveChannelBubble(nextActiveInbox)
        })
        .catch(() => undefined)
      return () => {
        cancelled = true
      }
    }
    handledInboxBubbleRequestNonceRef.current = inboxBubbleRequest.nonce
    void handleOpenInbox(
      entry,
      inboxButtonRefs.current.get(entry.agent.id)?.getBoundingClientRect(),
      { forceOpen: true },
    )
  }, [handleOpenInbox, inboxBubbleRequest, inboxes, onFocusWindow])

  const toggleChannelBubble = useCallback(
    (tab: OsChannelTab, anchor: DOMRect) => {
      const nextActiveChannelBubble =
        activeChannelBubbleRef.current?.source === 'channel' &&
        activeChannelBubbleRef.current.tab?.id === tab.id
          ? null
          : { anchor, channel: channelFromTab(tab), source: 'channel' as const, tab }
      activeChannelBubbleRef.current = nextActiveChannelBubble
      setActiveChannelMembersBubble(null)
      setActiveServerMembersBubble(null)
      setActiveCloudComputersBubble(null)
      setActiveChannelPicker(null)
      setActiveChannelBubble(nextActiveChannelBubble)
      onFocusWindow(nextActiveChannelBubble ? tab.id : null)
    },
    [onFocusWindow],
  )

  const closeChannelTabFromTopBar = useCallback(
    (tab: OsChannelTab) => {
      onCloseWindow(tab.id)
      if (
        activeChannelBubbleRef.current?.source === 'channel' &&
        activeChannelBubbleRef.current.tab?.id === tab.id
      ) {
        activeChannelBubbleRef.current = null
        setActiveChannelMembersBubble(null)
        setActiveChannelBubble(null)
        onFocusWindow(null)
      }
    },
    [onCloseWindow, onFocusWindow],
  )

  const openInboxFromTopBar = useCallback(
    (entry: BuddyInboxEntry, anchor: DOMRect) => {
      void handleOpenInbox(entry, anchor)
    },
    [handleOpenInbox],
  )

  const openChannelPickerFromTopBar = useCallback(
    (anchor: DOMRect) => {
      activeChannelBubbleRef.current = null
      setActiveChannelBubble(null)
      setActiveChannelMembersBubble(null)
      setActiveServerMembersBubble(null)
      setActiveCloudComputersBubble(null)
      setShowCreateChannel(false)
      onFocusWindow(null)
      setActiveChannelPicker((current) => (current ? null : { anchor, nonce: Date.now() }))
    },
    [onFocusWindow],
  )

  const toggleServerMembersBubble = useCallback(
    (anchor: DOMRect) => {
      activeChannelBubbleRef.current = null
      setActiveChannelBubble(null)
      setActiveChannelPicker(null)
      setActiveChannelMembersBubble(null)
      setActiveCloudComputersBubble(null)
      setActiveServerMembersBubble((current) => (current ? null : anchor))
      onFocusWindow(null)
    },
    [onFocusWindow],
  )

  const toggleCloudComputersBubble = useCallback(
    (anchor: DOMRect) => {
      activeChannelBubbleRef.current = null
      setActiveChannelBubble(null)
      setActiveChannelPicker(null)
      setActiveChannelMembersBubble(null)
      setActiveServerMembersBubble(null)
      setActiveCloudComputersBubble((current) => (current ? null : anchor))
      onFocusWindow(null)
    },
    [onFocusWindow],
  )

  const openChannelContextMenu = useCallback(
    (channel: ChannelMeta, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const latestChannel = channels.find((item) => item.id === channel.id) ?? channel
      activeChannelBubbleRef.current = null
      setActiveChannelBubble(null)
      setActiveChannelMembersBubble(null)
      setActiveServerMembersBubble(null)
      setActiveCloudComputersBubble(null)
      setActiveChannelPicker(null)
      onFocusWindow(null)
      setChannelContextMenu({
        x: event.clientX,
        y: event.clientY,
        channel: latestChannel,
      })
    },
    [channels, onFocusWindow],
  )

  const submitRenameChannel = useCallback(() => {
    if (!renamingChannel || updateChannel.isPending) return
    const name = renameChannelDraft.trim()
    if (!name || name === renamingChannel.name) {
      setRenamingChannel(null)
      setRenameChannelDraft('')
      return
    }
    updateChannel.mutate({ channelId: renamingChannel.id, name })
  }, [renameChannelDraft, renamingChannel, updateChannel])

  const channelContextMenuGroups = useMemo<ContextMenuGroup[]>(() => {
    if (!channelContextMenu) return []
    const { channel } = channelContextMenu
    return [
      {
        items: [
          {
            icon: Eye,
            label: t('channel.openChannel'),
            onClick: () => onOpenChannelWindow(channel),
          },
          {
            icon: Edit3,
            label: t('channel.editChannel'),
            disabled: updateChannel.isPending,
            onClick: () => {
              setRenamingChannel(channel)
              setRenameChannelDraft(channel.name)
            },
          },
          {
            icon: Copy,
            label: t('channel.copyChannelLink'),
            onClick: async () => {
              const url = new URL(
                `/app/spaces/${encodeURIComponent(selectedServerSlug)}`,
                window.location.origin,
              )
              url.searchParams.set('channel', channel.id)
              await copyToClipboard(url.toString(), {
                successMessage: t('common.copied'),
                errorMessage: t('chat.copyFailed'),
              })
            },
          },
        ],
      },
      {
        items: [
          {
            icon: Lock,
            label: channel.isPrivate ? t('channel.setPublic') : t('channel.setPrivate'),
            disabled: updateChannel.isPending,
            onClick: () =>
              updateChannel.mutate({
                channelId: channel.id,
                isPrivate: !channel.isPrivate,
              }),
          },
        ],
      },
      {
        items: [
          {
            icon: Archive,
            label: channel.isArchived ? t('channel.unarchiveChannel') : t('channel.archiveChannel'),
            disabled: archiveChannel.isPending || unarchiveChannel.isPending,
            onClick: async () => {
              const ok = await useConfirmStore.getState().confirm({
                title: t(
                  channel.isArchived ? 'channel.unarchiveChannel' : 'channel.archiveChannel',
                ),
                message: t(
                  channel.isArchived
                    ? 'channel.unarchiveChannelConfirm'
                    : 'channel.archiveChannelConfirm',
                ),
              })
              if (!ok) return
              if (channel.isArchived) {
                unarchiveChannel.mutate(channel.id)
              } else {
                archiveChannel.mutate(channel.id)
              }
            },
          },
          {
            icon: Trash2,
            label: t('channel.deleteChannel'),
            danger: true,
            disabled: deleteChannel.isPending,
            onClick: async () => {
              const ok = await useConfirmStore.getState().confirm({
                title: t('channel.deleteChannel'),
                message: t('channel.deleteChannelConfirm'),
              })
              if (ok) deleteChannel.mutate(channel.id)
            },
          },
        ],
      },
    ]
  }, [
    archiveChannel,
    channelContextMenu,
    deleteChannel,
    onOpenChannelWindow,
    selectedServerSlug,
    t,
    unarchiveChannel,
    updateChannel,
  ])

  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event('shadow:open-command-palette'))
  }, [])

  const submitCreateChannel = () => {
    const name = channelDraftName.trim()
    if (!name || isCreatingChannel) return
    onCreateChannel({ name, type: channelDraftType, isPrivate: channelDraftPrivate })
    setChannelDraftName('')
    setChannelDraftType('text')
    setChannelDraftPrivate(false)
    setShowCreateChannel(false)
  }

  return (
    <>
      <OsTopBarHeader
        selectedServer={selectedServer}
        servers={servers}
        maximizedWindowId={maximizedWindowId}
        channelTabs={channelTabs}
        voiceActivityByChannelId={voiceActivityByChannelId}
        hasChannels={channels.length > 0}
        visibleInboxes={visibleInboxes}
        desktopInboxAgentIds={desktopInboxAgentIds}
        scopedUnread={scopedUnread}
        activeInboxAgentId={
          activeChannelBubble?.source === 'inbox'
            ? (activeChannelBubble.inboxEntry?.agent.id ?? null)
            : null
        }
        activeInboxChannelId={
          activeChannelBubble?.source === 'inbox' ? activeChannelBubble.channel.id : null
        }
        loadingInboxId={loadingInboxId}
        draggingTabId={draggingTabId}
        floatingLayerZIndex={floatingLayerZIndex}
        floatingPreviewLayerZIndex={floatingPreviewLayerZIndex}
        isDocumentFullscreen={isDocumentFullscreen}
        isInboxesLoading={isInboxesLoading}
        user={user}
        channelTabRefs={channelTabRefs}
        inboxButtonRefs={inboxButtonRefs}
        isChannelPreviewSuppressed={isChannelPreviewSuppressed}
        isInboxPreviewSuppressed={isInboxPreviewSuppressed}
        onExit={onExit}
        onSelectServer={onSelectServer}
        onOpenProfile={onOpenProfile}
        onOpenSettings={onOpenSettings}
        onOpenBuddy={onOpenBuddy}
        onOpenTasks={onOpenTasks}
        onOpenWallet={onOpenWallet}
        onOpenShop={onOpenShop}
        onToggleFullscreen={handleToggleDocumentFullscreen}
        onDraggingTabChange={setDraggingTabId}
        onCloseChannelTab={closeChannelTabFromTopBar}
        onOpenChannelContextMenu={openChannelContextMenu}
        onOpenChannelTab={toggleChannelBubble}
        onReorderChannelTab={onReorderChannelTab}
        onOpenChannelPicker={openChannelPickerFromTopBar}
        onOpenInbox={openInboxFromTopBar}
        onPinInboxToDesktop={onPinInboxToDesktop}
        onUnpinInboxFromDesktop={onUnpinInboxFromDesktop}
        onToggleServerMembers={toggleServerMembersBubble}
        onToggleCloudComputers={toggleCloudComputersBubble}
        onOpenCommandPalette={openCommandPalette}
        onRestoreMaximizedWindow={onRestoreMaximizedWindow}
      />
      {activeCloudComputersBubble && activeCloudComputersPosition ? (
        <OsFloatingBubbleSurface
          position={activeCloudComputersPosition}
          zIndex={floatingLayerZIndex}
          className="max-h-[min(520px,calc(100vh-84px))]"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/12 bg-white/8 text-primary">
                <Monitor size={17} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-text-primary">
                  {t('cloudComputers.title')}
                </p>
                <p className="truncate text-xs font-bold text-text-muted">
                  {t('cloudComputers.subtitle')}
                </p>
              </div>
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto p-2">
            {cloudComputersQuery.isLoading ? (
              <div className="grid min-h-28 place-items-center text-text-muted">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : cloudComputersQuery.error ? (
              <div className="px-3 py-5 text-center">
                <p className="text-sm font-bold text-text-muted">
                  {t('cloudComputers.failureReason.cluster_unavailable')}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-3"
                  onClick={() => cloudComputersQuery.refetch()}
                >
                  {t('common.retry')}
                </Button>
              </div>
            ) : (cloudComputersQuery.data ?? []).length === 0 ? (
              <button
                type="button"
                className="w-full rounded-2xl px-3 py-5 text-left transition hover:bg-white/7"
                onClick={() => {
                  setActiveCloudComputersBubble(null)
                  onOpenCloudComputers()
                }}
              >
                <p className="text-sm font-black text-text-primary">
                  {t('cloudComputers.emptyTitle')}
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-text-muted">
                  {t('cloudComputers.emptyDesc')}
                </p>
              </button>
            ) : (
              (cloudComputersQuery.data ?? []).slice(0, 6).map((computer) => {
                const health = topBarCloudComputerHealth(computer)
                return (
                  <button
                    type="button"
                    key={computer.id}
                    className="group grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition duration-200 hover:border-white/10 hover:bg-white/8 active:scale-[0.985]"
                    onClick={() => {
                      setActiveCloudComputersBubble(null)
                      onOpenCloudComputers(computer.id)
                    }}
                    aria-label={t('cloudComputers.openComputer', { name: computer.name })}
                  >
                    <div className="flex h-[58px] items-center justify-center transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.04]">
                      <CloudComputerShell
                        color={resolveCloudComputerShellColor(
                          computer.appearance?.shellColor,
                          computer.id,
                        )}
                        status={computer.status}
                        size="sm"
                        label={computer.name}
                      />
                    </div>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-black text-text-primary">
                          {computer.name}
                        </span>
                        <TopBarCloudComputerBuddyStack computer={computer} />
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-text-muted">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            topBarCloudComputerStatusClass(health),
                          )}
                        />
                        {t(`cloudComputers.health.${health}`)}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
          {(cloudComputersQuery.data ?? []).length > 0 ? (
            <div className="border-t border-white/10 p-2">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-primary transition hover:bg-white/8"
                onClick={() => {
                  setActiveCloudComputersBubble(null)
                  onOpenCloudComputers()
                }}
              >
                <Monitor size={14} />
                {t('cloudComputers.title')}
              </button>
            </div>
          ) : null}
        </OsFloatingBubbleSurface>
      ) : null}
      {activeServerMembersBubble && activeServerMembersPosition ? (
        <OsFloatingBubbleSurface
          position={activeServerMembersPosition}
          zIndex={floatingLayerZIndex}
          className="h-[min(580px,calc(100vh-84px))]"
          contentClassName="flex"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
              <ServerIcon
                iconUrl={selectedServer.server.iconUrl}
                name={selectedServer.server.name}
                size="sm"
                variant="plain"
                isPublic={selectedServer.server.isPublic}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-text-primary">
                  {t('member.members')}
                </p>
                <p className="truncate text-xs font-bold text-text-muted">
                  {selectedServer.server.name}
                </p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MemberList serverId={selectedServer.server.id} embedded />
            </div>
          </div>
        </OsFloatingBubbleSurface>
      ) : null}
      {activeChannelMembersBubble && activeChannelMembersPosition ? (
        <OsFloatingBubbleSurface
          position={activeChannelMembersPosition}
          zIndex={floatingLayerZIndex}
          className="h-[min(520px,calc(100vh-84px))]"
          contentClassName="flex"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-white/10 px-4 py-3">
              <p className="text-sm font-black text-text-primary">{t('member.members')}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MemberList
                serverId={selectedServer.server.id}
                channelId={activeChannelMembersBubble.channelId}
                embedded
              />
            </div>
          </div>
        </OsFloatingBubbleSurface>
      ) : null}
      {activeChannelBubble && channelBubblePosition ? (
        <OsFloatingBubbleSurface
          position={channelBubblePosition}
          zIndex={floatingLayerZIndex}
          className="h-[min(640px,calc(100vh-84px))]"
          contentClassName="flex"
        >
          <div className="min-w-0 flex-1">
            <ChannelView
              key={`${activeChannelBubble.source}:${activeChannelBubble.channel.id}`}
              channelId={activeChannelBubble.channel.id}
              serverSlug={selectedServerSlug}
              onPreviewFile={onPreviewFile}
              voiceScreenSharePresentation={voiceScreenSharePresentation}
              onActivateVoiceScreenWindow={onActivateVoiceScreenWindow}
              onOpenMembers={
                activeChannelBubble.source === 'channel'
                  ? (anchor) => {
                      const channelId = activeChannelBubble.channel.id
                      setActiveChannelPicker(null)
                      setActiveServerMembersBubble(null)
                      setActiveChannelMembersBubble((current) =>
                        current?.channelId === channelId ? null : { anchor, channelId },
                      )
                    }
                  : undefined
              }
              syncNavigationState={false}
            />
          </div>
        </OsFloatingBubbleSurface>
      ) : null}
      {activeChannelPicker && channelPickerPosition ? (
        <div
          className="fixed z-[820] flex max-h-[min(560px,calc(100vh-84px))] flex-col overflow-hidden rounded-[22px] border border-white/14 bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
          data-os-floating-bubble-root="true"
          style={{
            zIndex: floatingLayerZIndex,
            left: channelPickerPosition.left,
            top: channelPickerPosition.top,
            width: channelPickerPosition.width,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <BubbleArrow centerX={channelPickerPosition.arrowCenterX} />
          <div className="border-b border-white/10 p-3">
            <div className="flex gap-2">
              <input
                ref={channelPickerInputRef}
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value)}
                placeholder={t('common.search')}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/22 px-3 py-2 text-sm font-bold text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/45"
              />
              <Button
                type="button"
                variant="glass"
                size="xs"
                className="h-9 w-9 shrink-0 rounded-xl p-0 text-primary hover:text-primary"
                title={t('channel.addChannel')}
                aria-label={t('channel.addChannel')}
                onClick={() => {
                  setActiveChannelPicker(null)
                  setShowCreateChannel(true)
                }}
              >
                <Plus size={15} />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2">
            {remainingChannels.length > 0 ? (
              remainingChannels.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-text-secondary transition hover:bg-white/8 hover:text-text-primary"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenChannelWindow(channel)
                    setActiveChannelPicker(null)
                  }}
                  onContextMenu={(event) => openChannelContextMenu(channel, event)}
                >
                  <ChannelTypeIcon
                    type={channel.type}
                    size={15}
                    className="shrink-0 text-text-muted"
                  />
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-sm font-bold text-text-muted">
                {t('channel.noChannels')}
              </p>
            )}
          </div>
        </div>
      ) : null}
      {channelContextMenu ? (
        <ContextMenu
          x={channelContextMenu.x}
          y={channelContextMenu.y}
          groups={channelContextMenuGroups}
          minWidth={226}
          zIndex={floatingLayerZIndex}
          onClose={() => setChannelContextMenu(null)}
        />
      ) : null}
      <Modal
        open={!!renamingChannel}
        onClose={() => {
          setRenamingChannel(null)
          setRenameChannelDraft('')
        }}
      >
        <ModalContent maxWidth="max-w-md">
          <ModalHeader
            overline={t('channel.channels')}
            icon={<Edit3 size={18} strokeWidth={2.6} />}
            title={t('channel.editChannel')}
            subtitle={renamingChannel?.name}
            closeLabel={t('common.close')}
          />
          <ModalBody className="py-5">
            <Input
              ref={renameChannelInputRef}
              label={t('channel.channelName')}
              value={renameChannelDraft}
              onChange={(event) => setRenameChannelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault()
                  submitRenameChannel()
                }
              }}
              placeholder={t('channel.channelName')}
              className="!rounded-2xl !border-2 !border-border-subtle !bg-bg-tertiary/50 !py-3 focus:!ring-4 focus:!ring-primary/10"
            />
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setRenamingChannel(null)
                  setRenameChannelDraft('')
                }}
                className="font-black uppercase tracking-widest"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={submitRenameChannel}
                disabled={
                  !renameChannelDraft.trim() ||
                  renameChannelDraft.trim() === renamingChannel?.name ||
                  updateChannel.isPending
                }
                loading={updateChannel.isPending}
                className="font-black uppercase tracking-widest"
              >
                {t('common.save')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal open={showCreateChannel} onClose={() => setShowCreateChannel(false)}>
        <ModalContent maxWidth="max-w-md">
          <ModalHeader
            overline={t('channel.channels')}
            icon={<Plus size={18} strokeWidth={2.6} />}
            title={t('channel.createChannel')}
            subtitle={t('channel.createChannelDesc')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="min-h-0 space-y-4 touch-pan-y overflow-y-auto overscroll-contain py-5">
            <Input
              ref={createChannelNameInputRef}
              label={t('channel.channelName')}
              value={channelDraftName}
              onChange={(event) => setChannelDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault()
                  submitCreateChannel()
                }
              }}
              placeholder={t('channel.channelName')}
              className="!rounded-2xl !border-2 !border-border-subtle !bg-bg-tertiary/50 !py-3 focus:!ring-4 focus:!ring-primary/10"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {CHANNEL_CREATE_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={channelDraftType === type ? 'primary' : 'glass'}
                  size="xs"
                  onClick={() => setChannelDraftType(type)}
                  className="font-black uppercase tracking-widest"
                >
                  <ChannelTypeIcon type={type} size={14} />
                  <span>
                    {type === 'voice'
                      ? t('channel.typeVoice')
                      : type === 'announcement'
                        ? t('channel.typeAnnouncement')
                        : t('channel.typeText')}
                  </span>
                </Button>
              ))}
            </div>
            <label className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-tertiary/50 px-4 py-3">
              <span className="text-sm text-foreground">{t('channel.privateChannelToggle')}</span>
              <Switch checked={channelDraftPrivate} onCheckedChange={setChannelDraftPrivate} />
            </label>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowCreateChannel(false)}
                className="font-black uppercase tracking-widest"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={submitCreateChannel}
                disabled={!channelDraftName.trim() || isCreatingChannel}
                loading={isCreatingChannel}
                className="font-black uppercase tracking-widest"
              >
                {t('common.create')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
})
