import {
  type LoginRequest,
  type LoginSession,
  LoginView,
  type LoginViewText,
} from '@shadowob/views'
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Coffee,
  Compass,
  Heart,
  LogOut,
  type LucideIcon,
  MessageCircle,
  Moon,
  Package,
  RefreshCcw,
  Send,
  Sparkles,
  Utensils,
  Waves,
  X,
} from 'lucide-react'
import {
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CommunityEvent,
  PublicSession,
  ShadowChannel,
  ShadowNotification,
  ShadowServerEntry,
} from '../shared/types'
import { type ChatMessage, createInitialMessages, createPetReply } from './lib/chatbot'
import { getDesktopApi } from './lib/desktop-api'
import {
  applyPetAction,
  type InventoryItem,
  levelXpRequirement,
  PET_ANIMATION_FRAMES,
  type PetAction,
  type PetGameState,
  type PetQuest,
  type PetState,
  parsePetState,
  selectAnimation,
  serializePetState,
  settlePetAction,
  tickPet,
} from './lib/game'

const PET_STORAGE_KEY = 'xiadou:pet-state:v2'
const CHAT_STORAGE_KEY = 'xiadou:chat:v1'
const SHADOW_WEB_ORIGIN = 'https://shadowob.app'
const FRAME_MS = 110

const actionOrder: PetAction[] = ['feed', 'pet', 'play', 'rest', 'explore', 'tea']
const actionIcons: Record<PetAction, LucideIcon> = {
  feed: Utensils,
  pet: Heart,
  play: Sparkles,
  rest: Moon,
  explore: Compass,
  tea: Coffee,
}

const statKeys = ['mood', 'hunger', 'charm', 'energy', 'health', 'loyalty'] as const
const tabIcons: Record<AppTab, LucideIcon> = {
  chat: MessageCircle,
  stats: Waves,
  community: Bell,
  bag: Package,
}

type AppTab = 'chat' | 'stats' | 'community' | 'bag'
type SocketStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

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

