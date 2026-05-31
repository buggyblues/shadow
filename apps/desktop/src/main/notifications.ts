import { app, ipcMain, Notification } from 'electron'
import { fetchCommunityWithAuth } from './connector-daemon'
import { setTrayAttention } from './tray'
import { sendPetShortcut, showCommunityWindow } from './window'

type DesktopNotificationInput = {
  title: string
  body: string
  channelId?: string
  messageId?: string
  routePath?: string
  target?: 'community' | 'pet'
}

function normalizeRoutePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null
  return trimmed
}

function withMessageSearch(path: string, messageId?: string): string {
  if (!messageId) return path
  const url = new URL(path, 'https://shadow.local')
  url.searchParams.set('msg', messageId)
  return `${url.pathname}${url.search}`
}

async function communityFetchJson<T>(path: string): Promise<T> {
  const response = await fetchCommunityWithAuth(path)
  if (!response.ok) throw new Error(`REQUEST_FAILED_${response.status}`)
  return (await response.json()) as T
}

async function resolveChannelRoute(channelId: string, messageId?: string): Promise<string> {
  const channel = await communityFetchJson<{
    id: string
    serverId?: string | null
    kind?: string | null
  }>(`/api/channels/${encodeURIComponent(channelId)}`)
  if (channel.kind === 'dm' || !channel.serverId) {
    return withMessageSearch(`/dm/${encodeURIComponent(channel.id)}`, messageId)
  }
  const server = await communityFetchJson<{ id: string; slug?: string | null }>(
    `/api/servers/${encodeURIComponent(channel.serverId)}`,
  )
  return withMessageSearch(
    `/servers/${encodeURIComponent(server.slug ?? server.id)}/channels/${encodeURIComponent(channel.id)}`,
    messageId,
  )
}

async function openNotificationTarget(args: DesktopNotificationInput): Promise<void> {
  if (args.target === 'pet') {
    sendPetShortcut('services')
    return
  }
  const routePath = normalizeRoutePath(args.routePath)
  if (routePath) {
    showCommunityWindow(routePath)
    return
  }
  if (args.channelId) {
    try {
      showCommunityWindow(await resolveChannelRoute(args.channelId, args.messageId))
      return
    } catch {
      // Fall through to the notification page if the referenced item is gone.
    }
  }
  showCommunityWindow('/settings/notification')
}

export function setupNotificationHandler(): void {
  ipcMain.handle('desktop:showNotification', (_event, args: DesktopNotificationInput) => {
    if (!Notification.isSupported()) return

    const notification = new Notification({
      title: args.title,
      body: args.body,
      silent: false,
    })

    notification.on('click', () => {
      void openNotificationTarget(args)
    })

    notification.show()
  })

  ipcMain.handle('desktop:setBadgeCount', (_event, count: number) => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge(count > 0 ? String(count) : '')
    }
    setTrayAttention(count > 0)
    // Windows badge is handled via taskbar overlay (requires icon)
  })

  ipcMain.handle('desktop:setNotificationMode', (_event, _mode: string) => {
    // Store notification mode preference - can be extended to filter notifications
  })
}
