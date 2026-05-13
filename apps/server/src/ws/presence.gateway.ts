import type { RedisClientType } from 'redis'
import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'
import { presenceKeys } from '../lib/redis'

const ACTIVITY_TTL = 60 // seconds — auto-expire safety net
const SOCKET_TTL = 90 // seconds — Redis stale socket cleanup window
const HEARTBEAT_MS = 30_000

const localOnlineSockets = new Map<string, Set<string>>()

function addLocalSocket(userId: string, socketId: string) {
  let sockets = localOnlineSockets.get(userId)
  if (!sockets) {
    sockets = new Set()
    localOnlineSockets.set(userId, sockets)
  }
  const wasEmpty = sockets.size === 0
  sockets.add(socketId)
  return wasEmpty
}

function removeLocalSocket(userId: string, socketId: string) {
  const sockets = localOnlineSockets.get(userId)
  if (!sockets) return true
  sockets.delete(socketId)
  if (sockets.size === 0) {
    localOnlineSockets.delete(userId)
    return true
  }
  return false
}

async function refreshRedisSocket(redis: RedisClientType, userId: string, socketId: string) {
  await redis.sAdd(presenceKeys.onlineSockets(userId), socketId)
  await redis.set(presenceKeys.onlineSocket(userId, socketId), '1', { EX: SOCKET_TTL })
  await redis.expire(presenceKeys.onlineSockets(userId), SOCKET_TTL * 2)
}

async function removeRedisSocket(redis: RedisClientType, userId: string, socketId: string) {
  await redis.sRem(presenceKeys.onlineSockets(userId), socketId)
  await redis.del(presenceKeys.onlineSocket(userId, socketId))
}

async function redisOnlineSocketCount(redis: RedisClientType, userId: string) {
  const socketIds = await redis.sMembers(presenceKeys.onlineSockets(userId))
  if (socketIds.length === 0) return 0

  let count = 0
  const staleSocketIds: string[] = []
  for (const socketId of socketIds) {
    const exists = await redis.exists(presenceKeys.onlineSocket(userId, socketId))
    if (exists) count += 1
    else staleSocketIds.push(socketId)
  }
  if (staleSocketIds.length > 0) {
    await redis.sRem(presenceKeys.onlineSockets(userId), staleSocketIds)
  }
  if (count === 0) {
    await redis.del(presenceKeys.onlineSockets(userId))
  }
  return count
}

/**
 * Broadcast presence change to only the rooms where the user is active:
 * - All channel rooms the user is a member of
 * - Direct message rooms are ordinary channel rooms with kind='dm'
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

    // Run immediately for already-connected socket
    let heartbeat: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      try {
        let becameOnline = false
        if (redis) {
          const wasOnline = (await redisOnlineSocketCount(redis, userId)) > 0
          await refreshRedisSocket(redis, userId, socket.id)
          becameOnline = !wasOnline
          heartbeat = setInterval(() => {
            void refreshRedisSocket(redis, userId, socket.id).catch((err) =>
              logger.warn({ err, userId }, 'Failed to refresh presence socket TTL'),
            )
          }, HEARTBEAT_MS)
        } else {
          becameOnline = addLocalSocket(userId, socket.id)
        }
        if (becameOnline) {
          const userDao = container.resolve('userDao')
          await userDao.updateStatus(userId, 'online')
          await broadcastPresenceToRooms(io, container, userId, {
            userId,
            status: 'online',
          })
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to track online presence')
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
        const username = socket.data.username as string | undefined
        const displayName = socket.data.displayName as string | undefined
        io.to(`channel:${channelId}`).emit('presence:activity', {
          userId,
          channelId,
          activity,
          username,
          displayName: displayName ?? username,
        })
      },
    )

    // Disconnect
    socket.on('disconnect', async () => {
      try {
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = null
        }
        let becameOffline = false
        if (redis) {
          await removeRedisSocket(redis, userId, socket.id)
          const size = await redisOnlineSocketCount(redis, userId)
          if (size === 0) {
            await redis.del(presenceKeys.userActivity(userId))
            becameOffline = true
          }
        } else {
          becameOffline = removeLocalSocket(userId, socket.id)
        }
        if (becameOffline) {
          const userDao = container.resolve('userDao')
          await userDao.updateStatus(userId, 'offline')
          await broadcastPresenceToRooms(io, container, userId, {
            userId,
            status: 'offline',
          })
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to clean up presence on disconnect')
      }
    })
  })
}

/** Get online user IDs — Redis-backed, multi-instance safe */
export async function getOnlineUserIds(redis: RedisClientType | null): Promise<string[]> {
  if (!redis) return [...localOnlineSockets.keys()]
  const keys = await redis.keys('presence:online:*')
  const onlineUsers: string[] = []

  for (const key of keys) {
    const parts = key.split(':')
    if (parts.length !== 3) continue
    const userId = key.replace('presence:online:', '')
    const size = await redisOnlineSocketCount(redis, userId)
    if (size > 0) {
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
      const socketIds = await redis.sMembers(presenceKeys.onlineSockets(userId))
      if (socketIds.length > 0) {
        await redis.del(socketIds.map((socketId) => presenceKeys.onlineSocket(userId, socketId)))
      }
      await redis.del(presenceKeys.onlineSockets(userId))
      await redis.del(presenceKeys.userActivity(userId))
    } else {
      localOnlineSockets.delete(userId)
    }
    const hasActiveSocket = [...io.sockets.sockets.values()].some(
      (socket) => socket.data.userId === userId,
    )
    if (hasActiveSocket) {
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.userId !== userId) continue
        if (redis) {
          await refreshRedisSocket(redis, userId, socket.id)
        } else {
          addLocalSocket(userId, socket.id)
        }
      }
      return
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
