import {
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { PetPanelShell, PetPanelTopBar } from './components/pet-panel-shell'
import {
  CarePanel,
  ChatPanel,
  CommunityPanel,
  PetStorePanel,
  ServicesPanel,
  SubscriptionsPanel,
} from './components/pet-panels'
import { PetWheel } from './components/pet-wheel'
import { usePetConversation } from './hooks/use-pet-conversation'
import { usePetServices } from './hooks/use-pet-services'
import {
  applyPetAction,
  PET_ANIMATION_FRAMES,
  type PetAction,
  type PetAnimationKey,
  type PetState,
  recommendedPetActions,
  selectAnimation,
  selectPetEmotion,
  selectRuntimeAnimation,
  settlePetAction,
  tickPet,
} from './lib/game'
import {
  DESKTOP_PET_ASSET_DROP_EVENT,
  type DesktopPetAssetDropEventDetail,
  fallbackFilePath,
  findCodexPetArchive,
  isFileDrag,
  isPreloadHandledNativePetAssetDrop,
  isPreloadHandledPetAssetDrop,
} from './lib/pet-asset-drag'
import {
  activePetAssetPack,
  DEFAULT_CODEX_PET_PACK,
  getPetSprite,
  petPackAssetUrl,
  spriteSheetStyle,
} from './lib/pet-asset-packs'
import {
  canOpenInElectronReader,
  communityRequestStateFromError,
  fetchShadow,
  loadCommunityChannelOptions,
  loadContentSubscriptions,
  loadSubscriptionFiles,
  markContentFeedOpened,
  markContentFeedReadScope,
  onCommunityAuthRequired,
  readShadowAccessToken,
  subscribeContentChannel,
  unsubscribeContentChannel,
} from './lib/pet-community'
import {
  markAllCommunityNotificationsRead,
  markCommunityNotificationRead,
  resolveNotificationRoute,
} from './lib/pet-notifications'
import {
  loadPetProfile,
  normalizePetProfile,
  randomPetProfile,
  savePetProfile,
} from './lib/pet-profile'
import { loadPetState, loadSubscriptions, savePetState, saveSubscriptions } from './lib/pet-storage'
import type {
  AppTab,
  ChannelSubscription,
  CommunityChannelOption,
  CommunityServerOption,
  DesktopPetApi,
  DesktopPetAssetPack,
  DesktopPetAssetSettings,
  DesktopPetAssetSprite,
  NotificationItem,
  PetProfile,
  PetServiceId,
  SubscriptionFile,
  WheelLayer,
} from './pet-types'

const VOICE_LONG_PRESS_MS = 420
const PET_FRAME_ALPHA_THRESHOLD = 12
const PET_FRAME_OFFSET_LIMIT_RATIO = 0.24
const PET_VISUAL_LIFT_PX = -16
const PET_PANEL_WINDOW_TRANSITION_MS = 180
const ZERO_PET_FRAME_OFFSET = {
  x: 0,
  y: 0,
  bounds: null,
  frameMasks: [],
  maskWidth: 0,
  maskHeight: 0,
}
const petSpriteOpaqueOffsetCache = new Map<string, PetFrameOffset>()

type PetFrameOffset = {
  x: number
  y: number
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  } | null
  frameMasks: Uint8Array[]
  maskWidth: number
  maskHeight: number
}

function getDesktopApi(): DesktopPetApi | null {
  if (!('desktopAPI' in window)) return null
  return (window as unknown as { desktopAPI?: DesktopPetApi }).desktopAPI ?? null
}

function serviceDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function clampOffset(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value))
}

function petSpriteOpaqueOffsetCacheKey(
  pack: DesktopPetAssetPack,
  sprite: DesktopPetAssetSprite,
): string {
  const frameWidth = Math.max(1, sprite.frame?.width ?? 192)
  const frameHeight = Math.max(1, sprite.frame?.height ?? 208)
  const count = Math.max(1, sprite.frame?.count ?? 1)
  const columns = Math.max(1, sprite.atlas?.columns ?? count)
  const row = Math.max(
    0,
    Math.min(Math.max(1, sprite.atlas?.rows ?? 1) - 1, sprite.atlas?.row ?? 0),
  )
  return [
    petPackAssetUrl(pack, sprite.src),
    `${frameWidth}x${frameHeight}`,
    `columns:${columns}`,
    `row:${row}`,
    `count:${count}`,
  ].join('|')
}

function loadPetSpriteImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load pet sprite image'))
    image.src = src
  })
}

function waitForPetWindowTransition(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, PET_PANEL_WINDOW_TRANSITION_MS)
  })
}

