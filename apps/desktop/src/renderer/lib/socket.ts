// Desktop socket wrapper — patches socket.io connection URL for file:// protocol
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

function getSocketOrigin(): string {
  const apiBase = import.meta.env.VITE_API_BASE ?? ''
  if (apiBase) {
    try {
      return new URL(apiBase).origin
    } catch {
      // fallback
    }
  }
  // In Electron production (file:// protocol), this won't work for WebSocket.
  // VITE_API_BASE should always be set in the desktop build.
  return window.location.origin
}

let visibilityTimer: ReturnType<typeof setTimeout> | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getSocketOrigin(), {
      auth: (cb) => {
        cb({ token: localStorage.getItem('accessToken') })
      },
      transports: ['websocket'],
      autoConnect: false,
    })
  }
  return socket
}

export function connectSocket(): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }
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
}

function handleBeforeUnload() {
  if (socket?.connected) {
    const token = localStorage.getItem('accessToken')
    if (token) {
      const apiBase = import.meta.env.VITE_API_BASE ?? ''
      navigator.sendBeacon(
        `${apiBase}/api/auth/disconnect`,
        new Blob([JSON.stringify({ token })], { type: 'application/json' }),
      )
    }
    socket.disconnect()
  }
}

function handleVisibilityChange() {
  if (!socket) return
  if (document.visibilityState === 'hidden') {
    if (visibilityTimer) clearTimeout(visibilityTimer)
    visibilityTimer = setTimeout(() => {
      if (document.visibilityState === 'hidden' && socket?.connected) {
        socket.disconnect()
      }
    }, 120_000)
  } else {
    if (visibilityTimer) {
      clearTimeout(visibilityTimer)
      visibilityTimer = null
    }
    if (!socket.connected) {
      socket.connect()
    }
  }
}

export function joinChannel(channelId: string): void {
  getSocket().emit('channel:join', { channelId })
}

export function leaveChannel(channelId: string): void {
  getSocket().emit('channel:leave', { channelId })
}

export function sendWsMessage(data: {
  channelId: string
  content: string
  threadId?: string
  replyToId?: string
}): void {
  getSocket().emit('message:send', data)
}

export function sendTyping(channelId: string): void {
  getSocket().emit('message:typing', { channelId })
}

export function updatePresence(status: 'online' | 'idle' | 'dnd' | 'offline'): void {
  getSocket().emit('presence:update', { status })
}

export function joinApp(
  appId: string,
  ack?: (res: { ok: boolean; channelId?: string }) => void,
): void {
  getSocket().emit('app:join', { appId }, ack)
}

export function leaveApp(appId: string): void {
  getSocket().emit('app:leave', { appId })
}

export function broadcastAppState(appId: string, type: string, payload: unknown): void {
  getSocket().emit('app:broadcast', { appId, type, payload })
}

// DM helpers
export function joinDm(dmChannelId: string): void {
  getSocket().emit('dm:join', { dmChannelId })
}

export function leaveDm(dmChannelId: string): void {
  getSocket().emit('dm:leave', { dmChannelId })
}

export function sendDmMessage(data: {
  dmChannelId: string
  content: string
  replyToId?: string
}): void {
  getSocket().emit('dm:send', data)
}

export function sendDmTyping(dmChannelId: string): void {
  getSocket().emit('dm:typing', { dmChannelId })
}

export function editDmMessage(data: {
  dmChannelId: string
  messageId: string
  content: string
}): void {
  getSocket().emit('dm:edit', data)
}

export function deleteDmMessage(data: { dmChannelId: string; messageId: string }): void {
  getSocket().emit('dm:delete', data)
}

export function addDmReaction(data: {
  dmChannelId: string
  dmMessageId: string
  emoji: string
}): void {
  getSocket().emit('dm:react', data)
}

export function removeDmReaction(data: {
  dmChannelId: string
  dmMessageId: string
  emoji: string
}): void {
  getSocket().emit('dm:unreact', data)
}
