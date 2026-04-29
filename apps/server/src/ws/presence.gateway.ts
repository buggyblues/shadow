import type { RedisClientType } from 'redis'
import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'
import { presenceKeys } from '../lib/redis'

const ACTIVITY_TTL = 60 // seconds — auto-expire safety net

/**
 * Broadcast presence change to only the rooms where the user is active:
 * - All channel rooms the user is a member of
 * - All DM rooms the user participates in
 *
 * This replaces the previous io.emit() which wasted bandwidth sending
 * to every connected client regardless of relevance.
 */
async function broadcastPresenceToRooms(
  io: SocketIOServer,
  container: AppContainer,
  userId: string,
  payload: { userId: string; status: string },
): Promise<void> {
  try {
    const channelMemberDao = container.resolve('channelMemberDao')
    const channelIds = await channelMemberDao.getAllChannelIds(userId)

    // Broadcast to all channel rooms
    for (const channelId of channelIds) {
      io.to(`channel:${channelId}`).emit('presence:change', payload)
    }

    // Broadcast to DM rooms
    try {
      const dmService = container.resolve('dmService')
      const dmChannels = await dmService.getUserChannels(userId)
      for (const dm of dmChannels) {
        io.to(`dm:${dm.id}`).emit('presence:change', payload)
      }
    } catch {
      // DM service may not be available — non-critical
    }
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to scope presence broadcast to rooms')
    // Fallback: don't broadcast rather than broadcast to everyone
  }
}

export function setupPresenceGateway(
  io: SocketIOServer,
  container: AppContainer,
  redis: RedisClientType | null,
): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined
    if (!userId) return

    // Track online user
    socket.on('connect', async () => {
      if (redis) {
        await redis.sAdd(presenceKeys.onlineSockets(userId), socket.id)
        const wasEmpty = (await redis.sCard(presenceKeys.onlineSockets(userId))) === 1
        if (wasEmpty) {
          const userDao = container.resolve('userDao')
          await userDao.updateStatus(userId, 'online')
          await broadcastPresenceToRooms(io, container, userId, {
            userId,
            status: 'online',
          })
        }
      }
    })

    // Run immediately for already-connected socket
    ;(async () => {
      try {
        if (redis) {
          await redis.sAdd(presenceKeys.onlineSockets(userId), socket.id)
          const size = await redis.sCard(presenceKeys.onlineSockets(userId))
          if (size === 1) {
            const userDao = container.resolve('userDao')
            await userDao.updateStatus(userId, 'online')
            await broadcastPresenceToRooms(io, container, userId, {
              userId,
              status: 'online',
            })
          }
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to track online presence in Redis')
      }
    })()

    // presence:update
    socket.on(
      'presence:update',
      async ({ status }: { status: 'online' | 'idle' | 'dnd' | 'offline' }) => {
        const userDao = container.resolve('userDao')
        await userDao.updateStatus(userId, status)
        await broadcastPresenceToRooms(io, container, userId, {
          userId,
          status,
        })
      },
    )

    // presence:activity — agent/user activity status (thinking, working, etc.)
    socket.on(
      'presence:activity',
      async ({ channelId, activity }: { channelId: string; activity: string | null }) => {
        try {
          if (redis) {
            if (activity) {
              await redis.set(
                presenceKeys.userActivity(userId),
                JSON.stringify({ activity, channelId }),
                { EX: ACTIVITY_TTL },
              )
            } else {
              await redis.del(presenceKeys.userActivity(userId))
            }
          }
        } catch (err) {
          logger.warn({ err, userId }, 'Failed to update presence activity in Redis')
        }

        // Broadcast to channel room
        const username = (socket.data.username as string | undefined) ?? userId
        const displayName = (socket.data.displayName as string | undefined) ?? username
        const avatarUrl = (socket.data.avatarUrl as string | null | undefined) ?? null
        const isBot = Boolean(socket.data.isBot)
        io.to(`channel:${channelId}`).emit('presence:activity', {
          userId,
          channelId,
          activity,
          username,
          displayName,
          avatarUrl,
          isBot,
        })
      },
    )

    // Disconnect
    socket.on('disconnect', async () => {
      try {
        if (redis) {
          await redis.sRem(presenceKeys.onlineSockets(userId), socket.id)
          const size = await redis.sCard(presenceKeys.onlineSockets(userId))
          if (size === 0) {
            await redis.del(presenceKeys.onlineSockets(userId))
            await redis.del(presenceKeys.userActivity(userId))
            const userDao = container.resolve('userDao')
            await userDao.updateStatus(userId, 'offline')
            await broadcastPresenceToRooms(io, container, userId, {
              userId,
              status: 'offline',
            })
          }
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to clean up presence on disconnect')
      }
    })
  })
}

/** Get online user IDs — Redis-backed, multi-instance safe */
export async function getOnlineUserIds(redis: RedisClientType | null): Promise<string[]> {
  if (!redis) return []
  const keys = await redis.keys('presence:online:*')
  const onlineUsers: string[] = []

  for (const key of keys) {
    const size = await redis.sCard(key)
    if (size > 0) {
      // Extract userId from key: presence:online:{userId}
      const userId = key.replace('presence:online:', '')
      onlineUsers.push(userId)
    }
  }

  return onlineUsers
}

/** Force-disconnect a user by userId (e.g. on page close via sendBeacon) */
export async function forceDisconnectUser(
  userId: string,
  io: import('socket.io').Server,
  container: AppContainer,
  redis: RedisClientType | null,
): Promise<void> {
  try {
    if (redis) {
      await redis.del(presenceKeys.onlineSockets(userId))
      await redis.del(presenceKeys.userActivity(userId))
    }
    const userDao = container.resolve('userDao')
    await userDao.updateStatus(userId, 'offline')
    await broadcastPresenceToRooms(io, container, userId, {
      userId,
      status: 'offline',
    })
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to force-disconnect user')
  }
}
