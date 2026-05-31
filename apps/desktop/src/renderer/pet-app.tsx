import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PetPanelShell, PetPanelTopBar } from './components/pet-panel-shell'
import {
  CarePanel,
  ChatPanel,
  CommunityPanel,
  PetLoginGuide,
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
  type PetState,
  recommendedPetActions,
  selectAnimation,
  selectPetEmotion,
  settlePetAction,
  tickPet,
} from './lib/game'
import { activePetAssetPack, getPetSprite, spriteSheetStyle } from './lib/pet-asset-packs'
import {
  canOpenInElectronReader,
  communityRequestStateFromError,
  fetchShadow,
  loadCommunityChannelOptions,
  loadSubscriptionFiles,
  onCommunityAuthRequired,
  readShadowAccessToken,
} from './lib/pet-community'
import { markCommunityNotificationRead, resolveNotificationRoute } from './lib/pet-notifications'
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
  NotificationItem,
  PetProfile,
  SubscriptionFile,
  WheelLayer,
} from './pet-types'

const FRAME_MS = 360
const VOICE_LONG_PRESS_MS = 420

function getDesktopApi(): DesktopPetApi | null {
  if (!('desktopAPI' in window)) return null
  return (window as unknown as { desktopAPI?: DesktopPetApi }).desktopAPI ?? null
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
  const lastEventBubbleRef = useRef<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
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
  const [petAssetPack, setPetAssetPack] = useState<DesktopPetAssetPack | null>(null)
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
    serviceAlerts,
    serviceNow,
    connectorSnapshot,
    toggleService,
    startFocusTimer,
    acknowledgeService,
  } = usePetServices({
    api,
    panelOpen,
    tab,
    showPetNotice,
  })

  const animation = selectAnimation(petState)
  const petEmotion = selectPetEmotion(petState)
  const activeSprite = getPetSprite(petAssetPack, animation, petEmotion.state)
  const recommendedActions = useMemo(() => recommendedPetActions(petState), [petState])
  const frameCount = activeSprite?.frame?.count ?? PET_ANIMATION_FRAMES[animation] ?? 6
  const frameIndex = Math.floor(frameTick / 4) % frameCount
  const frameUrl = `/pet/animations/${animation}/${String(frameIndex).padStart(2, '0')}.png`
  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.isRead,
  ).length
  const unreadSubscriptionCount = subscriptionFiles.filter((file) => file.unread).length
  const careAttentionCount = recommendedActions.length > 0 ? 1 : 0
  const communityAuthRequired = !isAuthenticated
  const authAttentionCount = communityAuthRequired ? 1 : 0
  const communityAttention =
    communityAuthRequired || unreadNotificationCount > 0 || unreadSubscriptionCount > 0
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
    void api?.getDesktopSettings?.().then((settings) => {
      setPetAssetPack(activePetAssetPack(settings))
    })
    return api?.onDesktopSettingsChanged?.((settings) => {
      setPetAssetPack(activePetAssetPack(settings))
    })
  }, [api])

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
      const [channels, files] = await Promise.all([
        loadCommunityChannelOptions(api),
        loadSubscriptionFiles(api, subscriptions),
      ])
      setCommunityChannels(channels)
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
  }, [api, hasCommunityAuthToken, subscriptions])

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
    if (!isAuthenticated) return
    void refreshNotifications()
    const timer = window.setInterval(() => void refreshNotifications(), 60_000)
    return () => window.clearInterval(timer)
  }, [authRefreshKey, isAuthenticated, refreshNotifications])

  useEffect(() => {
    if (!isAuthenticated || subscriptions.length === 0) return
    void refreshSubscriptions()
    const timer = window.setInterval(() => void refreshSubscriptions(), 60_000)
    return () => window.clearInterval(timer)
  }, [authRefreshKey, isAuthenticated, refreshSubscriptions, subscriptions.length])

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

  async function openNotification(notification: NotificationItem) {
    await markNotificationRead(notification)
    try {
      await api?.showCommunity?.(await resolveNotificationRoute(api, notification))
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
    >
      <section
        className="desktop-pet-stage"
        aria-label={profile.name}
        onPointerLeave={() => {
          if (!voiceRecording && !wheelVoicePressRef.current) {
            setWheelOpen(false)
            setWheelLayer('main')
          }
        }}
      >
        <button
          type="button"
          className={`desktop-pet-button ${dragging ? 'dragging' : ''}`}
          onPointerDown={handlePetPointerDown}
          onPointerMove={handlePetPointerMove}
          onPointerUp={handlePetPointerUp}
          onPointerCancel={cancelPetPointer}
          onPointerEnter={() => {
            setWheelOpen(true)
          }}
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
          {petAssetPack && activeSprite ? (
            <span
              className="desktop-pet-sprite desktop-pet-sprite-sheet"
              style={spriteSheetStyle(petAssetPack, activeSprite, frameIndex)}
              aria-hidden="true"
            />
          ) : (
            <img src={frameUrl} alt="" className="desktop-pet-sprite" draggable={false} />
          )}
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

        {attentionCount > 0 && !wheelOpen && !panelOpen ? (
          <button
            type="button"
            className="desktop-pet-attention-indicator"
            aria-label={attentionLabel}
            title={attentionLabel}
            onClick={(event) => {
              event.stopPropagation()
              setPanelOpen(true)
              setWheelOpen(false)
              if (communityAuthRequired) {
                setTab('community')
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
            }}
          >
            <span>{attentionCount > 9 ? '9+' : attentionCount}</span>
          </button>
        ) : null}

        <PetWheel
          visible={panelOpen || wheelOpen}
          layer={wheelLayer}
          panelOpen={panelOpen}
          voiceMode={voiceMode}
          connectorSnapshot={connectorSnapshot}
          recommendedActions={recommendedActions}
          communityAuthRequired={communityAuthRequired}
          communityAttention={communityAttention}
          onVoicePressStart={handleVoiceWheelPointerDown}
          onVoicePressEnd={finishVoiceWheelPointer}
          onVoicePressCancel={(pointerId) => finishVoiceWheelPointer(pointerId, true)}
          onLayerChange={setWheelLayer}
          onPanel={() => setPanelOpen((open) => !open)}
          onConnection={() => void api?.showSettings?.('connector')}
          onCommunity={() => {
            setWheelOpen(false)
            void openCommunityWindow()
          }}
          onHide={() => {
            setPanelOpen(false)
            void api?.pet?.hide?.()
          }}
          onCareAction={(action) => {
            if (!panelOpen) setWheelOpen(false)
            handleCareAction(action)
          }}
        />
      </section>

      {panelOpen ? (
        <section
          className={isAuthenticated ? 'desktop-pet-panel' : 'desktop-pet-panel auth-only'}
          aria-label={t('desktopPet.app.title')}
        >
          {!isAuthenticated ? (
            <div className="desktop-pet-panel-content login-only">
              <PetLoginGuide onOpenMainWindow={openMainWindowForLogin} />
            </div>
          ) : (
            <>
              <PetPanelShell
                tab={tab}
                unreadNotificationCount={unreadNotificationCount}
                unreadSubscriptionCount={unreadSubscriptionCount}
                serviceAlertCount={serviceAlerts.length}
                careAttentionCount={careAttentionCount}
                onTabChange={setTab}
              />
              <div className="desktop-pet-panel-content">
                <PetPanelTopBar tab={tab} petName={profile.name} />

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
                    connectorSnapshot={connectorSnapshot}
                    now={serviceNow}
                    onToggle={toggleService}
                    onAcknowledge={acknowledgeService}
                    onFocusStart={startFocusTimer}
                  />
                ) : null}
                {tab === 'community' ? (
                  <CommunityPanel
                    state={communityState}
                    notifications={notifications}
                    onRefresh={refreshNotifications}
                    onOpen={openNotification}
                    onMarkRead={markNotificationRead}
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
                    authRequired={communityAuthRequired}
                    onOpenSettings={() => void api?.showSettings?.('pet')}
                    onOpenStore={openPetStore}
                    onOpenMainWindow={openMainWindowForLogin}
                  />
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : null}
    </main>
  )
}
