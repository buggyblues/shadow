import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { AtSign, Bell, Check, CheckCheck, Inbox, MessageCircle, User, X } from 'lucide-react-native'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeInUp } from 'react-native-reanimated'
import { Avatar } from '../../src/components/common/avatar'
import { EmptyState } from '../../src/components/common/empty-state'
import { LoadingScreen } from '../../src/components/common/loading-screen'
import {
  BackgroundSurface,
  Button,
  ButtonGroup,
  IconButton,
  MobileNavigationBar,
  SurfaceList,
  SurfaceListItem,
} from '../../src/components/ui'
import { useSocketEvent } from '../../src/hooks/use-socket'
import { fetchApi } from '../../src/lib/api'
import { serverChannelHref } from '../../src/lib/routes'
import { showToast } from '../../src/lib/toast'
import { useChatStore } from '../../src/stores/chat.store'
import { fontSize, iconSize, lineHeight, radius, size, spacing, useColors } from '../../src/theme'

interface Notification {
  id: string
  userId: string
  type: 'mention' | 'reply' | 'dm' | 'system'
  kind?: string | null
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  senderId: string | null
  senderAvatarUrl: string | null
  metadata?: Record<string, unknown> | null
  aggregatedCount?: number | null
  isRead: boolean
  createdAt: string
}

function metaString(n: Notification, key: string) {
  const value = n.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNotificationChannelId(n: Notification) {
  return (
    n.scopeChannelId ??
    metaString(n, 'channelId') ??
    (n.referenceType === 'channel' || n.referenceType === 'channel_invite' ? n.referenceId : null)
  )
}

function getNotificationServerId(n: Notification) {
  return (
    n.scopeServerId ??
    metaString(n, 'serverId') ??
    (n.referenceType === 'server_join' || n.referenceType === 'server_invite'
      ? n.referenceId
      : null)
  )
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
  const appName = text(metadata.appName, 'App')
  const commandTitle = text(metadata.commandTitle, text(metadata.commandName, 'command'))
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
    case 'server_app.command_approval_requested':
      return {
        title: t('notification.serverAppCommandApprovalRequested', { appName }),
        body: t('notification.serverAppCommandApprovalRequestedBody', {
          commandTitle,
          serverName,
        }),
      }
    case 'server_app.command_approval_granted':
      return {
        title: t('notification.serverAppCommandApprovalGranted', { appName }),
        body: t('notification.serverAppCommandApprovalGrantedBody', {
          commandTitle,
          serverName,
        }),
      }
    default:
      return { title: n.title, body: n.body ?? '' }
  }
}

function getServerAppApprovalAction(n: Notification) {
  if (n.referenceType !== 'server_app_command_approval') return null
  const serverId = getNotificationServerId(n)
  const appKey = metaString(n, 'appKey')
  const commandName = metaString(n, 'commandName')
  if (!serverId || !appKey || !commandName) return null
  return {
    notificationId: n.id,
    serverId,
    appKey,
    commandName,
    buddyAgentId: metaString(n, 'buddyAgentId') ?? undefined,
    remember: metaString(n, 'approvalMode') !== 'every_time',
  }
}

