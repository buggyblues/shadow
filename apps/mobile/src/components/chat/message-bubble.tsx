import type {
  CommerceProductCard,
  MessageCard,
  MessageCardStatus,
  OAuthLinkCard,
  PaidFileCard,
  ServerAppMessageCard,
  TaskMessageCard,
} from '@shadowob/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system/legacy'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import * as MediaLibrary from 'expo-media-library'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import {
  AlertCircle,
  AppWindow,
  ArrowRight,
  Check,
  CheckSquare,
  ChevronRight,
  ExternalLink,
  FileArchive,
  FileCode,
  FileText,
  Film,
  Globe2,
  Lock,
  MessageSquare,
  Music,
  Pause,
  Radio,
  RefreshCw,
  Save,
  Share2,
  Square as SquareIcon,
  Ticket,
  Unlock,
  Volume2,
  Wallet,
  X,
} from 'lucide-react-native'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Dimensions,
  type GestureResponderEvent,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import WebView from 'react-native-webview'
import type { EmojiType } from 'rn-emoji-keyboard'
import RNEmojiPicker from 'rn-emoji-keyboard'
import { API_BASE, fetchApi, getImageUrl } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
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
} from '../../theme'
import type {
  Attachment,
  InteractiveBlock,
  InteractiveResponseMetadata,
  Message,
} from '../../types/message'
import { Avatar } from '../common/avatar'
import { formatCommercePrice, PriceCompact } from '../common/price-display'
import { Button, CardPressable, ChipButton, IconButton, MenuItem, Sheet } from '../ui'
import { MarkdownRenderer } from './markdown-renderer'
import type { PopupAction } from './selection-popup'
import { SelectionPopup } from './selection-popup'

const REACTION_ENTERING = ZoomIn.duration(120)

type SignedMediaUrl = {
  url: string
  expiresAt: string
}

type MediaVariant = 'avatar' | 'preview' | 'banner'

type PaidFileState = {
  file: {
    id: string
    name: string
    mime?: string | null
    sizeBytes?: number | null
    previewUrl?: string | null
    paywalled?: boolean
  }
  entitlement: { id: string; status: string; expiresAt?: string | null } | null
  hasAccess: boolean
}

type CommerceViewerState =
  | 'not_purchased'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'cancelled'
  | 'unavailable'

type CommerceBlockedState = Exclude<CommerceViewerState, 'not_purchased' | 'active'>

type CommerceCheckoutPreview = {
  offer: { available: boolean }
  product?: {
    name?: string | null
    summary?: string | null
    imageUrl?: string | null
    price?: number
    currency?: string
  }
  shop?: { name?: string | null; logoUrl?: string | null }
  viewerState: CommerceViewerState
  primaryAction?:
    | 'purchase'
    | 'open_content'
    | 'renew'
    | 'view_detail'
    | 'view_progress'
    | 'unavailable'
  displayState?: {
    price?: { amount: number; currency: string }
  }
}

function getCommerceInvalidState(
  preview?: CommerceCheckoutPreview | null,
): CommerceViewerState | null {
  if (!preview) return null
  if (
    preview.viewerState === 'expired' ||
    preview.viewerState === 'revoked' ||
    preview.viewerState === 'cancelled' ||
    preview.viewerState === 'unavailable'
  ) {
    return preview.viewerState
  }
  if (preview.primaryAction === 'unavailable' || preview.offer.available === false) {
    return 'unavailable'
  }
  return null
}

function getPaidFileBlockedState(
  state?: PaidFileState | null,
  hasStateError = false,
): CommerceBlockedState | null {
  if (hasStateError) return 'unavailable'
  if (!state || state.hasAccess) return null
  const status = state.entitlement?.status
  if (status === 'expired' || status === 'revoked' || status === 'cancelled') return status
  if (status && status !== 'active') return 'unavailable'
  return null
}

interface WalletRechargeMetadata {
  requiredAmount?: number
  balance?: number
  shortfall?: number
  model?: string
}

const WALLET_RECHARGE_MARKER_PATTERN = /<!--\s*shadow:wallet-recharge\s+([A-Za-z0-9_-]+)\s*-->/u

const signedMediaCache = new Map<string, SignedMediaUrl>()

function isSignedMediaCacheFresh(entry: SignedMediaUrl): boolean {
  return new Date(entry.expiresAt).getTime() - 30_000 > Date.now()
}

async function resolveAttachmentMediaUrl(
  attachmentId: string,
  disposition: 'inline' | 'attachment',
  variant?: MediaVariant,
): Promise<string> {
  const cacheKey = `channel:${attachmentId}:${disposition}:${variant ?? 'original'}`
  const cached = signedMediaCache.get(cacheKey)
  if (cached && isSignedMediaCacheFresh(cached)) return cached.url
  const params = new URLSearchParams()
  params.set('disposition', disposition)
  if (variant) params.set('variant', variant)
  const path = `/api/attachments/${attachmentId}/media-url?${params}`
  const resolved = await fetchApi<SignedMediaUrl>(path)
  signedMediaCache.set(cacheKey, resolved)
  return resolved.url
}

function formatByteSize(bytes: number | null | undefined) {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DEFAULT_VOICE_PEAKS = [
  18, 32, 54, 42, 76, 64, 30, 46, 68, 58, 36, 72, 88, 52, 34, 60, 78, 44, 28, 66, 84, 50, 38, 70,
  56, 32, 62, 74, 48, 26, 58, 82,
]

function normalizeVoicePeaks(peaks?: number[] | null) {
  return (peaks?.length ? peaks : DEFAULT_VOICE_PEAKS).map((peak) =>
    Math.max(8, Math.min(100, peak)),
  )
}

function formatVoiceDuration(durationMs?: number | null, fallbackSeconds = 0) {
  const secondsValue =
    typeof durationMs === 'number' && durationMs > 0
      ? durationMs / 1000
      : fallbackSeconds > 0
        ? fallbackSeconds
        : null
  if (!secondsValue) return '--:--'
  const totalSeconds = Math.max(1, Math.round(secondsValue))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function isVoiceAttachment(attachment: Attachment, contentType: string) {
  return (
    attachment.kind === 'voice' ||
    (contentType.startsWith('audio/') &&
      (typeof attachment.durationMs === 'number' ||
        Boolean(attachment.waveformPeaks?.length) ||
        /^voice[-_]\d+/i.test(attachment.filename)))
  )
}

async function markVoicePlayback(attachmentId: string, positionMs: number, completed: boolean) {
  await fetchApi(`/api/attachments/${attachmentId}/voice-playback`, {
    method: 'PUT',
    body: JSON.stringify({ positionMs, completed }),
  })
}

function formatCoinValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
}

function decodeBase64Url(encoded: string) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const atobFn = (globalThis as unknown as { atob?: (data: string) => string }).atob
  if (typeof atobFn === 'function') return atobFn(padded)

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let buffer = 0
  let bits = 0
  let output = ''
  for (const char of padded.replace(/=+$/u, '')) {
    const value = alphabet.indexOf(char)
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  return output
}

function decodeWalletRechargeMarker(content: string): WalletRechargeMetadata | null {
  const encoded = content.match(WALLET_RECHARGE_MARKER_PATTERN)?.[1]
  if (!encoded) return null
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Record<string, unknown>
    const pickNumber = (key: string) => {
      const value = parsed[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined
    }
    return {
      requiredAmount: pickNumber('requiredAmount'),
      balance: pickNumber('balance'),
      shortfall: pickNumber('shortfall'),
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
    }
  } catch {
    return null
  }
}

function stripWalletRechargeMarker(content: string) {
  return content.replace(WALLET_RECHARGE_MARKER_PATTERN, '').trim()
}

function WalletRechargeCard({ data }: { data: WalletRechargeMetadata }) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()

  const openTasks = () => router.push('/(main)/settings/tasks' as never)

  return (
    <View
      style={[
        styles.walletRechargeCard,
        { backgroundColor: colors.inputBackground, borderColor: colors.warning },
      ]}
    >
      <View style={styles.walletRechargeHeader}>
        <View style={[styles.walletRechargeIcon, { backgroundColor: colors.inputBackground }]}>
          <Wallet size={iconSize.xl} color={colors.warning} />
        </View>
        <View style={styles.walletRechargeText}>
          <Text style={[styles.walletRechargeTitle, { color: colors.text }]}>
            {t('chat.modelWalletRechargeTitle')}
          </Text>
          <Text style={[styles.walletRechargeBody, { color: colors.textMuted }]}>
            {t('chat.modelWalletRechargeBody')}
          </Text>
        </View>
      </View>

      <View style={styles.walletRechargeStats}>
        {[
          [t('chat.modelWalletRechargeNeeded'), formatCoinValue(data.requiredAmount)],
          [t('chat.modelWalletRechargeBalance'), formatCoinValue(data.balance)],
          [t('chat.modelWalletRechargeShortfall'), formatCoinValue(data.shortfall)],
        ].map(([label, value]) => (
          <View
            key={label}
            style={[styles.walletRechargeStat, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.walletRechargeStatLabel, { color: colors.textMuted }]}>
              {label}
            </Text>
            <Text style={[styles.walletRechargeStatValue, { color: colors.text }]}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.walletRechargeActions}>
        <Button variant="secondary" size="sm" icon={Wallet} onPress={openTasks}>
          {t('chat.modelWalletRechargeAction')}
        </Button>
        <Button variant="glass" size="sm" onPress={openTasks}>
          {t('chat.modelWalletTasksAction')}
        </Button>
      </View>
    </View>
  )
}

function isTaskMessageCard(card: MessageCard): card is TaskMessageCard {
  return card.kind === 'task' && typeof card.id === 'string' && typeof card.title === 'string'
}

function isServerAppCard(card: MessageCard): card is ServerAppMessageCard {
  return (
    card.kind === 'server_app' && typeof card.appKey === 'string' && typeof card.title === 'string'
  )
}

interface LaunchContext {
  iframeEntry: string | null
  launchToken: string
  eventStreamPath: string
}

function withLaunchParams(entry: string, launch: LaunchContext, appPath?: string) {
  const url = new URL(entry)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      `${API_BASE}${launch.eventStreamPath.startsWith('/') ? '' : '/'}${launch.eventStreamPath}`,
    )
  }
  if (appPath?.startsWith('/') && !appPath.startsWith('//')) url.hash = appPath
  return url.toString()
}

