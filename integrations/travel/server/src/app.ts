import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import type { AppContainer } from './container.js'
import { createApiHandler } from './handlers/api.handler.js'
import { createCommandsHandler } from './handlers/commands.handler.js'
import { createHealthHandler } from './handlers/health.handler.js'
import { createManifestHandler } from './handlers/manifest.handler.js'
import { createOAuthHandler } from './handlers/oauth.handler.js'
import { createShareHandler } from './handlers/share.handler.js'
import { errorHandler } from './middleware/error.middleware.js'
import { requestContextMiddleware } from './middleware/request-context.middleware.js'
import type { TravelHonoEnv } from './types.js'
import { createTravelRealtimeHandler } from './ws/index.js'

export function createApp(container: AppContainer) {
  const app = new Hono<TravelHonoEnv>()

  app.onError(errorHandler)
  // Static assets and the App shell are public resources. Resolving identity for
  // each chunk multiplies database and Shadow introspection work during startup.
  app.use('/api/*', requestContextMiddleware(container.identityService))
  app.use('/.shadow/*', requestContextMiddleware(container.identityService))
  app.use(
    '*',
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((item) => item.trim())
        : '*',
      credentials: true,
    }),
  )
  app.use('*', bodyLimit({ maxSize: 25 * 1024 * 1024 }))
  app.use('/assets/*', serveStatic({ root: './dist/client' }))

  app.route('/', createHealthHandler())
  app.route('/', createManifestHandler())
  app.route('/', createOAuthHandler(container))
  app.route('/', createShareHandler(container))
  app.route('/', createCommandsHandler(container))
  app.route('/api', createTravelRealtimeHandler(container))
  app.route('/api', createApiHandler(container))

  return app
}
