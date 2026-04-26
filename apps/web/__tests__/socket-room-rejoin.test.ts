/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

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
})

afterEach(() => {
  vi.doUnmock('socket.io-client')
  vi.restoreAllMocks()
})

describe('web socket room rejoin', () => {
  it('replays channel, DM, and app joins after the socket connects', async () => {
    const fakeSocket = createFakeSocket()
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => fakeSocket),
    }))

    const { connectSocket, joinApp, joinChannel, joinDm } = await import('../src/lib/socket')

    joinChannel('channel-1')
    joinDm('dm-1')
    joinApp('app-1')

    expect(fakeSocket.emits).toEqual([])

    connectSocket()

    expect(fakeSocket.emits).toEqual([
      { event: 'channel:join', args: [{ channelId: 'channel-1' }] },
      { event: 'dm:join', args: [{ dmChannelId: 'dm-1' }] },
      { event: 'app:join', args: [{ appId: 'app-1' }] },
    ])
  })

  it('does not rejoin rooms after they are left or the socket is disconnected', async () => {
    const fakeSocket = createFakeSocket()
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => fakeSocket),
    }))

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
