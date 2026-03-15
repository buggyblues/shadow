import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock socket.io-client
const mockSocket = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}))

// We need to simulate the browser environment for these tests
const originalWindow = globalThis.window

beforeEach(() => {
  // Reset module cache to get fresh state
  vi.resetModules()

  // Set VITE_API_BASE in import.meta.env (vitest supports this natively)
  vi.stubEnv('VITE_API_BASE', 'https://shadowob.com')

  // Setup minimal window environment
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { origin: 'file://', hash: '' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    writable: true,
    configurable: true,
  })

  Object.defineProperty(globalThis, 'document', {
    value: {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    writable: true,
    configurable: true,
  })

  Object.defineProperty(globalThis, 'navigator', {
    value: { sendBeacon: vi.fn() },
    writable: true,
    configurable: true,
  })

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn(() => 'test-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    writable: true,
    configurable: true,
  })

  mockSocket.connected = false
  mockSocket.connect.mockClear()
  mockSocket.disconnect.mockClear()
  mockSocket.emit.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('socket.ts', () => {
  describe('getSocketOrigin', () => {
    it('should use VITE_API_BASE origin when available', async () => {
      // getSocketOrigin is not exported, but we can test it indirectly through getSocket
      const { io } = await import('socket.io-client')
      const { getSocket } = await import('../src/renderer/lib/socket')

      getSocket()

      expect(io).toHaveBeenCalledWith(
        'https://shadowob.com',
        expect.objectContaining({
          transports: ['websocket'],
          autoConnect: false,
        }),
      )
    })
  })

  describe('connectSocket', () => {
    it('should connect the socket if not connected', async () => {
      const { connectSocket, getSocket } = await import('../src/renderer/lib/socket')

      getSocket() // initialize
      mockSocket.connected = false
      connectSocket()

      expect(mockSocket.connect).toHaveBeenCalled()
    })

    it('should register cleanup event listeners', async () => {
      const { connectSocket, getSocket } = await import('../src/renderer/lib/socket')

      getSocket()
      connectSocket()

      expect(window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
      expect(document.addEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      )
    })
  })

  describe('disconnectSocket', () => {
    it('should disconnect and clean up listeners', async () => {
      const { connectSocket, disconnectSocket, getSocket } = await import(
        '../src/renderer/lib/socket'
      )

      getSocket()
      connectSocket()
      disconnectSocket()

      expect(mockSocket.disconnect).toHaveBeenCalled()
      expect(window.removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
      expect(document.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      )
    })
  })

  describe('channel operations', () => {
    it('joinChannel emits channel:join', async () => {
      const { getSocket, joinChannel } = await import('../src/renderer/lib/socket')
      getSocket()
      joinChannel('ch-123')
      expect(mockSocket.emit).toHaveBeenCalledWith('channel:join', { channelId: 'ch-123' })
    })

    it('leaveChannel emits channel:leave', async () => {
      const { getSocket, leaveChannel } = await import('../src/renderer/lib/socket')
      getSocket()
      leaveChannel('ch-123')
      expect(mockSocket.emit).toHaveBeenCalledWith('channel:leave', { channelId: 'ch-123' })
    })
  })

  describe('message operations', () => {
    it('sendWsMessage emits message:send', async () => {
      const { getSocket, sendWsMessage } = await import('../src/renderer/lib/socket')
      getSocket()
      const data = { channelId: 'ch-1', content: 'hello' }
      sendWsMessage(data)
      expect(mockSocket.emit).toHaveBeenCalledWith('message:send', data)
    })

    it('sendTyping emits message:typing', async () => {
      const { getSocket, sendTyping } = await import('../src/renderer/lib/socket')
      getSocket()
      sendTyping('ch-1')
      expect(mockSocket.emit).toHaveBeenCalledWith('message:typing', { channelId: 'ch-1' })
    })
  })

  describe('presence', () => {
    it('updatePresence emits presence:update', async () => {
      const { getSocket, updatePresence } = await import('../src/renderer/lib/socket')
      getSocket()
      updatePresence('online')
      expect(mockSocket.emit).toHaveBeenCalledWith('presence:update', { status: 'online' })
    })
  })

  describe('app operations', () => {
    it('joinApp emits app:join', async () => {
      const { getSocket, joinApp } = await import('../src/renderer/lib/socket')
      getSocket()
      const ack = vi.fn()
      joinApp('app-1', ack)
      expect(mockSocket.emit).toHaveBeenCalledWith('app:join', { appId: 'app-1' }, ack)
    })

    it('leaveApp emits app:leave', async () => {
      const { getSocket, leaveApp } = await import('../src/renderer/lib/socket')
      getSocket()
      leaveApp('app-1')
      expect(mockSocket.emit).toHaveBeenCalledWith('app:leave', { appId: 'app-1' })
    })

    it('broadcastAppState emits app:broadcast', async () => {
      const { broadcastAppState, getSocket } = await import('../src/renderer/lib/socket')
      getSocket()
      broadcastAppState('app-1', 'stateChange', { key: 'value' })
      expect(mockSocket.emit).toHaveBeenCalledWith('app:broadcast', {
        appId: 'app-1',
        type: 'stateChange',
        payload: { key: 'value' },
      })
    })
  })
})
