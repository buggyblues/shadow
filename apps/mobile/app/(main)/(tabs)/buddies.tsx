import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  Clock,
  Eye,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { OnlineRank } from '../../../src/components/common/online-rank'
import { fetchApi } from '../../../src/lib/api'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

interface ListingOwner {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

interface Listing {
  id: string
  ownerId: string
  agentId: string | null
  title: string
  description: string | null
  skills: string[]
  deviceTier: 'high_end' | 'mid_range' | 'low_end'
  osType: 'macos' | 'windows' | 'linux'
  deviceInfo: Record<string, string>
  softwareTools: string[]
  hourlyRate: number
  dailyRate: number
  monthlyRate: number
  premiumMarkup: number
  depositAmount: number
  viewCount: number
  rentalCount: number
  tags: string[]
  createdAt: string
  totalOnlineSeconds: number
  owner: ListingOwner | null
}

const DEVICE_TIER_INFO: Record<string, { label: string; color: string }> = {
  high_end: { label: '高端', color: '#F59E0B' },
  mid_range: { label: '中端', color: '#06B6D4' },
  low_end: { label: '入门', color: '#9CA3AF' },
}

const OS_LABELS: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

const SORT_OPTIONS = [
  { value: 'popular', label: '热门' },
  { value: 'newest', label: '最新' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'price-desc', label: '价格从高到低' },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]['value']

export default function BuddiesScreen() {
  const colors = useColors()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [deviceTier, setDeviceTier] = useState<string | null>(null)
  const [osType, setOsType] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortValue>('popular')
  const [showFilters, setShowFilters] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['marketplace', 'listings', search, deviceTier, osType, sortBy],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('keyword', search)
      if (deviceTier) params.set('deviceTier', deviceTier)
      if (osType) params.set('osType', osType)
      params.set('sortBy', sortBy)
      params.set('limit', '40')
      return fetchApi<{ listings: Listing[]; total: number }>(`/api/marketplace/listings?${params}`)
    },
    staleTime: 30_000,
  })

  const listings = data?.listings ?? []
  const total = data?.total ?? 0

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const currentSortLabel = useMemo(
    () => SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '热门',
    [sortBy],
  )

  const formatOnlineTime = useCallback((seconds: number) => {
    if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
    const hours = Math.floor(seconds / 3600)
    if (hours < 24) return `${hours}小时`
    const days = Math.floor(hours / 24)
    return `${days}天${hours % 24}小时`
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => {
      const tierInfo = DEVICE_TIER_INFO[item.deviceTier] ?? DEVICE_TIER_INFO.mid_range!
      const ownerName = item.owner?.displayName || item.owner?.username || '?'

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: pressed ? colors.surfaceHover : colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={() => router.push(`/(main)/buddy-detail/${item.id}` as never)}
        >
          {/* Top row: Avatar + title + tier badge */}
          <View style={styles.cardTopRow}>
            <Avatar
              uri={item.owner?.avatarUrl}
              name={ownerName}
              size={40}
              userId={item.owner?.id || item.ownerId}
            />
            <View style={styles.cardTitleCol}>
              <View style={styles.titleRow}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={[styles.tierBadge, { backgroundColor: `${tierInfo.color}20` }]}>
                  <Text style={[styles.tierBadgeText, { color: tierInfo.color }]}>
                    {tierInfo.label}
                  </Text>
                </View>
              </View>
              <Text style={[styles.ownerName, { color: colors.textMuted }]} numberOfLines={1}>
                {ownerName} · {OS_LABELS[item.osType] ?? item.osType}
              </Text>
            </View>
          </View>

          {/* Description */}
          {item.description && (
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {/* Skills */}
          {item.skills.length > 0 && (
            <View style={styles.skills}>
              {item.skills.slice(0, 4).map((skill) => (
                <View
                  key={skill}
                  style={[styles.skillTag, { backgroundColor: `${colors.primary}12` }]}
                >
                  <Text style={[styles.skillText, { color: colors.primary }]}>{skill}</Text>
                </View>
              ))}
              {item.skills.length > 4 && (
                <Text style={[styles.skillMore, { color: colors.textMuted }]}>
                  +{item.skills.length - 4}
                </Text>
              )}
            </View>
          )}

          {/* Footer: Price + Stats */}
          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceValue, { color: '#D97706' }]}>¥{item.hourlyRate}</Text>
              <Text style={[styles.priceUnit, { color: colors.textMuted }]}>/小时</Text>
            </View>
            <View style={styles.statsRow}>
              <OnlineRank totalSeconds={item.totalOnlineSeconds} />
              <Clock size={11} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>
                {formatOnlineTime(item.totalOnlineSeconds)}
              </Text>
              <Eye size={11} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>{item.viewCount}</Text>
              <Users size={11} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>{item.rentalCount}</Text>
            </View>
          </View>
        </Pressable>
      )
    },
    [colors, router, formatOnlineTime],
  )

  if (isLoading && !refreshing) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Bar */}
      <View style={[styles.searchSection, { backgroundColor: colors.surface }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="搜索 Buddy..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <X size={14} color={colors.textMuted} />
            </Pressable>
          )}
          <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={() => setShowFilters(!showFilters)}
            hitSlop={8}
            style={[styles.filterToggle, showFilters && { backgroundColor: `${colors.primary}15` }]}
          >
            <SlidersHorizontal size={16} color={showFilters ? colors.primary : colors.textMuted} />
          </Pressable>
        </View>

        {/* Filters panel */}
        {showFilters && (
          <View style={styles.filtersPanel}>
            <Text style={[styles.filterLabel, { color: colors.textMuted }]}>设备等级</Text>
            <View style={styles.filterChips}>
              {Object.entries(DEVICE_TIER_INFO).map(([key, { label, color }]) => (
                <Pressable
                  key={key}
                  onPress={() => setDeviceTier(deviceTier === key ? null : key)}
                  style={[
                    styles.chip,
                    {
                      borderColor: deviceTier === key ? color : colors.border,
                      backgroundColor: deviceTier === key ? `${color}12` : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: deviceTier === key ? color : colors.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.filterLabel, { color: colors.textMuted, marginTop: spacing.md }]}>
              操作系统
            </Text>
            <View style={styles.filterChips}>
              {Object.entries(OS_LABELS).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setOsType(osType === key ? null : key)}
                  style={[
                    styles.chip,
                    {
                      borderColor: osType === key ? colors.primary : colors.border,
                      backgroundColor: osType === key ? `${colors.primary}12` : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: osType === key ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Toolbar: total count + sort */}
      <View style={styles.toolbar}>
        <Text style={[styles.resultCount, { color: colors.textMuted }]}>共 {total} 个 Buddy</Text>
        <Pressable
          style={[styles.sortBtn, { borderColor: colors.border }]}
          onPress={() => setShowSort(true)}
        >
          {sortBy === 'price-asc' ? (
            <ArrowUpAZ size={14} color={colors.textSecondary} />
          ) : sortBy === 'price-desc' ? (
            <ArrowDownAZ size={14} color={colors.textSecondary} />
          ) : null}
          <Text style={[styles.sortBtnText, { color: colors.textSecondary }]}>
            {currentSortLabel}
          </Text>
          <ChevronDown size={12} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Sort options modal */}
      <Modal
        visible={showSort}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSort(false)}
      >
        <Pressable style={styles.sortOverlay} onPress={() => setShowSort(false)}>
          <View style={[styles.sortSheet, { backgroundColor: colors.surface }]}>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.sortOption,
                  sortBy === opt.value && { backgroundColor: `${colors.primary}12` },
                ]}
                onPress={() => {
                  setSortBy(opt.value)
                  setShowSort(false)
                }}
              >
                <Text
                  style={[
                    styles.sortOptionText,
                    { color: sortBy === opt.value ? colors.primary : colors.text },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Listing list */}
      {listings.length === 0 && !isLoading ? (
        <EmptyState icon="🔍" title="暂无 Buddy 列表" />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textMuted}
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Search
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 38,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: 0,
  },
  filterDivider: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
  },
  filterToggle: {
    padding: 4,
    borderRadius: radius.sm,
  },

  // Filters
  filtersPanel: {
    paddingTop: spacing.md,
  },
  filterLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  resultCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  sortBtnText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Sort modal
  sortOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sortSheet: {
    width: 220,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  sortOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sortOptionText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // List
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 100,
  },

  // Card
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitleCol: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  tierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ownerName: {
    fontSize: fontSize.xs,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  skills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.sm,
  },
  skillTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  skillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  skillMore: {
    fontSize: 10,
    fontWeight: '700',
    alignSelf: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  priceUnit: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 10,
    fontWeight: '600',
    marginRight: 4,
  },
})
