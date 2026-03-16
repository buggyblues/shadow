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
} from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

const DEVICE_TIER_INFO: Record<string, { labelKey: string; color: string }> = {
  high_end: { labelKey: 'marketplace.deviceHighEnd', color: '#F59E0B' },
  mid_range: { labelKey: 'marketplace.deviceMidRange', color: '#06B6D4' },
  low_end: { labelKey: 'marketplace.deviceLowEnd', color: '#9CA3AF' },
}

const OS_LABELS: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

const SORT_OPTIONS = [
  { value: 'popular', labelKey: 'marketplace.popular' },
  { value: 'newest', labelKey: 'marketplace.newest' },
  { value: 'price-asc', labelKey: 'marketplace.priceAsc' },
  { value: 'price-desc', labelKey: 'marketplace.priceDesc' },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]['value']

export default function BuddiesScreen() {
  const { t } = useTranslation()
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
    () => t(SORT_OPTIONS.find((o) => o.value === sortBy)?.labelKey ?? 'marketplace.popular'),
    [sortBy, t],
  )

  const formatOnlineTime = useCallback((seconds: number) => {
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    const hours = Math.floor(seconds / 3600)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => {
      const tierInfo = DEVICE_TIER_INFO[item.deviceTier] ?? DEVICE_TIER_INFO.mid_range!
      const ownerName = item.owner?.displayName || item.owner?.username || '?'

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.push(`/(main)/buddy-detail/${item.id}` as never)}
        >
          {/* Owner row */}
          <View style={styles.ownerRow}>
            <Avatar
              uri={item.owner?.avatarUrl}
              name={ownerName}
              size={28}
              userId={item.owner?.id || item.ownerId}
            />
            <Text style={[styles.ownerName, { color: colors.textSecondary }]} numberOfLines={1}>
              {ownerName}
            </Text>
            <View style={[styles.tierBadge, { backgroundColor: tierInfo.color }]}>
              <Text style={styles.tierBadgeText}>{t(tierInfo.labelKey)}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>

          {/* Description */}
          <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description ?? t('marketplace.noDescription', 'No description')}
          </Text>

          {/* Skills */}
          {item.skills.length > 0 && (
            <View style={styles.skills}>
              {item.skills.slice(0, 3).map((skill) => (
                <View
                  key={skill}
                  style={[styles.skillTag, { backgroundColor: `${colors.primary}18` }]}
                >
                  <Text style={[styles.skillText, { color: colors.primary }]}>{skill}</Text>
                </View>
              ))}
              {item.skills.length > 3 && (
                <Text style={[styles.skillMore, { color: colors.textMuted }]}>
                  +{item.skills.length - 3}
                </Text>
              )}
            </View>
          )}

          {/* Price + Stats */}
          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceValue, { color: '#D97706' }]}>{item.hourlyRate}</Text>
              <Text style={[styles.priceUnit, { color: colors.textMuted }]}>/h</Text>
            </View>
            <View style={styles.statsRow}>
              <Clock size={12} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>
                {formatOnlineTime(item.totalOnlineSeconds)}
              </Text>
              <OnlineRank totalSeconds={item.totalOnlineSeconds} />
              <Eye size={12} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>{item.viewCount}</Text>
              <Users size={12} color={colors.textMuted} />
              <Text style={[styles.statText, { color: colors.textMuted }]}>{item.rentalCount}</Text>
            </View>
          </View>
        </Pressable>
      )
    },
    [colors, router, t, formatOnlineTime],
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
            placeholder={t('buddies.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          <Pressable
            onPress={() => setShowFilters(!showFilters)}
            hitSlop={8}
            style={[styles.filterToggle, showFilters && { backgroundColor: `${colors.primary}20` }]}
          >
            <SlidersHorizontal size={16} color={showFilters ? colors.primary : colors.textMuted} />
          </Pressable>
        </View>

        {/* Filters panel */}
        {showFilters && (
          <View style={styles.filtersPanel}>
            {/* Device tier */}
            <Text style={[styles.filterLabel, { color: colors.textMuted }]}>
              {t('marketplace.deviceTier', 'Device Tier')}
            </Text>
            <View style={styles.filterChips}>
              {Object.entries(DEVICE_TIER_INFO).map(([key, { labelKey, color }]) => (
                <Pressable
                  key={key}
                  onPress={() => setDeviceTier(deviceTier === key ? null : key)}
                  style={[
                    styles.chip,
                    {
                      borderColor: deviceTier === key ? color : colors.border,
                      backgroundColor: deviceTier === key ? `${color}15` : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: deviceTier === key ? color : colors.textSecondary },
                    ]}
                  >
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* OS type */}
            <Text style={[styles.filterLabel, { color: colors.textMuted, marginTop: spacing.md }]}>
              {t('marketplace.osType', 'OS')}
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
                      backgroundColor: osType === key ? `${colors.primary}15` : 'transparent',
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
        <Text style={[styles.resultCount, { color: colors.textMuted }]}>
          {t('marketplace.resultCount', { count: total })}
        </Text>
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
                  {t(opt.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Listing grid */}
      {listings.length === 0 && !isLoading ? (
        <EmptyState icon="search" title={t('buddies.noListings')} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
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
    paddingHorizontal: spacing.md,
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
    paddingHorizontal: spacing.md,
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

  // Grid
  grid: {
    padding: spacing.sm,
  },
  gridRow: {
    gap: spacing.sm,
  },

  // Card
  card: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ownerName: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  tierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  tierBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  osLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  skills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.sm,
  },
  skillTag: {
    paddingHorizontal: 6,
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
