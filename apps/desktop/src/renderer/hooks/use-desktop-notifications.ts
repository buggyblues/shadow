import { useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from '@web/hooks/use-socket'
import { useUnreadCount } from '@web/hooks/use-unread-count'
import { useEffect, useRef } from 'react'

interface DesktopAPI {
  showNotification: (title: string, body: string, channelId?: string) => void
  setBadgeCount: (count: number) => void
}

function getDesktopAPI(): DesktopAPI | null {
  if ('desktopAPI' in window) {
    return (window as Record<string, unknown>).desktopAPI as DesktopAPI
  }
  return null
}

interface IncomingNotification {
  id: string
  type: string
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
}

export function useDesktopNotifications() {
  const api = getDesktopAPI()
  const unreadCount = useUnreadCount()
  const queryClient = useQueryClient()
  const prevCount = useRef(unreadCount)

  // Sync unread count to dock badge
  useEffect(() => {
    api?.setBadgeCount(unreadCount)
    prevCount.current = unreadCount
  }, [unreadCount, api])

  // Show native notification for new socket events when window is not focused
  useSocketEvent<IncomingNotification>('notification:new', (data) => {
    if (document.hasFocus()) return
    api?.showNotification(
      data.title,
      data.body ?? '',
      data.referenceType === 'message' ? (data.referenceId ?? undefined) : undefined,
    )
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  })

  // Clear badge on quit
  useEffect(() => {
    return () => {
      api?.setBadgeCount(0)
    }
  }, [api])
}
