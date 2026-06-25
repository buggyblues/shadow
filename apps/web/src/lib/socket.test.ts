/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ioMock = vi.hoisted(() => vi.fn())

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

function createSocket() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const socket = {
    connected: false,
    io: {
      opts: {
        reconnection: true,
      },
      reconnection: vi.fn((enabled: boolean) => {
        socket.io.opts.reconnection = enabled
      }),
    },
    auth: null as unknown,
    transports: null as unknown,
    autoConnect: null as unknown,
    reconnection: null as unknown,
    reconnectionAttempts: null as unknown,
    reconnectionDelay: null as unknown,
    reconnectionDelayMax: null as unknown,
    connect: vi.fn(() => {
      socket.connected = true
    }),
    disconnect: vi.fn(() => {
      socket.connected = false
    }),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const current = listeners.get(event) ?? []
      current.push(handler)
      listeners.set(event, current)
      return socket
    }),
    __emit: (event: string, ...args: unknown[]) => {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args)
      }
    },
  }
  return socket
}

async function loadSocketModule() {
  vi.resetModules()
  return import('./socket')
}

describe('socket origin', () => {
  beforeEach(() => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage,
    })
    ioMock.mockReset()
    ioMock.mockImplementation((_origin: string, options: unknown) =>
      Object.assign(createSocket(), options),
    )
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'https:',
        origin: 'https://shadowob.com',
      },
    })
  })

  it('uses the current page origin for hosted web and desktop community windows', async () => {
    const socketModule = await loadSocketModule()

    socketModule.connectSocket()

    expect(ioMock).toHaveBeenCalledTimes(1)
    expect(ioMock.mock.calls[0]?.[0]).toBe('https://shadowob.com')
  })

  it('installs page lifecycle listeners only once for repeated connects', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const documentAddEventListenerSpy = vi.spyOn(document, 'addEventListener')
    const socketModule = await loadSocketModule()

    socketModule.connectSocket()
    socketModule.connectSocket()

    expect(ioMock).toHaveBeenCalledTimes(1)
    expect(
      addEventListenerSpy.mock.calls.filter((call) => call[0] === 'beforeunload'),
    ).toHaveLength(1)
    expect(
      documentAddEventListenerSpy.mock.calls.filter((call) => call[0] === 'visibilitychange'),
    ).toHaveLength(1)
  })

  it('stops reconnecting and emits an auth failure event when socket auth is rejected', async () => {
    const socketModule = await loadSocketModule()
    const authFailedListener = vi.fn()
    window.addEventListener(socketModule.SOCKET_AUTH_FAILED_EVENT, authFailedListener)

    socketModule.connectSocket()
    const socket = ioMock.mock.results[0]?.value
    socket.__emit('connect_error', new Error('Invalid token'))

    expect(socket.io.opts.reconnection).toBe(false)
    expect(socket.disconnect).toHaveBeenCalled()
    expect(authFailedListener).toHaveBeenCalledTimes(1)

    window.removeEventListener(socketModule.SOCKET_AUTH_FAILED_EVENT, authFailedListener)
  })
})
