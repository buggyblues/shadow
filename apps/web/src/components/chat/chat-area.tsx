import {
  Badge,
  Button,
  cn,
  GlassPanel,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@shadowob/ui'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ClipboardCopy,
  Copy,
  Hash,
  Inbox,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  type LucideProps,
  Megaphone,
  PawPrint,
  ShoppingBag,
  Smartphone,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { playReceiveSound } from '../../lib/sounds'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { UserAvatar } from '../common/avatar'
import { useConfirmStore } from '../common/confirm-dialog'
import { InvitePanel } from '../common/invite-panel'
import { NotificationBell } from '../notification/notification-bell'
import { type PickerResult, WorkspaceFilePicker } from '../workspace'
import {
  CHAT_SCROLLING_RESET_DELAY,
  CHAT_VIRTUAL_OVERSCAN,
  CHAT_VIRTUALIZE_THRESHOLD,
  estimateChatTimelineItemSize,
  getChatTimelineItemKey,
  isScrollNearBottom,
  shouldAdjustChatScrollPositionOnItemSizeChange,
} from './chat-virtualization'
import { FilePreviewPanel } from './file-preview-panel'
import { type Message as BubbleMessage, MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import { type OAuthLinkPreview, OAuthLinkPreviewPanel } from './oauth-link-card'

const CopyQrIcon = (props: LucideProps) => <Copy {...props} size={14} strokeWidth={2.4} />

interface Author {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
}

interface Message {
  id: string
  content: string
  channelId?: string
  authorId: string
  threadId: string | null
  replyToId: string | null
  isEdited: boolean
  isPinned: boolean
  createdAt: string
  updatedAt?: string
  author?: Author
  reactions?: ReactionGroup[]
  attachments?: { id: string; filename: string; url: string; contentType: string; size: number }[]
  metadata?: BubbleMessage['metadata']
  /** Optimistic send status — only set on client-side pending messages */
  sendStatus?: 'sending' | 'failed'
}

interface MessagesPage {
  messages: Message[]
  hasMore: boolean
}

interface Channel {
  id: string
  name: string
  kind?: string
  topic: string | null
  type: string
  isArchived?: boolean
  otherUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status?: string | null
    isBot?: boolean
  } | null
}

export interface ChannelSwitcherOption {
  id: string
  name: string
  type?: string
  isArchived?: boolean
}

interface MemberEvent {
  serverId: string
  channelId?: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

/** A system event rendered inline between messages */
interface SystemEvent {
  id: string
  type: 'joined' | 'left'
  scope: 'server' | 'channel'
  displayName: string
  isBot: boolean
  timestamp: number
}

interface WorkStatus {
  userId: string
  name: string
  typing: boolean
  activity: string | null
}

interface WorkStatusPayload {
  channelId: string
  userId: string
  username?: string
  displayName?: string | null
}

interface TypingStatusPayload extends WorkStatusPayload {
  typing?: boolean
}

interface ActivityStatusPayload extends WorkStatusPayload {
  activity: string | null
}

interface MemberCacheEntry {
  userId: string
  user?: {
    username?: string | null
    displayName?: string | null
  }
}

interface BuddyAgentCacheEntry {
  botUser?: {
    id: string
    username?: string | null
    displayName?: string | null
  } | null
}

interface BuddyAgentAccessEntry {
  userId: string
  config?: {
    buddyMode?: 'private' | 'shareable'
  } | null
  botUser?: {
    id: string
  } | null
}

/** Pre-computed timeline item with grouping info */
type TimelineItem =
  | { kind: 'message'; data: Message; isGrouped: boolean }
  | { kind: 'system'; data: SystemEvent }

type InteractiveResponse = NonNullable<
  NonNullable<BubbleMessage['metadata']>['interactiveResponse']
>
type InboxTaskFilter = 'all' | 'open' | 'done'

const DONE_TASK_STATUSES = new Set(['completed', 'failed', 'canceled', 'transferred'])

function getMessageTaskStatuses(message: Message): string[] {
  const cards = message.metadata?.cards
  if (!Array.isArray(cards)) return []
  return cards.flatMap((card) => {
    if (
      card &&
      typeof card === 'object' &&
      'kind' in card &&
      card.kind === 'task' &&
      'status' in card &&
      typeof card.status === 'string'
    ) {
      return [card.status]
    }
    return []
  })
}

function messageMatchesInboxTaskFilter(message: Message, filter: InboxTaskFilter) {
  if (filter === 'all') return true
  const statuses = getMessageTaskStatuses(message)
  if (statuses.length === 0) return false
  if (filter === 'done') return statuses.every((status) => DONE_TASK_STATUSES.has(status))
  return statuses.some((status) => !DONE_TASK_STATUSES.has(status))
}

function trimStatusEllipsis(label: string | null | undefined): string | null {
  const trimmed = label?.trim()
  if (!trimmed) return null
  return trimmed.replace(/[.\u2026\u3002\uff0e]+$/u, '')
}

const WORK_STATUS_TIMEOUT_MS = {
  typing: 3_000,
  activity: 120_000,
} as const

export function ChatArea({
  onBack,
  showMemberToggle = true,
  channelSwitcher,
  onEnterChannel,
  onExitCopilot,
}: {
  onBack?: () => void
  showMemberToggle?: boolean
  channelSwitcher?: {
    channels: ChannelSwitcherOption[]
    activeChannelId: string
    onSelectChannel: (channelId: string) => void
  }
  onEnterChannel?: () => void
  onExitCopilot?: () => void
} = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { activeChannelId, activeServerId } = useChatStore()
  const user = useAuthStore((s) => s.user)
  const { setMobileView } = useUIStore()
  const parentRef = useRef<HTMLDivElement>(null)
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [workStatuses, setWorkStatuses] = useState<WorkStatus[]>([])
  const [lastReadCount, setLastReadCount] = useState(0)
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null)
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [showPageQr, setShowPageQr] = useState(false)
  const [inboxTaskFilter, setInboxTaskFilter] = useState<InboxTaskFilter>('all')
  const pageShareUrl = window.location.href
  const typingTimersRef = useRef<Map<string, number>>(new Map())
  const activityTimersRef = useRef<Map<string, number>>(new Map())
  const initialScrollDoneRef = useRef(false)
  const prevMessageCountRef = useRef(0)
  const shouldStickToBottomRef = useRef(true)
  const stickyScrollRafRef = useRef<number | null>(null)
  const pendingPrependRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const hasSeenSocketConnectRef = useRef(false)
  const [previewFile, setPreviewFile] = useState<{
    id: string
    filename: string
    url: string
    contentType: string
    size: number
  } | null>(null)
  const [previewOAuthLink, setPreviewOAuthLink] = useState<OAuthLinkPreview | null>(null)

  const { data: serverShopEntry } = useQuery({
    queryKey: ['chat-server-shop-entry', activeServerId],
    queryFn: () =>
      fetchApi<{ products: Array<{ id: string }>; total?: number }>(
        `/api/servers/${activeServerId}/shop/products?limit=1`,
      ),
    enabled: Boolean(activeServerId),
    retry: false,
    staleTime: 60_000,
  })
  const hasServerShopProducts =
    Boolean(activeServerId) &&
    (serverShopEntry?.total ?? serverShopEntry?.products?.length ?? 0) > 0
  const { data: activeServerSummary } = useQuery({
    queryKey: ['server', activeServerId],
    queryFn: () => fetchApi<{ id: string; slug?: string | null }>(`/api/servers/${activeServerId}`),
    enabled: Boolean(activeServerId && hasServerShopProducts),
    staleTime: 60_000,
  })
  const serverShopRouteKey = activeServerSummary?.slug ?? activeServerId

  const resolveWorkStatusName = useCallback(
    (payload: WorkStatusPayload, existingName?: string) => {
      const channelMembers =
        queryClient.getQueryData<MemberCacheEntry[]>([
          'members',
          activeServerId,
          activeChannelId,
        ]) ?? []
      const serverMembers =
        queryClient.getQueryData<MemberCacheEntry[]>(['members', activeServerId]) ?? []
      const member =
        channelMembers.find((m) => m.userId === payload.userId) ??
        serverMembers.find((m) => m.userId === payload.userId)
      const buddyAgents =
        queryClient.getQueryData<BuddyAgentCacheEntry[]>([
          'members-buddy-agents',
          activeServerId,
        ]) ?? []
      const buddyAgent = buddyAgents.find((agent) => agent.botUser?.id === payload.userId)
      const candidates = [
        payload.displayName,
        buddyAgent?.botUser?.displayName,
        member?.user?.displayName,
        payload.username,
        buddyAgent?.botUser?.username,
        member?.user?.username,
        existingName,
        payload.userId,
      ]
      return (
        candidates.find((value) => typeof value === 'string' && value.trim()) as string
      ).trim()
    },
    [activeChannelId, activeServerId, queryClient],
  )

  const getWorkStatusDisplayLabel = useCallback(
    (status: WorkStatus): string | null => {
      if (status.typing) {
        return trimStatusEllipsis(t('member.activityTyping'))
      }
      if (!status.activity) return null

      const label =
        status.activity === 'thinking'
          ? t('member.activityThinking')
          : status.activity === 'working'
            ? t('member.activityWorking')
            : status.activity === 'ready'
              ? t('member.activityReady')
              : status.activity === 'preparing'
                ? t('member.activityPreparing')
                : status.activity
      return trimStatusEllipsis(label)
    },
    [t],
  )

  const updateWorkStatus = useCallback(
    (
      payload: WorkStatusPayload,
      patch: Pick<WorkStatus, 'typing'> | Pick<WorkStatus, 'activity'>,
    ) => {
      setWorkStatuses((prev) => {
        const idx = prev.findIndex((item) => item.userId === payload.userId)
        const existing = idx >= 0 ? prev[idx] : undefined
        const name = resolveWorkStatusName(payload, existing?.name)

        const nextStatus: WorkStatus = {
          userId: payload.userId,
          name,
          typing:
            'typing' in patch
              ? (patch as Pick<WorkStatus, 'typing'>).typing
              : (existing?.typing ?? false),
          activity:
            'activity' in patch
              ? (patch as Pick<WorkStatus, 'activity'>).activity
              : (existing?.activity ?? null),
        }

        if (!nextStatus.typing && !nextStatus.activity) {
          if (idx < 0) return prev
          return prev.filter((item) => item.userId !== payload.userId)
        }

        if (idx < 0) return [...prev, nextStatus]
        const next = [...prev]
        next[idx] = nextStatus
        return next
      })
    },
    [resolveWorkStatusName],
  )

  const visibleWorkStatuses = useMemo(() => {
    const next: (WorkStatus & { label: string })[] = []
    for (const status of workStatuses) {
      const label = getWorkStatusDisplayLabel(status)
      if (!label) continue
      next.push({ ...status, label })
    }
    return next
  }, [getWorkStatusDisplayLabel, workStatuses])
  const hasVisibleWorkStatuses = visibleWorkStatuses.length > 0
  const timelineBottomPadding = 12

  // Save-to-workspace state
  const [saveToWorkspaceFile, setSaveToWorkspaceFile] = useState<{
    filename: string
    url: string
    contentType: string
    size: number
  } | null>(null)

  // Handle ?msg= query param for message anchor links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const msgId = params.get('msg')
    if (!msgId) return

    setHighlightMsgId(msgId)
    // Scroll to the message after a short delay
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 500)
    // Clear highlight after animation
    const clearTimer = window.setTimeout(() => setHighlightMsgId(null), 3000)

    return () => {
      window.clearTimeout(scrollTimer)
      window.clearTimeout(clearTimer)
    }
  }, [activeChannelId])

  // Fetch channel info
  const { data: channel } = useQuery({
    queryKey: ['channel', activeChannelId],
    queryFn: () => fetchApi<Channel>(`/api/channels/${activeChannelId}`),
    enabled: !!activeChannelId,
    staleTime: 30_000,
  })

  const { data: buddyAgents = [] } = useQuery({
    queryKey: ['agents', 'include-rentals', 'dm-buddy-modes'],
    queryFn: () => fetchApi<BuddyAgentAccessEntry[]>('/api/agents?includeRentals=true'),
    enabled: channel?.kind === 'dm',
    staleTime: 60_000,
  })

  const privateBuddyUserIds = useMemo(
    () =>
      new Set(
        buddyAgents
          .filter((agent) => agent.config?.buddyMode !== 'shareable')
          .map((agent) => agent.botUser?.id ?? agent.userId),
      ),
    [buddyAgents],
  )
  const directPeer = channel?.kind === 'dm' ? channel.otherUser : null
  const directPeerName = directPeer?.displayName ?? directPeer?.username ?? channel?.name ?? '...'
  const directPeerIsPrivateBuddy = Boolean(
    directPeer?.isBot && privateBuddyUserIds.has(directPeer.id),
  )
  const channelDisplayName = directPeer ? directPeerName : (channel?.name ?? '...')
  const isInboxChannel = channel?.topic?.startsWith('shadow:buddy-inbox:') ?? false
  const visibleChannelTopic = isInboxChannel ? null : channel?.topic

  // Fetch messages with infinite query (cursor-based pagination)
  const PAGE_SIZE = 50
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingMessages,
  } = useInfiniteQuery({
    queryKey: ['messages', activeChannelId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (pageParam) params.set('cursor', pageParam as string)
      return fetchApi<MessagesPage>(`/api/channels/${activeChannelId}/messages?${params}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined
      // Cursor = createdAt of the oldest message in this page (first item, since sorted oldest-to-newest)
      return lastPage.messages[0]?.createdAt
    },
    enabled: !!activeChannelId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // Flatten all pages into a single array (oldest-to-newest)
  const messages = useMemo(() => {
    if (!data) return []
    // Pages are stored [latest, older, oldest...], reverse then flatten
    return [...data.pages].reverse().flatMap((p) => p.messages)
  }, [data])

  const timelineMessages = useMemo(() => {
    if (!isInboxChannel || inboxTaskFilter === 'all') return messages
    return messages.filter((message) => messageMatchesInboxTaskFilter(message, inboxTaskFilter))
  }, [inboxTaskFilter, isInboxChannel, messages])

  // O(1) message lookup map — avoids O(n) .find() for replyToMessage
  const messageMap = useMemo(() => {
    const map = new Map<string, Message>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  const interactiveResponsesBySourceId = useMemo(() => {
    const map = new Map<string, InteractiveResponse>()
    for (const m of messages) {
      const response = m.metadata?.interactiveResponse
      if (response?.sourceMessageId) {
        map.set(response.sourceMessageId, response)
      }
    }
    return map
  }, [messages])

  // Build timeline with pre-computed grouping — avoids per-render calculation
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []
    for (let i = 0; i < timelineMessages.length; i++) {
      const m = timelineMessages[i]!
      const prev = i > 0 ? timelineMessages[i - 1] : undefined
      const isGrouped =
        prev !== undefined &&
        prev.authorId === m.authorId &&
        !m.replyToId &&
        Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 60_000
      items.push({ kind: 'message' as const, data: m, isGrouped })
    }

    // Insert system events at the correct position based on timestamp
    for (const evt of systemEvents) {
      let insertIdx = items.length
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]!
        const itemTime =
          item.kind === 'message' ? new Date(item.data.createdAt).getTime() : item.data.timestamp
        if (itemTime <= evt.timestamp) {
          insertIdx = i + 1
          break
        }
        if (i === 0) insertIdx = 0
      }
      items.splice(insertIdx, 0, { kind: 'system', data: evt })
    }
    return items
  }, [systemEvents, timelineMessages])

  // Listen for new messages via WebSocket
  useSocketEvent('message:new', (msg: Message) => {
    if (msg.channelId === activeChannelId) {
      const scrollEl = parentRef.current
      const wasNearBottom = scrollEl ? isScrollNearBottom(scrollEl, 160) : true

      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old || old.pages.length === 0) return old
        const pages = [...old.pages]
        const firstPage = pages[0]!

        // Deduplicate: if message already exists, update it
        if (firstPage.messages.some((m) => m.id === msg.id)) {
          pages[0] = {
            ...firstPage,
            messages: firstPage.messages.map((m) => (m.id === msg.id ? msg : m)),
          }
          return { ...old, pages }
        }

        // Check if this is confirmation of an optimistic message from us
        if (msg.authorId === user?.id) {
          const tempIdx = firstPage.messages.findIndex(
            (m) => m.id.startsWith('temp-') && m.authorId === msg.authorId,
          )
          if (tempIdx >= 0) {
            pages[0] = {
              ...firstPage,
              messages: firstPage.messages.map((m, i) => (i === tempIdx ? msg : m)),
            }
            return { ...old, pages }
          }
        }

        // Append new message
        pages[0] = {
          ...firstPage,
          messages: [...firstPage.messages, msg],
        }
        return { ...old, pages }
      })
      shouldStickToBottomRef.current = wasNearBottom || shouldStickToBottomRef.current
      // Play receive sound for messages from others
      if (msg.authorId !== user?.id) {
        playReceiveSound()
      }
    }
  })

  // Listen for message updates
  useSocketEvent('message:updated', (msg: Message) => {
    if (msg.channelId === activeChannelId) {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (m.id === msg.id ? msg : m)),
          })),
        }
      })
    }
  })

  // Listen for message deletes
  useSocketEvent('message:deleted', (data: { id: string; channelId: string }) => {
    if (data.channelId === activeChannelId) {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== data.id),
          })),
        }
      })
    }
  })

  // Listen for reaction updates via WS
  useSocketEvent(
    'reaction:updated',
    (data: { messageId: string; channelId: string; reactions: ReactionGroup[] }) => {
      if (data.channelId === activeChannelId) {
        queryClient.setQueryData<InfiniteData<MessagesPage>>(
          ['messages', activeChannelId],
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) =>
                  m.id === data.messageId ? { ...m, reactions: data.reactions } : m,
                ),
              })),
            }
          },
        )
      }
    },
  )

  // Listen for typing indicators
  useSocketEvent('message:typing', (data: TypingStatusPayload) => {
    if (data.channelId === activeChannelId && data.userId !== user?.id) {
      const existingTimer = typingTimersRef.current.get(data.userId)
      if (existingTimer) window.clearTimeout(existingTimer)
      const isTyping = data.typing !== false
      if (!isTyping) {
        typingTimersRef.current.delete(data.userId)
        updateWorkStatus(data, { typing: false })
        return
      }
      updateWorkStatus(data, { typing: true })
      const timer = window.setTimeout(() => {
        typingTimersRef.current.delete(data.userId)
        updateWorkStatus(data, { typing: false })
      }, WORK_STATUS_TIMEOUT_MS.typing)
      typingTimersRef.current.set(data.userId, timer)
    }
  })

  // Listen for member join events
  useSocketEvent('member:joined', (data: MemberEvent) => {
    if (data.serverId === activeServerId) {
      const scope = data.channelId ? 'channel' : 'server'
      setSystemEvents((prev) => {
        // Deduplicate: if a server-level join exists for this user within 5s, replace with channel-level
        if (scope === 'channel') {
          const recentServerJoin = prev.find(
            (e) =>
              e.type === 'joined' &&
              e.scope === 'server' &&
              e.displayName === data.displayName &&
              Date.now() - e.timestamp < 5000,
          )
          if (recentServerJoin) {
            return prev.map((e) => (e.id === recentServerJoin.id ? { ...e, scope: 'channel' } : e))
          }
        }
        return [
          ...prev,
          {
            id: `join-${data.userId}-${Date.now()}`,
            type: 'joined',
            scope,
            displayName: data.displayName,
            isBot: data.isBot,
            timestamp: Date.now(),
          },
        ]
      })
      // Invalidate members cache
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId] })
    }
  })

  // Listen for member leave events
  useSocketEvent('member:left', (data: MemberEvent) => {
    if (data.serverId === activeServerId) {
      const scope = data.channelId ? 'channel' : 'server'
      setSystemEvents((prev) => [
        ...prev,
        {
          id: `leave-${data.userId}-${Date.now()}`,
          type: 'left',
          scope,
          displayName: data.displayName,
          isBot: data.isBot,
          timestamp: Date.now(),
        },
      ])
      // Invalidate members cache
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId] })
    }
  })

  // Listen for agent activity status
  useSocketEvent('presence:activity', (data: ActivityStatusPayload) => {
    if (data.channelId !== activeChannelId) return
    const existingTimer = activityTimersRef.current.get(data.userId)
    if (existingTimer) window.clearTimeout(existingTimer)
    const activity = data.activity ?? null
    if (!activity) {
      activityTimersRef.current.delete(data.userId)
      updateWorkStatus(data, { activity: null })
      return
    }
    updateWorkStatus(data, { activity })
    const timer = window.setTimeout(() => {
      activityTimersRef.current.delete(data.userId)
      updateWorkStatus(data, { activity: null })
    }, WORK_STATUS_TIMEOUT_MS.activity)
    activityTimersRef.current.set(data.userId, timer)
  })

  useEffect(() => {
    return () => {
      for (const timer of typingTimersRef.current.values()) window.clearTimeout(timer)
      for (const timer of activityTimersRef.current.values()) window.clearTimeout(timer)
      typingTimersRef.current.clear()
      activityTimersRef.current.clear()
    }
  }, [])

  // Clear system events and activity on channel change
  useEffect(() => {
    setSystemEvents([])
    for (const timer of typingTimersRef.current.values()) window.clearTimeout(timer)
    for (const timer of activityTimersRef.current.values()) window.clearTimeout(timer)
    typingTimersRef.current.clear()
    activityTimersRef.current.clear()
    setWorkStatuses([])
  }, [activeChannelId, activeServerId])

  // Refetch messages on socket reconnect to catch any missed while offline
  useSocketEvent('connect', () => {
    if (!hasSeenSocketConnectRef.current) {
      hasSeenSocketConnectRef.current = true
      return
    }
    if (activeChannelId) {
      queryClient.invalidateQueries({ queryKey: ['messages', activeChannelId] })
    }
  })

  // Listen for channel updates (archive/unarchive)
  useSocketEvent('channel:updated', (data: { id: string; isArchived?: boolean }) => {
    if (data.id === activeChannelId) {
      queryClient.invalidateQueries({ queryKey: ['channel', activeChannelId] })
    }
  })

  // Add reaction
  const addReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      fetchApi(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
  })

  // Dynamic blocks (forms, markdown, attachments) behave best in normal flow for active chats.
  const shouldVirtualize = timeline.length > CHAT_VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: timeline.length,
    enabled: shouldVirtualize,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateChatTimelineItemSize(timeline[index]),
    getItemKey: (index) => getChatTimelineItemKey(timeline[index], index),
    overscan: CHAT_VIRTUAL_OVERSCAN,
    paddingStart: 8,
    paddingEnd: timelineBottomPadding,
    scrollPaddingEnd: timelineBottomPadding,
    isScrollingResetDelay: CHAT_SCROLLING_RESET_DELAY,
    useFlushSync: true,
  })

  useLayoutEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange =
      shouldAdjustChatScrollPositionOnItemSizeChange
    return () => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    }
  }, [virtualizer])

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'auto') => {
      if (timeline.length === 0) return
      const lastIndex = timeline.length - 1
      const scrollEl = parentRef.current
      if (!scrollEl) return

      if (!shouldVirtualize) {
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior })
        return
      }

      virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior })
      requestAnimationFrame(() => {
        if (!shouldStickToBottomRef.current) return
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'auto' })
      })
    },
    [timeline.length, shouldVirtualize, virtualizer],
  )

  useEffect(() => {
    return () => {
      if (stickyScrollRafRef.current !== null) {
        window.cancelAnimationFrame(stickyScrollRafRef.current)
        stickyScrollRafRef.current = null
      }
    }
  }, [])

  // Single consolidated scroll-position effect — avoids conflicts from multiple useLayoutEffects
  useLayoutEffect(() => {
    const prevCount = prevMessageCountRef.current
    const currentCount = timeline.length

    if (currentCount === 0) return

    const pendingPrepend = pendingPrependRef.current
    if (pendingPrepend) {
      prevMessageCountRef.current = currentCount
      requestAnimationFrame(() => {
        const scrollEl = parentRef.current
        if (!scrollEl) {
          pendingPrependRef.current = null
          return
        }
        const heightDelta = scrollEl.scrollHeight - pendingPrepend.scrollHeight
        scrollEl.scrollTop = pendingPrepend.scrollTop + Math.max(0, heightDelta)
        pendingPrependRef.current = null
        shouldStickToBottomRef.current = isScrollNearBottom(scrollEl)
      })
      return
    }

    if (!initialScrollDoneRef.current) {
      // First load: scroll to bottom immediately
      initialScrollDoneRef.current = true
      prevMessageCountRef.current = currentCount
      scrollToBottom('auto')
      return
    }

    if (currentCount > prevCount) {
      const addedCount = currentCount - prevCount
      const scrollEl = parentRef.current
      if (scrollEl && addedCount > 0) {
        // Check if new messages were prepended (loading older) or appended (new messages)
        // Heuristic: if we were loading older messages, the new items are at the beginning
        // For new messages at the end, auto-scroll only if user was near bottom
        if (shouldStickToBottomRef.current) {
          // User was at bottom — scroll to new bottom
          scrollToBottom('auto')
          // Track read count
          setLastReadCount(currentCount)
        } else {
          // User was reading older messages — show indicator but don't auto-scroll
        }
      }
    } else if (currentCount < prevCount && shouldStickToBottomRef.current) {
      scrollToBottom('auto')
    }

    prevMessageCountRef.current = currentCount
  }, [timeline.length, virtualizer, scrollToBottom])

  // Reset scroll state on channel change
  useEffect(() => {
    initialScrollDoneRef.current = false
    prevMessageCountRef.current = 0
    shouldStickToBottomRef.current = true
    pendingPrependRef.current = null
    setLastReadCount(0)
  }, [activeChannelId])

  // Scroll event handler — load older messages + track stick-to-bottom
  useEffect(() => {
    const scrollEl = parentRef.current
    if (!scrollEl) return

    const handleScroll = () => {
      // Load more when near the top
      if (
        scrollEl.scrollTop < 200 &&
        hasNextPage &&
        !isFetchingNextPage &&
        !pendingPrependRef.current
      ) {
        pendingPrependRef.current = {
          scrollHeight: scrollEl.scrollHeight,
          scrollTop: scrollEl.scrollTop,
        }
        void fetchNextPage()
      }
      // Update read count when near bottom
      shouldStickToBottomRef.current = isScrollNearBottom(scrollEl, 96)
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Track read count for new message line (only set once on initial load)
  useEffect(() => {
    if (timeline.length > 0 && lastReadCount === 0) {
      setLastReadCount(timeline.length)
    }
  }, [timeline.length, lastReadCount])

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      addReaction.mutate({ messageId, emoji })
    },
    [addReaction],
  )

  const handleToggleSelect = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }, [])

  const handleEnterSelectionMode = useCallback((messageId: string) => {
    setSelectionMode(true)
    setSelectedMessageIds(new Set([messageId]))
  }, [])

  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedMessageIds(new Set())
  }, [])

  const handleCopySelectedAsMarkdown = useCallback(() => {
    const selectedMsgs = messages
      .filter((m) => selectedMessageIds.has(m.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const md = selectedMsgs
      .map((m) => {
        const author = m.author?.displayName || m.author?.username || 'Unknown'
        const time = new Date(m.createdAt).toLocaleString()
        const attachmentLines = (m.attachments ?? []).map((a) => `  📎 [${a.filename}](${a.url})`)
        return [`**${author}** (${time})`, m.content, ...attachmentLines].filter(Boolean).join('\n')
      })
      .join('\n\n---\n\n')
    navigator.clipboard.writeText(md)
    showToast(t('chat.copiedAsMarkdown', '已复制为 Markdown'), 'success')
    handleExitSelectionMode()
  }, [messages, selectedMessageIds, t, handleExitSelectionMode])

  const handleMessageUpdate = useCallback(
    (msg: BubbleMessage) => {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
          })),
        }
      })
    },
    [queryClient, activeChannelId],
  )

  const handleMessageDelete = useCallback(
    (msgId: string) => {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== msgId),
          })),
        }
      })
    },
    [queryClient, activeChannelId],
  )

  const handleAreaDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setDroppedFiles(Array.from(files))
    }
  }, [])

  const handleAreaDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleAreaDragLeave = useCallback((e: React.DragEvent) => {
    // Only set false if leaving the container (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  // Save chat attachment to workspace
  const handleSaveToWorkspace = useCallback(
    async (result: PickerResult) => {
      if (!saveToWorkspaceFile || !activeServerId) return
      try {
        const targetParentId = result.targetFolderId
        // Fetch the attachment and re-upload it to the workspace
        const resp = await fetch(saveToWorkspaceFile.url)
        const blob = await resp.blob()
        const file = new globalThis.File([blob], saveToWorkspaceFile.filename, {
          type: saveToWorkspaceFile.contentType,
        })
        const formData = new FormData()
        formData.append('file', file)
        if (targetParentId) formData.append('parentId', targetParentId)
        await fetchApi(`/api/servers/${activeServerId}/workspace/upload`, {
          method: 'POST',
          body: formData,
        })
        showToast(t('chat.savedToWorkspace'), 'success')
        setSaveToWorkspaceFile(null)
      } catch (_err) {
        showToast(t('chat.saveToWorkspaceFailed'), 'error')
      }
    },
    [saveToWorkspaceFile, activeServerId],
  )

  const handleCopyPageShareLink = useCallback(() => {
    navigator.clipboard.writeText(pageShareUrl).then(
      () => showToast(t('chat.linkCopied'), 'success'),
      () => showToast(t('chat.copyFailed', '复制失败'), 'error'),
    )
  }, [pageShareUrl, t])

  const renderTimelineItem = (item: TimelineItem, index: number) => (
    <>
      {lastReadCount > 0 && index === lastReadCount && (
        <div className="flex items-center gap-2 px-4 my-2">
          <div className="flex-1 h-px bg-danger/60" />
          <span className="text-xs text-danger font-black px-2">{t('chat.newMessages')}</span>
          <div className="flex-1 h-px bg-danger/60" />
        </div>
      )}
      {item.kind === 'system' ? (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5">
          <Badge
            variant="neutral"
            size="md"
            className="bg-bg-tertiary/50 backdrop-blur-sm rounded-full border-border-subtle gap-1.5 font-normal"
          >
            {item.data.type === 'joined' ? (
              <LogIn size={14} className="text-success" />
            ) : (
              <LogOut size={14} className="text-danger" />
            )}
            <span>
              {item.data.isBot ? 'Buddy · ' : ''}
              <span className="font-medium text-text-secondary">{item.data.displayName}</span>{' '}
              {item.data.type === 'joined'
                ? item.data.scope === 'channel'
                  ? t('member.joinedChannel')
                  : t('member.joinedServer')
                : item.data.scope === 'channel'
                  ? t('member.leftChannel')
                  : t('member.leftServer')}
            </span>
          </Badge>
        </div>
      ) : (
        <MessageBubble
          message={item.data}
          currentUserId={user?.id ?? ''}
          serverId={activeServerId ?? undefined}
          isGrouped={item.isGrouped}
          onReply={(id) => setReplyToId(id)}
          onReact={handleReact}
          onMessageUpdate={handleMessageUpdate}
          onMessageDelete={handleMessageDelete}
          onPreviewFile={(att) => {
            setPreviewOAuthLink(null)
            setPreviewFile(att)
          }}
          onPreviewOAuthLink={(preview) => {
            setPreviewFile(null)
            setPreviewOAuthLink(preview)
          }}
          onSaveToWorkspace={activeServerId ? (att) => setSaveToWorkspaceFile(att) : undefined}
          highlight={highlightMsgId === item.data.id}
          replyToMessage={
            item.data.replyToId ? (messageMap.get(item.data.replyToId) ?? null) : null
          }
          selectionMode={selectionMode}
          isSelected={selectedMessageIds.has(item.data.id)}
          submittedInteractiveResponse={
            item.data.metadata?.interactiveState?.response ??
            interactiveResponsesBySourceId.get(item.data.id) ??
            null
          }
          onToggleSelect={handleToggleSelect}
          onEnterSelectionMode={handleEnterSelectionMode}
        />
      )}
    </>
  )

  if (!activeChannelId) {
    return (
      <GlassPanel className="flex-1 flex items-center justify-center text-text-muted">
        <Loader2 size={16} className="animate-spin text-primary opacity-60" />
      </GlassPanel>
    )
  }

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : []
  const renderChannelSwitcherIcon = (type?: string) => {
    const Icon = type === 'voice' ? Volume2 : type === 'announcement' ? Megaphone : Hash
    return <Icon size={14} className="shrink-0 text-text-muted" />
  }

  return (
    <div className="flex-1 flex min-w-0 h-full">
      <GlassPanel
        className="flex-1 flex flex-col chat-panel overflow-hidden min-w-0 h-full relative"
        style={{
          background: 'var(--chat-panel-bg)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        onDrop={handleAreaDrop}
        onDragOver={handleAreaDragOver}
        onDragLeave={handleAreaDragLeave}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-40 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
            <div className="bg-bg-secondary px-6 py-4 rounded-xl shadow-lg text-text-primary font-black text-lg">
              {t('chat.dropFilesHere', 'Drop files here to upload')}
            </div>
          </div>
        )}
        {/* Channel header */}
        <div className="desktop-drag-titlebar app-header flex items-center gap-2.5 px-6">
          {/* Mobile back button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (onBack) onBack()
              else setMobileView('channels')
            }}
            className="md:hidden -ml-1 h-8 w-8 shrink-0 rounded-full"
          >
            <ArrowLeft size={20} />
          </Button>
          {directPeer ? (
            <UserAvatar
              userId={directPeer.id}
              avatarUrl={directPeer.avatarUrl}
              displayName={directPeerName}
              size="sm"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-tertiary/50 text-primary shadow-inner">
              {isInboxChannel ? (
                <Inbox size={16} strokeWidth={2.5} />
              ) : (
                <Hash size={16} strokeWidth={2.5} />
              )}
            </div>
          )}
          {channelSwitcher ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-bg-modifier-hover"
                  title={t('channel.switchChannel')}
                >
                  <span className="truncate text-[15px] font-black uppercase tracking-tight text-text-primary">
                    {channelDisplayName}
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-text-muted" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-1.5">
                <div className="max-h-72 overflow-y-auto pr-1">
                  {channelSwitcher.channels.map((item) => {
                    const isActive = item.id === channelSwitcher.activeChannelId
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => channelSwitcher.onSelectChannel(item.id)}
                        className={cn(
                          'flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-bold transition',
                          isActive
                            ? 'bg-primary/15 text-primary'
                            : 'text-text-secondary hover:bg-bg-tertiary/70 hover:text-text-primary',
                        )}
                      >
                        {renderChannelSwitcherIcon(item.type)}
                        <span
                          className={cn('min-w-0 flex-1 truncate', item.isArchived && 'italic')}
                        >
                          {item.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex min-w-0 items-center gap-1.5">
              <h3
                className={cn(
                  'truncate text-[15px] font-black tracking-tight text-text-primary',
                  !isInboxChannel && 'uppercase',
                )}
              >
                {channelDisplayName}
              </h3>
              {isInboxChannel && (
                <Badge variant="primary" size="xs" className="shrink-0">
                  {t('inbox.queueBadge')}
                </Badge>
              )}
              {directPeerIsPrivateBuddy && (
                <LockKeyhole
                  size={14}
                  className="shrink-0 text-warning"
                  aria-label={t('agentMgmt.modePrivate')}
                />
              )}
            </div>
          )}
          {channelSwitcher?.channels.length === 0 && (
            <span className="sr-only">{t('channel.noChannels')}</span>
          )}
          {visibleChannelTopic && !channelSwitcher && (
            <>
              <div className="mx-2 hidden h-6 w-px shrink-0 bg-bg-modifier-hover sm:block" />
              <p className="hidden truncate text-sm font-bold text-text-secondary opacity-60 sm:block">
                {visibleChannelTopic}
              </p>
            </>
          )}
          {/* Right side: mobile QR + members toggle + notification bell */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {onExitCopilot ? (
              <>
                {onEnterChannel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onEnterChannel}
                    className="h-8 w-8 rounded-full"
                    title={t('channel.enterChannel')}
                  >
                    <LogIn size={18} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onExitCopilot}
                  className="h-8 w-8 rounded-full"
                  title={t('channel.exitCopilot')}
                >
                  <X size={18} />
                </Button>
              </>
            ) : isInboxChannel ? (
              <>
                <div className="hidden items-center rounded-full border border-border-subtle bg-bg-tertiary/45 p-0.5 sm:flex">
                  {(['all', 'open', 'done'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setInboxTaskFilter(filter)}
                      className={cn(
                        'h-7 rounded-full px-3 text-xs font-black transition',
                        inboxTaskFilter === filter
                          ? 'bg-primary text-bg-primary shadow-[0_0_18px_rgba(0,229,255,0.22)]'
                          : 'text-text-muted hover:bg-bg-modifier-hover hover:text-text-primary',
                      )}
                    >
                      {t(`inbox.filter.${filter}`)}
                    </button>
                  ))}
                </div>
                <NotificationBell className="h-8 w-8" />
              </>
            ) : (
              <>
                <Popover open={showPageQr} onOpenChange={setShowPageQr}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      title={t('chat.openPageQr')}
                    >
                      <Smartphone size={18} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-72 rounded-[20px] border border-border-subtle bg-bg-primary/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex w-full items-start gap-2 rounded-xl border border-bg-modifier-hover bg-bg-secondary/45 px-3 py-2 text-text-primary/90">
                        <Smartphone size={16} className="text-primary" />
                        <span className="text-xs font-semibold">{t('chat.openPageQrTitle')}</span>
                      </div>
                      <div className="relative rounded-[18px] bg-gradient-to-br from-primary/45 via-sky-300/25 to-primary/45 p-px shadow-[0_0_28px_rgba(14,165,233,0.45)]">
                        <div className="rounded-[17px] border border-primary/30 bg-white p-3">
                          <QRCodeSVG
                            value={pageShareUrl}
                            size={178}
                            bgColor="#ffffff"
                            fgColor="#0f0f1a"
                            level="H"
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyPageShareLink}
                        icon={CopyQrIcon}
                        className="h-8 w-full"
                      >
                        {t('common.copy')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {hasServerShopProducts && (
                  <Link
                    to="/servers/$serverSlug/shop"
                    params={{ serverSlug: serverShopRouteKey! }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-bg-modifier-hover hover:text-primary"
                    title={t('shop.openShop')}
                    aria-label={t('shop.openShop')}
                  >
                    <ShoppingBag size={18} />
                  </Link>
                )}
                <NotificationBell className="h-8 w-8" />
                {showMemberToggle && activeServerId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => useUIStore.getState().toggleMobileMemberList()}
                    className="h-8 w-8 rounded-full lg:hidden"
                    title={t('member.toggleList')}
                  >
                    <Users size={18} />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          ref={parentRef}
          className="chat-scroll-surface flex-1 overflow-y-auto overflow-x-hidden"
        >
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              <span className="animate-pulse">{t('chat.loading', 'Loading...')}</span>
            </div>
          ) : timelineMessages.length === 0 && systemEvents.length === 0 ? (
            isInboxChannel ? (
              <InboxEmptyState filter={inboxTaskFilter} hasMessages={messages.length > 0} />
            ) : (
              <EmptyChannelState
                channelName={channel?.name}
                serverId={activeServerId}
                channelId={activeChannelId}
                isArchived={channel?.isArchived}
                onUnarchive={async () => {
                  const ok = await useConfirmStore.getState().confirm({
                    title: t('channel.unarchiveChannel'),
                    message: t('channel.unarchiveChannelConfirm'),
                  })
                  if (ok) {
                    await fetchApi(`/api/channels/${activeChannelId}/unarchive`, {
                      method: 'POST',
                    })
                    queryClient.invalidateQueries({ queryKey: ['channel', activeChannelId] })
                    queryClient.invalidateQueries({ queryKey: ['channels'] })
                  }
                }}
              />
            )
          ) : shouldVirtualize ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* Loading older messages indicator */}
              {isFetchingNextPage && (
                <div className="absolute top-0 left-0 right-0 flex justify-center py-2 z-10">
                  <span className="text-xs text-text-muted animate-pulse">
                    {t('chat.loadingOlder', 'Loading older messages...')}
                  </span>
                </div>
              )}

              {virtualItems.map((virtualItem) => {
                const item = timeline[virtualItem.index]!

                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: `${virtualItem.start}px`,
                      left: 0,
                      width: '100%',
                    }}
                  >
                    {renderTimelineItem(item, virtualItem.index)}
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              className="flex min-h-full flex-col pt-2"
              style={{ paddingBottom: timelineBottomPadding }}
            >
              {/* Loading older messages indicator */}
              {isFetchingNextPage && (
                <div className="flex justify-center py-2">
                  <span className="text-xs text-text-muted animate-pulse">
                    {t('chat.loadingOlder', 'Loading older messages...')}
                  </span>
                </div>
              )}

              {timeline.map((item, index) => (
                <div key={item.data.id} className={index === 0 ? 'mt-auto' : undefined}>
                  {renderTimelineItem(item, index)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buddy work indicator */}
        <div
          className={cn(
            'flex h-9 items-end overflow-hidden px-4 pb-1 pt-0 transition-opacity duration-150',
            hasVisibleWorkStatuses ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          aria-hidden={!hasVisibleWorkStatuses}
        >
          <div className="inline-flex h-8 max-w-[min(100%,42rem)] items-center gap-2.5 overflow-hidden rounded-2xl border border-primary/35 bg-bg-secondary/85 px-3.5 text-xs text-primary shadow-[0_0_28px_rgba(0,229,255,0.2)] backdrop-blur-xl">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_14px_rgba(0,229,255,0.9)]" />
            </span>
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              {visibleWorkStatuses.map((u, index) => (
                <span
                  key={u.userId}
                  className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden"
                >
                  {index > 0 && <span className="shrink-0 text-text-muted">,</span>}
                  <span className="max-w-44 truncate font-semibold text-text-primary">
                    {u.name}
                  </span>
                  <span className="shrink-0 text-primary/90">{u.label}</span>
                </span>
              ))}
            </span>
            <span className="inline-flex shrink-0 gap-0.5">
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          </div>
        </div>

        {/* Message input or selection toolbar */}
        {selectionMode ? (
          <div className="px-6 py-3 bg-bg-secondary/50 backdrop-blur-md border-t border-border-subtle flex items-center gap-3">
            <span className="text-sm text-text-secondary font-medium">
              {t('chat.selectedCount', {
                count: selectedMessageIds.size,
                defaultValue: `已选择 ${selectedMessageIds.size} 条消息`,
              })}
            </span>
            <div className="flex-1" />
            <Button
              variant="primary"
              size="sm"
              onClick={handleCopySelectedAsMarkdown}
              disabled={selectedMessageIds.size === 0}
              icon={ClipboardCopy}
            >
              {t('chat.copyAsMarkdown', '复制为 Markdown')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExitSelectionMode} icon={X}>
              {t('common.cancel')}
            </Button>
          </div>
        ) : channel?.isArchived && messages.length > 0 ? (
          <div className="flex items-center justify-center gap-3 px-4 py-3 bg-bg-deep border-t border-border-subtle">
            <div className="flex items-center gap-2 text-text-muted">
              <Archive size={18} />
              <span>{t('channel.archivedNotice')}</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                const ok = await useConfirmStore.getState().confirm({
                  title: t('channel.unarchiveChannel'),
                  message: t('channel.unarchiveChannelConfirm'),
                })
                if (ok) {
                  await fetchApi(`/api/channels/${activeChannelId}/unarchive`, { method: 'POST' })
                  queryClient.invalidateQueries({ queryKey: ['channel', activeChannelId] })
                  queryClient.invalidateQueries({ queryKey: ['channels'] })
                }
              }}
            >
              {t('channel.unarchive')}
            </Button>
          </div>
        ) : (
          <MessageInput
            channelId={activeChannelId}
            channelName={channel?.name}
            replyToId={replyToId}
            onClearReply={() => setReplyToId(null)}
            externalFiles={droppedFiles}
            onExternalFilesConsumed={() => setDroppedFiles([])}
            enableTaskCards={isInboxChannel}
          />
        )}
      </GlassPanel>

      {/* File preview panel */}
      {previewFile && (
        <FilePreviewPanel attachment={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {previewOAuthLink && (
        <OAuthLinkPreviewPanel
          preview={previewOAuthLink}
          onClose={() => setPreviewOAuthLink(null)}
        />
      )}

      {/* Save attachment to workspace picker */}
      {saveToWorkspaceFile && activeServerId && (
        <WorkspaceFilePicker
          serverId={activeServerId}
          mode="save-to-folder"
          title={`保存 "${saveToWorkspaceFile.filename}" 到工作区`}
          onConfirm={handleSaveToWorkspace}
          onClose={() => setSaveToWorkspaceFile(null)}
        />
      )}
    </div>
  )
}

function InboxEmptyState({
  filter,
  hasMessages,
}: {
  filter: InboxTaskFilter
  hasMessages: boolean
}) {
  const { t } = useTranslation()
  const isFilteredEmpty = hasMessages && filter !== 'all'

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center text-text-muted">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
        <Inbox size={24} strokeWidth={2.4} />
      </div>
      <p className="mb-2 text-lg font-black text-text-primary">
        {isFilteredEmpty ? t('inbox.empty.filterTitle') : t('inbox.empty.allTitle')}
      </p>
      <p className="max-w-md text-sm font-semibold leading-6 text-text-muted">
        {isFilteredEmpty ? t('inbox.empty.filterHint') : t('inbox.empty.allHint')}
      </p>
    </div>
  )
}

// Empty channel state with invite buttons
function EmptyChannelState({
  channelName,
  serverId,
  channelId,
  isArchived,
  onUnarchive,
}: {
  channelName?: string
  serverId: string | null
  channelId: string | null
  isArchived?: boolean
  onUnarchive?: () => void
}) {
  const { t } = useTranslation()
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteInitialTab, setInviteInitialTab] = useState<'members' | 'buddies'>('members')

  return (
    <>
      <div className="flex flex-col items-center justify-center h-full text-text-muted px-4 mb-16">
        <Hash size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-bold text-primary mb-2">
          {t('chat.welcomeChannel', {
            channelName: channelName ?? t('chat.channelFallback'),
          })}
        </p>
        <p className="text-sm text-text-muted mb-6">{t('chat.welcomeStart')}</p>
        {isArchived ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-text-muted">
              <Archive size={20} />
              <span>{t('channel.archivedNotice')}</span>
            </div>
            {onUnarchive && (
              <Button variant="primary" size="sm" className="rounded-full" onClick={onUnarchive}>
                {t('channel.unarchive')}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full bouncy border px-8 py-[14px] text-[13px] font-black uppercase tracking-[0.05em]"
              style={{
                background: 'linear-gradient(135deg, #F8E71C, #ffb300)',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow:
                  '0 10px 25px rgba(248, 231, 28, 0.35), inset 0 2px 4px rgba(255, 255, 255, 0.7)',
                color: '#050508',
                backdropFilter: 'blur(12px)',
              }}
              onClick={() => {
                setInviteInitialTab('buddies')
                setShowInvitePanel(true)
              }}
              icon={PawPrint}
            >
              <span className="uppercase">{t('channel.addAgent')}</span>
            </Button>
          </div>
        )}
      </div>

      {showInvitePanel && serverId && (
        <InvitePanel
          serverId={serverId}
          channelId={channelId}
          channelName={channelName}
          initialTab={inviteInitialTab}
          onClose={() => setShowInvitePanel(false)}
        />
      )}
    </>
  )
}
