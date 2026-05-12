import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  Search,
  SlidersHorizontal,
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
import { EmptyState } from '../common/empty-state'
import { LoadingScreen } from '../common/loading-screen'
import { fetchApi } from '../../lib/api'
import { BuddyMarketCard } from './buddy-market-card'
import { DEVICE_TIER_INFO, OS_LABELS, SORT_OPTIONS, type Listing, type SortValue } from './types'
import { fontSize, radius, spacing, useColors } from '../../theme'

export function BuddyMarketScreen() {
  const colors = useColors()
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

  const renderItem = useCallback(
    ({ item }: { item: Listing }) => <BuddyMarketCard listing={item} />,
    [],
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
})