export default function NotificationsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchApi<Notification[]>('/api/notifications?limit=50'),
  })

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
  })

  const markRead = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    },
  })

  const markAllRead = useMutation({
    mutationFn: () => fetchApi('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
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
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
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
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    },
  })

  const approveServerAppCommand = useMutation({
    mutationFn: (input: NonNullable<ReturnType<typeof getServerAppApprovalAction>>) =>
      fetchApi(`/api/servers/${input.serverId}/apps/${input.appKey}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          commandName: input.commandName,
          buddyAgentId: input.buddyAgentId,
          remember: input.remember,
        }),
      }).then(() =>
        fetchApi(`/api/notifications/${input.notificationId}/read`, { method: 'PATCH' }),
      ),
    onSuccess: () => {
      showToast(t('serverApps.commandApprovalSuccess'), 'success')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : t('serverApps.commandApprovalFailed'),
        'error',
      )
    },
  })

  const handlePress = useCallback(
    async (n: Notification) => {
      if (!n.isRead) markRead.mutate(n.id)

      const navigateToChannel = async (targetChannelId: string, messageId?: string | null) => {
        const channel = await fetchApi<{ id: string; serverId: string | null; kind?: string }>(
          `/api/channels/${targetChannelId}`,
        )
        if (channel.kind === 'dm' || !channel.serverId) {
          router.push(`/(main)/dm/${channel.id}${messageId ? `?msg=${messageId}` : ''}` as never)
          return
        }
        const server = await fetchApi<{ id: string; slug: string }>(
          `/api/servers/${channel.serverId}`,
        )
        router.push(
          serverChannelHref(server.slug ?? channel.serverId, channel.id, { messageId }) as never,
        )
      }

      const navigateToServer = async (serverId: string) => {
        const server = await fetchApi<{ id: string; slug: string }>(`/api/servers/${serverId}`)
        setActiveServer(server.id)
        router.push('/(main)' as never)
      }

      if (n.referenceType === 'message' && n.referenceId) {
        try {
          const message = await fetchApi<{ id: string; channelId: string }>(
            `/api/messages/${n.referenceId}`,
          )
          await navigateToChannel(message.channelId, message.id)
        } catch {}
        return
      }

      if (n.referenceType === 'server_app' || n.referenceType === 'server_app_command_approval') {
        const serverId = getNotificationServerId(n)
        if (serverId) {
          try {
            await navigateToServer(serverId)
          } catch {}
        }
        return
      }

      const channelId = getNotificationChannelId(n)
      if (channelId) {
        try {
          await navigateToChannel(channelId)
        } catch {}
        return
      }

      const serverId = getNotificationServerId(n)
      if (serverId) {
        try {
          await navigateToServer(serverId)
        } catch {}
      }
    },
    [router, markRead],
  )

  const unreadCount = notifications.filter((n) => !n.isRead).length

  if (isLoading) return <LoadingScreen />

  const getNotifIcon = (type: string, color: string) => {
    switch (type) {
      case 'mention':
        return <AtSign size={iconSize['2xl']} color={color} strokeWidth={2.5} />
      case 'reply':
        return <MessageCircle size={iconSize['2xl']} color={color} strokeWidth={2.5} />
      case 'dm':
        return <User size={iconSize['2xl']} color={color} strokeWidth={2.5} />
      default:
        return <Bell size={iconSize['2xl']} color={color} strokeWidth={2.5} />
    }
  }

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={t('settings.tabNotification')}
        right={
          unreadCount > 0 ? (
            <IconButton
              icon={CheckCheck}
              variant="glass"
              size="icon"
              onPress={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
              accessibilityLabel={t('notification.markAllRead', '全部标为已读')}
            />
          ) : null
        }
      />
      <View style={[styles.container]}>
        {notifications.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('notification.empty', '暂无通知')}
            description={t('notification.emptyDesc', '还没有收到任何新消息')}
          />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            <SurfaceList style={styles.notificationList}>
              {notifications.map((item, index) => {
                const display = getNotificationDisplay(item, t)
                const serverAppApprovalAction = getServerAppApprovalAction(item)
                return (
                  <Reanimated.View key={item.id} entering={FadeInUp.delay(index * 40).springify()}>
                    <SurfaceListItem
                      last={index === notifications.length - 1}
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
                                  : colors.surfaceHover,
                              },
                            ]}
                          >
                            {getNotifIcon(
                              item.type,
                              item.isRead ? colors.textMuted : colors.primary,
                            )}
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
                          {serverAppApprovalAction && !item.isRead && (
                            <ButtonGroup style={styles.requestActions}>
                              <Button
                                disabled={approveServerAppCommand.isPending}
                                variant="glass"
                                size="xs"
                                icon={Check}
                                iconColor={colors.success}
                                textStyle={[styles.requestActionText, { color: colors.success }]}
                                containerStyle={styles.requestActionCell}
                                style={styles.requestAction}
                                onPress={() =>
                                  approveServerAppCommand.mutate(serverAppApprovalAction)
                                }
                              >
                                {t('serverApps.commandApprovalConfirm')}
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
                    </SurfaceListItem>
                  </Reanimated.View>
                )
              })}
            </SurfaceList>
          </ScrollView>
        )}
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
  list: {
    paddingBottom: size.tabBar + spacing['6xl'],
    paddingTop: spacing.none,
  },
  notificationList: {
    marginBottom: spacing.sm,
  },
  notifCard: {
    minHeight: size.navSide,
  },
  notifContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconBubble: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: size.dotLg,
    height: size.dotLg,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  notifTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  notifBody: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    lineHeight: lineHeight.sm,
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
    minHeight: size.iconBubble,
    width: '100%',
  },
  requestActionText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
})
