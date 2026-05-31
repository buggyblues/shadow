import {
  DESKTOP_COMMUNITY_AUTH_REQUIRED,
  DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT,
  readCommunityAccessTokenFromStorage,
} from '../../shared/community-auth'
import type {
  ChannelSubscription,
  CommunityChannelOption,
  CommunityServerOption,
  DesktopPetApi,
  NotificationItem,
  SubscriptionFile,
} from '../pet-types'

export {
  communityErrorMessage,
  communityRequestStateFromError,
  isCommunityAuthRequiredError,
} from '../../shared/community-auth'

const SHADOW_WEB_ORIGIN = 'https://shadowob.com'
const DESKTOP_SETTINGS_STORAGE_KEY = 'shadow:desktop-runtime-settings:v1'

type ShadowCommunityAuthApi = Pick<DesktopPetApi, 'getCommunityAuthToken'>
type ShadowCommunityApi = ShadowCommunityAuthApi & Pick<DesktopPetApi, 'communityFetchJson'>

function metaString(source: { metadata?: Record<string, unknown> | null }, key: string) {
  const value = source.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getNotificationChannelId(notification: NotificationItem) {
  return (
    notification.scopeChannelId ??
    metaString(notification, 'channelId') ??
    (notification.referenceType === 'channel' || notification.referenceType === 'channel_invite'
      ? notification.referenceId
      : null)
  )
}

export function getNotificationServerId(notification: NotificationItem) {
  return (
    notification.scopeServerId ??
    metaString(notification, 'serverId') ??
    (notification.referenceType === 'server_join' || notification.referenceType === 'server_invite'
      ? notification.referenceId
      : null)
  )
}

export function getShadowOrigin() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(DESKTOP_SETTINGS_STORAGE_KEY) ?? '{}',
    ) as Partial<{ serverBaseUrl: string }>
    if (typeof parsed.serverBaseUrl === 'string') {
      const url = new URL(parsed.serverBaseUrl)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
    }
  } catch {
    // Fall through to the hosted community.
  }
  return SHADOW_WEB_ORIGIN
}

export function getShadowUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path
  return new URL(path, getShadowOrigin()).toString()
}

export async function readShadowAccessToken(api: ShadowCommunityAuthApi | null): Promise<string> {
  try {
    const token = await api?.getCommunityAuthToken?.()
    if (token?.trim()) return token.trim()
  } catch {
    // Fall back to the current renderer's storage for non-desktop previews.
  }
  return readCommunityAccessTokenFromStorage((key) => localStorage.getItem(key))
}

export async function fetchShadow<T>(
  api: ShadowCommunityApi | null,
  path: string,
  options?: RequestInit,
): Promise<T> {
  if (api?.communityFetchJson) {
    const headers =
      options?.headers && !(options.headers instanceof Headers) && !Array.isArray(options.headers)
        ? (options.headers as Record<string, string>)
        : undefined
    let body: unknown
    if (typeof options?.body === 'string') {
      try {
        body = JSON.parse(options.body)
      } catch {
        body = options.body
      }
    } else {
      body = options?.body
    }
    return api.communityFetchJson<T>({
      path,
      method: options?.method,
      body,
      headers,
    })
  }

  const token = await readShadowAccessToken(api)
  if (!token) throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  const response = await fetch(getShadowUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`REQUEST_FAILED_${response.status}`)
  return response.json() as Promise<T>
}

export function onCommunityAuthRequired(callback: () => void) {
  const listener = () => callback()
  window.addEventListener(DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT, listener)
  return () => window.removeEventListener(DESKTOP_COMMUNITY_AUTH_REQUIRED_EVENT, listener)
}

export async function loadCommunityChannelOptions(api: DesktopPetApi | null) {
  const serverPayload = await fetchShadow<unknown>(api, '/api/servers')
  const servers = normalizeCommunityServers(serverPayload)
  const results = await Promise.allSettled(
    servers.map(async (server) => {
      const routeIds = [server.slug, server.id].filter(
        (value, index, values): value is string =>
          typeof value === 'string' && value.length > 0 && values.indexOf(value) === index,
      )
      let channelPayload: unknown = null
      let lastError: unknown = null
      for (const serverRouteId of routeIds) {
        try {
          channelPayload = await fetchShadow<unknown>(
            api,
            `/api/servers/${encodeURIComponent(serverRouteId)}/channels`,
          )
          lastError = null
          break
        } catch (error) {
          lastError = error
        }
      }
      if (lastError) throw lastError
      return normalizeCommunityChannels(channelPayload, server)
    }),
  )
  const byId = new Map<string, CommunityChannelOption>()
  for (const channel of results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )) {
    byId.set(channel.id, channel)
  }
  const failed = results.find((result) => result.status === 'rejected')
  if (servers.length > 0 && byId.size === 0 && failed?.status === 'rejected') {
    throw failed.reason
  }
  return [...byId.values()]
}

