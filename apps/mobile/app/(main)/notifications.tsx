import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { AtSign, Bell, Check, CheckCheck, Inbox, MessageCircle, User, X } from 'lucide-react-native'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeInUp } from 'react-native-reanimated'
import { Avatar } from '../../src/components/common/avatar'
import { EmptyState } from '../../src/components/common/empty-state'
import { LoadingScreen } from '../../src/components/common/loading-screen'
import { BackgroundSurface, Button, ButtonGroup, CardPressable } from '../../src/components/ui'
import { useSocketEvent } from '../../src/hooks/use-socket'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { fontSize, spacing, useColors } from '../../src/theme'

interface Notification {
  id: string
  userId: string
  type: 'mention' | 'reply' | 'dm' | 'system'
  kind?: string | null
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
  senderId: string | null
  senderAvatarUrl: string | null
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

export default function NotificationsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchApi<Notification[]>('/api/notifications?limit=50'),
  })

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  })

  const markRead = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

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
    },
  })

  const handlePress = useCallback(
    async (n: Notification) => {
      if (!n.isRead) markRead.mutate(n.id)

      if (n.type === 'dm' && n.referenceId) {
        router.push(`/(main)/dm/${n.referenceId}` as never)
        return
      }

      if (n.referenceType === 'message' && n.referenceId) {
        try {
          const message = await fetchApi<{ id: string; channelId: string }>(
            `/api/messages/${n.referenceId}`,
          )
          const channel = await fetchApi<{ id: string; serverId: string | null }>(
            `/api/channels/${message.channelId}`,
          )
          if (!channel.serverId) {
            router.push(`/(main)/dm/${channel.id}` as never)
            return
          }
          const server = await fetchApi<{ id: string; slug: string }>(
            `/api/servers/${channel.serverId}`,
          )
          router.push(
            `/(main)/servers/${server.slug ?? channel.serverId}/channels/${message.channelId}` as never,
          )
        } catch {}
      } else if (n.referenceType === 'channel_invite' && n.referenceId) {
        try {
          const channel = await fetchApi<{ id: string; serverId: string | null }>(
            `/api/channels/${n.referenceId}`,
          )
          if (!channel.serverId) {
            router.push(`/(main)/dm/${channel.id}` as never)
            return
          }
          const server = await fetchApi<{ id: string; slug: string }>(
            `/api/servers/${channel.serverId}`,
          )
          router.push(
            `/(main)/servers/${server.slug ?? channel.serverId}/channels/${channel.id}` as never,
          )
        } catch {}
      } else if (n.referenceType === 'server_join' && n.referenceId) {
        try {
          const server = await fetchApi<{ id: string; slug: string }>(
            `/api/servers/${n.referenceId}`,
          )
          router.push(`/(main)/servers/${server.slug ?? server.id}` as never)
        } catch {}
      }
    },
    [router, markRead, t],
  )

  const unreadCount = notifications.filter((n) => !n.isRead).length

  if (isLoading) return <LoadingScreen />

  const getNotifIcon = (type: string, color: string) => {
    switch (type) {
      case 'mention':
        return <AtSign size={22} color={color} strokeWidth={2.5} />
      case 'reply':
        return <MessageCircle size={22} color={color} strokeWidth={2.5} />
      case 'dm':
        return <User size={22} color={color} strokeWidth={2.5} />
      default:
        return <Bell size={22} color={color} strokeWidth={2.5} />
    }
  }

  return (
    <BackgroundSurface>
      <View style={[styles.container]}>
        {/* Mark all read header */}
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="md"
            icon={CheckCheck}
            containerStyle={styles.markAllBtn}
            style={styles.markAllInner}
            onPress={() => markAllRead.mutate()}
            loading={markAllRead.isPending}
          >
            {t('notification.markAllRead', '全部标为已读')}
          </Button>
        )}

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon={Inbox}
              title={t('notification.empty', '暂无通知')}
              description={t('notification.emptyDesc', '还没有收到任何新消息')}
            />
          }
          renderItem={({ item, index }) => {
            const display = getNotificationDisplay(item, t)
            return (
              <Reanimated.View entering={FadeInUp.delay(index * 40).springify()}>
                <CardPressable
                  variant="glassCard"
                  active={!item.isRead}
                  style={styles.notifCard}
                  onPress={() => handlePress(item)}
                >
                  <View style={styles.notifContent}>
                    {item.senderAvatarUrl ? (
                      <Avatar
                        uri={item.senderAvatarUrl}
                        name={display.title}
                        size={44}
                        userId={item.senderId ?? ''}
                      />
                    ) : (
                      <View
                        style={[
                          styles.iconBubble,
                          {
                            backgroundColor: item.isRead
                              ? colors.inputBackground
                              : `${colors.primary}20`,
                          },
                        ]}
                      >
                        {getNotifIcon(item.type, item.isRead ? colors.textMuted : colors.primary)}
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.notifTitle,
                          { color: colors.text, fontWeight: item.isRead ? '600' : '800' },
                        ]}
                        numberOfLines={1}
                      >
                        {display.title}
                      </Text>
                      {display.body && (
                        <Text
                          style={[styles.notifBody, { color: colors.textSecondary }]}
                          numberOfLines={2}
                        >
                          {display.body}
                        </Text>
                      )}
                      {item.referenceType === 'channel_join_request' && item.referenceId && (
                        <ButtonGroup style={styles.requestActions}>
                          <Button
                            disabled={reviewJoinRequest.isPending}
                            variant="glass"
                            size="xs"
                            icon={Check}
                            iconColor={colors.success}
                            textStyle={[styles.requestActionText, { color: colors.success }]}
                            containerStyle={styles.requestActionCell}
                            style={styles.requestAction}
                            onPress={() =>
                              reviewJoinRequest.mutate({
                                requestId: item.referenceId!,
                                status: 'approved',
                              })
                            }
                          >
                            {t('channel.approveAccess', '同意')}
                          </Button>
                          <Button
                            disabled={reviewJoinRequest.isPending}
                            variant="danger"
                            size="xs"
                            icon={X}
                            containerStyle={styles.requestActionCell}
                            style={styles.requestAction}
                            onPress={() =>
                              reviewJoinRequest.mutate({
                                requestId: item.referenceId!,
                                status: 'rejected',
                              })
                            }
                          >
                            {t('channel.rejectAccess', '拒绝')}
                          </Button>
                        </ButtonGroup>
                      )}
                      {item.referenceType === 'server_join_request' && item.referenceId && (
                        <ButtonGroup style={styles.requestActions}>
                          <Button
                            disabled={reviewServerJoinRequest.isPending}
                            variant="glass"
                            size="xs"
                            icon={Check}
                            iconColor={colors.success}
                            textStyle={[styles.requestActionText, { color: colors.success }]}
                            containerStyle={styles.requestActionCell}
                            style={styles.requestAction}
                            onPress={() =>
                              reviewServerJoinRequest.mutate({
                                requestId: item.referenceId!,
                                status: 'approved',
                              })
                            }
                          >
                            {t('server.approveAccess', '同意')}
                          </Button>
                          <Button
                            disabled={reviewServerJoinRequest.isPending}
                            variant="danger"
                            size="xs"
                            icon={X}
                            containerStyle={styles.requestActionCell}
                            style={styles.requestAction}
                            onPress={() =>
                              reviewServerJoinRequest.mutate({
                                requestId: item.referenceId!,
                                status: 'rejected',
                              })
                            }
                          >
                            {t('server.rejectAccess', '拒绝')}
                          </Button>
                        </ButtonGroup>
                      )}
                      <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                        {formatTimeAgo(item.createdAt, t)}
                      </Text>
                    </View>

                    {!item.isRead && (
                      <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                </CardPressable>
              </Reanimated.View>
            )
          }}
        />
      </View>
    </BackgroundSurface>
  )
}

function formatTimeAgo(dateStr: string, t: (key: string, fallback: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time.justNow', '刚刚')
  if (mins < 60) return `${mins}${t('time.minutesAgo', '分钟前')}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}${t('time.hoursAgo', '小时前')}`
  const days = Math.floor(hours / 24)
  return `${days}${t('time.daysAgo', '天前')}`
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingBottom: 120, paddingTop: spacing.md },
  markAllBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
  markAllInner: {
    width: '100%',
  },
  notifCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  notifContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  notifTitle: {
    fontSize: fontSize.md,
  },
  notifBody: {
    fontSize: fontSize.sm,
    marginTop: 4,
    lineHeight: 20,
  },
  notifTime: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  requestActions: {
    marginTop: spacing.sm,
  },
  requestActionCell: {
    flex: 1,
  },
  requestAction: {
    minHeight: 34,
    width: '100%',
  },
  requestActionText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
})
