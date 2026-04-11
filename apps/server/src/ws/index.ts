import type { Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'
import { setupAppGateway } from './app.gateway'
import { setupChatGateway } from './chat.gateway'
import { setupNotificationGateway } from './notification.gateway'
import { setupPresenceGateway } from './presence.gateway'
import { setupVoiceGateway } from './voice.gateway'

export function setupWebSocket(io: SocketIOServer, container: AppContainer): void {
  // Auth middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      const payload = verifyToken(token)
      socket.data.userId = payload.userId
      socket.data.username = payload.username
      next()
    } catch (err) {
      logger.warn({ err, socketId: socket.id }, 'Socket authentication failed — invalid token')
      next(new Error('Invalid token'))
    }
  })

  // Initialize Redis for presence tracking
  getRedisClient()
    .then((redis) => {
      setupPresenceGateway(io, container, redis)
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to initialize Redis for presence — falling back to local-only')
      setupPresenceGateway(io, container, null)
    })

  setupChatGateway(io, container)
  setupAppGateway(io, container)
  setupNotificationGateway(io)
  setupVoiceGateway(io, container)

  logger.info('WebSocket gateways initialized')
}
