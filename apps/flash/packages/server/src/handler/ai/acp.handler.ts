// ═══════════════════════════════════════════════════════════════
// ACP Router — Unified SSE dispatch for all AI handlers
//
// Since Hono's standard handler returns Response objects but SSE
// handlers need to write incrementally to the raw Node stream,
// we export a raw Node handler function for the SSE routes.
// ═══════════════════════════════════════════════════════════════

import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleAnalyze } from './analyze.handler.js'
import { handleCurate } from './curate.handler.js'
import { handleInspire } from './inspire.handler.js'
import { handleResearch } from './research.handler.js'

type SSEHandler = (body: Record<string, unknown>, res: ServerResponse) => Promise<void>

function wrapSSEHandler(
  handler: SSEHandler,
): (body: Record<string, unknown>, res: ServerResponse) => void {
  return (body, res) => {
    handler(body, res).catch((err: Error) => {
      console.error(`🔴 [SSE Handler Error]:`, err.message)
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(
            `data: ${JSON.stringify({ type: 'error', data: `Server error: ${err.message}` })}\n\n`,
          )
          res.write('data: [DONE]\n\n')
          res.end()
        } catch {
          /* already ended */
        }
      }
    })
  }
}

/** Parse JSON body from IncomingMessage */
async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

/** Raw Node handler for ACP unified endpoint */
export async function acpNodeHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseBody(req)
  const { action, projectId, payload } = body

  if (!action || !projectId) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Missing action or projectId' }))
    return
  }

  console.log(
    `[ACP] ▶ action=${action} projectId=${projectId} payload keys: ${Object.keys((payload || {}) as Record<string, unknown>).join(', ')}`,
  )

  const handlers: Record<string, () => void> = {
    curate: () =>
      wrapSSEHandler(handleCurate)(
        {
          projectId,
          materials: (payload as Record<string, unknown>)?.materials || [],
          existingCards: (payload as Record<string, unknown>)?.existingCards || [],
          decks: (payload as Record<string, unknown>)?.decks || [],
        },
        res,
      ),
    analyze: () =>
      wrapSSEHandler(handleAnalyze)(
        {
          projectId,
          deckId: (payload as Record<string, unknown>)?.deckId,
          materials: (payload as Record<string, unknown>)?.materials || [],
          cards: (payload as Record<string, unknown>)?.cards || [],
          existingOutline: (payload as Record<string, unknown>)?.existingOutline,
          theme: (payload as Record<string, unknown>)?.theme,
          todos: (payload as Record<string, unknown>)?.todos || [],
        },
        res,
      ),
    analyze_material: () => {
      const mat = (payload as Record<string, unknown>)?.material
      wrapSSEHandler(handleCurate)(
        {
          projectId,
          materials: mat ? [mat] : [],
          existingCards: [],
          decks: [],
        },
        res,
      )
    },
    research: () =>
      wrapSSEHandler(handleResearch)(
        {
          projectId,
          topic: (payload as Record<string, unknown>)?.topic || '',
          materials: (payload as Record<string, unknown>)?.materials || [],
          cards: (payload as Record<string, unknown>)?.cards || [],
          angles: (payload as Record<string, unknown>)?.angles || [],
          goals: (payload as Record<string, unknown>)?.goals || [],
        },
        res,
      ),
    inspire: () =>
      wrapSSEHandler(handleInspire)(
        {
          projectId,
          materials: (payload as Record<string, unknown>)?.materials || [],
          cards: (payload as Record<string, unknown>)?.cards || [],
          outline: (payload as Record<string, unknown>)?.outline || [],
          todos: (payload as Record<string, unknown>)?.todos || [],
        },
        res,
      ),
    smart_assign: () => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(
        `data: ${JSON.stringify({ type: 'progress', data: 'Smart assign does not support standalone invocation' })}\n\n`,
      )
      res.write('data: [DONE]\n\n')
      res.end()
    },
  }

  const handler = handlers[action as string]
  if (handler) {
    handler()
  } else {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }))
  }
}

/** Direct SSE handlers (used for /api/agent/* routes) */
export const directHandlers = {
  curate: wrapSSEHandler(handleCurate),
  analyze: wrapSSEHandler(handleAnalyze),
  inspire: wrapSSEHandler(handleInspire),
  research: wrapSSEHandler(handleResearch),
}