function TaskCardsView({ cards }: { cards?: MessageCard[] }) {
  const taskCards = cards?.filter(isTaskMessageCard) ?? []
  if (taskCards.length === 0) return null
  return (
    <View style={styles.taskCards}>
      {taskCards.map((card) => (
        <TaskCardMobile key={card.id} card={card} />
      ))}
    </View>
  )
}

function ServerAppCardsView({ cards, serverSlug }: { cards?: MessageCard[]; serverSlug?: string }) {
  const appCards = cards?.filter(isServerAppCard) ?? []
  if (appCards.length === 0) return null
  return (
    <View style={styles.taskCards}>
      {appCards.map((card, index) => (
        <ServerAppCardMobile
          key={card.id ?? `${card.appKey}:${index}`}
          card={card}
          serverSlug={serverSlug}
        />
      ))}
    </View>
  )
}

function ServerAppCardMobile({
  card,
  serverSlug,
}: {
  card: ServerAppMessageCard
  serverSlug?: string
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const openApp = useMutation({
    mutationFn: async () => {
      if (!serverSlug) throw new Error(t('serverApps.selectFromSidebar'))
      const launch = await fetchApi<LaunchContext>(
        `/api/servers/${serverSlug}/apps/${card.appKey}/launch`,
        { method: 'POST' },
      )
      const entry = launch.iframeEntry
      if (!entry) throw new Error(t('serverApps.noIframe'))
      return withLaunchParams(entry, launch, card.action?.path)
    },
    onSuccess: (url) => {
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(url),
          title: card.title,
          serverSlug,
          appKey: card.appKey,
        },
      })
    },
    onError: (error: Error) => showToast(error.message || t('common.error'), 'error'),
  })

  return (
    <Pressable
      disabled={!serverSlug || openApp.isPending}
      style={[
        styles.serverAppCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      onPress={() => openApp.mutate()}
    >
      <View style={[styles.serverAppIcon, { backgroundColor: colors.inputBackground }]}>
        <AppWindow size={iconSize.lg} color={colors.primary} />
      </View>
      <View style={styles.serverAppCardText}>
        <Text style={[styles.taskTitle, { color: colors.text }]}>{card.title}</Text>
        {card.description ? (
          <Text style={[styles.taskBody, { color: colors.textMuted }]} numberOfLines={2}>
            {card.description}
          </Text>
        ) : null}
        <View style={styles.serverAppAction}>
          <Text style={[styles.serverAppActionText, { color: colors.primary }]}>
            {card.label ?? t('chat.appCard.open')}
          </Text>
          <ArrowRight size={iconSize.sm} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  )
}

function TaskCardMobile({ card }: { card: TaskMessageCard }) {
  const { t } = useTranslation()
  const colors = useColors()
  const statusColor =
    card.status === 'completed'
      ? colors.success
      : card.status === 'failed' || card.status === 'canceled' || card.status === 'transferred'
        ? colors.error
        : card.status === 'running' || card.status === 'claimed'
          ? colors.warning
          : colors.primary
  const assigneeLabel = card.assignee?.label ?? t('inbox.unassigned')

  return (
    <View
      style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.taskHeader}>
        <Avatar
          uri={null}
          name={assigneeLabel}
          userId={card.assignee?.userId ?? card.assignee?.agentId ?? assigneeLabel}
          size={34}
        />
        <View style={styles.taskHeaderText}>
          <Text style={[styles.taskTitle, { color: colors.text }]}>{card.title}</Text>
          <Text style={[styles.taskAssignee, { color: colors.textMuted }]}>{assigneeLabel}</Text>
        </View>
        <Text
          style={[
            styles.taskStatus,
            {
              color: statusColor,
              borderColor: colors.border,
              backgroundColor: colors.inputBackground,
            },
          ]}
        >
          {t(`inbox.status.${card.status}`)}
        </Text>
      </View>
      {card.body ? (
        <Text style={[styles.taskBody, { color: colors.textMuted }]}>{card.body}</Text>
      ) : null}
    </View>
  )
}

interface MessageBubbleProps {
  message: Message
  onReply: () => void
  onRetry?: (message: Message) => void
  onOpenThread?: () => void
  hasThread?: boolean
  channelId: string
  serverSlug?: string
  allMessages?: Message[]
  isGrouped?: boolean
  selectionMode?: boolean
  isSelected?: boolean
  selectionAnchorId?: string | null
  onToggleSelect?: (messageId: string) => void
  onEnterSelectionMode?: (messageId: string) => void
  onSelectRangeTo?: (messageId: string) => void
}

function SignedAttachmentImage({ attachment }: { attachment: Attachment }) {
  const [uri, setUri] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    resolveAttachmentMediaUrl(attachment.id, 'inline', 'preview')
      .catch(() => resolveAttachmentMediaUrl(attachment.id, 'inline'))
      .then((signedUrl) => {
        if (!cancelled) setUri(getImageUrl(signedUrl) ?? signedUrl)
      })
      .catch(() => {
        if (!cancelled) setUri(null)
      })
    return () => {
      cancelled = true
    }
  }, [attachment.id])

  return (
    <Image
      source={{ uri: uri ?? undefined }}
      style={[
        styles.attachmentImage,
        attachment.width && attachment.height && attachment.width > 0 && attachment.height > 0
          ? {
              width: Math.min(260, attachment.width),
              height: Math.min(
                320,
                Math.min(260, attachment.width) / (attachment.width / attachment.height),
              ),
            }
          : null,
      ]}
      contentFit="cover"
      transition={200}
    />
  )
}

