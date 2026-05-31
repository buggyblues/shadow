import type { MessageMention } from '@shadowob/shared'
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null
let socketOrigin = ''
const joinedChannels = new Set<string>()
const joinedThreads = new Set<string>()
const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'
const DESKTOP_SETTINGS_CHANGED_EVENT = 'shadow:desktop-runtime-settings-changed'

function getStoredDesktopServerBaseUrl(): string {
  if (typeof window === 'undefined' || window.location.protocol !== 'app:') return ''
  try {
    const parsed = JSON.parse(
      localStorage.getItem(DESKTOP_SETTINGS_STORAGE_KEY) ?? '{}',
    ) as Partial<{ serverBaseUrl: string }>
    if (typeof parsed.serverBaseUrl === 'string') {
      const url = new URL(parsed.serverBaseUrl)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
    }
  } catch {
    // Fall through to the default hosted origin.
  }
  return 'https://shadowob.com'
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
  return getStoredDesktopServerBaseUrl() || window.location.origin
}

function getDisconnectUrl(): string {
  const origin = getStoredDesktopServerBaseUrl()
  return origin ? `${origin}/api/auth/disconnect` : '/api/auth/disconnect'
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
    socket = nextSocket
  }
  return socket
}

export function connectSocket(): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }

  // Ensure socket disconnects when page is closed/refreshed
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

export function disconnectSocket(): void {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (socket) {
    socket.disconnect()
    socket = null
  }
  socketOrigin = ''
  joinedChannels.clear()
  joinedThreads.clear()
}

function handleDesktopRuntimeSettingsChanged() {
  if (!socket) return
  const nextOrigin = getSocketOrigin()
  if (socketOrigin === nextOrigin) return
  const shouldReconnect = socket.connected
  disconnectSocket()
  if (shouldReconnect) connectSocket()
}

if (typeof window !== 'undefined') {
  window.addEventListener(DESKTOP_SETTINGS_CHANGED_EVENT, handleDesktopRuntimeSettingsChanged)
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

function handleVisibilityChange() {
  if (!socket) return
  if (document.visibilityState === 'hidden') {
    // Page is hidden — start a grace timer. If the page stays hidden
    // for > 2 minutes, disconnect to save resources.
    ;(handleVisibilityChange as any)._timer = setTimeout(() => {
      if (document.visibilityState === 'hidden' && socket?.connected) {
        socket.disconnect()
      }
    }, 120_000)
  } else {
    // Page became visible — clear timer and reconnect if needed
    clearTimeout((handleVisibilityChange as any)._timer)
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
