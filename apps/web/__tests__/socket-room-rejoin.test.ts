/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void
type FakeSocket = ReturnType<typeof createFakeSocket>

const socketMockState = vi.hoisted(() => ({
  current: null as FakeSocket | null,
}))

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    if (!socketMockState.current) {
      throw new Error('Fake socket not configured')
    }
    return socketMockState.current
  }),
}))

function createFakeSocket() {
  const listeners = new Map<string, Listener[]>()
  const onceListeners = new Map<string, Listener[]>()

  const socket = {
    connected: false,
    emits: [] as Array<{ event: string; args: unknown[] }>,
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return socket
    },
    once(event: string, listener: Listener) {
      onceListeners.set(event, [...(onceListeners.get(event) ?? []), listener])
      return socket
    },
    off(event: string, listener: Listener) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
      )
      return socket
    },
    emit(event: string, ...args: unknown[]) {
      socket.emits.push({ event, args })
      return socket
    },
    connect() {
      socket.connected = true
      socket.fire('connect')
      return socket
    },
    disconnect() {
      socket.connected = false
      socket.fire('disconnect')
      return socket
    },
    fire(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args)
      }
      const pendingOnce = onceListeners.get(event) ?? []
      onceListeners.delete(event)
      for (const listener of pendingOnce) {
        listener(...args)
      }
    },
  }

  return socket
}

beforeEach(() => {
  vi.resetModules()
  socketMockState.current = null
})

afterEach(() => {
  socketMockState.current = null
  vi.restoreAllMocks()
})

describe.sequential('web socket room rejoin', () => {
  it('replays channel and app joins after the socket connects', async () => {
    const fakeSocket = createFakeSocket()
    socketMockState.current = fakeSocket

    const { connectSocket, disconnectSocket, joinApp, joinChannel } = await import(
      '../src/lib/socket'
    )

    joinChannel('channel-1')
    joinChannel('channel-2')
    joinApp('app-1')

    expect(fakeSocket.emits).toEqual([])

    connectSocket()

    expect(fakeSocket.emits).toEqual([
      { event: 'channel:join', args: [{ channelId: 'channel-1' }] },
      { event: 'channel:join', args: [{ channelId: 'channel-2' }] },
      { event: 'app:join', args: [{ appId: 'app-1' }] },
    ])

    disconnectSocket()
  })

  it('does not rejoin rooms after they are left or the socket is disconnected', async () => {
    const fakeSocket = createFakeSocket()
    socketMockState.current = fakeSocket

    const { connectSocket, disconnectSocket, joinChannel, leaveChannel } = await import(
      '../src/lib/socket'
    )

    connectSocket()
    joinChannel('channel-1')
    leaveChannel('channel-1')

    expect(fakeSocket.emits).toEqual([
      { event: 'channel:join', args: [{ channelId: 'channel-1' }] },
      { event: 'channel:leave', args: [{ channelId: 'channel-1' }] },
    ])

    fakeSocket.emits = []
    fakeSocket.connected = true
    fakeSocket.fire('connect')
    expect(fakeSocket.emits).toEqual([])

    joinChannel('channel-2')
    disconnectSocket()
    fakeSocket.emits = []
    fakeSocket.connected = true
    fakeSocket.fire('connect')
    expect(fakeSocket.emits).toEqual([])
  })
})
