import type {
  BuddyInboxViewMode,
  CommerceProductCard,
  MentionSuggestion,
  MentionSuggestionTrigger,
  MessageMention,
  TaskMessageCardTag,
} from '@shadowob/shared'
import {
  assignMentionRanges,
  buildBuddyInboxViewMessages,
  canonicalMentionToken,
  parseBuddyInboxAgentId,
} from '@shadowob/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronDown,
  ChevronRight,
  Command as CommandIcon,
  Copy,
  File,
  Hash,
  ListTodo,
  Lock,
  MessageSquare,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
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
  MobileBackButton,
  MobileNavigationBar,
  Sheet,
  Spinner,
  ToolbarButton,
} from '../../../../../src/components/ui'
import { VoiceChannelPanel } from '../../../../../src/components/voice/voice-channel-panel'
import { useSocketEvent } from '../../../../../src/hooks/use-socket'
import { useVoiceInput } from '../../../../../src/hooks/use-voice-input'
import { fetchApi } from '../../../../../src/lib/api'
import { selectionHaptic, successHaptic } from '../../../../../src/lib/haptics'
import { setLastChannel } from '../../../../../src/lib/last-channel'
import { animateNextLayout } from '../../../../../src/lib/layout-animation'
import {
  getSocket,
  joinThread,
  leaveChannel,
  leaveThread,
  sendTyping,
  sendWsMessage,
} from '../../../../../src/lib/socket'
import { playReceiveSound, playSendSound } from '../../../../../src/lib/sounds'
import { showToast } from '../../../../../src/lib/toast'
import { useAuthStore } from '../../../../../src/stores/auth.store'
import { useChatStore } from '../../../../../src/stores/chat.store'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../../src/theme'
import type {
  Attachment,
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

type PendingChatFile = {
  uri: string
  name: string
  type: string
  size?: number
  kind?: 'file' | 'image' | 'voice'
  durationMs?: number
  waveformPeaks?: number[]
  waveformVersion?: number
  transcriptText?: string
  transcriptLanguage?: string
  transcriptSource?: 'client' | 'runtime'
}

type TaskDraftPriority = 'low' | 'normal' | 'medium' | 'high'

function taskDraftToInput(value: string) {
  const lines = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  const title = lines[0] ?? ''
  const body = lines.slice(1).join('\n')
  return { title, body }
}

function taskTagsToInput(value: string): TaskMessageCardTag[] | undefined {
  const tags = value
    .split(/[,\n，]/u)
    .map((tag) => tag.trim().replace(/^#+/u, ''))
    .filter(Boolean)
    .slice(0, 6)
    .map((label) => ({ label }))
  return tags.length > 0 ? tags : undefined
}

type MessagesCache = {
  pages: MessagesPage[]
  pageParams: unknown[]
}

function newestMessageTime(page: MessagesPage) {
  let newestMs = Number.NEGATIVE_INFINITY
  for (const message of page.messages) {
    const time = new Date(message.createdAt).getTime()
    if (Number.isFinite(time)) newestMs = Math.max(newestMs, time)
  }
  return newestMs
}

function mergeMessageWindow(
  current: MessagesCache | undefined,
  windowPage: MessagesPage,
): MessagesCache {
  if (!current) return { pages: [windowPage], pageParams: [null] }

  const windowMessageIds = new Set(windowPage.messages.map((message) => message.id))
  const existingPages = current.pages
    .map((page) => ({
      ...page,
      messages: page.messages.filter((message) => !windowMessageIds.has(message.id)),
    }))
    .filter((page) => page.messages.length > 0)
  const pages = [...existingPages, windowPage].sort(
    (left, right) => newestMessageTime(right) - newestMessageTime(left),
  )

  return {
    ...current,
    pages,
    pageParams: pages.map((page, index) =>
      index === 0 ? null : (page.messages[0]?.createdAt ?? null),
    ),
  }
}

const MOBILE_VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  numberOfChannels: 1,
  bitRate: 64_000,
}

function meteringToPeak(metering?: number) {
  if (typeof metering !== 'number' || !Number.isFinite(metering)) return 12
  return Math.max(5, Math.min(100, Math.round(((metering + 60) / 60) * 100)))
}

function normalizeMeteringPeaks(samples: number[], count = 48) {
  if (samples.length === 0) {
    return Array.from({ length: count }, (_, index) =>
      Math.max(10, Math.min(100, Math.round(48 + Math.sin(index * 0.85) * 34))),
    )
  }
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index / count) * samples.length)
    const end = Math.max(start + 1, Math.floor(((index + 1) / count) * samples.length))
    const peak = Math.max(...samples.slice(start, end))
    return Math.max(5, Math.min(100, peak))
  })
}

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
  buddyUserId: string
  buddyUsername: string
  buddyDisplayName?: string | null
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

interface DirectPeer {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status?: string | null
  isBot?: boolean
}

