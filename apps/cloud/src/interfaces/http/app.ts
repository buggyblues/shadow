/**
 * HTTP App — assembles all handlers, middleware, and static file serving.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createActivityHandler } from './handlers/activity.handler.js'
import { createClusterHandler } from './handlers/cluster.handler.js'
import { createCommunityHandler } from './handlers/community.handler.js'
import { createConfigHandler } from './handlers/config.handler.js'
import { createDeployHandler } from './handlers/deploy.handler.js'
import { createHealthHandler } from './handlers/health.handler.js'
import { createMyTemplatesHandler } from './handlers/my-templates.handler.js'
import { createProviderProfileHandler } from './handlers/provider-profile.handler.js'
import { createSecretHandler } from './handlers/secret.handler.js'
import { createSettingsHandler } from './handlers/settings.handler.js'
import { createTemplateHandler } from './handlers/template.handler.js'
import type { HandlerContext } from './handlers/types.js'
import { createAuthMiddleware } from './middleware/auth.middleware.js'
import { createErrorHandler } from './middleware/error.middleware.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function consoleDir(): string {
  return resolve(fileURLToPath(import.meta.url), '..', 'console')
}

// ── App Factory ──────────────────────────────────────────────────────────────

export function createCloudApp(ctx: HandlerContext, authToken?: string): Hono {
  const app = new Hono()

  // Global error handler
  app.onError(createErrorHandler(ctx.container.logger))

  // CORS
  app.use('*', cors())

  // Auth middleware for API routes (when token is set)
  if (authToken) {
    app.use('/api/*', createAuthMiddleware(authToken))
  }

  // ── Health (also on root /health) ────────────────────────────────────
  const healthHandler = createHealthHandler(ctx)
  app.route('/api', healthHandler)
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Mount API handlers ─────────────────────────────────────────────────
  app.route('/api', createTemplateHandler(ctx))
  app.route('/api', createDeployHandler(ctx))
  app.route('/api', createClusterHandler(ctx))
  app.route('/api', createConfigHandler(ctx))
  app.route('/api', createSettingsHandler(ctx))
  app.route('/api', createActivityHandler(ctx))
  app.route('/api', createSecretHandler(ctx))
  app.route('/api', createProviderProfileHandler(ctx))
  app.route('/api', createMyTemplatesHandler(ctx))
  app.route('/api', createCommunityHandler(ctx))

  // ── Console static files ──────────────────────────────────────────────
  app.get('*', (c) => {
    const distDir = consoleDir()
    if (!existsSync(distDir)) return c.json({ error: 'Not found' }, 404)

    const pathname = new URL(c.req.url).pathname
    const filePath = join(distDir, pathname === '/' ? 'index.html' : pathname)

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath)
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
      const content = readFileSync(filePath)
      return new Response(content, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        },
      })
    }

    // SPA fallback
    const indexPath = join(distDir, 'index.html')
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf-8'))
    }

    return c.json({ error: 'Not found' }, 404)
  })

  return app
}
