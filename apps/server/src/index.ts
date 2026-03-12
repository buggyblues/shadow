import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { Server as SocketIOServer } from 'socket.io'
import { WebSocket, WebSocketServer } from 'ws'
import { createApp } from './app'
import { createAppContainer } from './container'
import { db } from './db'
import { users } from './db/schema'
import { randomFixedDigits } from './lib/id'
import { logger } from './lib/logger'
import { setupWebSocket } from './ws'

const PORT = Number(process.env.PORT ?? 3002)

async function main() {
  // Run database migrations
  const migrationCandidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(process.cwd(), 'dist/db/migrations'),
    path.resolve(process.cwd(), 'apps/server/migrations'),
    path.resolve(process.cwd(), 'apps/server/src/db/migrations'),
  ].filter((p): p is string => Boolean(p))

  const migrationsPath = migrationCandidates.find((p) => fs.existsSync(p))
  if (!migrationsPath) {
    throw new Error(`Migrations folder not found. Tried: ${migrationCandidates.join(', ')}`)
  }
  logger.info('Running database migrations...')
  await migrate(db, { migrationsFolder: migrationsPath })
  logger.info('Database migrations completed')

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
          usernameCheck.length > 0 ? `${adminUsername}_${randomFixedDigits(6)}` : adminUsername
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

  // WebSocket proxy for URL apps:
  // /api/app-proxy-ws/:appId/*
  const appProxyWss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (req, socket, head) => {
    try {
      const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      const match = reqUrl.pathname.match(/^\/api\/app-proxy-ws\/([^/]+)(?:\/(.*))?$/)
      if (!match) return

      const appId = match[1]
      const pathPart = match[2] ?? ''
      if (!appId) {
        socket.destroy()
        return
      }

      const appService = container.resolve('appService')
      const app = await appService.getApp(appId)

      const proxyEnabled =
        app.settings &&
        typeof app.settings === 'object' &&
        (app.settings as Record<string, unknown>).proxyEnabled === true

      if (app.sourceType !== 'url' || !proxyEnabled) {
        socket.destroy()
        return
      }

      const base = new URL(app.sourceUrl)
      const upstream = new URL(pathPart ? `./${pathPart}` : './', base)
      upstream.search = reqUrl.search
      upstream.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'

      appProxyWss.handleUpgrade(req, socket, head, (clientWs: WebSocket) => {
        const protocolsHeader = req.headers['sec-websocket-protocol']
        const protocols =
          typeof protocolsHeader === 'string'
            ? protocolsHeader
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : []

        const upstreamWs = new WebSocket(upstream.toString(), protocols)

        clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(data, { binary: isBinary })
          }
        })

        clientWs.on('close', () => {
          if (
            upstreamWs.readyState === WebSocket.OPEN ||
            upstreamWs.readyState === WebSocket.CONNECTING
          ) {
            upstreamWs.close()
          }
        })

        clientWs.on('error', () => {
          try {
            upstreamWs.close()
          } catch {}
        })

        upstreamWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
          if (clientWs.readyState === clientWs.OPEN) {
            clientWs.send(data, { binary: isBinary })
          }
        })

        upstreamWs.on('close', () => {
          if (clientWs.readyState === clientWs.OPEN) clientWs.close()
        })

        upstreamWs.on('error', () => {
          if (clientWs.readyState === clientWs.OPEN)
            clientWs.close(1011, 'upstream websocket error')
        })
      })
    } catch {
      socket.destroy()
    }
  })

  // Attach Socket.IO to the HTTP server
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 15000, // Send ping every 15s (default 25s)
    pingTimeout: 10000, // Wait 10s for pong (default 20s)
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