export async function loadSubscriptionFiles(
  api: DesktopPetApi | null,
  subscriptions: ChannelSubscription[],
) {
  const files: SubscriptionFile[] = []
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const payload = await fetchShadow<unknown>(
        api,
        `/api/channels/${encodeURIComponent(subscription.channelId)}/messages?limit=40`,
      )
      const messages = asArray(asRecord(payload).messages ?? payload)
      for (const message of messages) {
        const messageRecord = asRecord(message)
        const createdAt = firstString(messageRecord.createdAt, messageRecord.updatedAt)
        for (const rawAttachment of asArray(messageRecord.attachments)) {
          const attachment = asRecord(rawAttachment)
          const url = await resolveAttachmentUrl(api, attachment)
          if (!url) continue
          const title =
            firstString(
              attachment.filename,
              attachment.fileName,
              attachment.name,
              attachment.title,
            ) ||
            new URL(url).pathname.split('/').pop() ||
            'file'
          const contentType = firstString(
            attachment.contentType,
            attachment.mimeType,
            attachment.type,
          )
          files.push({
            id: firstString(attachment.id) || `${subscription.channelId}:${url}`,
            attachmentId: firstString(attachment.id) || undefined,
            title,
            url,
            contentType,
            channelId: subscription.channelId,
            channelName: subscription.channelName,
            serverName: subscription.serverName,
            createdAt,
            unread: Boolean(
              createdAt &&
                (!subscription.lastSeenAt ||
                  new Date(createdAt).getTime() > new Date(subscription.lastSeenAt).getTime()),
            ),
          })
        }
      }
    }),
  )
  return files.sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return rightTime - leftTime
  })
}

export function canOpenInElectronReader(file: SubscriptionFile) {
  const contentType = file.contentType.toLowerCase()
  const path = new URL(file.url).pathname.toLowerCase()
  return (
    contentType.startsWith('image/') ||
    contentType.includes('text/') ||
    contentType.includes('html') ||
    contentType.includes('markdown') ||
    contentType.includes('pdf') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp') ||
    path.endsWith('.gif') ||
    path.endsWith('.svg') ||
    path.endsWith('.html') ||
    path.endsWith('.htm') ||
    path.endsWith('.md') ||
    path.endsWith('.markdown') ||
    path.endsWith('.txt') ||
    path.endsWith('.pdf')
  )
}

function normalizeCommunityServers(payload: unknown): CommunityServerOption[] {
  const rows = asArray(asRecord(payload).servers ?? payload)
  return rows
    .map((row): CommunityServerOption | null => {
      const record = asRecord(row)
      const serverRecord = asRecord(record.server)
      const server = Object.keys(serverRecord).length > 0 ? serverRecord : record
      const id = firstString(server.id, record.serverId)
      if (!id) return null
      return {
        id,
        slug: firstString(server.slug) || null,
        name: firstString(server.name, server.displayName, server.slug, id),
      }
    })
    .filter((server): server is CommunityServerOption => Boolean(server))
}

function normalizeCommunityChannels(
  payload: unknown,
  server: CommunityServerOption,
): CommunityChannelOption[] {
  const rows = asArray(asRecord(payload).channels ?? payload)
  return rows
    .map((row): CommunityChannelOption | null => {
      const record = asRecord(row)
      const channelRecord = asRecord(record.channel)
      const channel = Object.keys(channelRecord).length > 0 ? channelRecord : record
      const id = firstString(channel.id, record.channelId)
      if (!id) return null
      return {
        id,
        name: firstString(channel.name, channel.title, id),
        serverId: firstString(channel.serverId, server.id),
        serverSlug: server.slug ?? null,
        serverName: server.name,
      }
    })
    .filter((channel): channel is CommunityChannelOption => Boolean(channel))
}

async function resolveAttachmentUrl(
  api: DesktopPetApi | null,
  attachment: Record<string, unknown>,
) {
  const attachmentId = firstString(attachment.id)
  const directUrl = firstString(
    attachment.url,
    attachment.mediaUrl,
    attachment.fileUrl,
    attachment.downloadUrl,
  )
  const directPath = directUrl ? mediaPathFromUrl(directUrl) : ''
  const shouldResolveSigned =
    !directUrl || directPath.startsWith('/shadow/uploads/') || directPath.startsWith('/api/media/')
  if (attachmentId && shouldResolveSigned) {
    const result = await fetchShadow<unknown>(
      api,
      `/api/attachments/${encodeURIComponent(attachmentId)}/media-url?disposition=inline`,
    ).catch(() => null)
    const signedPath = firstString(asRecord(result).url)
    if (signedPath) return getShadowUrl(signedPath)
  }
  if (directUrl) return getShadowUrl(directUrl)
  if (!attachmentId) return ''
  const result = await fetchShadow<unknown>(
    api,
    `/api/attachments/${encodeURIComponent(attachmentId)}/media-url?disposition=inline`,
  ).catch(() => null)
  const signedPath = firstString(asRecord(result).url)
  return signedPath ? getShadowUrl(signedPath) : ''
}

function mediaPathFromUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return value.split(/[?#]/)[0] ?? value
  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}
