import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Globe, Hash, Search, Shield, Zap } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { EmptyState } from '../../src/components/common/empty-state'
import { LoadingScreen } from '../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

type TabType = 'servers' | 'channels' | 'explore'

interface DiscoverServer {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl?: string | null
  isPublic: boolean
  inviteCode: string
  memberCount: number
}

interface DiscoverChannel {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
  }
  memberCount: number
  lastMessage: {
    content: string
    createdAt: string
    authorId: string
  } | null
}

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

interface JoinServerResponse {
  id: string
  slug?: string | null
}

interface ApiError {
  status?: number
  message?: string
}

export default function DiscoverScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('servers')
  const [search, setSearch] = useState('')

  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['discover-servers'],
    queryFn: () => fetchApi<DiscoverServer[]>('/api/servers/discover'),
  })

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['discover-channels'],
    queryFn: () => fetchApi<DiscoverChannel[]>('/api/discover/channels'),
    enabled: activeTab === 'channels',
  })

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string; serverId: string }) =>
      fetchApi<JoinServerResponse>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.push(`/(main)/servers/${data.slug ?? data.id}`)
    },
    onError: (err: ApiError, variables) => {
      if (err?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['servers'] })
        const srv = servers.find((s) => s.id === variables.serverId)
        router.push(`/(main)/servers/${srv?.slug ?? variables.serverId}`)
      } else {
        showToast(err?.message || t('common.error'), 'error')
      }
    },
  })

  const filteredServers = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()),
  )

  const filteredChannels = channels.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.topic?.toLowerCase().includes(search.toLowerCase()) ||
      c.server.name.toLowerCase().includes(search.toLowerCase()),
  )

  const isLoading =
    (activeTab === 'servers' && serversLoading) || (activeTab === 'channels' && channelsLoading)

  const formatTimeAgo = (date: string) => {
    const now = new Date()
    const then = new Date(date)
    const diff = now.getTime() - then.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return t('discover.justNow')
    if (minutes < 60) return t('discover.minutesAgo', { count: minutes })
    if (hours < 24) return t('discover.hoursAgo', { count: hours })
    return t('discover.daysAgo', { count: days })
  }

  const TabButton = ({
    tab,
    icon: Icon,
    label,
  }: {
    tab: TabType
    icon: typeof Globe
    label: string
  }) => (
    <Pressable
      style={[
        styles.tabButton,
        {
          backgroundColor: activeTab === tab ? colors.primary : colors.surface,
        },
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <Icon size={16} color={activeTab === tab ? '#fff' : colors.textMuted} />
      <Text style={[styles.tabText, { color: activeTab === tab ? '#fff' : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  )

  if (isLoading) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerContent}>
          <View style={styles.titleRow}>
            <Globe size={24} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>{t('discover.title')}</Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('discover.subtitle')}
          </Text>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabsContent}
        >
          <TabButton tab="servers" icon={Globe} label={t('discover.tabs.servers')} />
          <TabButton tab="channels" icon={Hash} label={t('discover.tabs.channels')} />
          <TabButton tab="explore" icon={Zap} label={t('discover.tabs.explore')} />
        </ScrollView>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Search size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t('discover.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      {/* Content */}
      {activeTab === 'servers' ? (
        <ServersTab
          servers={filteredServers}
          joinedServerIds={joinedServerIds}
          joinMutation={joinMutation}
          router={router}
          colors={colors}
          t={t}
        />
      ) : activeTab === 'channels' ? (
        <ChannelsTab
          channels={filteredChannels}
          joinedServerIds={joinedServerIds}
          router={router}
          colors={colors}
          t={t}
          formatTimeAgo={formatTimeAgo}
        />
      ) : (
        <ExploreTab colors={colors} t={t} />
      )}
    </View>
  )
}

// Servers Tab Component
function ServersTab({
  servers,
  joinedServerIds,
  joinMutation,
  router,
  colors,
  t,
}: {
  servers: DiscoverServer[]
  joinedServerIds: Set<string>
  joinMutation: ReturnType<typeof useMutation>
  router: ReturnType<typeof useRouter>
  colors: ReturnType<typeof useColors>
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (servers.length === 0) {
    return <EmptyState icon="🔍" title={t('discover.noServers')} />
  }

  return (
    <FlatList
      data={servers}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const isJoined = joinedServerIds.has(item.id)
        return (
          <Pressable
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={() => {
              if (isJoined) {
                router.push(`/(main)/servers/${item.slug ?? item.id}`)
              }
            }}
          >
            <View style={[styles.banner, { backgroundColor: `${colors.primary}20` }]}>
              {item.bannerUrl && (
                <Image
                  source={{ uri: getImageUrl(item.bannerUrl) || '' }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              )}
              {item.isPublic && (
                <View style={styles.publicBadge}>
                  <Shield size={10} color="#fff" />
                  <Text style={styles.publicText}>{t('discover.public')}</Text>
                </View>
              )}
            </View>

            <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
              {item.iconUrl ? (
                <Image
                  source={{ uri: getImageUrl(item.iconUrl) || '' }}
                  style={styles.icon}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.iconFallback}>{item.name.charAt(0)}</Text>
              )}
            </View>

            <View style={styles.cardBody}>
              <Text style={[styles.serverName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.desc, { color: colors.textSecondary }]} numberOfLines={2}>
                {item.description ?? t('discover.noDescription')}
              </Text>

              <View style={styles.cardFooter}>
                <View style={styles.memberInfo}>
                  <View style={[styles.onlineDot, { backgroundColor: '#23a559' }]} />
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                    {item.memberCount} {t('discover.members')}
                  </Text>
                </View>

                {isJoined ? (
                  <Pressable
                    style={[styles.joinBtn, { backgroundColor: '#23a559' }]}
                    onPress={() => router.push(`/(main)/servers/${item.slug ?? item.id}`)}
                  >
                    <Text style={styles.joinBtnText}>{t('discover.enterButton')}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      if (item.inviteCode) {
                        joinMutation.mutate({ inviteCode: item.inviteCode, serverId: item.id })
                      }
                    }}
                    disabled={joinMutation.isPending}
                  >
                    <Text style={styles.joinBtnText}>{t('discover.joinButton')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Pressable>
        )
      }}
    />
  )
}

// Channels Tab Component
function ChannelsTab({
  channels,
  joinedServerIds,
  router,
  colors,
  t,
  formatTimeAgo,
}: {
  channels: DiscoverChannel[]
  joinedServerIds: Set<string>
  router: ReturnType<typeof useRouter>
  colors: ReturnType<typeof useColors>
  t: (key: string, options?: Record<string, unknown>) => string
  formatTimeAgo: (date: string) => string
}) {
  if (channels.length === 0) {
    return <EmptyState icon="#️⃣" title={t('discover.noChannels')} />
  }

  return (
    <FlatList
      data={channels}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const isJoined = joinedServerIds.has(item.server.id)
        return (
          <Pressable
            style={[styles.channelCard, { backgroundColor: colors.surface }]}
            onPress={() => {
              if (isJoined) {
                router.push(
                  `/(main)/servers/${item.server.slug ?? item.server.id}/channels/${item.id}`,
                )
              } else {
                router.push(`/(main)/servers/${item.server.slug ?? item.server.id}`)
              }
            }}
          >
            <View style={styles.channelHeader}>
              <View style={styles.serverIcon}>
                {item.server.iconUrl ? (
                  <Image
                    source={{ uri: getImageUrl(item.server.iconUrl) || '' }}
                    style={styles.serverIconImage}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.serverIconFallback}>{item.server.name.charAt(0)}</Text>
                )}
              </View>
              <View style={styles.channelInfo}>
                <View style={styles.channelNameRow}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>#</Text>
                  <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Text
                  style={[styles.serverNameSmall, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.server.name}
                </Text>
              </View>
            </View>

            {item.topic && (
              <Text
                style={[styles.channelTopic, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {item.topic}
              </Text>
            )}

            {item.lastMessage && (
              <View style={[styles.lastMessageBox, { backgroundColor: colors.background }]}>
                <Text
                  style={[styles.lastMessageText, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {item.lastMessage.content}
                </Text>
                <Text style={[styles.lastMessageTime, { color: colors.textMuted }]}>
                  {formatTimeAgo(item.lastMessage.createdAt)}
                </Text>
              </View>
            )}

            <View style={styles.channelFooter}>
              <View style={styles.memberCount}>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {item.memberCount} {t('discover.members')}
                </Text>
              </View>
              {!isJoined && (
                <View style={[styles.joinBadge, { backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                    {t('discover.joinToView')}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        )
      }}
    />
  )
}

// Explore Tab Component (placeholder)
function ExploreTab({
  colors,
  t,
}: {
  colors: ReturnType<typeof useColors>
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <View style={[styles.exploreContainer, { backgroundColor: colors.background }]}>
      <EmptyState icon="✨" title={t('discover.exploreComingSoon')} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  headerContent: {
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  tabsContainer: {
    marginBottom: spacing.md,
  },
  tabsContent: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
  },
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  exploreContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  banner: {
    height: 100,
  },
  publicBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
  },
  publicText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  iconWrap: {
    position: 'absolute',
    top: 74,
    left: 12,
    width: 52,
    height: 52,
    borderRadius: 14,
    padding: 3,
    zIndex: 10,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 11,
  },
  iconFallback: {
    width: 46,
    height: 46,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 46,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#5865F2',
    overflow: 'hidden',
  },
  cardBody: {
    paddingTop: 32,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  serverName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  desc: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    minHeight: 36,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  joinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  joinBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  // Channel styles
  channelCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  serverIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#5865F220',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverIconImage: {
    width: 48,
    height: 48,
  },
  serverIconFallback: {
    fontSize: 20,
    fontWeight: '700',
    color: '#5865F2',
  },
  channelInfo: {
    flex: 1,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  channelName: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  serverNameSmall: {
    fontSize: fontSize.sm,
  },
  channelTopic: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  lastMessageBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  lastMessageText: {
    fontSize: fontSize.sm,
    marginBottom: 4,
  },
  lastMessageTime: {
    fontSize: fontSize.xs,
  },
  channelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#00000010',
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  joinBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
})
