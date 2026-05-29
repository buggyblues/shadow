import type {
  CommerceProductCard,
  MentionSuggestion,
  MentionSuggestionTrigger,
  MessageMention,
} from '@shadowob/shared'
import { assignMentionRanges, canonicalMentionToken } from '@shadowob/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command as CommandIcon,
  Copy,
  File,
  Hash,
  Lock,
  MessageSquare,
  Search,
  Send,
  ShoppingBag,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Keyboard,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDraftStorage } from '@/hooks/use-draft-storage'
import { ChatComposer } from '../../../../../src/components/chat/chat-composer'
import { MessageBubble } from '../../../../../src/components/chat/message-bubble'
import { Avatar } from '../../../../../src/components/common/avatar'
import { formatCommercePrice } from '../../../../../src/components/common/price-display'
import { StatusBadge } from '../../../../../src/components/common/status-badge'
import {
  AppText,
  BackgroundSurface,
  Button,
  ChatWorkIndicator,
  ChipButton,
  EmptyState,
  GlassHeader,
  GlassPanel,
  InputValley,
  MenuItem,
  Sheet,
  Spinner,
} from '../../../../../src/components/ui'
import { VoiceChannelPanel } from '../../../../../src/components/voice/voice-channel-panel'
import { useSocketEvent } from '../../../../../src/hooks/use-socket'
import { useVoiceInput } from '../../../../../src/hooks/use-voice-input'
import { fetchApi } from '../../../../../src/lib/api'
import { setLastChannel } from '../../../../../src/lib/last-channel'
import {
  getSocket,
  joinThread,
  leaveChannel,
  leaveThread,
  sendTyping,
  sendWsMessage,
} from '../../../../../src/lib/socket'
import { playReceiveSound, playSendSound } from '../../../../../src/lib/sounds'
import { useAuthStore } from '../../../../../src/stores/auth.store'
import { useChatStore } from '../../../../../src/stores/chat.store'
import { fontSize, radius, spacing, useColors } from '../../../../../src/theme'
import type {
  Channel,
  MemberEvent,
  Message,
  MessagesPage,
  SystemEvent,
  Thread,
  TimelineItem,
} from '../../../../../src/types/message'
import { normalizeMessage } from '../../../../../src/types/message'

const PAGE_SIZE = 50
const TYPING_STATUS_TIMEOUT_MS = 3000
const ACTIVITY_STATUS_TIMEOUT_MS = 120_000

interface NotificationEvent {
  referenceId?: string | null
  referenceType?: string | null
  scopeChannelId?: string | null
  metadata?: Record<string, unknown> | null
}

function metaString(event: NotificationEvent, key: string) {
  const value = event.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNotificationChannelId(event: NotificationEvent) {
  return (
    event.scopeChannelId ??
    metaString(event, 'channelId') ??
    (event.referenceType === 'channel' || event.referenceType === 'channel_invite'
      ? event.referenceId
      : null)
  )
}

function mentionFromSuggestion(
  suggestion: MentionSuggestion,
  range?: MessageMention['range'],
): MessageMention {
  return {
    kind: suggestion.kind,
    targetId: suggestion.targetId,
    token: canonicalMentionToken(suggestion),
    sourceToken: suggestion.token,
    label: suggestion.label,
    serverId: suggestion.serverId,
    serverSlug: suggestion.serverSlug,
    serverName: suggestion.serverName,
    channelId: suggestion.channelId,
    channelName: suggestion.channelName,
    userId: suggestion.userId,
    username: suggestion.username,
    displayName: suggestion.displayName,
    avatarUrl: suggestion.avatarUrl,
    isBot: suggestion.isBot,
    isPrivate: suggestion.isPrivate,
    range,
  }
}

function mergeMention(list: MessageMention[], mention: MessageMention): MessageMention[] {
  const mentionKey = (item: MessageMention) =>
    `${item.kind}:${item.targetId}:${item.range?.start ?? 'x'}:${item.range?.end ?? 'x'}`
  return [...list.filter((item) => mentionKey(item) !== mentionKey(mention)), mention]
}

function mentionsForContent(content: string, mentions: MessageMention[]): MessageMention[] {
  return assignMentionRanges(content, mentions).slice(0, 20)
}

interface SlashCommand {
  name: string
  description?: string
  aliases?: string[]
  packId?: string
  agentId: string
  botUserId: string
  botUsername: string
  botDisplayName?: string | null
}

interface ChannelMember {
  id: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status?: string
    isBot?: boolean
  }
}

interface ChannelBootstrap {
  access: {
    canAccess: boolean
    joinRequestStatus: 'pending' | 'approved' | 'rejected' | null
    channel: Channel
  }
  channel: Channel
  members: ChannelMember[]
  messages: MessagesPage | Message[]
  slashCommands: { commands: SlashCommand[] }
}

