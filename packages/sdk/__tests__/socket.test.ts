import { describe, expect, it, vi } from 'vitest'
import { ShadowSocket } from '../src/socket'

const ioMock = vi.hoisted(() => vi.fn())

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

function createSocket() {
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
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(() => {
      socket.connected = true
    }),
    disconnect: vi.fn(() => {
      socket.connected = false
    }),
  }
  return socket
}

describe('ShadowSocket', () => {
  it('can disable Socket.IO automatic reconnects after fatal errors', () => {
    ioMock.mockReturnValueOnce(createSocket())

    const socket = new ShadowSocket({
      serverUrl: 'https://shadowob.com',
      token: 'test-token',
    })

    socket.disableReconnect()

    const rawSocket = ioMock.mock.results[0]?.value
    expect(rawSocket.io.opts.reconnection).toBe(false)
    expect(rawSocket.io.reconnection).toHaveBeenCalledWith(false)
  })
})
