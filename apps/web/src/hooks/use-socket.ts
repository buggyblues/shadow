import { useEffect, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import { getSocket } from '../lib/socket'

/**
 * Hook to listen for Socket.IO events
 */
export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const socket = getSocket()
    const listener = (data: T) => handlerRef.current(data)
    socket.on(event, listener as (...args: unknown[]) => void)
    if (event === 'connect' && socket.connected) {
      queueMicrotask(() => handlerRef.current(undefined as T))
    }
    return () => {
      socket.off(event, listener as (...args: unknown[]) => void)
    }
  }, [event])
}

/**
 * Hook to get the socket instance
 */
export function useSocket(): Socket {
  return getSocket()
}
