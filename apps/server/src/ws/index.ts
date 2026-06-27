import { createHash } from 'node:crypto'
import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { resolveAvatarUrl } from '../lib/avatar-url'
import { verifyToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'
import { actorFromAuthenticatedUser } from '../security/actor'
import { setupChatGateway } from './chat.gateway'
import { setupCloudComputerGateway } from './cloud-computer.gateway'
import { setupNotificationGateway } from './notification.gateway'
import { setupPresenceGateway } from './presence.gateway'
import { setupVoiceGateway } from './voice.gateway'

async function hydrateSocketUser(
  socket: Socket,
  container: AppContainer,
  userId: string,
  user: {
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean | null
  } | null,
  fallbackUsername?: string | null,
) {
  const username = user?.username ?? fallbackUsername ?? userId
  socket.data.userId = userId
  socket.data.username = username
  socket.data.displayName = user?.displayName ?? username
  socket.data.avatarUrl = resolveAvatarUrl(container.resolve('mediaService'), user?.avatarUrl)
  socket.data.isBot = user?.isBot ?? false
}

async function authenticateSocketUser(socket: Socket, container: AppContainer, token: string) {
  const userDao = container.resolve('userDao')
  const agentDao = container.resolve('agentDao')
  let tokenError: unknown = null

  try {
    const payload = verifyToken(token, ['access', 'agent'])
    const user = await userDao.findById(payload.userId).catch(() => null)
    if (user) {
      if (payload.typ === 'access' && payload.sessionId) {
        const session = await container
          .resolve('userSessionDao')
          .findById(payload.sessionId)
          .catch(() => null)
        if (!session || session.userId !== payload.userId || session.revokedAt) {
          throw new Error('Session revoked')
        }
        socket.data.sessionId = payload.sessionId
      }
      socket.data.actor = actorFromAuthenticatedUser(payload)
      await hydrateSocketUser(socket, container, payload.userId, user, payload.username)
      return
    }
    tokenError = new Error(`JWT user not found: ${payload.userId}`)
  } catch (err) {
    tokenError = err
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const agent =
    (await agentDao.findByTokenHash(tokenHash).catch(() => null)) ??
    (await agentDao.findByLastToken(token))
  if (agent) {
    const user = await userDao.findById(agent.userId).catch(() => null)
    if (user) {
      socket.data.actor = {
        kind: 'agent',
        userId: agent.userId,
        agentId: agent.id,
        ownerId: agent.userId,
        scopes: [],
      }
      await hydrateSocketUser(socket, container, agent.userId, user, 'agent')
      return
    }
    tokenError = new Error(`Stored agent token user not found: ${agent.userId}`)
  }

  throw tokenError ?? new Error('Invalid token')
}

export function setupWebSocket(io: SocketIOServer, container: AppContainer): void {
  // Auth middleware for Socket.IO
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      await authenticateSocketUser(socket, container, token)
      next()
    } catch (err) {
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
  setupCloudComputerGateway(io, container)
  setupVoiceGateway(io, container)
  setupNotificationGateway(io)

  io.on('connection', (socket) => {
    const sessionId = socket.data.sessionId as string | undefined
    if (sessionId) {
      void socket.join(`session:${sessionId}`)
    }
  })

  logger.info('WebSocket gateways initialized')
}
