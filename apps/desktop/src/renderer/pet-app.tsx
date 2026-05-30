import {
  Bell,
  Cable,
  ChevronRight,
  EyeOff,
  FileText,
  Heart,
  type LucideIcon,
  MessageCircle,
  Mic,
  RefreshCcw,
  Send,
  Store,
  X,
} from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { type ChatMessage, createInitialMessages } from './lib/chatbot'
import {
  applyPetAction,
  PET_ANIMATION_FRAMES,
  type PetState,
  parsePetState,
  selectAnimation,
  serializePetState,
  settlePetAction,
  tickPet,
} from './lib/game'

const PET_STORAGE_KEY = 'shadow:desktop-pet-state:v1'
const CHAT_STORAGE_KEY = 'shadow:desktop-pet-chat:v1'
const SUBSCRIPTIONS_STORAGE_KEY = 'shadow:desktop-pet-subscriptions:v1'
const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'
const FRAME_MS = 360
const SHADOW_WEB_ORIGIN = 'https://shadowob.com'
const VOICE_LEVEL_THRESHOLD = 0.018
const VOICE_LONG_PRESS_MS = 420
const VOICE_RELEASE_GRACE_MS = 520
const BUBBLE_TYPE_INTERVAL_MS = 174
const BUBBLE_CLAUSE_PAUSE_MS = 420
const BUBBLE_SENTENCE_PAUSE_MS = 720
const BUBBLE_MIN_VISIBLE_MS = 27_000
const BUBBLE_HOLD_AFTER_DONE_MS = 10_800
const TTS_STREAM_MIN_SEGMENT_CHARS = 14
const TTS_STREAM_SOFT_SEGMENT_CHARS = 28
const TTS_STREAM_MAX_SEGMENT_CHARS = 64

type DesktopPetApi = {
  getCommunityAuthToken?: () => Promise<string>
  communityFetchJson?: <T = unknown>(input: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
  }) => Promise<T>
  openExternal?: (url: string) => Promise<boolean>
  openReader?: (input: {
    url: string
    title?: string
    useDefaultApp?: boolean
    attachmentId?: string
  }) => Promise<boolean>
  quit?: () => Promise<void>
  showMainWindow?: () => Promise<void>
  showCommunity?: (path?: string) => Promise<void>
  showContextMenu?: () => Promise<void>
  showSettings?: (
    tab?: 'general' | 'connector' | 'shortcuts' | 'voice' | 'network' | 'about',
  ) => Promise<void>
  pet?: {
    hide?: () => Promise<void>
    setPanelMode?: (mode: 'compact' | 'expanded') => Promise<void>
    moveWindow?: (delta: { x: number; y: number }) => Promise<void>
    modelProxyStream?: (
      input: { requestId: string; body: Record<string, unknown> },
      onDelta: (delta: string) => void,
    ) => Promise<{ text: string }>
    speak?: (text: string) => Promise<boolean>
    cancelSpeech?: () => Promise<void>
    prewarmVoice?: () => Promise<boolean>
    voiceEngineStatus?: () => Promise<{
      engine: string
      nativeAddonAvailable: boolean
      modelRoot: string
      asr: { installed: boolean; name: string; sourceUrl: string }
      tts: { installed: boolean; name: string; sourceUrl: string }
    }>
    asrStart?: () => Promise<{ ok: boolean }>
    asrAccept?: (input: { samples: ArrayBuffer; sampleRate: number }) => Promise<{ ok: boolean }>
    asrStop?: () => Promise<{ text: string }>
    onAsrPartial?: (callback: (payload: { text: string }) => void) => () => void
    onShortcut?: (callback: (action: 'voice' | 'chat' | 'notifications') => void) => () => void
    onVoiceModelProgress?: (
      callback: (payload: {
        key: 'asr' | 'tts'
        phase: 'download' | 'extract' | 'ready'
        receivedBytes?: number
        totalBytes?: number
        percent?: number
      }) => void,
    ) => () => void
  }
  connector?: {
    getStatus?: () => Promise<{
      running: boolean
      connections: Array<{ status: 'running' | 'stopped' | 'error' }>
    }>
  }
}

type NotificationItem = {
  id: string
  type?: string | null
  referenceId?: string | null
  referenceType?: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  metadata?: Record<string, unknown> | null
  aggregatedCount?: number | null
  title: string
  body?: string | null
  kind?: string | null
  isRead: boolean
  createdAt?: string
}

function metaString(source: { metadata?: Record<string, unknown> | null }, key: string) {
  const value = source.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNotificationChannelId(notification: NotificationItem) {
  return (
    notification.scopeChannelId ??
    metaString(notification, 'channelId') ??
    (notification.referenceType === 'channel' || notification.referenceType === 'channel_invite'
      ? notification.referenceId
      : null)
  )
}

function getNotificationServerId(notification: NotificationItem) {
  return (
    notification.scopeServerId ??
    metaString(notification, 'serverId') ??
    (notification.referenceType === 'server_join' || notification.referenceType === 'server_invite'
      ? notification.referenceId
      : null)
  )
}

type AppTab = 'chat' | 'community' | 'subscriptions' | 'store'
type VisibleAppTab = Exclude<AppTab, 'store'>
type WheelCommand = 'pet' | 'community' | 'panel' | 'voice' | 'hide' | 'connection'

type ConnectorSnapshot = {
  running: boolean
  onlineCount: number
}

type ChannelSubscription = {
  channelId: string
  channelName: string
  serverId: string
  serverName: string
  lastSeenAt?: string
}

type CommunityChannelOption = {
  id: string
  name: string
  serverId: string
  serverSlug?: string | null
  serverName: string
}

type CommunityServerOption = {
  id: string
  slug?: string | null
  name: string
}

type SubscriptionFile = {
  id: string
  attachmentId?: string
  title: string
  url: string
  contentType: string
  channelId: string
  channelName: string
  serverName: string
  createdAt?: string
  unread: boolean
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitAudioContext?: typeof AudioContext
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

const WHEEL_SIZE = 220
const WHEEL_CENTER = WHEEL_SIZE / 2
const WHEEL_OUTER_RADIUS = 106
const WHEEL_INNER_RADIUS = 58
const WHEEL_SECTOR_SPAN = 60
const WHEEL_SECTOR_GAP = 0.4

const tabIcons: Record<AppTab, LucideIcon> = {
  chat: MessageCircle,
  community: Bell,
  subscriptions: FileText,
  store: Store,
}

const visiblePanelTabs: VisibleAppTab[] = ['chat', 'community', 'subscriptions']

const wheelItems: Array<{
  id: WheelCommand
  angle: number
  Icon: LucideIcon
  labelKey: string
}> = [
  { id: 'pet', angle: 330, Icon: Heart, labelKey: 'desktopPet.actions.pet' },
  { id: 'voice', angle: 270, Icon: Mic, labelKey: 'desktopPet.actions.voice' },
  { id: 'hide', angle: 210, Icon: EyeOff, labelKey: 'desktopPet.actions.hide' },
  { id: 'community', angle: 30, Icon: MessageCircle, labelKey: 'desktopPet.actions.community' },
  { id: 'panel', angle: 90, Icon: ChevronRight, labelKey: 'desktopPet.app.expand' },
  { id: 'connection', angle: 150, Icon: Cable, labelKey: 'desktopPet.actions.connection' },
]

function getDesktopApi(): DesktopPetApi | null {
  if (!('desktopAPI' in window)) return null
  return (window as unknown as { desktopAPI?: DesktopPetApi }).desktopAPI ?? null
}

function loadPetState() {
  return parsePetState(localStorage.getItem(PET_STORAGE_KEY))
}

function loadChatMessages() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return createInitialMessages()
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : createInitialMessages()
  } catch {
    return createInitialMessages()
  }
}

function loadSubscriptions(): ChannelSubscription[] {
  try {
    const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChannelSubscription[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.channelId === 'string' &&
        typeof item.channelName === 'string' &&
        typeof item.serverId === 'string' &&
        typeof item.serverName === 'string',
    )
  } catch {
    return []
  }
}

function getShadowOrigin() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(DESKTOP_SETTINGS_STORAGE_KEY) ?? '{}',
    ) as Partial<{ serverBaseUrl: string }>
    if (typeof parsed.serverBaseUrl === 'string') {
      const url = new URL(parsed.serverBaseUrl)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
    }
  } catch {
    // Fall through to the hosted community.
  }
  return SHADOW_WEB_ORIGIN
}

function getShadowUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path
  return new URL(path, getShadowOrigin()).toString()
}

async function readShadowAccessToken(api: DesktopPetApi | null): Promise<string> {
  try {
    const token = await api?.getCommunityAuthToken?.()
    if (token?.trim()) return token.trim()
  } catch {
    // Fall back to the current renderer's storage for non-desktop previews.
  }
  return localStorage.getItem('accessToken')?.trim() ?? ''
}

