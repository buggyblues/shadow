import { createClient, type RedisClientType } from 'redis'
import { logger } from './logger'

// Use unknown to work around dual @redis/client package resolution
let client: unknown = null

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (client) return client as RedisClientType

  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    logger.warn('REDIS_URL not set — Redis features disabled')
    return null
  }

  client = createClient({ url: redisUrl })

  ;(client as ReturnType<typeof createClient>).on('error', (err) =>
    logger.error({ err }, 'Redis client error'),
  )
  ;(client as ReturnType<typeof createClient>).on('connect', () => logger.info('Redis connected'))
  ;(client as ReturnType<typeof createClient>).on('reconnecting', () =>
    logger.info('Redis reconnecting'),
  )

  await (client as ReturnType<typeof createClient>).connect()
  return client as RedisClientType
}

export async function closeRedisClient() {
  if (client) {
    await (client as ReturnType<typeof createClient>).quit()
    client = null
    logger.info('Redis connection closed')
  }
}

/** Redis key helpers for presence */
export const presenceKeys = {
  onlineSockets: (userId: string) => `presence:online:${userId}`,
  onlineSocket: (userId: string, socketId: string) => `presence:online:${userId}:${socketId}`,
  userActivity: (userId: string) => `presence:activity:${userId}`,
}
