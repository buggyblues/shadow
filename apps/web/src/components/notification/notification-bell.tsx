import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'

interface Notification {
  id: string
  userId: string
  type: 'mention' | 'reply' | 'dm' | 'system'
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
  isRead: boolean
  createdAt: string
}

export function NotificationBell() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showPanel, setShowPanel] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: markRead and setShowPanel are stable refs
  const handleNotificationClick = useCallback(
    async (n: Notification) => {
      // Mark as read
      if (!n.isRead) {
        markRead.mutate(n.id)
      }
      // Navigate to referenced message
      if (n.referenceType === 'message' && n.referenceId) {
        try {
          const message = await fetchApi<{ id: string; channelId: string }>(
            `/api/messages/${n.referenceId}`,
          )
          const channel = await fetchApi<{ id: string; name: string; serverId: string }>(
            `/api/channels/${message.channelId}`,
          )
          const server = await fetchApi<{ id: string; slug: string }>(
            `/api/servers/${channel.serverId}`,
          )
          setShowPanel(false)
          navigate({
            to: '/app/servers/$serverSlug/channels/$channelId',
            params: { serverSlug: server.slug ?? channel.serverId, channelId: message.channelId },
          })
        } catch {
          // Message may have been deleted
        }
      } else if (n.referenceType === 'channel_invite' && n.referenceId) {
        try {
          const channel = await fetchApi<{ id: string; name: string; serverId: string }>(
            `/api/channels/${n.referenceId}`,
          )
          const server = await fetchApi<{ id: string; slug: string }>(
            `/api/servers/${channel.serverId}`,
          )
          setShowPanel(false)
          navigate({
            to: '/app/servers/$serverSlug/channels/$channelId',
            params: { serverSlug: server.slug ?? channel.serverId, channelId: channel.id },
          })
        } catch {
          // Channel may have been deleted
        }
      } else if (n.referenceType === 'server_join' && n.referenceId) {
        try {
          const server = await fetchApi<{ id: string; slug: string }>(
            `/api/servers/${n.referenceId}`,
          )
          setShowPanel(false)
          navigate({
            to: '/app/servers/$serverSlug',
            params: { serverSlug: server.slug ?? server.id },
          })
        } catch {
          // Server may have been deleted
        }
      }
    },
    [navigate],
  )

  // Fetch unread count
  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => fetchApi<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 30_000,
  })

  // Fetch notifications list
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchApi<Notification[]>('/api/notifications?limit=20'),
    enabled: showPanel,
  })

  // Listen for new notifications via WS
  useSocketEvent('notification:new', (_data: Notification) => {
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  // Mark single as read
  const markRead = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  // Mark all as read
  const markAllRead = useMutation({
    mutationFn: () => fetchApi('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const unreadCount = unreadData?.count ?? 0

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPanel(!showPanel)}
        className="relative w-10 h-10 rounded-full bg-bg-primary hover:bg-bg-secondary flex items-center justify-center text-text-muted hover:text-text-primary transition"
        title={t('notification.title')}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-danger rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <>
          {/* Backdrop */}
          <div
            role="button"
            tabIndex={0}
            className="fixed inset-0 z-40"
            onClick={() => setShowPanel(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowPanel(false)
            }}
          />

          {/* Panel */}
          <div className="absolute top-full right-0 mt-2 w-80 bg-bg-secondary border border-border-dim rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <h3 className="font-bold text-text-primary text-sm">{t('notification.title')}</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition"
                  title={t('notification.markAllRead')}
                >
                  <CheckCheck size={14} />
                  {t('notification.markAllRead')}
                </button>
              )}
            </div>

            {/* Notifications list */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-text-muted text-sm">
                  {t('notification.empty')}
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNotificationClick(n)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNotificationClick(n)
                    }}
                    className={`px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-bg-modifier-hover transition cursor-pointer ${
                      !n.isRead ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary font-medium truncate">{n.title}</p>
                        {n.body && (
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <p className="text-[10px] text-text-muted mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(n.id)}
                          className="shrink-0 p-1 text-text-muted hover:text-primary transition"
                          title={t('notification.markRead')}
                        >
                          <Check size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
