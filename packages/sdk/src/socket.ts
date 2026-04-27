import { io, type Socket } from 'socket.io-client'
import type { ClientEventMap, ServerEventMap } from './types'

export interface ShadowSocketOptions {
  /** Shadow server base URL (e.g. "https://shadowob.shadowob.com") */
  serverUrl: string
  /** JWT token for authentication */
  token: string
  /** Socket.IO transports (default: ['websocket']) */
  transports?: string[]
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean
  /** Reconnection delay in ms (default: 1000) */
  reconnectionDelay?: number
}

type ServerEventName = keyof ServerEventMap
type ServerEventHandler<E extends ServerEventName> = ServerEventMap[E]

/**
 * Shadow real-time event listener.
 *
 * Wraps Socket.IO with strongly-typed events that match the Shadow server
 * gateway broadcasts. Provides channel/thread room management and
 * convenience methods for sending messages and typing indicators.
 */
export class ShadowSocket {
  private socket: Socket
  private _connected = false

  constructor(options: ShadowSocketOptions) {
    this.socket = io(options.serverUrl, {
      auth: { token: options.token },
      transports: options.transports ?? ['websocket'],
      autoConnect: false,
      reconnection: options.autoReconnect ?? true,
      reconnectionDelay: options.reconnectionDelay ?? 1000,
    })

    this.socket.on('connect', () => {
      this._connected = true
    })
    this.socket.on('disconnect', () => {
      this._connected = false
    })
  }

  /** Whether the socket is currently connected */
  get connected(): boolean {
    return this._connected
  }

  /** The underlying Socket.IO socket instance */
  get raw(): Socket {
    return this.socket
  }

  // ── Connection lifecycle ──────────────────────────────────────────────

  /** Connect to the Shadow server */
  connect(): void {
    if (!this.socket.connected) {
      this.socket.connect()
    }
  }

  /** Disconnect from the Shadow server */
  disconnect(): void {
    this.socket.disconnect()
  }

  /** Wait until the socket is connected (resolves immediately if already connected) */
  waitForConnect(timeoutMs = 5000): Promise<void> {
    if (this.socket.connected) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Socket connect timeout after ${timeoutMs}ms`))
      }, timeoutMs)
      this.socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  // ── Typed event listeners ─────────────────────────────────────────────

  /** Listen for a server event */
  on<E extends ServerEventName>(event: E, handler: ServerEventHandler<E>): this {
    this.socket.on(event as string, handler as (...args: unknown[]) => void)
    return this
  }

  /** Listen for a server event (one-time) */
  once<E extends ServerEventName>(event: E, handler: ServerEventHandler<E>): this {
    this.socket.once(event as string, handler as (...args: unknown[]) => void)
    return this
  }

  /** Remove a specific event listener */
  off<E extends ServerEventName>(event: E, handler: ServerEventHandler<E>): this {
    this.socket.off(event as string, handler as (...args: unknown[]) => void)
    return this
  }

  /** Remove all listeners for an event or all events */
  removeAllListeners(event?: ServerEventName): this {
    if (event) {
      this.socket.removeAllListeners(event)
    } else {
      this.socket.removeAllListeners()
    }
    return this
  }

  // ── Connection event listeners ────────────────────────────────────────

  /** Listen for raw connection events (connect, disconnect, connect_error) */
  onConnect(handler: () => void): this {
    this.socket.on('connect', handler)
    return this
  }

  onDisconnect(handler: (reason: string) => void): this {
    this.socket.on('disconnect', handler)
    return this
  }

  onConnectError(handler: (error: Error) => void): this {
    this.socket.on('connect_error', handler)
    return this
  }

  // ── Room management ───────────────────────────────────────────────────

  /** Join a channel room to receive its messages and events */
  joinChannel(channelId: string): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
      this.socket.emit(
        'channel:join' satisfies keyof ClientEventMap,
        { channelId },
        (res: { ok: boolean }) => {
          resolve(res ?? { ok: true })
        },
      )
    })
  }

  /** Leave a channel room */
  leaveChannel(channelId: string): void {
    this.socket.emit('channel:leave' satisfies keyof ClientEventMap, { channelId })
  }

  // ── Client actions ────────────────────────────────────────────────────

  /** Send a message via WebSocket (text-only; for file attachments use REST) */
  sendMessage(data: {
    channelId: string
    content: string
    threadId?: string
    replyToId?: string
  }): void {
    this.socket.emit('message:send' satisfies keyof ClientEventMap, data)
  }

  /** Send a typing indicator */
  sendTyping(channelId: string): void {
    this.socket.emit('message:typing' satisfies keyof ClientEventMap, { channelId })
  }

  /** Update user presence status */
  updatePresence(status: 'online' | 'idle' | 'dnd' | 'offline'): void {
    this.socket.emit('presence:update' satisfies keyof ClientEventMap, { status })
  }

  /** Update activity status in a channel (e.g. 'thinking', 'working', null) */
  updateActivity(channelId: string, activity: string | null): void {
    this.socket.emit('presence:activity' satisfies keyof ClientEventMap, { channelId, activity })
  }

  // ── DM actions ────────────────────────────────────────────────────────

  /** Join a DM channel room */
  joinDmChannel(dmChannelId: string): void {
    this.socket.emit('dm:join' as string, { dmChannelId })
  }

  /** Leave a DM channel room */
  leaveDmChannel(dmChannelId: string): void {
    this.socket.emit('dm:leave' as string, { dmChannelId })
  }

  /** Send a DM message via WebSocket */
  sendDmMessage(data: {
    dmChannelId: string
    content: string
    replyToId?: string
    metadata?: Record<string, unknown>
  }): void {
    this.socket.emit('dm:send' as string, data)
  }

  /** Send a DM typing indicator */
  sendDmTyping(dmChannelId: string): void {
    this.socket.emit('dm:typing' as string, { dmChannelId })
  }
}
