import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Flame, Hash, MessageCircle, Search, Server, Users, Zap } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { EmptyState } from '../../src/components/common/empty-state'
import { fetchApi, getImageUrl } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

type FeedItemType = 'server' | 'channel' | 'rental'
type FilterType = 'all' | 'servers' | 'channels' | 'rentals'

interface FeedItem {
  id: string
  type: FeedItemType
  heatScore: number
  data: ServerData | ChannelData | RentalData
}

interface ServerData {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  memberCount: number
  isPublic: boolean
  inviteCode: string
  createdAt: string
}

interface ChannelData {
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
  } | null
}

interface RentalData {
  contractId: string
  contractNo: string
  startedAt: string
  expiresAt: string | null
  listing: {
    id: string
    title: string
    description: string | null
    deviceTier: string | null
    osType: string | null
    hourlyRate: number
    tags: string[] | null
  } | null
  tenant: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  agent: {
    id: string
    name: string
    status: string
    lastHeartbeat: string | null
  } | null
}

interface FeedResponse {
  items: FeedItem[]
  total: number
  hasMore: boolean
}

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

export default function DiscoverScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [isSearching, setIsSearching] = useState(false)

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])

  // 无限滚动加载
  const {
    data: feedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['discover-feed', activeFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetchApi<FeedResponse>(
        `/api/discover/feed?type=${activeFilter}&limit=15&offset=${pageParam}`,
      )
      return res
    },
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.hasMore) return undefined
      return pages.length * 15
    },
    initialPageParam: 0,
  })

  // 搜索
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['discover-search', searchQuery, activeFilter],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return { items: [] }
      const res = await fetchApi<{ items: FeedItem[] }>(
        `/api/discover/search?q=${encodeURIComponent(searchQuery)}&type=${activeFilter}`,
      )
      return res
    },
    enabled: isSearching && searchQuery.length >= 2,
  })

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string }) =>
      fetchApi<{ id: string; slug?: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.push(`/(main)/servers/${data.slug ?? data.id}`)
    },
    onError: (err: { message?: string }) => {
      showToast(err?.message || t('common.error'), 'error')
    },
  })

  const allItems = useMemo(() => {
    if (isSearching) return searchResults?.items || []
    return feedData?.pages.flatMap((page) => page.items) || []
  }, [feedData, searchResults, isSearching])

  const handleSearch = () => {
    if (searchQuery.length >= 2) {
      setIsSearching(true)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setIsSearching(false)
  }

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
    if (days < 7) return t('discover.daysAgo', { count: days })
    return then.toLocaleDateString()
  }

  const getHeatIcon = (score: number) => {
    if (score >= 100) return { icon: Flame, color: '#ef4444' }
    if (score >= 50) return { icon: Zap, color: '#f97316' }
    return null
  }

  const renderItem = ({ item }: { item: FeedItem }) => {
    return (
      <FeedCard
        item={item}
        joinedServerIds={joinedServerIds}
        joinMutation={joinMutation}
        router={router}
        colors={colors}
        t={t}
        formatTimeAgo={formatTimeAgo}
        getHeatIcon={getHeatIcon}
      />
    )
  }

  const renderFooter = () => {
    if (!hasNextPage || isSearching) return null
    return (
      <View style={styles.loadMore}>
        {isFetchingNextPage ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
            {t('discover.loadMore')}
          </Text>
        )}
      </View>
    )
  }

  const onEndReached = () => {
    if (!isSearching && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        {/* Title */}
        <View style={styles.titleRow}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
            <Flame size={20} color="#fff" />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>{t('discover.title')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {t('discover.subtitle')}
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Search size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            placeholder={t('discover.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={clearSearch}>
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>×</Text>
            </Pressable>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          {[
            { key: 'all', label: t('discover.filters.all'), icon: Flame },
            { key: 'servers', label: t('discover.filters.servers'), icon: Server },
            { key: 'channels', label: t('discover.filters.channels'), icon: Hash },
            { key: 'rentals', label: t('discover.filters.rentals'), icon: Zap },
          ].map(({ key, label, icon: Icon }) => (
            <Pressable
              key={key}
              style={[
                styles.filterButton,
                {
                  backgroundColor: activeFilter === key ? colors.primary : colors.background,
                },
              ]}
              onPress={() => {
                setActiveFilter(key as FilterType)
                setIsSearching(false)
              }}
            >
              <Icon size={12} color={activeFilter === key ? '#fff' : colors.textMuted} />
              <Text
                style={{
                  color: activeFilter === key ? '#fff' : colors.textSecondary,
                  fontSize: fontSize.xs,
                  fontWeight: '600',
                  marginLeft: 4,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={isSearching ? '🔍' : '✨'}
          title={isSearching ? t('discover.noSearchResults') : t('discover.emptyTitle')}
        />
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
        />
      )}
    </View>
  )
}

// Feed Card Component
function FeedCard({
  item,
  joinedServerIds,
  joinMutation,
  router,
  colors,
  t,
  formatTimeAgo,
  getHeatIcon,
}: {
  item: FeedItem
  joinedServerIds: Set<string>
  joinMutation: {
    mutate: (variables: { inviteCode: string }) => void
    isPending: boolean
  }
  router: ReturnType<typeof useRouter>
  colors: ReturnType<typeof useColors>
  t: (key: string, options?: Record<string, unknown>) => string
  formatTimeAgo: (date: string) => string
  getHeatIcon: (score: number) => { icon: typeof Flame; color: string } | null
}) {
  const heat = getHeatIcon(item.heatScore)

  if (item.type === 'server') {
    const server = item.data as ServerData
    const isJoined = joinedServerIds.has(server.id)

    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => {
          if (isJoined) {
            router.push(`/(main)/servers/${server.slug ?? server.id}`)
          }
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.serverIconContainer}>
            {server.iconUrl ? (
              <Image
                source={{ uri: getImageUrl(server.iconUrl) || '' }}
                style={styles.serverIcon}
              />
            ) : (
              <View style={[styles.serverIconFallback, { backgroundColor: colors.primary + '20' }]}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary }}>
                  {server.name.charAt(0)}
                </Text>
              </View>
            )}
            {server.isPublic && (
              <View style={styles.publicBadge}>
                <Flame size={10} color="#fff" />
              </View>
            )}
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {server.name}
              </Text>
              {isJoined ? (
                <Pressable
                  style={[styles.actionButton, { backgroundColor: '#22c55e' }]}
                  onPress={() => router.push(`/(main)/servers/${server.slug ?? server.id}`)}
                >
                  <Text style={styles.actionButtonText}>{t('discover.enterButton')}</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                  onPress={() => joinMutation.mutate({ inviteCode: server.inviteCode })}
                  disabled={joinMutation.isPending}
                >
                  <Text style={styles.actionButtonText}>{t('discover.joinButton')}</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Users size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {server.memberCount}
                </Text>
              </View>
              {heat && (
                <View style={styles.metaItem}>
                  <heat.icon size={12} color={heat.color} />
                  <Text style={{ color: heat.color, fontSize: fontSize.xs }}>
                    {t('discover.heat.hot')}
                  </Text>
                </View>
              )}
            </View>

            {server.description && (
              <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
                {server.description}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  if (item.type === 'channel') {
    const channel = item.data as ChannelData
    const isJoined = joinedServerIds.has(channel.server.id)

    return (
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => {
          if (isJoined) {
            router.push(
              `/(main)/servers/${channel.server.slug ?? channel.server.id}/channels/${channel.id}`,
            )
          } else {
            router.push(`/(main)/servers/${channel.server.slug ?? channel.server.id}`)
          }
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.channelIconContainer}>
            {channel.server.iconUrl ? (
              <Image
                source={{ uri: getImageUrl(channel.server.iconUrl) || '' }}
                style={styles.channelIcon}
              />
            ) : (
              <View
                style={[styles.channelIconFallback, { backgroundColor: colors.primary + '20' }]}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
                  {channel.server.name.charAt(0)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardContent}>
            <View style={styles.channelTitleRow}>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                {channel.server.name}
              </Text>
              <Text style={{ color: colors.textMuted }}>/</Text>
              <Hash size={14} color={colors.textMuted} />
              <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>
                {channel.name}
              </Text>
            </View>

            {channel.topic && (
              <Text style={[styles.topic, { color: colors.textSecondary }]} numberOfLines={1}>
                {channel.topic}
              </Text>
            )}

            {channel.lastMessage && (
              <View style={[styles.lastMessageBox, { backgroundColor: colors.background }]}>
                <Text
                  style={[styles.lastMessageText, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {channel.lastMessage.content}
                </Text>
                <Text style={[styles.lastMessageTime, { color: colors.textMuted }]}>
                  {formatTimeAgo(channel.lastMessage.createdAt)}
                </Text>
              </View>
            )}

            <View style={styles.channelFooter}>
              <View style={styles.metaItem}>
                <MessageCircle size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {channel.memberCount}
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
          </View>
        </View>
      </Pressable>
    )
  }

  if (item.type === 'rental') {
    const rental = item.data as RentalData

    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.rentalIconContainer, { backgroundColor: colors.primary + '20' }]}>
            <Text style={{ fontSize: 24 }}>🤖</Text>
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {rental.listing?.title || t('discover.unknownListing')}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                {formatTimeAgo(rental.startedAt)}
              </Text>
            </View>

            <Text style={[styles.agentName, { color: colors.textSecondary }]}>
              {rental.agent?.name || t('discover.unknownAgent')}
            </Text>

            {rental.listing?.description && (
              <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
                {rental.listing.description}
              </Text>
            )}

            <View style={styles.tagsRow}>
              {rental.listing?.deviceTier && (
                <View style={[styles.tag, { backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                    {rental.listing.deviceTier}
                  </Text>
                </View>
              )}
              {rental.listing?.osType && (
                <View style={[styles.tag, { backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                    {rental.listing.osType}
                  </Text>
                </View>
              )}
              {rental.agent?.status && (
                <View
                  style={[
                    styles.tag,
                    {
                      backgroundColor:
                        rental.agent.status === 'online'
                          ? '#22c55e20'
                          : rental.agent.status === 'error'
                            ? '#ef444420'
                            : colors.background,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        rental.agent.status === 'online'
                          ? '#22c55e'
                          : rental.agent.status === 'error'
                            ? '#ef4444'
                            : colors.textSecondary,
                      fontSize: fontSize.xs,
                    }}
                  >
                    {rental.agent.status}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.rentalFooter}>
              <View style={styles.tenantInfo}>
                <View style={[styles.tenantAvatar, { backgroundColor: colors.background }]}>
                  {rental.tenant?.avatarUrl ? (
                    <Image
                      source={{ uri: getImageUrl(rental.tenant.avatarUrl) || '' }}
                      style={{ width: 20, height: 20 }}
                    />
                  ) : (
                    <Text style={{ fontSize: 10 }}>👤</Text>
                  )}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                  {rental.tenant?.displayName ||
                    rental.tenant?.username ||
                    t('discover.unknownUser')}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                {rental.listing?.hourlyRate}虾币/h
              </Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 44,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  loadMore: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  // Card styles
  card: {
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  description: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  // Server styles
  serverIconContainer: {
    position: 'relative',
  },
  serverIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
  },
  serverIconFallback: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publicBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Channel styles
  channelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  channelIcon: {
    width: 48,
    height: 48,
  },
  channelIconFallback: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  channelName: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  topic: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  lastMessageBox: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  lastMessageText: {
    fontSize: fontSize.sm,
  },
  lastMessageTime: {
    fontSize: fontSize.xs,
    marginTop: 4,
  },
  channelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  joinBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  // Rental styles
  rentalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentName: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  rentalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#00000010',
  },
  tenantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tenantAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
