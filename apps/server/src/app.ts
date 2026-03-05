import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import type { AppContainer } from './container'
import { createAdminHandler } from './handlers/admin.handler'
import { createAuthHandler } from './handlers/auth.handler'
import { createChannelHandler } from './handlers/channel.handler'
import { createDmHandler } from './handlers/dm.handler'
import { createMediaHandler } from './handlers/media.handler'
import { createMessageHandler } from './handlers/message.handler'
import { createNotificationHandler } from './handlers/notification.handler'
import { createSearchHandler } from './handlers/search.handler'
import { createServerHandler } from './handlers/server.handler'
import { logger } from './lib/logger'
import { loggerMiddleware } from './middleware/logger.middleware'

export function createApp(container: AppContainer) {
  const app = new Hono()

  // Global error handler (Hono's onError ensures proper JSON responses)
  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = (error as { status?: number }).status ?? 500

    logger.error({ err: error, path: c.req.path, method: c.req.method }, message)

    return c.json(
      {
        error: status >= 500 ? 'Internal Server Error' : message,
        ...(process.env.NODE_ENV !== 'production' && status >= 500 ? { detail: message } : {}),
      },
      status as 400,
    )
  })

  // Global middleware
  app.use('*', cors())
  app.use('*', loggerMiddleware)
  app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 })) // 50MB

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // API routes
  app.route('/api/auth', createAuthHandler(container))
  app.route('/api/servers', createServerHandler(container))
  app.route('/api', createChannelHandler(container))
  app.route('/api', createMessageHandler(container))
  app.route('/api/search', createSearchHandler(container))
  app.route('/api/dm', createDmHandler(container))
  app.route('/api/notifications', createNotificationHandler(container))
  app.route('/api/media', createMediaHandler(container))
  app.route('/api/admin', createAdminHandler(container))

  // 404 handler
  app.notFound((c) => c.json({ error: 'Not Found' }, 404))

  return app
}
