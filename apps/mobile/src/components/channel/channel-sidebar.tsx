import type { Channel } from '@shadowob/shared'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  FolderOpen,
  Hash,
  Home,
  LayoutGrid,
  Megaphone,
  ShoppingBag,
  Volume2,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useChannelSort } from '../../hooks/use-channel-sort'
import { fetchApi } from '../../lib/api'
import { useChatStore } from '../../stores/chat.store'
import { fontSize, radius, spacing, useColors } from '../../theme'
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

const CHANNEL_ICONS = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
}

export function ChannelSidebar({ serverId, serverSlug }: { serverId: string; serverSlug: string }) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const { sortChannels, updateLastAccessed } = useChannelSort(serverId)

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerDetail>(`/api/servers/${serverSlug}`),
  })

  const { data: rawChannels = [] } = useQuery<Channel[]>({
    queryKey: ['server-channels', serverId],
    queryFn: () => fetchApi<Channel[]>(`/api/channels?serverId=${serverId}`),
    enabled: !!serverId,
  })

  // Apply sorting to channels
  const channels = sortChannels(rawChannels)

  const announcementChannels = channels.filter((c) => c.type === 'announcement')
  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  const handleChannelPress = (channel: Channel) => {
    updateLastAccessed(channel.id)
    setActiveChannel(channel.id)
    router.push(`/(main)/servers/${serverSlug}/channels/${channel.id}`)
  }

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
          return (
            <Pressable
              key={ch.id}
              style={[styles.channelItem, isActive && { backgroundColor: `${colors.primary}20` }]}
              onPress={() => handleChannelPress(ch)}
            >
              <Icon size={18} color={isActive ? colors.primary : colors.textMuted} />
              <Text
                style={[
                  styles.channelName,
                  { color: isActive ? colors.primary : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {ch.name}
              </Text>
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
        <ChannelSortButton serverId={serverId} />
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {/* Server Home */}
        <Pressable
          style={styles.navItem}
          onPress={() => router.push(`/(main)/servers/${serverSlug}`)}
        >
          <Home size={18} color={colors.textSecondary} />
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>{t('server.home')}</Text>
        </Pressable>

        {/* Shop */}
        <Pressable
          style={styles.navItem}
          onPress={() => router.push(`/(main)/servers/${serverSlug}/shop`)}
        >
          <ShoppingBag size={18} color={colors.textSecondary} />
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>
            {t('docs.shopDoc', { defaultValue: 'Shop' })}
          </Text>
        </Pressable>

        {/* Workspace */}
        <Pressable
          style={styles.navItem}
          onPress={() => router.push(`/(main)/servers/${serverSlug}/workspace`)}
        >
          <FolderOpen size={18} color={colors.textSecondary} />
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>
            {t('docs.workspaceDoc', { defaultValue: 'Workspace' })}
          </Text>
        </Pressable>

        {/* Apps */}
        <Pressable
          style={styles.navItem}
          onPress={() => router.push(`/(main)/servers/${serverSlug}/apps`)}
        >
          <LayoutGrid size={18} color={colors.textSecondary} />
          <Text style={[styles.navLabel, { color: colors.textSecondary }]}>
            {t('common.bot', { defaultValue: 'Apps' })}
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
    width: 240,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  serverName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
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
    marginBottom: 2,
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
    letterSpacing: 0.5,
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
    marginBottom: 2,
  },
  channelName: {
    fontSize: fontSize.md,
    flex: 1,
  },
})