export function App() {
  const { t } = useTranslation()
  const api = getDesktopApi()
  const dragRef = useRef<{
    pointerId: number
    lastClientX: number
    lastClientY: number
    lastScreenX: number
    lastScreenY: number
    travel: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [tab, setTab] = useState<AppTab>('chat')
  const [petState, setPetState] = useState<PetState>(() => loadPetState())
  const [frameTick, setFrameTick] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatMessages())
  const [chatInput, setChatInput] = useState('')
  const [session, setSession] = useState<PublicSession | null>(null)
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('disconnected')
  const [notifications, setNotifications] = useState<ShadowNotification[]>([])
  const [servers, setServers] = useState<ShadowServerEntry[]>([])
  const [channels, setChannels] = useState<ShadowChannel[]>([])
  const [selectedServerId, setSelectedServerId] = useState('')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [subscriptions, setSubscriptions] = useState<string[]>([])

  const animation = selectAnimation(petState)
  const frameCount = PET_ANIMATION_FRAMES[animation] ?? 6
  const frameUrl = `/pet/animations/${animation}/${String(frameTick % frameCount).padStart(2, '0')}.png`
  const nextLevelXp = levelXpRequirement(petState.stats.level)

  const loginRequest = useCallback<LoginRequest>(
    async (path, init) => {
      if (!api) throw new Error(t('auth.failed'))
      return api.auth.request(path, {
        method: init?.method,
        headers: normalizeHeaders(init?.headers),
        body: stringifyRequestBody(init?.body),
      })
    },
    [api, t],
  )

  useEffect(() => {
    api?.desktop.setPanelMode(panelOpen ? 'expanded' : 'compact')
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
    let disposeAuth: (() => void) | undefined
    let disposeCommunity: (() => void) | undefined
    api?.auth
      .getSession()
      .then(setSession)
      .catch(() => null)
    api?.community
      .getSubscriptions()
      .then(setSubscriptions)
      .catch(() => null)
    disposeAuth = api?.auth.onChanged(setSession)
    disposeCommunity = api?.community.onEvent((event) => handleCommunityEvent(event))
    return () => {
      disposeAuth?.()
      disposeCommunity?.()
    }
  }, [api])

  useEffect(() => {
    if (!session?.authenticated) return
    void refreshCommunity()
  }, [session?.authenticated])

  async function refreshCommunity() {
    if (!api || !session?.authenticated) return
    const [nextNotifications, nextServers] = await Promise.all([
      api.community.listNotifications(20).catch(() => []),
      api.community.listServers().catch(() => []),
    ])
    setNotifications(nextNotifications)
    setServers(nextServers)
    const serverId = selectedServerId || nextServers[0]?.server.id || ''
    setSelectedServerId(serverId)
    if (serverId) {
      const nextChannels = await api.community.listChannels(serverId).catch(() => [])
      setChannels(nextChannels)
      setSelectedChannelId((current) => current || nextChannels[0]?.id || '')
    }
  }

  async function loadChannels(serverId: string) {
    setSelectedServerId(serverId)
    setSelectedChannelId('')
    if (!api || !serverId) return
    const nextChannels = await api.community.listChannels(serverId).catch(() => [])
    setChannels(nextChannels)
    setSelectedChannelId(nextChannels[0]?.id || '')
  }

  function handleCommunityEvent(event: CommunityEvent) {
    if (event.type === 'socket-status') {
      setSocketStatus(event.status)
      return
    }
    if (event.type === 'notification') {
      setNotifications((current) =>
        [event.notification, ...current.filter((n) => n.id !== event.notification.id)].slice(0, 20),
      )
      setPetState((current) => applyPetAction(current, 'pet'))
      return
    }
    if (event.type === 'message') {
      setMessages((current) => [
        ...current,
        {
          id: `community-${event.message.id}`,
          role: 'pet',
          text: event.message.content,
          createdAt: Date.now(),
        },
      ])
    }
  }

  function runAction(action: PetAction) {
    setPetState((current) => applyPetAction(current, action))
  }

  function activatePet() {
    runAction('pet')
    if (!panelOpen) setPanelOpen(true)
  }

  function sendChat(event: FormEvent) {
    event.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const now = Date.now()
    const userMessage: ChatMessage = { id: `user-${now}`, role: 'user', text, createdAt: now }
    const reply = createPetReply(text, petState, now + 1)
    setMessages((current) => [...current, userMessage, reply].slice(-24))
    setChatInput('')
    setPetState((current) => applyPetAction(current, 'pet'))
  }

  async function acceptLoginSession(loginSession: LoginSession) {
    if (!api) return
    const next = await api.auth.acceptSession(loginSession)
    setSession(next)
    await refreshCommunity()
  }

  async function addSubscription() {
    if (!api || !selectedChannelId) return
    const next = await api.community.setSubscriptions([...subscriptions, selectedChannelId])
    setSubscriptions(next)
  }

  async function openNotification(notification: ShadowNotification) {
    await api?.community.openNotification(notification)
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
    )
  }

  async function markRead(notification: ShadowNotification) {
    await api?.community.markNotificationRead(notification.id)
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
    )
  }

  function handlePetPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      travel: 0,
    }
    setDragging(false)
  }

  function handlePetPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
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
    void api?.desktop.moveWindow(delta)
  }

  function handlePetPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.travel < 7) activatePet()
  }

  return (
    <main className={`app-shell ${panelOpen ? 'expanded' : 'compact'}`}>
      <section className="pet-stage" aria-label={t('pet.name')}>
        {panelOpen ? (
          <div className="pet-title">
            <div>
              <strong>{t('pet.name')}</strong>
              <span>{t('pet.level', { level: petState.stats.level })}</span>
            </div>
            <button
              className="icon-button no-drag"
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label={t('app.compact')}
              title={t('app.compact')}
            >
              <ChevronDown size={18} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className={`pet-button no-drag ${dragging ? 'dragging' : ''}`}
          onPointerDown={handlePetPointerDown}
          onPointerMove={handlePetPointerMove}
          onPointerUp={handlePetPointerUp}
          onPointerCancel={() => {
            dragRef.current = null
            setDragging(false)
          }}
          onClick={(event) => {
            if (event.detail === 0) activatePet()
          }}
          aria-label={t('actions.pet')}
        >
          <img src={frameUrl} alt="" className="pet-sprite" draggable={false} />
        </button>

        <div className="quick-actions no-drag">
          {actionOrder.map((action) => (
            <ActionButton
              key={action}
              action={action}
              label={t(`actions.${action}`)}
              Icon={actionIcons[action]}
              onClick={() => runAction(action)}
            />
          ))}
          <button
            type="button"
            className="action action-toggle"
            onClick={() => setPanelOpen((value) => !value)}
            title={panelOpen ? t('app.compact') : t('app.expand')}
            aria-label={panelOpen ? t('app.compact') : t('app.expand')}
          >
            {panelOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            <span>{panelOpen ? t('app.compact') : t('app.expand')}</span>
          </button>
        </div>
      </section>

      {panelOpen ? (
        <section className="control-panel no-drag" aria-label={t('app.title')}>
          <header className="panel-header">
            <div>
              <h1>{t('app.title')}</h1>
              <p>{t('app.subtitle')}</p>
            </div>
            <button
              className="icon-button no-drag"
              type="button"
              onClick={() => api?.desktop.quit()}
              aria-label={t('app.quit')}
              title={t('app.quit')}
            >
              <X size={16} />
            </button>
          </header>

          <nav className="tabs" aria-label={t('app.title')}>
            {(Object.keys(tabIcons) as AppTab[]).map((item) => {
              const Icon = tabIcons[item]
              return (
                <button
                  key={item}
                  type="button"
                  className={tab === item ? 'active' : ''}
                  onClick={() => setTab(item)}
                >
                  <Icon size={15} />
                  <span>{t(`tabs.${item}`)}</span>
                </button>
              )
            })}
          </nav>

          {tab === 'chat' ? (
            <ChatPanel
              messages={messages}
              chatInput={chatInput}
              onInput={setChatInput}
              onSubmit={sendChat}
              petState={petState}
            />
          ) : null}
          {tab === 'stats' ? <StatsPanel petState={petState} nextLevelXp={nextLevelXp} /> : null}
          {tab === 'community' ? (
            <CommunityPanel
              session={session}
              socketStatus={socketStatus}
              notifications={notifications}
              servers={servers}
              channels={channels}
              selectedServerId={selectedServerId}
              selectedChannelId={selectedChannelId}
              subscriptions={subscriptions}
              loginRequest={loginRequest}
              onAuthenticated={acceptLoginSession}
              onLogout={() => api?.auth.logout().then(setSession)}
              onOpenExternal={(url) => api?.desktop.openExternal(url)}
              onRefresh={refreshCommunity}
              onServerChange={loadChannels}
              onChannelChange={setSelectedChannelId}
              onSubscribe={addSubscription}
              onOpenNotification={openNotification}
              onMarkRead={markRead}
            />
          ) : null}
          {tab === 'bag' ? (
            <InventoryPanel inventory={petState.inventory} game={petState.game} />
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function ActionButton({
  action,
  label,
  Icon,
  onClick,
}: {
  action: PetAction
  label: string
  Icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button type="button" className={`action action-${action}`} onClick={onClick} title={label}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  )
}

function ChatPanel({
  messages,
  chatInput,
  petState,
  onInput,
  onSubmit,
}: {
  messages: ChatMessage[]
  chatInput: string
  petState: PetState
  onInput: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="panel-body chat-panel">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.key
              ? t(message.key, {
                  mood: petState.stats.mood,
                  hunger: petState.stats.hunger,
                  energy: petState.stats.energy,
                  health: petState.stats.health,
                  shells: petState.game.shells,
                })
              : message.text}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={onSubmit}>
        <input
          value={chatInput}
          onChange={(event) => onInput(event.target.value)}
          placeholder={t('chat.input')}
        />
        <button type="submit" aria-label={t('chat.send')} title={t('chat.send')}>
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

function StatsPanel({ petState, nextLevelXp }: { petState: PetState; nextLevelXp: number }) {
  const { t } = useTranslation()
  const completedQuests = petState.game.quests.filter((quest) => quest.completed).length
  return (
    <div className="panel-body stats-panel">
      <div className="level-row">
        <strong>{t('pet.level', { level: petState.stats.level })}</strong>
        <span>{t('pet.xp', { xp: petState.stats.xp, next: nextLevelXp })}</span>
      </div>
      <div className="game-summary">
        <div>
          <span>{t('game.shells')}</span>
          <strong>{petState.game.shells}</strong>
        </div>
        <div>
          <span>{t('game.streak')}</span>
          <strong>{t('game.days', { count: petState.game.streakDays })}</strong>
        </div>
        <div>
          <span>{t('game.questProgress')}</span>
          <strong>
            {completedQuests}/{petState.game.quests.length}
          </strong>
        </div>
      </div>
      {statKeys.map((key) => (
        <StatMeter key={key} label={t(`stats.${key}`)} value={petState.stats[key]} />
      ))}
      <dl className="traits">
        <div>
          <dt>{t('pet.personality')}</dt>
          <dd>{petState.stats.personality}</dd>
        </div>
        <div>
          <dt>{t('pet.attribute')}</dt>
          <dd>{t(`pet.attribute_${petState.stats.attribute}`)}</dd>
        </div>
      </dl>
      <section className="quest-section">
        <h2>{t('game.quests')}</h2>
        {petState.game.quests.map((quest) => (
          <QuestRow key={quest.id} quest={quest} />
        ))}
      </section>
    </div>
  )
}

function QuestRow({ quest }: { quest: PetQuest }) {
  const { t } = useTranslation()
  return (
    <div className={quest.completed ? 'quest-row completed' : 'quest-row'}>
      <div>
        <strong>{t(`quests.${quest.id}`)}</strong>
        <span>
          {quest.progress}/{quest.goal}
        </span>
      </div>
      <meter min={0} max={quest.goal} value={quest.progress} />
    </div>
  )
}

function StatMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-meter">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <meter min={0} max={100} value={value} />
    </div>
  )
}

function CommunityPanel(props: {
  session: PublicSession | null
  socketStatus: SocketStatus
  notifications: ShadowNotification[]
  servers: ShadowServerEntry[]
  channels: ShadowChannel[]
  selectedServerId: string
  selectedChannelId: string
  subscriptions: string[]
  loginRequest: LoginRequest
  onAuthenticated: (session: LoginSession) => Promise<void>
  onLogout: () => void
  onOpenExternal: (url: string) => void
  onRefresh: () => void
  onServerChange: (serverId: string) => void
  onChannelChange: (channelId: string) => void
  onSubscribe: () => void
  onOpenNotification: (notification: ShadowNotification) => void
  onMarkRead: (notification: ShadowNotification) => void
}) {
  const { t, i18n } = useTranslation()
  const isAuthed = props.session?.authenticated
  const statusLabel = t(`community.status_${props.socketStatus}`)
  const webOrigin = props.session?.webOrigin ?? SHADOW_WEB_ORIGIN
  const loginText = useMemo(() => createLoginText(t), [t])

  function handleLoginLink(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(target instanceof HTMLAnchorElement)) return
    const href = target.href
    if (!href.startsWith('http://') && !href.startsWith('https://')) return
    event.preventDefault()
    props.onOpenExternal(href)
  }

  if (!isAuthed) {
    return (
      <div className="panel-body auth-panel">
        <div className="login-view-shell" onClickCapture={handleLoginLink}>
          <LoginView
            variant="page"
            lang={i18n.language}
            redirect="/app"
            oauthRedirect="shadow://auth/callback"
            apiBase={webOrigin}
            logoSrc="/pet/animations/idle/00.png"
            brandSuffix={t('auth.desktopSuffix')}
            termsHref={`${webOrigin}/terms`}
            privacyHref={`${webOrigin}/privacy`}
            text={loginText}
            request={props.loginRequest}
            getErrorMessage={(error, fallback) =>
              error instanceof Error && error.message ? error.message : fallback
            }
            onAuthenticated={props.onAuthenticated}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="panel-body community-panel">
      <div className="community-toolbar">
        <div>
          <strong>{props.session?.user?.displayName ?? props.session?.user?.username}</strong>
          <span>{statusLabel}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={props.onRefresh}
          title={t('community.refresh')}
        >
          <RefreshCcw size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={props.onLogout}
          title={t('auth.logout')}
        >
          <LogOut size={15} />
        </button>
      </div>

      <div className="subscribe-row">
        <select
          value={props.selectedServerId}
          onChange={(event) => props.onServerChange(event.target.value)}
        >
          {props.servers.length === 0 ? <option>{t('community.noServers')}</option> : null}
          {props.servers.map((entry) => (
            <option key={entry.server.id} value={entry.server.id}>
              {entry.server.name}
            </option>
          ))}
        </select>
        <select
          value={props.selectedChannelId}
          onChange={(event) => props.onChannelChange(event.target.value)}
        >
          {props.channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={props.onSubscribe}>
          {t('community.add')}
        </button>
      </div>
      <p className="hint">{t('community.subscribed', { count: props.subscriptions.length })}</p>

      <div className="notification-list">
        {props.notifications.length === 0 ? (
          <p className="empty">{t('community.noNotifications')}</p>
        ) : null}
        {props.notifications.map((notification) => (
          <article
            key={notification.id}
            className={notification.isRead ? 'notification read' : 'notification'}
          >
            <div>
              <strong>{notification.title}</strong>
              {notification.body ? <p>{notification.body}</p> : null}
            </div>
            <div className="notification-actions">
              <button type="button" onClick={() => props.onOpenNotification(notification)}>
                {t('community.open')}
              </button>
              {!notification.isRead ? (
                <button type="button" onClick={() => props.onMarkRead(notification)}>
                  {t('community.markRead')}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function InventoryPanel({ inventory, game }: { inventory: InventoryItem[]; game: PetGameState }) {
  const { t } = useTranslation()
  const available = useMemo(() => inventory.filter((item) => item.count > 0), [inventory])
  return (
    <div className="panel-body inventory-panel">
      <div className="inventory-wallet">
        <span>{t('game.shells')}</span>
        <strong>{game.shells}</strong>
      </div>
      {available.length === 0 ? <p className="empty">{t('inventory.empty')}</p> : null}
      {available.map((item) => (
        <div key={item.id} className="inventory-item">
          <span>{t(`inventory.${item.id}`)}</span>
          <strong>{item.count}</strong>
        </div>
      ))}
      <section className="achievement-section">
        <h2>{t('game.achievements')}</h2>
        {game.achievements.length === 0 ? (
          <p className="empty">{t('game.noAchievements')}</p>
        ) : null}
        {game.achievements.map((achievement) => (
          <div key={achievement} className="achievement-chip">
            {t(`achievements.${achievement}`)}
          </div>
        ))}
      </section>
    </div>
  )
}

function createLoginText(
  t: (key: string, options?: Record<string, unknown>) => string,
): LoginViewText {
  return {
    brand: t('auth.loginView.brand'),
    close: t('auth.loginView.close'),
    back: t('auth.loginView.back'),
    welcomeTitle: t('auth.loginView.welcomeTitle'),
    welcomeSubtitle: t('auth.loginView.welcomeSubtitle'),
    google: t('auth.loginView.google'),
    github: t('auth.loginView.github'),
    passwordTab: t('auth.loginView.passwordTab'),
    passwordSubtitle: t('auth.loginView.passwordSubtitle'),
    emailLabel: t('auth.loginView.emailLabel'),
    emailPlaceholder: t('auth.loginView.emailPlaceholder'),
    emailOrUsernameLabel: t('auth.loginView.emailOrUsernameLabel'),
    emailOrUsernamePlaceholder: t('auth.loginView.emailOrUsernamePlaceholder'),
    passwordLabel: t('auth.loginView.passwordLabel'),
    continueEmail: t('auth.loginView.continueEmail'),
    continuingEmail: t('auth.loginView.continuingEmail'),
    login: t('auth.loginView.login'),
    loggingIn: t('auth.loginView.loggingIn'),
    switchToPassword: t('auth.loginView.switchToPassword'),
    switchToEmailCode: t('auth.loginView.switchToEmailCode'),
    checkEmailTitle: t('auth.loginView.checkEmailTitle'),
    checkEmailMessage: t('auth.loginView.checkEmailMessage'),
    codeDigit: (index) => t('auth.loginView.codeDigit', { index }),
    verifying: t('auth.loginView.verifying'),
    resendIn: (seconds) => t('auth.loginView.resendIn', { seconds }),
    resend: t('auth.loginView.resend'),
    codeSent: t('auth.loginView.codeSent'),
    termsPrefix: t('auth.loginView.termsPrefix'),
    terms: t('auth.loginView.terms'),
    privacy: t('auth.loginView.privacy'),
    termsJoiner: t('auth.loginView.termsJoiner'),
    failed: t('auth.failed'),
    or: t('auth.loginView.or'),
  }
}

function normalizeHeaders(headers: HeadersInit | undefined) {
  if (!headers) return undefined
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return headers
}

function stringifyRequestBody(body: BodyInit | null | undefined) {
  if (!body) return undefined
  return typeof body === 'string' ? body : String(body)
}
