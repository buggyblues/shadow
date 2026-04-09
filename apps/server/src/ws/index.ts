import type { Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { setupAppGateway } from './app.gateway'
import { setupChatGateway } from './chat.gateway'
import { setupNotificationGateway } from './notification.gateway'
import { setupPresenceGateway } from './presence.gateway'

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

  setupChatGateway(io, container)
  setupAppGateway(io, container)
  setupPresenceGateway(io, container)
  setupNotificationGateway(io)

  logger.info('WebSocket gateways initialized')
}
