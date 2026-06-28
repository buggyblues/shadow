import type {
  BuddyInboxViewMode,
  CommerceProductCard,
  MentionSuggestion,
  MentionSuggestionTrigger,
  MessageMention,
  TaskMessageCardTag,
} from '@shadowob/shared'
import { assignMentionRanges, canonicalMentionToken } from '@shadowob/shared'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  InputValley,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@shadowob/ui'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AppWindow,
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  Command as CommandIcon,
  FileText,
  Flag,
  FolderOpen,
  Hash,
  Image as ImageIcon,
  ListTodo,
  Loader2,
  type LucideIcon,
  MessageSquare,
  Mic,
  Plus,
  Search,
  Server as ServerIcon,
  ShoppingBag,
  Smile,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useDraftStorage } from '../../hooks/use-draft-storage'
import { fetchApi } from '../../lib/api'
import { getSocket, sendTyping, sendWsMessage } from '../../lib/socket'
import { playSendSound } from '../../lib/sounds'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { UserAvatar } from '../common/avatar'
import { EmojiPicker, preloadEmojiPicker } from '../common/emoji-picker'
import { type PickerResult, WorkspaceFilePicker } from '../workspace'
import { ImageViewer } from './image-viewer'

interface MessageInputProps {
  channelId: string
  channelName?: string
  threadId?: string | null
  threadName?: string
  replyToId?: string | null
  replyToMessage?: ReplyPreviewMessage | null
  onClearReply?: () => void
  placeholder?: string
  hideReplyIndicator?: boolean
  messageMetadata?: Record<string, unknown>
  externalFiles?: File[]
  onExternalFilesConsumed?: () => void
  enableTaskCards?: boolean
  inboxViewMode?: BuddyInboxViewMode
  onInboxViewModeChange?: (mode: BuddyInboxViewMode) => void
  onMessageSent?: (message: Record<string, unknown>) => void
  stackedControls?: boolean
  compactComposer?: boolean
  edgeToEdgeComposer?: boolean
  composerTextareaHeight?: number
  completionItems?: string[]
  highContrastSurface?: boolean
}

interface ReplyPreviewMessage {
  id: string
  content: string
  author?: {
    id?: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  attachments?: Array<{
    filename?: string | null
  }>
}

interface PendingFile {
  file: File
  preview?: string
  kind?: 'file' | 'image' | 'voice'
  durationMs?: number
  waveformPeaks?: number[]
  waveformVersion?: number
  transcriptText?: string
  transcriptLanguage?: string
  transcriptSource?: 'client' | 'runtime'
  /** If set, this file comes from workspace and already has a URL (skip re-upload) */
  workspaceUrl?: string
  workspaceName?: string
  workspaceMime?: string
  workspaceSize?: number
}

type BrowserSpeechRecognitionResult = {
  isFinal: boolean
  0?: {
    transcript?: string
  }
}

type BrowserSpeechRecognitionEvent = {
  resultIndex?: number
  results: ArrayLike<BrowserSpeechRecognitionResult>
}

type BrowserSpeechRecognitionErrorEvent = {
  error?: string
  message?: string
}

type BrowserSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

type MessagesPage = { messages: Record<string, unknown>[]; hasMore: boolean }

const sentMessageHistoryByScope = new Map<string, string[]>()
const SENT_MESSAGE_HISTORY_LIMIT = 20

function getPendingFileKey(pf: PendingFile): string {
  return [
    pf.workspaceUrl,
    pf.preview,
    pf.file.name,
    pf.file.type,
    String(pf.file.size),
    String(pf.file.lastModified),
  ]
    .filter(Boolean)
    .join('::')
}

function pickVoiceMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

function voiceFileExtension(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function fallbackWaveformPeaks(count = 48) {
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index * 0.85) * 0.35 + Math.sin(index * 0.29) * 0.22
    return Math.max(10, Math.min(100, Math.round(48 + wave * 70)))
  })
}

async function buildWaveformPeaks(blob: Blob, count = 48) {
  if (typeof window === 'undefined') return fallbackWaveformPeaks(count)
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return fallbackWaveformPeaks(count)
  const audioContext = new AudioContextCtor()
  try {
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
    const samples = audioBuffer.getChannelData(0)
    const samplesPerPeak = Math.max(1, Math.floor(samples.length / count))
    const rawPeaks = Array.from({ length: count }, (_, index) => {
      const start = index * samplesPerPeak
      const end = Math.min(samples.length, start + samplesPerPeak)
      let max = 0
      for (let i = start; i < end; i += 1) {
        max = Math.max(max, Math.abs(samples[i] ?? 0))
      }
      return max
    })
    const maxPeak = Math.max(...rawPeaks, 0.01)
    return rawPeaks.map((peak) => Math.max(5, Math.min(100, Math.round((peak / maxPeak) * 100))))
  } catch {
    return fallbackWaveformPeaks(count)
  } finally {
    await audioContext.close().catch(() => undefined)
  }
}

function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const RECORDING_PREVIEW_PEAKS = [
  22, 38, 18, 44, 72, 32, 86, 58, 30, 66, 48, 26, 54, 36, 24, 42, 28, 34, 30, 38, 26, 32, 28, 34,
  26, 30, 24, 28,
]

const RECORDING_VIEW_BARS = Array.from({ length: 38 }, (_, index) => {
  const center = 18.5
  const distanceFromCenter = Math.abs(center - index)
  const pseudoRandom = (Math.sin(index * 12.9898) * 43758.5453) % 1
  const randomUnit = Math.abs(pseudoRandom)
  const baseHeight = 28 - distanceFromCenter * 1.2
  return {
    height: Math.max(6, Math.round(baseHeight + randomUnit * 12 - 6)),
    opacity: Math.max(0.3, 1 - distanceFromCenter / center),
    animationDelay: -randomUnit * 2,
    animationDuration: 0.6 + ((index * 37) % 60) / 100,
  }
})

function composerViewClass(active: boolean) {
  return cn(
    'col-start-1 row-start-1 min-w-0 w-full transition-[opacity,transform,visibility] duration-300 ease-out',
    active
      ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100'
      : 'pointer-events-none invisible translate-y-2 scale-[0.98] opacity-0',
  )
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

interface CommerceProductPickerGroup {
  key: string
  labelKey: string
  shopName?: string | null
  cards: CommerceProductCard[]
}

interface CommerceProductPickerResponse {
  cards: CommerceProductCard[]
  groups?: CommerceProductPickerGroup[]
}

function getCommerceCardPrice(
  card: CommerceProductCard,
  t?: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (card.snapshot.currency === 'shrimp_coin') {
    const unit = t?.('common.shrimpCoin') ?? 'shrimp_coin'
    return `${card.snapshot.price.toLocaleString()} ${unit}`
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: card.snapshot.currency,
    maximumFractionDigits: 2,
  }).format(card.snapshot.price / 100)
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
    appId: suggestion.appId,
    appKey: suggestion.appKey,
    appName: suggestion.appName,
    iconUrl: suggestion.iconUrl,
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

type TaskDraftPriority = 'low' | 'normal' | 'medium' | 'high'

const taskPriorityOptions: TaskDraftPriority[] = ['low', 'normal', 'medium', 'high']

function taskPriorityDotClass(priority: TaskDraftPriority) {
  if (priority === 'high') {
    return 'bg-[#FF2A55] shadow-[0_0_6px_rgba(255,42,85,0.8)]'
  }
  if (priority === 'medium') {
    return 'bg-[#FFB020] shadow-[0_0_6px_rgba(255,176,32,0.75)]'
  }
  if (priority === 'normal') {
    return 'bg-[#00F3FF] shadow-[0_0_6px_rgba(0,243,255,0.7)]'
  }
  return 'bg-white/45'
}

function taskPriorityLabelClass(priority: TaskDraftPriority) {
  if (priority === 'high') return 'text-[#FF2A55]'
  if (priority === 'medium') return 'text-[#FFB020]'
  if (priority === 'normal') return 'text-[#00F3FF]'
  return 'text-white/55'
}

function taskPrioritySelectedClass(priority: TaskDraftPriority) {
  if (priority === 'high') {
    return 'bg-[#FF2A55]/12 text-[#FF2A55]'
  }
  if (priority === 'medium') return 'bg-[#FFB020]/12 text-[#FFB020]'
  if (priority === 'normal') return 'bg-[#00F3FF]/12 text-[#00F3FF]'
  if (priority === 'low') return 'bg-white/8 text-white/65'
  return 'bg-primary/15 text-primary'
}

interface InlineSwitcherOption<TValue extends string> {
  value: TValue
  label: string
  icon?: LucideIcon
  dotClassName?: string
  labelClassName?: string
  selectedClassName?: string
}

function InlineOptionSwitcher<TValue extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  align = 'start',
  triggerClassName,
  contentClassName,
}: {
  value: TValue
  options: InlineSwitcherOption<TValue>[]
  onChange: (value: TValue) => void
  ariaLabel: string
  align?: 'start' | 'center' | 'end'
  triggerClassName?: string
  contentClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) ?? options[0]
  if (!selected) return null

  const SelectedIcon = selected.icon

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-tertiary/45 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:h-9',
            triggerClassName,
          )}
        >
          {selected.dotClassName ? (
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', selected.dotClassName)} />
          ) : (
            SelectedIcon && <SelectedIcon size={16} strokeWidth={2.1} className="shrink-0" />
          )}
          <span className={cn('min-w-0 truncate text-left', selected.labelClassName)}>
            {selected.label}
          </span>
          <ChevronDown size={14} strokeWidth={2.2} className="shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className={cn('!w-fit min-w-[7rem] rounded-2xl p-1.5', contentClassName)}
      >
        <div className="grid gap-1">
          {options.map((option) => {
            const selectedOption = option.value === value
            const OptionIcon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex h-9 w-full items-center justify-start gap-2 rounded-lg px-2 text-left text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                  selectedOption
                    ? (option.selectedClassName ?? 'bg-primary/15 text-primary')
                    : cn(
                        'text-text-secondary hover:bg-bg-tertiary/70 hover:text-text-primary',
                        option.labelClassName,
                      ),
                )}
              >
                {option.dotClassName ? (
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', option.dotClassName)} />
                ) : (
                  OptionIcon && <OptionIcon size={15} strokeWidth={2.2} className="shrink-0" />
                )}
                <span className="min-w-0 truncate">{option.label}</span>
                {selectedOption && <Check size={14} strokeWidth={2.4} className="shrink-0" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
const taskTagPresetOptions = ['research', 'script', 'render', 'qa', 'publish'] as const

function taskDraftToInput(value: string): { title: string; body?: string } {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const firstLine = lines[0] ?? ''
  const title =
    firstLine
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*]\s+/, '')
      .slice(0, 120)
      .trim() || value.trim().slice(0, 120)
  const body = lines.slice(1).join('\n').trim()
  return {
    title,
    ...(body ? { body } : {}),
  }
}