async function fetchShadow<T>(
  api: DesktopPetApi | null,
  path: string,
  options?: RequestInit,
): Promise<T> {
  if (api?.communityFetchJson) {
    const headers =
      options?.headers && !(options.headers instanceof Headers) && !Array.isArray(options.headers)
        ? (options.headers as Record<string, string>)
        : undefined
    let body: unknown
    if (typeof options?.body === 'string') {
      try {
        body = JSON.parse(options.body)
      } catch {
        body = options.body
      }
    } else {
      body = options?.body
    }
    return api.communityFetchJson<T>({
      path,
      method: options?.method,
      body,
      headers,
    })
  }

  const token = await readShadowAccessToken(api)
  if (!token) throw new Error('AUTH_REQUIRED')
  const response = await fetch(getShadowUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`REQUEST_FAILED_${response.status}`)
  return response.json() as Promise<T>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeCommunityServers(payload: unknown): CommunityServerOption[] {
  const rows = asArray(asRecord(payload).servers ?? payload)
  return rows
    .map((row): CommunityServerOption | null => {
      const record = asRecord(row)
      const serverRecord = asRecord(record.server)
      const server = Object.keys(serverRecord).length > 0 ? serverRecord : record
      const id = firstString(server.id, record.serverId)
      if (!id) return null
      return {
        id,
        slug: firstString(server.slug) || null,
        name: firstString(server.name, server.displayName, server.slug, id),
      }
    })
    .filter((server): server is CommunityServerOption => Boolean(server))
}

function normalizeCommunityChannels(
  payload: unknown,
  server: CommunityServerOption,
): CommunityChannelOption[] {
  const rows = asArray(asRecord(payload).channels ?? payload)
  return rows
    .map((row): CommunityChannelOption | null => {
      const record = asRecord(row)
      const channelRecord = asRecord(record.channel)
      const channel = Object.keys(channelRecord).length > 0 ? channelRecord : record
      const id = firstString(channel.id, record.channelId)
      if (!id) return null
      return {
        id,
        name: firstString(channel.name, channel.title, id),
        serverId: firstString(channel.serverId, server.id),
        serverSlug: server.slug ?? null,
        serverName: server.name,
      }
    })
    .filter((channel): channel is CommunityChannelOption => Boolean(channel))
}

async function loadCommunityChannelOptions(api: DesktopPetApi | null) {
  const serverPayload = await fetchShadow<unknown>(api, '/api/servers')
  const servers = normalizeCommunityServers(serverPayload)
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const routeIds = [server.slug, server.id].filter(
        (value, index, values): value is string =>
          typeof value === 'string' && value.length > 0 && values.indexOf(value) === index,
      )
      let channelPayload: unknown = null
      let lastError: unknown = null
      for (const serverRouteId of routeIds) {
        try {
          channelPayload = await fetchShadow<unknown>(
            api,
            `/api/servers/${encodeURIComponent(serverRouteId)}/channels`,
          )
          lastError = null
          break
        } catch (error) {
          lastError = error
        }
      }
      if (lastError) throw lastError
      return normalizeCommunityChannels(channelPayload, server)
    }),
  )
  const byId = new Map<string, CommunityChannelOption>()
  for (const channel of results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )) {
    byId.set(channel.id, channel)
  }
  const failed = results.find((result) => result.status === 'rejected')
  if (servers.length > 0 && byId.size === 0 && failed?.status === 'rejected') {
    throw failed.reason
  }
  return [...byId.values()]
}

async function resolveAttachmentUrl(
  api: DesktopPetApi | null,
  attachment: Record<string, unknown>,
) {
  const attachmentId = firstString(attachment.id)
  const directUrl = firstString(
    attachment.url,
    attachment.mediaUrl,
    attachment.fileUrl,
    attachment.downloadUrl,
  )
  const directPath = directUrl ? mediaPathFromUrl(directUrl) : ''
  const shouldResolveSigned =
    !directUrl || directPath.startsWith('/shadow/uploads/') || directPath.startsWith('/api/media/')
  if (attachmentId && shouldResolveSigned) {
    const result = await fetchShadow<unknown>(
      api,
      `/api/attachments/${encodeURIComponent(attachmentId)}/media-url?disposition=inline`,
    ).catch(() => null)
    const signedPath = firstString(asRecord(result).url)
    if (signedPath) return getShadowUrl(signedPath)
  }
  if (directUrl) return getShadowUrl(directUrl)
  if (!attachmentId) return ''
  const result = await fetchShadow<unknown>(
    api,
    `/api/attachments/${encodeURIComponent(attachmentId)}/media-url?disposition=inline`,
  ).catch(() => null)
  const signedPath = firstString(asRecord(result).url)
  return signedPath ? getShadowUrl(signedPath) : ''
}

function mediaPathFromUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return value.split(/[?#]/)[0] ?? value
  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

async function loadSubscriptionFiles(
  api: DesktopPetApi | null,
  subscriptions: ChannelSubscription[],
) {
  const files: SubscriptionFile[] = []
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const payload = await fetchShadow<unknown>(
        api,
        `/api/channels/${encodeURIComponent(subscription.channelId)}/messages?limit=40`,
      )
      const messages = asArray(asRecord(payload).messages ?? payload)
      for (const message of messages) {
        const messageRecord = asRecord(message)
        const createdAt = firstString(messageRecord.createdAt, messageRecord.updatedAt)
        for (const rawAttachment of asArray(messageRecord.attachments)) {
          const attachment = asRecord(rawAttachment)
          const url = await resolveAttachmentUrl(api, attachment)
          if (!url) continue
          const title =
            firstString(
              attachment.filename,
              attachment.fileName,
              attachment.name,
              attachment.title,
            ) ||
            new URL(url).pathname.split('/').pop() ||
            'file'
          const contentType = firstString(
            attachment.contentType,
            attachment.mimeType,
            attachment.type,
          )
          files.push({
            id: firstString(attachment.id) || `${subscription.channelId}:${url}`,
            attachmentId: firstString(attachment.id) || undefined,
            title,
            url,
            contentType,
            channelId: subscription.channelId,
            channelName: subscription.channelName,
            serverName: subscription.serverName,
            createdAt,
            unread: Boolean(
              createdAt &&
                (!subscription.lastSeenAt ||
                  new Date(createdAt).getTime() > new Date(subscription.lastSeenAt).getTime()),
            ),
          })
        }
      }
    }),
  )
  return files.sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return rightTime - leftTime
  })
}

function canOpenInElectronReader(file: SubscriptionFile) {
  const contentType = file.contentType.toLowerCase()
  const path = new URL(file.url).pathname.toLowerCase()
  return (
    contentType.startsWith('image/') ||
    contentType.includes('text/') ||
    contentType.includes('html') ||
    contentType.includes('markdown') ||
    contentType.includes('pdf') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp') ||
    path.endsWith('.gif') ||
    path.endsWith('.svg') ||
    path.endsWith('.html') ||
    path.endsWith('.htm') ||
    path.endsWith('.md') ||
    path.endsWith('.markdown') ||
    path.endsWith('.txt') ||
    path.endsWith('.pdf')
  )
}

function localizedChatText(
  message: ChatMessage,
  petState: PetState,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!message.key) return message.text ?? ''
  return t(`desktopPet.${message.key}`, {
    mood: petState.stats.mood,
    hunger: petState.stats.hunger,
    energy: petState.stats.energy,
    health: petState.stats.health,
    shells: petState.game.shells,
  })
}

function localizedPetDisplayText(
  message: ChatMessage,
  petState: PetState,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const text = localizedChatText(message, petState, t)
  return message.role === 'pet' ? normalizePetDisplayText(text) : text
}

function buildPetSystemPrompt(petState: PetState) {
  return [
    'You are Shadow Desktop Pet, a quiet desktop companion for the Shadow OwnBuddy community.',
    'Speak in the user language. Keep replies short, warm, and useful, usually under 80 Chinese characters unless asked for details.',
    'You should act like a small Buddy pet. Do not claim you are a generic assistant.',
    'Use the following live pet profile and state as durable context.',
    JSON.stringify({
      name: 'Shadow Desktop Pet',
      personality: petState.stats.personality,
      attribute: petState.stats.attribute,
      status: {
        mood: petState.stats.mood,
        health: petState.stats.health,
        loyalty: petState.stats.loyalty,
      },
      lastAction: petState.lastAction,
      lastActionAt: petState.lastActionAt,
    }),
  ].join('\n')
}

function extractCompletionText(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return ''
  return choices
    .map((choice) => {
      if (!choice || typeof choice !== 'object') return ''
      const record = choice as Record<string, unknown>
      const message = record.message as Record<string, unknown> | undefined
      const delta = record.delta as Record<string, unknown> | undefined
      return String(message?.content ?? delta?.content ?? record.text ?? '')
    })
    .join('')
}

async function readCompletionStream(response: Response, onDelta: (delta: string) => void) {
  if (!response.body) {
    const data = (await response.json().catch(() => null)) as unknown
    const text = extractCompletionText(data)
    if (text) onDelta(text)
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''

  const captureEvent = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (!data || data === '[DONE]') return
    try {
      const parsed = JSON.parse(data) as unknown
      const delta = extractCompletionText(parsed)
      if (!delta) return
      output += delta
      onDelta(delta)
    } catch {
      // Ignore malformed SSE frames; the proxy keeps streaming valid frames.
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''
    for (const event of events) captureEvent(event)
  }
  if (buffer) captureEvent(buffer)
  return output
}

function getAudioContextConstructor() {
  return window.AudioContext ?? window.webkitAudioContext
}

function resampleAudio(input: Float32Array, inputRate: number, outputRate = 16000) {
  if (inputRate === outputRate) return new Float32Array(input)
  const ratio = inputRate / outputRate
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(outputLength)
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio
    const before = Math.floor(sourceIndex)
    const after = Math.min(before + 1, input.length - 1)
    const weight = sourceIndex - before
    output[index] = (input[before] ?? 0) * (1 - weight) + (input[after] ?? 0) * weight
  }
  return output
}

function copyFloat32Buffer(samples: Float32Array) {
  const buffer = new ArrayBuffer(samples.byteLength)
  new Float32Array(buffer).set(samples)
  return buffer
}

function stripBracketedText(text: string) {
  let content = text
  let previous = ''
  while (content !== previous) {
    previous = content
    content = content
      .replace(/\([^()]*\)/g, '')
      .replace(/（[^（）]*）/g, '')
      .replace(/\[[^\[\]]*\]/g, '')
      .replace(/【[^【】]*】/g, '')
  }
  return content
    .replace(/\([^)]*$/g, '')
    .replace(/（[^）]*$/g, '')
    .replace(/\[[^\]]*$/g, '')
    .replace(/【[^】]*$/g, '')
}

