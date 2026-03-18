import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { AtSign, Bell, CheckCheck, MessageCircle, User } from 'lucide-react-native'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Animated,
  FlatList,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import Reanimated, { FadeInUp } from 'react-native-reanimated'
import { DottedBackground } from '../../src/components/common/dotted-background'
import { EmptyState } from '../../src/components/common/empty-state'
import { LoadingScreen } from '../../src/components/common/loading-screen'
import { useSocketEvent } from '../../src/hooks/use-socket'
import { fetchApi } from '../../src/lib/api'
import { fontSize, spacing, useColors } from '../../src/theme'

function SquishyCard({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode
  onPress: () => void
  style?: StyleProp<ViewStyle>
}) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

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
    <DottedBackground>
      <View style={[styles.container]}>
        {/* Mark all read header */}
        {unreadCount > 0 && (
          <Pressable
            style={[
              styles.markAllBtn,
              { backgroundColor: `${colors.primary}15`, borderColor: colors.primary },
            ]}
            onPress={() => markAllRead.mutate()}
          >
            <CheckCheck size={18} color={colors.primary} strokeWidth={2.5} />
            <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: '800' }}>
              {t('notification.markAllRead', '全部标为已读')}
            </Text>
          </Pressable>
        )}

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="📭"
              title={t('notification.empty', '暂无通知')}
              description="还没有收到任何新消息哦~"
            />
          }
          renderItem={({ item, index }) => (
            <Reanimated.View entering={FadeInUp.delay(index * 40).springify()}>
              <SquishyCard
                style={[
                  styles.notifCard,
                  {
                    backgroundColor: item.isRead ? `${colors.surface}E6` : `${colors.primary}12`,
                    borderColor: item.isRead ? colors.border : colors.primary,
                  },
                ]}
                onPress={() => handlePress(item)}
              >
                <View style={styles.notifContent}>
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

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.notifTitle,
                        { color: colors.text, fontWeight: item.isRead ? '600' : '800' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {item.body && (
                      <Text
                        style={[styles.notifBody, { color: colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {item.body}
                      </Text>
                    )}
                    <Text style={[styles.notifTime, { color: colors.textMuted }]}>
                      {formatTimeAgo(item.createdAt, t)}
                    </Text>
                  </View>

                  {!item.isRead && (
                    <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                  )}
                </View>
              </SquishyCard>
            </Reanimated.View>
          )}
        />
      </View>
    </DottedBackground>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: 24,
    borderWidth: 2,
  },
  notifCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 24,
    borderWidth: 2,
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
})
