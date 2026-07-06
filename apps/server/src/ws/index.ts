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

const AUTHENTICATION_UNAVAILABLE_MESSAGE = 'Authentication unavailable'

function authenticationUnavailableError() {
  return new Error(AUTHENTICATION_UNAVAILABLE_MESSAGE)
}

async function resolveSocketDaoCall<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return (await fn()) ?? null
  } catch {
    throw authenticationUnavailableError()
  }
}

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
    const user = await resolveSocketDaoCall(() => userDao.findById(payload.userId))
    if (user) {
      if (payload.typ === 'access' && payload.sessionId) {
        const session = await resolveSocketDaoCall(() =>
          container.resolve('userSessionDao').findById(payload.sessionId!),
        )
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
    (await resolveSocketDaoCall(() => agentDao.findByTokenHash(tokenHash))) ??
    (await resolveSocketDaoCall(() => agentDao.findByLastToken(token)))
  if (agent) {
    const user = await resolveSocketDaoCall(() => userDao.findById(agent.userId))
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
      const message = err instanceof Error ? err.message : ''
      const clientMessage =
        message === AUTHENTICATION_UNAVAILABLE_MESSAGE
          ? AUTHENTICATION_UNAVAILABLE_MESSAGE
          : message === 'Session revoked'
            ? 'Session revoked'
            : 'Invalid token'
      logger.warn({ err, socketId: socket.id }, 'Socket authentication failed')
      next(new Error(clientMessage))
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
