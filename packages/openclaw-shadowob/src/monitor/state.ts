import fsPromises from 'node:fs/promises'
import nodePath from 'node:path'
import type { ShadowMessage, ShadowRemoteConfig } from '@shadowob/sdk'
import { getDataDir } from './paths.js'

export type ShadowMessageWatermarks = Record<string, { createdAt: string; messageId?: string }>

export async function getSessionCachePath(accountId: string): Promise<string> {
  const dataDir = await getDataDir()
  return nodePath.join(dataDir, 'shadow', `session-cache-${accountId}.json`)
}

export function safeCacheKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function saveSessionCache(
  accountId: string,
  data: { remoteConfig: ShadowRemoteConfig; botUserId: string; botUsername: string },
): Promise<void> {
  try {
    const cachePath = await getSessionCachePath(accountId)
    await fsPromises.mkdir(nodePath.dirname(cachePath), { recursive: true })
    await fsPromises.writeFile(cachePath, JSON.stringify(data), 'utf-8')
  } catch {
    /* non-critical */
  }
}

export async function loadSessionCache(
  accountId: string,
): Promise<{ remoteConfig: ShadowRemoteConfig; botUserId: string; botUsername: string } | null> {
  try {
    const cachePath = await getSessionCachePath(accountId)
    const raw = await fsPromises.readFile(cachePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function getMessageWatermarksPath(accountId: string): Promise<string> {
  const dataDir = await getDataDir()
  return nodePath.join(dataDir, 'shadow', `message-watermarks-${safeCacheKey(accountId)}.json`)
}

export async function loadMessageWatermarks(accountId: string): Promise<ShadowMessageWatermarks> {
  try {
    const raw = await fsPromises.readFile(await getMessageWatermarksPath(accountId), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const watermarks: ShadowMessageWatermarks = {}
    for (const [channelId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const record = value as Record<string, unknown>
      if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) {
        continue
      }
      watermarks[channelId] = {
        createdAt: record.createdAt,
        ...(typeof record.messageId === 'string' ? { messageId: record.messageId } : {}),
      }
    }
    return watermarks
  } catch {
    return {}
  }
}

export async function saveMessageWatermarks(
  accountId: string,
  watermarks: ShadowMessageWatermarks,
): Promise<void> {
  try {
    const cachePath = await getMessageWatermarksPath(accountId)
    await fsPromises.mkdir(nodePath.dirname(cachePath), { recursive: true })
    await fsPromises.writeFile(cachePath, JSON.stringify(watermarks), 'utf-8')
  } catch {
    /* non-critical */
  }
}

function getMessageCreatedMs(message: Pick<ShadowMessage, 'createdAt'>): number | null {
  const createdMs = Date.parse(message.createdAt)
  return Number.isFinite(createdMs) ? createdMs : null
}

export function updateMessageWatermark(
  watermarks: ShadowMessageWatermarks,
  message: Pick<ShadowMessage, 'id' | 'channelId' | 'createdAt'>,
): boolean {
  const createdMs = getMessageCreatedMs(message)
  if (createdMs === null) return false

  const current = watermarks[message.channelId]
  const currentMs = current ? Date.parse(current.createdAt) : Number.NaN
  if (Number.isFinite(currentMs) && createdMs < currentMs) return false
  if (current?.messageId === message.id && current.createdAt === message.createdAt) return false

  watermarks[message.channelId] = { createdAt: message.createdAt, messageId: message.id }
  return true
}

export async function appendMonitorLog(
  accountId: string,
  level: 'info' | 'error',
  message: string,
) {
  try {
    const dataDir = await getDataDir()
    const logDir = nodePath.join(dataDir, 'shadow')
    await fsPromises.mkdir(logDir, { recursive: true })
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
    })
    await fsPromises.appendFile(
      nodePath.join(logDir, `monitor-${safeCacheKey(accountId)}.log`),
      `${line}\n`,
      'utf-8',
    )
  } catch {
    /* non-critical */
  }
}
