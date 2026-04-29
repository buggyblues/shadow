import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'
import { setupAppGateway } from './app.gateway'
import { setupChatGateway } from './chat.gateway'
import { setupNotificationGateway } from './notification.gateway'
import { setupPresenceGateway } from './presence.gateway'

async function hydrateSocketUser(
  socket: Socket,
  container: AppContainer,
  userId: string,
  fallbackUsername?: string | null,
) {
  const user = await container
    .resolve('userDao')
    .findById(userId)
    .catch(() => null)
  const username = user?.username ?? fallbackUsername ?? userId
  socket.data.userId = userId
  socket.data.username = username
  socket.data.displayName = user?.displayName ?? username
  socket.data.avatarUrl = user?.avatarUrl ?? null
  socket.data.isBot = user?.isBot ?? false
}

export function setupWebSocket(io: SocketIOServer, container: AppContainer): void {
  // Auth middleware for Socket.IO
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      const payload = verifyToken(token)
      await hydrateSocketUser(socket, container, payload.userId, payload.username)
      next()
    } catch (err) {
      const agent = await container.resolve('agentDao').findByLastToken(token)
      if (agent) {
        await hydrateSocketUser(socket, container, agent.userId, 'agent')
        next()
        return
      }
      logger.warn({ err, socketId: socket.id }, 'Socket authentication failed — invalid token')
      next(new Error('Invalid token'))
    }
  })

  // Initialize Redis for presence tracking
  getRedisClient()
    .then((redis) => {
      setupPresenceGateway(io, container, redis as import('redis').RedisClientType | null)
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to initialize Redis for presence — falling back to local-only')
      setupPresenceGateway(io, container, null)
    })

  setupChatGateway(io, container)
  setupAppGateway(io, container)
  setupNotificationGateway(io)

  logger.info('WebSocket gateways initialized')
}
