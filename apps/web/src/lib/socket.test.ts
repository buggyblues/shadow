/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ioMock = vi.hoisted(() => vi.fn())

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'
const DESKTOP_SETTINGS_CHANGED_EVENT = 'shadow:desktop-runtime-settings-changed'

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

describe('desktop socket origin', () => {
  beforeEach(() => {
    localStorage.clear()
    ioMock.mockReset()
    ioMock.mockImplementation((_origin: string, options: unknown) =>
      Object.assign(createSocket(), options),
    )
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'app:',
        origin: 'app://shadow',
      },
    })
  })

  it('recreates the socket when desktop server settings change', async () => {
    localStorage.setItem(
      DESKTOP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ serverBaseUrl: 'https://one.example' }),
    )
    const socketModule = await loadSocketModule()

    socketModule.connectSocket()
    const firstSocket = ioMock.mock.results[0]?.value as ReturnType<typeof createSocket>
    expect(ioMock.mock.calls[0]?.[0]).toBe('https://one.example')

    localStorage.setItem(
      DESKTOP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ serverBaseUrl: 'https://two.example' }),
    )
    window.dispatchEvent(new CustomEvent(DESKTOP_SETTINGS_CHANGED_EVENT))
    socketModule.connectSocket()

    expect(firstSocket.disconnect).toHaveBeenCalled()
    expect(ioMock).toHaveBeenCalledTimes(2)
    expect(ioMock.mock.calls[1]?.[0]).toBe('https://two.example')
  })
})
