/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ioMock = vi.hoisted(() => vi.fn())

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

function createSocket() {
  const socket = {
    connected: false,
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
    on: vi.fn(),
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
})
