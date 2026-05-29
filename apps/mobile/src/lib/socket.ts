import type { MessageMention } from '@shadowob/shared'
import * as SecureStore from 'expo-secure-store'
import { AppState, type AppStateStatus } from 'react-native'
import { io, type Socket } from 'socket.io-client'
import { API_BASE } from './api'

let socket: Socket | null = null
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null
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
    socket = io(API_BASE, {
      auth: async (cb) => {
        const token = await SecureStore.getItemAsync('accessToken')
        cb({ token })
      },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    })

    // Log connection lifecycle for debugging
    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket?.id)
      if (socket) rejoinRooms(socket)
    })
    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message)
    })
    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
    })
  }
  return socket
}

export function connectSocket(): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }

  // Handle app state changes (background/foreground)
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange)
  }
}

export function disconnectSocket(): void {
  if (appStateSubscription) {
    appStateSubscription.remove()
    appStateSubscription = null
  }
  if (socket) {
    socket.disconnect()
    socket = null
  }
  joinedChannels.clear()
  joinedThreads.clear()
}

let backgroundTimer: ReturnType<typeof setTimeout> | null = null

function handleAppStateChange(nextState: AppStateStatus) {
  if (!socket) return

  if (nextState === 'background' || nextState === 'inactive') {
    // App went to background — disconnect after 2 min
    backgroundTimer = setTimeout(() => {
      if (socket?.connected) {
        socket.disconnect()
      }
    }, 120_000)
  } else if (nextState === 'active') {
    // App became active — reconnect
    if (backgroundTimer) {
      clearTimeout(backgroundTimer)
      backgroundTimer = null
    }
    if (!socket.connected) {
      socket.connect()
    }
  }
}

export function joinChannel(channelId: string): void {
  joinedChannels.add(channelId)
  getSocket().emit('channel:join', { channelId })
}

export function leaveChannel(channelId: string): void {
  joinedChannels.delete(channelId)
  getSocket().emit('channel:leave', { channelId })
}

export function joinThread(threadId: string): void {
  joinedThreads.add(threadId)
  getSocket().emit('thread:join', { threadId })
}

export function leaveThread(threadId: string): void {
  joinedThreads.delete(threadId)
  getSocket().emit('thread:leave', { threadId })
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

export function sendTyping(channelId: string): void {
  getSocket().emit('message:typing', { channelId })
}

export function updatePresence(status: 'online' | 'idle' | 'dnd' | 'offline'): void {
  getSocket().emit('presence:update', { status })
}
