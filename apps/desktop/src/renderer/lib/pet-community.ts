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
const DESKTOP_COMMUNITY_NOT_FOUND_PAYLOAD = { __desktopCommunityNotFound: true } as const

type ShadowCommunityAuthApi = Pick<DesktopPetApi, 'getCommunityAuthToken'>
type ShadowCommunityApi = ShadowCommunityAuthApi & Pick<DesktopPetApi, 'communityFetchJson'>
type DesktopCommunityFetchOptions = RequestInit & {
  optionalNotFound?: boolean
}

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
  options?: DesktopCommunityFetchOptions,
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
      ...(options?.optionalNotFound === true ? { optional: true } : {}),
    })
  }

  const { optionalNotFound, ...requestOptions } = options ?? {}
  const token = await readShadowAccessToken(api)
  if (!token) throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  const response = await fetch(getShadowUrl(path), {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(requestOptions.headers ?? {}),
    },
  })
  if (optionalNotFound && response.status === 404) {
    return DESKTOP_COMMUNITY_NOT_FOUND_PAYLOAD as T
  }
  if (!response.ok) throw new Error(`REQUEST_FAILED_${response.status}`)
  return response.json() as Promise<T>
}

function isDesktopCommunityNotFoundPayload(payload: unknown) {
  return asRecord(payload).__desktopCommunityNotFound === true
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
            { optionalNotFound: true },
          )
          if (isDesktopCommunityNotFoundPayload(channelPayload)) {
            lastError = new Error('REQUEST_FAILED_404')
            continue
          }
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

export async function loadContentSubscriptions(api: DesktopPetApi | null) {
  const payload = await fetchShadow<unknown>(api, '/api/content-subscriptions', {
    optionalNotFound: true,
  })
  if (isDesktopCommunityNotFoundPayload(payload)) return []
  return normalizeContentSubscriptions(payload)
}

export async function subscribeContentChannel(
  api: DesktopPetApi | null,
  channel: CommunityChannelOption,
) {
  const payload = await fetchShadow<unknown>(
    api,
    `/api/channels/${encodeURIComponent(channel.id)}/content-subscription`,
    { method: 'POST' },
  )
  return normalizeContentSubscription(payload, channel)
}

export async function unsubscribeContentChannel(
  api: DesktopPetApi | null,
  subscription: ChannelSubscription,
) {
  if (!subscription.id) return { ok: true }
  return fetchShadow<{ ok: true }>(
    api,
    `/api/content-subscriptions/${encodeURIComponent(subscription.id)}`,
    { method: 'DELETE' },
  )
}

export async function markContentFeedOpened(api: DesktopPetApi | null, feedItemId: string) {
  return fetchShadow<unknown>(api, `/api/content-feed/${encodeURIComponent(feedItemId)}/events`, {
    method: 'POST',
    body: JSON.stringify({ state: 'opened' }),
    optionalNotFound: true,
  })
}

export async function loadSubscriptionFiles(
  api: DesktopPetApi | null,
  _subscriptions: ChannelSubscription[],
) {
  const payload = await fetchShadow<unknown>(api, '/api/content-feed?limit=50&sort=latest', {
    optionalNotFound: true,
  })
  if (isDesktopCommunityNotFoundPayload(payload)) return []
  const files = await normalizeContentFeedFiles(api, payload)
  return files.sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    return rightTime - leftTime
  })
}