function normalizePetDisplayText(text: string) {
  return stripBracketedText(text)
    .replace(/\*\*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeTtsText(text: string) {
  return stripBracketedText(text)
    .replace(/\*\*/g, '')
    .replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function takeReadyTtsSegment(buffer: string, force = false) {
  const content = buffer.trimStart()
  if (!content) return null

  let boundary = -1
  for (let index = 0; index < content.length; index += 1) {
    if (!/[。！？!?；;\n]/.test(content.charAt(index))) continue
    if (index + 1 >= TTS_STREAM_MIN_SEGMENT_CHARS) {
      boundary = index + 1
      break
    }
  }

  if (boundary < 0 && content.length >= TTS_STREAM_SOFT_SEGMENT_CHARS) {
    const searchWindow = content.slice(
      TTS_STREAM_MIN_SEGMENT_CHARS,
      Math.min(content.length, TTS_STREAM_MAX_SEGMENT_CHARS),
    )
    const softBoundary = Math.max(
      searchWindow.lastIndexOf('，'),
      searchWindow.lastIndexOf(','),
      searchWindow.lastIndexOf('、'),
      searchWindow.lastIndexOf(' '),
    )
    if (softBoundary >= 0) boundary = TTS_STREAM_MIN_SEGMENT_CHARS + softBoundary + 1
  }

  if (boundary < 0 && content.length >= TTS_STREAM_MAX_SEGMENT_CHARS) {
    boundary = TTS_STREAM_MAX_SEGMENT_CHARS
  }

  if (boundary < 0 && force) boundary = content.length
  if (boundary <= 0) return null

  const segment = normalizeTtsText(content.slice(0, boundary))
  const rest = content.slice(boundary)
  return segment ? { rest, segment } : { rest, segment: '' }
}

function getBubbleTypeDelay(char: string) {
  if (/[。！？.!?]/.test(char)) return BUBBLE_SENTENCE_PAUSE_MS
  if (/[，、；：,.，;:]/.test(char)) return BUBBLE_CLAUSE_PAUSE_MS
  return BUBBLE_TYPE_INTERVAL_MS
}

function estimateBubbleRevealDuration(text: string) {
  return [...text].reduce((total, char) => total + getBubbleTypeDelay(char), 0)
}

export function PetApp() {
  const { t } = useTranslation()
  const api = useMemo(() => getDesktopApi(), [])
  const dragRef = useRef<{
    pointerId: number
    lastClientX: number
    lastClientY: number
    lastScreenX: number
    lastScreenY: number
    travel: number
    voiceTimer: number | null
    voiceStarted: boolean
  } | null>(null)
  const wheelVoicePressRef = useRef<{
    pointerId: number
    timer: number | null
    started: boolean
  } | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve())
  const ttsSpeechGenerationRef = useRef(0)
  const audioNodesRef = useRef<{
    gain: GainNode
    processor: ScriptProcessorNode
    source: MediaStreamAudioSourceNode
  } | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const asrPartialUnsubscribeRef = useRef<(() => void) | null>(null)
  const localAsrActiveRef = useRef(false)
  const localAsrSessionRef = useRef(false)
  const voiceCaptureWantedRef = useRef(false)
  const voiceStartingRef = useRef(false)
  const voiceErrorRef = useRef(false)
  const voiceTranscriptRef = useRef('')
  const voiceDraftRef = useRef('')
  const voiceSignalActiveRef = useRef(false)
  const voiceLastSignalAtRef = useRef(0)
  const voiceHeardAudioRef = useRef(false)
  const bubbleTimerRef = useRef<number | null>(null)
  const bubbleTypeTimerRef = useRef<number | null>(null)
  const bubbleTargetRef = useRef('')
  const bubbleVisibleRef = useRef('')
  const voiceFinishTimerRef = useRef<number | null>(null)
  const chatInputRef = useRef<HTMLInputElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const bubbleContentRef = useRef<HTMLSpanElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [wheelOpen, setWheelOpen] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceSignalActive, setVoiceSignalActive] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [tab, setTab] = useState<AppTab>('chat')
  const [petState, setPetState] = useState<PetState>(() => loadPetState())
  const [frameTick, setFrameTick] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatMessages())
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [bubbleMessageId, setBubbleMessageId] = useState<string | null>(null)
  const [bubbleText, setBubbleText] = useState('')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [subscriptions, setSubscriptions] = useState<ChannelSubscription[]>(() =>
    loadSubscriptions(),
  )
  const [communityChannels, setCommunityChannels] = useState<CommunityChannelOption[]>([])
  const [subscriptionFiles, setSubscriptionFiles] = useState<SubscriptionFile[]>([])
  const [subscriptionState, setSubscriptionState] = useState<'idle' | 'loading' | 'auth' | 'error'>(
    'idle',
  )
  const [selectedSubscriptionServerId, setSelectedSubscriptionServerId] = useState('')
  const [selectedSubscriptionChannelId, setSelectedSubscriptionChannelId] = useState('')
  const [connectorSnapshot, setConnectorSnapshot] = useState<ConnectorSnapshot>({
    running: false,
    onlineCount: 0,
  })
  const [communityState, setCommunityState] = useState<'idle' | 'loading' | 'auth' | 'error'>(
    'idle',
  )
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(localStorage.getItem('accessToken')),
  )

  const animation = selectAnimation(petState)
  const ambientAnimation = animation === 'sick' ? 'sick' : animation === 'rest' ? 'rest' : 'idle'
  const frameCount = PET_ANIMATION_FRAMES[ambientAnimation] ?? 6
  const quietFrameCount = ambientAnimation === 'idle' ? Math.min(frameCount, 2) : 1
  const frameIndex = Math.floor(frameTick / 4) % quietFrameCount
  const frameUrl = `/pet/animations/${ambientAnimation}/${String(frameIndex).padStart(2, '0')}.png`
  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.isRead,
  ).length
  const unreadSubscriptionCount = subscriptionFiles.filter((file) => file.unread).length
  const attentionCount = unreadNotificationCount + unreadSubscriptionCount
  const attentionLabel =
    unreadNotificationCount > 0 && unreadSubscriptionCount > 0
      ? `${t('desktopPet.community.unread')} / ${t('desktopPet.subscriptions.unread')}`
      : unreadNotificationCount > 0
        ? t('desktopPet.community.unread')
        : t('desktopPet.subscriptions.unread')
  const bubbleMessage = useMemo(
    () => messages.find((message) => message.id === bubbleMessageId) ?? null,
    [bubbleMessageId, messages],
  )
  const voiceBubbleText = voiceRecording
    ? voiceTranscript || t('desktopPet.voice.recognizing')
    : voiceTranscript
  const bubbleSourceText = voiceBubbleText
    ? voiceBubbleText
    : bubbleMessage
      ? localizedPetDisplayText(bubbleMessage, petState, t)
      : ''

  useEffect(() => {
    const node = bubbleContentRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [bubbleText])

  useEffect(() => {
    bubbleTargetRef.current = bubbleSourceText
    if (bubbleTypeTimerRef.current) {
      window.clearTimeout(bubbleTypeTimerRef.current)
      bubbleTypeTimerRef.current = null
    }
    if (!bubbleSourceText) {
      bubbleVisibleRef.current = ''
      setBubbleText('')
      return
    }
    if (!bubbleSourceText.startsWith(bubbleVisibleRef.current)) {
      bubbleVisibleRef.current = ''
      setBubbleText('')
    }

    const tick = () => {
      const target = bubbleTargetRef.current
      const current = bubbleVisibleRef.current
      if (!target || current.length >= target.length) {
        bubbleTypeTimerRef.current = null
        return
      }
      const next = target.slice(0, current.length + 1)
      bubbleVisibleRef.current = next
      setBubbleText(next)
      bubbleTypeTimerRef.current = window.setTimeout(
        tick,
        getBubbleTypeDelay(target.charAt(current.length)),
      )
    }

    bubbleTypeTimerRef.current = window.setTimeout(
      tick,
      bubbleVisibleRef.current ? BUBBLE_TYPE_INTERVAL_MS : 0,
    )
    return () => {
      if (bubbleTypeTimerRef.current) {
        window.clearTimeout(bubbleTypeTimerRef.current)
        bubbleTypeTimerRef.current = null
      }
    }
  }, [bubbleSourceText])

  const setVoiceSignalActiveState = useCallback((active: boolean) => {
    if (voiceSignalActiveRef.current === active) return
    voiceSignalActiveRef.current = active
    setVoiceSignalActive(active)
  }, [])

  useEffect(() => {
    document.documentElement.classList.add('desktop-pet-window')
    return () => {
      document.documentElement.classList.remove('desktop-pet-window')
      recognitionRef.current?.abort()
      void api?.pet?.cancelSpeech?.().catch(() => null)
      voiceCaptureWantedRef.current = false
      localAsrActiveRef.current = false
      localAsrSessionRef.current = false
      asrPartialUnsubscribeRef.current?.()
      audioNodesRef.current?.source.disconnect()
      audioNodesRef.current?.processor.disconnect()
      audioNodesRef.current?.gain.disconnect()
      for (const track of mediaStreamRef.current?.getTracks() ?? []) track.stop()
      void audioContextRef.current?.close()
      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
      if (bubbleTypeTimerRef.current) window.clearTimeout(bubbleTypeTimerRef.current)
      if (voiceFinishTimerRef.current) window.clearTimeout(voiceFinishTimerRef.current)
      window.speechSynthesis?.cancel()
    }
  }, [])

  useEffect(() => {
    void api?.pet?.setPanelMode?.(panelOpen ? 'expanded' : 'compact')
  }, [api, panelOpen])

  useEffect(() => {
    setFrameTick(0)
  }, [animation, petState.lastActionAt])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameTick((value) => (value + 1) % frameCount)
    }, FRAME_MS)
    return () => window.clearInterval(timer)
  }, [frameCount])

  useEffect(() => {
    if (petState.lastAction === 'idle') return
    const timer = window.setTimeout(
      () => {
        setPetState((current) =>
          current.lastActionAt === petState.lastActionAt ? settlePetAction(current) : current,
        )
      },
      frameCount * FRAME_MS + 60,
    )
    return () => window.clearTimeout(timer)
  }, [frameCount, petState.lastAction, petState.lastActionAt])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPetState((current) => tickPet(current))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    localStorage.setItem(PET_STORAGE_KEY, serializePetState(petState))
  }, [petState])

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-24)))
  }, [messages])

  useEffect(() => {
    localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subscriptions))
  }, [subscriptions])

  const subscriptionServers = useMemo(() => {
    const byId = new Map<string, CommunityServerOption>()
    for (const channel of communityChannels) {
      byId.set(channel.serverId, {
        id: channel.serverId,
        slug: channel.serverSlug ?? null,
        name: channel.serverName,
      })
    }
    return [...byId.values()]
  }, [communityChannels])

  useEffect(() => {
    setSelectedSubscriptionServerId((current) => {
      if (current && subscriptionServers.some((server) => server.id === current)) return current
      return subscriptionServers[0]?.id ?? ''
    })
  }, [subscriptionServers])

  useEffect(() => {
    setSelectedSubscriptionChannelId((current) => {
      const visibleChannels = selectedSubscriptionServerId
        ? communityChannels.filter((channel) => channel.serverId === selectedSubscriptionServerId)
        : communityChannels
      if (current && visibleChannels.some((channel) => channel.id === current)) return current
      return visibleChannels[0]?.id ?? ''
    })
  }, [communityChannels, selectedSubscriptionServerId])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const state = await api?.connector?.getStatus?.().catch(() => null)
      if (!state || cancelled) return
      setConnectorSnapshot({
        running: state.running,
        onlineCount: state.connections.filter((connection) => connection.status === 'running')
          .length,
      })
    }
    void refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [api])

  useEffect(() => {
    if (!panelOpen || tab !== 'chat') return
    const timer = window.setTimeout(() => chatInputRef.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [panelOpen, tab])

  useEffect(() => {
    if (!panelOpen || tab !== 'chat') return
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, panelOpen, tab])

  const refreshAuthState = useCallback(async () => {
    setIsAuthenticated(Boolean(await readShadowAccessToken(api)))
  }, [api])

  useEffect(() => {
    void refreshAuthState()
    const refresh = () => void refreshAuthState()
    const timer = window.setInterval(refresh, 2_000)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [refreshAuthState])

  const refreshNotifications = useCallback(async () => {
    if (!(await readShadowAccessToken(api))) {
      setCommunityState('auth')
      setNotifications([])
      return
    }
    setCommunityState('loading')
    try {
      const next = await fetchShadow<NotificationItem[]>(api, '/api/notifications?limit=20')
      setNotifications(next)
      setCommunityState('idle')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCommunityState(message.includes('AUTH_REQUIRED') ? 'auth' : 'error')
    }
  }, [api])

  const refreshSubscriptions = useCallback(async () => {
    if (!(await readShadowAccessToken(api))) {
      setSubscriptionState('auth')
      setCommunityChannels([])
      setSubscriptionFiles([])
      return
    }
    setSubscriptionState('loading')
    try {
      const [channels, files] = await Promise.all([
        loadCommunityChannelOptions(api),
        loadSubscriptionFiles(api, subscriptions),
      ])
      setCommunityChannels(channels)
      setSubscriptionFiles(files)
      setSubscriptionState('idle')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSubscriptionState(message.includes('AUTH_REQUIRED') ? 'auth' : 'error')
    }
  }, [api, subscriptions])

  useEffect(() => {
    if (tab === 'community') void refreshNotifications()
  }, [refreshNotifications, tab])

  useEffect(() => {
    if (tab === 'subscriptions') void refreshSubscriptions()
  }, [refreshSubscriptions, tab])

  useEffect(() => {
    if (!isAuthenticated) return
    void refreshNotifications()
    const timer = window.setInterval(() => void refreshNotifications(), 60_000)
    return () => window.clearInterval(timer)
  }, [isAuthenticated, refreshNotifications])

  useEffect(() => {
    if (!isAuthenticated || subscriptions.length === 0) return
    void refreshSubscriptions()
    const timer = window.setInterval(() => void refreshSubscriptions(), 60_000)
    return () => window.clearInterval(timer)
  }, [isAuthenticated, refreshSubscriptions, subscriptions.length])

  useEffect(() => {
    return api?.pet?.onVoiceModelProgress?.((payload) => {
      if (payload.key !== 'asr') return
      if (payload.phase === 'download') {
        setVoiceTranscript(
          t('desktopPet.voice.downloadingModel', {
            percent: payload.percent ?? 0,
          }),
        )
        return
      }
      if (payload.phase === 'extract') {
        setVoiceTranscript(t('desktopPet.voice.extractingModel'))
        return
      }
      if (payload.phase === 'ready') {
        setVoiceTranscript(t('desktopPet.voice.recognizing'))
      }
    })
  }, [api, t])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api?.pet?.prewarmVoice?.().catch(() => false)
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [api])

  function activatePet() {
    setPetState((current) => applyPetAction(current, 'pet'))
  }

  function scheduleBubbleHide(text = '') {
    if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current)
    const visibleText = normalizePetDisplayText(text)
    const delay = Math.max(
      BUBBLE_MIN_VISIBLE_MS,
      estimateBubbleRevealDuration(visibleText) + BUBBLE_HOLD_AFTER_DONE_MS,
    )
    bubbleTimerRef.current = window.setTimeout(() => {
      setBubbleMessageId(null)
      bubbleTimerRef.current = null
    }, delay)
  }

  async function speakPetReply(text: string, options: { manageSpeaking?: boolean } = {}) {
    const content = normalizeTtsText(text)
    if (!content) return

    const manageSpeaking = options.manageSpeaking ?? true
    if (manageSpeaking) setIsSpeaking(true)
    try {
      const didSpeak = await api?.pet?.speak?.(content).catch(() => false)
      if (didSpeak) return
      if (!window.speechSynthesis) return

      await new Promise<void>((resolve) => {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(content)
        utterance.lang = navigator.language || 'zh-CN'
        utterance.rate = 0.94
        utterance.pitch = 1.08
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        window.speechSynthesis.speak(utterance)
      })
    } finally {
      if (manageSpeaking) setIsSpeaking(false)
    }
  }

  function resetPetSpeechQueue() {
    const generation = ttsSpeechGenerationRef.current + 1
    ttsSpeechGenerationRef.current = generation
    ttsQueueRef.current = Promise.resolve()
    void api?.pet?.cancelSpeech?.().catch(() => null)
    return generation
  }

  function enqueuePetSpeech(text: string, generation: number) {
    const content = normalizeTtsText(text)
    if (!content) return
    setIsSpeaking(true)
    if (generation !== ttsSpeechGenerationRef.current) return
    const previous = ttsQueueRef.current.catch(() => undefined)
    const current = speakPetReply(content, { manageSpeaking: false }).catch(() => undefined)
    ttsQueueRef.current = Promise.all([previous, current]).then(() => undefined)
  }

  async function finishPetSpeechQueue(generation: number) {
    try {
      await ttsQueueRef.current
    } finally {
      if (generation === ttsSpeechGenerationRef.current) setIsSpeaking(false)
    }
  }

  async function sendChatText(text: string, options: { speak?: boolean } = {}) {
    const trimmed = text.trim()
    if (!trimmed || chatBusy) return
    const shouldSpeak = Boolean(options.speak)
    const speechGeneration = shouldSpeak ? resetPetSpeechQueue() : ttsSpeechGenerationRef.current
    let speechBuffer = ''
    let queuedSpeech = false
    const queueReadySpeech = (force = false) => {
      if (!shouldSpeak) return
      let guard = 0
      while (guard < 8) {
        guard += 1
        const ready = takeReadyTtsSegment(speechBuffer, force)
        if (!ready) break
        speechBuffer = ready.rest
        if (ready.segment) {
          queuedSpeech = true
          enqueuePetSpeech(ready.segment, speechGeneration)
        }
        if (!force) break
      }
    }
    if (shouldSpeak) void api?.pet?.prewarmVoice?.().catch(() => false)
    const now = Date.now()
    const userMessage: ChatMessage = {
      id: `user-${now}`,
      role: 'user',
      text: trimmed,
      createdAt: now,
    }
    const replyId = `pet-${now + 1}`
    const replyMessage: ChatMessage = {
      id: replyId,
      role: 'pet',
      text: '',
      createdAt: now + 1,
      streaming: true,
    }
    const history = messages
      .slice(-10)
      .map((message) => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: localizedChatText(message, petState, t),
      }))
      .filter((message) => message.content.trim())
    const requestBody = {
      model: 'default',
      stream: true,
      temperature: 0.75,
      max_tokens: 420,
      messages: [
        { role: 'system', content: buildPetSystemPrompt(petState) },
        ...history,
        { role: 'user', content: trimmed },
      ],
    }
    setMessages((current) => [...current, userMessage, replyMessage].slice(-24))
    setChatInput('')
    setPetState((current) => applyPetAction(current, 'pet'))
    setBubbleMessageId(replyId)
    setChatBusy(true)

    let output = ''
    try {
      const token = await readShadowAccessToken(api)
      if (!token) {
        setIsAuthenticated(false)
        throw new Error('AUTH_REQUIRED')
      }
      setIsAuthenticated(true)
      const appendDelta = (delta: string) => {
        if (shouldSpeak) {
          speechBuffer = `${speechBuffer}${delta}`
          queueReadySpeech(false)
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === replyId
              ? { ...message, text: `${message.text ?? ''}${delta}`, streaming: true }
              : message,
          ),
        )
      }
      if (api?.pet?.modelProxyStream) {
        const requestId = `pet-chat-${now}-${Math.random().toString(36).slice(2)}`
        const result = await api.pet.modelProxyStream({ requestId, body: requestBody }, appendDelta)
        output = result.text
      } else {
        const response = await fetch(getShadowUrl('/api/ai/v1/chat/completions'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        })
        if (!response.ok) {
          const body = await response.text().catch(() => '')
          throw new Error(body || `REQUEST_FAILED_${response.status}`)
        }
        output = await readCompletionStream(response, appendDelta)
      }
      const finalText = output.trim() || t('desktopPet.chat.emptyReply')
      setMessages((current) =>
        current.map((message) =>
          message.id === replyId ? { ...message, text: finalText, streaming: false } : message,
        ),
      )
      setBubbleMessageId(replyId)
      scheduleBubbleHide(finalText)
      if (shouldSpeak) {
        if (!speechBuffer.trim() && !queuedSpeech) {
          speechBuffer = finalText
        }
        queueReadySpeech(true)
        void finishPetSpeechQueue(speechGeneration)
      }
    } catch (error) {
      console.warn('[desktop-pet] model proxy request failed', error)
      const message = error instanceof Error ? error.message : String(error)
      const key = message.includes('AUTH_REQUIRED')
        ? 'desktopPet.chat.authRequired'
        : 'desktopPet.chat.proxyError'
      const fallbackText = t(key)
      setMessages((current) =>
        current.map((message) =>
          message.id === replyId ? { ...message, text: fallbackText, streaming: false } : message,
        ),
      )
      setBubbleMessageId(replyId)
      scheduleBubbleHide(fallbackText)
      if (shouldSpeak) {
        speechBuffer = fallbackText
        queueReadySpeech(true)
        void finishPetSpeechQueue(speechGeneration)
      }
    } finally {
      setChatBusy(false)
    }
  }

  function sendChat(event: FormEvent) {
    event.preventDefault()
    void sendChatText(chatInput, { speak: voiceMode })
  }

  function stopLocalAudioCapture() {
    const nodes = audioNodesRef.current
    audioNodesRef.current = null
    try {
      nodes?.source.disconnect()
      nodes?.processor.disconnect()
      nodes?.gain.disconnect()
    } catch {
      // The audio graph may already be disconnected during pointer-leave races.
    }

    const stream = mediaStreamRef.current
    mediaStreamRef.current = null
    for (const track of stream?.getTracks() ?? []) track.stop()

    const audioContext = audioContextRef.current
    audioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => null)
    }

    asrPartialUnsubscribeRef.current?.()
    asrPartialUnsubscribeRef.current = null
  }

  async function startLocalVoiceCapture() {
    if (!api?.pet?.asrStart || !api.pet.asrAccept || !api.pet.asrStop) return false
    const AudioContextConstructor = getAudioContextConstructor()
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextConstructor) return false

    voiceCaptureWantedRef.current = true
    localAsrSessionRef.current = true
    voiceStartingRef.current = true
    voiceErrorRef.current = false
    voiceTranscriptRef.current = ''
    voiceDraftRef.current = ''
    voiceLastSignalAtRef.current = Date.now()
    voiceHeardAudioRef.current = false
    setVoiceSignalActiveState(false)
    setVoiceTranscript(t('desktopPet.voice.recognizing'))

    try {
      const status = await api.pet.voiceEngineStatus?.().catch(() => null)
      if (status && !status.nativeAddonAvailable) {
        localAsrSessionRef.current = false
        return false
      }
      if (status && !status.asr.installed) {
        setVoiceTranscript(t('desktopPet.voice.downloadingModel', { percent: 0 }))
      }
      await api.pet.asrStart()
      if (!voiceCaptureWantedRef.current) {
        await api.pet.asrStop().catch(() => ({ text: '' }))
        localAsrSessionRef.current = false
        return true
      }

      asrPartialUnsubscribeRef.current =
        api.pet.onAsrPartial?.((payload) => {
          const text = payload.text.trim()
          voiceTranscriptRef.current = text
          voiceDraftRef.current = text
          setVoiceTranscript(text || t('desktopPet.voice.recognizing'))
        }) ?? null

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      if (!voiceCaptureWantedRef.current) {
        for (const track of stream.getTracks()) track.stop()
        await api.pet.asrStop().catch(() => ({ text: '' }))
        localAsrSessionRef.current = false
        return true
      }

      const audioContext = new AudioContextConstructor()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const gain = audioContext.createGain()
      gain.gain.value = 0
      processor.onaudioprocess = (event) => {
        if (!localAsrActiveRef.current || !api.pet?.asrAccept) return
        const channel = event.inputBuffer.getChannelData(0)
        let sum = 0
        for (let index = 0; index < channel.length; index += 1) {
          const sample = channel[index] ?? 0
          sum += sample * sample
        }
        const rms = Math.sqrt(sum / Math.max(channel.length, 1))
        const hasSignal = rms > VOICE_LEVEL_THRESHOLD
        const now = Date.now()
        setVoiceSignalActiveState(hasSignal)
        if (hasSignal) {
          voiceLastSignalAtRef.current = now
          voiceHeardAudioRef.current = true
        }
        const samples = resampleAudio(channel, audioContext.sampleRate, 16000)
        void api.pet
          .asrAccept({ samples: copyFloat32Buffer(samples), sampleRate: 16000 })
          .catch(() => null)
      }
      source.connect(processor)
      processor.connect(gain)
      gain.connect(audioContext.destination)
      await audioContext.resume()

      mediaStreamRef.current = stream
      audioContextRef.current = audioContext
      audioNodesRef.current = { gain, processor, source }
      localAsrActiveRef.current = true
      setVoiceTranscript(t('desktopPet.voice.recognizing'))
      setVoiceRecording(true)
      return true
    } catch (error) {
      console.warn('[desktop-pet] local voice capture failed', error)
      stopLocalAudioCapture()
      localAsrActiveRef.current = false
      localAsrSessionRef.current = false
      voiceErrorRef.current = true
      setVoiceSignalActiveState(false)
      setVoiceRecording(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.modelError'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
      return false
    } finally {
      voiceStartingRef.current = false
    }
  }

  async function finishLocalVoiceCapture() {
    if (!localAsrSessionRef.current) return
    voiceCaptureWantedRef.current = false
    localAsrActiveRef.current = false
    localAsrSessionRef.current = false
    voiceHeardAudioRef.current = false
    setVoiceSignalActiveState(false)
    setVoiceRecording(false)
    setVoiceMode(false)
    stopLocalAudioCapture()

    const result = await api?.pet?.asrStop?.().catch((error) => {
      console.warn('[desktop-pet] local voice stop failed', error)
      return { text: '' }
    })
    const transcript =
      result?.text?.trim() || voiceTranscriptRef.current.trim() || voiceDraftRef.current.trim()
    voiceTranscriptRef.current = ''
    voiceDraftRef.current = ''
    setVoiceTranscript('')
    if (transcript) void sendChatText(transcript, { speak: true })
  }

  async function startVoiceCapture(force = false) {
    if (voiceFinishTimerRef.current) {
      window.clearTimeout(voiceFinishTimerRef.current)
      voiceFinishTimerRef.current = null
    }
    if ((!voiceMode && !force) || recognitionRef.current || voiceStartingRef.current || chatBusy) {
      return
    }
    voiceCaptureWantedRef.current = true
    setVoiceMode(true)
    void api?.pet?.prewarmVoice?.().catch(() => false)
    const startedLocal = await startLocalVoiceCapture()
    if (startedLocal) return
    if (!voiceCaptureWantedRef.current) {
      setVoiceMode(false)
      setVoiceRecording(false)
      return
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setBubbleMessageId(null)
      setVoiceSignalActiveState(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.unsupported'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
      return
    }
    const recognition = new Recognition()
    voiceStartingRef.current = true
    voiceErrorRef.current = false
    voiceTranscriptRef.current = ''
    voiceDraftRef.current = ''
    setVoiceSignalActiveState(false)
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'zh-CN'
    recognition.onresult = (event) => {
      let finalText = voiceTranscriptRef.current
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result) continue
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) finalText += transcript
        else interim += transcript
      }
      voiceTranscriptRef.current = finalText
      voiceDraftRef.current = `${finalText}${interim}`.trim()
      setVoiceTranscript(voiceDraftRef.current)
    }
    recognition.onerror = () => {
      voiceErrorRef.current = true
      voiceTranscriptRef.current = ''
      voiceDraftRef.current = ''
      setVoiceRecording(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.unsupported'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
      recognitionRef.current = null
      voiceStartingRef.current = false
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setVoiceRecording(false)
      setVoiceSignalActiveState(false)
      setVoiceMode(false)
      voiceStartingRef.current = false
      const hadError = voiceErrorRef.current
      voiceErrorRef.current = false
      const transcript = voiceTranscriptRef.current.trim() || voiceDraftRef.current.trim()
      voiceDraftRef.current = ''
      if (hadError) return
      setVoiceTranscript('')
      if (transcript) void sendChatText(transcript, { speak: true })
    }
    recognitionRef.current = recognition
    voiceCaptureWantedRef.current = true
    setVoiceTranscript(t('desktopPet.voice.recognizing'))
    setVoiceRecording(true)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const track of stream.getTracks()) track.stop()
      }
      if (recognitionRef.current !== recognition) return
      recognition.start()
    } catch {
      recognitionRef.current = null
      setVoiceRecording(false)
      setVoiceSignalActiveState(false)
      setVoiceMode(false)
      setVoiceTranscript(t('desktopPet.voice.unsupported'))
      window.setTimeout(() => setVoiceTranscript(''), 3500)
    } finally {
      voiceStartingRef.current = false
    }
  }

  function finishVoiceCaptureNow() {
    voiceCaptureWantedRef.current = false
    setVoiceSignalActiveState(false)
    if (localAsrSessionRef.current) {
      void finishLocalVoiceCapture()
      return
    }
    if (!recognitionRef.current) {
      setVoiceRecording(false)
      setVoiceMode(false)
      return
    }
    try {
      recognitionRef.current.stop()
    } catch {
      recognitionRef.current = null
      setVoiceRecording(false)
      setVoiceMode(false)
      voiceStartingRef.current = false
    }
  }

  function finishVoiceCapture() {
    if (voiceFinishTimerRef.current) return
    voiceFinishTimerRef.current = window.setTimeout(() => {
      voiceFinishTimerRef.current = null
      finishVoiceCaptureNow()
    }, VOICE_RELEASE_GRACE_MS)
  }

  async function markNotificationRead(notification: NotificationItem) {
    await fetchShadow(api, `/api/notifications/${notification.id}/read`, { method: 'PATCH' }).catch(
      () => null,
    )
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
    )
  }

  async function resolveNotificationRoute(notification: NotificationItem): Promise<string> {
    async function channelRoute(channelId: string, messageId?: string | null) {
      const channel = await fetchShadow<{
        id: string
        serverId?: string | null
        kind?: string | null
      }>(api, `/api/channels/${encodeURIComponent(channelId)}`)
      const search = messageId ? `?msg=${encodeURIComponent(messageId)}` : ''
      if (channel.kind === 'dm' || !channel.serverId)
        return `/dm/${encodeURIComponent(channel.id)}${search}`
      const server = await fetchShadow<{ id: string; slug?: string | null }>(
        api,
        `/api/servers/${encodeURIComponent(channel.serverId)}`,
      )
      return `/servers/${encodeURIComponent(server.slug ?? server.id)}/channels/${encodeURIComponent(
        channel.id,
      )}${search}`
    }

    if (notification.referenceType === 'message' && notification.referenceId) {
      const message = await fetchShadow<{ id: string; channelId: string }>(
        api,
        `/api/messages/${encodeURIComponent(notification.referenceId)}`,
      )
      return channelRoute(message.channelId, message.id)
    }

    const channelId = getNotificationChannelId(notification)
    if (channelId) return channelRoute(channelId)

    const serverId = getNotificationServerId(notification)
    if (serverId) {
      const server = await fetchShadow<{ id: string; slug?: string | null }>(
        api,
        `/api/servers/${encodeURIComponent(serverId)}`,
      )
      return `/servers/${encodeURIComponent(server.slug ?? server.id)}`
    }

    return '/settings/notification'
  }

  async function openNotification(notification: NotificationItem) {
    await markNotificationRead(notification)
    try {
      await api?.showCommunity?.(await resolveNotificationRoute(notification))
    } catch {
      await api?.showCommunity?.('/settings/notification')
    }
  }

  async function openMainWindowForLogin() {
    await api?.showMainWindow?.()
    void refreshAuthState()
  }

  async function openCommunityWindow() {
    await api?.showCommunity?.()
  }

  async function openPetStore() {
    await api?.showCommunity?.(`/shop/tags/${encodeURIComponent('虾豆桌面宠物')}`)
  }

  function toggleSubscription(channel: CommunityChannelOption) {
    setSubscriptions((current) => {
      const exists = current.some((item) => item.channelId === channel.id)
      if (exists) return current.filter((item) => item.channelId !== channel.id)
      return [
        {
          channelId: channel.id,
          channelName: channel.name,
          serverId: channel.serverId,
          serverName: channel.serverName,
          lastSeenAt: new Date(0).toISOString(),
        },
        ...current,
      ]
    })
  }

  async function openSubscriptionFile(file: SubscriptionFile) {
    setSubscriptions((current) =>
      current.map((subscription) =>
        subscription.channelId === file.channelId
          ? {
              ...subscription,
              lastSeenAt: new Date().toISOString(),
            }
          : subscription,
      ),
    )
    setSubscriptionFiles((current) =>
      current.map((item) => (item.id === file.id ? { ...item, unread: false } : item)),
    )
    const useDefaultApp = !canOpenInElectronReader(file)
    const opened = await api?.openReader?.({
      url: file.url,
      title: file.title,
      useDefaultApp,
      attachmentId: file.attachmentId,
    })
    if (!opened && useDefaultApp) void api?.openExternal?.(file.url)
  }

  useEffect(() => {
    return api?.pet?.onShortcut?.((action) => {
      setPanelOpen(true)
      if (action === 'voice') {
        setTab('chat')
        window.setTimeout(() => chatInputRef.current?.focus(), 40)
        return
      }
      if (action === 'notifications') {
        setTab('community')
        void refreshNotifications()
        return
      }
      setTab('chat')
      window.setTimeout(() => chatInputRef.current?.focus(), 40)
    })
  }, [api, refreshNotifications])

  function beginHoldVoiceCapture() {
    setBubbleMessageId(null)
    setVoiceTranscript(t('desktopPet.voice.recognizing'))
    setVoiceMode(true)
    void startVoiceCapture(true)
  }

  function clearDragVoiceTimer(drag: NonNullable<typeof dragRef.current>) {
    if (!drag.voiceTimer) return
    window.clearTimeout(drag.voiceTimer)
    drag.voiceTimer = null
  }

  function cancelPendingPetPress() {
    const drag = dragRef.current
    if (!drag) return
    clearDragVoiceTimer(drag)
    if (drag.voiceStarted) finishVoiceCapture()
    dragRef.current = null
    setDragging(false)
  }

  function handlePetPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || event.ctrlKey) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointerId = event.pointerId
    const voiceTimer = window.setTimeout(() => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== pointerId || drag.travel >= 7 || drag.voiceStarted) return
      drag.voiceTimer = null
      drag.voiceStarted = true
      setDragging(false)
      beginHoldVoiceCapture()
    }, VOICE_LONG_PRESS_MS)
    dragRef.current = {
      pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      travel: 0,
      voiceTimer,
      voiceStarted: false,
    }
    setDragging(false)
  }

  function handlePetPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.voiceStarted) return
    const delta = {
      x: event.movementX || event.screenX - drag.lastScreenX || event.clientX - drag.lastClientX,
      y: event.movementY || event.screenY - drag.lastScreenY || event.clientY - drag.lastClientY,
    }
    if (!delta.x && !delta.y) return
    drag.lastClientX = event.clientX
    drag.lastClientY = event.clientY
    drag.lastScreenX = event.screenX
    drag.lastScreenY = event.screenY
    drag.travel += Math.abs(delta.x) + Math.abs(delta.y)
    if (drag.travel > 3) setDragging(true)
    if (drag.travel >= 7) clearDragVoiceTimer(drag)
    void api?.pet?.moveWindow?.(delta)
  }

  function handlePetPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    clearDragVoiceTimer(drag)
    dragRef.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.voiceStarted) {
      finishVoiceCapture()
      return
    }
    if (drag.travel < 7) activatePet()
  }

  function cancelPetPointer(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (drag) {
      clearDragVoiceTimer(drag)
      if (drag.voiceStarted) finishVoiceCapture()
    }
    dragRef.current = null
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already be gone if the window lost focus.
    }
  }

  function handleVoiceWheelPointerDown(pointerId: number) {
    const current = wheelVoicePressRef.current
    if (current?.timer) window.clearTimeout(current.timer)
    const timer = window.setTimeout(() => {
      const press = wheelVoicePressRef.current
      if (!press || press.pointerId !== pointerId || press.started) return
      press.timer = null
      press.started = true
      beginHoldVoiceCapture()
    }, VOICE_LONG_PRESS_MS)
    wheelVoicePressRef.current = { pointerId, timer, started: false }
  }

  function finishVoiceWheelPointer(pointerId: number, cancelled = false) {
    const press = wheelVoicePressRef.current
    if (!press || press.pointerId !== pointerId) return
    if (press.timer) window.clearTimeout(press.timer)
    wheelVoicePressRef.current = null
    if (press.started) {
      finishVoiceCapture()
      if (!cancelled) setWheelOpen(false)
    }
  }

  return (
    <main
      className={[
        'desktop-pet',
        panelOpen ? 'expanded' : 'compact',
        voiceMode ? 'voice-mode' : '',
        voiceRecording ? 'voice-recording' : '',
        voiceSignalActive ? 'voice-signal' : '',
        isSpeaking ? 'voice-speaking' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={(event) => {
        event.preventDefault()
        cancelPendingPetPress()
        void api?.showContextMenu?.()
      }}
    >
      <section
        className="desktop-pet-stage"
        aria-label={t('desktopPet.pet.name')}
        onPointerEnter={() => {
          setWheelOpen(true)
        }}
        onPointerLeave={() => {
          if (!voiceRecording && !wheelVoicePressRef.current) setWheelOpen(false)
        }}
      >
        <button
          type="button"
          className={`desktop-pet-button ${dragging ? 'dragging' : ''}`}
          onPointerDown={handlePetPointerDown}
          onPointerMove={handlePetPointerMove}
          onPointerUp={handlePetPointerUp}
          onPointerCancel={cancelPetPointer}
          onClick={(event) => {
            if (event.detail === 0) activatePet()
          }}
          aria-label={t('desktopPet.actions.pet')}
        >
          <span className="desktop-pet-voice-waves" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <img src={frameUrl} alt="" className="desktop-pet-sprite" draggable={false} />
        </button>
        {bubbleText ? (
          <div
            className={
              bubbleMessage?.streaming
                ? 'desktop-pet-speech-bubble streaming'
                : 'desktop-pet-speech-bubble'
            }
            aria-live="polite"
          >
            <span ref={bubbleContentRef}>{bubbleText}</span>
          </div>
        ) : null}

        {attentionCount > 0 ? (
          <button
            type="button"
            className="desktop-pet-attention-indicator"
            aria-label={attentionLabel}
            title={attentionLabel}
            onClick={(event) => {
              event.stopPropagation()
              setPanelOpen(true)
              setWheelOpen(false)
              setTab(unreadNotificationCount > 0 ? 'community' : 'subscriptions')
            }}
          >
            <span>{attentionCount > 9 ? '9+' : attentionCount}</span>
          </button>
        ) : null}

        {!panelOpen ? (
          <div
            className={wheelOpen ? 'desktop-pet-radial visible' : 'desktop-pet-radial'}
            aria-label={t('desktopPet.app.actions')}
          >
            <svg
              className="desktop-pet-radial-svg"
              viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
              aria-label={t('desktopPet.app.actions')}
            >
              <title>{t('desktopPet.app.actions')}</title>
              {wheelItems.map((item) => {
                const label =
                  item.id === 'connection'
                    ? connectorSnapshot.running
                      ? t('desktopPet.connector.online', {
                          count: connectorSnapshot.onlineCount,
                        })
                      : t('desktopPet.connector.offline')
                    : t(item.labelKey)
                return (
                  <WheelSector
                    key={item.id}
                    item={item}
                    active={item.id === 'voice' && voiceMode}
                    label={label}
                    onPressStart={item.id === 'voice' ? handleVoiceWheelPointerDown : undefined}
                    onPressEnd={item.id === 'voice' ? finishVoiceWheelPointer : undefined}
                    onPressCancel={
                      item.id === 'voice'
                        ? (pointerId) => finishVoiceWheelPointer(pointerId, true)
                        : undefined
                    }
                    onActivate={() => {
                      if (item.id === 'voice') return
                      setWheelOpen(false)
                      if (item.id === 'panel') {
                        setPanelOpen(true)
                        return
                      }
                      if (item.id === 'connection') {
                        void api?.showSettings?.('connector')
                        return
                      }
                      if (item.id === 'community') {
                        void openCommunityWindow()
                        return
                      }
                      if (item.id === 'hide') {
                        setPanelOpen(false)
                        void api?.pet?.hide?.()
                        return
                      }
                      activatePet()
                    }}
                  />
                )
              })}
              <circle
                className="desktop-pet-radial-inner"
                cx={WHEEL_CENTER}
                cy={WHEEL_CENTER}
                r={56}
              />
            </svg>
          </div>
        ) : null}
      </section>

      {panelOpen ? (
        <section className="desktop-pet-panel" aria-label={t('desktopPet.app.title')}>
          <header className="desktop-pet-panel-header desktop-pet-panel-header-compact">
            <nav className="desktop-pet-tabs" aria-label={t('desktopPet.app.title')}>
              {visiblePanelTabs.map((item) => {
                const Icon = tabIcons[item]
                return (
                  <button
                    key={item}
                    type="button"
                    className={tab === item ? 'active' : ''}
                    onClick={() => setTab(item)}
                  >
                    <Icon size={15} />
                    <span>{t(`desktopPet.tabs.${item}`)}</span>
                    {item === 'community' && unreadNotificationCount > 0 ? (
                      <span
                        className="desktop-pet-tab-dot"
                        aria-label={t('desktopPet.community.unread')}
                      />
                    ) : null}
                    {item === 'subscriptions' && unreadSubscriptionCount > 0 ? (
                      <span
                        className="desktop-pet-tab-dot"
                        aria-label={t('desktopPet.subscriptions.unread')}
                      />
                    ) : null}
                  </button>
                )
              })}
              <button
                className="desktop-pet-icon-button"
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label={t('desktopPet.app.closePanel')}
                title={t('desktopPet.app.closePanel')}
              >
                <X size={16} />
              </button>
            </nav>
          </header>

          {!isAuthenticated ? (
            <PetLoginGuide onOpenMainWindow={openMainWindowForLogin} onRefresh={refreshAuthState} />
          ) : null}

          {tab === 'chat' ? (
            <ChatPanel
              messages={messages}
              chatInput={chatInput}
              chatBusy={chatBusy}
              voiceRecording={voiceRecording}
              onInput={setChatInput}
              onSubmit={sendChat}
              onVoicePressStart={handleVoiceWheelPointerDown}
              onVoicePressEnd={(pointerId) => finishVoiceWheelPointer(pointerId, true)}
              onVoicePressCancel={(pointerId) => finishVoiceWheelPointer(pointerId, true)}
              petState={petState}
              inputRef={chatInputRef}
              messagesEndRef={messagesEndRef}
            />
          ) : null}
          {tab === 'community' ? (
            <CommunityPanel
              state={communityState}
              notifications={notifications}
              onRefresh={refreshNotifications}
              onOpen={openNotification}
              onMarkRead={markNotificationRead}
            />
          ) : null}
          {tab === 'subscriptions' ? (
            <SubscriptionsPanel
              state={subscriptionState}
              subscriptions={subscriptions}
              channels={communityChannels}
              selectedServerId={selectedSubscriptionServerId}
              selectedChannelId={selectedSubscriptionChannelId}
              files={subscriptionFiles}
              onSelectServer={setSelectedSubscriptionServerId}
              onSelectChannel={setSelectedSubscriptionChannelId}
              onRefresh={refreshSubscriptions}
              onToggleChannel={toggleSubscription}
              onOpenFile={openSubscriptionFile}
            />
          ) : null}
          {tab === 'store' ? <PetStorePanel onOpenStore={openPetStore} /> : null}
        </section>
      ) : null}
    </main>
  )
}

function polarPoint(radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: WHEEL_CENTER + radius * Math.cos(radians),
    y: WHEEL_CENTER + radius * Math.sin(radians),
  }
}

