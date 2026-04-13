/**
 * Shared SSE stream hook for Dashboard.
 *
 * Supports two modes:
 * - EventSource (GET): for real-time log streaming
 * - Fetch (POST): for deploy actions with SSE response
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type SSEStatus = 'idle' | 'connecting' | 'connected' | 'done' | 'error'

export interface SSEResult {
  success: boolean
  error?: string
  exitCode?: number
}

interface UseSSEStreamOptions {
  /** Max number of lines to keep in buffer (default: 2000) */
  maxLines?: number
}

interface FetchSSEOptions {
  onEvent?: (event: string | undefined, data: unknown) => void
}

interface UseSSEStreamReturn {
  lines: string[]
  status: SSEStatus
  error: string | null
  /** Connect to an EventSource (GET) endpoint */
  connect: (url: string) => void
  /** Start a fetch-based SSE stream (POST) */
  startFetch: (url: string, body: unknown, options?: FetchSSEOptions) => Promise<SSEResult>
  /** Disconnect active stream */
  disconnect: () => void
  /** Clear accumulated lines */
  clear: () => void
}

export function useSSEStream(options: UseSSEStreamOptions = {}): UseSSEStreamReturn {
  const { maxLines = 2000 } = options
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<SSEStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const esRef = useRef<EventSource | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    cleanup()
    setStatus((s) => (s === 'done' || s === 'error' ? s : 'idle'))
  }, [cleanup])

  const clear = useCallback(() => {
    setLines([])
    setError(null)
    setStatus('idle')
  }, [])

  // EventSource-based connect (for log streaming)
  const connect = useCallback(
    (url: string) => {
      cleanup()
      setLines([])
      setError(null)
      setStatus('connecting')

      const es = new EventSource(url)
      esRef.current = es

      es.onopen = () => setStatus('connected')

      es.onmessage = (e) => {
        try {
          const line = JSON.parse(e.data) as string
          setLines((prev) => [...prev.slice(-(maxLines - 1)), line])
        } catch {
          /* ignore non-JSON messages */
        }
      }

      es.addEventListener('close', () => {
        setStatus('done')
        es.close()
        esRef.current = null
      })

      es.onerror = () => {
        setError('Connection lost. Click Connect to retry.')
        setStatus('error')
        es.close()
        esRef.current = null
      }
    },
    [cleanup, maxLines],
  )

  // Fetch-based SSE (for deploy with POST body)
  const startFetch = useCallback(
    async (url: string, body: unknown, options?: FetchSSEOptions): Promise<SSEResult> => {
      cleanup()
      setLines([])
      setError(null)
      setStatus('connecting')

      const controller = new AbortController()
      abortRef.current = controller

      let result: SSEResult = { success: false }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        setStatus('connected')
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) throw new Error('No response body')

        let buf = ''
        while (true) {
          const { done: readerDone, value } = await reader.read()
          if (readerDone) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            if (!part.startsWith('data:') && !part.startsWith('event:')) continue
            const partLines = part.split('\n')
            const eventLine = partLines.find((l) => l.startsWith('event:'))
            const dataLine = partLines.find((l) => l.startsWith('data:'))
            if (!dataLine) continue
            const data = JSON.parse(dataLine.slice(5).trim())
            const event = eventLine?.slice(7).trim()
            options?.onEvent?.(event, data)
            if (event === 'log') {
              setLines((prev) => [...prev.slice(-(maxLines - 1)), data as string])
            } else if (event === 'done') {
              const exitCode = typeof data === 'object' ? data?.exitCode : undefined
              const errorMsg = typeof data === 'object' ? data?.error : undefined
              result = {
                success: exitCode === 0 || exitCode === undefined,
                exitCode,
                error: errorMsg,
              }
              if (errorMsg) {
                setError(errorMsg)
                setLines((prev) => [...prev, `Error: ${errorMsg}`])
              }
              setStatus('done')
            }
          }
        }

        if (result.success === false && !result.error) {
          result = { success: true }
        }
        setStatus((s) => (s === 'done' ? s : 'done'))
        return result
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return { success: false, error: 'Aborted' }
        }
        const errorMsg = String(err)
        setError(errorMsg)
        setStatus('error')
        return { success: false, error: errorMsg }
      } finally {
        abortRef.current = null
      }
    },
    [cleanup, maxLines],
  )

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup])

  return { lines, status, error, connect, startFetch, disconnect, clear }
}
