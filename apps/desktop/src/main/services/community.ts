import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, Notification, shell } from 'electron'
import { io, type Socket } from 'socket.io-client'
import { resolveCommunityUrl } from '../../shared/community-url'
import type {
  CommunityEvent,
  ShadowChannel,
  ShadowMessage,
  ShadowNotification,
  ShadowServerEntry,
} from '../../shared/types'
import type { SessionService } from './session'
import type { ShadowApiService } from './shadow-api'

type CommunityPrefs = {
  subscribedChannelIds: string[]
}

const DEFAULT_PREFS: CommunityPrefs = {
  subscribedChannelIds: [],
}

function prefsPath() {
  return join(app.getPath('userData'), 'community-preferences.json')
}

function readPrefs(): CommunityPrefs {
  try {
    const path = prefsPath()
    if (!existsSync(path)) return DEFAULT_PREFS
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CommunityPrefs>
    return {
      subscribedChannelIds: Array.isArray(parsed.subscribedChannelIds)
        ? parsed.subscribedChannelIds.filter((id): id is string => typeof id === 'string')
        : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function writePrefs(prefs: CommunityPrefs) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(prefsPath(), JSON.stringify(prefs))
}

export class CommunityService extends EventEmitter {
  private socket: Socket | null = null
  private prefs = readPrefs()

  constructor(
    private readonly webOrigin: string,
    private readonly session: SessionService,
    private readonly api: ShadowApiService,
    private readonly getWindow: () => BrowserWindow | null,
  ) {
    super()
    this.session.on('changed', () => {
      this.reconnect()
    })
  }

  start() {
    this.reconnect()
  }

  stop() {
    this.disconnect()
  }

  async listServers() {
    return this.api.request<ShadowServerEntry[]>('/api/servers')
  }

  async listChannels(serverId: string) {
    return this.api.request<ShadowChannel[]>(
      `/api/servers/${encodeURIComponent(serverId)}/channels`,
    )
  }

  async listNotifications(limit = 20) {
    return this.api.request<ShadowNotification[]>(`/api/notifications?limit=${limit}`)
  }

  async markNotificationRead(id: string) {
    return this.api.request<ShadowNotification>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
      {
        method: 'PATCH',
      },
    )
  }

  getSubscriptions() {
    return [...this.prefs.subscribedChannelIds]
  }

  setSubscriptions(channelIds: string[]) {
    const next = [...new Set(channelIds.filter(Boolean))]
    const previous = new Set(this.prefs.subscribedChannelIds)
    this.prefs = { subscribedChannelIds: next }
    writePrefs(this.prefs)

    if (this.socket?.connected) {
      for (const id of next) {
        if (!previous.has(id)) this.socket.emit('channel:join', { channelId: id })
      }
      for (const id of previous) {
        if (!next.includes(id)) this.socket.emit('channel:leave', { channelId: id })
      }
    }
    return this.getSubscriptions()
  }

  openNotification(notification: ShadowNotification) {
    void shell.openExternal(resolveCommunityUrl(this.webOrigin, notification))
  }

  private reconnect() {
    this.disconnect()
    if (!this.session.getTokenPair()) {
      this.emitToRenderer({ type: 'socket-status', status: 'disconnected' })
      return
    }

    this.emitToRenderer({ type: 'socket-status', status: 'connecting' })
    this.socket = io(this.webOrigin, {
      transports: ['websocket'],
      autoConnect: false,
      auth: (cb) => cb({ token: this.session.getTokenPair?.()?.accessToken }),
    })

    this.socket.on('connect', () => {
      this.emitToRenderer({ type: 'socket-status', status: 'connected' })
      for (const channelId of this.prefs.subscribedChannelIds) {
        this.socket?.emit('channel:join', { channelId })
      }
    })
    this.socket.on('disconnect', () => {
      this.emitToRenderer({ type: 'socket-status', status: 'disconnected' })
    })
    this.socket.on('connect_error', () => {
      this.emitToRenderer({ type: 'socket-status', status: 'error' })
    })
    this.socket.on('notification:new', (notification: ShadowNotification) => {
      this.emitToRenderer({ type: 'notification', notification })
      this.showNotification(notification)
    })
    this.socket.on('message:new', (message: ShadowMessage) => {
      if (!this.prefs.subscribedChannelIds.includes(message.channelId)) return
      this.emitToRenderer({ type: 'message', message })
      this.showMessage(message)
    })
    this.socket.connect()
  }

  private disconnect() {
    if (!this.socket) return
    this.socket.removeAllListeners()
    this.socket.disconnect()
    this.socket = null
  }

  private emitToRenderer(event: CommunityEvent) {
    this.getWindow()?.webContents.send('community:event', event)
  }

  private showNotification(notification: ShadowNotification) {
    if (!Notification.isSupported()) return
    const item = new Notification({
      title: notification.title,
      body: notification.body ?? undefined,
      silent: false,
    })
    item.on('click', () => this.openNotification(notification))
    item.show()
  }

  private showMessage(message: ShadowMessage) {
    if (!Notification.isSupported()) return
    const title =
      message.author?.displayName ?? message.author?.username ?? message.author?.id ?? 'Shadow'
    const item = new Notification({
      title,
      body: message.content,
      silent: false,
    })
    item.on('click', () => {
      void shell.openExternal(`${this.webOrigin}/app/discover?channel=${message.channelId}`)
    })
    item.show()
  }
}