function taskTagsToInput(value: string): TaskMessageCardTag[] | undefined {
  const tags = value
    .split(/[,，#\s]+/u)
    .map((tag) => tag.trim().replace(/^#+/u, ''))
    .filter(Boolean)
  const unique = [...new Set(tags)].slice(0, 12)
  return unique.length > 0 ? unique : undefined
}

function taskTagsToValues(value: string): string[] {
  return (taskTagsToInput(value) ?? [])
    .map((tag) => (typeof tag === 'string' ? tag : tag.label))
    .filter(Boolean)
}

function taskTagValuesToInput(values: string[]) {
  return [...new Set(values.map((tag) => tag.trim()).filter(Boolean))].slice(0, 12).join(', ')
}

function syncComposerTextareaHeight(el: HTMLTextAreaElement) {
  if (!el.value) {
    el.style.height = ''
    return
  }
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

function normalizeComposerCompletionItems(items: string[] | undefined) {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const item of items ?? []) {
    const value = item.trim().slice(0, 200)
    if (!value) continue
    const key = value.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(value)
    if (normalized.length >= 12) break
  }
  return normalized
}

function getReplyPreviewText(
  message: ReplyPreviewMessage | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!message) return t('chat.replyingTo')
  const content = message.content.trim().replace(/\s+/g, ' ')
  if (content) return content
  const attachmentName = message.attachments?.find((attachment) => attachment.filename)?.filename
  return attachmentName ?? t('chat.searchAttachmentOnly')
}

export function MessageInput({
  channelId,
  channelName,
  threadId = null,
  threadName,
  replyToId,
  replyToMessage,
  onClearReply,
  placeholder,
  hideReplyIndicator = false,
  messageMetadata,
  externalFiles,
  onExternalFilesConsumed,
  enableTaskCards = false,
  inboxViewMode,
  onInboxViewModeChange,
  onMessageSent,
  stackedControls = false,
  compactComposer = false,
  edgeToEdgeComposer = false,
  composerTextareaHeight,
  completionItems,
  highContrastSurface = false,
}: MessageInputProps) {
  const { t, i18n } = useTranslation()
  const activeServerId = useChatStore((state) => state.activeServerId)
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [taskDraft, setTaskDraft] = useState('')
  const [taskPriority, setTaskPriority] = useState<TaskDraftPriority>('normal')
  const [taskTags, setTaskTags] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [selectedCommerceCards, setSelectedCommerceCards] = useState<CommerceProductCard[]>([])
  const [viewingImage, setViewingImage] = useState<PendingFile | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const taskTextareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const historyBrowseIndexRef = useRef(-1)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<BlobPart[]>([])
  const voiceRecordingStartedAtRef = useRef(0)
  const voiceRecordingCancelledRef = useRef(false)
  const voiceRecordingSubmitOnStopRef = useRef(false)
  const voiceMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceSpeechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const voiceSpeechCapturingRef = useRef(false)
  const voiceFinalTranscriptRef = useRef<string[]>([])
  const voiceInterimTranscriptRef = useRef('')
  const dictationRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const dictationBaseContentRef = useRef('')
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceRecordingMs, setVoiceRecordingMs] = useState(0)
  const [dictationListening, setDictationListening] = useState(false)
  const [useCompactPlaceholder, setUseCompactPlaceholder] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 420px)').matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 420px)')
    const sync = () => setUseCompactPlaceholder(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!voiceRecording) return
    const timer = window.setInterval(() => {
      setVoiceRecordingMs(Date.now() - voiceRecordingStartedAtRef.current)
    }, 200)
    return () => window.clearInterval(timer)
  }, [voiceRecording])

  useEffect(() => {
    return () => {
      voiceSpeechCapturingRef.current = false
      voiceSpeechRecognitionRef.current?.abort()
      voiceSpeechRecognitionRef.current = null
      dictationRecognitionRef.current?.abort()
      dictationRecognitionRef.current = null
      voiceRecorderRef.current?.stop()
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current)
    }
  }, [])

  const speechRecognitionLanguage =
    i18n.language ||
    (typeof navigator === 'undefined' ? '' : navigator.language) ||
    (typeof document === 'undefined' ? '' : document.documentElement.lang) ||
    'zh-CN'

  const composerChannelName = channelName ?? t('chat.channelFallback')
  const composerPlaceholder =
    placeholder ??
    (threadId
      ? t('chat.threadInputPlaceholder', {
          threadName: threadName ?? t('chat.thread'),
        })
      : t(useCompactPlaceholder ? 'chat.inputPlaceholderCompact' : 'chat.inputPlaceholder', {
          channelName: composerChannelName,
        }))
  const showInboxComposerControls = enableTaskCards && Boolean(inboxViewMode)
  const canChangeInboxViewMode = showInboxComposerControls && Boolean(onInboxViewModeChange)
  const isInboxTaskComposer = showInboxComposerControls && inboxViewMode === 'tasks'
  const activeComposerPlaceholder = isInboxTaskComposer
    ? (placeholder ?? t('inbox.task.quickPlaceholder'))
    : composerPlaceholder
  const composerTextareaStyle = composerTextareaHeight
    ? ({
        minHeight: composerTextareaHeight,
        maxHeight: composerTextareaHeight,
      } satisfies CSSProperties)
    : undefined
  const recordingVisualizerActive = voiceRecording || dictationListening
  const stackedComposerStyle = stackedControls
    ? {
        background: 'transparent',
        border: 0,
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }
    : undefined
  const composerControlButtonClassName = compactComposer ? 'h-8 w-8' : 'h-10 w-10'
  const composerControlIconSize = compactComposer ? 17 : 20
  const composerSendIconSize = compactComposer ? 16 : 18
  const composerRecordingRowClassName = compactComposer ? 'h-8' : 'h-10'
  const composerRecordingControlsGapClassName = compactComposer ? 'gap-2' : 'gap-3'
  const taskTitleInput = taskDraftToInput(taskDraft)
  const replyAuthorName =
    replyToMessage?.author?.displayName?.trim() || replyToMessage?.author?.username?.trim() || null
  const replyPreviewText = getReplyPreviewText(replyToMessage, t)
  const selectedTaskTags = useMemo(() => taskTagsToValues(taskTags), [taskTags])
  const inboxModeOptions = useMemo<InlineSwitcherOption<BuddyInboxViewMode>[]>(
    () => [
      { value: 'chat', label: t('inbox.mode.chat'), icon: MessageSquare },
      { value: 'tasks', label: t('inbox.mode.tasks'), icon: ListTodo },
    ],
    [t],
  )
  const taskPrioritySwitcherOptions = useMemo<InlineSwitcherOption<TaskDraftPriority>[]>(
    () =>
      taskPriorityOptions.map((priority) => ({
        value: priority,
        label: t(`inbox.task.priority.${priority}`),
        dotClassName: taskPriorityDotClass(priority),
        labelClassName: taskPriorityLabelClass(priority),
        selectedClassName: taskPrioritySelectedClass(priority),
      })),
    [t],
  )

  const selectInboxViewMode = useCallback(
    (mode: BuddyInboxViewMode) => {
      if (!onInboxViewModeChange) return
      onInboxViewModeChange?.(mode)
      setShowAttachMenu(false)
      requestAnimationFrame(() => {
        if (mode === 'tasks') {
          taskTextareaRef.current?.focus()
          return
        }
        textareaRef.current?.focus()
      })
    },
    [onInboxViewModeChange],
  )

  const toggleTaskTagPreset = useCallback((tag: string) => {
    setTaskTags((current) => {
      const nextValues = taskTagsToValues(current)
      if (nextValues.includes(tag)) {
        return taskTagValuesToInput(nextValues.filter((item) => item !== tag))
      }
      return taskTagValuesToInput([...nextValues, tag])
    })
  }, [])

  const focusComposer = useCallback(() => {
    if (isInboxTaskComposer) {
      taskTextareaRef.current?.focus({ preventScroll: true })
      return
    }
    const textarea = textareaRef.current
    if (!textarea || textarea.disabled) return
    if (document.querySelector('[role="dialog"]')) return
    textarea.focus({ preventScroll: true })
    const cursor = textarea.value.length
    textarea.setSelectionRange(cursor, cursor)
  }, [isInboxTaskComposer])

  // Auto-focus textarea when channel changes
  useEffect(() => {
    let animationFrame = window.requestAnimationFrame(focusComposer)
    const timers = [80, 220, 520].map((delay) => window.setTimeout(focusComposer, delay))
    return () => {
      window.cancelAnimationFrame(animationFrame)
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [channelId, focusComposer])

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const el = isInboxTaskComposer ? taskTextareaRef.current : textareaRef.current
      if (!el) return
      syncComposerTextareaHeight(el)
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [isInboxTaskComposer])

  // Draft storage for persistent input
  const draftScopeId = threadId ? `thread:${threadId}` : channelId
  const { scheduleSave, clear: clearDraft } = useDraftStorage(draftScopeId, (savedText) => {
    setContent(savedText)
    // Auto-resize textarea after restoring content
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) syncComposerTextareaHeight(el)
    })
  })

  useEffect(() => {
    historyBrowseIndexRef.current = -1
  }, [draftScopeId])

  const recordSentMessageHistory = useCallback(
    (text: string) => {
      const normalized = text.trim()
      if (!normalized) return
      const current = sentMessageHistoryByScope.get(draftScopeId) ?? []
      sentMessageHistoryByScope.set(
        draftScopeId,
        [normalized, ...current.filter((item) => item !== normalized)].slice(
          0,
          SENT_MESSAGE_HISTORY_LIMIT,
        ),
      )
      historyBrowseIndexRef.current = -1
    },
    [draftScopeId],
  )

  const recallSentMessageHistory = useCallback(() => {
    const textarea = textareaRef.current
    const history = sentMessageHistoryByScope.get(draftScopeId) ?? []
    if (!textarea || history.length === 0) return false
    if (content.trim()) return false
    historyBrowseIndexRef.current = Math.min(historyBrowseIndexRef.current + 1, history.length - 1)
    const recalled = history[historyBrowseIndexRef.current] ?? ''
    if (!recalled) return false
    setContent(recalled)
    scheduleSave(recalled)
    requestAnimationFrame(() => {
      textarea.focus()
      syncComposerTextareaHeight(textarea)
      textarea.setSelectionRange(recalled.length, recalled.length)
    })
    return true
  }, [content, draftScopeId, scheduleSave])

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionTrigger, setMentionTrigger] = useState<MentionSuggestionTrigger | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [selectedMentions, setSelectedMentions] = useState<MessageMention[]>([])
  const mentionListRef = useRef<HTMLDivElement>(null)

  // Slash command autocomplete state
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashListRef = useRef<HTMLDivElement>(null)
  const [completionIndex, setCompletionIndex] = useState(0)
  const [completionDismissedFor, setCompletionDismissedFor] = useState<string | null>(null)
  const completionListRef = useRef<HTMLDivElement>(null)

  const { data: mentionSuggestionData } = useQuery({
    queryKey: ['mention-suggestions', channelId, mentionTrigger, mentionQuery ?? ''],
    queryFn: () => {
      const params = new URLSearchParams({
        channelId,
        trigger: mentionTrigger ?? '@',
        q: mentionQuery ?? '',
        limit: '20',
      })
      return fetchApi<{ suggestions: MentionSuggestion[] }>(`/api/mentions/suggest?${params}`)
    },
    enabled: Boolean(activeServerId && channelId && mentionTrigger && mentionQuery !== null),
    staleTime: 5_000,
  })

  const { data: slashCommandData } = useQuery({
    queryKey: ['channel-slash-commands', channelId],
    queryFn: () =>
      fetchApi<{ commands: SlashCommand[] }>(`/api/channels/${channelId}/slash-commands`),
    enabled: Boolean(activeServerId && channelId),
    staleTime: 30_000,
    refetchOnMount: false,
  })

  const { data: productPickerData, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['commerce-product-picker', 'channel', channelId, productQuery],
    queryFn: () =>
      fetchApi<CommerceProductPickerResponse>(
        `/api/commerce/product-picker?target=channel&channelId=${encodeURIComponent(channelId)}&keyword=${encodeURIComponent(productQuery.trim())}`,
      ),
    enabled: Boolean(channelId && showProductPicker),
    staleTime: 15_000,
  })

  const slashCommands = slashCommandData?.commands ?? []

  useEffect(() => {
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

  const mentionSuggestions = mentionSuggestionData?.suggestions ?? []

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

  const normalizedCompletionItems = useMemo(
    () => normalizeComposerCompletionItems(completionItems),
    [completionItems],
  )
  const filteredCompletionItems = useMemo(() => {
    if (
      isInboxTaskComposer ||
      slashQuery !== null ||
      mentionQuery !== null ||
      completionDismissedFor === content
    ) {
      return []
    }
    const query = content.trim().toLocaleLowerCase()
    if (!query) return []
    return normalizedCompletionItems
      .filter((item) => {
        const normalized = item.toLocaleLowerCase()
        return normalized !== query && normalized.includes(query)
      })
      .slice(0, 6)
  }, [
    completionDismissedFor,
    content,
    isInboxTaskComposer,
    mentionQuery,
    normalizedCompletionItems,
    slashQuery,
  ])

  useEffect(() => {
    setCompletionIndex((current) =>
      filteredCompletionItems.length === 0
        ? 0
        : Math.min(current, filteredCompletionItems.length - 1),
    )
  }, [filteredCompletionItems.length])

  const productCards = productPickerData?.cards ?? []
  const productPickerGroups = useMemo<CommerceProductPickerGroup[]>(() => {
    const groups = productPickerData?.groups?.filter((group) => group.cards.length > 0)
    if (groups?.length) return groups
    return productCards.length
      ? [{ key: 'all', labelKey: 'chat.productPickerGroupAll', cards: productCards }]
      : []
  }, [productPickerData?.groups, productCards])

  const addCommerceCard = useCallback((card: CommerceProductCard) => {
    setSelectedCommerceCards((prev) => {
      if (
        prev.some(
          (item) =>
            (item.offerId && item.offerId === card.offerId) ||
            (item.productId === card.productId && item.skuId === card.skuId),
        )
      ) {
        return prev
      }
      return [...prev, card].slice(0, 3)
    })
    setShowProductPicker(false)
    textareaRef.current?.focus()
  }, [])

  const removeCommerceCard = useCallback((cardId: string) => {
    setSelectedCommerceCards((prev) => prev.filter((card) => card.id !== cardId))
  }, [])

  const removeComposerRange = useCallback(
    (start: number, end: number) => {
      const textarea = textareaRef.current
      const next = `${content.slice(0, start)}${content.slice(end)}`
      setContent(next)
      scheduleSave(next)
      requestAnimationFrame(() => {
        textarea?.focus()
        textarea?.setSelectionRange(start, start)
      })
    },
    [content, scheduleSave],
  )

  const openProductPickerFromComposer = useCallback(
    (start?: number, end?: number) => {
      if (typeof start === 'number' && typeof end === 'number') {
        removeComposerRange(start, end)
      }
      setSlashQuery(null)
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
      setShowAttachMenu(false)
      setShowProductPicker(true)
    },
    [removeComposerRange],
  )

  const openFileDialog = useCallback((accept?: string) => {
    const input = fileInputRef.current
    if (!input) return
    input.accept = accept ?? ''
    input.click()
    setShowAttachMenu(false)
  }, [])

  const openWorkspacePicker = useCallback(() => {
    setShowAttachMenu(false)
    setShowWorkspacePicker(true)
  }, [])

  const stopVoiceTracks = useCallback(() => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    voiceStreamRef.current = null
    if (voiceMaxTimerRef.current) {
      clearTimeout(voiceMaxTimerRef.current)
      voiceMaxTimerRef.current = null
    }
  }, [])

  const startVoiceTranscriptCapture = useCallback(() => {
    voiceFinalTranscriptRef.current = []
    voiceInterimTranscriptRef.current = ''
    voiceSpeechCapturingRef.current = false

    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = speechRecognitionLanguage
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let interim = ''
      const startIndex = event.resultIndex ?? 0
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result) continue
        const text = result[0]?.transcript?.trim()
        if (!text) continue
        if (result.isFinal) {
          voiceFinalTranscriptRef.current.push(text)
        } else {
          interim = interim ? `${interim} ${text}` : text
        }
      }
      voiceInterimTranscriptRef.current = interim
    }
    recognition.onerror = (event) => {
      console.debug('[voice] speech recognition error', event.error, event.message)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        voiceSpeechCapturingRef.current = false
      }
    }
    recognition.onend = () => {
      if (!voiceSpeechCapturingRef.current) {
        if (voiceSpeechRecognitionRef.current === recognition) {
          voiceSpeechRecognitionRef.current = null
        }
        return
      }
      if (voiceRecorderRef.current?.state === 'recording') {
        try {
          recognition.start()
          return
        } catch (error) {
          console.debug('[voice] speech recognition restart failed', error)
        }
      }
      if (voiceSpeechRecognitionRef.current === recognition) {
        voiceSpeechRecognitionRef.current = null
      }
    }

    try {
      voiceSpeechCapturingRef.current = true
      recognition.start()
      voiceSpeechRecognitionRef.current = recognition
    } catch {
      voiceSpeechCapturingRef.current = false
      voiceSpeechRecognitionRef.current = null
    }
  }, [speechRecognitionLanguage])

  const readVoiceTranscript = useCallback(() => {
    const transcript = [...voiceFinalTranscriptRef.current, voiceInterimTranscriptRef.current]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    voiceFinalTranscriptRef.current = []
    voiceInterimTranscriptRef.current = ''
    return transcript || undefined
  }, [])

  const stopVoiceTranscriptCapture = useCallback(
    async (waitForFinal = true) => {
      voiceSpeechCapturingRef.current = false
      const recognition = voiceSpeechRecognitionRef.current
      voiceSpeechRecognitionRef.current = null
      if (!recognition) return readVoiceTranscript()

      if (!waitForFinal) {
        recognition.onend = null
        try {
          recognition.abort()
        } catch {}
        return readVoiceTranscript()
      }

      return await new Promise<string | undefined>((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          recognition.onend = null
          recognition.onerror = null
          resolve(readVoiceTranscript())
        }
        const timer = window.setTimeout(finish, 1200)
        recognition.onend = finish
        recognition.onerror = (event) => {
          console.debug('[voice] speech recognition stop error', event.error, event.message)
          finish()
        }
        try {
          recognition.stop()
        } catch {
          finish()
        }
      })
    },
    [readVoiceTranscript],
  )

  const abortVoiceTranscriptCapture = useCallback(() => {
    const recognition = voiceSpeechRecognitionRef.current
    voiceSpeechCapturingRef.current = false
    voiceSpeechRecognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      try {
        recognition.abort()
      } catch {}
    }
    voiceFinalTranscriptRef.current = []
    voiceInterimTranscriptRef.current = ''
  }, [])

  const updateDictationContent = useCallback(
    (finalParts: string[], interimParts: string[]) => {
      const transcript = [...finalParts, ...interimParts].join(' ').replace(/\s+/g, ' ').trim()
      const base = dictationBaseContentRef.current
      const separator = base && transcript && !/\s$/u.test(base) ? ' ' : ''
      const next = transcript ? `${base}${separator}${transcript}` : base
      if (isInboxTaskComposer) {
        setTaskDraft(next)
      } else {
        setContent(next)
        scheduleSave(next)
      }
      requestAnimationFrame(() => {
        const el = isInboxTaskComposer ? taskTextareaRef.current : textareaRef.current
        if (!el) return
        syncComposerTextareaHeight(el)
      })
    },
    [isInboxTaskComposer, scheduleSave],
  )

  const stopDictation = useCallback(() => {
    const recognition = dictationRecognitionRef.current
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      dictationRecognitionRef.current = null
      setDictationListening(false)
    }
  }, [])

  const startDictation = useCallback(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) {
      showToast(t('chat.voiceInputUnavailable'), 'error')
      return
    }

    setShowAttachMenu(false)
    dictationBaseContentRef.current = isInboxTaskComposer ? taskDraft : content

    const recognition = new SpeechRecognition()
    recognition.lang = speechRecognitionLanguage
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const finalParts: string[] = []
      const interimParts: string[] = []
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result) continue
        const text = result?.[0]?.transcript?.trim()
        if (!text) continue
        if (result.isFinal) finalParts.push(text)
        else interimParts.push(text)
      }
      updateDictationContent(finalParts, interimParts)
    }
    recognition.onerror = (event) => {
      console.debug('[voice] dictation error', event.error, event.message)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showToast(t('chat.voiceInputPermissionDenied'), 'error')
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showToast(t('chat.voiceInputUnavailable'), 'error')
      }
      setDictationListening(false)
    }
    recognition.onend = () => {
      if (dictationRecognitionRef.current === recognition) {
        dictationRecognitionRef.current = null
      }
      setDictationListening(false)
      requestAnimationFrame(() => {
        if (isInboxTaskComposer) {
          const el = taskTextareaRef.current
          if (el) {
            syncComposerTextareaHeight(el)
            el.focus()
          }
          return
        }
        textareaRef.current?.focus()
      })
    }

    try {
      recognition.start()
      dictationRecognitionRef.current = recognition
      setDictationListening(true)
    } catch {
      dictationRecognitionRef.current = null
      setDictationListening(false)
      showToast(t('chat.voiceInputUnavailable'), 'error')
    }
  }, [
    content,
    isInboxTaskComposer,
    speechRecognitionLanguage,
    t,
    taskDraft,
    updateDictationContent,
  ])

  const toggleDictation = useCallback(() => {
    if (dictationListening) {
      stopDictation()
      return
    }
    startDictation()
  }, [dictationListening, startDictation, stopDictation])

  const stopVoiceRecording = useCallback(
    (cancel = false, submitOnStop = false) => {
      const recorder = voiceRecorderRef.current
      voiceRecordingCancelledRef.current = cancel
      voiceRecordingSubmitOnStopRef.current = !cancel && submitOnStop
      if (!recorder || recorder.state === 'inactive') {
        setVoiceRecording(false)
        voiceRecordingSubmitOnStopRef.current = false
        abortVoiceTranscriptCapture()
        stopVoiceTracks()
        return
      }
      recorder.stop()
    },
    [abortVoiceTranscriptCapture, stopVoiceTracks],
  )

  const appendCreatedMessage = useCallback(
    (created: Record<string, unknown>) => {
      const createdId = typeof created.id === 'string' ? created.id : null
      if (threadId) {
        queryClient.setQueryData<Record<string, unknown>[]>(
          ['thread-messages', threadId],
          (old) => {
            const messages = old ?? []
            if (createdId && messages.some((message) => message.id === createdId)) {
              return messages.map((message) => (message.id === createdId ? created : message))
            }
            return [...messages, created]
          },
        )
        onMessageSent?.(created)
        return
      }

      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
        if (!old || old.pages.length === 0) {
          return { pages: [{ messages: [created], hasMore: false }], pageParams: [null] }
        }
        const firstPage = old.pages[0]
        if (!firstPage) return old
        if (createdId && firstPage.messages.some((message) => message.id === createdId)) {
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) =>
                message.id === createdId ? created : message,
              ),
            })),
          }
        }
        return {
          ...old,
          pages: [
            {
              ...firstPage,
              messages: [...firstPage.messages, created],
            },
            ...old.pages.slice(1),
          ],
        }
      })
      onMessageSent?.(created)
    },
    [channelId, onMessageSent, queryClient, threadId],
  )

  const sendRecordedVoiceMessage = useCallback(
    async (voice: PendingFile) => {
      if (uploading) return
      setUploading(true)
      const savedReplyTo = replyToId
      playSendSound()
      try {
        const formData = new FormData()
        formData.append('file', voice.file)
        formData.append('kind', 'voice')
        if (voice.durationMs) formData.append('durationMs', String(voice.durationMs))
        if (voice.waveformPeaks)
          formData.append('waveformPeaks', JSON.stringify(voice.waveformPeaks))
        if (voice.transcriptText) formData.append('transcriptText', voice.transcriptText)
        if (voice.transcriptLanguage)
          formData.append('transcriptLanguage', voice.transcriptLanguage)
        if (voice.transcriptSource) formData.append('transcriptSource', voice.transcriptSource)

        const uploaded = await fetchApi<{
          url: string
          size: number
          kind?: 'file' | 'image' | 'voice'
          durationMs?: number
          waveformPeaks?: number[]
        }>('/api/media/upload', {
          method: 'POST',
          body: formData,
        })

        const created = await fetchApi<Record<string, unknown>>(
          threadId ? `/api/threads/${threadId}/messages` : `/api/channels/${channelId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              content: '\u200B',
              ...(savedReplyTo ? { replyToId: savedReplyTo } : {}),
              ...(messageMetadata ? { metadata: messageMetadata } : {}),
              attachments: [
                {
                  filename: voice.file.name,
                  url: uploaded.url,
                  contentType: voice.file.type || 'audio/webm',
                  size: uploaded.size,
                  kind: 'voice',
                  durationMs: voice.durationMs ?? uploaded.durationMs,
                  waveformPeaks: voice.waveformPeaks ?? uploaded.waveformPeaks,
                  waveformVersion: voice.waveformVersion,
                  transcriptText: voice.transcriptText,
                  transcriptLanguage: voice.transcriptLanguage,
                  transcriptSource: voice.transcriptSource,
                },
              ],
            }),
          },
        )

        appendCreatedMessage(created)
        onClearReply?.()
      } catch (error) {
        console.error('Failed to send voice message:', error)
        showToast(error instanceof Error ? error.message : t('chat.sendFailed'), 'error')
      } finally {
        setUploading(false)
        requestAnimationFrame(() => textareaRef.current?.focus())
      }
    },
    [
      appendCreatedMessage,
      channelId,
      messageMetadata,
      onClearReply,
      replyToId,
      t,
      threadId,
      uploading,
    ],
  )

  const startVoiceRecording = useCallback(async () => {
    stopDictation()
    setShowAttachMenu(false)
    if (voiceRecording) {
      stopVoiceRecording(false)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast(t('chat.voiceUnavailable'), 'error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickVoiceMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      voiceStreamRef.current = stream
      voiceRecorderRef.current = recorder
      voiceChunksRef.current = []
      voiceRecordingCancelledRef.current = false
      voiceRecordingStartedAtRef.current = Date.now()
      setVoiceRecordingMs(0)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const durationMs = Date.now() - voiceRecordingStartedAtRef.current
        const cancelled = voiceRecordingCancelledRef.current
        const submitOnStop = voiceRecordingSubmitOnStopRef.current
        const chunks = [...voiceChunksRef.current]
        const transcriptTextPromise = stopVoiceTranscriptCapture(!cancelled)
        voiceRecorderRef.current = null
        voiceChunksRef.current = []
        voiceRecordingSubmitOnStopRef.current = false
        setVoiceRecording(false)
        setVoiceRecordingMs(0)
        stopVoiceTracks()
        if (cancelled) {
          await transcriptTextPromise
          return
        }
        if (durationMs < 1000) {
          await transcriptTextPromise
          showToast(t('chat.voiceTooShort'), 'error')
          return
        }
        const type = chunks.find((chunk) => chunk instanceof Blob)?.type || mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type })
        const [waveformPeaks, transcriptText] = await Promise.all([
          buildWaveformPeaks(blob),
          transcriptTextPromise,
        ])
        const extension = voiceFileExtension(type)
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type })
        const voiceFile: PendingFile = {
          file,
          kind: 'voice',
          durationMs: Math.min(60_000, durationMs),
          waveformPeaks,
          waveformVersion: 1,
          transcriptText,
          transcriptLanguage: transcriptText
            ? speechRecognitionLanguage ||
              (typeof document === 'undefined' ? '' : document.documentElement.lang) ||
              undefined
            : undefined,
          transcriptSource: transcriptText ? 'client' : undefined,
        }
        if (submitOnStop) {
          void sendRecordedVoiceMessage(voiceFile)
          return
        }
        setPendingFiles((prev) => [...prev, voiceFile])
        requestAnimationFrame(() => textareaRef.current?.focus())
      }
      startVoiceTranscriptCapture()
      recorder.start()
      setVoiceRecording(true)
      voiceRecordingSubmitOnStopRef.current = false
      voiceMaxTimerRef.current = setTimeout(() => stopVoiceRecording(false), 60_000)
    } catch (error) {
      stopVoiceTracks()
      showToast(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? t('chat.voicePermissionDenied')
          : t('chat.voiceUnavailable'),
        'error',
      )
    }
  }, [
    sendRecordedVoiceMessage,
    speechRecognitionLanguage,
    startVoiceTranscriptCapture,
    stopVoiceRecording,
    stopVoiceTracks,
    stopVoiceTranscriptCapture,
    stopDictation,
    t,
    voiceRecording,
  ])

  const createTaskCard = useCallback(async () => {
    const input = taskDraftToInput(taskDraft)
    if (!input.title || creatingTask) return
    setCreatingTask(true)
    try {
      const tags = taskTagsToInput(taskTags)
      const created = await fetchApi<Record<string, unknown>>(
        `/api/channels/${channelId}/inbox/tasks`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            priority: taskPriority,
            ...(tags ? { tags } : {}),
          }),
        },
      )
      appendCreatedMessage(created)
      await queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
      setTaskDraft('')
      setTaskPriority('normal')
      setTaskTags('')
      showToast(t('inbox.task.created'), 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('inbox.task.createFailed'), 'error')
    } finally {
      setCreatingTask(false)
      requestAnimationFrame(() => {
        if (isInboxTaskComposer) {
          taskTextareaRef.current?.focus()
          return
        }
        textareaRef.current?.focus()
      })
    }
  }, [
    appendCreatedMessage,
    channelId,
    creatingTask,
    isInboxTaskComposer,
    queryClient,
    t,
    taskDraft,
    taskPriority,
    taskTags,
  ])

  const handleTaskKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === 'Enter' &&
        (event.metaKey || event.ctrlKey) &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault()
        void createTaskCard()
      }
    },
    [createTaskCard],
  )

  // Scroll active mention item into view
  useEffect(() => {
    if (mentionListRef.current && mentionQuery !== null) {
      const item = mentionListRef.current.children[mentionIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [mentionIndex, mentionQuery])

  useEffect(() => {
    if (slashListRef.current && slashQuery !== null) {
      const item = slashListRef.current.children[slashIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [slashIndex, slashQuery])

  // Consume external files dropped into the chat area
  useEffect(() => {
    if (externalFiles && externalFiles.length > 0) {
      const newFiles: PendingFile[] = externalFiles.map((file) => {
        const pf: PendingFile = { file }
        if (file.type.startsWith('image/')) {
          pf.preview = URL.createObjectURL(file)
        }
        return pf
      })
      setPendingFiles((prev) => [...prev, ...newFiles])
      onExternalFilesConsumed?.()
      textareaRef.current?.focus()
    }
  }, [externalFiles, onExternalFilesConsumed])

  // Insert mention/reference at cursor
  const insertMention = useCallback(
    (suggestion: MentionSuggestion) => {
      const textarea = textareaRef.current
      if (!textarea || !mentionTrigger) return

      const cursorPos = textarea.selectionStart
      const text = content

      // Find the trigger that opened this palette
      const beforeCursor = text.slice(0, cursorPos)
      const triggerIndex = beforeCursor.lastIndexOf(mentionTrigger)
      if (triggerIndex === -1) return

      const before = text.slice(0, triggerIndex)
      const after = text.slice(cursorPos)
      const token = `${suggestion.token} `
      const newContent = `${before}${token}${after}`
      setContent(newContent)
      setSelectedMentions((prev) =>
        mergeMention(
          prev,
          mentionFromSuggestion(suggestion, {
            start: triggerIndex,
            end: triggerIndex + suggestion.token.length,
          }),
        ),
      )
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)

      // Restore cursor position after React re-render
      const newCursorPos = triggerIndex + token.length
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      })
    },
    [content, mentionTrigger],
  )

  const insertSlashCommand = useCallback(
    (command: SlashCommand) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const cursorPos = textarea.selectionStart
      const beforeCursor = content.slice(0, cursorPos)
      const after = content.slice(cursorPos)
      const match = beforeCursor.match(/^\/([^\s/]{0,64})$/u)
      if (!match) return

      const token = `/${command.name} `
      const newContent = `${token}${after}`
      setContent(newContent)
      setSlashQuery(null)
      setSlashIndex(0)

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(token.length, token.length)
      })
    },
    [content],
  )

  const acceptCompletion = useCallback(
    (item: string) => {
      const textarea = textareaRef.current
      const next = item.trim()
      if (!textarea || !next) return
      setContent(next)
      setSelectedMentions([])
      setSlashQuery(null)
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
      setCompletionDismissedFor(next)
      scheduleSave(next)

      requestAnimationFrame(() => {
        textarea.focus()
        syncComposerTextareaHeight(textarea)
        textarea.setSelectionRange(next.length, next.length)
      })
    },
    [scheduleSave],
  )

  const handleSend = useCallback(async () => {
    const text = content.trim()
    if (!text && pendingFiles.length === 0 && selectedCommerceCards.length === 0) return

    setUploading(true)
    const mentionsToSend = mentionsForContent(text, selectedMentions)
    const existingCards = Array.isArray(messageMetadata?.cards) ? messageMetadata.cards : []
    const metadataToSend =
      mentionsToSend.length > 0 || selectedCommerceCards.length > 0 || messageMetadata
        ? {
            ...(messageMetadata ?? {}),
            ...(mentionsToSend.length > 0 ? { mentions: mentionsToSend } : {}),
            ...(selectedCommerceCards.length > 0
              ? { cards: [...existingCards, ...selectedCommerceCards] }
              : {}),
          }
        : undefined

    // Insert optimistic message immediately for text-only sends
    const currentUser = useAuthStore.getState().user
    const tempId = `temp-${Date.now()}`
    const threadMessagesKey = threadId ? (['thread-messages', threadId] as const) : null

    if ((text || selectedCommerceCards.length > 0) && pendingFiles.length === 0) {
      const optimisticMsg = {
        id: tempId,
        content: text || '\u200B',
        channelId,
        authorId: currentUser?.id ?? '',
        threadId: threadId ?? null,
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
              avatarUrl: currentUser.avatarUrl,
              isBot: false,
            }
          : undefined,
        metadata: metadataToSend,
        sendStatus: 'sending' as const,
      }

      if (threadMessagesKey) {
        queryClient.setQueryData<Record<string, unknown>[]>(threadMessagesKey, (old) => [
          ...(old ?? []),
          optimisticMsg,
        ])
      } else {
        queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
          if (!old || old.pages.length === 0) return old
          const pages = [...old.pages]
          const firstPage = pages[0]!
          pages[0] = {
            ...firstPage,
            messages: [...firstPage.messages, optimisticMsg],
          }
          return { ...old, pages }
        })
      }
    }

    // Clear input immediately for responsiveness
    const savedContent = text
    const savedReplyTo = replyToId
    const savedPendingFiles = [...pendingFiles]
    const savedMentions = mentionsToSend
    const savedCommerceCards = [...selectedCommerceCards]
    const savedMetadata = metadataToSend
    recordSentMessageHistory(savedContent)
    setContent('')
    setSelectedMentions([])
    setMentionQuery(null)
    setMentionTrigger(null)
    setPendingFiles([])
    setSelectedCommerceCards([])
    onClearReply?.()

    // Clear draft after successful send
    clearDraft()

    if (textareaRef.current) {
      textareaRef.current.style.height = ''
    }

    playSendSound()

    try {
      if (savedPendingFiles.length > 0) {
        const uploadedAttachments: {
          filename: string
          url: string
          contentType: string
          size: number
          kind?: 'file' | 'image' | 'voice'
          durationMs?: number
          waveformPeaks?: number[]
          waveformVersion?: number
          transcriptText?: string
          transcriptLanguage?: string
          transcriptSource?: 'client' | 'runtime'
        }[] = []
        for (const pf of savedPendingFiles) {
          if (pf.workspaceUrl) {
            uploadedAttachments.push({
              filename: pf.workspaceName ?? pf.file.name,
              url: pf.workspaceUrl,
              contentType: pf.workspaceMime ?? (pf.file.type || 'application/octet-stream'),
              size: pf.workspaceSize ?? pf.file.size,
            })
          } else {
            const formData = new FormData()
            formData.append('file', pf.file)
            if (pf.kind) formData.append('kind', pf.kind)
            if (pf.durationMs) formData.append('durationMs', String(pf.durationMs))
            if (pf.waveformPeaks) formData.append('waveformPeaks', JSON.stringify(pf.waveformPeaks))
            if (pf.transcriptText) formData.append('transcriptText', pf.transcriptText)
            if (pf.transcriptLanguage) formData.append('transcriptLanguage', pf.transcriptLanguage)
            if (pf.transcriptSource) formData.append('transcriptSource', pf.transcriptSource)
            const result = await fetchApi<{
              url: string
              size: number
              kind?: 'file' | 'image' | 'voice'
              durationMs?: number
              waveformPeaks?: number[]
            }>('/api/media/upload', {
              method: 'POST',
              body: formData,
            })
            uploadedAttachments.push({
              filename: pf.file.name,
              url: result.url,
              contentType: pf.file.type || 'application/octet-stream',
              size: result.size,
              kind: pf.kind ?? result.kind,
              durationMs: pf.durationMs ?? result.durationMs,
              waveformPeaks: pf.waveformPeaks ?? result.waveformPeaks,
              waveformVersion: pf.waveformVersion,
              transcriptText: pf.transcriptText,
              transcriptLanguage: pf.transcriptLanguage,
              transcriptSource: pf.transcriptSource,
            })
          }
        }

        const contentToSend = savedContent || '\u200B'
        const created = await fetchApi<Record<string, unknown>>(
          threadId ? `/api/threads/${threadId}/messages` : `/api/channels/${channelId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              content: contentToSend,
              ...(savedReplyTo ? { replyToId: savedReplyTo } : {}),
              ...(savedMentions.length > 0 ? { mentions: savedMentions } : {}),
              ...(savedMetadata ? { metadata: savedMetadata } : {}),
              attachments: uploadedAttachments,
            }),
          },
        )
        if (threadMessagesKey) {
          queryClient.setQueryData<Record<string, unknown>[]>(threadMessagesKey, (old) => {
            const messages = old ?? []
            const withoutTemp = messages.filter((m) => m.id !== tempId)
            if (withoutTemp.some((m) => m.id === created.id)) return withoutTemp
            return [...withoutTemp, created]
          })
          onMessageSent?.(created)
        }
      } else if (savedContent || savedCommerceCards.length > 0) {
        const contentToSend = savedContent || '\u200B'
        if (threadId && threadMessagesKey) {
          const created = await fetchApi<Record<string, unknown>>(
            `/api/threads/${threadId}/messages`,
            {
              method: 'POST',
              body: JSON.stringify({
                content: contentToSend,
                ...(savedReplyTo ? { replyToId: savedReplyTo } : {}),
                ...(savedMentions.length > 0 ? { mentions: savedMentions } : {}),
                ...(savedMetadata ? { metadata: savedMetadata } : {}),
              }),
            },
          )
          queryClient.setQueryData<Record<string, unknown>[]>(threadMessagesKey, (old) => {
            const messages = old ?? []
            const withoutTemp = messages.filter((m) => m.id !== tempId)
            if (withoutTemp.some((m) => m.id === created.id)) return withoutTemp
            const replaced = messages.map((m) => (m.id === tempId ? created : m))
            return replaced.some((m) => m.id === created.id) ? replaced : [...replaced, created]
          })
          onMessageSent?.(created)
        } else {
          const sock = getSocket()
          if (sock.connected) {
            sendWsMessage({
              channelId,
              content: contentToSend,
              replyToId: savedReplyTo ?? undefined,
              mentions: savedMentions,
              metadata: savedMetadata,
            })
            // WS: message:new will replace the temp message via dedup in chat-area
            // Set timeout to mark as failed if no confirmation
            setTimeout(() => {
              queryClient.setQueryData<InfiniteData<MessagesPage>>(
                ['messages', channelId],
                (old) => {
                  if (!old) return old
                  const stillPending = old.pages.some((p) =>
                    p.messages.some(
                      (m) =>
                        (m as { id: string; sendStatus?: string }).id === tempId &&
                        (m as { sendStatus?: string }).sendStatus === 'sending',
                    ),
                  )
                  if (stillPending) {
                    return {
                      ...old,
                      pages: old.pages.map((page) => ({
                        ...page,
                        messages: page.messages.map((m) =>
                          (m as { id: string }).id === tempId ? { ...m, sendStatus: 'failed' } : m,
                        ),
                      })),
                    }
                  }
                  return old
                },
              )
            }, 10000)
          } else {
            // Socket not connected — use REST fallback
            await fetchApi(`/api/channels/${channelId}/messages`, {
              method: 'POST',
              body: JSON.stringify({
                content: contentToSend,
                ...(savedReplyTo ? { replyToId: savedReplyTo } : {}),
                ...(savedMentions.length > 0 ? { mentions: savedMentions } : {}),
                ...(savedMetadata ? { metadata: savedMetadata } : {}),
              }),
            })
          }
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err)
      // Mark optimistic message as failed
      if (threadMessagesKey) {
        queryClient.setQueryData<Record<string, unknown>[]>(threadMessagesKey, (old) =>
          (old ?? []).map((m) =>
            (m as { id: string }).id === tempId ? { ...m, sendStatus: 'failed' } : m,
          ),
        )
      } else {
        queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                (m as { id: string }).id === tempId ? { ...m, sendStatus: 'failed' } : m,
              ),
            })),
          }
        })
      }
    } finally {
      setUploading(false)
    }
  }, [
    channelId,
    content,
    pendingFiles,
    replyToId,
    selectedMentions,
    selectedCommerceCards,
    onClearReply,
    onMessageSent,
    queryClient,
    clearDraft,
    messageMetadata,
    recordSentMessageHistory,
    threadId,
  ])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Handle pasted files from clipboard
    const items = e.clipboardData?.items
    if (!items) return

    const files: File[] = []
    for (const item of items) {
      // Check if the item is a file
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault() // Prevent pasting file content as text
      const newFiles: PendingFile[] = files.map((file) => {
        const pf: PendingFile = { file }
        if (file.type.startsWith('image/')) {
          pf.preview = URL.createObjectURL(file)
        }
        return pf
      })
      setPendingFiles((prev) => [...prev, ...newFiles])
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const commerceSlashCommand = slashQuery?.trim().toLocaleLowerCase()
    if (
      slashQuery !== null &&
      (commerceSlashCommand === 'product' || commerceSlashCommand === 'shop') &&
      (e.key === 'Enter' || e.key === 'Tab')
    ) {
      e.preventDefault()
      const textarea = textareaRef.current
      const cursorPos = textarea?.selectionStart ?? content.length
      const beforeCursor = content.slice(0, cursorPos)
      const match = beforeCursor.match(/^\/(?:product|shop)$/iu)
      if (match) {
        openProductPickerFromComposer(0, cursorPos)
      } else {
        openProductPickerFromComposer()
      }
      return
    }

    // Handle slash command autocomplete navigation
    if (slashQuery !== null && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(
          (prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = filteredSlashCommands[slashIndex]
        if (selected) insertSlashCommand(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashQuery(null)
        setSlashIndex(0)
        return
      }
    }

    // Handle mention autocomplete navigation
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(
          (prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length,
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = mentionSuggestions[mentionIndex]
        if (selected) insertMention(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        setMentionTrigger(null)
        setMentionIndex(0)
        return
      }
    }

    if (filteredCompletionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCompletionIndex((prev) => (prev + 1) % filteredCompletionItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCompletionIndex(
          (prev) => (prev - 1 + filteredCompletionItems.length) % filteredCompletionItems.length,
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = filteredCompletionItems[completionIndex]
        if (selected) acceptCompletion(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCompletionDismissedFor(content)
        setCompletionIndex(0)
        return
      }
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const textarea = textareaRef.current
      const cursorAtStart =
        textarea &&
        textarea.selectionStart === 0 &&
        textarea.selectionEnd === 0 &&
        !e.nativeEvent.isComposing
      if (cursorAtStart && recallSentMessageHistory()) {
        e.preventDefault()
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setContent(value)
    if (completionDismissedFor !== null && value !== completionDismissedFor) {
      setCompletionDismissedFor(null)
    }

    // Auto-resize
    const el = e.target
    syncComposerTextareaHeight(el)

    // Detect @mention trigger
    const cursorPos = el.selectionStart
    const beforeCursor = value.slice(0, cursorPos)
    if (/(?:^|\s)\+$/u.test(beforeCursor)) {
      const next = `${value.slice(0, cursorPos - 1)}${value.slice(cursorPos)}`
      setContent(next)
      setSlashQuery(null)
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
      setShowAttachMenu(true)
      scheduleSave(next)
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(cursorPos - 1, cursorPos - 1)
      })
      return
    }
    const slashMatch = beforeCursor.match(/^\/([^\s/]{0,64})$/u)
    if (slashMatch) {
      setSlashQuery(slashMatch[1] ?? '')
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
    } else {
      setSlashQuery(null)
      setSlashIndex(0)
    }

    const mentionMatch = beforeCursor.match(/(?:^|\s)([@#])([^\s@#]{0,128})$/u)
    if (!slashMatch && mentionMatch) {
      setMentionTrigger((mentionMatch[1] as MentionSuggestionTrigger | undefined) ?? '@')
      setMentionQuery(mentionMatch[2] ?? '')
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
    }

    // Typing indicator (heartbeat: send every 2s while typing)
    if (!threadId && !typingTimerRef.current) {
      sendTyping(channelId)
      typingTimerRef.current = setTimeout(() => {
        typingTimerRef.current = null
      }, 2000)
    }

    // Auto-save draft (debounced)
    scheduleSave(value)
  }

  const handleTaskInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setTaskDraft(value)

    const el = e.target
    syncComposerTextareaHeight(el)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newFiles: PendingFile[] = Array.from(files).map((file) => {
      const pf: PendingFile = { file }
      if (file.type.startsWith('image/')) {
        pf.preview = URL.createObjectURL(file)
      }
      return pf
    })

    setPendingFiles((prev) => [...prev, ...newFiles])
    e.target.value = ''
    e.target.accept = ''
  }

  const removeFile = (index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (!files.length) return

    const newFiles: PendingFile[] = Array.from(files).map((file) => {
      const pf: PendingFile = { file }
      if (file.type.startsWith('image/')) {
        pf.preview = URL.createObjectURL(file)
      }
      return pf
    })

    setPendingFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Handle workspace file selection from picker
  const handleWorkspaceFileSelect = useCallback((result: PickerResult) => {
    const node = result.node
    if (!node?.contentRef) return

    // Create a placeholder File object for display purposes
    const placeholderFile = new globalThis.File([], node.name, {
      type: node.mime ?? 'application/octet-stream',
    })

    const pf: PendingFile = {
      file: placeholderFile,
      workspaceUrl: node.contentRef,
      workspaceName: node.name,
      workspaceMime: node.mime ?? undefined,
      workspaceSize: node.sizeBytes ?? undefined,
    }

    // Generate preview for images
    if (node.mime?.startsWith('image/') && node.contentRef) {
      pf.preview = node.contentRef
    }

    setPendingFiles((prev) => [...prev, pf])
    setShowWorkspacePicker(false)
    textareaRef.current?.focus()
  }, [])

  const attachMenuItemClassName = 'gap-3 px-3 py-2.5 text-sm font-bold normal-case tracking-normal'
  const attachMenuCheckItemClassName =
    'gap-3 py-2.5 pr-3 text-sm font-bold normal-case tracking-normal'
  const attachMenuSubTriggerClassName =
    'gap-3 px-3 py-2.5 text-sm font-bold normal-case tracking-normal'
  const attachMenuIconClassName = 'h-[18px] w-[18px] shrink-0 text-primary'

  const handleAttachMenuOpenChange = (open: boolean) => {
    setShowAttachMenu(open)
    if (open && !isInboxTaskComposer) {
      preloadEmojiPicker()
    }
  }

  const renderAttachMenu = (trigger: ReactNode) => (
    <DropdownMenu open={showAttachMenu} onOpenChange={handleAttachMenuOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        data-os-floating-bubble-portal="true"
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        className="w-64 p-1.5"
      >
        <DropdownMenuLabel className="normal-case tracking-normal">
          {t('chat.addMenu')}
        </DropdownMenuLabel>

        {canChangeInboxViewMode && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={attachMenuSubTriggerClassName}>
                <MessageSquare size={18} className="shrink-0 text-primary" />
                <span className="min-w-0 flex-1">{t('chat.addMenuMode')}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                data-os-floating-bubble-portal="true"
                sideOffset={8}
                className="w-44 p-1.5"
              >
                {inboxModeOptions.map((option) => {
                  const OptionIcon = option.icon
                  return (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={(inboxViewMode ?? 'chat') === option.value}
                      className={attachMenuCheckItemClassName}
                      onSelect={() => selectInboxViewMode(option.value)}
                    >
                      {OptionIcon ? <OptionIcon size={17} className="shrink-0" /> : null}
                      <span>{option.label}</span>
                    </DropdownMenuCheckboxItem>
                  )
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}

        {!isInboxTaskComposer && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={attachMenuSubTriggerClassName}>
              <Smile size={18} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">{t('chat.addEmoji')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              data-os-floating-bubble-portal="true"
              sideOffset={8}
              className="w-[352px] p-0"
            >
              <EmojiPicker
                inline
                onSelect={(emoji) => {
                  setContent((prev) => prev + emoji)
                  setShowAttachMenu(false)
                  textareaRef.current?.focus()
                }}
                onClose={() => setShowAttachMenu(false)}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {isInboxTaskComposer && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={attachMenuSubTriggerClassName}>
              <Tag size={18} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">{t('chat.addMenuTaskSettings')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              data-os-floating-bubble-portal="true"
              sideOffset={8}
              className="w-64 p-1.5"
            >
              <DropdownMenuLabel className="normal-case tracking-normal">
                {t('inbox.task.priorityLabel')}
              </DropdownMenuLabel>
              {taskPrioritySwitcherOptions.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={taskPriority === option.value}
                  className={attachMenuCheckItemClassName}
                  onSelect={() => setTaskPriority(option.value)}
                >
                  {option.dotClassName ? (
                    <span className={cn('h-2.5 w-2.5 rounded-full', option.dotClassName)} />
                  ) : null}
                  <span className={option.labelClassName}>{option.label}</span>
                </DropdownMenuCheckboxItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="normal-case tracking-normal">
                {t('inbox.task.tagsLabel')}
              </DropdownMenuLabel>
              {taskTagPresetOptions.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={selectedTaskTags.includes(tag)}
                  className={attachMenuCheckItemClassName}
                  onSelect={(event) => {
                    event.preventDefault()
                    toggleTaskTagPreset(tag)
                  }}
                >
                  <span>{t(`inbox.task.tagPreset.${tag}`)}</span>
                </DropdownMenuCheckboxItem>
              ))}
              <div className="px-2 py-1.5" onKeyDown={(event) => event.stopPropagation()}>
                <input
                  value={taskTags}
                  onChange={(event) => setTaskTags(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  placeholder={t('inbox.task.tagsPlaceholder')}
                  className="h-9 w-full rounded-lg border border-border-subtle bg-bg-primary/75 px-2 text-sm font-semibold text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/55 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={attachMenuSubTriggerClassName}>
            <FolderOpen size={18} className="shrink-0 text-primary" />
            <span className="min-w-0 flex-1">{t('chat.addMenuFiles')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            data-os-floating-bubble-portal="true"
            sideOffset={8}
            className="w-72 p-1.5"
          >
            <DropdownMenuItem className={attachMenuItemClassName} onSelect={() => openFileDialog()}>
              <FileText className={attachMenuIconClassName} />
              <span className="min-w-0">
                <span className="block">{t('chat.uploadFile')}</span>
                <span className="block truncate text-xs font-semibold text-text-muted">
                  {t('chat.addMenuUploadFileDesc')}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={attachMenuItemClassName}
              onSelect={() => openFileDialog('image/*')}
            >
              <ImageIcon className={attachMenuIconClassName} />
              <span className="min-w-0">
                <span className="block">{t('chat.uploadImage')}</span>
                <span className="block truncate text-xs font-semibold text-text-muted">
                  {t('chat.addMenuUploadImageDesc')}
                </span>
              </span>
            </DropdownMenuItem>
            {activeServerId && (
              <DropdownMenuItem className={attachMenuItemClassName} onSelect={openWorkspacePicker}>
                <FolderOpen className={attachMenuIconClassName} />
                <span className="min-w-0">
                  <span className="block">{t('chat.selectWorkspaceFile')}</span>
                  <span className="block truncate text-xs font-semibold text-text-muted">
                    {t('chat.addMenuWorkspaceFileDesc')}
                  </span>
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={attachMenuItemClassName}
              disabled={uploading || voiceRecording}
              onSelect={() => void startVoiceRecording()}
            >
              <Mic className={attachMenuIconClassName} />
              <span className="min-w-0">
                <span className="block">{t('chat.voiceRecord')}</span>
                <span className="block truncate text-xs font-semibold text-text-muted">
                  {t('chat.addMenuVoiceMessageDesc')}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem
          className={attachMenuItemClassName}
          onSelect={() => {
            setShowAttachMenu(false)
            setShowProductPicker(true)
          }}
        >
          <ShoppingBag className={attachMenuIconClassName} />
          <span className="min-w-0">
            <span className="block">{t('chat.productPicker')}</span>
            <span className="block truncate text-xs font-semibold text-text-muted">
              {t('chat.addMenuProductDesc')}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <section
      className={cn(
        'relative z-20',
        stackedControls
          ? 'overflow-visible bg-transparent p-0'
          : edgeToEdgeComposer
            ? 'flex h-full min-h-0 flex-col overflow-visible bg-transparent p-0'
            : compactComposer
              ? 'overflow-visible px-2 pb-2'
              : 'px-4 pb-4 mobile-safe-bottom',
        highContrastSurface && 'os-widget-readable-scope',
      )}
      aria-label={activeComposerPlaceholder}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Slash command autocomplete popup */}
      {slashQuery !== null && filteredSlashCommands.length > 0 && (
        <div
          ref={slashListRef}
          className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[16px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 px-1.5 max-h-[280px] overflow-y-auto z-50 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-100"
        >
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted flex items-center gap-1.5">
            <CommandIcon size={13} />
            {t('chat.slashCommands')}
          </div>
          {filteredSlashCommands.map((command, i) => (
            <button
              key={`${command.agentId}:${command.name}`}
              type="button"
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors rounded-[10px]',
                i === slashIndex
                  ? 'bg-black/5 dark:bg-white/10 text-text-primary'
                  : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
              )}
              onMouseEnter={() => setSlashIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                insertSlashCommand(command)
              }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <CommandIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[14px]">/{command.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  {command.description ?? t('chat.slashCommandNoDescription')}
                </span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5 max-w-[180px] text-xs text-text-muted">
                <Sparkles size={13} className="shrink-0" />
                <span className="truncate">
                  {t('chat.slashCommandFrom', {
                    name: command.buddyDisplayName ?? command.buddyUsername,
                  })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {/* Mention/reference autocomplete popup */}
      {mentionQuery !== null && mentionSuggestions.length > 0 && (
        <div
          ref={mentionListRef}
          className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[16px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 px-1.5 max-h-[240px] overflow-y-auto z-50 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-100"
        >
          {mentionSuggestions.map((suggestion, i) => (
            <button
              key={suggestion.id}
              type="button"
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-[14px] font-medium transition-colors rounded-[10px]',
                i === mentionIndex
                  ? 'bg-black/5 dark:bg-white/10 text-text-primary'
                  : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
              )}
              onMouseEnter={() => setMentionIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault() // prevent textarea blur
                insertMention(suggestion)
              }}
            >
              {suggestion.kind === 'user' || suggestion.kind === 'buddy' ? (
                <UserAvatar
                  userId={suggestion.userId}
                  avatarUrl={suggestion.avatarUrl}
                  displayName={suggestion.displayName ?? suggestion.username ?? suggestion.label}
                  size="sm"
                />
              ) : suggestion.kind === 'app' ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  {suggestion.iconUrl ? (
                    <img src={suggestion.iconUrl} alt="" className="h-5 w-5 rounded object-cover" />
                  ) : (
                    <AppWindow size={16} />
                  )}
                </span>
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  {suggestion.kind === 'channel' ? (
                    <Hash size={16} />
                  ) : suggestion.kind === 'server' ? (
                    <ServerIcon size={16} />
                  ) : (
                    <AtSign size={16} />
                  )}
                </span>
              )}
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">{suggestion.label}</span>
                {suggestion.description && (
                  <span className="block truncate text-xs text-text-muted">
                    {suggestion.description}
                  </span>
                )}
              </span>
              {suggestion.isBot && (
                <span className="text-[11px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium ml-auto">
                  {t('common.buddy')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Reply indicator */}
      {replyToId && !hideReplyIndicator && (
        <div className="rounded-t-[20px] border border-border-subtle border-b-0 bg-bg-secondary/80 px-3 py-2 text-xs text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] animate-in slide-in-from-top-2 duration-200">
          <div className="flex min-w-0 items-center gap-2.5">
            {replyToMessage?.author ? (
              <UserAvatar
                userId={replyToMessage.author.id}
                avatarUrl={replyToMessage.author.avatarUrl}
                displayName={replyAuthorName ?? t('common.unknownUser')}
                size="xs"
              />
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <MessageSquare size={13} strokeWidth={2.4} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-black text-text-muted">
                {replyAuthorName
                  ? t('chat.replyingToUser', { name: replyAuthorName })
                  : t('chat.replyingTo')}
              </div>
              <div className="truncate text-xs font-semibold text-text-secondary/85">
                {replyPreviewText}
              </div>
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="h-7 w-7 rounded-full p-0 text-text-muted hover:bg-bg-modifier-hover hover:text-text-primary"
              onClick={onClearReply}
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <X size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Pending file previews */}
      {(pendingFiles.length > 0 || selectedCommerceCards.length > 0) && (
        <div
          className={cn(
            'flex flex-wrap gap-2 bg-bg-secondary/80 rounded-[24px] border-b border-border-subtle px-4 py-3',
            replyToId ? '' : 'rounded-t-[40px]',
          )}
        >
          {selectedCommerceCards.map((card) => (
            <div
              key={card.id}
              className="relative flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-primary/75 px-3 py-2 pr-8 max-w-[260px]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ShoppingBag size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-text-primary">
                  {card.snapshot.name}
                </span>
                <span className="block text-[11px] text-text-muted">
                  {getCommerceCardPrice(card, t)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="absolute right-1 top-1 h-5 w-5 rounded-full p-0 text-text-muted"
                onClick={() => removeCommerceCard(card.id)}
                title={t('chat.removeProductCard')}
              >
                <X size={12} />
              </Button>
            </div>
          ))}
          {pendingFiles.map((pf, i) => (
            <div key={getPendingFileKey(pf)} className="relative group/file">
              {pf.kind === 'voice' ? (
                <div className="flex h-12 min-w-52 items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary/80 px-3">
                  <Mic size={16} className="shrink-0 text-primary" />
                  <div className="flex h-7 flex-1 items-center gap-[3px]">
                    {(pf.waveformPeaks ?? fallbackWaveformPeaks(32))
                      .slice(0, 32)
                      .map((peak, index) => (
                        <span
                          key={`${pf.file.name}-${index}`}
                          className="w-[3px] rounded-full bg-primary/70"
                          style={{ height: `${Math.max(6, Math.round(peak * 0.22))}px` }}
                        />
                      ))}
                  </div>
                  <span className="text-xs font-bold text-text-muted">
                    {formatVoiceDuration(pf.durationMs ?? 0)}
                  </span>
                </div>
              ) : pf.preview ? (
                <button
                  type="button"
                  onClick={() => setViewingImage(pf)}
                  className="w-20 h-20 rounded-lg overflow-hidden border border-border-subtle hover:border-primary/30 transition cursor-pointer"
                >
                  <img src={pf.preview} alt="" className="w-full h-full object-cover" />
                </button>
              ) : (
                <div className="w-20 h-20 rounded-lg border border-border-subtle bg-bg-secondary/80 flex flex-col items-center justify-center gap-1">
                  <FileText size={20} className="text-text-muted" />
                  <span className="text-[9px] text-text-muted truncate max-w-[72px] px-1">
                    {pf.workspaceName ?? pf.file.name}
                  </span>
                </div>
              )}
              {pf.workspaceUrl && (
                <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-primary/80 text-bg-deep px-1 py-0.5 rounded">
                  {t('chat.workspaceFileBadge')}
                </span>
              )}
              <Button
                variant="ghost"
                size="xs"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 p-0 rounded-full bg-danger text-white opacity-0 group-hover/file:opacity-100"
                onClick={() => removeFile(i)}
              >
                <X size={10} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'relative max-w-full min-w-0 overflow-visible',
          edgeToEdgeComposer && 'min-h-0 flex-1',
        )}
      >
        <InputValley
          className={cn(
            'relative max-w-full min-w-0 overflow-visible',
            edgeToEdgeComposer && 'h-full',
            stackedControls ? 'p-0' : compactComposer ? 'px-3 py-2' : 'p-4',
            highContrastSurface && 'os-widget-readable-surface',
            replyToId || pendingFiles.length > 0 || selectedCommerceCards.length > 0
              ? 'rounded-b-[32px]'
              : 'rounded-[32px]',
          )}
          style={stackedComposerStyle}
        >
          <div className={cn('grid min-w-0 w-full items-end', edgeToEdgeComposer && 'h-full')}>
            <div className={composerViewClass(!recordingVisualizerActive)}>
              {isInboxTaskComposer && (
                <Flag
                  size={19}
                  strokeWidth={2.4}
                  className="pointer-events-none absolute left-[10px] top-4 text-[#FF2A55] drop-shadow-[0_0_8px_rgba(255,42,85,0.35)]"
                  aria-hidden="true"
                />
              )}
              {isInboxTaskComposer ? (
                <div className={cn('grid min-w-0 w-full', compactComposer ? 'gap-1.5' : 'gap-2')}>
                  <div className="relative min-w-0 pl-12 sm:pl-14">
                    <textarea
                      key="inbox-task-composer"
                      ref={taskTextareaRef}
                      value={taskDraft}
                      onChange={handleTaskInput}
                      onKeyDown={handleTaskKeyDown}
                      onPaste={handlePaste}
                      placeholder={activeComposerPlaceholder}
                      rows={3}
                      enterKeyHint="enter"
                      wrap={taskDraft ? 'soft' : 'off'}
                      autoFocus
                      className="max-h-[50vh] min-h-[84px] min-w-0 w-full resize-none overflow-hidden bg-transparent py-[6px] text-[15px] leading-[24px] text-text-primary outline-none placeholder:text-text-muted sm:py-[7px]"
                      style={composerTextareaStyle}
                    />
                  </div>

                  <div className="flex min-w-0 w-full items-center gap-2">
                    <div className="relative shrink-0">
                      {renderAttachMenu(
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'rounded-full text-text-primary hover:bg-white/[0.08]',
                            composerControlButtonClassName,
                            showAttachMenu && 'bg-primary/10 text-primary',
                          )}
                          title={t('chat.addMenu')}
                          aria-label={t('chat.addMenu')}
                        >
                          <Plus size={composerControlIconSize} />
                        </Button>,
                      )}
                    </div>

                    <div className="min-w-0 flex-1" />

                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'shrink-0 rounded-full text-text-muted hover:bg-white/[0.08] hover:text-text-primary',
                        composerControlButtonClassName,
                        dictationListening && 'bg-primary/12 text-primary',
                      )}
                      onClick={toggleDictation}
                      title={
                        dictationListening ? t('chat.voiceStopDictation') : t('chat.voiceDictate')
                      }
                      aria-label={
                        dictationListening ? t('chat.voiceStopDictation') : t('chat.voiceDictate')
                      }
                      aria-pressed={dictationListening}
                      disabled={uploading || voiceRecording}
                    >
                      <Mic size={composerControlIconSize} />
                    </Button>

                    <Button
                      size="icon"
                      className={cn(
                        'flex shrink-0 items-center justify-center rounded-full border-none bg-[#3359d4] text-white shadow-none transition-all duration-200 hover:bg-[#3d66ec] active:scale-[0.92] disabled:opacity-30',
                        composerControlButtonClassName,
                      )}
                      onClick={() => void createTaskCard()}
                      title={t('inbox.task.create')}
                      aria-label={t('inbox.task.create')}
                      disabled={
                        !taskTitleInput.title ||
                        creatingTask ||
                        uploading ||
                        voiceRecording ||
                        dictationListening
                      }
                    >
                      {creatingTask ? (
                        <Loader2 size={composerSendIconSize} className="animate-spin text-white" />
                      ) : (
                        <ArrowUp
                          size={composerSendIconSize}
                          strokeWidth={2.5}
                          className="text-white"
                        />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex min-w-0 w-full flex-col',
                    compactComposer ? 'gap-1.5' : 'gap-3',
                  )}
                >
                  <textarea
                    key="chat-composer"
                    ref={textareaRef}
                    value={content}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={activeComposerPlaceholder}
                    rows={1}
                    wrap={content ? 'soft' : 'off'}
                    autoFocus
                    className="max-h-[200px] min-h-6 min-w-0 w-full resize-none overflow-y-auto bg-transparent px-2 py-0 text-base leading-6 text-text-primary outline-none placeholder:text-text-muted"
                    style={composerTextareaStyle}
                  />

                  <div className="flex min-w-0 items-center justify-between">
                    <div className="relative shrink-0">
                      {renderAttachMenu(
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'rounded-full text-text-primary hover:bg-white/[0.08]',
                            composerControlButtonClassName,
                            showAttachMenu && 'bg-primary/10 text-primary',
                          )}
                          title={t('chat.addMenu')}
                          aria-label={t('chat.addMenu')}
                        >
                          <Plus size={composerControlIconSize} />
                        </Button>,
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'shrink-0 rounded-full text-text-muted hover:bg-white/[0.08] hover:text-text-primary',
                          composerControlButtonClassName,
                          dictationListening && 'bg-primary/12 text-primary',
                        )}
                        onClick={toggleDictation}
                        title={
                          dictationListening ? t('chat.voiceStopDictation') : t('chat.voiceDictate')
                        }
                        aria-label={
                          dictationListening ? t('chat.voiceStopDictation') : t('chat.voiceDictate')
                        }
                        aria-pressed={dictationListening}
                        disabled={uploading || voiceRecording}
                      >
                        <Mic size={composerControlIconSize} />
                      </Button>

                      <Button
                        size="icon"
                        className={cn(
                          'flex shrink-0 items-center justify-center rounded-full border-none bg-[#3359d4] text-white shadow-none transition-all duration-200 hover:bg-[#3d66ec] active:scale-[0.92] disabled:opacity-30',
                          composerControlButtonClassName,
                        )}
                        onClick={handleSend}
                        title={t('chat.sendMessage')}
                        aria-label={t('chat.sendMessage')}
                        disabled={
                          (!content.trim() &&
                            pendingFiles.length === 0 &&
                            selectedCommerceCards.length === 0) ||
                          uploading ||
                          voiceRecording ||
                          dictationListening
                        }
                      >
                        <ArrowUp
                          size={composerSendIconSize}
                          strokeWidth={2.5}
                          className="text-white"
                        />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={composerViewClass(recordingVisualizerActive)}>
              <div
                className={cn(
                  'flex min-w-0 w-full items-center justify-between',
                  composerRecordingRowClassName,
                )}
              >
                <button
                  type="button"
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full bg-transparent text-text-primary transition duration-200 hover:scale-110 hover:opacity-80',
                    composerControlButtonClassName,
                  )}
                  onClick={() => {
                    if (voiceRecording) {
                      stopVoiceRecording(true)
                      return
                    }
                    stopDictation()
                  }}
                  title={
                    voiceRecording ? t('chat.voiceCancelRecording') : t('chat.voiceStopDictation')
                  }
                  aria-label={
                    voiceRecording ? t('chat.voiceCancelRecording') : t('chat.voiceStopDictation')
                  }
                  disabled={uploading}
                >
                  <Plus size={composerControlIconSize} className="rotate-45" />
                </button>

                <div
                  className={cn(
                    'mx-3 flex min-w-0 flex-1 origin-center items-center justify-center gap-1 overflow-hidden',
                    composerRecordingRowClassName,
                  )}
                  aria-label={t('chat.voiceWaveform')}
                >
                  {RECORDING_VIEW_BARS.map((bar, index) => (
                    <span
                      key={`recording-${index}`}
                      className="block w-[3px] origin-center rounded-[3px] bg-[#888]"
                      style={{
                        height: `${bar.height}px`,
                        opacity: bar.opacity,
                        animation: 'voice-recording-pulse 1s ease-in-out infinite',
                        animationDelay: `${bar.animationDelay}s`,
                        animationDuration: `${bar.animationDuration}s`,
                      }}
                    />
                  ))}
                </div>

                <div
                  className={cn(
                    'flex shrink-0 items-center',
                    composerRecordingControlsGapClassName,
                  )}
                >
                  {voiceRecording ? (
                    <>
                      <button
                        type="button"
                        className={cn(
                          'flex items-center justify-center rounded-full border-2 border-white bg-[#2a2a2a] transition duration-100 active:scale-90 disabled:opacity-40',
                          composerControlButtonClassName,
                        )}
                        onClick={() => stopVoiceRecording(false)}
                        title={t('chat.voiceStopRecording')}
                        aria-label={t('chat.voiceStopRecording')}
                        disabled={uploading}
                      >
                        <span className="h-3 w-3 rounded-[2px] bg-white" />
                      </button>

                      <button
                        type="button"
                        className={cn(
                          'flex items-center justify-center rounded-full border-none bg-[#3359d4] text-white transition duration-200 hover:bg-[#3d66ec] active:scale-[0.92] disabled:opacity-40',
                          composerControlButtonClassName,
                        )}
                        onClick={() => stopVoiceRecording(false, true)}
                        title={t('chat.voiceSendRecording')}
                        aria-label={t('chat.voiceSendRecording')}
                        disabled={uploading}
                      >
                        <ArrowUp
                          size={composerSendIconSize}
                          strokeWidth={2.5}
                          className="text-white"
                        />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={cn(
                        'flex items-center justify-center rounded-full border-2 border-white bg-[#2a2a2a] transition duration-100 active:scale-90 disabled:opacity-40',
                        composerControlButtonClassName,
                      )}
                      onClick={stopDictation}
                      title={t('chat.voiceStopDictation')}
                      aria-label={t('chat.voiceStopDictation')}
                      disabled={uploading}
                    >
                      <span className="h-3 w-3 rounded-[2px] bg-white" />
                    </button>
                  )}
                </div>

                <span className="sr-only">
                  {voiceRecording
                    ? `${t('chat.voiceRecording')} ${formatVoiceDuration(voiceRecordingMs)}`
                    : t('chat.voiceDictate')}
                </span>
              </div>
            </div>
          </div>
        </InputValley>

        {filteredCompletionItems.length > 0 ? (
          <div
            ref={completionListRef}
            className={cn(
              'absolute left-0 right-0 top-[calc(100%+6px)] z-50 flex max-h-[220px] flex-col gap-1 overflow-y-auto rounded-2xl border px-1.5 py-2 shadow-[0_18px_58px_rgba(0,0,0,0.32)] backdrop-blur-2xl',
              highContrastSurface
                ? 'os-widget-readable-popover border-white/24 bg-[rgba(10,14,22,0.82)] text-white'
                : 'border-black/5 bg-white/95 text-text-primary dark:border-white/10 dark:bg-[#1A1D24]/95',
            )}
          >
            <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-text-muted">
              <Sparkles size={13} />
              {t('chat.completionSuggestions')}
            </div>
            {filteredCompletionItems.map((item, index) => (
              <button
                key={`${item}:${index}`}
                type="button"
                className={cn(
                  'w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold leading-5 transition',
                  index === completionIndex
                    ? highContrastSurface
                      ? 'bg-white/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                      : 'bg-black/5 text-text-primary dark:bg-white/10'
                    : highContrastSurface
                      ? 'text-white/88 hover:bg-white/10 hover:text-white'
                      : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
                )}
                onMouseEnter={() => setCompletionIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  acceptCompletion(item)
                }}
              >
                <span className="line-clamp-2">{item}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {showWorkspacePicker && activeServerId && (
        <WorkspaceFilePicker
          serverId={activeServerId}
          mode="select-file"
          title={t('chat.selectWorkspaceFileTitle')}
          overlayStyle={{ zIndex: 2_147_482_100 }}
          onConfirm={handleWorkspaceFileSelect}
          onClose={() => setShowWorkspacePicker(false)}
        />
      )}

      {showProductPicker && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 px-4 pb-6 pt-20 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-primary shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <ShoppingBag size={18} className="text-primary" />
                {t('chat.productPicker')}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowProductPicker(false)}
              >
                <X size={16} />
              </Button>
            </div>
            <div className="border-b border-border-subtle p-3">
              <label className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary">
                <Search size={16} className="text-text-muted" />
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder={t('chat.productPickerSearch')}
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted"
                  autoFocus
                />
              </label>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {isFetchingProducts ? (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  {t('chat.productPickerLoading')}
                </div>
              ) : productCards.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  {t('chat.productPickerEmpty')}
                </div>
              ) : (
                productPickerGroups.map((group) => (
                  <div key={group.key} className="py-1">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                      <ShoppingBag size={13} />
                      <span>{t(group.labelKey)}</span>
                      {group.shopName && (
                        <span className="min-w-0 truncate normal-case tracking-normal">
                          {group.shopName}
                        </span>
                      )}
                    </div>
                    {group.cards.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                        onClick={() => addCommerceCard(card)}
                      >
                        {card.snapshot.imageUrl ? (
                          <img
                            src={card.snapshot.imageUrl}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                            <ShoppingBag size={20} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-text-primary">
                            {card.snapshot.name}
                          </span>
                          {card.snapshot.summary && (
                            <span className="block truncate text-xs text-text-muted">
                              {card.snapshot.summary}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-bold text-primary">
                          {getCommerceCardPrice(card, t)}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image viewer for pending files */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage.preview || viewingImage.workspaceUrl || ''}
          filename={viewingImage.workspaceName ?? viewingImage.file.name}
          size={viewingImage.workspaceSize ?? viewingImage.file.size}
          onClose={() => setViewingImage(null)}
        />
      )}
    </section>
  )
}
