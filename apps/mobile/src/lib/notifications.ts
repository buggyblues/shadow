import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { Platform } from 'react-native'
import { fetchApi } from './api'

type NotificationRouteData = {
  channelId?: string
  serverSlug?: string
  referenceId?: string
  referenceType?: string
  scopeServerId?: string
  scopeChannelId?: string
  metadata?: Record<string, unknown>
}

function dataString(data: NotificationRouteData, key: keyof NotificationRouteData) {
  const value = data[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function metadataString(data: NotificationRouteData, key: string) {
  const value = data.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getChannelId(data: NotificationRouteData) {
  const referenceType = dataString(data, 'referenceType')
  return (
    dataString(data, 'channelId') ??
    dataString(data, 'scopeChannelId') ??
    metadataString(data, 'channelId') ??
    (referenceType === 'channel' || referenceType === 'channel_invite'
      ? dataString(data, 'referenceId')
      : null)
  )
}

function getServerId(data: NotificationRouteData) {
  const referenceType = dataString(data, 'referenceType')
  return (
    dataString(data, 'scopeServerId') ??
    metadataString(data, 'serverId') ??
    (referenceType === 'server_join' || referenceType === 'server_invite'
      ? dataString(data, 'referenceId')
      : null)
  )
}

async function navigateToChannel(channelId: string, messageId?: string | null) {
  const channel = await fetchApi<{ id: string; serverId: string | null; kind?: string }>(
    `/api/channels/${channelId}`,
  )
  if (channel.kind === 'dm' || !channel.serverId) {
    router.push(`/(main)/dm/${channel.id}${messageId ? `?msg=${messageId}` : ''}` as never)
    return
  }
  const server = await fetchApi<{ id: string; slug: string }>(`/api/servers/${channel.serverId}`)
  router.push(
    `/(main)/servers/${server.slug ?? channel.serverId}/channels/${channel.id}${
      messageId ? `?msg=${messageId}` : ''
    }` as never,
  )
}

async function navigateToServer(serverId: string) {
  const server = await fetchApi<{ id: string; slug: string }>(`/api/servers/${serverId}`)
  router.push(`/(main)/servers/${server.slug ?? server.id}` as never)
}

/**
 * Configure notification handling behavior.
 * Must be called early (outside of component tree).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * Request notification permissions.
 * Returns true if granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true

  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function registerRemotePushToken(): Promise<void> {
  const granted = await requestNotificationPermissions()
  if (!granted) return
  const token = await Notifications.getExpoPushTokenAsync()
  await fetchApi('/api/notifications/push-tokens', {
    method: 'POST',
    body: JSON.stringify({
      platform: Platform.OS,
      token: token.data,
      deviceName: Platform.OS,
    }),
  })
}

/**
 * Schedule a local notification for an incoming message.
 */
export async function showMessageNotification(params: {
  channelId: string
  serverSlug?: string
  channelName?: string
  senderName: string
  content: string
}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.channelName ? `#${params.channelName}` : params.senderName,
      body: params.channelName ? `${params.senderName}: ${params.content}` : params.content,
      data: {
        channelId: params.channelId,
        serverSlug: params.serverSlug,
      },
    },
    trigger: null, // show immediately
  })
}

/**
 * Set up a listener that navigates to the channel when user taps a notification.
 * Returns cleanup function.
 */
export function setupNotificationResponseListener(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as NotificationRouteData
    void (async () => {
      const legacyChannelId = dataString(data, 'channelId')
      const legacyServerSlug = dataString(data, 'serverSlug')
      if (legacyServerSlug && legacyChannelId) {
        router.push(`/(main)/servers/${legacyServerSlug}/channels/${legacyChannelId}` as never)
        return
      }

      if (data.referenceType === 'message' && data.referenceId) {
        const message = await fetchApi<{ id: string; channelId: string }>(
          `/api/messages/${data.referenceId}`,
        )
        await navigateToChannel(message.channelId, message.id)
        return
      }

      const channelId = getChannelId(data)
      if (channelId) {
        await navigateToChannel(channelId)
        return
      }

      const serverId = getServerId(data)
      if (serverId) {
        await navigateToServer(serverId)
      }
    })().catch(() => null)
  })
  return () => subscription.remove()
}

/**
 * Configure notification channel for Android.
 */
export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    })
  }
}
