import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'

interface Notification {
  id: string
  userId: string
  type: 'mention' | 'reply' | 'dm' | 'system'
  kind?: string | null
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
  metadata?: Record<string, unknown> | null
  aggregatedCount?: number | null
  isRead: boolean
  createdAt: string
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getNotificationDisplay(
  n: Notification,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const metadata = n.metadata ?? {}
  const count = Math.max(n.aggregatedCount ?? 1, 1)
  const actorName = text(metadata.actorName, 'Someone')
  const channelName = text(metadata.channelName, 'channel')
  const serverName = text(metadata.serverName, 'server')
  const preview = text(metadata.preview, n.body ?? '')

  switch (n.kind) {
    case 'message.mention':
      return {
        title:
          count > 1
            ? t('notification.messageMentionCount', { count })
            : t('notification.messageMention', { actorName }),
        body: preview,
      }
    case 'message.reply':
      return {
        title:
          count > 1
            ? t('notification.messageReplyCount', { count })
            : t('notification.messageReply', { actorName }),
        body: preview,
      }
    case 'dm.message':
      return {
        title:
          count > 1
            ? t('notification.dmMessageCount', { count })
            : t('notification.dmMessage', { actorName }),
        body: preview,
      }
    case 'channel.access_requested':
      return {
        title: t('notification.channelAccessRequested', { actorName, channelName }),
        body: t('notification.channelAccessRequestedBody'),
      }
    case 'channel.access_approved':
      return { title: t('notification.channelAccessApproved', { channelName }), body: n.body ?? '' }
    case 'channel.access_rejected':
      return { title: t('notification.channelAccessRejected', { channelName }), body: n.body ?? '' }
    case 'channel.member_added':
      return {
        title: t('notification.channelMemberAdded', { channelName }),
        body: serverName ? t('notification.inServer', { serverName }) : (n.body ?? ''),
      }
    case 'server.access_requested':
      return {
        title: t('notification.serverAccessRequested', { actorName, serverName }),
        body: t('notification.serverAccessRequestedBody'),
      }
    case 'server.access_approved':
      return { title: t('notification.serverAccessApproved', { serverName }), body: n.body ?? '' }
    case 'server.access_rejected':
      return { title: t('notification.serverAccessRejected', { serverName }), body: n.body ?? '' }
    case 'server.member_joined':
      return {
        title:
          count > 1
            ? t('notification.serverMemberJoinedCount', { count, serverName })
            : t('notification.serverMemberJoined', { actorName, serverName }),
        body: n.body ?? '',
      }
    case 'server.invite':
      return {
        title: t('notification.serverInvite', { actorName, serverName }),
        body: n.body ?? '',
      }
    case 'friendship.request':
      return { title: t('notification.friendshipRequest', { actorName }), body: n.body ?? '' }
    case 'recharge.succeeded':
      return {
        title: t('notification.rechargeSucceeded'),
        body: t('notification.rechargeSucceededBody', {
          amount: metadata.shrimpCoins ?? '',
        }),
      }
    default:
      return { title: n.title, body: n.body ?? '' }
  }
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
            to: '/servers/$serverSlug/channels/$channelId',
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
            to: '/servers/$serverSlug/channels/$channelId',
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
            to: '/servers/$serverSlug',
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

  const reviewJoinRequest = useMutation({
    mutationFn: (input: { requestId: string; status: 'approved' | 'rejected' }) =>
      fetchApi(`/api/channel-join-requests/${input.requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const reviewServerJoinRequest = useMutation({
    mutationFn: (input: { requestId: string; status: 'approved' | 'rejected' }) =>
      fetchApi(`/api/servers/join-requests/${input.requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server-access'] })
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
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-danger rounded-full text-white text-[11px] font-bold flex items-center justify-center px-1">
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
          <div className="absolute top-full right-0 mt-2 w-80 bg-bg-primary/95 backdrop-blur-xl border border-border-subtle rounded-[24px] shadow-[0_16px_64px_rgba(0,0,0,0.4)] z-50 overflow-hidden">
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
                notifications.map((n) => {
                  const display = getNotificationDisplay(n, t)
                  return (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(n)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNotificationClick(n)
                      }}
                      className={`px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-bg-tertiary/50 transition cursor-pointer ${
                        !n.isRead ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary font-medium truncate">
                            {display.title}
                          </p>
                          {display.body && (
                            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                              {display.body}
                            </p>
                          )}
                          {n.referenceType === 'channel_join_request' && n.referenceId && (
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-success/15 px-2 text-xs font-bold text-success transition hover:bg-success/25"
                                disabled={reviewJoinRequest.isPending}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  reviewJoinRequest.mutate({
                                    requestId: n.referenceId!,
                                    status: 'approved',
                                  })
                                }}
                              >
                                <Check size={13} />
                                <span>{t('channel.approveAccess')}</span>
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-danger/15 px-2 text-xs font-bold text-danger transition hover:bg-danger/25"
                                disabled={reviewJoinRequest.isPending}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  reviewJoinRequest.mutate({
                                    requestId: n.referenceId!,
                                    status: 'rejected',
                                  })
                                }}
                              >
                                <X size={13} />
                                <span>{t('channel.rejectAccess')}</span>
                              </button>
                            </div>
                          )}
                          {n.referenceType === 'server_join_request' && n.referenceId && (
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-success/15 px-2 text-xs font-bold text-success transition hover:bg-success/25"
                                disabled={reviewServerJoinRequest.isPending}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  reviewServerJoinRequest.mutate({
                                    requestId: n.referenceId!,
                                    status: 'approved',
                                  })
                                }}
                              >
                                <Check size={13} />
                                <span>{t('server.approveAccess')}</span>
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-danger/15 px-2 text-xs font-bold text-danger transition hover:bg-danger/25"
                                disabled={reviewServerJoinRequest.isPending}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  reviewServerJoinRequest.mutate({
                                    requestId: n.referenceId!,
                                    status: 'rejected',
                                  })
                                }}
                              >
                                <X size={13} />
                                <span>{t('server.rejectAccess')}</span>
                              </button>
                            </div>
                          )}
                          <p className="text-[11px] text-text-muted mt-1">
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
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
