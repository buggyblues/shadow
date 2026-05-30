import type { Channel } from '@shadowob/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { FolderOpen, Hash, Home, Megaphone, ShoppingBag, Volume2 } from 'lucide-react-native'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useChannelSort } from '../../hooks/use-channel-sort'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { serverChannelHref } from '../../lib/routes'
import { useChatStore } from '../../stores/chat.store'
import {
  border,
  fontSize,
  iconSize,
  letterSpacing,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'
import { ChannelSortButton } from './channel-sort-button'

interface ServerDetail {
  id: string
  name: string
  slug: string
  description: string | null
  iconUrl: string | null
  isPublic: boolean
  ownerId: string
}

interface ScopedUnread {
  channelUnread: Record<string, number>
  serverUnread: Record<string, number>
}

interface NotificationEvent {
  referenceId?: string | null
  referenceType?: string | null
  scopeChannelId?: string | null
  metadata?: Record<string, unknown> | null
}

const CHANNEL_ICONS = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
}

function metaString(event: NotificationEvent, key: string) {
  const value = event.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNotificationChannelId(event: NotificationEvent) {
  return (
    event.scopeChannelId ??
    metaString(event, 'channelId') ??
    (event.referenceType === 'channel' || event.referenceType === 'channel_invite'
      ? event.referenceId
      : null)
  )
}

export function ChannelSidebar({ serverId, serverSlug }: { serverId: string; serverSlug: string }) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const { sortChannels, updateLastAccessed } = useChannelSort(serverId)
  const scopeReadCooldownRef = useRef<Map<string, number>>(new Map())
  const scopeReadInFlightRef = useRef<Set<string>>(new Set())

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerDetail>(`/api/servers/${serverSlug}`),
  })

  const { data: rawChannels = [] } = useQuery<Channel[]>({
    queryKey: ['server-channels', serverId],
    queryFn: () => fetchApi<Channel[]>(`/api/channels?serverId=${serverId}`),
    enabled: !!serverId,
  })

  const { data: scopedUnread } = useQuery({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
  })

  const requestMarkScopeRead = useCallback(
    async (channelId: string) => {
      const key = `channel:${channelId}`
      const now = Date.now()
      const last = scopeReadCooldownRef.current.get(key) ?? 0
      if (now - last < 1200 || scopeReadInFlightRef.current.has(key)) return

      scopeReadCooldownRef.current.set(key, now)
      scopeReadInFlightRef.current.add(key)
      try {
        await fetchApi('/api/notifications/read-scope', {
          method: 'POST',
          body: JSON.stringify({ channelId }),
        })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
        queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      } finally {
        scopeReadInFlightRef.current.delete(key)
      }
    },
    [queryClient],
  )

  // Apply sorting to channels
  const channels = sortChannels(rawChannels)

  const announcementChannels = channels.filter((c) => c.type === 'announcement')
  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  const handleChannelPress = (channel: Channel) => {
    updateLastAccessed(channel.id)
    setActiveChannel(channel.id)
    void requestMarkScopeRead(channel.id)
    router.push(serverChannelHref(serverSlug, channel.id) as never)
  }

  useEffect(() => {
    if (activeChannelId) {
      void requestMarkScopeRead(activeChannelId)
    }
  }, [activeChannelId, requestMarkScopeRead])

  useSocketEvent<NotificationEvent>('notification:new', (event) => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    const notificationChannelId = getNotificationChannelId(event)
    const currentChannelId = useChatStore.getState().activeChannelId
    if (notificationChannelId && notificationChannelId === currentChannelId) {
      void requestMarkScopeRead(notificationChannelId)
    }
  })

  useSocketEvent<{ channelId?: string }>('message:new', (event) => {
    if (event.channelId && rawChannels.some((channel) => channel.id === event.channelId)) {
      queryClient.invalidateQueries({ queryKey: ['server-channels', serverId] })
    }
  })
  useSocketEvent<{ channelId?: string }>('message:created', (event) => {
    if (event.channelId && rawChannels.some((channel) => channel.id === event.channelId)) {
      queryClient.invalidateQueries({ queryKey: ['server-channels', serverId] })
    }
  })

  const renderChannelGroup = (groupLabel: string, chans: Channel[]) => {
    if (chans.length === 0) return null
    return (
      <View style={styles.group}>
        <Text style={[styles.groupLabel, { color: colors.textMuted }]}>
          {groupLabel.toUpperCase()}
        </Text>
        {chans.map((ch) => {
          const Icon = CHANNEL_ICONS[ch.type] || Hash
          const isActive = activeChannelId === ch.id
          const isUnread = !isActive && (scopedUnread?.channelUnread?.[ch.id] ?? 0) > 0
          return (
            <Pressable
              key={ch.id}
              style={[styles.channelItem, isActive && { backgroundColor: colors.surfaceHover }]}
              onPress={() => handleChannelPress(ch)}
            >
              <Icon size={iconSize.lg} color={isActive ? colors.primary : colors.textMuted} />
              <Text
                style={[
                  styles.channelName,
                  { color: isActive ? colors.primary : colors.textSecondary },
                  isUnread && { color: colors.text, fontWeight: '800' },
                ]}
                numberOfLines={1}
              >
                {ch.name}
              </Text>
              {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.error }]} />}
            </Pressable>
          )
        })}
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.channelSidebar }]}>
      {/* Server header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.serverName, { color: colors.text }]} numberOfLines={1}>
          {server?.name ?? '...'}
        </Text>
        {(scopedUnread?.serverUnread?.[serverId] ?? 0) > 0 && (
          <View style={[styles.headerUnreadDot, { backgroundColor: colors.error }]} />
        )}
        <ChannelSortButton serverId={serverId} />
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {/* Server Home */}
        <Pressable
          style={styles.navItem}
          onPress={() => router.push(`/(main)/servers/${serverSlug}`)}
        >
          <Home size={iconSize.lg} color={colors.textSecondary} />
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>{t('server.home')}</Text>
        </Pressable>

        {/* Shop */}
        <Pressable
          style={styles.navItem}
          onPress={() => router.push(`/(main)/servers/${serverSlug}/shop`)}
        >
          <ShoppingBag size={iconSize.lg} color={colors.textSecondary} />
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>
            {t('docs.shopDoc', { defaultValue: 'Shop' })}
          </Text>
        </Pressable>

        {/* Workspace */}
        <Pressable
          style={styles.navItem}
          onPress={() => router.push(`/(main)/servers/${serverSlug}/workspace`)}
        >
          <FolderOpen size={iconSize.lg} color={colors.textSecondary} />
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>
            {t('docs.workspaceDoc', { defaultValue: 'Workspace' })}
          </Text>
        </Pressable>

        {/* Channels */}
        {renderChannelGroup(t('channel.announcement'), announcementChannels)}
        {renderChannelGroup(t('channel.text'), textChannels)}
        {renderChannelGroup(t('channel.voice'), voiceChannels)}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: size.dropdownMaxHeight,
  },
  header: {
    height: size.plusPanelIcon,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: border.hairline,
  },
  serverName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    flex: 1,
  },
  list: {
    flex: 1,
    padding: spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xxs,
  },
  navLabel: {
    fontSize: fontSize.md,
  },
  group: {
    marginTop: spacing.lg,
  },
  groupLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: letterSpacing.none,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xxs,
  },
  channelName: {
    fontSize: fontSize.md,
    flex: 1,
  },
  unreadDot: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
  },
  headerUnreadDot: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
  },
})
