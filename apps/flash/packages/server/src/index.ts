// ═══════════════════════════════════════════════════════════════
// Flash — Hono Backend Server
//
// Architecture: Handler → Service → DAO (3-layer)
// Framework: Hono + typia + @hono/node-server
// ═══════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import {
  DATA_DIR,
  ensureDirectories,
  OPENCLAW_URL,
  OUTPUT_DIR,
  PORT,
  PROJECTS_DIR,
  STATIC_DIR,
} from './config.js'
import { restoreAllStores, skillDao } from './dao/index.js'
import abortHandler from './handler/abort.handler.js'
// ── AI SSE handlers (raw Node, not Hono) ──
import { acpNodeHandler, directHandlers } from './handler/ai/acp.handler.js'
import cardHandler from './handler/card.handler.js'
import debugHandler from './handler/debug.handler.js'
import deckHandler from './handler/deck.handler.js'
// ── Handler modules ──
import healthHandler from './handler/health.handler.js'
import materialHandler, { uploadMiddleware } from './handler/material.handler.js'
import projectHandler from './handler/project.handler.js'
import skillHandler from './handler/skill.handler.js'
import themeHandler from './handler/theme.handler.js'
import { globalErrorHandler } from './middleware/error.js'
import { requestLogger } from './middleware/logger.js'
import { skillService } from './service/skill.service.js'

// ── Process guards ──
process.on('uncaughtException', (err) => {
  console.error('🔴🔴 [UNCAUGHT EXCEPTION]', err.message, err.stack)
})
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  console.error('🔴🔴 [UNHANDLED REJECTION]', msg)
})
console.log('🛡️ Process guards installed')

// ── Bootstrap ──
ensureDirectories()
skillService.loadAllFromDisk()
restoreAllStores()

// ── Hono App ──
const app = new Hono()

app.use('*', requestLogger)

// ── Register all REST handlers ──
app.route('/', healthHandler)
app.route('/', materialHandler)
app.route('/', cardHandler)
app.route('/', deckHandler)
app.route('/', themeHandler)
app.route('/', skillHandler)
app.route('/', projectHandler)
app.route('/', abortHandler)
app.route('/', debugHandler)

app.onError(globalErrorHandler)

// ── Start server with Node adapter ──
const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: '0.0.0.0',
  },
  (info) => {
    console.log('')
    console.log(`🚀 Flash Server on http://0.0.0.0:${info.port}`)
    console.log(`   Framework: Hono + typia + @hono/node-server`)
    console.log(`   OpenClaw: ${OPENCLAW_URL}`)
    console.log(`   Static:   ${STATIC_DIR}`)
    console.log(`   Data:     ${DATA_DIR}`)
    console.log(`   Output:   ${OUTPUT_DIR}`)
    console.log(`   Skills:   ${skillDao.size} loaded`)
    console.log(`   Debug:    http://localhost:${info.port}/api/debug/status`)
    console.log('')
  },
)

// ── Intercept raw Node requests for SSE + Multer ──
if (typeof (server as unknown as Record<string, unknown>).on === 'function') {
  const httpServer = server as unknown as import('node:http').Server
  const listeners = httpServer.listeners('request')
  const honoListener = listeners[0] as Function

  httpServer.removeAllListeners('request')

  httpServer.on('request', async (req, res) => {
    const url = req.url || ''
    const method = req.method || 'GET'

    // ── SSE Routes (raw Node handler) ──
    if (method === 'POST' && url === '/api/acp') {
      console.log(`🔵 POST /api/acp received`)
      return acpNodeHandler(req, res)
    }

    if (method === 'POST' && url.startsWith('/api/agent/')) {
      const route = url.replace('/api/agent/', '')
      const handler = directHandlers[route as keyof typeof directHandlers]
      if (handler) {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk)
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          return handler(body, res)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
          return
        }
      }
    }

    // ── Multer routes (file upload) ──
    if (method === 'POST' && url === '/api/materials/upload') {
      console.log(`🔵 POST /api/materials/upload received`)
      return uploadMiddleware.array('files', 50)(req as never, res as never, (err: unknown) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : 'Upload failed',
            }),
          )
          return
        }
        const files = (req as unknown as Record<string, unknown>).files as unknown[]
        const body = (req as unknown as Record<string, unknown>).body
        const projectId = (body as Record<string, string>)?.projectId || 'default'

        import('./service/material.service.js')
          .then(({ materialService }) => {
            const results = materialService.processUploadedFiles(
              files as Array<{
                originalname: string
                mimetype: string
                size: number
                path: string
              }>,
              projectId,
            )
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, data: results }))
          })
          .catch((e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: e.message }))
          })
      })
    }

    if (method === 'POST' && url === '/api/cards/file') {
      const cardStorage = uploadMiddleware.single('file')
      return cardStorage(req as never, res as never, async (err: unknown) => {
        if (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : 'Upload failed',
            }),
          )
          return
        }
        try {
          const { cardService } = await import('./service/card.service.js')
          const file = (req as unknown as Record<string, unknown>).file as
            | { path: string; mimetype: string }
            | undefined
          const body = (req as unknown as Record<string, unknown>).body as Record<string, string>

          let cardData: Record<string, unknown>
          let projectId: string | undefined
          if (file) {
            try {
              cardData = JSON.parse(body?.cardData || '{}')
            } catch {
              cardData = {}
            }
            projectId = body?.projectId
          } else {
            cardData = { ...body }
            projectId = body?.projectId
            delete cardData.projectId
          }

          const card = await cardService.createFileCard(
            cardData as Parameters<typeof cardService.createFileCard>[0],
            file || null,
            projectId,
          )
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, data: card }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        }
      })
    }

    // ── Static files + SPA fallback ──
    if (!url.startsWith('/api/') && existsSync(STATIC_DIR)) {
      const { createReadStream } = await import('node:fs')
      const { extname } = await import('node:path')
      const filePath = join(STATIC_DIR, url === '/' ? 'index.html' : url)

      if (existsSync(filePath) && !filePath.includes('..')) {
        const ext = extname(filePath)
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff2': 'font/woff2',
        }
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
        createReadStream(filePath).pipe(res)
        return
      }

      // SPA fallback
      const indexPath = join(STATIC_DIR, 'index.html')
      if (existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        createReadStream(indexPath).pipe(res)
        return
      }
    }

    // ── Default: delegate to Hono ──
    honoListener(req, res)
  })
}
