import { createClient } from 'redis'
import { logger } from './logger'

const REDIS_URL = process.env.REDIS_URL

let client: ReturnType<typeof createClient> | null = null

export async function getRedisClient() {
  if (client) return client

  if (!REDIS_URL) {
    logger.warn('REDIS_URL not set — Redis features disabled')
    return null
  }

  client = createClient({ url: REDIS_URL })

  client.on('error', (err) => logger.error({ err }, 'Redis client error'))
  client.on('connect', () => logger.info('Redis connected'))
  client.on('reconnecting', () => logger.info('Redis reconnecting'))

  await client.connect()
  return client
}

export async function closeRedisClient() {
  if (client) {
    await client.quit()
    client = null
    logger.info('Redis connection closed')
  }
}

/** Redis key helpers for presence */
export const presenceKeys = {
  onlineSockets: (userId: string) => `presence:online:${userId}`,
  userActivity: (userId: string) => `presence:activity:${userId}`,
}
