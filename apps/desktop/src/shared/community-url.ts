import type { ShadowNotification } from './types'

function originOf(webOrigin: string) {
  try {
    const url = new URL(webOrigin)
    return url.origin
  } catch {
    return 'https://shadowob.app'
  }
}

function encodePathPart(value: string) {
  return encodeURIComponent(value)
}

export function resolveCommunityUrl(webOrigin: string, notification?: ShadowNotification | null) {
  const origin = originOf(webOrigin)
  if (!notification) return `${origin}/app/discover`

  if (notification.scopeServerId && notification.scopeChannelId) {
    return `${origin}/app/servers/${encodePathPart(notification.scopeServerId)}/channels/${encodePathPart(
      notification.scopeChannelId,
    )}`
  }

  if (notification.scopeServerId) {
    return `${origin}/app/servers/${encodePathPart(notification.scopeServerId)}`
  }

  if (notification.referenceType === 'server' && notification.referenceId) {
    return `${origin}/app/servers/${encodePathPart(notification.referenceId)}`
  }

  if (notification.referenceType === 'channel' && notification.referenceId) {
    return `${origin}/app/discover?channel=${encodePathPart(notification.referenceId)}`
  }

  return `${origin}/app/discover`
}
