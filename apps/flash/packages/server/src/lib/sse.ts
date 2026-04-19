// ═══════════════════════════════════════════════════════════════
// SSE Writer — Adapts Node response to framework-agnostic writer
// ═══════════════════════════════════════════════════════════════

import type { ServerResponse } from 'node:http'

/** Framework-agnostic SSE writer interface (used by openclaw.ts) */
export interface SSEWriter {
  write(data: string): boolean
  isConnected(): boolean
  onClose(fn: () => void): void
  offClose(fn: () => void): void
}

/** Create SSEWriter from raw Node ServerResponse */
export function createNodeSSEWriter(res: ServerResponse): SSEWriter {
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
  }

  return {
    write(data: string): boolean {
      if (res.writableEnded || res.destroyed) return false
      try {
        res.write(data)
        return true
      } catch {
        return false
      }
    },
    isConnected(): boolean {
      return !res.writableEnded && !res.destroyed
    },
    onClose(fn: () => void): void {
      res.on('close', fn)
    },
    offClose(fn: () => void): void {
      res.off('close', fn)
    },
  }
}

/** Helper: send SSE event + [DONE] + end */
export function finishSSE(writer: SSEWriter, res: ServerResponse): void {
  writer.write('data: [DONE]\n\n')
  try {
    res.end()
  } catch {
    /* already ended */
  }
}
