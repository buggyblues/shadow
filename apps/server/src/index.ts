import { serve } from '@hono/node-server'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { Server as SocketIOServer } from 'socket.io'
import { createApp } from './app'
import { createAppContainer } from './container'
import { db } from './db'
import { logger } from './lib/logger'
import { setupWebSocket } from './ws'

const PORT = Number(process.env.PORT ?? 3002)

async function main() {
  // Run database migrations
  const migrationsPath =
    process.env.NODE_ENV === 'production' ? './apps/server/migrations' : './src/db/migrations'
  logger.info('Running database migrations...')
  await migrate(db, { migrationsFolder: migrationsPath })
  logger.info('Database migrations completed')

  // Create DI container
  const container = createAppContainer(db)

  // Initialize services that need async setup
  const mediaService = container.resolve('mediaService')
  await mediaService.init()

  // Create Hono app with DI container
  const app = createApp(container)

  // Start HTTP server with Hono
  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      logger.info(`🚀 Shadow Server running on http://localhost:${info.port}`)
    },
  )

  // Attach Socket.IO to the HTTP server
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  })

  setupWebSocket(io, container)

  // Register io in DI container for HTTP handlers to emit WS events
  const { asValue } = await import('awilix')
  container.register({ io: asValue(io) })

  // Graceful shutdown
  const gracefulShutdown = () => {
    logger.info('Shutting down gracefully...')
    io.close()
    process.exit(0)
  }

  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT', gracefulShutdown)
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server')
  process.exit(1)
})
