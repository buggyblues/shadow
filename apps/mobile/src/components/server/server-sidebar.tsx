import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Compass, Plus } from 'lucide-react-native'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { radius, spacing, useColors } from '../../theme'
import { Avatar } from '../common/avatar'

interface Server {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
}

interface ServerEntry {
  server: Server
  member: { role: string }
}

interface ScopedUnread {
  channelUnread: Record<string, number>
  serverUnread: Record<string, number>
}

interface DirectChannelEntry {
  id: string
  lastMessageAt: string | null
  createdAt: string
  otherUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  } | null
}

function normalizePresenceStatus(status?: string | null) {
  return status === 'online' || status === 'idle' || status === 'dnd' ? status : 'offline'
}

export function ServerSidebar() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const activeServerId = useChatStore((s) => s.activeServerId)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const setActiveServer = useChatStore((s) => s.setActiveServer)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)

  const { data: serverEntries = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: scopedUnread } = useQuery({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
  })

  const { data: directChannels = [] } = useQuery({
    queryKey: ['direct-channels'],
    queryFn: () => fetchApi<DirectChannelEntry[]>('/api/channels/dm'),
  })

  const servers = useMemo(() => {
    return serverEntries
      .map((entry, index) => ({
        server: entry.server,
        index,
        unreadCount: scopedUnread?.serverUnread?.[entry.server.id] ?? 0,
      }))
      .sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount
        return a.index - b.index
      })
      .map((item) => item.server)
  }, [scopedUnread?.serverUnread, serverEntries])

  const directMessages = useMemo(() => {
    return [...directChannels]
      .filter((channel) => {
        const peer = channel.otherUser
        if (!peer) return false
        return !(peer.isBot && normalizePresenceStatus(peer.status) === 'offline')
      })
      .sort((a, b) => {
        const aUnread = scopedUnread?.channelUnread?.[a.id] ?? 0
        const bUnread = scopedUnread?.channelUnread?.[b.id] ?? 0
        if (aUnread !== bUnread) return bUnread - aUnread
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bTime - aTime
      })
  }, [directChannels, scopedUnread?.channelUnread])

  const markServerRead = async (serverId: string) => {
    await fetchApi('/api/notifications/read-scope', {
      method: 'POST',
      body: JSON.stringify({ serverId }),
    }).finally(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    })
  }

  const markChannelRead = async (channelId: string) => {
    await fetchApi('/api/notifications/read-scope', {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    }).finally(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    })
  }

  const openAddMenu = () => {
    Alert.alert(t('server.add'), undefined, [
      {
        text: t('server.addMenuServer'),
        onPress: () => router.push('/(main)/create-server'),
      },
      {
        text: t('server.addMenuBuddy'),
        onPress: () => router.push('/(main)/buddy-management' as never),
      },
      {
        text: t('server.addMenuDm'),
        onPress: () => router.push('/(main)/friends' as never),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  useSocketEvent('message:new', () => {
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  useSocketEvent('message:created', () => {
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  return (
    <View style={[styles.container, { backgroundColor: colors.serverSidebar }]}>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {servers.map((server) => {
          const isActive = activeServerId === server.id
          const unreadCount = scopedUnread?.serverUnread?.[server.id] ?? 0
          return (
            <Pressable
              key={server.id}
              style={[styles.serverItem, isActive && { backgroundColor: `${colors.primary}30` }]}
              onPress={() => {
                setActiveServer(server.id)
                void markServerRead(server.id)
                router.push(`/(main)/servers/${server.slug ?? server.id}`)
              }}
            >
              <Avatar uri={server.iconUrl} name={server.name} size={44} />
              {isActive && (
                <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />
              )}
              {unreadCount > 0 && (
                <View
                  style={[
                    styles.unreadDot,
                    {
                      backgroundColor: colors.error,
                      borderColor: colors.serverSidebar,
                    },
                  ]}
                />
              )}
            </Pressable>
          )
        })}

        {directMessages.length > 0 && servers.length > 0 && (
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        )}

        {directMessages.map((channel) => {
          const peer = channel.otherUser
          if (!peer) return null
          const isActive = !activeServerId && activeChannelId === channel.id
          const unreadCount = scopedUnread?.channelUnread?.[channel.id] ?? 0
          return (
            <Pressable
              key={channel.id}
              style={[styles.serverItem, isActive && { backgroundColor: `${colors.primary}30` }]}
              onPress={() => {
                setActiveServer(null)
                setActiveChannel(channel.id)
                void markChannelRead(channel.id)
                router.push(`/(main)/dm/${channel.id}` as never)
              }}
            >
              <Avatar
                uri={peer.avatarUrl}
                name={peer.displayName || peer.username}
                size={44}
                userId={peer.id}
                status={normalizePresenceStatus(peer.status)}
                showStatus={true}
              />
              {isActive && (
                <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />
              )}
              {unreadCount > 0 && (
                <View
                  style={[
                    styles.dmUnreadDot,
                    {
                      backgroundColor: colors.error,
                      borderColor: colors.serverSidebar,
                    },
                  ]}
                />
              )}
            </Pressable>
          )
        })}

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Create server */}
        <Pressable
          style={[styles.actionItem, { backgroundColor: colors.surface }]}
          onPress={openAddMenu}
        >
          <Plus size={22} color={colors.success} />
        </Pressable>

        {/* Discover */}
        <Pressable
          style={[styles.actionItem, { backgroundColor: colors.surface }]}
          onPress={() => router.push('/(main)/discover')}
        >
          <Compass size={22} color={colors.primary} />
        </Pressable>
      </ScrollView>

      {/* User avatar at bottom */}
      <Pressable style={styles.userSection} onPress={() => router.push('/(main)/settings')}>
        <Avatar
          uri={user?.avatarUrl}
          name={user?.displayName || user?.username || '?'}
          size={36}
          userId={user?.id}
        />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 68,
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  list: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  serverItem: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    left: -8,
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  unreadDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  dmUnreadDot: {
    position: 'absolute',
    right: -1,
    top: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  divider: {
    height: 2,
    width: 32,
    alignSelf: 'center',
    borderRadius: 1,
    marginVertical: spacing.sm,
  },
  actionItem: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  userSection: {
    paddingVertical: spacing.md,
  },
})
