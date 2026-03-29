import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { ChevronLeft, Hash, Lock, Megaphone, Volume2 } from 'lucide-react-native'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChannelPostingRuleSettings } from '../../../../../../src/components/channel/channel-posting-rule-settings'
import { fetchApi } from '../../../../../../src/lib/api'
import { useAuthStore } from '../../../../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../../../../src/theme'

interface Channel {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  position: number
  isPrivate: boolean
  serverId: string
}

interface Server {
  id: string
  name: string
  ownerId: string
}

export default function ChannelSettingsScreen() {
  const { serverSlug, channelId } = useLocalSearchParams<{
    serverSlug: string
    channelId: string
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const currentUser = useAuthStore((s) => s.user)

  useEffect(() => {
    navigation.setOptions({ headerShown: false })
  }, [navigation])

  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => fetchApi<Channel>(`/api/channels/${channelId}`),
    enabled: !!channelId,
  })

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const isAdmin = server?.ownerId === currentUser?.id

  const ChannelIcon =
    channel?.type === 'voice' ? Volume2 : channel?.type === 'announcement' ? Megaphone : Hash

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerContent}>
          <View style={[styles.channelIcon, { backgroundColor: colors.backgroundSecondary }]}>
            <ChannelIcon size={18} color={colors.text} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {channel?.name ?? t('channel.settings')}
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
      >
        {/* Channel Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('channel.type')}
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {channel?.type === 'text' && t('channel.textChannel')}
              {channel?.type === 'voice' && t('channel.voiceChannel')}
              {channel?.type === 'announcement' && t('channel.announcementChannel')}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('channel.privacy')}
            </Text>
            <View style={styles.privacyValue}>
              {channel?.isPrivate && <Lock size={14} color={colors.text} style={styles.lockIcon} />}
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {channel?.isPrivate ? t('channel.private') : t('channel.public')}
              </Text>
            </View>
          </View>
        </View>

        {/* Posting Rules Section */}
        {channel && server && (
          <ChannelPostingRuleSettings
            channelId={channel.id}
            serverId={server.id}
            isAdmin={isAdmin}
          />
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backButton: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  channelIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    maxWidth: 200,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  infoCard: {
    margin: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: fontSize.base,
  },
  infoValue: {
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  privacyValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIcon: {
    marginRight: spacing.xs,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },
})