async function measurePetSpriteOpaqueOffset(
  pack: DesktopPetAssetPack,
  sprite: DesktopPetAssetSprite,
): Promise<PetFrameOffset> {
  const cacheKey = petSpriteOpaqueOffsetCacheKey(pack, sprite)
  const cached = petSpriteOpaqueOffsetCache.get(cacheKey)
  if (cached) return cached

  const frameWidth = Math.max(1, sprite.frame?.width ?? 192)
  const frameHeight = Math.max(1, sprite.frame?.height ?? 208)
  const count = Math.max(1, sprite.frame?.count ?? 1)
  const columns = Math.max(1, sprite.atlas?.columns ?? count)
  const rows = Math.max(1, sprite.atlas?.rows ?? 1)
  const row = Math.max(0, Math.min(rows - 1, sprite.atlas?.row ?? 0))
  const scanCount = Math.max(1, Math.min(count, columns))
  const canvas = document.createElement('canvas')
  canvas.width = frameWidth
  canvas.height = frameHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return ZERO_PET_FRAME_OFFSET

  let measured: PetFrameOffset = ZERO_PET_FRAME_OFFSET
  try {
    const image = await loadPetSpriteImage(petPackAssetUrl(pack, sprite.src))
    let minX = frameWidth
    let minY = frameHeight
    let maxX = -1
    let maxY = -1
    const frameMasks: Uint8Array[] = []

    for (let frame = 0; frame < scanCount; frame += 1) {
      context.clearRect(0, 0, frameWidth, frameHeight)
      context.drawImage(
        image,
        frame * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      )
      const data = context.getImageData(0, 0, frameWidth, frameHeight).data
      const frameMask = new Uint8Array(frameWidth * frameHeight)
      for (let index = 3; index < data.length; index += 4) {
        if (data[index]! <= PET_FRAME_ALPHA_THRESHOLD) continue
        const pixel = (index - 3) / 4
        const x = pixel % frameWidth
        const y = Math.floor(pixel / frameWidth)
        frameMask[pixel] = 1
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      frameMasks.push(frameMask)
    }

    if (maxX >= minX && maxY >= minY) {
      const contentCenterX = (minX + maxX + 1) / 2
      const contentCenterY = (minY + maxY + 1) / 2
      measured = {
        x: clampOffset(frameWidth / 2 - contentCenterX, frameWidth * PET_FRAME_OFFSET_LIMIT_RATIO),
        y: clampOffset(
          frameHeight / 2 - contentCenterY,
          frameHeight * PET_FRAME_OFFSET_LIMIT_RATIO,
        ),
        bounds: { minX, minY, maxX, maxY },
        frameMasks,
        maskWidth: frameWidth,
        maskHeight: frameHeight,
      }
    }
  } catch {
    measured = ZERO_PET_FRAME_OFFSET
  }

  petSpriteOpaqueOffsetCache.set(cacheKey, measured)
  return measured
}

function PetSpriteVisual({
  pack,
  sprite,
  frameIndex,
  fallbackSrc,
}: {
  pack: DesktopPetAssetPack | null
  sprite: DesktopPetAssetSprite | null
  frameIndex: number
  fallbackSrc: string
}) {
  if (pack && sprite) {
    return (
      <span className="desktop-pet-sprite-shell" aria-hidden="true">
        <span
          className="desktop-pet-sprite desktop-pet-sprite-sheet"
          style={spriteSheetStyle(pack, sprite, frameIndex)}
        />
      </span>
    )
  }

  return (
    <span className="desktop-pet-sprite-shell" aria-hidden="true">
      <img src={fallbackSrc} alt="" className="desktop-pet-sprite" draggable={false} />
    </span>
  )
}

export function PetApp() {
  const { t } = useTranslation()
  const api = useMemo(() => getDesktopApi(), [])
  const petButtonRef = useRef<HTMLButtonElement | null>(null)
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
  const lastEventBubbleRef = useRef<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [petAssetDropActive, setPetAssetDropActive] = useState(false)
  const [petAssetDropBusy, setPetAssetDropBusy] = useState(false)
  const [petFrameScale, setPetFrameScale] = useState(1)
  const [petFrameOffset, setPetFrameOffset] = useState<PetFrameOffset>(ZERO_PET_FRAME_OFFSET)
  const [dragDirection, setDragDirection] = useState<'running-right' | 'running-left'>(
    'running-right',
  )
  const wheelOpenRef = useRef(false)
  const petMouseInteractiveRef = useRef<boolean | null>(null)
  const panelTransitionRef = useRef(0)
  const [layoutMode, setLayoutMode] = useState<'compact' | 'expanded'>('compact')
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelClosing, setPanelClosing] = useState(false)
  const [wheelOpen, setWheelOpen] = useState(false)
  const [wheelLayer, setWheelLayer] = useState<WheelLayer>('main')
  const [tab, setTab] = useState<AppTab>('chat')
  const [petState, setPetState] = useState<PetState>(() => loadPetState())
  const [frameTick, setFrameTick] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [profile, setProfile] = useState<PetProfile>(() => loadPetProfile())
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
  const [communityState, setCommunityState] = useState<'idle' | 'loading' | 'auth' | 'error'>(
    'idle',
  )
  const [petAssetPack, setPetAssetPack] = useState<DesktopPetAssetPack | null>(
    DEFAULT_CODEX_PET_PACK,
  )
  const [petAssetSettings, setPetAssetSettings] = useState<DesktopPetAssetSettings>({
    desktopPetActivePackId: '',
    desktopPetPacks: [],
  })
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(localStorage.getItem('accessToken')),
  )
  const [authRefreshKey, setAuthRefreshKey] = useState(0)
  const authTokenRef = useRef('')

  const {
    messages,
    chatInput,
    chatBusy,
    voiceMode,
    voiceRecording,
    voiceSignalActive,
    isSpeaking,
    bubbleMessage,
    bubbleText,
    chatInputRef,
    messagesEndRef,
    bubbleContentRef,
    setChatInput,
    sendChat,
    showPetNotice,
    clearPetNotice,
    beginHoldVoiceCapture,
    finishVoiceCapture,
  } = usePetConversation({
    api,
    petState,
    setPetState,
    panelOpen,
    tab,
    setIsAuthenticated,
  })

  const {
    services,
    serviceHistory,
    serviceAlerts,
    serviceNow,
    connectorSnapshot,
    toggleService,
    startFocusTimer,
    updateServiceInterval,
    acknowledgeService,
    clearServiceAlert,
  } = usePetServices({
    api,
    panelOpen,
    tab,
    petName: profile.name,
    showPetNotice,
    clearPetNotice,
  })

  const careAnimation = selectAnimation(petState)
  const runtimeAnimation = selectRuntimeAnimation(connectorSnapshot.runtimeSessionReactions)
  const voiceAnimation: PetAnimationKey | null =
    voiceRecording || voiceSignalActive ? 'waiting' : isSpeaking ? 'waving' : null
  const animation: PetAnimationKey = dragging
    ? dragDirection
    : (voiceAnimation ??
      (petState.lastAction === 'idle' ? (runtimeAnimation ?? careAnimation) : careAnimation))
  const petEmotion = selectPetEmotion(petState)
  const activeSprite = getPetSprite(petAssetPack, animation)
  const recommendedActions = useMemo(() => recommendedPetActions(petState), [petState])
  const frameCount = activeSprite?.frame?.count ?? PET_ANIMATION_FRAMES[animation] ?? 6
  const frameFps = Math.max(1, Math.min(30, activeSprite?.frame?.fps ?? 8))
  const frameMs = 1000 / frameFps
  const frameIndex = frameTick % frameCount
  const frameUrl = '/pet/codex/spritesheet.webp'
  const frameWidth = Math.max(1, activeSprite?.frame?.width ?? 192)
  const frameHeight = Math.max(1, activeSprite?.frame?.height ?? 208)
  const petButtonStyle = {
    '--desktop-pet-frame-aspect': `${frameWidth} / ${frameHeight}`,
    '--desktop-pet-frame-width-ratio': String(frameWidth / frameHeight),
    '--desktop-pet-frame-width': `${frameWidth}px`,
    '--desktop-pet-frame-height': `${frameHeight}px`,
    '--desktop-pet-frame-scale': String(petFrameScale),
    '--desktop-pet-content-offset-x': `${petFrameOffset.x * petFrameScale}px`,
    '--desktop-pet-content-offset-y': `${petFrameOffset.y * petFrameScale}px`,
    '--desktop-pet-visual-lift': `${PET_VISUAL_LIFT_PX}px`,
  } as CSSProperties
  const panelPetFrameScale = Math.min(136 / frameWidth, 148 / frameHeight)
  const panelPetStyle = {
    '--desktop-pet-frame-aspect': `${frameWidth} / ${frameHeight}`,
    '--desktop-pet-frame-width-ratio': String(frameWidth / frameHeight),
    '--desktop-pet-frame-width': `${frameWidth}px`,
    '--desktop-pet-frame-height': `${frameHeight}px`,
    '--desktop-pet-frame-scale': String(panelPetFrameScale),
    '--desktop-pet-content-offset-x': `${petFrameOffset.x * panelPetFrameScale}px`,
    '--desktop-pet-content-offset-y': `${petFrameOffset.y * panelPetFrameScale}px`,
    '--desktop-pet-visual-lift': `${PET_VISUAL_LIFT_PX * panelPetFrameScale}px`,
  } as CSSProperties
  const panelPetAvatar = (
    <span className="desktop-pet-panel-avatar" style={panelPetStyle} aria-hidden="true">
      <PetSpriteVisual
        pack={petAssetPack}
        sprite={activeSprite}
        frameIndex={frameIndex}
        fallbackSrc={frameUrl}
      />
    </span>
  )
  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.isRead,
  ).length
  const unreadSubscriptionCount = subscriptionFiles.filter((file) => file.unread).length
  const careAttentionCount = recommendedActions.length > 0 ? 1 : 0
  const communityAuthRequired = !isAuthenticated
  const authAttentionCount = communityAuthRequired ? 1 : 0
  const communityWheelAttention = communityAuthRequired
  const todayServiceKey = serviceDateKey(serviceNow)
  const todayServiceHistory = serviceHistory.find((item) => item.date === todayServiceKey)
  const serviceCompletions = {
    focus: Boolean(todayServiceHistory && todayServiceHistory.focusMs > 0),
    water: Boolean(todayServiceHistory && todayServiceHistory.waterCount > 0),
    fitness: Boolean(todayServiceHistory && todayServiceHistory.fitnessCount > 0),
    coding: Boolean(todayServiceHistory && todayServiceHistory.codingReadyCount > 0),
  }
  const serviceAlertFlags = {
    focus: serviceAlerts.some((item) => item.id === 'focus'),
    water: serviceAlerts.some((item) => item.id === 'water'),
    fitness: serviceAlerts.some((item) => item.id === 'fitness'),
    coding: serviceAlerts.some((item) => item.id === 'coding'),
  }
  const desktopAttentionCount =
    unreadNotificationCount + unreadSubscriptionCount + serviceAlerts.length + authAttentionCount
  const attentionCount =
    unreadNotificationCount +
    unreadSubscriptionCount +
    serviceAlerts.length +
    careAttentionCount +
    authAttentionCount
  const attentionLabel = communityAuthRequired
    ? t('desktopPet.auth.title')
    : unreadNotificationCount > 0 && unreadSubscriptionCount > 0
      ? `${t('desktopPet.community.unread')} / ${t('desktopPet.subscriptions.unread')}`
      : unreadNotificationCount > 0
        ? t('desktopPet.community.unread')
        : unreadSubscriptionCount > 0
          ? t('desktopPet.subscriptions.unread')
          : serviceAlerts.length > 0
            ? t('desktopPet.services.unread')
            : t('desktopPet.care.recommendedAction')

  function setWheelOpenImmediate(open: boolean) {
    wheelOpenRef.current = open
    setWheelOpen(open)
  }

  function closeWheel() {
    setWheelOpenImmediate(false)
    setWheelLayer('main')
  }

  async function setPanelExpanded(open: boolean) {
    const transitionId = panelTransitionRef.current + 1
    panelTransitionRef.current = transitionId

    if (open) {
      setPanelClosing(false)
      setWheelOpenImmediate(false)
      setLayoutMode('expanded')
      setPanelOpen(true)
      await api?.pet?.setPanelMode?.('expanded')
      if (panelTransitionRef.current !== transitionId) return
      return
    }

    setPanelClosing(true)
    setWheelOpenImmediate(false)
    await api?.pet?.setPanelMode?.('compact')
    if (panelTransitionRef.current !== transitionId) return
    await waitForPetWindowTransition()
    if (panelTransitionRef.current !== transitionId) return
    setPanelOpen(false)
    setLayoutMode('compact')
    setPanelClosing(false)
    setWheelLayer('main')
  }

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
    document.documentElement.classList.add('desktop-pet-window')
    return () => {
      document.documentElement.classList.remove('desktop-pet-window')
    }
  }, [])

  useEffect(() => {
    const button = petButtonRef.current
    if (!button) return
    const updateScale = () => {
      const rect = button.getBoundingClientRect()
      const nextScale = Math.min(rect.width / frameWidth, rect.height / frameHeight)
      if (Number.isFinite(nextScale) && nextScale > 0) {
        setPetFrameScale((current) => (Math.abs(current - nextScale) > 0.001 ? nextScale : current))
      }
    }
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(button)
    return () => observer.disconnect()
  }, [frameHeight, frameWidth])

  useEffect(() => {
    wheelOpenRef.current = wheelOpen
  }, [wheelOpen])

  useEffect(() => {
    setPetMouseInteractive(
      layoutMode === 'expanded' ||
        panelOpen ||
        wheelOpen ||
        dragging ||
        voiceRecording ||
        petAssetDropActive ||
        petAssetDropBusy,
    )
  }, [
    dragging,
    layoutMode,
    panelOpen,
    petAssetDropActive,
    petAssetDropBusy,
    voiceRecording,
    wheelOpen,
  ])

  useEffect(() => {
    return () => setPetMouseInteractive(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!petAssetPack || !activeSprite) {
      setPetFrameOffset(ZERO_PET_FRAME_OFFSET)
      return () => {
        cancelled = true
      }
    }

    const cacheKey = petSpriteOpaqueOffsetCacheKey(petAssetPack, activeSprite)
    const cached = petSpriteOpaqueOffsetCache.get(cacheKey)
    if (cached) {
      setPetFrameOffset(cached)
      return () => {
        cancelled = true
      }
    }

    setPetFrameOffset(ZERO_PET_FRAME_OFFSET)
    void measurePetSpriteOpaqueOffset(petAssetPack, activeSprite).then((offset) => {
      if (!cancelled) setPetFrameOffset(offset)
    })
    return () => {
      cancelled = true
    }
  }, [activeSprite, petAssetPack])

  useEffect(() => {
    void api?.getDesktopSettings?.().then((settings) => {
      const nextPetAssetSettings = {
        desktopPetActivePackId: settings.desktopPetActivePackId,
        desktopPetPacks: settings.desktopPetPacks,
      }
      setPetAssetSettings(nextPetAssetSettings)
      setPetAssetPack(activePetAssetPack(nextPetAssetSettings) ?? DEFAULT_CODEX_PET_PACK)
    })
    return api?.onDesktopSettingsChanged?.((settings) => {
      const nextPetAssetSettings = {
        desktopPetActivePackId: settings.desktopPetActivePackId,
        desktopPetPacks: settings.desktopPetPacks,
      }
      setPetAssetSettings(nextPetAssetSettings)
      setPetAssetPack(activePetAssetPack(nextPetAssetSettings) ?? DEFAULT_CODEX_PET_PACK)
    })
  }, [api])

  useEffect(() => {
    setFrameTick(0)
  }, [animation, petState.lastActionAt])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrameTick((value) => (value + 1) % frameCount)
    }, frameMs)
    return () => window.clearInterval(timer)
  }, [frameCount, frameMs])

  useEffect(() => {
    if (petState.lastAction === 'idle') return
    const timer = window.setTimeout(
      () => {
        setPetState((current) =>
          current.lastActionAt === petState.lastActionAt ? settlePetAction(current) : current,
        )
      },
      frameCount * frameMs + 60,
    )
    return () => window.clearTimeout(timer)
  }, [frameCount, frameMs, petState.lastAction, petState.lastActionAt])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPetState((current) => tickPet(current))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    savePetState(petState)
  }, [petState])

  useEffect(() => {
    savePetProfile(profile)
  }, [profile])

  useEffect(() => {
    saveSubscriptions(subscriptions)
  }, [subscriptions])

  useEffect(() => {
    void api?.setBadgeCount?.(desktopAttentionCount)
  }, [api, desktopAttentionCount])

  useEffect(() => {
    const event = petState.game.todayEvent
    if (!event || event.resolved || lastEventBubbleRef.current === event.date) return
    lastEventBubbleRef.current = event.date
    const timer = window.setTimeout(() => {
      showPetNotice(t(`desktopPet.events.${event.id}.hint`))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [petState.game.todayEvent, showPetNotice, t])

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

  const refreshAuthState = useCallback(async () => {
    const token = await readShadowAccessToken(api)
    const tokenChanged = token !== authTokenRef.current
    authTokenRef.current = token
    setIsAuthenticated(Boolean(token))
    if (!token) {
      setCommunityState('auth')
      setSubscriptionState('auth')
      setNotifications([])
      setCommunityChannels([])
      setSubscriptionFiles([])
    } else {
      setCommunityState((current) => (current === 'auth' ? 'idle' : current))
      setSubscriptionState((current) => (current === 'auth' ? 'idle' : current))
    }
    if (tokenChanged) setAuthRefreshKey((current) => current + 1)
    return Boolean(token)
  }, [api])

  const hasCommunityAuthToken = useCallback(async () => {
    const token = await readShadowAccessToken(api)
    authTokenRef.current = token
    setIsAuthenticated(Boolean(token))
    return Boolean(token)
  }, [api])

  const refreshNotifications = useCallback(async () => {
    if (!(await readShadowAccessToken(api))) {
      authTokenRef.current = ''
      setIsAuthenticated(false)
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
      const nextState = communityRequestStateFromError(error)
      if (nextState === 'auth') {
        if (await hasCommunityAuthToken()) {
          setCommunityState('error')
        } else {
          setNotifications([])
          setCommunityState('auth')
        }
        return
      }
      setCommunityState(nextState)
    }
  }, [api, hasCommunityAuthToken])

  const refreshSubscriptions = useCallback(async () => {
    if (!(await readShadowAccessToken(api))) {
      authTokenRef.current = ''
      setIsAuthenticated(false)
      setSubscriptionState('auth')
      setCommunityChannels([])
      setSubscriptionFiles([])
      return
    }
    setSubscriptionState('loading')
    try {
      const [channels, nextSubscriptions] = await Promise.all([
        loadCommunityChannelOptions(api),
        loadContentSubscriptions(api),
      ])
      const files = await loadSubscriptionFiles(api, nextSubscriptions)
      setCommunityChannels(channels)
      setSubscriptions(nextSubscriptions)
      setSubscriptionFiles(files)
      setSubscriptionState('idle')
    } catch (error) {
      const nextState = communityRequestStateFromError(error)
      if (nextState === 'auth') {
        if (await hasCommunityAuthToken()) {
          setSubscriptionState('error')
        } else {
          setCommunityChannels([])
          setSubscriptionFiles([])
          setSubscriptionState('auth')
        }
        return
      }
      setSubscriptionState(nextState)
    }
  }, [api, hasCommunityAuthToken])

  useEffect(() => onCommunityAuthRequired(() => void refreshAuthState()), [refreshAuthState])

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

  useEffect(() => {
    if (tab === 'community') void refreshNotifications()
  }, [refreshNotifications, tab])

  useEffect(() => {
    if (tab === 'subscriptions') void refreshSubscriptions()
  }, [refreshSubscriptions, tab])

  useEffect(() => {
    if (!panelOpen || tab !== 'subscriptions') return
    if (subscriptionState !== 'idle' || unreadSubscriptionCount === 0) return
    let cancelled = false
    void markContentFeedReadScope(api, { all: true })
      .then(() => {
        if (cancelled) return
        const now = new Date().toISOString()
        setSubscriptions((current) =>
          current.map((subscription) => ({ ...subscription, lastSeenAt: now })),
        )
        setSubscriptionFiles((current) =>
          current.map((file) => (file.unread ? { ...file, unread: false } : file)),
        )
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [api, panelOpen, subscriptionState, tab, unreadSubscriptionCount])

  useEffect(() => {
    if (!isAuthenticated) return
    void refreshNotifications()
    const timer = window.setInterval(() => void refreshNotifications(), 60_000)
    return () => window.clearInterval(timer)
  }, [authRefreshKey, isAuthenticated, refreshNotifications])

  useEffect(() => {
    if (!isAuthenticated) return
    void refreshSubscriptions()
    const timer = window.setInterval(() => void refreshSubscriptions(), 60_000)
    return () => window.clearInterval(timer)
  }, [authRefreshKey, isAuthenticated, refreshSubscriptions])

  useEffect(() => {
    return api?.pet?.onShortcut?.((action) => {
      void setPanelExpanded(true)
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
      if (action === 'services') {
        setTab('services')
        return
      }
      if (action === 'care') {
        setTab('care')
        return
      }
      setTab('chat')
      window.setTimeout(() => chatInputRef.current?.focus(), 40)
    })
  }, [api, chatInputRef, refreshNotifications])

  function activatePet() {
    handleCareAction('pet')
  }

  function handleCareAction(action: PetAction) {
    const now = Date.now()
    setPetState((current) => {
      const beforeEvent = current.game.todayEvent
      const next = applyPetAction(current, action, now)
      const afterEvent = next.game.todayEvent
      const resolvedEvent =
        beforeEvent &&
        afterEvent &&
        beforeEvent.id === afterEvent.id &&
        !beforeEvent.resolved &&
        afterEvent.resolved

      window.setTimeout(() => {
        showPetNotice(
          resolvedEvent
            ? t(`desktopPet.events.${afterEvent.id}.resolved`)
            : t(`desktopPet.actionFeedback.${action}`),
        )
      }, 0)
      return next
    })
  }

  function handleServiceWheelAction(service: PetServiceId) {
    if (service === 'focus') {
      if (serviceAlertFlags.focus) {
        clearServiceAlert('focus')
        return
      }
      if (services.focus) toggleService('focus')
      else startFocusTimer(Math.round(services.focusDurationMs / 60_000))
      return
    }
    if (service === 'water') {
      if (serviceAlertFlags.water) {
        acknowledgeService('water')
        return
      }
      if (services.water) acknowledgeService('water')
      else toggleService('water')
      return
    }
    if (service === 'fitness') {
      if (serviceAlertFlags.fitness) {
        acknowledgeService('fitness')
        return
      }
      if (services.fitness) acknowledgeService('fitness')
      else toggleService('fitness')
      return
    }
    if (serviceAlertFlags.coding) {
      clearServiceAlert('coding')
      return
    }
    toggleService('coding')
  }

  function handleProfileChange(nextProfile: PetProfile) {
    setProfile(normalizePetProfile(nextProfile))
  }

  function handleRandomProfile() {
    setProfile(randomPetProfile(Date.now()))
  }

  async function markNotificationRead(notification: NotificationItem) {
    await markCommunityNotificationRead(api, notification)
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
    )
  }

  async function markAllNotificationsRead() {
    if (!notifications.some((notification) => !notification.isRead)) return
    await markAllCommunityNotificationsRead(api)
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
  }

  async function openNotification(notification: NotificationItem) {
    await markNotificationRead(notification)
    try {
      await api?.showCommunity?.(await resolveNotificationRoute(api, notification))
    } catch {
      await api?.showCommunity?.('/settings/notification')
    }
  }

  async function openMainWindowForLogin() {
    const opened = await api?.openCommunityLogin?.('/discover')
    if (!opened) await api?.showMainWindow?.()
    void refreshAuthState()
  }

  async function openCommunityWindow() {
    await api?.showCommunity?.()
  }

  function applyPetAssetSettings(nextSettings: DesktopPetAssetSettings) {
    setPetAssetSettings(nextSettings)
    setPetAssetPack(activePetAssetPack(nextSettings) ?? DEFAULT_CODEX_PET_PACK)
  }

  function setPetMouseInteractive(interactive: boolean) {
    if (petMouseInteractiveRef.current === interactive) return
    petMouseInteractiveRef.current = interactive
    void api?.pet?.setMouseInteractive?.(interactive)
  }

  function isPointOnPetBody(clientX: number, clientY: number) {
    const button = petButtonRef.current
    if (!button) return false
    const mask = petFrameOffset.frameMasks[frameIndex % petFrameOffset.frameMasks.length]
    if (activeSprite && !mask) return false
    const rect = button.getBoundingClientRect()
    const spriteWidth = frameWidth * petFrameScale
    const spriteHeight = frameHeight * petFrameScale
    if (spriteWidth <= 0 || spriteHeight <= 0) return false

    const spriteLeft =
      rect.left + rect.width / 2 + petFrameOffset.x * petFrameScale - spriteWidth / 2
    const spriteTop =
      rect.top +
      rect.height / 2 +
      petFrameOffset.y * petFrameScale +
      PET_VISUAL_LIFT_PX -
      spriteHeight / 2
    const sourceX = Math.floor((clientX - spriteLeft) / petFrameScale)
    const sourceY = Math.floor((clientY - spriteTop) / petFrameScale)
    if (
      sourceX < 0 ||
      sourceY < 0 ||
      sourceX >= petFrameOffset.maskWidth ||
      sourceY >= petFrameOffset.maskHeight
    ) {
      return false
    }
    return Boolean(mask?.[sourceY * petFrameOffset.maskWidth + sourceX])
  }

  function eventTargetKeepsPetInteractive(target: EventTarget | null) {
    if (!(target instanceof Element)) return false
    return Boolean(
      target.closest(
        '.desktop-pet-attention-indicator, .desktop-pet-radial.visible, .desktop-pet-panel',
      ),
    )
  }

  function shouldKeepPetMouseInteractive(event: PointerEvent<HTMLElement>) {
    if (layoutMode === 'expanded' || panelOpen || wheelOpen || dragging || voiceRecording)
      return true
    if (petAssetDropActive || petAssetDropBusy || wheelVoicePressRef.current || dragRef.current) {
      return true
    }
    if (eventTargetKeepsPetInteractive(event.target)) return true
    return isPointOnPetBody(event.clientX, event.clientY)
  }

  function handlePetMouseMove(event: PointerEvent<HTMLElement>) {
    setPetMouseInteractive(shouldKeepPetMouseInteractive(event))
  }

  function updatePetBodyHover(event: PointerEvent<HTMLButtonElement>) {
    const onPetBody = isPointOnPetBody(event.clientX, event.clientY)
    setPetMouseInteractive(onPetBody || wheelOpen || dragging || voiceRecording)
    if (onPetBody) {
      setWheelOpenImmediate(true)
      return
    }
    if (
      !wheelOpenRef.current &&
      !panelOpen &&
      !voiceRecording &&
      !wheelVoicePressRef.current &&
      !dragRef.current
    ) {
      closeWheel()
    }
  }

  async function importDroppedPetAsset(file: File) {
    if (!api?.petAssets?.importFile && !api?.petAssets?.importDirectory) {
      showPetNotice(t('desktopPet.petAssets.importUnavailable'))
      return
    }

    const fallbackPath = fallbackFilePath(file)
    if (!api.petAssets.importFile && !fallbackPath) {
      showPetNotice(t('desktopPet.petAssets.dropPathUnavailable'))
      return
    }

    setPetAssetDropBusy(true)
    try {
      const nextSettings = api.petAssets.importFile
        ? await api.petAssets.importFile(file)
        : await api.petAssets.importDirectory?.(fallbackPath)
      if (nextSettings) applyPetAssetSettings(nextSettings)
      showPetNotice(t('desktopPet.petAssets.imported'))
    } catch {
      showPetNotice(t('desktopPet.petAssets.importFailed'))
    } finally {
      setPetAssetDropBusy(false)
    }
  }

  useEffect(() => {
    const handleNativePetAssetDrop = (event: Event) => {
      const status = (event as CustomEvent<DesktopPetAssetDropEventDetail>).detail?.status
      if (!status) return
      setPetAssetDropActive(false)
      if (status === 'started') {
        setPetAssetDropBusy(true)
        return
      }
      setPetAssetDropBusy(false)
      showPetNotice(
        t(
          status === 'imported'
            ? 'desktopPet.petAssets.imported'
            : 'desktopPet.petAssets.importFailed',
        ),
      )
    }
    window.addEventListener(DESKTOP_PET_ASSET_DROP_EVENT, handleNativePetAssetDrop)
    return () => window.removeEventListener(DESKTOP_PET_ASSET_DROP_EVENT, handleNativePetAssetDrop)
  }, [showPetNotice, t])

  function handlePetAssetDragEnter(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setPetAssetDropActive(true)
  }

  function handlePetAssetDragOver(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setPetAssetDropActive(true)
  }

  function handlePetAssetDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setPetAssetDropActive(false)
  }

  function handlePetAssetDrop(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    setPetAssetDropActive(false)
    if (isPreloadHandledPetAssetDrop(event)) return
    const file = findCodexPetArchive(event.dataTransfer.files)
    if (!file) {
      showPetNotice(t('desktopPet.petAssets.dropUnsupported'))
      return
    }
    void importDroppedPetAsset(file)
  }

  useEffect(() => {
    const handleWindowDragEnter = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = 'copy'
      setPetAssetDropActive(true)
    }
    const handleWindowDragOver = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer!.dropEffect = 'copy'
      setPetAssetDropActive(true)
    }
    const handleWindowDragLeave = (event: globalThis.DragEvent) => {
      if (event.relatedTarget) return
      setPetAssetDropActive(false)
    }
    const handleWindowDrop = (event: globalThis.DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      setPetAssetDropActive(false)
      if (isPreloadHandledNativePetAssetDrop(event)) return
      const files = event.dataTransfer?.files
      const file = files ? findCodexPetArchive(files) : null
      if (!file) {
        showPetNotice(t('desktopPet.petAssets.dropUnsupported'))
        return
      }
      void importDroppedPetAsset(file)
    }
    window.addEventListener('dragenter', handleWindowDragEnter, true)
    window.addEventListener('dragover', handleWindowDragOver, true)
    window.addEventListener('dragleave', handleWindowDragLeave, true)
    window.addEventListener('drop', handleWindowDrop, true)
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter, true)
      window.removeEventListener('dragover', handleWindowDragOver, true)
      window.removeEventListener('dragleave', handleWindowDragLeave, true)
      window.removeEventListener('drop', handleWindowDrop, true)
    }
  })

  async function toggleSubscription(channel: CommunityChannelOption) {
    setSubscriptionState('loading')
    const existing = subscriptions.find((item) => item.channelId === channel.id)
    try {
      if (existing) {
        await unsubscribeContentChannel(api, existing)
      } else {
        await subscribeContentChannel(api, channel)
      }
      await refreshSubscriptions()
    } catch (error) {
      const nextState = communityRequestStateFromError(error)
      setSubscriptionState(nextState)
      if (nextState !== 'auth') showPetNotice(t('desktopPet.subscriptions.state_error'))
    }
  }

  async function openSubscriptionFile(file: SubscriptionFile) {
    if (file.feedItemId) {
      void markContentFeedOpened(api, file.feedItemId).catch(() => null)
    }
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
    if (file.kind === 'card' && file.appKey) {
      const serverRouteId = file.serverSlug ?? file.serverId
      if (serverRouteId) {
        await api?.showCommunity?.(
          `/servers/${encodeURIComponent(serverRouteId)}/apps/${encodeURIComponent(file.appKey)}${
            file.appPath?.startsWith('/') ? `#${file.appPath}` : ''
          }`,
        )
        return
      }
    }
    const useDefaultApp = !canOpenInElectronReader(file)
    const opened = await api?.openReader?.({
      url: file.url,
      title: file.title,
      useDefaultApp,
      attachmentId: file.attachmentId,
    })
    if (!opened && useDefaultApp) void api?.openExternal?.(file.url)
  }

  function beginVoiceInteraction() {
    void beginHoldVoiceCapture()
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
    void api?.pet?.endWindowDrag?.(drag.pointerId)
    dragRef.current = null
    setDragging(false)
  }

  function handlePetPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || event.ctrlKey) return
    if (!isPointOnPetBody(event.clientX, event.clientY)) {
      setPetMouseInteractive(false)
      return
    }
    event.preventDefault()
    setPetMouseInteractive(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointerId = event.pointerId
    const voiceTimer = window.setTimeout(() => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== pointerId || drag.travel >= 7 || drag.voiceStarted) return
      drag.voiceTimer = null
      drag.voiceStarted = true
      setDragging(false)
      beginVoiceInteraction()
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
    void api?.pet?.beginWindowDrag?.({
      pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
    })
    setDragging(false)
  }

  function handlePetPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.voiceStarted) return
    const delta = {
      x: event.screenX - drag.lastScreenX || event.clientX - drag.lastClientX,
      y: event.screenY - drag.lastScreenY || event.clientY - drag.lastClientY,
    }
    if (!delta.x && !delta.y) return
    drag.lastClientX = event.clientX
    drag.lastClientY = event.clientY
    drag.lastScreenX = event.screenX
    drag.lastScreenY = event.screenY
    drag.travel += Math.abs(delta.x) + Math.abs(delta.y)
    const isDraggingNow = drag.travel > 3
    if (isDraggingNow) {
      if (!dragging) setDragging(true)
      setWheelOpenImmediate(false)
    } else {
      updatePetBodyHover(event)
    }
    if (Math.abs(delta.x) >= 1) setDragDirection(delta.x >= 0 ? 'running-right' : 'running-left')
    if (drag.travel >= 7) clearDragVoiceTimer(drag)
    void api?.pet?.moveWindow?.({
      pointerId: drag.pointerId,
    })
  }

  function handlePetPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    clearDragVoiceTimer(drag)
    dragRef.current = null
    void api?.pet?.endWindowDrag?.(drag.pointerId)
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.voiceStarted) {
      finishVoiceCapture()
      return
    }
    if (drag.travel < 7) {
      activatePet()
    }
    setDragging(false)
    updatePetBodyHover(event)
  }

  function cancelPetPointer(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (drag) {
      clearDragVoiceTimer(drag)
      if (drag.voiceStarted) finishVoiceCapture()
      void api?.pet?.endWindowDrag?.(drag.pointerId)
    }
    dragRef.current = null
    setDragging(false)
    updatePetBodyHover(event)
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
      beginVoiceInteraction()
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
      if (!cancelled) setWheelOpenImmediate(false)
    }
  }

  return (
    <main
      className={[
        'desktop-pet',
        layoutMode,
        voiceMode ? 'voice-mode' : '',
        voiceRecording ? 'voice-recording' : '',
        voiceSignalActive ? 'voice-signal' : '',
        isSpeaking ? 'voice-speaking' : '',
        wheelOpen ? 'wheel-open' : '',
        panelOpen ? 'panel-open' : '',
        panelClosing ? 'panel-closing' : '',
        petAssetDropActive ? 'asset-drop-active' : '',
        petAssetDropBusy ? 'asset-drop-busy' : '',
        `emotion-${petEmotion.state}`,
        `phase-${petEmotion.phase}`,
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={(event) => {
        event.preventDefault()
        cancelPendingPetPress()
        void api?.showContextMenu?.()
      }}
      onPointerMove={handlePetMouseMove}
      onPointerLeave={() => {
        if (!dragRef.current && !wheelOpen && !panelOpen && !voiceRecording) {
          setPetMouseInteractive(false)
        }
      }}
    >
      <section
        className="desktop-pet-stage"
        aria-label={profile.name}
        onDragEnter={handlePetAssetDragEnter}
        onDragOver={handlePetAssetDragOver}
        onDragLeave={handlePetAssetDragLeave}
        onDrop={handlePetAssetDrop}
        onPointerLeave={() => {
          if (!voiceRecording && !wheelVoicePressRef.current) {
            closeWheel()
          }
          if (!dragRef.current && !wheelOpenRef.current && !panelOpen) {
            setPetMouseInteractive(false)
          }
        }}
      >
        {layoutMode === 'compact' ? (
          <div className="desktop-pet-stage-anchor">
            <button
              type="button"
              ref={petButtonRef}
              className={`desktop-pet-button ${dragging ? 'dragging' : ''}`}
              style={petButtonStyle}
              onPointerDown={handlePetPointerDown}
              onPointerMove={handlePetPointerMove}
              onPointerUp={handlePetPointerUp}
              onPointerCancel={cancelPetPointer}
              onPointerEnter={updatePetBodyHover}
              onClick={(event) => {
                if (event.detail === 0) activatePet()
              }}
              aria-label={t('desktopPet.actions.interact')}
            >
              <span className="desktop-pet-voice-waves" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <PetSpriteVisual
                pack={petAssetPack}
                sprite={activeSprite}
                frameIndex={frameIndex}
                fallbackSrc={frameUrl}
              />
            </button>
            {bubbleText && !dragging ? (
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

            {attentionCount > 0 && !wheelOpen && !panelOpen ? (
              <button
                type="button"
                className="desktop-pet-attention-indicator"
                aria-label={attentionLabel}
                title={attentionLabel}
                onClick={(event) => {
                  event.stopPropagation()
                  setWheelOpenImmediate(false)
                  if (communityAuthRequired) {
                    setTab('community')
                    void setPanelExpanded(true)
                    return
                  }
                  setTab(
                    unreadNotificationCount > 0
                      ? 'community'
                      : unreadSubscriptionCount > 0
                        ? 'subscriptions'
                        : serviceAlerts.length > 0
                          ? 'services'
                          : 'care',
                  )
                  void setPanelExpanded(true)
                }}
              >
                <span>{attentionCount > 9 ? '9+' : attentionCount}</span>
              </button>
            ) : null}

            <PetWheel
              visible={wheelOpen}
              layer={wheelLayer}
              panelOpen={panelOpen}
              voiceMode={voiceMode}
              services={services}
              serviceCompletions={serviceCompletions}
              serviceAlertFlags={serviceAlertFlags}
              serviceAttention={serviceAlerts.length > 0}
              connectorSnapshot={connectorSnapshot}
              recommendedActions={recommendedActions}
              communityAuthRequired={communityAuthRequired}
              communityAttention={communityWheelAttention}
              onVoicePressStart={handleVoiceWheelPointerDown}
              onVoicePressEnd={finishVoiceWheelPointer}
              onVoicePressCancel={(pointerId) => finishVoiceWheelPointer(pointerId, true)}
              onLayerChange={setWheelLayer}
              onPanel={() => void setPanelExpanded(!panelOpen)}
              onConnection={() => void api?.showSettings?.('connector')}
              onServiceAction={handleServiceWheelAction}
              onCommunity={() => {
                setWheelOpenImmediate(false)
                void openCommunityWindow()
              }}
              onHide={() => {
                void setPanelExpanded(false).then(() => api?.pet?.hide?.())
              }}
              onCareAction={(action) => {
                if (!panelOpen) setWheelOpenImmediate(false)
                handleCareAction(action)
              }}
            />
          </div>
        ) : null}
      </section>

      {panelOpen ? (
        <section className="desktop-pet-panel" aria-label={t('desktopPet.app.title')}>
          <PetPanelShell
            tab={tab}
            unreadNotificationCount={unreadNotificationCount}
            unreadSubscriptionCount={unreadSubscriptionCount}
            serviceAlertCount={serviceAlerts.length}
            careAttentionCount={careAttentionCount}
            avatar={panelPetAvatar}
            onTabChange={setTab}
            onCollapse={() => void setPanelExpanded(false)}
          />
          <div className="desktop-pet-panel-content">
            <PetPanelTopBar
              tab={tab}
              petName={profile.name}
              onClose={() => void setPanelExpanded(false)}
            />

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
                petName={profile.name}
                authRequired={communityAuthRequired}
                inputRef={chatInputRef}
                messagesEndRef={messagesEndRef}
                onOpenMainWindow={openMainWindowForLogin}
              />
            ) : null}
            {tab === 'care' ? (
              <CarePanel
                petState={petState}
                emotion={petEmotion}
                profile={profile}
                recommendedActions={recommendedActions}
                onAction={handleCareAction}
                onProfileChange={handleProfileChange}
                onRandomProfile={handleRandomProfile}
              />
            ) : null}
            {tab === 'services' ? (
              <ServicesPanel
                services={services}
                serviceHistory={serviceHistory}
                now={serviceNow}
                onToggle={toggleService}
                onAcknowledge={acknowledgeService}
                onFocusStart={startFocusTimer}
                onIntervalChange={updateServiceInterval}
              />
            ) : null}
            {tab === 'community' ? (
              <CommunityPanel
                state={communityState}
                notifications={notifications}
                onRefresh={refreshNotifications}
                onOpen={openNotification}
                onMarkRead={markNotificationRead}
                onMarkAllRead={markAllNotificationsRead}
                onOpenMainWindow={openMainWindowForLogin}
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
                onOpenMainWindow={openMainWindowForLogin}
              />
            ) : null}
            {tab === 'store' ? (
              <PetStorePanel
                api={api}
                settings={petAssetSettings}
                authRequired={communityAuthRequired}
                onSettings={applyPetAssetSettings}
                onOpenMainWindow={openMainWindowForLogin}
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}