function sectorPath(angle: number) {
  const startAngle = angle - WHEEL_SECTOR_SPAN / 2 + WHEEL_SECTOR_GAP / 2
  const endAngle = angle + WHEEL_SECTOR_SPAN / 2 - WHEEL_SECTOR_GAP / 2
  const outerStart = polarPoint(WHEEL_OUTER_RADIUS, startAngle)
  const outerEnd = polarPoint(WHEEL_OUTER_RADIUS, endAngle)
  const innerEnd = polarPoint(WHEEL_INNER_RADIUS, endAngle)
  const innerStart = polarPoint(WHEEL_INNER_RADIUS, startAngle)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${WHEEL_OUTER_RADIUS} ${WHEEL_OUTER_RADIUS} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${WHEEL_INNER_RADIUS} ${WHEEL_INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function activateOnKey(event: KeyboardEvent<SVGGElement>, onActivate: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onActivate()
}

function WheelSector({
  item,
  active,
  label,
  onPressStart,
  onPressEnd,
  onPressCancel,
  onActivate,
}: {
  item: {
    id: WheelCommand
    angle: number
    Icon: LucideIcon
  }
  active?: boolean
  label: string
  onPressStart?: (pointerId: number) => void
  onPressEnd?: (pointerId: number) => void
  onPressCancel?: (pointerId: number) => void
  onActivate: () => void
}) {
  const { Icon } = item
  const labelPoint = polarPoint(82, item.angle)
  const className = [
    'desktop-pet-sector',
    item.id === 'panel' ? 'panel' : '',
    active ? 'active' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <g
      className={className}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={(event) => activateOnKey(event, onActivate)}
      onPointerDown={(event: PointerEvent<SVGGElement>) => {
        if (!onPressStart) return
        if (event.button !== 0 || event.ctrlKey) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        onPressStart(event.pointerId)
      }}
      onPointerUp={(event: PointerEvent<SVGGElement>) => {
        if (!onPressEnd) return
        event.preventDefault()
        event.stopPropagation()
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
          // The captured element can be removed during a mode change.
        }
        onPressEnd(event.pointerId)
      }}
      onPointerCancel={(event: PointerEvent<SVGGElement>) => {
        if (!onPressCancel) return
        event.preventDefault()
        event.stopPropagation()
        onPressCancel(event.pointerId)
      }}
    >
      <path className="desktop-pet-sector-shape" d={sectorPath(item.angle)} />
      <foreignObject x={labelPoint.x - 30} y={labelPoint.y - 23} width={60} height={46}>
        <div className="desktop-pet-sector-content">
          <Icon size={14} />
          <span>{label}</span>
        </div>
      </foreignObject>
    </g>
  )
}

function PetLoginGuide({
  onOpenMainWindow,
  onRefresh,
}: {
  onOpenMainWindow: () => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="desktop-pet-login-guide">
      <div>
        <strong>{t('desktopPet.auth.title')}</strong>
        <p>{t('desktopPet.auth.description')}</p>
      </div>
      <div className="desktop-pet-login-actions">
        <button type="button" onClick={onOpenMainWindow}>
          {t('desktopPet.auth.openMain')}
        </button>
        <button type="button" onClick={onRefresh}>
          {t('desktopPet.auth.refresh')}
        </button>
      </div>
    </section>
  )
}

function PetActionIconButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={['desktop-pet-action-button', className ?? ''].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  )
}