export function canOpenInElectronReader(file: SubscriptionFile) {
  if (file.kind === 'card') return false
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

function normalizeContentSubscriptions(payload: unknown): ChannelSubscription[] {
  const rows = asArray(asRecord(payload).subscriptions ?? payload)
  return rows
    .map((row) => normalizeContentSubscription(row))
    .filter((subscription): subscription is ChannelSubscription => Boolean(subscription))
}

function normalizeContentSubscription(
  row: unknown,
  fallbackChannel?: CommunityChannelOption,
): ChannelSubscription | null {
  const record = asRecord(row)
  const subscription = Object.keys(asRecord(record.subscription)).length
    ? asRecord(record.subscription)
    : record
  const channel = Object.keys(asRecord(record.channel)).length
    ? asRecord(record.channel)
    : fallbackChannel
      ? {
          id: fallbackChannel.id,
          name: fallbackChannel.name,
          serverId: fallbackChannel.serverId,
        }
      : {}
  const server = Object.keys(asRecord(record.server)).length
    ? asRecord(record.server)
    : fallbackChannel
      ? {
          id: fallbackChannel.serverId,
          slug: fallbackChannel.serverSlug,
          name: fallbackChannel.serverName,
        }
      : {}
  const channelId = firstString(subscription.channelId, channel.id, fallbackChannel?.id)
  const serverId = firstString(subscription.serverId, server.id, fallbackChannel?.serverId)
  if (!channelId || !serverId) return null
  return {
    id: firstString(subscription.id) || undefined,
    channelId,
    channelName: firstString(channel.name, fallbackChannel?.name, channelId),
    serverId,
    serverSlug: firstString(server.slug, fallbackChannel?.serverSlug) || null,
    serverName: firstString(server.name, fallbackChannel?.serverName, serverId),
    lastSeenAt: firstString(subscription.lastReadAt, subscription.updatedAt) || undefined,
    isDefault: Boolean(subscription.isDefault),
  }
}

async function normalizeContentFeedFiles(
  api: DesktopPetApi | null,
  payload: unknown,
): Promise<SubscriptionFile[]> {
  const rows = asArray(asRecord(payload).items ?? payload)
  const results = await Promise.allSettled(rows.map((row) => normalizeContentFeedFile(api, row)))
  return results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((file): file is SubscriptionFile => Boolean(file))
}

async function normalizeContentFeedFile(
  api: DesktopPetApi | null,
  row: unknown,
): Promise<SubscriptionFile | null> {
  const item = asRecord(row)
  const channel = asRecord(item.channel)
  const server = asRecord(item.server)
  const channelId = firstString(item.channelId, channel.id)
  const serverId = firstString(item.serverId, server.id)
  if (!channelId || !serverId) return null

  const kinds = asArray(item.contentKinds).filter(
    (value): value is string => typeof value === 'string',
  )
  const primaryAttachmentId = firstString(item.primaryAttachmentId)
  const card = asArray(item.cardRefs)
    .map(asRecord)
    .find((entry) => entry.kind === 'server_app' && firstString(entry.appKey))
  const appKey = card ? firstString(card.appKey) : ''
  const appPath = card ? firstString(asRecord(card.action).path) : ''
  const serverSlug = firstString(server.slug) || null
  const serverRouteId = serverSlug ?? serverId
  const kind = (
    primaryAttachmentId ? kinds[0] : appKey ? 'card' : kinds[0]
  ) as SubscriptionFile['kind']
  const url = primaryAttachmentId
    ? await resolveAttachmentUrl(api, { id: primaryAttachmentId })
    : appKey
      ? `/servers/${encodeURIComponent(serverRouteId)}/apps/${encodeURIComponent(appKey)}${
          appPath.startsWith('/') ? `#${appPath}` : ''
        }`
      : `/servers/${encodeURIComponent(serverRouteId)}/channels/${encodeURIComponent(channelId)}`
  if (!url) return null

  return {
    id: firstString(item.id) || `${channelId}:${url}`,
    feedItemId: firstString(item.id) || undefined,
    messageId: firstString(item.messageId) || undefined,
    attachmentId: primaryAttachmentId || undefined,
    title: firstString(card?.title, item.title) || 'Content',
    url,
    contentType:
      firstString(item.primaryAttachmentContentType) ||
      (kind === 'card' ? 'application/vnd.shadow.server-app' : 'application/octet-stream'),
    kind,
    appKey: appKey || undefined,
    appPath: appPath || undefined,
    channelId,
    channelName: firstString(channel.name, channelId),
    serverId,
    serverSlug,
    serverName: firstString(server.name, serverId),
    createdAt: firstString(item.publishedAt, item.createdAt, item.updatedAt) || undefined,
    unread: item.readState === 'unread',
  }
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
