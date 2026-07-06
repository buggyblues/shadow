import type { MessageMention } from '@shadowob/shared'
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null
let socketOrigin = ''
let lifecycleListenersInstalled = false
let hiddenDisconnectTimer: ReturnType<typeof setTimeout> | null = null
const joinedChannels = new Set<string>()
const joinedThreads = new Set<string>()

export const SOCKET_AUTH_FAILED_EVENT = 'shadow:socket-auth-failed'

function isSocketAuthFailure(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  if (/auth(?:entication)? unavailable|temporarily unavailable/iu.test(message)) return false
  return /authentication required|invalid token|session revoked|user not found/iu.test(message)
}

function getSocketOrigin(): string {
  const configuredApiBase = import.meta.env.VITE_API_BASE
  if (configuredApiBase) {
    try {
      return new URL(configuredApiBase, window.location.origin).origin
    } catch {
      // Fall through to protocol-aware defaults.
    }
  }
  return window.location.origin
}

function getDisconnectUrl(): string {
  return '/api/auth/disconnect'
}

function rejoinRooms(s: Socket): void {
  for (const channelId of joinedChannels) {
    s.emit('channel:join', { channelId })
  }
  for (const threadId of joinedThreads) {
    s.emit('thread:join', { threadId })
  }
}

export function getSocket(): Socket {
  const origin = getSocketOrigin()
  if (socket && socketOrigin !== origin) {
    disconnectSocket()
  }
  if (!socket) {
    socketOrigin = origin
    const nextSocket = io(origin, {
      auth: (cb) => {
        cb({ token: localStorage.getItem('accessToken') })
      },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    })
    nextSocket.on('connect', () => rejoinRooms(nextSocket))
    nextSocket.on('connect_error', (error) => {
      if (!isSocketAuthFailure(error)) return
      nextSocket.io.opts.reconnection = false
      nextSocket.disconnect()
      window.dispatchEvent(new CustomEvent(SOCKET_AUTH_FAILED_EVENT))
    })
    socket = nextSocket
  }
  return socket
}

export function connectSocket(): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }

  if (!lifecycleListenersInstalled) {
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    lifecycleListenersInstalled = true
  }
}

export function disconnectSocket(): void {
  if (lifecycleListenersInstalled) {
    window.removeEventListener('beforeunload', handleBeforeUnload)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    lifecycleListenersInstalled = false
  }
  clearHiddenDisconnectTimer()
  if (socket) {
    socket.disconnect()
    socket = null
  }
  socketOrigin = ''
  joinedChannels.clear()
  joinedThreads.clear()
}

function handleBeforeUnload() {
  if (socket?.connected) {
    // Use sendBeacon as fallback for reliable disconnect signal
    const token = localStorage.getItem('accessToken')
    if (token) {
      navigator.sendBeacon(
        getDisconnectUrl(),
        new Blob([JSON.stringify({ token })], { type: 'application/json' }),
      )
    }
    socket.disconnect()
  }
}

function clearHiddenDisconnectTimer() {
  if (!hiddenDisconnectTimer) return
  clearTimeout(hiddenDisconnectTimer)
  hiddenDisconnectTimer = null
}

function handleVisibilityChange() {
  if (!socket) return
  if (document.visibilityState === 'hidden') {
    // Page is hidden — start a grace timer. If the page stays hidden
    // for > 2 minutes, disconnect to save resources.
    clearHiddenDisconnectTimer()
    hiddenDisconnectTimer = setTimeout(() => {
      if (document.visibilityState === 'hidden' && socket?.connected) {
        socket.disconnect()
      }
    }, 120_000)
  } else {
    // Page became visible — clear timer and reconnect if needed
    clearHiddenDisconnectTimer()
    if (!socket.connected) {
      socket.connect()
    }
  }
}

export function joinChannel(channelId: string): void {
  const alreadyJoined = joinedChannels.has(channelId)
  joinedChannels.add(channelId)
  const s = getSocket()
  if (s.connected && !alreadyJoined) {
    s.emit('channel:join', { channelId })
  }
}

export function leaveChannel(channelId: string): void {
  const wasJoined = joinedChannels.delete(channelId)
  if (!wasJoined) return
  const s = getSocket()
  if (s.connected) {
    s.emit('channel:leave', { channelId })
  }
}

export function joinThread(threadId: string): void {
  joinedThreads.add(threadId)
  const s = getSocket()
  if (s.connected) {
    s.emit('thread:join', { threadId })
  }
}

export function leaveThread(threadId: string): void {
  joinedThreads.delete(threadId)
  const s = getSocket()
  if (s.connected) {
    s.emit('thread:leave', { threadId })
  }
}

export function sendWsMessage(data: {
  channelId: string
  content: string
  threadId?: string
  replyToId?: string
  mentions?: MessageMention[]
  metadata?: Record<string, unknown>
}): void {
  getSocket().emit('message:send', data)
}

export function sendTyping(channelId: string, typing = true): void {
  getSocket().emit('message:typing', { channelId, typing })
}

export function updatePresence(status: 'online' | 'idle' | 'dnd' | 'offline'): void {
  getSocket().emit('presence:update', { status })
}
