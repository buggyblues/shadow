/**
 * useTaskLogSync — Batch-sync task logs to the server
 *
 * Problem: every ADD_TASK_LOG dispatch → state change → triggers saveProject,
 *          while task.logs account for 74% of state.json (490 KB / 694 KB).
 *
 * Solution:
 *   1. Reducer continues updating in-memory state normally (UI shows logs in real time)
 *   2. This hook intercepts dispatch, collecting logs into a buffer
 *   3. Every 2 seconds, batch-calls POST /api/tasks/:id/logs to persist to server
 *   4. saveProject on the client already strips out logs (not included in state.json)
 */

import { useCallback, useEffect, useRef } from 'react'
import { appendTaskLogs } from '../api'

interface LogBuffer {
  [taskId: string]: string[]
}

/**
 * Returns a wrapper dispatch that intercepts ADD_TASK_LOG
 * and batches log persistence to the server.
 */
export function useTaskLogSync(
  dispatch: React.Dispatch<{ type: string; [k: string]: unknown }>,
  flushIntervalMs = 2000,
) {
  const bufferRef = useRef<LogBuffer>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Flush all buffered logs to server
  const flush = useCallback(() => {
    const buf = bufferRef.current
    const taskIds = Object.keys(buf)
    if (taskIds.length === 0) return

    // Grab and clear
    bufferRef.current = {}

    for (const taskId of taskIds) {
      const logs = buf[taskId]
      if (logs && logs.length > 0) {
        appendTaskLogs(taskId, logs).catch((err) => {
          console.warn(`[LogSync] Failed to flush ${logs.length} logs for task ${taskId}:`, err)
          // Re-buffer on failure (merge back)
          const existing = bufferRef.current[taskId] || []
          bufferRef.current[taskId] = [...logs, ...existing]
        })
      }
    }
  }, [])

  // Start periodic flush
  useEffect(() => {
    timerRef.current = setInterval(flush, flushIntervalMs)
    // Also flush on unmount / page unload
    const onUnload = () => flush()
    window.addEventListener('beforeunload', onUnload)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      flush() // Final flush
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [flush, flushIntervalMs])

  // Wrapped dispatch
  const syncDispatch = useCallback(
    (action: { type: string; [k: string]: unknown }) => {
      // Always dispatch to reducer (keeps UI in sync)
      dispatch(action)

      // Buffer log actions for batch persistence
      if (action.type === 'ADD_TASK_LOG') {
        const taskId = action.taskId as string
        const message = action.message as string
        if (taskId && message) {
          const ts = new Date().toLocaleTimeString()
          if (!bufferRef.current[taskId]) bufferRef.current[taskId] = []
          bufferRef.current[taskId].push(`[${ts}] ${message}`)
        }
      }
    },
    [dispatch],
  )

  return syncDispatch
}
