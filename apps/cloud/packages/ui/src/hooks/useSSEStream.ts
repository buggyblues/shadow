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
  connect: (url: string, options?: FetchSSEOptions) => void
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

  const abortRef = useRef<AbortController | null>(null)

  const appendLine = useCallback(
    (line: string) => {
      setLines((prev) => [...prev.slice(-(maxLines - 1)), line])
    },
    [maxLines],
  )

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (typeof window === 'undefined') return {}
    try {
      const token = window.localStorage.getItem('accessToken')
      return token ? { Authorization: `Bearer ${token}` } : {}
    } catch {
      return {}
    }
  }, [])

  const formatLine = useCallback((data: unknown): string | null => {
    if (typeof data === 'string') return data
    if (!data || typeof data !== 'object') return null

    const payload = data as {
      line?: unknown
      message?: unknown
      level?: unknown
      error?: unknown
    }

    if (typeof payload.line === 'string') {
      return payload.line
    }

    if (typeof payload.message === 'string') {
      const level = typeof payload.level === 'string' ? payload.level.toUpperCase() : null
      return level ? `[${level}] ${payload.message}` : payload.message
    }

    if (typeof payload.error === 'string') {
      return `Error: ${payload.error}`
    }

    return null
  }, [])

  const parseEventBlock = useCallback((block: string) => {
    const lines = block.split('\n')
    let event: string | undefined
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    if (dataLines.length === 0) return null

    const raw = dataLines.join('\n')
    try {
      return { event, data: JSON.parse(raw) as unknown }
    } catch {
      return { event, data: raw as unknown }
    }
  }, [])

  const readEventStream = useCallback(
    async (response: Response, handlers?: FetchSSEOptions) => {
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      const flushBlock = (block: string) => {
        const parsed = parseEventBlock(block)
        if (!parsed) return

        handlers?.onEvent?.(parsed.event, parsed.data)

        const line = formatLine(parsed.data)
        if (
          line !== null &&
          parsed.event !== 'done' &&
          parsed.event !== 'end' &&
          parsed.event !== 'close' &&
          parsed.event !== 'status'
        ) {
          appendLine(line)
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          flushBlock(chunk)
        }
      }

      const trailing = buffer.trim()
      if (trailing.length > 0) {
        flushBlock(trailing)
      }
    },
    [appendLine, formatLine, parseEventBlock],
  )

  const cleanup = useCallback(() => {
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
    (url: string, options?: FetchSSEOptions) => {
      cleanup()
      setLines([])
      setError(null)
      setStatus('connecting')

      const controller = new AbortController()
      abortRef.current = controller

      void (async () => {
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
              ...getAuthHeaders(),
            },
            signal: controller.signal,
          })

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }

          setStatus('connected')
          await readEventStream(res, options)
          setStatus((current) => (current === 'error' ? current : 'done'))
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            return
          }
          setError('Connection lost. Click Connect to retry.')
          setStatus('error')
        } finally {
          if (abortRef.current === controller) {
            abortRef.current = null
          }
        }
      })()
    },
    [cleanup, getAuthHeaders, readEventStream],
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
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        setStatus('connected')
        await readEventStream(res, {
          onEvent: (event, data) => {
            options?.onEvent?.(event, data)
            if (event === 'done') {
              const payload =
                typeof data === 'object' && data !== null
                  ? (data as { exitCode?: unknown; error?: unknown })
                  : null
              const exitCode = typeof payload?.exitCode === 'number' ? payload.exitCode : undefined
              const errorMsg = typeof payload?.error === 'string' ? payload.error : undefined
              result = {
                success: exitCode === 0 || exitCode === undefined,
                exitCode,
                error: errorMsg,
              }
              if (errorMsg) {
                setError(errorMsg)
                appendLine(`Error: ${errorMsg}`)
              }
              setStatus('done')
            }
          },
        })

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
    [appendLine, cleanup, formatLine, getAuthHeaders, readEventStream],
  )

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup])

  return { lines, status, error, connect, startFetch, disconnect, clear }
}
