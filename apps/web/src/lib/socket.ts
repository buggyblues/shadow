import type { MessageMention } from '@shadowob/shared'
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null
const joinedChannels = new Set<string>()
const joinedThreads = new Set<string>()

function rejoinRooms(s: Socket): void {
  for (const channelId of joinedChannels) {
    s.emit('channel:join', { channelId })
  }
  for (const threadId of joinedThreads) {
    s.emit('thread:join', { threadId })
  }
}

export function getSocket(): Socket {
  if (!socket) {
    const nextSocket = io(window.location.origin, {
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
  joinedChannels.clear()
  joinedThreads.clear()
}

function handleBeforeUnload() {
  if (socket?.connected) {
    // Use sendBeacon as fallback for reliable disconnect signal
    const token = localStorage.getItem('accessToken')
    if (token) {
      navigator.sendBeacon(
        '/api/auth/disconnect',
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
  joinedChannels.add(channelId)
  const s = getSocket()
  if (s.connected) {
    s.emit('channel:join', { channelId })
  }
}

export function leaveChannel(channelId: string): void {
  joinedChannels.delete(channelId)
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
