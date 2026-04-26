import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null
const joinedChannels = new Set<string>()
const joinedDmChannels = new Set<string>()
const joinedApps = new Set<string>()

function rejoinRooms(s: Socket): void {
  for (const channelId of joinedChannels) {
    s.emit('channel:join', { channelId })
  }
  for (const dmChannelId of joinedDmChannels) {
    s.emit('dm:join', { dmChannelId })
  }
  for (const appId of joinedApps) {
    s.emit('app:join', { appId })
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
  joinedDmChannels.clear()
  joinedApps.clear()
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
  joinedApps.add(appId)
  const s = getSocket()
  if (s.connected) {
    s.emit('app:join', { appId }, ack)
  } else if (ack) {
    s.once('connect', () => s.emit('app:join', { appId }, ack))
  }
}

export function leaveApp(appId: string): void {
  joinedApps.delete(appId)
  const s = getSocket()
  if (s.connected) {
    s.emit('app:leave', { appId })
  }
}

export function broadcastAppState(appId: string, type: string, payload: unknown): void {
  getSocket().emit('app:broadcast', { appId, type, payload })
}

// DM helpers
export function joinDm(dmChannelId: string): void {
  joinedDmChannels.add(dmChannelId)
  const s = getSocket()
  if (s.connected) {
    s.emit('dm:join', { dmChannelId })
  }
}

export function leaveDm(dmChannelId: string): void {
  joinedDmChannels.delete(dmChannelId)
  const s = getSocket()
  if (s.connected) {
    s.emit('dm:leave', { dmChannelId })
  }
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
