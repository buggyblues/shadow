import { CheckCheck, FileText, Mic, RefreshCcw, Send } from 'lucide-react'
import type { FormEvent, RefObject } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatMessage } from '../lib/chatbot'
import type { PetState } from '../lib/game'
import { canOpenInElectronReader } from '../lib/pet-community'
import { localizedPetDisplayText } from '../lib/pet-display'
import type {
  ChannelSubscription,
  CommunityChannelOption,
  CommunityServerOption,
  DesktopPetAssetSettings,
  NotificationItem,
  SubscriptionFile,
} from '../pet-types'
import { DesktopPetAssetsManager, type PetAssetSettingsApi } from './desktop-pet-assets-settings'
import {
  PetPanelButton,
  PetPanelCard,
  PetPanelIconButton,
  PetPanelInput,
  PetPanelSelect,
} from './pet-ui'

function formatPanelTime(value?: number | string | null) {
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string' && value
        ? new Date(value)
        : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function PetLoginGuide({
  onOpenMainWindow,
  descriptionKey = 'desktopPet.auth.description',
}: {
  onOpenMainWindow: () => void
  descriptionKey?: string
}) {
  const { t } = useTranslation()
  return (
    <PetPanelCard className="desktop-pet-login-guide">
      <div>
        <strong>{t('desktopPet.auth.title')}</strong>
        <p>{t(descriptionKey)}</p>
      </div>
      <div className="desktop-pet-login-actions">
        <PetPanelButton type="button" size="sm" onClick={onOpenMainWindow}>
          {t('desktopPet.auth.openMain')}
        </PetPanelButton>
      </div>
    </PetPanelCard>
  )
}

export function ChatPanel({
  messages,
  chatInput,
  chatBusy,
  voiceRecording,
  petState,
  petName,
  authRequired,
  inputRef,
  messagesEndRef,
  onInput,
  onSubmit,
  onVoicePressStart,
  onVoicePressEnd,
  onVoicePressCancel,
  onOpenMainWindow,
}: {
  messages: ChatMessage[]
  chatInput: string
  chatBusy: boolean
  voiceRecording: boolean
  petState: PetState
  petName: string
  authRequired?: boolean
  inputRef: RefObject<HTMLInputElement | null>
  messagesEndRef: RefObject<HTMLDivElement | null>
  onInput: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onVoicePressStart: (pointerId: number) => void
  onVoicePressEnd: (pointerId: number) => void
  onVoicePressCancel: (pointerId: number) => void
  onOpenMainWindow: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="desktop-pet-panel-body desktop-pet-panel-body-chat">
      <div className="desktop-pet-messages">
        {messages.map((message) => (
          <div key={message.id} className={`desktop-pet-message ${message.role}`}>
            <span className="desktop-pet-message-text">
              {localizedPetDisplayText(message, petState, t)}
              {message.streaming ? <span className="desktop-pet-stream-caret" /> : null}
            </span>
            <time dateTime={new Date(message.createdAt).toISOString()}>
              {formatPanelTime(message.createdAt)}
            </time>
          </div>
        ))}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>
      {authRequired ? (
        <div className="desktop-pet-chat-auth-block">
          <PetLoginGuide
            onOpenMainWindow={onOpenMainWindow}
            descriptionKey="desktopPet.auth.chatDescription"
          />
        </div>
      ) : (
        <form className="desktop-pet-chat-form" onSubmit={onSubmit}>
          <PetPanelInput
            ref={inputRef}
            value={chatInput}
            onChange={(event) => onInput(event.target.value)}
            placeholder={t('desktopPet.chat.input', { name: petName })}
            disabled={chatBusy}
          />
          <PetPanelIconButton
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
          </PetPanelIconButton>
          <PetPanelIconButton
            type="submit"
            disabled={chatBusy}
            aria-label={t('desktopPet.chat.send')}
            title={t('desktopPet.chat.send')}
          >
            <Send size={16} />
          </PetPanelIconButton>
        </form>
      )}
    </div>
  )
}

export function PetStorePanel({
  api,
  settings,
  authRequired,
  onSettings,
  onOpenMainWindow,
}: {
  api: PetAssetSettingsApi | null
  settings: DesktopPetAssetSettings
  authRequired?: boolean
  onSettings: (settings: DesktopPetAssetSettings) => void
  onOpenMainWindow: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="desktop-pet-panel-body desktop-pet-inventory">
      <div className="desktop-pet-community-toolbar">
        <div>
          <strong>{t('desktopPet.store.title')}</strong>
          <span>{t('desktopPet.store.subtitle')}</span>
        </div>
      </div>
      {authRequired ? (
        <PetLoginGuide
          onOpenMainWindow={onOpenMainWindow}
          descriptionKey="desktopPet.auth.storeDescription"
        />
      ) : null}
      <DesktopPetAssetsManager
        api={api}
        settings={settings}
        onSettings={onSettings}
        variant="panel"
      />
    </div>
  )
}

export function CommunityPanel({
  state,
  notifications,
  onRefresh,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onOpenMainWindow,
}: {
  state: 'idle' | 'loading' | 'auth' | 'error'
  notifications: NotificationItem[]
  onRefresh: () => void
  onOpen: (notification: NotificationItem) => void
  onMarkRead: (notification: NotificationItem) => void
  onMarkAllRead: () => void
  onOpenMainWindow: () => void
}) {
  const { t } = useTranslation()
  const unreadCount = notifications.filter((notification) => !notification.isRead).length
  const statusText =
    state === 'idle'
      ? unreadCount > 0
        ? t('desktopPet.community.unreadCount', { count: unreadCount })
        : t('desktopPet.community.allRead')
      : t(`desktopPet.community.state_${state}`)
  return (
    <div className="desktop-pet-panel-body">
      <div className="desktop-pet-community-toolbar">
        <div className="desktop-pet-community-heading">
          <strong>{t('desktopPet.community.title')}</strong>
          <span>{statusText}</span>
        </div>
        <div className="desktop-pet-community-actions">
          <PetPanelButton
            type="button"
            size="sm"
            variant="ghost"
            className="desktop-pet-community-read-all"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0 || state !== 'idle'}
          >
            <CheckCheck size={14} />
            {t('desktopPet.community.markAllRead')}
          </PetPanelButton>
          <PetPanelIconButton
            type="button"
            onClick={onRefresh}
            title={t('desktopPet.community.refresh')}
            aria-label={t('desktopPet.community.refresh')}
          >
            <RefreshCcw size={15} />
          </PetPanelIconButton>
        </div>
      </div>
      {state === 'auth' ? (
        <PetLoginGuide
          onOpenMainWindow={onOpenMainWindow}
          descriptionKey="desktopPet.auth.notificationDescription"
        />
      ) : null}
      {state !== 'auth' ? (
        <div className="desktop-pet-notifications">
          {notifications.length === 0 ? (
            <p className="desktop-pet-empty">{t('desktopPet.community.empty')}</p>
          ) : null}
          {notifications.map((notification) => (
            <PetPanelCard
              key={notification.id}
              className={
                notification.isRead ? 'desktop-pet-notification read' : 'desktop-pet-notification'
              }
            >
              <i className="desktop-pet-notification-dot" aria-hidden="true" />
              <div className="desktop-pet-notification-main">
                <span className="desktop-pet-notification-heading">
                  <strong>{notification.title}</strong>
                  {notification.createdAt ? (
                    <time>{formatPanelTime(notification.createdAt)}</time>
                  ) : null}
                </span>
                {notification.body ? <p>{notification.body}</p> : null}
              </div>
              <div className="desktop-pet-notification-actions">
                <PetPanelButton type="button" size="xs" onClick={() => onOpen(notification)}>
                  {t('desktopPet.community.open')}
                </PetPanelButton>
                {!notification.isRead ? (
                  <PetPanelButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => onMarkRead(notification)}
                  >
                    {t('desktopPet.community.markRead')}
                  </PetPanelButton>
                ) : null}
              </div>
            </PetPanelCard>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function SubscriptionsPanel({
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
  onOpenMainWindow,
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
  onOpenMainWindow: () => void
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
        <PetPanelIconButton
          type="button"
          onClick={onRefresh}
          title={t('desktopPet.subscriptions.refresh')}
          aria-label={t('desktopPet.subscriptions.refresh')}
        >
          <RefreshCcw size={15} />
        </PetPanelIconButton>
      </div>

      {state === 'auth' ? (
        <PetLoginGuide
          onOpenMainWindow={onOpenMainWindow}
          descriptionKey="desktopPet.auth.subscriptionDescription"
        />
      ) : null}

      {state !== 'auth' ? (
        <div className="desktop-pet-subscription-picker">
          <div className="desktop-pet-subscription-selects">
            <PetPanelSelect
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
            </PetPanelSelect>
            <PetPanelSelect
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
            </PetPanelSelect>
          </div>
          <PetPanelButton
            type="button"
            variant="primary"
            className="desktop-pet-subscription-primary"
            disabled={!selectedChannel}
            onClick={() => {
              if (selectedChannel) onToggleChannel(selectedChannel)
            }}
          >
            {selectedSubscribed
              ? t('desktopPet.subscriptions.unsubscribe')
              : t('desktopPet.subscriptions.subscribe')}
          </PetPanelButton>
        </div>
      ) : null}

      {state !== 'auth' ? (
        <div className="desktop-pet-subscription-chips">
          {channels.length === 0 ? (
            <p className="desktop-pet-empty">{t('desktopPet.subscriptions.noChannels')}</p>
          ) : null}
          {subscriptions.map((subscription) => (
            <PetPanelButton
              key={subscription.channelId}
              type="button"
              variant="chip"
              size="xs"
              className={subscription.channelId === selectedChannelId ? 'active' : ''}
              onClick={() => {
                onSelectServer(subscription.serverId)
                onSelectChannel(subscription.channelId)
              }}
            >
              {subscription.serverName} / {subscription.channelName}
            </PetPanelButton>
          ))}
        </div>
      ) : null}

      {state !== 'auth' && files.length === 0 ? (
        <p className="desktop-pet-empty">
          {subscriptions.length === 0
            ? t('desktopPet.subscriptions.empty')
            : t('desktopPet.subscriptions.noFiles')}
        </p>
      ) : null}
      {state !== 'auth'
        ? files.map((file) => (
            <PetPanelCard key={file.id} className="desktop-pet-inventory-item">
              <span className="desktop-pet-subscription-file-icon" aria-hidden="true">
                <FileText size={16} />
              </span>
              <span className="desktop-pet-subscription-file-copy">
                {file.unread ? <i className="desktop-pet-inline-dot" aria-hidden="true" /> : null}
                <strong>{file.title}</strong>
                <small>
                  {file.serverName} / {file.channelName}
                  {file.createdAt ? ` · ${formatPanelTime(file.createdAt)}` : ''}
                </small>
              </span>
              <div className="desktop-pet-subscription-actions">
                <PetPanelButton
                  type="button"
                  size="sm"
                  className="desktop-pet-subscription-open"
                  onClick={() => onOpenFile(file)}
                >
                  {canOpenInElectronReader(file)
                    ? t('desktopPet.subscriptions.openReader')
                    : t('desktopPet.subscriptions.openDefault')}
                </PetPanelButton>
              </div>
            </PetPanelCard>
          ))
        : null}
    </div>
  )
}