type ChannelWithDirectPeer = Channel & {
  otherUser?: DirectPeer | null
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
  const [typingUsers, setTypingUsers] = useState<{ userId: string; name: string }[]>([])
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([])
  const [activityUsers, setActivityUsers] = useState<
    { userId: string; username: string; activity: string }[]
  >([])
  const [pendingFiles, setPendingFiles] = useState<PendingChatFile[]>([])
  const [selectedCommerceCards, setSelectedCommerceCards] = useState<CommerceProductCard[]>([])
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [taskDraft, setTaskDraft] = useState('')
  const [taskPriority, setTaskPriority] = useState<TaskDraftPriority>('normal')
  const [taskTags, setTaskTags] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [inboxViewMode, setInboxViewMode] = useState<BuddyInboxViewMode>('chat')
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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [searchFromUser, setSearchFromUser] = useState<string | null>(null)
  const [searchHasAttachment, setSearchHasAttachment] = useState(false)
  const [searchTab, setSearchTab] = useState<'messages' | 'members'>('messages')
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [pendingJumpMessageId, setPendingJumpMessageId] = useState<string | null>(null)
  const [isJumpingToMessage, setIsJumpingToMessage] = useState(false)
  const [activeThreadParent, setActiveThreadParent] = useState<Message | null>(null)
  const [threadInputText, setThreadInputText] = useState('')
  const [threadReplyTo, setThreadReplyTo] = useState<Message | null>(null)
  const [threadSending, setThreadSending] = useState(false)
  const [threadPendingFiles, setThreadPendingFiles] = useState<PendingChatFile[]>([])
  const [showThreadEmojiPicker, setShowThreadEmojiPicker] = useState(false)
  const [showThreadPlusMenu, setShowThreadPlusMenu] = useState(false)
  const [isVoiceMessageRecording, setIsVoiceMessageRecording] = useState(false)
  const searchInputRef = useRef<TextInput>(null)
  const inputRef = useRef<TextInput>(null)
  const threadInputRef = useRef<TextInput>(null)
  const threadListRef = useRef<FlatList<Message>>(null)
  const voiceMessagePeaksRef = useRef<number[]>([])
  const voiceMessageStartedAtRef = useRef(0)
  const voiceMessageRecorder = useAudioRecorder(MOBILE_VOICE_RECORDING_OPTIONS)
  const voiceMessageRecorderState = useAudioRecorderState(voiceMessageRecorder, 200)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jumpRequestRef = useRef(0)
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

  const appendCreatedVoiceMessage = useCallback(
    (raw: Record<string, unknown>) => {
      if ((raw.channelId as string) !== channelId) return
      const msg = normalizeMessage(raw)
      queryClient.setQueryData<MessagesCache>(['messages', channelId], (old) => {
        if (!old) return old
        const firstPage = old.pages[0]
        if (!firstPage) return old
        if (firstPage.messages.some((message) => message.id === msg.id)) {
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) => (message.id === msg.id ? msg : message)),
            })),
          }
        }
        const optimisticIndex = firstPage.messages.findIndex(
          (message) => message.id.startsWith('temp-') && message.authorId === msg.authorId,
        )
        if (msg.authorId === currentUser?.id && optimisticIndex >= 0) {
          return {
            ...old,
            pages: [
              {
                ...firstPage,
                messages: firstPage.messages.map((message, index) =>
                  index === optimisticIndex ? msg : message,
                ),
              },
              ...old.pages.slice(1),
            ],
          }
        }
        return {
          ...old,
          pages: [{ ...firstPage, messages: [...firstPage.messages, msg] }, ...old.pages.slice(1)],
        }
      })
      requestAnimationFrame(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
        }, 100)
      })
    },
    [channelId, currentUser?.id, queryClient],
  )

  const sendRecordedVoiceMessage = useCallback(
    async (file: PendingChatFile) => {
      if (sending || !channelId) return
      setSending(true)
      const savedReplyTo = replyTo
      playSendSound()
      try {
        const formData = new FormData()
        formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any)
        formData.append('kind', 'voice')
        if (file.durationMs) formData.append('durationMs', String(file.durationMs))
        if (file.waveformPeaks) formData.append('waveformPeaks', JSON.stringify(file.waveformPeaks))

        const uploaded = await fetchApi<{
          url: string
          size: number
          kind?: 'file' | 'image' | 'voice'
          durationMs?: number
          waveformPeaks?: number[]
        }>('/api/media/upload', {
          method: 'POST',
          body: formData,
          headers: {},
        })

        const created = await fetchApi<Record<string, unknown>>(
          `/api/channels/${channelId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              content: '\u200B',
              replyToId: savedReplyTo?.id,
              attachments: [
                {
                  url: uploaded.url,
                  filename: file.name,
                  contentType: file.type,
                  size: uploaded.size,
                  kind: 'voice',
                  durationMs: file.durationMs ?? uploaded.durationMs,
                  waveformPeaks: file.waveformPeaks ?? uploaded.waveformPeaks,
                  waveformVersion: file.waveformVersion,
                },
              ],
            }),
          },
        )

        appendCreatedVoiceMessage(created)
        setReplyTo(null)
        setTimeout(() => inputRef.current?.focus(), 50)
      } catch (err) {
        Alert.alert(t('common.error'), (err as Error).message || t('chat.sendFailed'))
      } finally {
        setSending(false)
      }
    },
    [appendCreatedVoiceMessage, channelId, replyTo, sending, t],
  )

  const finishVoiceMessageRecording = useCallback(
    async (cancel = false) => {
      if (!isVoiceMessageRecording && !voiceMessageRecorderState.isRecording) return
      try {
        await voiceMessageRecorder.stop()
      } catch {}
      setIsVoiceMessageRecording(false)
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
        () => undefined,
      )
      if (cancel) return

      const status = voiceMessageRecorder.getStatus()
      const uri = voiceMessageRecorder.uri ?? status.url
      const durationMs = Math.max(
        status.durationMillis ?? 0,
        Date.now() - voiceMessageStartedAtRef.current,
      )
      if (!uri) {
        Alert.alert(t('common.error'), t('chat.voiceUnavailable'))
        return
      }
      if (durationMs < 1000) {
        Alert.alert(t('common.error'), t('chat.voiceTooShort'))
        return
      }
      const waveformPeaks = normalizeMeteringPeaks(voiceMessagePeaksRef.current)
      await sendRecordedVoiceMessage({
        uri,
        name: `voice_${Date.now()}.m4a`,
        type: 'audio/mp4',
        kind: 'voice',
        durationMs: Math.min(60_000, durationMs),
        waveformPeaks,
        waveformVersion: 1,
      })
    },
    [
      isVoiceMessageRecording,
      sendRecordedVoiceMessage,
      t,
      voiceMessageRecorder,
      voiceMessageRecorderState.isRecording,
    ],
  )

  const startVoiceMessageRecording = useCallback(async () => {
    if (isVoiceMessageRecording || voiceMessageRecorderState.isRecording) {
      await finishVoiceMessageRecording(false)
      return
    }
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(t('common.error'), t('chat.voicePermissionDenied'))
      return
    }
    try {
      setShowPlusMenu(false)
      Keyboard.dismiss()
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      voiceMessagePeaksRef.current = []
      voiceMessageStartedAtRef.current = Date.now()
      await voiceMessageRecorder.prepareToRecordAsync(MOBILE_VOICE_RECORDING_OPTIONS)
      voiceMessageRecorder.record({ forDuration: 60 })
      setIsVoiceMessageRecording(true)
    } catch {
      setIsVoiceMessageRecording(false)
      Alert.alert(t('common.error'), t('chat.voiceUnavailable'))
    }
  }, [
    finishVoiceMessageRecording,
    isVoiceMessageRecording,
    t,
    voiceMessageRecorder,
    voiceMessageRecorderState.isRecording,
  ])

  useEffect(() => {
    if (!isVoiceMessageRecording) return
    voiceMessagePeaksRef.current.push(meteringToPeak(voiceMessageRecorderState.metering))
  }, [isVoiceMessageRecording, voiceMessageRecorderState.metering])

  useEffect(() => {
    if (!isVoiceMessageRecording) return
    if (voiceMessageRecorderState.durationMillis >= 60_000) {
      void finishVoiceMessageRecording(false)
    }
  }, [
    finishVoiceMessageRecording,
    isVoiceMessageRecording,
    voiceMessageRecorderState.durationMillis,
  ])

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
  const directPeer = isDirectChannel
    ? ((channel as ChannelWithDirectPeer | undefined)?.otherUser ?? null)
    : null
  const directPeerName = directPeer?.displayName ?? directPeer?.username ?? channel?.name ?? '...'
  const isInboxChannel = channel?.topic?.startsWith('shadow:buddy-inbox:') ?? false
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
      status?: string | null
      isBot?: boolean
    }
    agent?: {
      id: string
    } | null
    role: string
  }

  const inboxAgentId = isInboxChannel ? parseBuddyInboxAgentId(channel?.topic) : null
  const { data: inboxServerMembers = [] } = useQuery({
    queryKey: ['server-members-for-inbox-buddy', channel?.serverId, inboxAgentId],
    queryFn: () => fetchApi<ServerMemberEntry[]>(`/api/servers/${channel!.serverId}/members`),
    enabled: Boolean(channel?.serverId && isInboxChannel && inboxAgentId),
    staleTime: 30_000,
  })

  const inboxBuddyMember = useMemo(
    () => inboxServerMembers.find((member) => member.agent?.id === inboxAgentId) ?? null,
    [inboxAgentId, inboxServerMembers],
  )
  const inboxBuddy = inboxBuddyMember?.user ?? null
  const inboxBuddyName = inboxBuddy?.displayName ?? inboxBuddy?.username ?? channel?.name ?? '...'
  const inboxBuddyBusy = Boolean(
    inboxBuddy?.id &&
      (typingUsers.some((user) => user.userId === inboxBuddy.id) ||
        activityUsers.some((user) => user.userId === inboxBuddy.id)),
  )

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

  const openDirectMessage = useCallback(
    async (userId: string) => {
      if (currentUser?.id === userId) {
        router.push(`/(main)/profile/${userId}` as never)
        return
      }
      try {
        const direct = await fetchApi<{ id: string }>('/api/channels/dm', {
          method: 'POST',
          body: JSON.stringify({ userId }),
        })
        queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
        setShowMemberList(false)
        router.push(`/(main)/dm/${direct.id}` as never)
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.error'), 'error')
      }
    },
    [currentUser?.id, queryClient, router, t],
  )

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

  const latestThreadMessageId = useMemo(() => {
    const latest = threadMessages.at(-1)
    return latest?.id ?? null
  }, [threadMessages])

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
          command.buddyUsername,
          command.buddyDisplayName ?? '',
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

  // ---------- Search ----------
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim())
    }, 250)
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
      debouncedSearchQuery,
      searchFromUser,
      searchHasAttachment,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        query: debouncedSearchQuery,
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
      debouncedSearchQuery.length >= 2,
    placeholderData: (previous) => previous,
    staleTime: 10_000,
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

  const renderHighlightedSearchText = useCallback(
    (content: string) => {
      const source = content.trim() || t('chat.searchAttachmentOnly')
      const query = debouncedSearchQuery.trim()
      if (query.length === 0) return source

      const lowerSource = source.toLocaleLowerCase()
      const lowerQuery = query.toLocaleLowerCase()
      const parts: Array<{ text: string; match: boolean }> = []
      let cursor = 0
      while (cursor < source.length) {
        const matchIndex = lowerSource.indexOf(lowerQuery, cursor)
        if (matchIndex < 0) {
          parts.push({ text: source.slice(cursor), match: false })
          break
        }
        if (matchIndex > cursor) {
          parts.push({ text: source.slice(cursor, matchIndex), match: false })
        }
        const matchEnd = matchIndex + query.length
        parts.push({ text: source.slice(matchIndex, matchEnd), match: true })
        cursor = matchEnd
      }

      return parts.map((part, index) =>
        part.match ? (
          <Text key={`${part.text}-${index}`} style={{ color: colors.primary, fontWeight: '800' }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )
    },
    [colors.primary, debouncedSearchQuery, t],
  )

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

  const latestMessageId = useMemo(() => {
    let latest: Message | null = null
    for (const message of messages) {
      if (!latest || new Date(message.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
        latest = message
      }
    }
    return latest?.id ?? null
  }, [messages])

  const timelineBaseMessages = useMemo(() => {
    return buildBuddyInboxViewMessages(messages, {
      isInboxChannel,
    })
  }, [isInboxChannel, messages])

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
    const items: TimelineItem[] = timelineBaseMessages.map((m) => ({
      kind: 'message' as const,
      data: m,
    }))

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
  }, [systemEvents, timelineBaseMessages])

  const scrollLoadedMessageIntoView = useCallback(
    (messageId: string) => {
      const idx = timeline.findIndex(
        (item) => item.kind === 'message' && item.data.id === messageId,
      )
      if (idx < 0) return false

      setHighlightMessageId(messageId)
      setPendingJumpMessageId(null)
      setIsJumpingToMessage(false)
      setShowSearchPanel(false)
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 })
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightMessageId(null)
        highlightTimeoutRef.current = null
      }, 3000)
      return true
    },
    [timeline],
  )

  const loadMessageWindowAround = useCallback(
    async (messageId: string) => {
      if (!channelId) return false
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      const result = await fetchApi<MessagesPage | Message[]>(
        `/api/channels/${channelId}/messages/around/${messageId}?${params}`,
      )
      const windowPage = Array.isArray(result)
        ? {
            messages: result.map((message) =>
              normalizeMessage(message as unknown as Record<string, unknown>),
            ),
            hasMore: false,
          }
        : {
            messages: result.messages.map((message) =>
              normalizeMessage(message as unknown as Record<string, unknown>),
            ),
            hasMore: result.hasMore,
          }

      if (!windowPage.messages.some((message) => message.id === messageId)) return false

      queryClient.setQueryData<MessagesCache>(['messages', channelId], (current) =>
        mergeMessageWindow(current, windowPage),
      )
      return true
    },
    [channelId, queryClient],
  )

  // Scroll to a message, loading a focused message window first when it is outside the current view.
  const scrollToMessage = useCallback(
    (messageId: string) => {
      if (scrollLoadedMessageIntoView(messageId)) return

      jumpRequestRef.current += 1
      const requestId = jumpRequestRef.current
      setIsJumpingToMessage(true)
      void loadMessageWindowAround(messageId)
        .then((loadedWindow) => {
          if (requestId !== jumpRequestRef.current) return
          if (loadedWindow) {
            setPendingJumpMessageId(messageId)
            return
          }

          if (hasNextPage && !isFetchingNextPage) {
            setPendingJumpMessageId(messageId)
            void fetchNextPage()
            return
          }

          setPendingJumpMessageId(null)
          setIsJumpingToMessage(false)
          showToast(t('chat.searchResultNotLoaded'), 'info')
        })
        .catch(() => {
          if (requestId !== jumpRequestRef.current) return
          if (hasNextPage && !isFetchingNextPage) {
            setPendingJumpMessageId(messageId)
            void fetchNextPage()
            return
          }

          setPendingJumpMessageId(null)
          setIsJumpingToMessage(false)
          showToast(t('chat.searchResultNotLoaded'), 'info')
        })
    },
    [
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      loadMessageWindowAround,
      scrollLoadedMessageIntoView,
      t,
    ],
  )

  useEffect(() => {
    if (!pendingJumpMessageId) return
    if (scrollLoadedMessageIntoView(pendingJumpMessageId)) return

    if (hasNextPage && !isFetchingNextPage) {
      const timer = setTimeout(() => {
        void fetchNextPage()
      }, 80)
      return () => clearTimeout(timer)
    }

    if (!hasNextPage && !isFetchingNextPage) {
      setPendingJumpMessageId(null)
      setIsJumpingToMessage(false)
      showToast(t('chat.searchResultNotLoaded'), 'info')
    }
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    pendingJumpMessageId,
    scrollLoadedMessageIntoView,
    t,
  ])

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
    jumpRequestRef.current += 1
    setPendingJumpMessageId(null)
    setIsJumpingToMessage(false)
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

      let cacheUpdated = false
      queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
        if (!old) return old
        const firstPage = old.pages[0]
        if (!firstPage) return old
        cacheUpdated = true
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
      if (!cacheUpdated) {
        queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
      }
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
    'voice:playback-updated',
    useCallback(
      (event: {
        attachmentId: string
        messageId: string
        played: boolean
        completed: boolean
        lastPositionMs: number
      }) => {
        const updateMessage = (message: Message) =>
          message.id === event.messageId
            ? {
                ...message,
                attachments: message.attachments?.map((attachment) =>
                  attachment.id === event.attachmentId
                    ? {
                        ...attachment,
                        playback: {
                          ...(attachment.playback ?? {}),
                          played: event.played,
                          completed: event.completed,
                          lastPositionMs: event.lastPositionMs,
                        },
                      }
                    : attachment,
                ),
              }
            : message
        if (activeThreadId) {
          queryClient.setQueryData<Message[]>(['thread-messages', activeThreadId], (old) =>
            (old ?? []).map(updateMessage),
          )
        }
        queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map(updateMessage),
            })),
          }
        })
      },
      [activeThreadId, channelId, queryClient],
    ),
  )

  useSocketEvent(
    'voice:transcript-updated',
    useCallback(
      (event: {
        attachmentId: string
        messageId: string
        transcript: Attachment['transcript']
      }) => {
        const updateMessage = (message: Message) =>
          message.id === event.messageId
            ? {
                ...message,
                attachments: message.attachments?.map((attachment) =>
                  attachment.id === event.attachmentId
                    ? { ...attachment, transcript: event.transcript }
                    : attachment,
                ),
              }
            : message
        if (activeThreadId) {
          queryClient.setQueryData<Message[]>(['thread-messages', activeThreadId], (old) =>
            (old ?? []).map(updateMessage),
          )
        }
        queryClient.setQueryData<InfiniteData>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map(updateMessage),
            })),
          }
        })
      },
      [activeThreadId, channelId, queryClient],
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
        displayName,
        typing,
      }: {
        channelId: string
        userId: string
        username?: string
        displayName?: string | null
        typing?: boolean
      }) => {
        if (typingChannelId !== channelId || !userId) return
        if (userId === currentUser?.id) return
        const name = displayName?.trim() || username?.trim() || userId
        if (typingUsersTimeout.current[userId]) clearTimeout(typingUsersTimeout.current[userId])
        if (typing === false) {
          delete typingUsersTimeout.current[userId]
          setTypingUsers((prev) => prev.filter((item) => item.userId !== userId))
          return
        }
        setTypingUsers((prev) => {
          const existing = prev.find((item) => item.userId === userId)
          if (existing) {
            return prev.map((item) => (item.userId === userId ? { ...item, name } : item))
          }
          return [...prev, { userId, name }]
        })
        typingUsersTimeout.current[userId] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((item) => item.userId !== userId))
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
        | Array<{
            url: string
            filename: string
            contentType: string
            size: number
            kind?: 'file' | 'image' | 'voice'
            durationMs?: number
            waveformPeaks?: number[]
            waveformVersion?: number
            transcriptText?: string
            transcriptLanguage?: string
            transcriptSource?: 'client' | 'runtime'
          }>
        | undefined
      if (savedPendingFiles.length > 0) {
        uploadedAttachments = []
        for (const file of savedPendingFiles) {
          const formData = new FormData()
          formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any)
          if (file.kind) formData.append('kind', file.kind)
          if (file.durationMs) formData.append('durationMs', String(file.durationMs))
          if (file.waveformPeaks)
            formData.append('waveformPeaks', JSON.stringify(file.waveformPeaks))
          if (file.transcriptText) formData.append('transcriptText', file.transcriptText)
          if (file.transcriptLanguage)
            formData.append('transcriptLanguage', file.transcriptLanguage)
          if (file.transcriptSource) formData.append('transcriptSource', file.transcriptSource)
          const uploaded = await fetchApi<{
            url: string
            size: number
            kind?: 'file' | 'image' | 'voice'
            durationMs?: number
            waveformPeaks?: number[]
          }>('/api/media/upload', {
            method: 'POST',
            body: formData,
            headers: {},
          })
          uploadedAttachments.push({
            url: uploaded.url,
            filename: file.name,
            contentType: file.type,
            size: uploaded.size,
            kind: file.kind ?? uploaded.kind,
            durationMs: file.durationMs ?? uploaded.durationMs,
            waveformPeaks: file.waveformPeaks ?? uploaded.waveformPeaks,
            waveformVersion: file.waveformVersion,
            transcriptText: file.transcriptText,
            transcriptLanguage: file.transcriptLanguage,
            transcriptSource: file.transcriptSource,
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

  const createTaskCard = useCallback(async () => {
    if (!channelId || creatingTask) return
    const input = taskDraftToInput(taskDraft)
    if (!input.title) return
    setCreatingTask(true)
    try {
      const tags = taskTagsToInput(taskTags)
      await fetchApi(`/api/channels/${channelId}/inbox/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          ...(input.body ? { body: input.body } : {}),
          priority: taskPriority,
          ...(tags ? { tags } : {}),
        }),
      })
      setTaskDraft('')
      setTaskPriority('normal')
      setTaskTags('')
      setInputText('')
      clearDraft()
      successHaptic()
      queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
    } catch (error) {
      Alert.alert(
        t('inbox.task.createFailed'),
        error instanceof Error ? error.message : t('common.error'),
      )
    } finally {
      setCreatingTask(false)
    }
  }, [channelId, clearDraft, creatingTask, queryClient, t, taskDraft, taskPriority, taskTags])

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
        kind?: 'file' | 'image' | 'voice'
        durationMs?: number
        waveformPeaks?: number[]
        waveformVersion?: number
        transcriptText?: string
        transcriptLanguage?: string
        transcriptSource?: 'client' | 'runtime'
      }> = []
      for (const file of savedFiles) {
        const formData = new FormData()
        formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any)
        if (file.kind) formData.append('kind', file.kind)
        if (file.durationMs) formData.append('durationMs', String(file.durationMs))
        if (file.waveformPeaks) formData.append('waveformPeaks', JSON.stringify(file.waveformPeaks))
        if (file.transcriptText) formData.append('transcriptText', file.transcriptText)
        if (file.transcriptLanguage) formData.append('transcriptLanguage', file.transcriptLanguage)
        if (file.transcriptSource) formData.append('transcriptSource', file.transcriptSource)
        const uploaded = await fetchApi<{
          url: string
          size: number
          kind?: 'file' | 'image' | 'voice'
          durationMs?: number
          waveformPeaks?: number[]
        }>('/api/media/upload', {
          method: 'POST',
          body: formData,
          headers: {},
        })
        uploadedAttachments.push({
          url: uploaded.url,
          filename: file.name,
          contentType: file.type,
          size: uploaded.size,
          kind: file.kind ?? uploaded.kind,
          durationMs: file.durationMs ?? uploaded.durationMs,
          waveformPeaks: file.waveformPeaks ?? uploaded.waveformPeaks,
          waveformVersion: file.waveformVersion,
          transcriptText: file.transcriptText,
          transcriptLanguage: file.transcriptLanguage,
          transcriptSource: file.transcriptSource,
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
      if (activity === 'approval' || activity === 'waiting_for_approval') {
        return t('member.activityApproval')
      }
      if (activity === 'tool_call') return t('member.activityWorking')
      return activity
    },
    [t],
  )

  const workIndicatorItems = useMemo(
    () => [
      ...(isJumpingToMessage
        ? [
            {
              id: 'jumping-message',
              label: t('chat.loadingOlder'),
              tone: 'muted' as const,
            },
          ]
        : []),
      ...activityUsers.map((u) => ({
        id: `activity-${u.userId}`,
        label: `${u.username} ${formatActivityLabel(u.activity)}`,
        tone: 'primary' as const,
      })),
      ...typingUsers.map((u) => ({
        id: `typing-${u.userId}`,
        label: `${u.name} ${t('chat.isTyping')}`,
      })),
    ],
    [activityUsers, formatActivityLabel, isJumpingToMessage, t, typingUsers],
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
      selectionHaptic()
      animateNextLayout()

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
      selectionHaptic()
      animateNextLayout()

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
    selectionHaptic()
    animateNextLayout()
    setReplyTo(msg)
  }, [])

  const handleToggleSelect = useCallback((messageId: string) => {
    selectionHaptic()
    setSelectedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }, [])

  const handleEnterSelectionMode = useCallback((messageId: string) => {
    selectionHaptic()
    animateNextLayout()
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
      selectionHaptic()
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
    successHaptic()
    animateNextLayout()
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
          style={[
            styles.messageTimelineItem,
            isGrouped ? styles.messageTimelineItemGrouped : styles.messageTimelineItemStandalone,
            highlightMessageId === item.data.id
              ? { backgroundColor: colors.surfaceHover }
              : undefined,
          ]}
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
            enableSlashCommandActions={item.data.id === latestMessageId}
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
      latestMessageId,
      isInboxChannel,
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
        <View
          style={[
            styles.threadTimelineItem,
            isGrouped ? styles.threadTimelineItemGrouped : styles.threadTimelineItemStandalone,
          ]}
        >
          <MessageBubble
            message={item}
            onReply={() => setThreadReplyTo(item)}
            onRetry={handleThreadRetry}
            channelId={item.channelId}
            serverSlug={serverSlug}
            allMessages={threadMessagesWithParent}
            isGrouped={isGrouped}
            enableSlashCommandActions={item.id === latestThreadMessageId}
          />
        </View>
      )
    },
    [
      handleThreadRetry,
      latestThreadMessageId,
      serverSlug,
      threadMessages,
      threadMessagesWithParent,
    ],
  )

  const getItemKey = useCallback((item: TimelineItem) => {
    return item.data.id
  }, [])

  const getMessageKey = useCallback((item: Message) => item.id, [])
  const canCreateTask = Boolean(taskDraftToInput(taskDraft).title) && !creatingTask
  const channelNavTitle =
    isInboxChannel && inboxBuddy ? (
      <Pressable
        style={styles.channelNavTitle}
        onPress={() => {
          selectionHaptic()
          router.push(`/(main)/profile/${inboxBuddy.id}` as never)
        }}
      >
        <Avatar
          uri={inboxBuddy.avatarUrl}
          name={inboxBuddyName}
          userId={inboxBuddy.id}
          size={size.sectionCompactIcon}
          showStatus
          status={inboxBuddyBusy ? 'busy' : inboxBuddy.status}
        />
        <Text style={[styles.channelNavTitleText, { color: colors.text }]} numberOfLines={1}>
          {inboxBuddyName}
        </Text>
      </Pressable>
    ) : directPeer ? (
      <Pressable
        style={styles.channelNavTitle}
        onPress={() => {
          selectionHaptic()
          router.push(`/(main)/profile/${directPeer.id}` as never)
        }}
      >
        <Avatar
          uri={directPeer.avatarUrl}
          name={directPeerName}
          userId={directPeer.id}
          size={size.sectionCompactIcon}
          showStatus
          status={directPeer.status ?? 'offline'}
        />
        <Text style={[styles.channelNavTitleText, { color: colors.text }]} numberOfLines={1}>
          {directPeerName}
        </Text>
      </Pressable>
    ) : (
      `# ${channel?.name ?? '...'}`
    )

  if (access && !access.canAccess) {
    const gateChannel = access.channel ?? channel
    const isPending = access.joinRequestStatus === 'pending' || requestAccessMutation.isSuccess
    return (
      <BackgroundSurface style={styles.container}>
        <MobileNavigationBar
          title={`# ${gateChannel?.name ?? t('channel.privateChannel')}`}
          left={<MobileBackButton onPress={() => router.back()} />}
        />
        <GlassPanel style={styles.accessGate}>
          <View style={[styles.accessGateIcon, { backgroundColor: colors.inputBackground }]}>
            <Lock size={iconSize['5xl']} color={colors.primary} />
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
            onPress={() => {
              selectionHaptic()
              requestAccessMutation.mutate()
            }}
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
      <MobileNavigationBar
        title={channelNavTitle}
        left={<MobileBackButton onPress={() => router.back()} />}
        right={
          <>
            {!isInboxChannel && (
              <ToolbarButton
                icon={Users}
                iconColor={colors.textMuted}
                onPress={() => {
                  selectionHaptic()
                  setShowMemberList(true)
                }}
                variant="ghost"
              />
            )}
            <ToolbarButton
              icon={Search}
              iconColor={colors.textMuted}
              onPress={() => {
                selectionHaptic()
                animateNextLayout()
                setShowSearchPanel(true)
                setTimeout(() => searchInputRef.current?.focus(), 300)
              }}
              variant="ghost"
            />
          </>
        }
      />

      {isLoading ? (
        <View style={styles.loading}>
          <Spinner />
        </View>
      ) : timeline.length === 0 ? (
        <Pressable style={styles.emptyState} onPress={Keyboard.dismiss}>
          <EmptyState
            icon={isInboxChannel ? ListTodo : Hash}
            title={
              isInboxChannel
                ? t('inbox.empty.allTitle')
                : t('chat.welcomeChannel', {
                    channelName: channel?.name ?? t('chat.channelFallback'),
                  })
            }
            description={isInboxChannel ? t('inbox.empty.allHint') : t('chat.welcomeStart')}
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
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            const offset = Math.max(0, index * Math.max(averageItemLength, size.listItemLg))
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({ offset, animated: true })
            }, 80)
          }}
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
          onPress={() => {
            selectionHaptic()
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
          }}
        />
      )}

      {/* Activity / typing indicator */}
      {workIndicatorItems.length > 0 && (
        <View style={styles.activityBar}>
          <ChatWorkIndicator items={workIndicatorItems} />
        </View>
      )}

      {/* Typing indicator */}

      {/* Slash command autocomplete dropdown */}
      {filteredSlashCommands.length > 0 && slashQuery !== null && (
        <View
          style={[
            styles.mentionDropdown,
            { backgroundColor: colors.frostedPanelStrong, borderColor: colors.frostedBorder },
          ]}
        >
          <View style={styles.suggestionHeader}>
            <CommandIcon size={iconSize.sm} color={colors.primary} />
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
              <View style={[styles.mentionIcon, { backgroundColor: colors.inputBackground }]}>
                <CommandIcon size={iconSize.md} color={colors.primary} />
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
              <View style={[styles.mentionBotBadge, { backgroundColor: colors.inputBackground }]}>
                <Sparkles size={iconSize.xs} color={colors.primary} />
                <Text style={[styles.mentionBotText, { color: colors.primary }]} numberOfLines={1}>
                  {command.buddyDisplayName ?? command.buddyUsername}
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
            { backgroundColor: colors.frostedPanelStrong, borderColor: colors.frostedBorder },
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
                  size={iconSize['3xl']}
                  userId={m.userId}
                />
              ) : (
                <View style={[styles.mentionIcon, { backgroundColor: colors.inputBackground }]}>
                  {m.kind === 'channel' ? (
                    <Hash size={iconSize.md} color={colors.primary} />
                  ) : (
                    <Users size={iconSize.md} color={colors.primary} />
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
                <View style={[styles.mentionBotBadge, { backgroundColor: colors.inputBackground }]}>
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
          <Button
            variant="glass"
            size="sm"
            onPress={() => {
              selectionHaptic()
              animateNextLayout()
              handleExitSelectionMode()
            }}
          >
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
          typingUsers={[]}
          isRecording={isRecording}
          isHolding={isHolding}
          isVoiceMessageRecording={isVoiceMessageRecording}
          voiceMessageRecordingMs={voiceMessageRecorderState.durationMillis}
          keyboardVisible={keyboardVisible}
          insetsBottom={insets.bottom}
          canUseVoice={speechSupported}
          onVoicePressIn={onVoicePressIn}
          onVoicePressOut={onVoicePressOut}
          onStartVoiceMessageRecording={startVoiceMessageRecording}
          onFinishVoiceMessageRecording={finishVoiceMessageRecording}
          showAtButton
          onPressAt={() => {
            setInputText((prev) => `${prev}@`)
            setMentionTrigger('@')
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
          enableTaskCards={isInboxChannel}
          inboxViewMode={inboxViewMode}
          onInboxViewModeChange={setInboxViewMode}
          taskDraft={taskDraft}
          onTaskDraftChange={setTaskDraft}
          taskPriority={taskPriority}
          onTaskPriorityChange={setTaskPriority}
          taskTags={taskTags}
          onTaskTagsChange={setTaskTags}
          creatingTask={creatingTask}
          canCreateTask={canCreateTask}
          onCreateTask={() => void createTaskCard()}
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
          <MobileNavigationBar
            title={activeThread?.name ?? t('chat.thread')}
            left={
              <MobileBackButton
                onPress={() => {
                  setActiveThread(null)
                  setActiveThreadParent(null)
                  setThreadReplyTo(null)
                }}
              />
            }
          />

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
              <MessageSquare size={iconSize['4xl']} color={colors.primary} />
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
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: colors.frostedPanelStrong,
                borderTopColor: colors.frostedBorder,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {t('member.title')} ({channelMembers.length})
              </Text>
              <View style={styles.sheetHeaderActions}>
                {serverSlug && (
                  <Pressable
                    onPress={() => {
                      selectionHaptic()
                      Keyboard.dismiss()
                      setShowMemberList(false)
                      router.push(
                        `/(main)/servers/${serverSlug}/channel-members?channelId=${channelId}&autoInvite=1` as never,
                      )
                    }}
                    hitSlop={spacing.sm}
                    style={[styles.sheetActionBtn, { backgroundColor: colors.inputBackground }]}
                  >
                    <UserPlus size={iconSize.md} color={colors.primary} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    selectionHaptic()
                    setShowMemberList(false)
                  }}
                  hitSlop={spacing.sm}
                  style={[styles.sheetActionBtn, { backgroundColor: colors.inputBackground }]}
                >
                  <X size={iconSize.md} color={colors.textSecondary} />
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
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.memberRow,
                      {
                        backgroundColor: colors.frostedPanel,
                      },
                      pressed && { backgroundColor: colors.surfaceHover },
                    ]}
                    onPress={() => {
                      void openDirectMessage(item.user.id)
                    }}
                  >
                    <Avatar
                      uri={item.user.avatarUrl}
                      name={name}
                      size={iconSize['6xl']}
                      userId={item.user.id}
                      status={item.user.status || 'offline'}
                      showStatus
                    />
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                    </View>
                    <ChevronRight size={iconSize.md} color={colors.textMuted} />
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
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: colors.frostedPanelStrong,
                borderTopColor: colors.frostedBorder,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {t('member.inviteMembers')}
              </Text>
              <Pressable
                onPress={() => {
                  selectionHaptic()
                  setShowInvitePanel(false)
                }}
                hitSlop={spacing.sm}
                style={[styles.sheetActionBtn, { backgroundColor: colors.inputBackground }]}
              >
                <X size={iconSize.md} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.sheetSearchWrap, { backgroundColor: colors.inputBackground }]}>
              <Search size={iconSize.md} color={colors.textMuted} />
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
                    <Avatar
                      uri={item.user.avatarUrl}
                      name={name}
                      size={iconSize['6xl']}
                      userId={item.user.id}
                    />
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
                        style={[
                          styles.memberRoleBadge,
                          { backgroundColor: colors.inputBackground },
                        ]}
                      >
                        <Text style={[styles.memberRoleText, { color: colors.primary }]}>
                          Buddy
                        </Text>
                      </View>
                    )}
                    <Pressable
                      style={[styles.inviteBtn, { backgroundColor: colors.inputBackground }]}
                      onPress={() => inviteMemberMutation.mutate(item.user.id)}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <UserPlus size={iconSize.md} color={colors.primary} />
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
              <Search size={iconSize.lg} color={colors.textMuted} />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: colors.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={
                  searchTab === 'messages'
                    ? t('chat.searchPlaceholder')
                    : t('chat.searchMemberPlaceholder')
                }
                placeholderTextColor={colors.textMuted}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => {
                    selectionHaptic()
                    setSearchQuery('')
                  }}
                  hitSlop={spacing.sm}
                >
                  <X size={iconSize.md} color={colors.textMuted} />
                </Pressable>
              )}
            </InputValley>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                selectionHaptic()
                animateNextLayout()
                setShowSearchPanel(false)
              }}
              hitSlop={spacing.sm}
            >
              {t('common.cancel')}
            </Button>
          </GlassHeader>

          {/* Tab bar */}
          <View style={[styles.searchTabBar, { borderBottomColor: colors.border }]}>
            <Pressable
              style={[
                styles.searchTab,
                searchTab === 'messages' && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: border.active,
                },
              ]}
              onPress={() => {
                selectionHaptic()
                animateNextLayout()
                setSearchTab('messages')
              }}
            >
              <MessageSquare
                size={iconSize.sm}
                color={searchTab === 'messages' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.searchTabText,
                  { color: searchTab === 'messages' ? colors.primary : colors.textMuted },
                ]}
              >
                {t('chat.tabMessages')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.searchTab,
                searchTab === 'members' && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: border.active,
                },
              ]}
              onPress={() => {
                selectionHaptic()
                animateNextLayout()
                setSearchTab('members')
              }}
            >
              <Users
                size={iconSize.sm}
                color={searchTab === 'members' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.searchTabText,
                  { color: searchTab === 'members' ? colors.primary : colors.textMuted },
                ]}
              >
                {t('chat.tabMembers')}
              </Text>
            </Pressable>
          </View>

          {/* Messages tab content */}
          {searchTab === 'messages' && (
            <>
              {/* Filter chips */}
              <View style={styles.searchFilters}>
                <ChipButton
                  label={t('chat.hasFile')}
                  icon={File}
                  active={searchHasAttachment}
                  onPress={() => {
                    selectionHaptic()
                    setSearchHasAttachment(!searchHasAttachment)
                  }}
                />
                {searchFromUser && (
                  <ChipButton
                    active
                    iconRight={X}
                    label={`${t('chat.fromUser')}: ${
                      channelMembers.find((m) => m.user.id === searchFromUser)?.user.displayName ??
                      '...'
                    }`}
                    onPress={() => {
                      selectionHaptic()
                      setSearchFromUser(null)
                    }}
                  />
                )}
              </View>

              {/* Member filter list (when no query) */}
              {searchQuery.trim().length < 2 && !searchFromUser && (
                <View style={styles.searchMemberFilter}>
                  <AppText variant="label" tone="secondary" style={styles.searchSectionLabel}>
                    {t('chat.filterByMember')}
                  </AppText>
                  {channelMembers.slice(0, 10).map((m) => (
                    <MenuItem
                      key={m.user.id}
                      title={m.user.displayName || m.user.username}
                      onPress={() => {
                        selectionHaptic()
                        setSearchFromUser(m.user.id)
                      }}
                      right={
                        <Avatar
                          uri={m.user.avatarUrl}
                          name={m.user.displayName || m.user.username}
                          size={iconSize['4xl']}
                          userId={m.user.id}
                        />
                      }
                    />
                  ))}
                </View>
              )}

              {/* Search results */}
              {searchQuery.trim().length >= 2 && (
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ padding: spacing.md }}
                  ListHeaderComponent={
                    searchResults.length > 0 ? (
                      <AppText variant="label" tone="secondary" style={styles.searchSectionLabel}>
                        {t('chat.searchResultCount', { count: searchResults.length })}
                      </AppText>
                    ) : null
                  }
                  ListEmptyComponent={
                    isSearching ? (
                      <ActivityIndicator
                        color={colors.primary}
                        style={{ marginTop: spacing['3xl'] }}
                      />
                    ) : (
                      <EmptyState
                        title={t('chat.noSearchResults')}
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
                        style={[
                          styles.searchResultCard,
                          {
                            backgroundColor: colors.frostedPanel,
                            borderColor: colors.frostedBorder,
                          },
                        ]}
                        onPress={() => {
                          selectionHaptic()
                          animateNextLayout()
                          scrollToMessage(item.id)
                        }}
                      >
                        <View style={styles.searchResultHeader}>
                          <Avatar
                            uri={item.author?.avatarUrl ?? null}
                            name={authorName}
                            size={iconSize['3xl']}
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
                            lineHeight: lineHeight.sm,
                            marginTop: spacing.xs,
                          }}
                          numberOfLines={3}
                        >
                          {renderHighlightedSearchText(item.content)}
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
                  title={t('chat.noMembersFound')}
                  icon={Users}
                  style={styles.searchEmpty}
                />
              }
              renderItem={({ item }) => {
                const name = item.user.displayName || item.user.username
                return (
                  <Pressable
                    style={[
                      styles.searchMemberRow,
                      {
                        backgroundColor: colors.frostedPanel,
                        borderColor: colors.frostedBorder,
                      },
                    ]}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      setSearchTab('messages')
                      setSearchFromUser(item.user.id)
                    }}
                  >
                    <Avatar
                      uri={item.user.avatarUrl}
                      name={name}
                      size={size.iconButtonMd}
                      userId={item.user.id}
                      status={item.user.status || 'offline'}
                      showStatus
                    />
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
                        style={[
                          styles.memberRoleBadge,
                          { backgroundColor: colors.inputBackground },
                        ]}
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
  channelNavTitle: {
    minWidth: 0,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  channelNavTitleText: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  threadTimelineItem: {
    paddingHorizontal: spacing.xs,
  },
  threadTimelineItemStandalone: {
    marginVertical: spacing.xs,
  },
  threadTimelineItemGrouped: {
    marginVertical: spacing.px,
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
    width: size.avatarXl,
    height: size.avatarXl,
    borderRadius: radius['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: lineHeight.sm },
  messageList: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  messageTimelineItem: {
    paddingHorizontal: spacing.xs,
  },
  messageTimelineItemStandalone: {
    marginVertical: spacing.xs,
  },
  messageTimelineItemGrouped: {
    marginVertical: spacing.px,
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  systemEventLine: { flex: 1, height: border.hairline },
  systemEventText: { fontSize: fontSize.xs, fontWeight: '500' },
  // New message divider
  newMessageDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  dividerLine: { flex: 1, height: border.hairline },
  dividerText: { fontSize: fontSize.xs, fontWeight: '700' },
  // Date separator
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  dateLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateText: { fontSize: fontSize.xs, fontWeight: '600' },
  // Scroll to bottom
  scrollBottomFab: {
    position: 'absolute',
    right: spacing.md,
    bottom: size.controlLg + spacing['4xl'],
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.hairline,
  },
  // Activity
  activityBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pulseDot: { width: size.dotMd, height: size.dotMd, borderRadius: radius.sm },
  activityText: { fontSize: fontSize.xs },
  activityDots: {
    flexDirection: 'row',
    gap: spacing.xxs,
    marginLeft: 'auto',
  },
  activityDot: {
    width: size.dotXs,
    height: size.dotXs,
    borderRadius: radius.xs,
  },
  // Typing
  typingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  typingDots: { flexDirection: 'row', gap: spacing.xxs },
  typingDot: { width: size.dotXs, height: size.dotXs, borderRadius: radius.xs },
  // Pending files
  pendingFilesBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderTopWidth: border.hairline,
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
    borderTopWidth: border.hairline,
    gap: spacing.sm,
  },
  replyBarAccent: {
    width: size.dividerAccent,
    height: '100%',
    borderRadius: radius.xs,
    minHeight: size.iconButtonSm,
  },
  replyBarContent: { flex: 1 },
  replyBarLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  replyBarPreview: { fontSize: fontSize.xs, marginTop: spacing.px },
  // @mention autocomplete
  mentionDropdown: {
    borderTopWidth: border.hairline,
    maxHeight: size.dropdownMaxHeight,
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
    width: size.avatarXs,
    height: size.avatarXs,
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
    gap: spacing.xxs,
    maxWidth: size.pillMaxWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.px,
    borderRadius: radius.sm,
  },
  mentionBotText: {
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: border.hairline,
  },
  actionBtn: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.none,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: radius.xl,
    minHeight: size.controlLg,
    maxHeight: size.controlLg * 2 + spacing['2xl'],
    position: 'relative',
  },
  inputMicBtn: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.tight,
  },
  textInput: {
    flex: 1,
    minHeight: size.controlLg,
    maxHeight: size.controlLg * 2 + spacing['2xl'],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    paddingRight: spacing['3xl'],
  },
  // Sheet-style modals
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: palette.blackOverlay,
  },
  sheetDismiss: {
    flex: 1,
  },
  sheetContainer: {
    maxHeight: '75%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: border.hairline,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    width: size.iconButtonMd,
    height: size.dotXs,
    borderRadius: radius.xs,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
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
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  productPickerState: {
    minHeight: size.panelStateMinHeight,
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
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  productPickerInfo: { flex: 1, minWidth: 0 },
  productPickerName: { fontSize: fontSize.md, fontWeight: '700' },
  productPickerSummary: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
    lineHeight: lineHeight.xs,
  },
  productPickerPrice: { fontSize: fontSize.sm, fontWeight: '800' },
  sheetSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: size.iconButtonLg,
    gap: spacing.sm,
  },
  sheetList: {
    paddingHorizontal: spacing.sm,
  },
  memberRow: {
    minHeight: size.listItemLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  memberRoleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.md,
  },
  memberRoleText: {
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  memberEmpty: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  inviteSearchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: spacing.none,
  },
  inviteBtn: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRecordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: border.hairline,
    gap: spacing.sm,
  },
  voiceRecordingDot: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.sm,
    backgroundColor: palette.crimson,
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
    borderTopWidth: border.hairline,
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
    width: size.avatarXl,
    gap: spacing.xs,
  },
  plusPanelIcon: {
    width: size.plusPanelIcon,
    height: size.plusPanelIcon,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPanelLabel: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  accessGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  accessGateIcon: {
    width: size.listItemLg,
    height: size.listItemLg,
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
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
  accessGateButton: {
    marginTop: spacing.xl,
    minWidth: size.actionMinWidth,
  },
  accessGateButtonText: {
    color: palette.foundation,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  selectionToolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: border.none,
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
    borderBottomWidth: border.hairline,
    paddingHorizontal: spacing.md,
  },
  searchTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: -border.hairline,
    borderBottomWidth: border.active,
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
    minHeight: size.controlMd,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    height: size.iconButtonLg,
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
    borderWidth: border.hairline,
    borderRadius: radius.md,
    marginBottom: spacing.xxs,
  },
  searchResultCard: {
    padding: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
