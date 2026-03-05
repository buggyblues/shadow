import { serve } from '@hono/node-server'
import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { Server as SocketIOServer } from 'socket.io'
import { createApp } from './app'
import { createAppContainer } from './container'
import { db } from './db'
import { users } from './db/schema'
import { logger } from './lib/logger'
import { setupWebSocket } from './ws'

const PORT = Number(process.env.PORT ?? 3002)

async function main() {
  // Run database migrations
  const migrationsPath =
    process.env.NODE_ENV === 'production' ? './apps/server/migrations' : './src/db/migrations'
  logger.info('Running database migrations...')
  try {
    await migrate(db, { migrationsFolder: migrationsPath })
    logger.info('Database migrations completed')
  } catch (err) {
    // Handle "already exists" errors gracefully (e.g. Docker volume has stale data
    // from a previous run where objects were created but migration journal lost)
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('already exists')) {
      logger.warn(
        'Database objects already exist, skipping migrations. If schema is out of sync, run: docker-compose down -v && docker-compose up --build',
      )
    } else {
      throw err
    }
  }

  // Create DI container
  const container = createAppContainer(db)

  // Seed admin account from env vars
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminEmail && adminPassword) {
    try {
      const existing = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1)
      if (existing.length === 0) {
        const passwordHash = await hash(adminPassword, 12)
        const adminUsername = process.env.ADMIN_USERNAME ?? 'admin'
        // Check if username is taken, append suffix if so
        const usernameCheck = await db
          .select()
          .from(users)
          .where(eq(users.username, adminUsername))
          .limit(1)
        const finalUsername =
          usernameCheck.length > 0 ? `${adminUsername}_${Date.now()}` : adminUsername
        await db.insert(users).values({
          email: adminEmail,
          username: finalUsername,
          passwordHash,
          displayName: 'Admin',
          isAdmin: true,
        })
        logger.info(`Admin account created: ${adminEmail} (username: ${finalUsername})`)
      } else if (!existing[0]!.isAdmin) {
        await db
          .update(users)
          .set({ isAdmin: true, updatedAt: new Date() })
          .where(eq(users.email, adminEmail))
        logger.info(`Existing user promoted to admin: ${adminEmail}`)
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to seed admin account')
    }
  }

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
