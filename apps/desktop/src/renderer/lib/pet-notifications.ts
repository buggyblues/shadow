import type { DesktopPetApi, NotificationItem } from '../pet-types'
import { fetchShadow, getNotificationChannelId, getNotificationServerId } from './pet-community'

export async function markCommunityNotificationRead(
  api: DesktopPetApi | null,
  notification: NotificationItem,
) {
  await fetchShadow(api, `/api/notifications/${notification.id}/read`, { method: 'PATCH' }).catch(
    () => null,
  )
}

export async function resolveNotificationRoute(
  api: DesktopPetApi | null,
  notification: NotificationItem,
): Promise<string> {
  async function channelRoute(channelId: string, messageId?: string | null) {
    const channel = await fetchShadow<{
      id: string
      serverId?: string | null
      kind?: string | null
    }>(api, `/api/channels/${encodeURIComponent(channelId)}`)
    const search = messageId ? `?msg=${encodeURIComponent(messageId)}` : ''
    if (channel.kind === 'dm' || !channel.serverId) {
      return `/dm/${encodeURIComponent(channel.id)}${search}`
    }
    const server = await fetchShadow<{ id: string; slug?: string | null }>(
      api,
      `/api/servers/${encodeURIComponent(channel.serverId)}`,
    )
    return `/servers/${encodeURIComponent(server.slug ?? server.id)}/channels/${encodeURIComponent(
      channel.id,
    )}${search}`
  }

  if (notification.referenceType === 'message' && notification.referenceId) {
    const message = await fetchShadow<{ id: string; channelId: string }>(
      api,
      `/api/messages/${encodeURIComponent(notification.referenceId)}`,
    )
    return channelRoute(message.channelId, message.id)
  }

  const channelId = getNotificationChannelId(notification)
  if (channelId) return channelRoute(channelId)

  const serverId = getNotificationServerId(notification)
  if (serverId) {
    const server = await fetchShadow<{ id: string; slug?: string | null }>(
      api,
      `/api/servers/${encodeURIComponent(serverId)}`,
    )
    return `/servers/${encodeURIComponent(server.slug ?? server.id)}`
  }

  return '/settings/notification'
}