export default function ChannelViewScreen() {
  const params = useLocalSearchParams<{
    serverSlug?: string
    channelId?: string
    dmChannelId?: string
    msg?: string
    messageId?: string
  }>()
  const serverSlug = params.serverSlug
  const channelId = params.channelId ?? params.dmChannelId
  const targetMessageId =
    typeof params.msg === 'string'
      ? params.msg
      : typeof params.messageId === 'string'
        ? params.messageId
        : null
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const flatListRef = useRef<FlatList<TimelineItem>>(null)
  const scrollOffsetRef = useRef<Record<string, number>>({})
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const currentUser = useAuthStore((s) => s.user)
  const insets = useSafeAreaInsets()

  const [inputText, setInputText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [sending, setSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([])
  const [activityUsers, setActivityUsers] = useState<
    { userId: string; username: string; activity: string }[]
  >([])
  const [pendingFiles, setPendingFiles] = useState<
    Array<{ uri: string; name: string; type: string; size?: number }>
  >([])
  const [selectedCommerceCards, setSelectedCommerceCards] = useState<CommerceProductCard[]>([])
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false)
  const [showMemberList, setShowMemberList] = useState(false)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [inviteSearch, setInviteSearch] = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionTrigger, setMentionTrigger] = useState<MentionSuggestionTrigger | null>(null)
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [selectedMentions, setSelectedMentions] = useState<MessageMention[]>([])
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(320)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFromUser, setSearchFromUser] = useState<string | null>(null)
  const [searchHasAttachment, setSearchHasAttachment] = useState(false)
  const [searchTab, setSearchTab] = useState<'messages' | 'members'>('messages')
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [activeThreadParent, setActiveThreadParent] = useState<Message | null>(null)
  const [threadInputText, setThreadInputText] = useState('')
  const [threadReplyTo, setThreadReplyTo] = useState<Message | null>(null)
  const [threadSending, setThreadSending] = useState(false)
  const [threadPendingFiles, setThreadPendingFiles] = useState<
    Array<{ uri: string; name: string; type: string; size?: number }>
  >([])
  const [showThreadEmojiPicker, setShowThreadEmojiPicker] = useState(false)
  const [showThreadPlusMenu, setShowThreadPlusMenu] = useState(false)
  const searchInputRef = useRef<TextInput>(null)
  const inputRef = useRef<TextInput>(null)
  const threadInputRef = useRef<TextInput>(null)
  const threadListRef = useRef<FlatList<Message>>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showScrollBottomRef = useRef(false)
  const pendingShowScrollBottomRef = useRef(false)
  const hasRestoredDraft = useRef(false)
  const readScopeCooldownRef = useRef<Map<string, number>>(new Map())
  const readScopeInFlightRef = useRef<Set<string>>(new Set())
  const [bootstrapSeededChannelId, setBootstrapSeededChannelId] = useState<string | null>(null)

  // Draft storage for persistent input
  const { restoredDraft, scheduleSave, clear: clearDraft } = useDraftStorage(channelId || null)

  const { data: productPickerData, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['commerce-product-picker', 'channel', channelId],
    queryFn: () =>
      fetchApi<{ cards: CommerceProductCard[] }>(
        `/api/commerce/product-picker?target=channel&channelId=${encodeURIComponent(channelId!)}`,
      ),
    enabled: Boolean(channelId && showProductPicker),
    staleTime: 15_000,
  })

  const productCards = productPickerData?.cards ?? []

  const addCommerceCard = useCallback((card: CommerceProductCard) => {
    setSelectedCommerceCards((prev) => {
      if (prev.some((item) => item.id === card.id)) return prev
      return [...prev, card].slice(0, 3)
    })
    setShowProductPicker(false)
    inputRef.current?.focus()
  }, [])

  // Restore draft only once on mount
  useEffect(() => {
    if (restoredDraft && !hasRestoredDraft.current) {
      setInputText(restoredDraft.text)
      if (restoredDraft.pendingFiles?.length > 0) {
        setPendingFiles(restoredDraft.pendingFiles)
      }
      hasRestoredDraft.current = true
    }
  }, [restoredDraft])

  // Reset restore flag when channel changes
  useEffect(() => {
    hasRestoredDraft.current = false
  }, [channelId])

  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingUsersTimeout = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const activityUsersTimeout = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const {
    isRecording,
    isHolding,
    onPressIn: onVoicePressIn,
    onPressOut: onVoicePressOut,
    speechSupported,
  } = useVoiceInput({
    speechLang: t('chat.speechLang'),
    onPermissionDenied: () => Alert.alert(t('common.error'), t('chat.micPermissionDenied')),
    onUnavailable: () => Alert.alert(t('common.error'), t('chat.voiceInputUnavailable')),
    onTranscriptChange: (transcript) => {
      setInputText(transcript)
    },
    getCurrentText: () => inputText,
  })

  const { data: bootstrap, isError: isBootstrapError } = useQuery({
    queryKey: ['channel-bootstrap', channelId],
    queryFn: () =>
      fetchApi<ChannelBootstrap>(`/api/channels/${channelId}/bootstrap?messagesLimit=${PAGE_SIZE}`),
    enabled: !!channelId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!channelId || !bootstrap) return
    const normalizedMessages = Array.isArray(bootstrap.messages)
      ? {
          messages: bootstrap.messages.map((m) =>
            normalizeMessage(m as unknown as Record<string, unknown>),
          ),
          hasMore: bootstrap.messages.length >= PAGE_SIZE,
        }
      : {
          messages: bootstrap.messages.messages.map((m) =>
            normalizeMessage(m as unknown as Record<string, unknown>),
          ),
          hasMore: bootstrap.messages.hasMore,
        }

    queryClient.setQueryData(['channel', channelId], bootstrap.channel)
    queryClient.setQueryData(['channel-access', channelId], bootstrap.access)
    queryClient.setQueryData(['channel-members', channelId], bootstrap.members)
    queryClient.setQueryData(['channel-slash-commands', channelId], bootstrap.slashCommands)
    queryClient.setQueryData(['messages', channelId], {
      pages: [normalizedMessages],
      pageParams: [null],
    })
    setBootstrapSeededChannelId(channelId)
  }, [bootstrap, channelId, queryClient])

  // ---------- Channel info ----------
  const { data: channelFallback } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => fetchApi<Channel>(`/api/channels/${channelId}`),
    enabled: !!channelId && isBootstrapError,
    staleTime: 30_000,
  })
  const channel = bootstrap?.channel ?? channelFallback
  const isDirectChannel = channel?.kind === 'dm' || channel?.serverId === null
  const { data: accessFallback } = useQuery({
    queryKey: ['channel-access', channelId],
    queryFn: () =>
      fetchApi<{
        canAccess: boolean
        joinRequestStatus: 'pending' | 'approved' | 'rejected' | null
        channel: Channel
      }>(`/api/channels/${channelId}/access`),
    enabled: !!channelId && isBootstrapError,
    staleTime: 30_000,
  })
  const access = bootstrap?.access ?? accessFallback
  const canAccessChannel = access?.canAccess ?? false

  const markChannelScopeRead = useCallback(async () => {
    if (!channelId) return
    const key = `channel:${channelId}`
    const now = Date.now()
    const last = readScopeCooldownRef.current.get(key) ?? 0
    if (now - last < 1200 || readScopeInFlightRef.current.has(key)) return

    readScopeCooldownRef.current.set(key, now)
    readScopeInFlightRef.current.add(key)
    try {
      await fetchApi('/api/notifications/read-scope', {
        method: 'POST',
        body: JSON.stringify({ channelId }),
      })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    } finally {
      readScopeInFlightRef.current.delete(key)
    }
  }, [channelId, queryClient])

  const requestAccessMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/channels/${channelId}/join-requests`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-access', channelId] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const { data: channelMembers = [] } = useQuery({
    queryKey: ['channel-members', channelId],
    queryFn: () => fetchApi<ChannelMember[]>(`/api/channels/${channelId}/members`),
    enabled:
      !!channelId && canAccessChannel && (bootstrapSeededChannelId === channelId || !bootstrap),
    staleTime: 30_000,
  })

  // Server members for invite panel
  interface ServerMemberEntry {
    user: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
      isBot?: boolean
    }
    role: string
  }

  const { data: serverMemberData } = useQuery({
    queryKey: ['server-members-for-invite', channel?.serverId],
    queryFn: async () => {
      const res = await fetchApi<ServerMemberEntry[]>(`/api/servers/${channel!.serverId}/members`)
      return res
    },
    enabled: !!channel?.serverId && showInvitePanel,
  })

  const invitableMembers = useMemo(() => {
    const serverMembers = serverMemberData ?? []
    const channelUserIds = new Set(channelMembers.map((m) => m.userId))
    const q = inviteSearch.toLowerCase()
    return serverMembers
      .filter((m) => !channelUserIds.has(m.user.id))
      .filter((m) => {
        if (!q) return true
        const name = (m.user.displayName || m.user.username).toLowerCase()
        return name.includes(q) || m.user.username.toLowerCase().includes(q)
      })
  }, [serverMemberData, channelMembers, inviteSearch])

  const inviteMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      fetchApi(`/api/channels/${channelId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
    },
  })

  const { data: mentionSuggestionData } = useQuery({
    queryKey: ['mention-suggestions', channelId, mentionTrigger, mentionQuery ?? ''],
    queryFn: () => {
      const params = new URLSearchParams({
        channelId: channelId!,
        trigger: mentionTrigger ?? '@',
        q: mentionQuery ?? '',
        limit: '20',
      })
      return fetchApi<{ suggestions: MentionSuggestion[] }>(`/api/mentions/suggest?${params}`)
    },
    enabled: Boolean(channelId && !isDirectChannel && mentionTrigger && mentionQuery !== null),
    staleTime: 5_000,
  })

  const mentionResults = mentionSuggestionData?.suggestions ?? []

  const { data: slashCommandData } = useQuery({
    queryKey: ['channel-slash-commands', channelId],
    queryFn: () =>
      fetchApi<{ commands: SlashCommand[] }>(`/api/channels/${channelId}/slash-commands`),
    enabled: Boolean(
      channelId && canAccessChannel && (bootstrapSeededChannelId === channelId || !bootstrap),
    ),
    staleTime: 30_000,
  })

  const slashCommands = slashCommandData?.commands ?? []

  const { data: threads = [] } = useQuery({
    queryKey: ['threads', channelId],
    queryFn: () => fetchApi<Thread[]>(`/api/channels/${channelId}/threads`),
    enabled: Boolean(channelId && canAccessChannel),
    staleTime: 30_000,
  })

  const threadsByParentId = useMemo(() => {
    const map = new Map<string, Thread>()
    for (const thread of threads) {
      map.set(thread.parentMessageId, thread)
    }
    return map
  }, [threads])

  const activeThreadId = activeThread?.id ?? null
  const { data: rawThreadMessages = [], isLoading: isThreadLoading } = useQuery({
    queryKey: ['thread-messages', activeThreadId],
    queryFn: async () => {
      const result = await fetchApi<Record<string, unknown>[]>(
        `/api/threads/${activeThreadId}/messages?limit=100`,
      )
      return result.map((item) => normalizeMessage(item))
    },
    enabled: Boolean(activeThreadId),
    staleTime: 15_000,
  })

  const threadMessages = useMemo(
    () =>
      [...rawThreadMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [rawThreadMessages],
  )

  const threadMessagesWithParent = useMemo(
    () => (activeThreadParent ? [activeThreadParent, ...threadMessages] : threadMessages),
    [activeThreadParent, threadMessages],
  )

  useEffect(() => {
    if (!channelId) return
    const socket = getSocket()
    const refreshSlashCommands = () => {
      queryClient.invalidateQueries({ queryKey: ['channel-slash-commands', channelId] })
    }
    const handleMemberJoined = (payload: { channelId?: string; isBot?: boolean }) => {
      if (payload.channelId === channelId && payload.isBot) refreshSlashCommands()
    }
    const handleMemberLeft = (payload: { channelId?: string }) => {
      if (payload.channelId === channelId) refreshSlashCommands()
    }
    const handleSlashCommandsUpdated = (payload: { channelId?: string }) => {
      if (payload.channelId === channelId) refreshSlashCommands()
    }

    socket.on('member:joined', handleMemberJoined)
    socket.on('member:left', handleMemberLeft)
    socket.on('channel:slash-commands-updated', handleSlashCommandsUpdated)
    return () => {
      socket.off('member:joined', handleMemberJoined)
      socket.off('member:left', handleMemberLeft)
      socket.off('channel:slash-commands-updated', handleSlashCommandsUpdated)
    }
  }, [channelId, queryClient])

  const filteredSlashCommands = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.trim().toLocaleLowerCase()
    return slashCommands
      .filter((command) => {
        if (!q) return true
        const haystack = [
          command.name,
          ...(command.aliases ?? []),
          command.description ?? '',
          command.packId ?? '',
          command.botUsername,
          command.botDisplayName ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => {
        const aExact = a.name.toLocaleLowerCase() === q ? 1 : 0
        const bExact = b.name.toLocaleLowerCase() === q ? 1 : 0
        if (aExact !== bExact) return bExact - aExact
        return a.name.localeCompare(b.name)
      })
      .slice(0, 12)
  }, [slashCommands, slashQuery])

  const onlineMemberCount = useMemo(
    () =>
      channelMembers.filter(
        (m) => m.user.status === 'online' || m.user.status === 'idle' || m.user.status === 'dnd',
      ).length,
    [channelMembers],
  )

  // ---------- Search ----------
  const debouncedSearchQuery = useRef(searchQuery)
  useEffect(() => {
    const timer = setTimeout(() => {
      debouncedSearchQuery.current = searchQuery
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  interface SearchResult {
    id: string
    content: string
    authorId: string
    channelId: string
    createdAt: string
    author: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
      isBot?: boolean
    } | null
  }

  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: [
      'search-messages',
      channelId,
      debouncedSearchQuery.current,
      searchFromUser,
      searchHasAttachment,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        query: debouncedSearchQuery.current,
        channelId: channelId!,
        limit: '30',
      })
      if (searchFromUser) params.set('from', searchFromUser)
      if (searchHasAttachment) params.set('hasAttachment', 'true')
      return fetchApi<SearchResult[]>(`/api/search/messages?${params.toString()}`)
    },
    enabled:
      canAccessChannel &&
      showSearchPanel &&
      searchTab === 'messages' &&
      debouncedSearchQuery.current.length >= 2,
  })

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return channelMembers
    const q = searchQuery.toLowerCase()
    return channelMembers.filter((m) => {
      const name = (m.user.displayName || m.user.username).toLowerCase()
      return name.includes(q) || m.user.username.toLowerCase().includes(q)
    })
  }, [channelMembers, searchQuery])

  useEffect(() => {
    if (channel && canAccessChannel) {
      setActiveChannel(channel.id)
      void markChannelScopeRead()
      if (channel.serverId) {
        void setLastChannel(channel.serverId, channel.id)
      }
    }
    return () => setActiveChannel(null)
  }, [canAccessChannel, channel, markChannelScopeRead, setActiveChannel])

  const subscribeKeyboardVisibility = useCallback(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true)
      const nextHeight = e?.endCoordinates?.height ?? 0
      if (nextHeight > 0) {
        setKeyboardHeight(nextHeight)
      }
      // Auto-scroll to newest messages when keyboard appears if near bottom
      const offset = channelId ? (scrollOffsetRef.current[channelId] ?? 0) : 0
      if (offset < 200) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
      }
    })
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [channelId])

  // ---------- Keyboard visibility tracking ----------
  useEffect(() => subscribeKeyboardVisibility(), [subscribeKeyboardVisibility])

  // ---------- Infinite scroll messages ----------
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (pageParam) params.set('cursor', pageParam as string)
      const result = await fetchApi<MessagesPage | Message[]>(
        `/api/channels/${channelId}/messages?${params}`,
      )
      if (Array.isArray(result)) {
        return {
          messages: result.map((m) => normalizeMessage(m as unknown as Record<string, unknown>)),
          hasMore: result.length >= PAGE_SIZE,
        }
      }
      return {
        messages: result.messages.map((m) =>
          normalizeMessage(m as unknown as Record<string, unknown>),
        ),
        hasMore: result.hasMore,
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined
      return lastPage.messages[0]?.createdAt
    },
    enabled:
      !!channelId && canAccessChannel && (bootstrapSeededChannelId === channelId || !bootstrap),
    staleTime: 30_000,
  })

  const messages = useMemo(() => {
    if (!data) return []
    // Reverse page order so older pages come first, then reverse all for newest-first (inverted list)
    return [...data.pages]
      .reverse()
      .flatMap((p) => p.messages)
      .reverse()
  }, [data])

  const buildThreadName = useCallback(
    (message: Message) => {
      const content = message.content.trim().replace(/\s+/g, ' ')
      if (content) return content.slice(0, 96)
      return t('chat.threadDefaultName')
    },
    [t],
  )

  const createThreadMutation = useMutation({
    mutationFn: ({ message }: { message: Message }) =>
      fetchApi<Thread>(`/api/channels/${channelId}/threads`, {
        method: 'POST',
        body: JSON.stringify({
          name: buildThreadName(message),
          parentMessageId: message.id,
        }),
      }),
    onSuccess: (thread, { message }) => {
      queryClient.setQueryData<Thread[]>(['threads', channelId], (old) => {
        const existing = old ?? []
        if (existing.some((item) => item.id === thread.id)) return existing
        return [thread, ...existing]
      })
      setActiveThread(thread)
      setActiveThreadParent(message)
      setThreadReplyTo(null)
    },
  })

  const openThreadForMessage = useCallback(
    (message: Message) => {
      if (message.threadId) return
      const existing = threadsByParentId.get(message.id)
      if (existing) {
        setActiveThread(existing)
        setActiveThreadParent(message)
        setThreadReplyTo(null)
        return
      }
      createThreadMutation.mutate({ message })
    },
    [createThreadMutation, threadsByParentId],
  )

  useEffect(() => {
    setActiveThread(null)
    setActiveThreadParent(null)
    setThreadInputText('')
    setThreadReplyTo(null)
    setThreadPendingFiles([])
  }, [channelId])

  // ---------- Timeline with system events + date separators (inverted: newest first) ----------
  const timeline = useMemo<TimelineItem[]>(() => {
    // Messages are already newest-first
    const items: TimelineItem[] = messages.map((m) => ({ kind: 'message' as const, data: m }))

    // Insert system events at the correct position (also newest first)
    for (const evt of [...systemEvents].reverse()) {
      let insertIdx = 0
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!
        const itemTime =
          item.kind === 'message'
            ? new Date(item.data.createdAt).getTime()
            : item.kind === 'system'
              ? item.data.timestamp
              : 0
        if (itemTime <= evt.timestamp) {
          insertIdx = i
          break
        }
        insertIdx = i + 1
      }
      items.splice(insertIdx, 0, { kind: 'system', data: evt })
    }

    // Date separators — insert between messages from different calendar days
    // In inverted mode, a date separator goes AFTER (higher index = older) the last message of that day
    const withDates: TimelineItem[] = []
    let lastDateStr = ''
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      withDates.push(item)
      if (item.kind === 'message') {
        const d = new Date(item.data.createdAt)
        const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        if (dateStr !== lastDateStr) {
          lastDateStr = dateStr
          // Check if the next message is from a different day
          const next = items[i + 1]
          const nextDateStr =
            next?.kind === 'message'
              ? (() => {
                  const nd = new Date(next.data.createdAt)
                  return `${nd.getFullYear()}-${nd.getMonth()}-${nd.getDate()}`
                })()
              : null
          if (nextDateStr && nextDateStr !== dateStr) {
            // Insert date separator for the current day
            withDates.push({
              kind: 'date',
              data: {
                id: `date-${dateStr}`,
                date: d.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
              },
            })
          }
        }
      }
    }

    // Add a date separator for the oldest day at the end (top of chat visually)
    if (items.length > 0) {
      const oldest = items[items.length - 1]
      if (oldest?.kind === 'message') {
        const d = new Date(oldest.data.createdAt)
        const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        const lastItem = withDates[withDates.length - 1]
        if (lastItem?.kind !== 'date') {
          withDates.push({
            kind: 'date',
            data: {
              id: `date-${dateStr}`,
              date: d.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            },
          })
        }
      }
    }

    return withDates
  }, [messages, systemEvents])

  // Scroll to a message
  const scrollToMessage = useCallback(
    (messageId: string) => {
      setShowSearchPanel(false)
      setHighlightMessageId(messageId)
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
      const idx = timeline.findIndex(
        (item) => item.kind === 'message' && item.data.id === messageId,
      )
      if (idx >= 0) {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 })
      }
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightMessageId(null)
        highlightTimeoutRef.current = null
      }, 3000)
    },
    [timeline],
  )

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!targetMessageId || timeline.length === 0) return
    const timer = setTimeout(() => scrollToMessage(targetMessageId), 350)
    return () => clearTimeout(timer)
  }, [scrollToMessage, targetMessageId, timeline.length])

  const scheduleInputFocus = useCallback(() => {
    let cancelled = false
    const focusInput = () => {
      if (!cancelled) inputRef.current?.focus()
    }
    const interaction = InteractionManager.runAfterInteractions(focusInput)
    const timers = [120, 360, 720].map((delay) => setTimeout(focusInput, delay))
    return () => {
      cancelled = true
      interaction.cancel?.()
      timers.forEach(clearTimeout)
    }
  }, [])

  // Reset scroll position when channel changes
  useEffect(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false })
    pendingShowScrollBottomRef.current = false
    if (showScrollBottomRef.current) {
      showScrollBottomRef.current = false
      setShowScrollBottom(false)
    }
  }, [channelId])

  // Auto-focus input when channel changes
  useEffect(() => scheduleInputFocus(), [scheduleInputFocus])

  const commitScrollBottomVisibility = useCallback(() => {
    const next = pendingShowScrollBottomRef.current
    if (showScrollBottomRef.current === next) return
    showScrollBottomRef.current = next
    setShowScrollBottom(next)
  }, [])

  const handleMessageListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = e.nativeEvent
      if (channelId) scrollOffsetRef.current[channelId] = contentOffset.y
      pendingShowScrollBottomRef.current = contentOffset.y > 200
    },
    [channelId],
  )

  // ---------- WebSocket: join/leave ----------
  const joinChannelWithAck = useCallback((chId: string) => {
    const socket = getSocket()

    const doJoin = () => {
      socket.emit('channel:join', { channelId: chId }, (res: { ok: boolean }) => {
        if (!res?.ok) {
          console.warn('[Channel] Join denied for', chId)
        }
      })
    }

    if (socket.connected) {
      doJoin()
    } else {
      // Wait for connection before joining
      socket.once('connect', doJoin)
    }
  }, [])

  useEffect(() => {
    if (channelId && canAccessChannel) {
      joinChannelWithAck(channelId)
      return () => {
        leaveChannel(channelId)
      }
    }
  }, [canAccessChannel, channelId, joinChannelWithAck])

  useEffect(() => {
    if (!activeThreadId) return
    joinThread(activeThreadId)
    return () => {
      leaveThread(activeThreadId)
    }
  }, [activeThreadId])

  // Reconnection: invalidate messages cache on reconnect to catch any missed while offline
  useEffect(() => {
    const socket = getSocket()
    const onReconnect = () => {
      if (channelId && canAccessChannel) {
        joinChannelWithAck(channelId)
        queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
      }
    }
    socket.on('connect', onReconnect)
    return () => {
      socket.off('connect', onReconnect)
    }
  }, [canAccessChannel, channelId, joinChannelWithAck, queryClient])

  // Listen for socket errors (e.g. message:send denied by server)
  useEffect(() => {
    const socket = getSocket()
    const onError = (err: { message?: string }) => {
      if (err?.message) {
        Alert.alert(t('common.error'), err.message)
      }
    }
    socket.on('error', onError)
    return () => {
      socket.off('error', onError)
    }
  }, [t])

  // ---------- Socket events ----------
  type InfiniteData = typeof data

  const appendMessage = useCallback(
    (raw: Record<string, unknown>) => {
      if ((raw.channelId as string) !== channelId) return
      const msg = normalizeMessage(raw)

      if (msg.threadId) {
        queryClient.setQueryData<Message[]>(['thread-messages', msg.threadId], (old) => {
          const existing = old ?? []
          if (existing.some((m) => m.id === msg.id)) {
            return existing.map((m) => (m.id === msg.id ? msg : m))
          }
          return [...existing, msg]
        })
        if (msg.threadId === activeThreadId && msg.authorId !== currentUser?.id) {
          playReceiveSound()
        }
        return
      }

      // Play receive sound for messages from others
      if (msg.authorId !== currentUser?.id) {
        playReceiveSound()
      }

      queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
        if (!old) return old
        const firstPage = old.pages[0]
        if (!firstPage) return old
        // Deduplicate: if message already exists (by server ID), update it
        if (firstPage.messages.some((m) => m.id === msg.id)) {
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => (m.id === msg.id ? msg : m)),
            })),
          }
        }
        // Check if this is confirmation of an optimistic message from us
        // Match by temp ID prefix + same author + similar content
        if (msg.authorId === currentUser?.id) {
          const tempIdx = firstPage.messages.findIndex(
            (m) => m.id.startsWith('temp-') && m.authorId === msg.authorId,
          )
          if (tempIdx >= 0) {
            return {
              ...old,
              pages: [
                {
                  ...firstPage,
                  messages: firstPage.messages.map((m, i) => (i === tempIdx ? msg : m)),
                },
                ...old.pages.slice(1),
              ],
            }
          }
        }
        // Append new message to the first page (messages are oldest-first within page)
        return {
          ...old,
          pages: [{ ...firstPage, messages: [...firstPage.messages, msg] }, ...old.pages.slice(1)],
        }
      })
      void markChannelScopeRead()
      // Scroll to newest (offset 0 in inverted list)
      // Use requestAnimationFrame + setTimeout to ensure the VirtualizedList has processed the new data
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
        }, 150)
      })
    },
    [activeThreadId, channelId, queryClient, currentUser?.id, markChannelScopeRead],
  )

  useSocketEvent('message:new', appendMessage)
  useSocketEvent('message:created', appendMessage)
  useSocketEvent<NotificationEvent>('notification:new', (event) => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    const notificationChannelId = getNotificationChannelId(event)
    if (notificationChannelId && notificationChannelId === channelId) {
      void markChannelScopeRead()
    }
  })

  useSocketEvent(
    'message:updated',
    useCallback(
      (raw: Record<string, unknown>) => {
        if ((raw.channelId as string) !== channelId) return
        const msg = normalizeMessage(raw)
        if (msg.threadId) {
          queryClient.setQueryData<Message[]>(['thread-messages', msg.threadId], (old) =>
            (old ?? []).map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
          )
          return
        }
        queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
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
      [channelId, queryClient],
    ),
  )

  useSocketEvent(
    'message:deleted',
    useCallback(
      ({ id }: { id: string }) => {
        if (activeThreadId) {
          queryClient.setQueryData<Message[]>(['thread-messages', activeThreadId], (old) =>
            (old ?? []).filter((m) => m.id !== id),
          )
        }
        queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.filter((m) => m.id !== id),
            })),
          }
        })
      },
      [activeThreadId, channelId, queryClient],
    ),
  )

  // Reaction updates
  useSocketEvent(
    'reaction:updated',
    useCallback(
      (payload: {
        messageId: string
        channelId: string
        reactions: Array<{ emoji: string; count: number; userIds: string[] }>
      }) => {
        if (payload.channelId !== channelId) return
        if (activeThreadId) {
          queryClient.setQueryData<Message[]>(['thread-messages', activeThreadId], (old) =>
            (old ?? []).map((m) =>
              m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m,
            ),
          )
        }
        queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m,
              ),
            })),
          }
        })
      },
      [activeThreadId, channelId, queryClient],
    ),
  )

  // Typing indicator
  useSocketEvent(
    'message:typing',
    useCallback(
      ({
        channelId: typingChannelId,
        userId,
        username,
      }: {
        channelId: string
        userId: string
        username: string
      }) => {
        if (typingChannelId !== channelId || !userId) return
        if (userId === currentUser?.id) return
        setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]))
        if (typingUsersTimeout.current[userId]) clearTimeout(typingUsersTimeout.current[userId])
        typingUsersTimeout.current[userId] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((n) => n !== username))
          delete typingUsersTimeout.current[userId]
        }, TYPING_STATUS_TIMEOUT_MS)
      },
      [channelId, currentUser?.id],
    ),
  )

  // Member join/leave system events
  useSocketEvent(
    'member:joined',
    useCallback(
      (evt: MemberEvent) => {
        if (evt.channelId && evt.channelId !== channelId) return
        setSystemEvents((prev) => [
          ...prev,
          {
            id: `join-${evt.userId}-${Date.now()}`,
            type: 'joined',
            scope: evt.channelId ? 'channel' : 'server',
            displayName: evt.displayName || evt.username,
            isBot: evt.isBot,
            timestamp: Date.now(),
          },
        ])
      },
      [channelId],
    ),
  )

  useSocketEvent(
    'member:left',
    useCallback(
      (evt: MemberEvent) => {
        if (evt.channelId && evt.channelId !== channelId) return
        setSystemEvents((prev) => [
          ...prev,
          {
            id: `left-${evt.userId}-${Date.now()}`,
            type: 'left',
            scope: evt.channelId ? 'channel' : 'server',
            displayName: evt.displayName || evt.username,
            isBot: evt.isBot,
            timestamp: Date.now(),
          },
        ])
      },
      [channelId],
    ),
  )

  // Agent activity
  useSocketEvent(
    'presence:activity',
    useCallback(
      (payload: {
        userId: string
        channelId: string
        activity: string | null
        username?: string
      }) => {
        if (payload.channelId !== channelId) return
        if (activityUsersTimeout.current[payload.userId]) {
          clearTimeout(activityUsersTimeout.current[payload.userId])
          delete activityUsersTimeout.current[payload.userId]
        }
        setActivityUsers((prev) => {
          if (!payload.activity) return prev.filter((u) => u.userId !== payload.userId)
          const existing = prev.find((u) => u.userId === payload.userId)
          if (existing)
            return prev.map((u) =>
              u.userId === payload.userId ? { ...u, activity: payload.activity! } : u,
            )
          return [
            ...prev,
            {
              userId: payload.userId,
              username: payload.username ?? 'Buddy',
              activity: payload.activity,
            },
          ]
        })
        if (payload.activity) {
          activityUsersTimeout.current[payload.userId] = setTimeout(() => {
            setActivityUsers((prev) => prev.filter((u) => u.userId !== payload.userId))
            delete activityUsersTimeout.current[payload.userId]
          }, ACTIVITY_STATUS_TIMEOUT_MS)
        }
      },
      [channelId],
    ),
  )

  useEffect(() => {
    return () => {
      Object.values(typingUsersTimeout.current).forEach(clearTimeout)
      Object.values(activityUsersTimeout.current).forEach(clearTimeout)
      if (typingTimeout.current) clearTimeout(typingTimeout.current)
    }
  }, [])

  // ---------- File attachments ----------
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets) return
      setPendingFiles((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          type: a.mimeType ?? 'application/octet-stream',
          size: a.size,
        })),
      ])
    } catch {
      /* cancelled */
    }
  }

  const handlePickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('chat.mediaPermissionDenied', '需要相册访问权限'))
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      })
      if (result.canceled || !result.assets) return
      setPendingFiles((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `image_${Date.now()}.jpg`,
          type: a.mimeType ?? 'image/jpeg',
          size: a.fileSize,
        })),
      ])
    } catch {
      /* cancelled */
    }
  }

  const handleTakePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('chat.cameraPermissionDenied', '需要相机权限'))
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      })
      if (result.canceled || !result.assets) return
      setPendingFiles((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `photo_${Date.now()}.jpg`,
          type: a.mimeType ?? 'image/jpeg',
          size: a.fileSize,
        })),
      ])
    } catch {
      /* cancelled */
    }
  }

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleThreadPickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets) return
      setThreadPendingFiles((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          type: a.mimeType ?? 'application/octet-stream',
          size: a.size,
        })),
      ])
    } catch {
      /* cancelled */
    }
  }

  const handleThreadPickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('chat.mediaPermissionDenied', '需要相册访问权限'))
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      })
      if (result.canceled || !result.assets) return
      setThreadPendingFiles((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `image_${Date.now()}.jpg`,
          type: a.mimeType ?? 'image/jpeg',
          size: a.fileSize,
        })),
      ])
    } catch {
      /* cancelled */
    }
  }

  const handleThreadTakePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('chat.cameraPermissionDenied', '需要相机权限'))
        return
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      })
      if (result.canceled || !result.assets) return
      setThreadPendingFiles((prev) => [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `photo_${Date.now()}.jpg`,
          type: a.mimeType ?? 'image/jpeg',
          size: a.fileSize,
        })),
      ])
    } catch {
      /* cancelled */
    }
  }

  const removeThreadPendingFile = (index: number) => {
    setThreadPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // ---------- Send message ----------
  const insertOptimisticMessage = useCallback(
    (
      content: string,
      replyToId?: string,
      mentions?: MessageMention[],
      commerceCards?: CommerceProductCard[],
    ) => {
      const tempId = `temp-${Date.now()}`
      const metadata =
        (mentions && mentions.length > 0) || (commerceCards && commerceCards.length > 0)
          ? {
              ...(mentions && mentions.length > 0 ? { mentions } : {}),
              ...(commerceCards && commerceCards.length > 0 ? { commerceCards } : {}),
            }
          : undefined
      const optimisticMsg: Message = {
        id: tempId,
        content,
        channelId: channelId!,
        authorId: currentUser?.id ?? '',
        threadId: null,
        replyToId: replyToId ?? null,
        isEdited: false,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: currentUser
          ? {
              id: currentUser.id,
              username: currentUser.username,
              displayName: currentUser.displayName ?? currentUser.username,
              avatarUrl: currentUser.avatarUrl ?? null,
            }
          : undefined,
        metadata,
        sendStatus: 'sending',
      }

      queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
        if (!old) return old
        const firstPage = old.pages[0]
        if (!firstPage) return old
        return {
          ...old,
          pages: [
            { ...firstPage, messages: [...firstPage.messages, optimisticMsg] },
            ...old.pages.slice(1),
          ],
        }
      })

      // Scroll to newest
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
        }, 100)
      })

      return tempId
    },
    [channelId, currentUser, queryClient],
  )

  const markMessageFailed = useCallback(
    (tempId: string) => {
      queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === tempId ? { ...m, sendStatus: 'failed' as const } : m,
            ),
          })),
        }
      })
    },
    [channelId, queryClient],
  )

  const removeMessage = useCallback(
    (tempId: string) => {
      queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== tempId),
          })),
        }
      })
    },
    [channelId, queryClient],
  )

  const handleSend = async () => {
    const content = inputText.trim()
    if (content === '/product' || content === '/shop') {
      setInputText('')
      setSlashQuery(null)
      setShowProductPicker(true)
      clearDraft()
      return
    }
    if (!content && pendingFiles.length === 0 && selectedCommerceCards.length === 0) return
    if (sending) return
    setSending(true)
    const mentionsToSend = mentionsForContent(content, selectedMentions)
    const metadataToSend =
      mentionsToSend.length > 0 || selectedCommerceCards.length > 0
        ? {
            ...(mentionsToSend.length > 0 ? { mentions: mentionsToSend } : {}),
            ...(selectedCommerceCards.length > 0 ? { commerceCards: selectedCommerceCards } : {}),
          }
        : undefined

    // Insert optimistic message immediately
    const tempId =
      content || selectedCommerceCards.length > 0
        ? insertOptimisticMessage(
            content || '\u200B',
            replyTo?.id,
            mentionsToSend,
            selectedCommerceCards,
          )
        : null

    // Clear input immediately for responsiveness
    const savedContent = content
    const savedReplyTo = replyTo
    const savedPendingFiles = [...pendingFiles]
    const savedMentions = mentionsToSend
    const savedMetadata = metadataToSend
    setInputText('')
    setSelectedMentions([])
    setMentionQuery(null)
    setMentionTrigger(null)
    setSlashQuery(null)
    setReplyTo(null)
    setPendingFiles([])
    setSelectedCommerceCards([])

    // Clear draft after successful send
    clearDraft()

    playSendSound()

    try {
      let uploadedAttachments:
        | Array<{ url: string; filename: string; contentType: string; size: number }>
        | undefined
      if (savedPendingFiles.length > 0) {
        uploadedAttachments = []
        for (const file of savedPendingFiles) {
          const formData = new FormData()
          formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any)
          const uploaded = await fetchApi<{ url: string; size: number }>('/api/media/upload', {
            method: 'POST',
            body: formData,
            headers: {},
          })
          uploadedAttachments.push({
            url: uploaded.url,
            filename: file.name,
            contentType: file.type,
            size: uploaded.size,
          })
        }
      }

      // Try WebSocket for text-only messages, fall back to REST
      const sock = getSocket()
      if (!uploadedAttachments && sock.connected) {
        sendWsMessage({
          channelId: channelId!,
          content: savedContent || '\u200B',
          replyToId: savedReplyTo?.id,
          mentions: savedMentions,
          metadata: savedMetadata,
        })
        // WS send: message will be confirmed via message:new event which replaces the temp message
        // Set a timeout to mark as failed if no confirmation arrives
        if (tempId) {
          setTimeout(() => {
            queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
              if (!old) return old
              // Check if temp message still exists (not yet replaced by server confirmation)
              const stillPending = old.pages.some((p) =>
                p.messages.some((m) => m.id === tempId && m.sendStatus === 'sending'),
              )
              if (stillPending) {
                return {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((m) =>
                      m.id === tempId ? { ...m, sendStatus: 'failed' as const } : m,
                    ),
                  })),
                }
              }
              return old
            })
          }, 10000)
        }
      } else {
        // Use REST API — always works and returns the created message
        const created = await fetchApi<Record<string, unknown>>(
          `/api/channels/${channelId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              content: savedContent || '\u200B',
              replyToId: savedReplyTo?.id,
              ...(savedMentions.length > 0 ? { mentions: savedMentions } : {}),
              ...(savedMetadata ? { metadata: savedMetadata } : {}),
              ...(uploadedAttachments ? { attachments: uploadedAttachments } : {}),
            }),
          },
        )
        // Replace optimistic message with the real one or add if no optimistic
        if (tempId) {
          const realMsg = normalizeMessage(created)
          queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) => (m.id === tempId ? realMsg : m)),
              })),
            }
          })
        } else {
          appendMessage(created)
        }
      }

      // Keep input focused for continuous messaging
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch (err) {
      // Mark optimistic message as failed
      if (tempId) {
        markMessageFailed(tempId)
      } else {
        Alert.alert(t('common.error'), (err as Error).message || t('chat.sendFailed'))
      }
    } finally {
      setSending(false)
    }
  }

  const markThreadMessageFailed = useCallback(
    (tempId: string) => {
      if (!activeThreadId) return
      queryClient.setQueryData<Message[]>(['thread-messages', activeThreadId], (old) =>
        (old ?? []).map((m) => (m.id === tempId ? { ...m, sendStatus: 'failed' as const } : m)),
      )
    },
    [activeThreadId, queryClient],
  )

  const replaceThreadMessage = useCallback(
    (tempId: string | null, created: Message) => {
      if (!activeThreadId) return
      queryClient.setQueryData<Message[]>(['thread-messages', activeThreadId], (old) => {
        const messages = old ?? []
        if (messages.some((m) => m.id === created.id)) return messages
        if (!tempId) return [...messages, created]
        const replaced = messages.map((m) => (m.id === tempId ? created : m))
        return replaced.some((m) => m.id === created.id) ? replaced : [...replaced, created]
      })
    },
    [activeThreadId, queryClient],
  )

  const insertOptimisticThreadMessage = useCallback(
    (content: string, replyToId?: string | null) => {
      if (!activeThread || !activeThreadId) return null
      const tempId = `temp-thread-${Date.now()}`
      const optimisticMsg: Message = {
        id: tempId,
        content,
        channelId: activeThread.channelId,
        authorId: currentUser?.id ?? '',
        threadId: activeThreadId,
        replyToId: replyToId ?? null,
        isEdited: false,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: currentUser
          ? {
              id: currentUser.id,
              username: currentUser.username,
              displayName: currentUser.displayName ?? currentUser.username,
              avatarUrl: currentUser.avatarUrl ?? null,
            }
          : undefined,
        sendStatus: 'sending',
      }
      queryClient.setQueryData<Message[]>(['thread-messages', activeThreadId], (old) => [
        ...(old ?? []),
        optimisticMsg,
      ])
      requestAnimationFrame(() => {
        setTimeout(() => threadListRef.current?.scrollToEnd({ animated: true }), 120)
      })
      return tempId
    },
    [activeThread, activeThreadId, currentUser, queryClient],
  )

  const handleThreadSend = useCallback(async () => {
    if (!activeThread || !activeThreadId || threadSending) return
    const content = threadInputText.trim()
    if (!content && threadPendingFiles.length === 0) return

    setThreadSending(true)
    const tempId = content ? insertOptimisticThreadMessage(content, threadReplyTo?.id) : null
    const savedContent = content
    const savedReplyTo = threadReplyTo
    const savedFiles = [...threadPendingFiles]
    setThreadInputText('')
    setThreadReplyTo(null)
    setThreadPendingFiles([])
    playSendSound()

    try {
      const uploadedAttachments: Array<{
        url: string
        filename: string
        contentType: string
        size: number
      }> = []
      for (const file of savedFiles) {
        const formData = new FormData()
        formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any)
        const uploaded = await fetchApi<{ url: string; size: number }>('/api/media/upload', {
          method: 'POST',
          body: formData,
          headers: {},
        })
        uploadedAttachments.push({
          url: uploaded.url,
          filename: file.name,
          contentType: file.type,
          size: uploaded.size,
        })
      }

      const created = await fetchApi<Record<string, unknown>>(
        `/api/threads/${activeThreadId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: savedContent || '\u200B',
            replyToId: savedReplyTo?.id,
            ...(uploadedAttachments.length > 0 ? { attachments: uploadedAttachments } : {}),
          }),
        },
      )
      replaceThreadMessage(tempId, normalizeMessage(created))
      setTimeout(() => threadInputRef.current?.focus(), 50)
    } catch (err) {
      if (tempId) {
        markThreadMessageFailed(tempId)
      } else {
        Alert.alert(t('common.error'), (err as Error).message || t('chat.sendFailed'))
      }
    } finally {
      setThreadSending(false)
    }
  }, [
    activeThread,
    activeThreadId,
    insertOptimisticThreadMessage,
    markThreadMessageFailed,
    replaceThreadMessage,
    t,
    threadInputText,
    threadPendingFiles,
    threadReplyTo,
    threadSending,
  ])

  const handleRetry = useCallback(
    async (failedMsg: Message) => {
      // Remove the failed message
      removeMessage(failedMsg.id)
      // Re-insert as optimistic and try again
      const tempId = insertOptimisticMessage(failedMsg.content, failedMsg.replyToId ?? undefined)
      try {
        const created = await fetchApi<Record<string, unknown>>(
          `/api/channels/${channelId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              content: failedMsg.content,
              replyToId: failedMsg.replyToId ?? undefined,
            }),
          },
        )
        const realMsg = normalizeMessage(created)
        queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) => (m.id === tempId ? realMsg : m)),
            })),
          }
        })
      } catch {
        markMessageFailed(tempId)
      }
    },
    [channelId, queryClient, insertOptimisticMessage, removeMessage, markMessageFailed],
  )

  const handleThreadRetry = useCallback(
    async (failedMsg: Message) => {
      if (!failedMsg.threadId) return
      queryClient.setQueryData<Message[]>(['thread-messages', failedMsg.threadId], (old) =>
        (old ?? []).filter((m) => m.id !== failedMsg.id),
      )
      const tempId = insertOptimisticThreadMessage(failedMsg.content, failedMsg.replyToId)
      if (!tempId) return
      try {
        const created = await fetchApi<Record<string, unknown>>(
          `/api/threads/${failedMsg.threadId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              content: failedMsg.content,
              replyToId: failedMsg.replyToId ?? undefined,
            }),
          },
        )
        replaceThreadMessage(tempId, normalizeMessage(created))
      } catch {
        markThreadMessageFailed(tempId)
      }
    },
    [insertOptimisticThreadMessage, markThreadMessageFailed, queryClient, replaceThreadMessage],
  )

  const handleTyping = useCallback(() => {
    if (!channelId) return
    if (typingTimeout.current) return
    sendTyping(channelId)
    typingTimeout.current = setTimeout(() => {
      typingTimeout.current = null
    }, 2000)
  }, [channelId])

  const formatActivityLabel = useCallback(
    (activity: string) => {
      if (activity === 'thinking') return t('member.activityThinking')
      if (activity === 'working') return t('member.activityWorking')
      if (activity === 'preparing') return t('member.activityPreparing')
      if (activity === 'ready') return t('member.activityReady')
      return activity
    },
    [t],
  )

  // @mention detection on input text change
  const handleTextChange = useCallback(
    (text: string) => {
      setInputText(text)
      handleTyping()
      const slashMatch = text.match(/(?:^|\s)\/([^\s/]{0,64})$/u)
      if (slashMatch) {
        setSlashQuery(slashMatch[1] ?? '')
        setMentionTrigger(null)
        setMentionQuery(null)
        return
      }
      setSlashQuery(null)
      // Detect mention/reference query
      const match = text.match(/(?:^|\s)([@#])([^\s@#]{0,128})$/u)
      setMentionTrigger((match?.[1] as MentionSuggestionTrigger | undefined) ?? null)
      setMentionQuery(match ? match[2]! : null)
    },
    [handleTyping],
  )

  // Auto-save draft when text or pendingFiles change (debounced)
  useEffect(() => {
    scheduleSave(inputText, pendingFiles)
  }, [inputText, pendingFiles, scheduleSave])

  // Insert mention/reference into input
  const insertMention = useCallback(
    (suggestion: MentionSuggestion) => {
      const match = inputText.match(/(?:^|\s)([@#])([^\s@#]{0,128})$/u)
      if (!match || match.index === undefined) return

      const prefix = match[0].startsWith(' ') ? ' ' : ''
      const start = match.index + prefix.length
      const before = inputText.slice(0, start)
      const next = `${before}${suggestion.token} `
      setInputText(next)
      setSelectedMentions((prev) =>
        mergeMention(
          prev,
          mentionFromSuggestion(suggestion, {
            start,
            end: start + suggestion.token.length,
          }),
        ),
      )
      setMentionQuery(null)
      setMentionTrigger(null)
      inputRef.current?.focus()
    },
    [inputText],
  )

  const insertSlashCommand = useCallback(
    (command: SlashCommand) => {
      const match = inputText.match(/(?:^|\s)\/([^\s/]{0,64})$/u)
      if (!match || match.index === undefined) return

      const prefix = match[0].startsWith(' ') ? ' ' : ''
      const start = match.index + prefix.length
      const before = inputText.slice(0, start)
      const name = command.name.replace(/^\/+/, '')
      setInputText(`${before}/${name} `)
      setSlashQuery(null)
      setMentionQuery(null)
      setMentionTrigger(null)
      inputRef.current?.focus()
    },
    [inputText],
  )

  const handleReply = useCallback((msg: Message) => {
    setReplyTo(msg)
  }, [])

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
    setSelectionAnchorId(messageId)
  }, [])

  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedMessageIds(new Set())
    setSelectionAnchorId(null)
  }, [])

  useEffect(() => {
    handleExitSelectionMode()
  }, [channelId, handleExitSelectionMode])

  const handleSelectRangeTo = useCallback(
    (messageId: string) => {
      const anchorId = selectionAnchorId ?? messageId
      const anchorIndex = messages.findIndex((message) => message.id === anchorId)
      const targetIndex = messages.findIndex((message) => message.id === messageId)

      if (anchorIndex === -1 || targetIndex === -1) {
        setSelectedMessageIds(new Set([messageId]))
        setSelectionAnchorId(messageId)
        setSelectionMode(true)
        return
      }

      const start = Math.min(anchorIndex, targetIndex)
      const end = Math.max(anchorIndex, targetIndex)
      setSelectedMessageIds(new Set(messages.slice(start, end + 1).map((message) => message.id)))
      setSelectionMode(true)
      setSelectionAnchorId(anchorId)
    },
    [messages, selectionAnchorId],
  )

  const handleCopySelectedAsMarkdown = useCallback(async () => {
    const selectedMsgs = messages
      .filter((m) => selectedMessageIds.has(m.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const md = selectedMsgs
      .map((m) => {
        const author = m.author?.displayName || m.author?.username || 'Unknown'
        const time = new Date(m.createdAt).toLocaleString()
        const attachmentLines = (m.attachments ?? []).map(
          (a: { filename: string; url: string }) => `  - [${a.filename}](${a.url})`,
        )
        return [`**${author}** (${time})`, m.content, ...attachmentLines].filter(Boolean).join('\n')
      })
      .join('\n\n---\n\n')
    await Clipboard.setStringAsync(md)
    handleExitSelectionMode()
  }, [messages, selectedMessageIds, handleExitSelectionMode])

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ---------- Render ----------
  const renderTimelineItem = useCallback(
    ({ item, index }: { item: TimelineItem; index: number }) => {
      if (item.kind === 'system') {
        const evt = item.data
        return (
          <View style={styles.systemEvent}>
            <View style={[styles.systemEventLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.systemEventText, { color: colors.textMuted }]}>
              {evt.type === 'joined' ? '→' : '←'} {evt.displayName}{' '}
              {t(evt.type === 'joined' ? 'chat.memberJoined' : 'chat.memberLeft')}
            </Text>
            <View style={[styles.systemEventLine, { backgroundColor: colors.border }]} />
          </View>
        )
      }
      if (item.kind === 'divider') {
        return (
          <View style={styles.newMessageDivider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.error }]} />
            <Text style={[styles.dividerText, { color: colors.error }]}>
              {t('chat.newMessages')}
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.error }]} />
          </View>
        )
      }
      if (item.kind === 'date') {
        return (
          <View style={styles.dateSeparator}>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dateText, { color: colors.textMuted }]}>{item.data.date}</Text>
            <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
          </View>
        )
      }
      // Message grouping: in inverted list, the visually "previous" message is at index + 1
      let isGrouped = false
      const prev = index < timeline.length - 1 ? timeline[index + 1] : null
      if (prev?.kind === 'message' && !item.data.replyToId) {
        const sameAuthor = prev.data.authorId === item.data.authorId
        const timeDiff =
          new Date(item.data.createdAt).getTime() - new Date(prev.data.createdAt).getTime()
        isGrouped = sameAuthor && timeDiff < 5 * 60 * 1000
      }
      return (
        <View
          style={
            highlightMessageId === item.data.id
              ? { backgroundColor: `${colors.primary}15`, borderRadius: radius.md }
              : undefined
          }
        >
          <MessageBubble
            message={item.data}
            onReply={() => handleReply(item.data)}
            onRetry={handleRetry}
            onOpenThread={() => openThreadForMessage(item.data)}
            hasThread={threadsByParentId.has(item.data.id)}
            channelId={channelId!}
            serverSlug={serverSlug}
            allMessages={messages}
            isGrouped={isGrouped}
            selectionMode={selectionMode}
            isSelected={selectedMessageIds.has(item.data.id)}
            selectionAnchorId={selectionAnchorId}
            onToggleSelect={handleToggleSelect}
            onEnterSelectionMode={handleEnterSelectionMode}
            onSelectRangeTo={handleSelectRangeTo}
          />
        </View>
      )
    },
    [
      colors,
      t,
      channelId,
      handleReply,
      handleRetry,
      openThreadForMessage,
      threadsByParentId,
      messages,
      timeline,
      highlightMessageId,
      selectionMode,
      selectedMessageIds,
      selectionAnchorId,
      handleToggleSelect,
      handleEnterSelectionMode,
      handleSelectRangeTo,
    ],
  )

  const renderThreadMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const prev = index > 0 ? threadMessages[index - 1] : null
      const isGrouped =
        prev != null &&
        prev.authorId === item.authorId &&
        !item.replyToId &&
        new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
      return (
        <MessageBubble
          message={item}
          onReply={() => setThreadReplyTo(item)}
          onRetry={handleThreadRetry}
          channelId={item.channelId}
          serverSlug={serverSlug}
          allMessages={threadMessagesWithParent}
          isGrouped={isGrouped}
        />
      )
    },
    [handleThreadRetry, serverSlug, threadMessages, threadMessagesWithParent],
  )

  const getItemKey = useCallback((item: TimelineItem) => {
    return item.data.id
  }, [])

  const getMessageKey = useCallback((item: Message) => item.id, [])

  if (access && !access.canAccess) {
    const gateChannel = access.channel ?? channel
    const isPending = access.joinRequestStatus === 'pending' || requestAccessMutation.isSuccess
    return (
      <BackgroundSurface style={styles.container}>
        <GlassHeader style={[styles.customHeader, { paddingTop: insets.top }]}>
          <Button
            variant="ghost"
            size="icon"
            icon={ChevronLeft}
            onPress={() => router.back()}
            hitSlop={8}
            iconColor={colors.text}
            style={styles.headerBackBtn}
          />
          <View style={styles.headerTitleRow}>
            <AppText variant="title" numberOfLines={1}>
              # {gateChannel?.name ?? t('channel.privateChannel')}
            </AppText>
          </View>
        </GlassHeader>
        <GlassPanel style={styles.accessGate}>
          <View style={[styles.accessGateIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Lock size={32} color={colors.primary} />
          </View>
          <AppText variant="headline" style={styles.accessGateTitle}>
            # {gateChannel?.name ?? t('channel.privateChannel')}
          </AppText>
          <AppText tone="secondary" style={styles.accessGateDesc}>
            {t('channel.privateChannelGateDesc')}
          </AppText>
          <Button
            variant="primary"
            size="lg"
            icon={Send}
            loading={requestAccessMutation.isPending}
            disabled={isPending || requestAccessMutation.isPending}
            onPress={() => requestAccessMutation.mutate()}
            style={styles.accessGateButton}
          >
            {isPending ? t('channel.requestPending') : t('channel.requestAccess')}
          </Button>
        </GlassPanel>
      </BackgroundSurface>
    )
  }

  if (channel?.type === 'voice' && channelId) {
    return (
      <VoiceChannelPanel
        channelId={channelId}
        channelName={channel.name}
        serverSlug={serverSlug}
        onBack={() => router.back()}
      />
    )
  }

  return (
    <BackgroundSurface style={styles.container}>
      {/* Custom header bar — left-aligned like Discord */}
      <GlassHeader style={[styles.customHeader, { paddingTop: insets.top }]}>
        <Button
          variant="ghost"
          size="icon"
          icon={ChevronLeft}
          onPress={() => router.back()}
          hitSlop={8}
          iconColor={colors.text}
          style={styles.headerBackBtn}
        />
        <Pressable
          onPress={() => {
            if (serverSlug) {
              router.push(
                `/(main)/servers/${serverSlug}/channel-members?channelId=${channelId}` as never,
              )
            } else {
              setShowMemberList(true)
            }
          }}
          style={styles.headerTitleRow}
        >
          <View style={styles.headerNameRow}>
            <AppText variant="title" style={styles.headerChannel} numberOfLines={1}>
              # {channel?.name ?? '...'}
            </AppText>
            <ChevronRight
              size={16}
              color={colors.textMuted}
              strokeWidth={2.8}
              style={styles.headerChevron}
            />
          </View>
          <View style={styles.headerOnlineRow}>
            <View
              style={[
                styles.headerOnlineDot,
                onlineMemberCount === 0 && { backgroundColor: colors.textMuted },
              ]}
            />
            <AppText variant="label" tone="secondary" style={styles.headerOnlineText}>
              {onlineMemberCount}
              {t('chat.onlineSuffix', '人在线')}
            </AppText>
          </View>
        </Pressable>
        <View style={styles.headerRight}>
          <Button
            variant="ghost"
            size="icon"
            icon={Search}
            onPress={() => {
              setShowSearchPanel(true)
              setTimeout(() => searchInputRef.current?.focus(), 300)
            }}
            hitSlop={8}
            iconColor={colors.textMuted}
            style={styles.headerIconBtn}
          />
        </View>
      </GlassHeader>

      {isLoading ? (
        <View style={styles.loading}>
          <Spinner />
        </View>
      ) : timeline.length === 0 ? (
        <Pressable style={styles.emptyState} onPress={Keyboard.dismiss}>
          <EmptyState
            icon={Hash}
            title={t('chat.welcomeChannel', {
              channelName: channel?.name ?? t('chat.channelFallback'),
            })}
            description={t('chat.welcomeStart')}
          />
        </Pressable>
      ) : (
        <FlatList
          ref={flatListRef}
          data={timeline}
          keyExtractor={getItemKey}
          renderItem={renderTimelineItem}
          extraData={selectionMode ? { selectedMessageIds, selectionAnchorId } : null}
          contentContainerStyle={styles.messageList}
          inverted
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingMoreText, { color: colors.textMuted }]}>
                  {t('chat.loadingOlder')}
                </Text>
              </View>
            ) : null
          }
          scrollsToTop={false}
          onScroll={handleMessageListScroll}
          scrollEventThrottle={100}
          onScrollBeginDrag={() => Keyboard.dismiss()}
          onScrollEndDrag={commitScrollBottomVisibility}
          onMomentumScrollEnd={commitScrollBottomVisibility}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Scroll to bottom FAB */}
      {showScrollBottom && (
        <Button
          variant="glass"
          size="icon"
          icon={ChevronDown}
          iconColor={colors.textSecondary}
          style={styles.scrollBottomFab}
          onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
        />
      )}

      {/* Activity indicator */}
      {activityUsers.length > 0 && (
        <View style={styles.activityBar}>
          <ChatWorkIndicator
            items={activityUsers.map((u) => ({
              id: u.userId,
              label: `${u.username} ${formatActivityLabel(u.activity)}`,
            }))}
          />
        </View>
      )}

      {/* Typing indicator */}

      {/* Slash command autocomplete dropdown */}
      {filteredSlashCommands.length > 0 && slashQuery !== null && (
        <View
          style={[
            styles.mentionDropdown,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.suggestionHeader}>
            <CommandIcon size={13} color={colors.primary} />
            <Text style={[styles.suggestionHeaderText, { color: colors.textMuted }]}>
              {t('chat.slashCommands')}
            </Text>
          </View>
          {filteredSlashCommands.map((command) => (
            <Pressable
              key={`${command.agentId}:${command.name}`}
              style={({ pressed }) => [
                styles.mentionRow,
                pressed && { backgroundColor: colors.surfaceHover },
              ]}
              onPress={() => insertSlashCommand(command)}
            >
              <View style={[styles.mentionIcon, { backgroundColor: `${colors.primary}18` }]}>
                <CommandIcon size={15} color={colors.primary} />
              </View>
              <View style={styles.slashCommandBody}>
                <Text style={[styles.mentionName, { color: colors.text }]} numberOfLines={1}>
                  /{command.name.replace(/^\/+/, '')}
                </Text>
                <Text
                  style={[styles.mentionUsername, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {command.description || t('chat.slashCommandNoDescription')}
                </Text>
              </View>
              <View style={[styles.mentionBotBadge, { backgroundColor: `${colors.primary}20` }]}>
                <Bot size={11} color={colors.primary} />
                <Text style={[styles.mentionBotText, { color: colors.primary }]} numberOfLines={1}>
                  {command.botDisplayName ?? command.botUsername}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* @mention autocomplete dropdown */}
      {mentionResults.length > 0 && mentionQuery !== null && (
        <View
          style={[
            styles.mentionDropdown,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {mentionResults.map((m) => (
            <Pressable
              key={m.id}
              style={({ pressed }) => [
                styles.mentionRow,
                pressed && { backgroundColor: colors.surfaceHover },
              ]}
              onPress={() => insertMention(m)}
            >
              {m.kind === 'user' || m.kind === 'buddy' ? (
                <Avatar
                  uri={m.avatarUrl ?? null}
                  name={m.displayName || m.username || m.label}
                  size={24}
                  userId={m.userId}
                />
              ) : (
                <View style={[styles.mentionIcon, { backgroundColor: `${colors.primary}18` }]}>
                  {m.kind === 'channel' ? (
                    <Hash size={15} color={colors.primary} />
                  ) : (
                    <Users size={15} color={colors.primary} />
                  )}
                </View>
              )}
              <Text style={[styles.mentionName, { color: colors.text }]} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={[styles.mentionUsername, { color: colors.textMuted }]} numberOfLines={1}>
                {m.description || m.token}
              </Text>
              {m.isBot && (
                <View style={[styles.mentionBotBadge, { backgroundColor: `${colors.primary}20` }]}>
                  <Text style={[styles.mentionBotText, { color: colors.primary }]}>Buddy</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {selectionMode ? (
        <GlassHeader
          style={[styles.selectionToolbar, { paddingBottom: insets.bottom + spacing.sm }]}
        >
          <AppText variant="label" tone="secondary" style={styles.selectionCount}>
            {t('chat.selectedCount', {
              count: selectedMessageIds.size,
              defaultValue: `已选 ${selectedMessageIds.size} 条`,
            })}
          </AppText>
          <Button
            variant="primary"
            size="sm"
            icon={Copy}
            onPress={handleCopySelectedAsMarkdown}
            disabled={selectedMessageIds.size === 0}
          >
            {t('workspaceFmt_markdown')}
          </Button>
          <Button variant="glass" size="sm" onPress={handleExitSelectionMode}>
            {t('common.cancel')}
          </Button>
        </GlassHeader>
      ) : (
        <ChatComposer
          inputText={inputText}
          onInputChange={handleTextChange}
          onSend={handleSend}
          inputRef={inputRef}
          pendingFiles={pendingFiles}
          onRemovePendingFile={removePendingFile}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          typingUsers={typingUsers}
          isRecording={isRecording}
          isHolding={isHolding}
          keyboardVisible={keyboardVisible}
          insetsBottom={insets.bottom}
          canUseVoice={speechSupported}
          onVoicePressIn={onVoicePressIn}
          onVoicePressOut={onVoicePressOut}
          showAtButton
          onPressAt={() => {
            setInputText((prev) => `${prev}@`)
            setMentionQuery('')
            setSlashQuery(null)
            inputRef.current?.focus()
          }}
          showEmojiPicker={showInputEmojiPicker}
          setShowEmojiPicker={setShowInputEmojiPicker}
          showPlusMenu={showPlusMenu}
          setShowPlusMenu={setShowPlusMenu}
          panelHeight={keyboardHeight}
          onPickImage={handlePickImage}
          onPickFile={handlePickFile}
          onTakePhoto={handleTakePhoto}
          commerceCards={selectedCommerceCards}
          onOpenProductPicker={() => setShowProductPicker(true)}
          onRemoveCommerceCard={(cardId) =>
            setSelectedCommerceCards((prev) => prev.filter((card) => card.id !== cardId))
          }
          onPasteImage={(imageDataUri) => {
            const timestamp = Date.now()
            const fileName = `clipboard_${timestamp}.png`
            setPendingFiles((prev) => [
              ...prev,
              {
                uri: imageDataUri,
                name: fileName,
                type: 'image/png',
              },
            ])
          }}
        />
      )}

      <Sheet
        visible={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        title={t('chat.productPicker')}
        action={
          <Button
            variant="ghost"
            size="icon"
            icon={X}
            iconColor={colors.textMuted}
            onPress={() => setShowProductPicker(false)}
          />
        }
      >
        {isFetchingProducts ? (
          <View style={styles.productPickerState}>
            <Spinner />
            <AppText variant="label" tone="secondary">
              {t('chat.productPickerLoading')}
            </AppText>
          </View>
        ) : productCards.length === 0 ? (
          <View style={styles.productPickerState}>
            <AppText variant="label" tone="secondary">
              {t('chat.productPickerEmpty')}
            </AppText>
          </View>
        ) : (
          <FlatList
            data={productCards}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.productPickerList}
            renderItem={({ item }) => (
              <MenuItem
                icon={ShoppingBag}
                title={item.snapshot.name}
                subtitle={item.snapshot.summary}
                onPress={() => addCommerceCard(item)}
                right={
                  <AppText variant="bodyStrong" tone="primary">
                    {formatCommercePrice(item.snapshot.price, item.snapshot.currency, t)}
                  </AppText>
                }
              />
            )}
          />
        )}
      </Sheet>

      <Modal
        visible={Boolean(activeThread)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setActiveThread(null)
          setActiveThreadParent(null)
          setThreadReplyTo(null)
        }}
      >
        <BackgroundSurface style={styles.threadModal}>
          <GlassHeader style={[styles.threadHeader, { paddingTop: insets.top }]}>
            <Button
              variant="ghost"
              size="icon"
              icon={ChevronLeft}
              onPress={() => {
                setActiveThread(null)
                setActiveThreadParent(null)
                setThreadReplyTo(null)
              }}
              hitSlop={8}
              iconColor={colors.text}
              style={styles.headerBackBtn}
            />
            <View style={styles.threadHeaderTitle}>
              <View style={styles.threadHeaderNameRow}>
                <MessageSquare size={16} color={colors.primary} />
                <AppText variant="title" style={styles.threadHeaderName} numberOfLines={1}>
                  {activeThread?.name ?? t('chat.thread')}
                </AppText>
              </View>
              <AppText variant="label" tone="secondary" numberOfLines={1}>
                # {channel?.name ?? t('chat.channelFallback')}
              </AppText>
            </View>
          </GlassHeader>

          {activeThreadParent && (
            <View style={[styles.threadSource, { borderBottomColor: colors.border }]}>
              <AppText variant="label" tone="secondary" style={styles.threadSourceLabel}>
                {t('chat.threadSource')}
              </AppText>
              <MessageBubble
                message={activeThreadParent}
                onReply={() => setThreadReplyTo(activeThreadParent)}
                onRetry={handleRetry}
                channelId={activeThreadParent.channelId}
                serverSlug={serverSlug}
                allMessages={messages}
              />
            </View>
          )}

          {isThreadLoading ? (
            <View style={styles.loading}>
              <Spinner />
            </View>
          ) : threadMessages.length === 0 ? (
            <View style={styles.threadEmpty}>
              <MessageSquare size={28} color={colors.primary} />
              <AppText variant="bodyStrong" tone="secondary">
                {t('chat.threadEmpty')}
              </AppText>
            </View>
          ) : (
            <FlatList
              ref={threadListRef}
              data={threadMessages}
              keyExtractor={getMessageKey}
              renderItem={renderThreadMessage}
              contentContainerStyle={styles.threadMessageList}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => threadListRef.current?.scrollToEnd({ animated: true })}
            />
          )}

          <ChatComposer
            inputText={threadInputText}
            onInputChange={setThreadInputText}
            onSend={handleThreadSend}
            inputRef={threadInputRef}
            pendingFiles={threadPendingFiles}
            onRemovePendingFile={removeThreadPendingFile}
            replyTo={threadReplyTo}
            onClearReply={() => setThreadReplyTo(null)}
            typingUsers={[]}
            keyboardVisible={keyboardVisible}
            insetsBottom={insets.bottom}
            canUseVoice={false}
            showEmojiPicker={showThreadEmojiPicker}
            setShowEmojiPicker={setShowThreadEmojiPicker}
            showPlusMenu={showThreadPlusMenu}
            setShowPlusMenu={setShowThreadPlusMenu}
            panelHeight={keyboardHeight}
            onPickImage={handleThreadPickImage}
            onPickFile={handleThreadPickFile}
            onTakePhoto={handleThreadTakePhoto}
            onPasteImage={(imageDataUri) => {
              const timestamp = Date.now()
              setThreadPendingFiles((prev) => [
                ...prev,
                {
                  uri: imageDataUri,
                  name: `clipboard_${timestamp}.png`,
                  type: 'image/png',
                },
              ])
            }}
          />
        </BackgroundSurface>
      </Modal>

      {/* Member list modal */}
      <Modal
        visible={showMemberList}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMemberList(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetDismiss} onPress={() => setShowMemberList(false)} />
          <View style={[styles.sheetContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {t('member.title')} ({channelMembers.length})
              </Text>
              <View style={styles.sheetHeaderActions}>
                {serverSlug && (
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss()
                      setShowMemberList(false)
                      router.push(
                        `/(main)/servers/${serverSlug}/channel-members?channelId=${channelId}&autoInvite=1` as never,
                      )
                    }}
                    hitSlop={8}
                    style={[styles.sheetActionBtn, { backgroundColor: `${colors.primary}12` }]}
                  >
                    <UserPlus size={16} color={colors.primary} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setShowMemberList(false)}
                  hitSlop={8}
                  style={[styles.sheetActionBtn, { backgroundColor: colors.inputBackground }]}
                >
                  <X size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
            <FlatList
              data={[
                ...channelMembers.filter((m) => m.user.status && m.user.status !== 'offline'),
                ...channelMembers.filter((m) => !m.user.status || m.user.status === 'offline'),
              ]}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.sheetList}
              renderItem={({ item }) => {
                const name = item.user.displayName || item.user.username
                const isOnline = item.user.status && item.user.status !== 'offline'
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.memberRow,
                      { opacity: isOnline ? 1 : 0.5 },
                      pressed && { backgroundColor: colors.surfaceHover },
                    ]}
                    onPress={() => {
                      setShowMemberList(false)
                      router.push(`/(main)/profile/${item.user.id}`)
                    }}
                  >
                    <View style={styles.memberAvatarWrap}>
                      <Avatar
                        uri={item.user.avatarUrl}
                        name={name}
                        size={40}
                        userId={item.user.id}
                      />
                      <View style={styles.memberStatusDot}>
                        <StatusBadge status={item.user.status || 'offline'} size={12} />
                      </View>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                        @{item.user.username}
                      </Text>
                    </View>
                    {item.role !== 'member' && (
                      <View
                        style={[
                          styles.memberRoleBadge,
                          {
                            backgroundColor:
                              item.role === 'owner' ? `${colors.warning}20` : `${colors.info}20`,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.memberRoleText,
                            {
                              color: item.role === 'owner' ? colors.warning : colors.info,
                            },
                          ]}
                        >
                          {item.role === 'owner' ? t('member.roleOwner') : t('member.roleAdmin')}
                        </Text>
                      </View>
                    )}
                    {item.user.isBot && (
                      <View
                        style={[styles.memberRoleBadge, { backgroundColor: `${colors.primary}20` }]}
                      >
                        <Text style={[styles.memberRoleText, { color: colors.primary }]}>
                          Buddy
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )
              }}
              ListEmptyComponent={
                <View style={styles.memberEmpty}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                    {t('member.noMembers')}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Invite member panel */}
      <Modal
        visible={showInvitePanel}
        animationType="slide"
        transparent
        onRequestClose={() => setShowInvitePanel(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetDismiss} onPress={() => setShowInvitePanel(false)} />
          <View style={[styles.sheetContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {t('member.inviteMembers')}
              </Text>
              <Pressable
                onPress={() => setShowInvitePanel(false)}
                hitSlop={8}
                style={[styles.sheetActionBtn, { backgroundColor: colors.inputBackground }]}
              >
                <X size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.sheetSearchWrap, { backgroundColor: colors.inputBackground }]}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.inviteSearchInput, { color: colors.text }]}
                value={inviteSearch}
                onChangeText={setInviteSearch}
                placeholder={t('member.searchMembers')}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <FlatList
              data={invitableMembers}
              keyExtractor={(item) => item.user.id}
              contentContainerStyle={styles.sheetList}
              renderItem={({ item }) => {
                const name = item.user.displayName || item.user.username
                const isPending =
                  inviteMemberMutation.isPending && inviteMemberMutation.variables === item.user.id
                return (
                  <View style={styles.memberRow}>
                    <Avatar uri={item.user.avatarUrl} name={name} size={40} userId={item.user.id} />
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                        @{item.user.username}
                      </Text>
                    </View>
                    {item.user.isBot && (
                      <View
                        style={[styles.memberRoleBadge, { backgroundColor: `${colors.primary}20` }]}
                      >
                        <Text style={[styles.memberRoleText, { color: colors.primary }]}>
                          Buddy
                        </Text>
                      </View>
                    )}
                    <Pressable
                      style={[styles.inviteBtn, { backgroundColor: `${colors.primary}12` }]}
                      onPress={() => inviteMemberMutation.mutate(item.user.id)}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <UserPlus size={16} color={colors.primary} />
                      )}
                    </Pressable>
                  </View>
                )
              }}
              ListEmptyComponent={
                <View style={styles.memberEmpty}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                    {t('member.allMembersAdded')}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Search Panel */}
      <Modal
        visible={showSearchPanel}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearchPanel(false)}
      >
        <BackgroundSurface style={styles.searchPanel}>
          {/* Search header */}
          <GlassHeader
            style={[styles.searchHeader, { paddingTop: Platform.OS === 'ios' ? 12 : 0 }]}
          >
            <InputValley style={styles.searchInputRow} focused={searchQuery.length > 0}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: colors.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={
                  searchTab === 'messages'
                    ? t('chat.searchPlaceholder', '搜索消息...')
                    : t('chat.searchMemberPlaceholder', '搜索成员...')
                }
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </InputValley>
            <Button variant="ghost" size="sm" onPress={() => setShowSearchPanel(false)} hitSlop={8}>
              {t('common.cancel', '取消')}
            </Button>
          </GlassHeader>

          {/* Tab bar */}
          <View style={[styles.searchTabBar, { borderBottomColor: colors.border }]}>
            <Pressable
              style={[
                styles.searchTab,
                searchTab === 'messages' && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setSearchTab('messages')}
            >
              <MessageSquare
                size={14}
                color={searchTab === 'messages' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.searchTabText,
                  { color: searchTab === 'messages' ? colors.primary : colors.textMuted },
                ]}
              >
                {t('chat.tabMessages', '消息')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.searchTab,
                searchTab === 'members' && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setSearchTab('members')}
            >
              <Users
                size={14}
                color={searchTab === 'members' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.searchTabText,
                  { color: searchTab === 'members' ? colors.primary : colors.textMuted },
                ]}
              >
                {t('chat.tabMembers', '成员')}
              </Text>
            </Pressable>
          </View>

          {/* Messages tab content */}
          {searchTab === 'messages' && (
            <>
              {/* Filter chips */}
              <View style={styles.searchFilters}>
                <ChipButton
                  label={t('chat.hasFile', '含附件')}
                  icon={File}
                  active={searchHasAttachment}
                  onPress={() => setSearchHasAttachment(!searchHasAttachment)}
                />
                {searchFromUser && (
                  <ChipButton
                    active
                    iconRight={X}
                    label={`${t('chat.fromUser', '来自')}: ${
                      channelMembers.find((m) => m.user.id === searchFromUser)?.user.displayName ??
                      '...'
                    }`}
                    onPress={() => setSearchFromUser(null)}
                  />
                )}
              </View>

              {/* Member filter list (when no query) */}
              {searchQuery.length < 2 && !searchFromUser && (
                <View style={styles.searchMemberFilter}>
                  <AppText variant="label" tone="secondary" style={styles.searchSectionLabel}>
                    {t('chat.filterByMember', '按成员筛选')}
                  </AppText>
                  {channelMembers.slice(0, 10).map((m) => (
                    <MenuItem
                      key={m.user.id}
                      title={m.user.displayName || m.user.username}
                      onPress={() => setSearchFromUser(m.user.id)}
                      right={
                        <Avatar
                          uri={m.user.avatarUrl}
                          name={m.user.displayName || m.user.username}
                          size={28}
                          userId={m.user.id}
                        />
                      }
                    />
                  ))}
                </View>
              )}

              {/* Search results */}
              {searchQuery.length >= 2 && (
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ padding: spacing.md }}
                  ListEmptyComponent={
                    isSearching ? (
                      <ActivityIndicator
                        color={colors.primary}
                        style={{ marginTop: spacing['3xl'] }}
                      />
                    ) : (
                      <EmptyState
                        title={t('chat.noSearchResults', '没有找到匹配的消息')}
                        icon={Search}
                        style={styles.searchEmpty}
                      />
                    )
                  }
                  renderItem={({ item }) => {
                    const authorName =
                      item.author?.displayName || item.author?.username || t('common.unknown')
                    return (
                      <Pressable
                        style={[styles.searchResultCard, { backgroundColor: colors.surface }]}
                        onPress={() => scrollToMessage(item.id)}
                      >
                        <View style={styles.searchResultHeader}>
                          <Avatar
                            uri={item.author?.avatarUrl ?? null}
                            name={authorName}
                            size={24}
                            userId={item.authorId}
                          />
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: fontSize.sm,
                              fontWeight: '600',
                              flex: 1,
                            }}
                            numberOfLines={1}
                          >
                            {authorName}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: fontSize.sm,
                            lineHeight: 20,
                            marginTop: spacing.xs,
                          }}
                          numberOfLines={3}
                        >
                          {item.content}
                        </Text>
                      </Pressable>
                    )
                  }}
                />
              )}
            </>
          )}

          {/* Members tab content */}
          {searchTab === 'members' && (
            <FlatList
              data={filteredMembers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: spacing.md }}
              ListEmptyComponent={
                <EmptyState
                  title={t('chat.noMembersFound', '未找到成员')}
                  icon={Users}
                  style={styles.searchEmpty}
                />
              }
              renderItem={({ item }) => {
                const name = item.user.displayName || item.user.username
                return (
                  <Pressable
                    style={[styles.searchMemberRow, { backgroundColor: colors.surface }]}
                    onPress={() => {
                      setSearchTab('messages')
                      setSearchFromUser(item.user.id)
                    }}
                  >
                    <View style={styles.memberAvatarWrap}>
                      <Avatar
                        uri={item.user.avatarUrl}
                        name={name}
                        size={36}
                        userId={item.user.id}
                      />
                      <View style={styles.memberStatusDot}>
                        <StatusBadge status={item.user.status || 'offline'} size={12} />
                      </View>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                        @{item.user.username}
                      </Text>
                    </View>
                    {item.user.isBot && (
                      <View
                        style={[styles.memberRoleBadge, { backgroundColor: `${colors.primary}20` }]}
                      >
                        <Text style={[styles.memberRoleText, { color: colors.primary }]}>
                          Buddy
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )
              }}
            />
          )}
        </BackgroundSurface>
      </Modal>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  threadModal: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Custom header (replaces native header for left-aligned Discord style)
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  headerBackBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 0,
  },
  headerNameRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerChannel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: 22,
    flexShrink: 1,
  },
  headerChevron: {
    opacity: 0.55,
  },
  headerOnlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  headerOnlineText: {
    fontSize: fontSize.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  threadHeaderTitle: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  threadHeaderNameRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  threadHeaderName: {
    flexShrink: 1,
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: 22,
  },
  threadSource: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  threadSourceLabel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    textTransform: 'uppercase',
  },
  threadMessageList: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  threadEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  messageList: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  loadingMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  loadingMoreText: { fontSize: fontSize.xs },
  // System events
  systemEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  systemEventLine: { flex: 1, height: 1 },
  systemEventText: { fontSize: fontSize.xs, fontWeight: '500' },
  // New message divider
  newMessageDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: fontSize.xs, fontWeight: '700' },
  // Date separator
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateText: { fontSize: fontSize.xs, fontWeight: '600' },
  // Scroll to bottom
  scrollBottomFab: {
    position: 'absolute',
    right: spacing.md,
    bottom: 140,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  // Activity
  activityBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  activityText: { fontSize: fontSize.xs },
  activityDots: {
    flexDirection: 'row',
    gap: 3,
    marginLeft: 'auto',
  },
  activityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.7,
  },
  // Typing
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: { width: 4, height: 4, borderRadius: 2 },
  // Pending files
  pendingFilesBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderTopWidth: 1,
  },
  pendingFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    gap: spacing.xs,
    maxWidth: '48%',
  },
  pendingFileName: { fontSize: fontSize.xs, flex: 1 },
  // Reply bar
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  replyBarAccent: { width: 3, height: '100%', borderRadius: 2, minHeight: 32 },
  replyBarContent: { flex: 1 },
  replyBarLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  replyBarPreview: { fontSize: fontSize.xs, marginTop: 1 },
  // @mention autocomplete
  mentionDropdown: {
    borderTopWidth: 1,
    maxHeight: 240,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  suggestionHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  mentionIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    flexShrink: 1,
  },
  mentionUsername: {
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
  slashCommandBody: {
    flex: 1,
    minWidth: 0,
  },
  mentionBotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 120,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  mentionBotText: {
    fontSize: 10,
    fontWeight: '700',
  },
  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  actionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: radius.xl,
    minHeight: 46,
    maxHeight: 120,
    position: 'relative',
  },
  inputMicBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    bottom: 6,
  },
  textInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : spacing.md,
    fontSize: fontSize.md,
    paddingRight: 28,
  },
  // Sheet-style modals
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetDismiss: {
    flex: 1,
  },
  sheetContainer: {
    maxHeight: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    opacity: 0.3,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productPickerState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  productPickerList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  productPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  productPickerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productPickerInfo: { flex: 1, minWidth: 0 },
  productPickerName: { fontSize: fontSize.md, fontWeight: '700' },
  productPickerSummary: { fontSize: fontSize.xs, marginTop: 3, lineHeight: 16 },
  productPickerPrice: { fontSize: fontSize.sm, fontWeight: '800' },
  sheetSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 40,
    gap: spacing.sm,
  },
  sheetList: {
    paddingHorizontal: spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  memberAvatarWrap: {
    position: 'relative',
  },
  memberStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  memberRoleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.md,
  },
  memberRoleText: {
    fontSize: 10,
    fontWeight: '700',
  },
  memberEmpty: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  inviteSearchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: 0,
  },
  inviteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRecordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  voiceRecordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  voiceRecordingLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  voiceTranscript: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  plusPanel: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  plusPanelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  plusPanelItem: {
    alignItems: 'center',
    width: 64,
    gap: spacing.xs,
  },
  plusPanelIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPanelLabel: {
    fontSize: fontSize.xs,
    marginTop: 4,
  },
  accessGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  accessGateIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  accessGateTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  accessGateDesc: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  accessGateButton: {
    marginTop: spacing.xl,
    minWidth: 190,
  },
  accessGateButtonText: {
    color: '#050508',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  selectionToolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  selectionCount: {
    flex: 1,
  },
  // Search panel
  searchPanel: {
    flex: 1,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
  },
  searchTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  searchTabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  searchInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    height: 40,
  },
  searchFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchMemberFilter: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  searchSectionLabel: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  searchEmpty: {
    marginTop: spacing['3xl'],
  },
  searchMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  searchResultCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
