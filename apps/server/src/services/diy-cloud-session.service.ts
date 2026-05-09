import { randomUUID } from 'node:crypto'
import { logger } from '../lib/logger'
import { getRedisClient } from '../lib/redis'
import type {
  DiyCloudDraft,
  DiyCloudGenerateInput,
  DiyCloudProgressEvent,
} from './diy-cloud.service'

const DIY_SESSION_TTL_SECONDS = 24 * 60 * 60
const DIY_SESSION_EVENT_LIMIT = 200
const REDIS_CONFIGURED = Boolean(process.env.REDIS_URL)

export type DiyCloudSessionStatus = 'running' | 'completed' | 'failed'

export type DiyCloudGenerationSession = {
  sessionId: string
  userId: string
  input: DiyCloudGenerateInput
  status: DiyCloudSessionStatus
  createdAt: string
  updatedAt: string
  expiresAt: string
  events: DiyCloudProgressEvent[]
  draft?: DiyCloudDraft
  error?: string
}

const memorySessions = new Map<string, DiyCloudGenerationSession>()
let redisDisabled = !REDIS_CONFIGURED

function sessionKey(sessionId: string) {
  return `diy-cloud:session:${sessionId}`
}

function expiryDate() {
  return new Date(Date.now() + DIY_SESSION_TTL_SECONDS * 1000).toISOString()
}

async function readSession(sessionId: string) {
  try {
    const redis = redisDisabled ? null : await getRedisClient()
    if (redis) {
      const raw = await redis.get(sessionKey(sessionId))
      if (raw) return JSON.parse(raw) as DiyCloudGenerationSession
    } else if (!REDIS_CONFIGURED) {
      redisDisabled = true
    }
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to read DIY Cloud session from Redis')
  }

  const session = memorySessions.get(sessionId) ?? null
  if (!session) return null
  if (Date.parse(session.expiresAt) <= Date.now()) {
    memorySessions.delete(sessionId)
    return null
  }
  return session
}

async function writeSession(session: DiyCloudGenerationSession) {
  const next: DiyCloudGenerationSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    events: session.events.slice(-DIY_SESSION_EVENT_LIMIT),
  }
  memorySessions.set(next.sessionId, next)

  try {
    const redis = redisDisabled ? null : await getRedisClient()
    if (redis) {
      await redis.set(sessionKey(next.sessionId), JSON.stringify(next), {
        EX: DIY_SESSION_TTL_SECONDS,
      })
    } else if (!REDIS_CONFIGURED) {
      redisDisabled = true
    }
  } catch (err) {
    logger.warn({ err, sessionId: next.sessionId }, 'Failed to write DIY Cloud session to Redis')
  }
  return next
}

export async function createDiyCloudSession(userId: string, input: DiyCloudGenerateInput) {
  const now = new Date().toISOString()
  return writeSession({
    sessionId: randomUUID(),
    userId,
    input,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    expiresAt: expiryDate(),
    events: [],
  })
}

export async function getDiyCloudSession(userId: string, sessionId: string) {
  const session = await readSession(sessionId)
  if (!session || session.userId !== userId) return null
  return session
}

export async function appendDiyCloudSessionEvent(
  userId: string,
  sessionId: string,
  event: DiyCloudProgressEvent,
) {
  const session = await getDiyCloudSession(userId, sessionId)
  if (!session) return null
  return writeSession({
    ...session,
    status: event.type === 'draft' ? 'completed' : session.status,
    events: [...session.events, event],
    draft: event.type === 'draft' ? event.draft : session.draft,
  })
}

export async function failDiyCloudSession(userId: string, sessionId: string, error: string) {
  const session = await getDiyCloudSession(userId, sessionId)
  if (!session) return null
  return writeSession({
    ...session,
    status: 'failed',
    error,
  })
}

export function diyCloudSessionTtlSeconds() {
  return DIY_SESSION_TTL_SECONDS
}