function VoiceAttachmentView({
  attachment,
  disabled,
  isOwn,
}: {
  attachment: Attachment
  disabled?: boolean
  isOwn?: boolean
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const playerRef = useRef<AudioPlayer | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [played, setPlayed] = useState(Boolean(attachment.playback?.played))
  const peaks = useMemo(
    () => normalizeVoicePeaks(attachment.waveformPeaks),
    [attachment.waveformPeaks],
  )

  useEffect(() => {
    setPlayed(Boolean(attachment.playback?.played))
  }, [attachment.playback?.played])

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      playerRef.current?.pause()
      playerRef.current = null
    }
  }, [])

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  const ensurePlayer = useCallback(async () => {
    if (playerRef.current) return playerRef.current
    setIsLoading(true)
    try {
      const signedUrl = await resolveAttachmentMediaUrl(attachment.id, 'inline')
      const url = getImageUrl(signedUrl) ?? signedUrl
      const player = createAudioPlayer(url)
      playerRef.current = player
      return player
    } finally {
      setIsLoading(false)
    }
  }, [attachment.id])

  const startProgressTimer = useCallback(
    (player: AudioPlayer) => {
      clearProgressTimer()
      progressTimerRef.current = setInterval(() => {
        const total = player.duration || (attachment.durationMs ?? 0) / 1000 || 1
        const ratio = Math.min(1, player.currentTime / total)
        setProgress(ratio)
        if (ratio >= 0.98 && total > 0) {
          clearProgressTimer()
          setIsPlaying(false)
          setProgress(1)
          void markVoicePlayback(attachment.id, Math.round(total * 1000), true).catch(
            () => undefined,
          )
        }
      }, 180)
    },
    [attachment.durationMs, attachment.id, clearProgressTimer],
  )

  const togglePlayback = useCallback(async () => {
    if (disabled) return
    const player = await ensurePlayer()
    if (isPlaying) {
      player.pause()
      setIsPlaying(false)
      clearProgressTimer()
      void markVoicePlayback(attachment.id, Math.round(player.currentTime * 1000), false).catch(
        () => undefined,
      )
      return
    }
    await setAudioModeAsync({ playsInSilentMode: true })
    player.play()
    setIsPlaying(true)
    setPlayed(true)
    startProgressTimer(player)
    void markVoicePlayback(attachment.id, Math.round(player.currentTime * 1000), false).catch(
      () => undefined,
    )
  }, [attachment.id, clearProgressTimer, disabled, ensurePlayer, isPlaying, startProgressTimer])

  const activeIndex = Math.floor(progress * peaks.length)
  const foregroundColor = isOwn ? palette.foundation : colors.text
  const activeWaveColor = isOwn ? palette.foundation : colors.primary
  const inactiveWaveColor = isOwn ? palette.foundation : colors.textMuted

  return (
    <View style={styles.voiceAttachmentBlock}>
      <Pressable
        disabled={disabled || isLoading}
        onPress={() => void togglePlayback()}
        style={[
          styles.voiceBubble,
          {
            backgroundColor: isOwn ? colors.success : colors.inputBackground,
            borderColor: isOwn ? colors.success : colors.border,
          },
        ]}
      >
        <Text style={[styles.voiceDuration, { color: foregroundColor }]}>
          {formatVoiceDuration(attachment.durationMs, playerRef.current?.duration ?? 0)}
        </Text>
        <View style={styles.voiceWaveform}>
          {peaks.slice(0, 28).map((peak, index) => (
            <View
              key={`${attachment.id}-${index}`}
              style={[
                styles.voiceWaveformBar,
                {
                  height: Math.max(6, Math.round(peak * 0.2)),
                  backgroundColor: index <= activeIndex ? activeWaveColor : inactiveWaveColor,
                  opacity: index <= activeIndex ? 1 : 0.34,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.voicePlayButton}>
          {isPlaying ? (
            <Pause size={iconSize.md} color={foregroundColor} fill={foregroundColor} />
          ) : (
            <Volume2 size={iconSize.lg} color={foregroundColor} />
          )}
        </View>
        {!isOwn && !played ? (
          <View style={[styles.voiceUnreadDot, { backgroundColor: colors.error }]} />
        ) : null}
      </Pressable>
      {attachment.transcript?.status === 'ready' && attachment.transcript.text ? (
        <View style={[styles.voiceTranscriptBox, { backgroundColor: colors.surface }]}>
          <View style={styles.voiceTranscriptHeader}>
            <Radio size={iconSize.xs} color={colors.textMuted} />
            <Text style={[styles.voiceTranscriptLabel, { color: colors.textMuted }]}>
              {t('chat.voiceTranscript')}
            </Text>
          </View>
          <Text style={[styles.voiceTranscriptText, { color: colors.textSecondary }]}>
            {attachment.transcript.text}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function MessageBubbleInner({
  message,
  onReply,
  onRetry,
  onOpenThread,
  hasThread,
  channelId: _channelId,
  serverSlug,
  allMessages = [],
  isGrouped = false,
  selectionMode,
  isSelected,
  selectionAnchorId,
  onToggleSelect,
  onEnterSelectionMode,
  onSelectRangeTo,
}: MessageBubbleProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const currentUser = useAuthStore((s) => s.user)
  const bubbleRef = useRef<View>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [showPopup, setShowPopup] = useState(false)
  const [popupPosition, setPopupPosition] = useState<{
    touchX: number
    touchY: number
  } | null>(null)
  const [attachmentAction, setAttachmentAction] = useState<{
    id: string
    url: string
    filename: string
  } | null>(null)
  const buildLocalFileUri = useCallback((filename: string) => {
    const extMatch = filename.match(/\.[A-Za-z0-9]+$/)
    const ext = extMatch?.[0] ?? ''
    const safeBase = filename.replace(/\.[A-Za-z0-9]+$/, '').replace(/[/\\?#%:*"<>|\s]/g, '_')
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return `${FileSystem.cacheDirectory}${safeBase || 'file'}-${unique}${ext}`
  }, [])

  // Download remote file to local cache for sharing
  const downloadToLocal = useCallback(
    async (url: string, filename: string): Promise<string> => {
      const localUri = buildLocalFileUri(filename)
      const token = useAuthStore.getState().accessToken
      const { uri } = await FileSystem.downloadAsync(url, localUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      return uri
    },
    [buildLocalFileUri],
  )

  const resolveAttachmentUrl = useCallback(
    async (
      attachment: Pick<Attachment, 'id' | 'url'>,
      disposition: 'inline' | 'attachment',
      variant?: MediaVariant,
    ) => {
      try {
        const signedUrl = await resolveAttachmentMediaUrl(attachment.id, disposition, variant)
        return getImageUrl(signedUrl) ?? signedUrl
      } catch {
        return null
      }
    },
    [],
  )

  // Attachment long-press actions
  const handleAttachmentSave = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = await resolveAttachmentUrl(attachmentAction, 'attachment')
    if (!resolved) {
      showToast(t('chat.saveFailed', 'Failed to save file'), 'error')
      setAttachmentAction(null)
      return
    }
    const lower = attachmentAction.filename.toLowerCase()
    const isMedia =
      /\.(png|jpe?g|gif|webp|heic|heif|bmp|mp4|mov|m4v|avi|mkv|mp3|wav|m4a|aac|ogg)$/i.test(lower)
    try {
      const localUri = await downloadToLocal(resolved, attachmentAction.filename)
      if (isMedia) {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status !== 'granted') {
          showToast(t('chat.permissionDenied', 'Permission denied'), 'error')
          return
        }
        await MediaLibrary.saveToLibraryAsync(localUri)
        showToast(t('chat.imageSaved', 'File saved to library'), 'success')
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri)
      } else {
        showToast(t('chat.shareUnavailable', 'Sharing is not available on this device'), 'error')
      }
    } catch (err) {
      console.error('Save failed:', err)
      showToast(t('chat.saveFailed', 'Failed to save file'), 'error')
    }
    setAttachmentAction(null)
  }, [attachmentAction, t, downloadToLocal, resolveAttachmentUrl])

  const handleAttachmentShare = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = await resolveAttachmentUrl(attachmentAction, 'attachment')
    if (!resolved) {
      showToast(t('chat.shareFailed', 'Failed to share file'), 'error')
      setAttachmentAction(null)
      return
    }
    try {
      const localUri = await downloadToLocal(resolved, attachmentAction.filename)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri)
      } else {
        showToast(t('chat.shareUnavailable', 'Sharing is not available on this device'), 'error')
      }
    } catch (err) {
      console.error('Share failed:', err)
      showToast(t('chat.shareFailed', 'Failed to share file'), 'error')
    }
    setAttachmentAction(null)
  }, [attachmentAction, t, downloadToLocal, resolveAttachmentUrl])

  const handleAttachmentCopyUrl = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = await resolveAttachmentUrl(attachmentAction, 'attachment')
    if (!resolved) {
      showToast(t('chat.shareFailed', 'Failed to share file'), 'error')
      setAttachmentAction(null)
      return
    }
    await Clipboard.setStringAsync(resolved)
    showToast(t('common.copied', '已复制'), 'success')
    setAttachmentAction(null)
  }, [attachmentAction, t, resolveAttachmentUrl])

  // Resolve reply reference
  const replyTarget = useMemo(() => {
    if (!message.replyToId) return null
    return allMessages.find((m) => m.id === message.replyToId) ?? null
  }, [message.replyToId, allMessages])

  const deleteMutation = useMutation({
    mutationFn: () => fetchApi(`/api/messages/${message.id}`, { method: 'DELETE' }),
  })

  const editMutation = useMutation({
    mutationFn: (content: string) =>
      fetchApi(`/api/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => setIsEditing(false),
  })

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      fetchApi(`/api/messages/${message.id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
  })

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== message.content) {
      editMutation.mutate(trimmed)
    } else {
      setIsEditing(false)
    }
  }

  // --- Long-press popup (WeChat-style) ---

  const handleLongPress = useCallback(
    (event: GestureResponderEvent) => {
      if (selectionMode && (!onSelectRangeTo || selectionAnchorId === message.id)) return
      Haptics.selectionAsync()
      const { pageX, pageY } = event.nativeEvent
      setPopupPosition({ touchX: pageX, touchY: pageY })
      setShowPopup(true)
    },
    [message.id, onSelectRangeTo, selectionAnchorId, selectionMode],
  )

  const dismissPopup = useCallback(() => {
    setShowPopup(false)
    setPopupPosition(null)
  }, [])

  const handleCopyMessage = useCallback(async () => {
    await Clipboard.setStringAsync(message.content)
    dismissPopup()
  }, [message.content, dismissPopup])

  const handleReplyAction = useCallback(() => {
    dismissPopup()
    onReply()
  }, [dismissPopup, onReply])

  const handleThreadAction = useCallback(() => {
    dismissPopup()
    onOpenThread?.()
  }, [dismissPopup, onOpenThread])

  const handleReaction = useCallback(
    (emoji: string) => {
      reactionMutation.mutate(emoji)
    },
    [reactionMutation],
  )

  const handleQuickReaction = useCallback(
    (emoji: string) => {
      dismissPopup()
      reactionMutation.mutate(emoji)
    },
    [dismissPopup, reactionMutation],
  )

  const handleEnterMultiSelect = useCallback(() => {
    dismissPopup()
    onEnterSelectionMode?.(message.id)
  }, [dismissPopup, onEnterSelectionMode, message.id])

  const handleSelectRangeTo = useCallback(() => {
    dismissPopup()
    onSelectRangeTo?.(message.id)
  }, [dismissPopup, onSelectRangeTo, message.id])

  const handleDeleteMessage = useCallback(() => {
    dismissPopup()
    Alert.alert(
      t('chat.deleteMessage', '删除消息'),
      t('chat.deleteMessageConfirm', '确定要删除这条消息吗？'),
      [
        { text: t('common.cancel', '取消'), style: 'cancel' },
        {
          text: t('common.delete', '删除'),
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    )
  }, [dismissPopup, t, deleteMutation])

  const POPUP_HEIGHT_EST = 90
  const screenHeight = Dimensions.get('window').height
  const popupAbove = (popupPosition?.touchY ?? 100) > POPUP_HEIGHT_EST + 40
  const isOwnMessage = currentUser ? message.authorId === currentUser.id : false

  const popupActions = useMemo<PopupAction[]>(() => {
    if (selectionMode) {
      return onSelectRangeTo && selectionAnchorId !== message.id
        ? [{ label: t('chat.selectToHere', '选择到此消息'), onPress: handleSelectRangeTo }]
        : []
    }

    const actions: PopupAction[] = [
      { label: t('chat.copy', '复制'), onPress: handleCopyMessage },
      { label: t('chat.reply', '回复'), onPress: handleReplyAction },
    ]
    if (onOpenThread && !message.threadId) {
      actions.push({
        label: t(hasThread ? 'chat.openThread' : 'chat.startThread'),
        onPress: handleThreadAction,
      })
    }
    if (onEnterSelectionMode) {
      actions.push({
        label: t('chat.multiSelect', '多选'),
        onPress: handleEnterMultiSelect,
      })
    }
    if (isOwnMessage) {
      actions.push({
        label: t('common.delete', '删除'),
        onPress: handleDeleteMessage,
      })
    }
    return actions
  }, [
    t,
    handleCopyMessage,
    handleReplyAction,
    handleThreadAction,
    handleEnterMultiSelect,
    handleSelectRangeTo,
    handleDeleteMessage,
    onEnterSelectionMode,
    onSelectRangeTo,
    onOpenThread,
    selectionAnchorId,
    selectionMode,
    message.threadId,
    message.id,
    hasThread,
    isOwnMessage,
  ])

  const displayName = message.author?.displayName || message.author?.username || '?'
  const timeAgo = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })
  const isBot = message.author?.isBot ?? false
  const walletRecharge = useMemo(
    () => decodeWalletRechargeMarker(message.content),
    [message.content],
  )
  const hasTaskCards = useMemo(
    () => (message.metadata?.cards ?? []).some((card) => isTaskMessageCard(card)),
    [message.metadata?.cards],
  )
  const displayContent = useMemo(() => {
    if (hasTaskCards) return ''
    return walletRecharge ? stripWalletRechargeMarker(message.content) : message.content
  }, [hasTaskCards, message.content, walletRecharge])

  const getAttachmentContentType = (att: Attachment) =>
    att.contentType ?? att.mimeType ?? 'application/octet-stream'

  const isImageAtt = (att: Attachment) => getAttachmentContentType(att).startsWith('image/')

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('audio/')) return Music
    if (contentType.startsWith('video/')) return Film
    if (
      contentType.includes('zip') ||
      contentType.includes('archive') ||
      contentType.includes('tar') ||
      contentType.includes('rar')
    )
      return FileArchive
    if (
      contentType.includes('json') ||
      contentType.includes('javascript') ||
      contentType.includes('typescript') ||
      contentType.includes('xml') ||
      contentType.includes('html') ||
      contentType.includes('css') ||
      contentType.includes('python') ||
      contentType.includes('java') ||
      contentType.includes('ruby') ||
      contentType.includes('go') ||
      contentType.includes('rust') ||
      contentType.includes('swift') ||
      contentType.includes('kotlin')
    )
      return FileCode
    return FileText
  }

  const getFileAccentColor = (contentType: string) => {
    if (contentType.startsWith('audio/')) return palette.indigo
    if (contentType.startsWith('video/')) return palette.warning
    if (
      contentType.includes('zip') ||
      contentType.includes('archive') ||
      contentType.includes('tar') ||
      contentType.includes('rar')
    )
      return palette.yellow
    if (contentType.includes('pdf')) return palette.crimson
    if (
      contentType.includes('json') ||
      contentType.includes('javascript') ||
      contentType.includes('typescript') ||
      contentType.includes('xml') ||
      contentType.includes('html') ||
      contentType.includes('css') ||
      contentType.includes('python') ||
      contentType.includes('java')
    )
      return palette.cyan
    if (
      contentType.includes('word') ||
      contentType.includes('document') ||
      contentType.includes('text/')
    )
      return palette.indigo
    if (contentType.includes('spreadsheet') || contentType.includes('excel')) return palette.emerald
    return colors.primary
  }

  const getFileExtension = (filename: string) => {
    const parts = filename.split('.')
    return parts.length > 1 ? parts[parts.length - 1]!.toUpperCase() : ''
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // @mention map for markdown renderer
  const mentionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of allMessages) {
      if (m.author?.username) {
        map.set(m.author.username, m.author.id ?? m.authorId)
      }
    }
    return map
  }, [allMessages])

  return (
    <Pressable
      style={[
        styles.container,
        isGrouped && styles.containerGrouped,
        isSelected && { backgroundColor: colors.surfaceHover },
      ]}
      onPress={selectionMode ? () => onToggleSelect?.(message.id) : () => Keyboard.dismiss()}
      onLongPress={handleLongPress}
      delayLongPress={300}
    >
      {/* Reply reference */}
      {replyTarget && (
        <View
          style={[
            styles.replyRef,
            { borderLeftColor: colors.primary },
            selectionMode && { marginLeft: spacing.none },
          ]}
        >
          <Text style={[styles.replyRefAuthor, { color: colors.primary }]}>
            {replyTarget.author?.displayName || replyTarget.author?.username}
          </Text>
          <Text style={[styles.replyRefText, { color: colors.textMuted }]} numberOfLines={1}>
            {replyTarget.content}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        {selectionMode && (
          <View
            style={{ paddingTop: spacing.sm, paddingRight: spacing.sm, paddingLeft: spacing.xs }}
          >
            {isSelected ? (
              <CheckSquare size={iconSize.xl} color={colors.primary} />
            ) : (
              <SquareIcon size={iconSize.xl} color={colors.textMuted} />
            )}
          </View>
        )}
        {isGrouped ? (
          <View style={styles.groupedGutter} />
        ) : (
          <Pressable
            disabled={selectionMode}
            onPress={() => router.push(`/(main)/profile/${message.authorId}` as never)}
          >
            <Avatar
              uri={message.author?.avatarUrl}
              name={displayName}
              size={36}
              userId={message.authorId}
            />
          </Pressable>
        )}
        <View style={[styles.bubble, colors.mode === 'light' && styles.lightBubblePlate]}>
          {!isGrouped && (
            <View style={styles.header}>
              <Pressable
                disabled={selectionMode}
                onPress={() => router.push(`/(main)/profile/${message.authorId}` as never)}
              >
                <Text style={[styles.username, { color: colors.text }]}>{displayName}</Text>
              </Pressable>
              {isBot && (
                <View style={[styles.botBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.botBadgeText}>Buddy</Text>
                </View>
              )}
              <Text style={[styles.time, { color: colors.textMuted }]}>{timeAgo}</Text>
              {message.isEdited && (
                <Text style={[styles.edited, { color: colors.textMuted }]}>
                  ({t('chat.edited')})
                </Text>
              )}
            </View>
          )}

          {/* Content or editing */}
          {isEditing ? (
            <View style={styles.editContainer}>
              <TextInput
                style={[
                  styles.editInput,
                  {
                    backgroundColor: colors.inputBackground,
                    color: colors.text,
                    borderColor: colors.primary,
                  },
                ]}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
              />
              <View style={styles.editActions}>
                <IconButton
                  icon={X}
                  variant="ghost"
                  iconColor={colors.textMuted}
                  iconSize={16}
                  style={styles.editBtn}
                  onPress={() => setIsEditing(false)}
                />
                <IconButton
                  icon={Check}
                  variant="primary"
                  iconSize={16}
                  style={styles.editBtn}
                  onPress={handleSaveEdit}
                />
              </View>
            </View>
          ) : (
            <View ref={bubbleRef} pointerEvents={selectionMode ? 'none' : 'box-none'}>
              <MarkdownRenderer
                content={displayContent}
                mentionMap={mentionMap}
                mentions={message.metadata?.mentions}
                selectable={!selectionMode}
              />
            </View>
          )}

          {walletRecharge && <WalletRechargeCard data={walletRecharge} />}

          <TaskCardsView cards={message.metadata?.cards} />
          <ServerAppCardsView cards={message.metadata?.cards} serverSlug={serverSlug} />

          {/* Attachments */}
          {message.attachments?.map((att) => {
            const contentType = getAttachmentContentType(att)
            if (isVoiceAttachment(att, contentType)) {
              return (
                <VoiceAttachmentView
                  key={att.id}
                  attachment={att}
                  disabled={selectionMode}
                  isOwn={isOwnMessage}
                />
              )
            }
            if (isImageAtt(att)) {
              return (
                <Pressable
                  key={att.id}
                  style={styles.imageAttachment}
                  disabled={selectionMode}
                  onPress={async () => {
                    const url = await resolveAttachmentUrl(att, 'inline')
                    if (!url) return
                    router.push({
                      pathname: '/(main)/media-preview',
                      params: {
                        url,
                        filename: att.filename,
                        contentType,
                      },
                    })
                  }}
                  onLongPress={() =>
                    setAttachmentAction({
                      id: att.id,
                      url: att.url,
                      filename: att.filename,
                    })
                  }
                >
                  <SignedAttachmentImage attachment={att} />
                </Pressable>
              )
            }
            const FileIcon = getFileIcon(contentType)
            const accentColor = getFileAccentColor(contentType)
            const ext = getFileExtension(att.filename)
            return (
              <Pressable
                key={att.id}
                style={[
                  styles.fileCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                disabled={selectionMode}
                onPress={async () => {
                  const url = await resolveAttachmentUrl(att, 'attachment')
                  if (!url) return
                  router.push({
                    pathname: '/(main)/media-preview',
                    params: {
                      url,
                      filename: att.filename,
                      contentType,
                    },
                  })
                }}
                onLongPress={() =>
                  setAttachmentAction({
                    id: att.id,
                    url: att.url,
                    filename: att.filename,
                  })
                }
              >
                <View style={[styles.fileIconWrap, { backgroundColor: colors.inputBackground }]}>
                  <FileIcon size={iconSize.xl} color={accentColor} />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                    {att.filename}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    {ext ? (
                      <Text style={[styles.fileExt, { color: accentColor }]}>{ext}</Text>
                    ) : null}
                    <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
                      {formatSize(att.size)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )
          })}

          {message.metadata?.commerceCards?.map((card) => (
            <CommerceCardView key={card.id} card={card} messageId={message.id} />
          ))}

          {message.metadata?.paidFileCards?.map((card) => (
            <PaidFileCardMobile key={card.id} card={card} />
          ))}

          {message.metadata?.oauthLinkCards?.map((card) => (
            <OAuthLinkCardMobile
              key={card.id}
              card={card}
              messageId={message.id}
              channelId={message.channelId}
            />
          ))}

          {/* Phase 2 — interactive block (buttons / select) */}
          {message.metadata?.interactive && (
            <InteractiveBlockRenderer
              block={message.metadata.interactive}
              messageId={message.id}
              disabled={selectionMode}
              submittedResponse={message.metadata.interactiveState?.response}
            />
          )}

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <View style={styles.reactions}>
              {message.reactions.map((r) => {
                const isReacted = currentUser ? r.userIds.includes(currentUser.id) : false
                return (
                  <Animated.View key={r.emoji} entering={REACTION_ENTERING}>
                    <Pressable
                      disabled={selectionMode}
                      style={[
                        styles.reaction,
                        {
                          backgroundColor: isReacted ? colors.surfaceHover : colors.surface,
                          borderColor: isReacted ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync()
                        handleReaction(r.emoji)
                      }}
                    >
                      <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                      <Text
                        style={[
                          styles.reactionCount,
                          { color: isReacted ? colors.primary : colors.textSecondary },
                        ]}
                      >
                        {r.count}
                      </Text>
                    </Pressable>
                  </Animated.View>
                )
              })}
              <Pressable
                disabled={selectionMode}
                style={[
                  styles.reactionAdd,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => {
                  Haptics.selectionAsync()
                  setShowEmojiPicker(true)
                }}
              >
                <Text style={[styles.reactionAddText, { color: colors.textMuted }]}>+</Text>
              </Pressable>
            </View>
          )}

          {/* Send status indicator — only show on failure */}
          {message.sendStatus === 'failed' && (
            <View style={styles.sendStatus}>
              <AlertCircle size={iconSize.xs} color={colors.error} />
              <Text style={[styles.sendStatusText, { color: colors.error }]}>
                {t('chat.sendFailed', '发送失败')}
              </Text>
              <Button
                variant="danger"
                size="xs"
                icon={RefreshCw}
                iconSize={12}
                style={styles.retryBtn}
                onPress={() => onRetry?.(message)}
                hitSlop={8}
              >
                {t('chat.retry', '重试')}
              </Button>
            </View>
          )}
        </View>
      </View>

      {/* Long-press popup (WeChat-style) */}
      <Modal visible={showPopup} transparent animationType="fade" onRequestClose={dismissPopup}>
        <Pressable style={styles.popupOverlay} onPress={dismissPopup}>
          {popupPosition && (
            <View
              style={[
                styles.popupPositioner,
                popupAbove
                  ? { bottom: screenHeight - popupPosition.touchY + 12 }
                  : { top: popupPosition.touchY + 12 },
                { left: spacing.none, right: spacing.none },
              ]}
            >
              <SelectionPopup
                actions={popupActions}
                arrowDirection={popupAbove ? 'down' : 'up'}
                onQuickReaction={selectionMode ? undefined : handleQuickReaction}
              />
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Emoji picker */}
      <RNEmojiPicker
        open={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelected={(emoji: EmojiType) => handleReaction(emoji.emoji)}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      {/* Attachment long-press action sheet */}
      <Sheet
        visible={!!attachmentAction}
        onClose={() => setAttachmentAction(null)}
        title={attachmentAction?.filename}
      >
        <MenuItem
          icon={Save}
          title={t('chat.saveFile', '保存文件')}
          onPress={handleAttachmentSave}
        />
        <MenuItem icon={Share2} title={t('common.share', '分享')} onPress={handleAttachmentShare} />
        <MenuItem
          icon={ExternalLink}
          title={t('chat.copyLink', '复制链接')}
          onPress={handleAttachmentCopyUrl}
        />
        <Button variant="glass" size="md" onPress={() => setAttachmentAction(null)}>
          {t('common.cancel', '取消')}
        </Button>
      </Sheet>
    </Pressable>
  )
}

function parseOAuthCardUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function formatOAuthCardOrigin(value: string) {
  return parseOAuthCardUrl(value)?.host ?? value
}

function getOAuthCardAvatarUrl(card: OAuthLinkCard) {
  return card.meta?.avatarUrl ?? card.meta?.iconUrl ?? card.iconUrl ?? null
}

function getOAuthCardAppName(card: OAuthLinkCard) {
  return card.meta?.appName ?? card.title
}

function PaidFileCardMobile({ card }: { card: PaidFileCard }) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paidFileStateQuery = useQuery({
    queryKey: ['paid-file', card.fileId],
    queryFn: () => fetchApi<PaidFileState>(`/api/paid-files/${card.fileId}`),
    staleTime: 10_000,
  })
  const { data: state } = paidFileStateQuery

  const isUnlocked = state?.hasAccess === true
  const isStateLoading = paidFileStateQuery.isLoading && !state
  const blockedFileState = getPaidFileBlockedState(state, paidFileStateQuery.isError && !state)
  const blockedFileLabel = blockedFileState ? t(`commerce.viewerState.${blockedFileState}`) : null
  const metaText =
    formatByteSize(card.snapshot.sizeBytes) || card.snapshot.mime || t('chat.paidFile')
  const fileStateLabel = blockedFileLabel
    ? blockedFileLabel
    : isStateLoading
      ? t('common.loading')
      : isUnlocked
        ? t('chat.paidFileUnlocked')
        : t('chat.paidFileLocked')
  const fileAccessLabel = isUnlocked
    ? t('chat.paidFileReady')
    : (blockedFileLabel ??
      (isStateLoading ? t('common.loading') : t('chat.paidFileRequiresEntitlement')))
  const rawPreviewUrl = state?.file.previewUrl ?? card.snapshot.previewUrl
  const previewUri = rawPreviewUrl ? (getImageUrl(rawPreviewUrl) ?? rawPreviewUrl) : null

  const openFile = async () => {
    if (blockedFileState || isStateLoading) return
    setIsOpening(true)
    setError(null)
    try {
      const result = await fetchApi<{ viewerUrl: string }>(`/api/paid-files/${card.fileId}/open`, {
        method: 'POST',
      })
      router.push({
        pathname: '/(main)/media-preview',
        params: {
          url: result.viewerUrl,
          filename: card.snapshot.name,
          contentType: card.snapshot.mime ?? 'text/html; charset=utf-8',
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.paidFileOpenFailed'))
    } finally {
      setIsOpening(false)
    }
  }

  return (
    <View
      style={[
        styles.paidFileCard,
        {
          backgroundColor: colors.surface,
          borderColor: blockedFileState
            ? colors.warning
            : isUnlocked
              ? colors.primary
              : colors.border,
        },
      ]}
    >
      {previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.paidFilePreview} />
      ) : (
        <View
          style={[
            styles.paidFileIconWrap,
            {
              backgroundColor: blockedFileState
                ? colors.inputBackground
                : isUnlocked
                  ? colors.surfaceHover
                  : colors.surfaceHover,
            },
          ]}
        >
          <FileText
            size={iconSize['2xl']}
            color={
              blockedFileState ? colors.warning : isUnlocked ? colors.primary : colors.textMuted
            }
          />
        </View>
      )}
      <View style={styles.paidFileInfo}>
        <View style={styles.paidFileLabelRow}>
          {blockedFileState ? (
            <AlertCircle size={11} color={colors.warning} />
          ) : isUnlocked ? (
            <Unlock size={11} color={colors.primary} />
          ) : (
            <Lock size={11} color={colors.textMuted} />
          )}
          <Text
            style={[
              styles.paidFileLabel,
              {
                color: blockedFileState
                  ? colors.warning
                  : isUnlocked
                    ? colors.primary
                    : colors.textMuted,
              },
            ]}
            numberOfLines={1}
          >
            {fileStateLabel}
          </Text>
        </View>
        <Text style={[styles.paidFileName, { color: colors.text }]} numberOfLines={1}>
          {card.snapshot.name}
        </Text>
        <Text style={[styles.paidFileMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {metaText}
        </Text>
        {card.snapshot.summary ? (
          <Text style={[styles.paidFileSummary, { color: colors.textSecondary }]} numberOfLines={2}>
            {card.snapshot.summary}
          </Text>
        ) : null}
        {error ? (
          <View style={styles.paidFileErrorRow}>
            <AlertCircle size={iconSize.xs} color={colors.error} />
            <Text style={[styles.paidFileError, { color: colors.error }]} numberOfLines={2}>
              {error}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.paidFileDivider, { borderColor: colors.border }]} />
      <View style={styles.paidFileActionCol}>
        <View
          style={[
            styles.paidFileStatusIcon,
            {
              backgroundColor: blockedFileState
                ? colors.inputBackground
                : isUnlocked
                  ? colors.surfaceHover
                  : colors.surfaceHover,
              borderColor: blockedFileState
                ? colors.warning
                : isUnlocked
                  ? colors.primary
                  : colors.border,
            },
          ]}
        >
          {blockedFileState ? (
            <AlertCircle size={15} color={colors.warning} />
          ) : isUnlocked ? (
            <Unlock size={15} color={colors.primary} />
          ) : (
            <Lock size={15} color={colors.textMuted} />
          )}
        </View>
        {isUnlocked ? (
          <Button
            variant="primary"
            size="xs"
            disabled={isOpening}
            onPress={openFile}
            loading={isOpening}
            style={styles.paidFileButton}
          >
            {t('chat.paidFileOpenAction')}
          </Button>
        ) : (
          <View
            style={[
              styles.paidFileLockedPill,
              blockedFileState
                ? { backgroundColor: colors.inputBackground, borderColor: colors.warning }
                : { backgroundColor: colors.surfaceHover, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.paidFileLockedText,
                { color: blockedFileState ? colors.warning : colors.textSecondary },
              ]}
            >
              {fileAccessLabel}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

function OAuthLinkCardMobile({
  card,
  messageId,
  channelId,
}: {
  card: OAuthLinkCard
  messageId: string
  channelId: string
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const webViewRef = useRef<WebView>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const frameUrl = card.embedUrl ?? card.url
  const fallbackUrl = card.fallbackUrl ?? card.url
  const avatarUrl = getOAuthCardAvatarUrl(card)
  const iconUri = avatarUrl ? (getImageUrl(avatarUrl) ?? avatarUrl) : null
  const appName = getOAuthCardAppName(card)
  const origin = card.meta?.origin ?? formatOAuthCardOrigin(card.url)

  const openExternal = async () => {
    try {
      await Linking.openURL(fallbackUrl)
    } catch {
      showToast(t('chat.oauthLinkOpenFailed'))
    }
  }

  const injectedBridge = `
    (function () {
      var originalPostMessage = window.postMessage;
      window.postMessage = function (message, targetOrigin, transfer) {
        try {
          window.ReactNativeWebView.postMessage(
            typeof message === 'string' ? message : JSON.stringify(message)
          );
        } catch (error) {}
        if (typeof originalPostMessage === 'function') {
          return originalPostMessage.apply(window, arguments);
        }
      };
      true;
    })();
  `

  const sendLaunchMessage = () => {
    const payload = {
      type: 'shadow.card.launch',
      card: {
        id: card.id,
        appId: card.appId,
        clientId: card.clientId ?? null,
        scopes: card.scopes ?? [],
      },
      context: { messageId, channelId },
    }
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new MessageEvent('message', {
        data: ${JSON.stringify(payload)},
        origin: window.location.origin
      }));
      true;
    `)
  }

  const openPreview = () => {
    setIsConnected(false)
    setIsOpen(true)
  }

  return (
    <CardPressable
      accessibilityRole="button"
      accessibilityLabel={t('chat.oauthLinkPreviewAria', { title: card.title })}
      onPress={openPreview}
      variant="glassCard"
      padded={false}
      style={[styles.oauthCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.oauthIconWrap, { borderColor: colors.border }]}>
        {iconUri ? (
          <Image source={{ uri: iconUri }} style={styles.oauthIcon} />
        ) : (
          <Globe2 size={iconSize.lg} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.oauthInfo}>
        <View style={styles.oauthLabelRow}>
          <Globe2 size={iconSize.xs} color={colors.textMuted} />
          <Text style={[styles.oauthLabel, { color: colors.textMuted }]}>
            {t('chat.oauthLinkCardLabel')}
          </Text>
          <Text style={[styles.oauthLabelAppName, { color: colors.textMuted }]} numberOfLines={1}>
            · {appName}
          </Text>
        </View>
        <Text style={[styles.oauthTitle, { color: colors.text }]} numberOfLines={2}>
          {card.title}
        </Text>
        {card.description ? (
          <Text style={[styles.oauthDescription, { color: colors.textMuted }]} numberOfLines={2}>
            {card.description}
          </Text>
        ) : null}
        <Text style={[styles.oauthOrigin, { color: colors.textMuted }]} numberOfLines={1}>
          {origin}
        </Text>
      </View>
      <ChevronRight size={iconSize.xl} color={colors.textMuted} />

      <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.oauthModal, { backgroundColor: colors.background }]}>
          <View style={[styles.oauthModalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.oauthModalTitleWrap}>
              <Text style={[styles.oauthModalTitle, { color: colors.text }]} numberOfLines={1}>
                {card.title}
              </Text>
              <Text
                style={[
                  styles.oauthModalStatus,
                  { color: isConnected ? colors.success : colors.textMuted },
                ]}
              >
                {isConnected ? t('chat.oauthLinkConnected') : t('chat.oauthLinkWaiting')}
              </Text>
            </View>
            <IconButton
              icon={ExternalLink}
              variant="ghost"
              iconColor={colors.text}
              iconSize={20}
              style={styles.oauthModalIconButton}
              onPress={openExternal}
            />
            <IconButton
              icon={X}
              variant="ghost"
              iconColor={colors.text}
              iconSize={22}
              style={styles.oauthModalIconButton}
              onPress={() => setIsOpen(false)}
            />
          </View>
          <WebView
            ref={webViewRef}
            source={{ uri: frameUrl }}
            style={styles.oauthWebView}
            originWhitelist={['https://*', 'http://localhost:*', 'http://127.0.0.1:*']}
            injectedJavaScriptBeforeContentLoaded={injectedBridge}
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data)
                if (data?.type === 'shadow.card.ready') {
                  setIsConnected(true)
                  sendLaunchMessage()
                }
              } catch {
                // Ignore non-JSON messages from embedded apps.
              }
            }}
          />
          <View style={[styles.oauthModalFooter, { borderTopColor: colors.border }]}>
            <Text style={[styles.oauthModalFooterText, { color: colors.textMuted }]}>
              {t('chat.oauthLinkFallback')}
            </Text>
          </View>
        </View>
      </Modal>
    </CardPressable>
  )
}

function CommerceCardView({ card, messageId }: { card: CommerceProductCard; messageId: string }) {
  const { t } = useTranslation()
  const colors = useColors()
  const [isBuying, setIsBuying] = useState(false)
  const checkoutPreviewQuery = useQuery({
    queryKey: ['commerce-checkout-preview', card.offerId, card.skuId],
    queryFn: () =>
      fetchApi<CommerceCheckoutPreview>(
        `/api/commerce/offers/${card.offerId}/checkout-preview${
          card.skuId ? `?skuId=${encodeURIComponent(card.skuId)}` : ''
        }`,
      ),
    enabled: Boolean(card.offerId),
    staleTime: 10_000,
  })
  const { data: checkoutPreview } = checkoutPreviewQuery
  const isPreviewLoading =
    Boolean(card.offerId) && checkoutPreviewQuery.isLoading && !checkoutPreview
  const invalidViewerState = getCommerceInvalidState(checkoutPreview)
  const invalidStateLabel = invalidViewerState
    ? t(`commerce.viewerState.${invalidViewerState}`)
    : null
  const previewErrorLabel =
    !checkoutPreview && checkoutPreviewQuery.isError ? t('chat.commercePreviewFailed') : null
  const cardIssueLabel = previewErrorLabel ?? invalidStateLabel
  const hasCardIssue = Boolean(cardIssueLabel)
  const productImageUrl = checkoutPreview?.product?.imageUrl ?? card.snapshot.imageUrl
  const imageUri = productImageUrl ? (getImageUrl(productImageUrl) ?? productImageUrl) : undefined
  const productName = checkoutPreview?.product?.name ?? card.snapshot.name
  const productSummary = checkoutPreview?.product?.summary ?? card.snapshot.summary
  const displayPrice = {
    amount:
      checkoutPreview?.displayState?.price?.amount ??
      checkoutPreview?.product?.price ??
      card.snapshot.price,
    currency:
      checkoutPreview?.displayState?.price?.currency ??
      checkoutPreview?.product?.currency ??
      card.snapshot.currency,
  }
  const isShrimpPrice = displayPrice.currency === 'shrimp_coin'
  const shopName = checkoutPreview?.shop?.name ?? card.snapshot.shopName

  const buy = async () => {
    if (hasCardIssue || isPreviewLoading) return
    setIsBuying(true)
    try {
      const path = `/api/messages/${messageId}/commerce-cards/${card.id}/purchase`
      await fetchApi(path, {
        method: 'POST',
        body: JSON.stringify({
          skuId: card.skuId,
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      })
      showToast(t('chat.commercePurchaseSucceeded'))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('chat.commercePurchaseFailed'))
    } finally {
      setIsBuying(false)
    }
  }

  return (
    <View
      style={[
        styles.commerceCard,
        {
          backgroundColor: colors.surface,
          borderColor: hasCardIssue ? colors.warning : colors.border,
        },
      ]}
    >
      <View style={styles.commerceBody}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.commerceImage} />
        ) : (
          <View
            style={[
              styles.commerceImageFallback,
              {
                backgroundColor: hasCardIssue ? colors.inputBackground : colors.surfaceHover,
              },
            ]}
          >
            <Ticket
              size={iconSize['3xl']}
              color={hasCardIssue ? colors.warning : colors.primary}
              strokeWidth={2.5}
            />
          </View>
        )}
        <View style={styles.commerceInfo}>
          <Text
            style={[
              styles.commerceShopName,
              { color: hasCardIssue ? colors.warning : colors.primary },
            ]}
            numberOfLines={1}
          >
            {cardIssueLabel ?? (isPreviewLoading ? t('common.loading') : null) ?? shopName}
          </Text>
          <Text style={[styles.commerceTitle, { color: colors.text }]} numberOfLines={2}>
            {productName}
          </Text>
          {productSummary ? (
            <Text style={[styles.commerceSummary, { color: colors.textMuted }]} numberOfLines={2}>
              {productSummary}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.commerceDivider, { borderColor: colors.border }]} />
      <View style={styles.commerceActionCol}>
        {hasCardIssue ? (
          <>
            <View
              style={[
                styles.commerceInvalidIcon,
                { backgroundColor: colors.inputBackground, borderColor: colors.warning },
              ]}
            >
              <AlertCircle size={iconSize.md} color={colors.warning} />
            </View>
            <View
              style={[
                styles.commerceInvalidPill,
                { backgroundColor: colors.inputBackground, borderColor: colors.warning },
              ]}
            >
              <Text
                style={[styles.commerceInvalidText, { color: colors.warning }]}
                numberOfLines={1}
              >
                {cardIssueLabel}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View
              style={[
                styles.commercePriceWrap,
                { backgroundColor: colors.surfaceHover, borderColor: colors.border },
              ]}
            >
              {isShrimpPrice ? (
                <PriceCompact amount={displayPrice.amount} size={15} />
              ) : (
                <Text style={[styles.commercePrice, { color: colors.primary }]} numberOfLines={1}>
                  {formatCommercePrice(displayPrice.amount, displayPrice.currency, t)}
                </Text>
              )}
            </View>
            <Button
              variant="primary"
              size="sm"
              disabled={isBuying || isPreviewLoading}
              onPress={buy}
              loading={isBuying}
              style={styles.commerceButton}
            >
              {isPreviewLoading ? t('common.loading') : t('chat.commerceBuy')}
            </Button>
          </>
        )}
      </View>
    </View>
  )
}

export const MessageBubble = memo(MessageBubbleInner, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.channelId === next.channelId &&
    prev.isGrouped === next.isGrouped &&
    prev.hasThread === next.hasThread &&
    prev.allMessages === next.allMessages &&
    prev.onRetry === next.onRetry &&
    prev.onOpenThread === next.onOpenThread &&
    prev.selectionMode === next.selectionMode &&
    prev.isSelected === next.isSelected &&
    prev.selectionAnchorId === next.selectionAnchorId &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onEnterSelectionMode === next.onEnterSelectionMode &&
    prev.onSelectRangeTo === next.onSelectRangeTo
  )
})

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.px,
  },
  containerGrouped: {
    paddingVertical: spacing.none,
    marginBottom: spacing.none,
  },
  // Reply reference
  replyRef: {
    borderLeftWidth: border.active,
    paddingLeft: spacing.sm,
    marginLeft: size.controlMd,
    marginBottom: spacing.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  replyRefAuthor: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  replyRefText: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  // Message row
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bubble: {
    flex: 1,
  },
  lightBubblePlate: {
    backgroundColor: palette.white,
    borderColor: palette.lineLight,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  groupedGutter: {
    width: size.iconButtonMd,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.px,
  },
  username: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  botBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.px,
    borderRadius: radius.xs,
  },
  botBadgeText: {
    color: palette.white,
    fontSize: fontSize.micro,
    fontWeight: '800',
  },
  time: {
    fontSize: fontSize.xs,
  },
  edited: {
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  content: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
  },
  // Long-press popup overlay
  popupOverlay: {
    flex: 1,
  },
  popupPositioner: {
    position: 'absolute',
    alignItems: 'center',
  },
  // Editing
  editContainer: {
    marginTop: spacing.xs,
  },
  editInput: {
    borderRadius: radius.md,
    borderWidth: border.hairline,
    padding: spacing.sm,
    fontSize: fontSize.md,
    minHeight: size.iconButtonMd,
    maxHeight: size.composerInputMaxHeight,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  editBtn: {
    width: size.sectionCompactIcon,
    height: size.sectionCompactIcon,
  },
  // Attachments
  imageAttachment: {
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: size.attachmentImageWidth,
    height: size.panelStateMinHeight,
    borderRadius: radius.lg,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
    borderWidth: border.hairline,
    gap: spacing.sm,
  },
  voiceAttachmentBlock: {
    marginTop: spacing.xs,
    maxWidth: size.dialogMaxWidth,
  },
  voiceBubble: {
    minHeight: size.controlMd,
    minWidth: size.metricMinWidth,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    position: 'relative',
    overflow: 'visible',
  },
  voicePlayButton: {
    width: size.controlSm,
    height: size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    flex: 1,
    minWidth: size.listItemLg,
  },
  voiceWaveformBar: {
    width: size.dividerAccent,
    borderRadius: radius.full,
  },
  voiceDuration: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    minWidth: size.iconBubble,
  },
  voiceUnreadDot: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.full,
    position: 'absolute',
    top: spacing.tight,
    right: spacing.tight,
  },
  voiceTranscriptBox: {
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  voiceTranscriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  voiceTranscriptLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  voiceTranscriptText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  taskCards: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  taskCard: {
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  serverAppCard: {
    flexDirection: 'row',
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  serverAppIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.md,
  },
  serverAppCardText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  serverAppAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  serverAppActionText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  taskHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  taskTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    lineHeight: lineHeight.sm,
  },
  taskStatus: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    fontSize: fontSize.xs,
    fontWeight: '800',
    overflow: 'hidden',
  },
  taskBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  taskAssignee: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  taskActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  fileIconWrap: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  fileExt: {
    fontSize: fontSize.micro,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  fileMeta: {
    fontSize: fontSize.xs,
  },
  walletRechargeCard: {
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginTop: spacing.sm,
    maxWidth: size.dialogMaxWidth,
    gap: spacing.sm,
  },
  walletRechargeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  walletRechargeIcon: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletRechargeText: {
    flex: 1,
    minWidth: 0,
  },
  walletRechargeTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  walletRechargeBody: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    marginTop: spacing.xxs,
  },
  walletRechargeStats: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  walletRechargeStat: {
    flex: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  walletRechargeStatLabel: {
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  walletRechargeStatValue: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    marginTop: spacing.xxs,
  },
  walletRechargeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  paidFileCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: spacing.sm,
    marginTop: spacing.sm,
    maxWidth: size.dialogMaxWidth,
  },
  paidFileIconWrap: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidFilePreview: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.md,
  },
  paidFileInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  paidFileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  paidFileLabel: {
    fontSize: fontSize.micro,
    fontWeight: '900',
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  paidFileName: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  paidFileMeta: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  paidFileSummary: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    marginTop: spacing.xs,
  },
  paidFileErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.tight,
  },
  paidFileError: {
    flex: 1,
    fontSize: fontSize.xs,
  },
  paidFileDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  paidFileActionCol: {
    width: size.navSide,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
  },
  paidFileStatusIcon: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidFileButton: {
    width: '100%',
    minHeight: size.iconButtonSm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  paidFileLockedPill: {
    width: '100%',
    minHeight: size.iconButtonSm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  paidFileLockedText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textAlign: 'center',
  },
  commerceCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginTop: spacing.sm,
    maxWidth: size.commerceCardMaxWidth,
  },
  commerceBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  commerceImage: {
    width: size.avatarXl,
    height: size.avatarXl,
    borderRadius: radius.md,
  },
  commerceImageFallback: {
    width: size.avatarXl,
    height: size.avatarXl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commerceInfo: {
    flex: 1,
    minWidth: 0,
  },
  commerceShopName: {
    fontSize: fontSize.micro,
    fontWeight: '900',
    marginBottom: spacing.xxs,
  },
  commerceTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  commercePrice: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  commerceSummary: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  commerceDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  commerceActionCol: {
    width: size.actionTileMin,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  commercePriceWrap: {
    maxWidth: '100%',
    minHeight: size.sectionCompactIcon,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commerceInvalidIcon: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commerceInvalidPill: {
    width: '100%',
    minHeight: size.iconButtonSm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.tight,
  },
  commerceInvalidText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textAlign: 'center',
  },
  commerceButton: {
    borderRadius: radius.md,
    width: '100%',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  oauthCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginTop: spacing.sm,
    maxWidth: size.commerceCardMaxWidth,
  },
  oauthIconWrap: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  oauthIcon: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
  },
  oauthInfo: {
    flex: 1,
    minWidth: 0,
  },
  oauthLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  oauthLabel: {
    fontSize: fontSize.micro,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  oauthLabelAppName: {
    flexShrink: 1,
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  oauthTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: spacing.xxs,
  },
  oauthDescription: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  oauthOrigin: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  oauthModal: {
    flex: 1,
  },
  oauthModalHeader: {
    minHeight: size.tabBar,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  oauthModalTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  oauthModalTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  oauthModalStatus: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  oauthModalIconButton: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  oauthWebView: {
    flex: 1,
  },
  oauthModalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  oauthModalFooterText: {
    fontSize: fontSize.xs,
  },
  // Reactions
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    borderWidth: border.hairline,
  },
  reactionEmoji: {
    fontSize: fontSize.sm,
  },
  reactionCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  reactionAdd: {
    width: size.controlXs,
    height: size.avatarXs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.hairline,
  },
  reactionAddText: {
    fontSize: fontSize.sm,
  },
  // Send status
  sendStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  sendStatusText: {
    fontSize: fontSize.xs,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.tight,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
  },
  // Interactive block (Phase 2)
  interactive: {
    marginTop: spacing.tight,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    gap: spacing.sm,
  },
  interactivePrompt: {
    fontSize: fontSize.sm,
  },
  interactiveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
  },
  interactiveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.tight,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
  },
  interactiveError: {
    fontSize: fontSize.xs,
  },
})

/**
 * Phase 2 POC — renders interactive controls (buttons / select) attached to
 * a message and POSTs the user's choice to the server, which echoes a
 * follow-up reply that the buddy agent receives via normal chat flow.
 */
function InteractiveBlockRenderer({
  block,
  messageId,
  disabled,
  submittedResponse,
}: {
  block: InteractiveBlock
  messageId: string
  disabled?: boolean
  submittedResponse?: InteractiveResponseMetadata | null
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const [submitting, setSubmitting] = useState(false)
  const [serverResponse, setServerResponse] = useState<InteractiveResponseMetadata | null>(null)
  const effectiveResponse = submittedResponse ?? serverResponse
  const [done, setDone] = useState<string | null>(submittedResponse?.actionId ?? null)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (submittedResponse) setServerResponse(null)
  }, [submittedResponse])

  useEffect(() => {
    if (block.oneShot === false || submittedResponse?.actionId) return
    let alive = true
    const query = new URLSearchParams({ blockId: block.id }).toString()
    fetchApi<{ submitted: boolean; response?: InteractiveResponseMetadata }>(
      `/api/messages/${messageId}/interactive-state?${query}`,
    )
      .then((state) => {
        if (alive && state.submitted && state.response) setServerResponse(state.response)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [block.id, block.oneShot, messageId, submittedResponse?.actionId])

  useEffect(() => {
    if (effectiveResponse?.actionId) setDone(effectiveResponse.actionId)
  }, [effectiveResponse?.actionId])

  const send = useCallback(
    async (actionId: string, value: string, label: string, values?: Record<string, string>) => {
      if (submittingRef.current || (block.oneShot !== false && done)) return
      submittingRef.current = true
      const previousDone = done
      setSubmitting(true)
      if (block.oneShot !== false) setDone(actionId)
      setError(null)
      try {
        const result = await fetchApi<
          | {
              metadata?: {
                interactiveResponse?: InteractiveResponseMetadata
                interactiveState?: { response?: InteractiveResponseMetadata }
              }
            }
          | { interactiveState?: { response?: InteractiveResponseMetadata } }
        >(`/api/messages/${messageId}/interactive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId: block.id,
            actionId,
            value,
            label,
            ...(values ? { values } : {}),
          }),
        })
        const resultRecord = result as {
          metadata?: {
            interactiveResponse?: InteractiveResponseMetadata
            interactiveState?: { response?: InteractiveResponseMetadata }
          }
          interactiveState?: { response?: InteractiveResponseMetadata }
        }
        const nextResponse =
          resultRecord.metadata?.interactiveState?.response ??
          resultRecord.metadata?.interactiveResponse ??
          resultRecord.interactiveState?.response
        if (nextResponse) setServerResponse(nextResponse)
        setDone(actionId)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      } catch (e) {
        if (block.oneShot !== false) setDone(previousDone)
        setError(e instanceof Error ? e.message : t('chat.interactiveSubmitFailed'))
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [block.id, block.oneShot, done, messageId, t],
  )

  const isLocked =
    !!disabled || submitting || (block.oneShot !== false && (done !== null || !!effectiveResponse))

  const isFormLike = block.kind === 'form' || block.kind === 'approval'

  const items = isFormLike
    ? []
    : block.kind === 'select'
      ? (block.options ?? []).map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          style: undefined as undefined | 'primary' | 'secondary' | 'destructive',
        }))
      : (block.buttons ?? []).map((b) => ({
          id: b.id,
          label: b.label,
          value: b.value ?? b.id,
          style: b.style,
        }))

  return (
    <View
      style={[styles.interactive, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {block.prompt ? (
        <Text style={[styles.interactivePrompt, { color: colors.textSecondary }]}>
          {block.prompt}
        </Text>
      ) : null}

      {isFormLike ? (
        <InteractiveFormBody
          block={block}
          isLocked={isLocked}
          colors={colors}
          submittedValues={effectiveResponse?.values}
          onSubmit={(actionId, label, values) => send(actionId, actionId, label, values)}
        />
      ) : (
        <View style={styles.interactiveRow}>
          {items.map((it) => {
            const isPicked = done === it.id
            const isDanger = it.style === 'destructive'
            const isPrimary = it.style === 'primary' || isPicked
            return (
              <Button
                key={it.id}
                disabled={isLocked && !isPicked}
                variant={isDanger ? 'danger' : isPrimary ? 'primary' : 'glass'}
                size="xs"
                icon={isPicked ? Check : undefined}
                style={styles.interactiveButton}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {})
                  send(it.id, it.value, it.label)
                }}
              >
                {it.label}
              </Button>
            )
          })}
        </View>
      )}

      {error ? (
        <Text style={[styles.interactiveError, { color: colors.error }]}>{error}</Text>
      ) : null}
    </View>
  )
}

/**
 * Mobile renderer for `kind: 'form' | 'approval'` interactive blocks.
 * Uses controlled TextInput / option-pill rows; checkbox is a toggle pill.
 */
function InteractiveFormBody({
  block,
  isLocked,
  colors,
  submittedValues,
  onSubmit,
}: {
  block: InteractiveBlock
  isLocked: boolean
  colors: ReturnType<typeof useColors>
  submittedValues?: Record<string, string>
  onSubmit: (actionId: string, label: string, values: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const initial = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of block.fields ?? []) {
      out[f.id] =
        submittedValues?.[f.id] ?? f.defaultValue ?? (f.kind === 'checkbox' ? 'false' : '')
    }
    return out
  }, [block.fields, submittedValues])
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (submittedValues) setValues(initial)
  }, [initial, submittedValues])

  const setField = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }))
  const missingRequired = (block.fields ?? []).some((f) => f.required && !values[f.id]?.trim())

  const submit = (actionId: string, label: string) => {
    if (isLocked) return
    setTouched(true)
    if (missingRequired) return
    onSubmit(actionId, label, values)
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {(block.fields ?? []).map((f) => {
        const v = values[f.id] ?? ''
        const showError = touched && f.required && !v.trim()
        return (
          <View key={f.id} style={{ gap: spacing.xs }}>
            <Text style={[styles.interactivePrompt, { color: colors.textSecondary }]}>
              {f.label}
              {f.required ? <Text style={{ color: colors.error }}> *</Text> : null}
            </Text>
            {f.kind === 'checkbox' ? (
              <ChipButton
                disabled={isLocked}
                onPress={() => setField(f.id, v === 'true' ? 'false' : 'true')}
                active={v === 'true'}
                icon={v === 'true' ? Check : undefined}
                label={v === 'true' ? t('chat.interactiveOn') : t('chat.interactiveOff')}
                style={styles.interactiveButton}
              />
            ) : f.kind === 'select' ? (
              <View style={styles.interactiveRow}>
                {(f.options ?? []).map((o) => {
                  const picked = v === o.value
                  return (
                    <ChipButton
                      key={o.id}
                      disabled={isLocked}
                      onPress={() => setField(f.id, o.value)}
                      active={picked}
                      label={o.label}
                      style={styles.interactiveButton}
                    />
                  )
                })}
              </View>
            ) : (
              <TextInput
                value={v}
                onChangeText={(t) => setField(f.id, t)}
                editable={!isLocked}
                placeholder={f.placeholder}
                placeholderTextColor={colors.textMuted}
                keyboardType={f.kind === 'number' ? 'numeric' : 'default'}
                multiline={f.kind === 'textarea'}
                maxLength={f.maxLength}
                style={{
                  borderWidth: border.hairline,
                  borderColor: colors.border,
                  borderRadius: radius.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.tight,
                  color: colors.text,
                  minHeight: f.kind === 'textarea' ? 60 : undefined,
                  textAlignVertical: f.kind === 'textarea' ? 'top' : 'center',
                }}
              />
            )}
            {showError ? (
              <Text style={[styles.interactiveError, { color: colors.error }]}>
                {t('chat.interactiveRequired')}
              </Text>
            ) : null}
          </View>
        )
      })}

      <View style={styles.interactiveRow}>
        {block.kind === 'form' ? (
          <Button
            disabled={isLocked}
            onPress={() => submit('submit', block.submitLabel ?? t('chat.interactiveSubmit'))}
            variant="primary"
            size="xs"
            style={styles.interactiveButton}
          >
            {block.submitLabel ?? t('chat.interactiveSubmit')}
          </Button>
        ) : (
          <>
            <Button
              disabled={isLocked}
              onPress={() => submit('approve', t('chat.interactiveApprove'))}
              variant="primary"
              size="xs"
              icon={Check}
              style={styles.interactiveButton}
            >
              {t('chat.interactiveApprove')}
            </Button>
            <Button
              disabled={isLocked}
              onPress={() => submit('reject', t('chat.interactiveReject'))}
              variant="danger"
              size="xs"
              icon={X}
              style={styles.interactiveButton}
            >
              {t('chat.interactiveReject')}
            </Button>
          </>
        )}
      </View>
    </View>
  )
}