function ChatPanel({
  messages,
  chatInput,
  chatBusy,
  voiceRecording,
  petState,
  inputRef,
  messagesEndRef,
  onInput,
  onSubmit,
  onVoicePressStart,
  onVoicePressEnd,
  onVoicePressCancel,
}: {
  messages: ChatMessage[]
  chatInput: string
  chatBusy: boolean
  voiceRecording: boolean
  petState: PetState
  inputRef: RefObject<HTMLInputElement | null>
  messagesEndRef: RefObject<HTMLDivElement | null>
  onInput: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onVoicePressStart: (pointerId: number) => void
  onVoicePressEnd: (pointerId: number) => void
  onVoicePressCancel: (pointerId: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="desktop-pet-panel-body desktop-pet-panel-body-chat">
      <div className="desktop-pet-messages">
        {messages.map((message) => (
          <div key={message.id} className={`desktop-pet-message ${message.role}`}>
            {localizedPetDisplayText(message, petState, t)}
            {message.streaming ? <span className="desktop-pet-stream-caret" /> : null}
          </div>
        ))}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>
      <form className="desktop-pet-chat-form" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          value={chatInput}
          onChange={(event) => onInput(event.target.value)}
          placeholder={t('desktopPet.chat.input')}
          disabled={chatBusy}
        />
        <PetActionIconButton
          type="button"
          className={voiceRecording ? 'voice active' : 'voice'}
          disabled={chatBusy}
          aria-label={t('desktopPet.voice.holdToTalk')}
          title={t('desktopPet.voice.holdToTalk')}
          onPointerDown={(event) => {
            if (chatBusy) return
            if (event.button !== 0 || event.ctrlKey) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            onVoicePressStart(event.pointerId)
          }}
          onPointerUp={(event) => {
            event.preventDefault()
            try {
              event.currentTarget.releasePointerCapture(event.pointerId)
            } catch {
              // The button may lose capture if the panel is closed while recording.
            }
            onVoicePressEnd(event.pointerId)
          }}
          onPointerCancel={(event) => {
            event.preventDefault()
            onVoicePressCancel(event.pointerId)
          }}
        >
          <Mic size={16} />
        </PetActionIconButton>
        <PetActionIconButton
          type="submit"
          disabled={chatBusy}
          aria-label={t('desktopPet.chat.send')}
          title={t('desktopPet.chat.send')}
        >
          <Send size={16} />
        </PetActionIconButton>
      </form>
    </div>
  )
}

function PetStorePanel({ onOpenStore }: { onOpenStore: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="desktop-pet-panel-body desktop-pet-inventory">
      <div className="desktop-pet-community-toolbar">
        <div>
          <strong>{t('desktopPet.store.title')}</strong>
          <span>{t('desktopPet.store.subtitle')}</span>
        </div>
      </div>
      <div className="desktop-pet-inventory-item">
        <span className="desktop-pet-subscription-file-icon" aria-hidden="true">
          <Store size={16} />
        </span>
        <span className="desktop-pet-subscription-file-copy">
          <strong>{t('desktopPet.store.petAssets')}</strong>
          <small>{t('desktopPet.store.petAssetsHint')}</small>
        </span>
        <div className="desktop-pet-subscription-actions">
          <button type="button" className="desktop-pet-subscription-open" onClick={onOpenStore}>
            {t('desktopPet.store.open')}
          </button>
        </div>
      </div>
    </div>
  )
}

function CommunityPanel({
  state,
  notifications,
  onRefresh,
  onOpen,
  onMarkRead,
}: {
  state: 'idle' | 'loading' | 'auth' | 'error'
  notifications: NotificationItem[]
  onRefresh: () => void
  onOpen: (notification: NotificationItem) => void
  onMarkRead: (notification: NotificationItem) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="desktop-pet-panel-body">
      <div className="desktop-pet-community-toolbar">
        <div>
          <strong>{t('desktopPet.community.title')}</strong>
          <span>{t(`desktopPet.community.state_${state}`)}</span>
        </div>
        <button
          type="button"
          className="desktop-pet-icon-button"
          onClick={onRefresh}
          title={t('desktopPet.community.refresh')}
          aria-label={t('desktopPet.community.refresh')}
        >
          <RefreshCcw size={15} />
        </button>
      </div>
      <div className="desktop-pet-notifications">
        {notifications.length === 0 ? (
          <p className="desktop-pet-empty">
            {state === 'auth'
              ? t('desktopPet.community.authRequired')
              : t('desktopPet.community.empty')}
          </p>
        ) : null}
        {notifications.map((notification) => (
          <article
            key={notification.id}
            className={
              notification.isRead ? 'desktop-pet-notification read' : 'desktop-pet-notification'
            }
          >
            <div>
              <strong>{notification.title}</strong>
              {notification.body ? <p>{notification.body}</p> : null}
            </div>
            <div className="desktop-pet-notification-actions">
              <button type="button" onClick={() => onOpen(notification)}>
                {t('desktopPet.community.open')}
              </button>
              {!notification.isRead ? (
                <button type="button" onClick={() => onMarkRead(notification)}>
                  {t('desktopPet.community.markRead')}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function SubscriptionsPanel({
  state,
  subscriptions,
  channels,
  selectedServerId,
  selectedChannelId,
  files,
  onSelectServer,
  onSelectChannel,
  onRefresh,
  onToggleChannel,
  onOpenFile,
}: {
  state: 'idle' | 'loading' | 'auth' | 'error'
  subscriptions: ChannelSubscription[]
  channels: CommunityChannelOption[]
  selectedServerId: string
  selectedChannelId: string
  files: SubscriptionFile[]
  onSelectServer: (serverId: string) => void
  onSelectChannel: (channelId: string) => void
  onRefresh: () => void
  onToggleChannel: (channel: CommunityChannelOption) => void
  onOpenFile: (file: SubscriptionFile) => void
}) {
  const { t } = useTranslation()
  const subscribedChannelIds = new Set(subscriptions.map((item) => item.channelId))
  const servers = useMemo(() => {
    const byId = new Map<string, CommunityServerOption>()
    for (const channel of channels) {
      byId.set(channel.serverId, {
        id: channel.serverId,
        slug: channel.serverSlug ?? null,
        name: channel.serverName,
      })
    }
    return [...byId.values()]
  }, [channels])
  const visibleChannels = selectedServerId
    ? channels.filter((channel) => channel.serverId === selectedServerId)
    : channels
  const selectedChannel =
    visibleChannels.find((channel) => channel.id === selectedChannelId) ?? null
  const selectedSubscribed = selectedChannel ? subscribedChannelIds.has(selectedChannel.id) : false
  return (
    <div className="desktop-pet-panel-body desktop-pet-inventory">
      <div className="desktop-pet-community-toolbar">
        <div>
          <strong>{t('desktopPet.subscriptions.title')}</strong>
          <span>{t(`desktopPet.subscriptions.state_${state}`)}</span>
        </div>
        <button
          type="button"
          className="desktop-pet-icon-button"
          onClick={onRefresh}
          title={t('desktopPet.subscriptions.refresh')}
          aria-label={t('desktopPet.subscriptions.refresh')}
        >
          <RefreshCcw size={15} />
        </button>
      </div>

      <div className="desktop-pet-subscription-picker">
        <div className="desktop-pet-subscription-selects">
          <select
            value={selectedServerId}
            onChange={(event) => onSelectServer(event.target.value)}
            disabled={servers.length === 0 || state === 'loading'}
            aria-label={t('desktopPet.subscriptions.chooseServer')}
          >
            <option value="">{t('desktopPet.subscriptions.chooseServer')}</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
          <select
            value={selectedChannelId}
            onChange={(event) => onSelectChannel(event.target.value)}
            disabled={visibleChannels.length === 0 || state === 'loading'}
            aria-label={t('desktopPet.subscriptions.chooseChannel')}
          >
            <option value="">{t('desktopPet.subscriptions.chooseChannel')}</option>
            {visibleChannels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="desktop-pet-subscription-primary"
          disabled={!selectedChannel}
          onClick={() => {
            if (selectedChannel) onToggleChannel(selectedChannel)
          }}
        >
          {selectedSubscribed
            ? t('desktopPet.subscriptions.unsubscribe')
            : t('desktopPet.subscriptions.subscribe')}
        </button>
      </div>

      <div className="desktop-pet-subscription-chips">
        {channels.length === 0 ? (
          <p className="desktop-pet-empty">
            {state === 'auth'
              ? t('desktopPet.community.authRequired')
              : t('desktopPet.subscriptions.noChannels')}
          </p>
        ) : null}
        {subscriptions.map((subscription) => (
          <button
            key={subscription.channelId}
            type="button"
            className={subscription.channelId === selectedChannelId ? 'active' : ''}
            onClick={() => {
              onSelectServer(subscription.serverId)
              onSelectChannel(subscription.channelId)
            }}
          >
            {subscription.serverName} / {subscription.channelName}
          </button>
        ))}
      </div>

      {files.length === 0 ? (
        <p className="desktop-pet-empty">
          {subscriptions.length === 0
            ? t('desktopPet.subscriptions.empty')
            : t('desktopPet.subscriptions.noFiles')}
        </p>
      ) : null}
      {files.map((file) => (
        <div key={file.id} className="desktop-pet-inventory-item">
          <span className="desktop-pet-subscription-file-icon" aria-hidden="true">
            <FileText size={16} />
          </span>
          <span className="desktop-pet-subscription-file-copy">
            {file.unread ? <i className="desktop-pet-inline-dot" aria-hidden="true" /> : null}
            <strong>{file.title}</strong>
            <small>
              {file.serverName} / {file.channelName}
            </small>
          </span>
          <div className="desktop-pet-subscription-actions">
            <button
              type="button"
              className="desktop-pet-subscription-open"
              onClick={() => onOpenFile(file)}
            >
              {canOpenInElectronReader(file)
                ? t('desktopPet.subscriptions.openReader')
                : t('desktopPet.subscriptions.openDefault')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
