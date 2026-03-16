import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { CheckCheck } from 'lucide-react-native'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { LoadingScreen } from '../../src/components/common/loading-screen'
import { useSocketEvent } from '../../src/hooks/use-socket'
import { fetchApi } from '../../src/lib/api'
import { fontSize, spacing, useColors } from '../../src/theme'

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

  const handlePress = useCallback(
    async (n: Notification) => {
      if (!n.isRead) markRead.mutate(n.id)

      if (n.referenceType === 'message' && n.referenceId) {
        try {
          const message = await fetchApi<{ id: string; channelId: string }>(
            `/api/messages/${n.referenceId}`,
          )
          const channel = await fetchApi<{ id: string; serverId: string }>(
            `/api/channels/${message.channelId}`,
          )
          const server = await fetchApi<{ id: string; slug: string }>(
            `/api/servers/${channel.serverId}`,
          )
          router.push(
            `/(main)/servers/${server.slug ?? channel.serverId}/channels/${message.channelId}` as never,
          )
        } catch {}
      } else if (n.referenceType === 'channel_invite' && n.referenceId) {
        try {
          const channel = await fetchApi<{ id: string; serverId: string }>(
            `/api/channels/${n.referenceId}`,
          )
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
    [router, markRead],
  )

  const unreadCount = notifications.filter((n) => !n.isRead).length

  if (isLoading) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Mark all read header */}
      {unreadCount > 0 && (
        <Pressable
          style={[styles.markAllBtn, { borderBottomColor: colors.border }]}
          onPress={() => markAllRead.mutate()}
        >
          <CheckCheck size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>
            {t('notification.markAllRead', '全部标为已读')}
          </Text>
        </Pressable>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>
              {t('notification.empty', '暂无通知')}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.notifRow,
              {
                backgroundColor: item.isRead ? colors.background : `${colors.primary}08`,
                borderBottomColor: colors.border,
              },
            ]}
            onPress={() => handlePress(item)}
          >
            <View style={styles.notifContent}>
              {!item.isRead && (
                <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.notifTitle,
                    { color: colors.text, fontWeight: item.isRead ? '500' : '700' },
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                {item.body && (
                  <Text style={[styles.notifBody, { color: colors.textMuted }]} numberOfLines={2}>
                    {item.body}
                  </Text>
                )}
                <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                  {formatTimeAgo(item.createdAt, t)}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
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
  list: { paddingBottom: spacing.xl },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  notifRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notifContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  notifTitle: {
    fontSize: fontSize.md,
  },
  notifBody: {
    fontSize: fontSize.sm,
    marginTop: 2,
    lineHeight: 18,
  },
  notifTime: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
})
