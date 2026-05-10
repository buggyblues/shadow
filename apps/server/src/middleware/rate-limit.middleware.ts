import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, Next } from 'hono'
import { getRedisClient } from '../lib/redis'

type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitOptions = {
  namespace: string
  windowMs: number
  limit: number
  keyGenerator?: (c: Context) => string
}

const fallbackBuckets = new Map<string, RateLimitBucket>()
let cachedDisableRateLimits: boolean | null = null

function envFlagEnabled(value: string | undefined) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function readEnvFileFlag(filePath: string, key: string) {
  if (!existsSync(filePath)) return undefined
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 0 || line.slice(0, index).trim() !== key) continue
    return line
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
  }
  return undefined
}

function readDisableRateLimitsFromEnvFiles() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(moduleDir, '../../.env'),
    path.resolve(moduleDir, '../../../../.env'),
  ]
  for (const filePath of [...new Set(candidates)]) {
    const value = readEnvFileFlag(filePath, 'SHADOW_DISABLE_RATE_LIMITS')
    if (value !== undefined) return envFlagEnabled(value)
  }
  return false
}

export function areRateLimitsDisabled() {
  if (process.env.SHADOW_DISABLE_RATE_LIMITS !== undefined) {
    return envFlagEnabled(process.env.SHADOW_DISABLE_RATE_LIMITS)
  }
  cachedDisableRateLimits ??= readDisableRateLimitsFromEnvFiles()
  return cachedDisableRateLimits
}

function getClientIp(c: Context) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    'unknown'
  )
}

function fallbackIncrement(key: string, windowMs: number) {
  const now = Date.now()
  const bucket = fallbackBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs }
    fallbackBuckets.set(key, next)
    return next
  }
  bucket.count += 1
  return bucket
}

async function incrementRateLimit(key: string, windowMs: number) {
  if (process.env.REDIS_URL) {
    const redis = await getRedisClient()
    if (redis) {
      const count = await redis.incr(key)
      if (count === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000))
      }
      const ttl = await redis.ttl(key)
      return {
        count,
        resetAt: Date.now() + Math.max(ttl, 1) * 1000,
      }
    }
  }

  return fallbackIncrement(key, windowMs)
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    if (areRateLimitsDisabled()) {
      await next()
      return
    }

    const identity = options.keyGenerator?.(c) ?? getClientIp(c)
    const key = `rate:${options.namespace}:${identity}`
    const bucket = await incrementRateLimit(key, options.windowMs)
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000))

    c.header('X-RateLimit-Limit', String(options.limit))
    c.header('X-RateLimit-Remaining', String(Math.max(options.limit - bucket.count, 0)))
    c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > options.limit) {
      c.header('Retry-After', String(retryAfterSeconds))
      return c.json(
        {
          ok: false,
          error: 'Too many requests',
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSeconds,
        },
        429,
      )
    }

    await next()
  }
}
