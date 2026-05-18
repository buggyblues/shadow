import {
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Skeleton,
  Search as UiSearch,
} from '@shadowob/ui'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowDownAZ, ArrowUpAZ, Check, Clock, ListFilter, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useMarketplaceStore } from '../../stores/marketplace.store'
import { EmptyState } from '../common/empty-state'
import { BuddyListingCard, type BuddyListingCardData } from './buddy-listing-card'

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

type SearchState = {
  query: string
  device: string
  os: string
  sort: 'popular' | 'newest' | 'price-asc' | 'price-desc'
}

const DEVICE_TIERS = ['high_end', 'mid_range', 'low_end'] as const
const OS_TYPES = ['macos', 'windows', 'linux'] as const
const LIST_PAGE_SIZE = 60

const SORT_OPTIONS = [
  { value: 'popular', labelKey: 'marketplace.popular', fallback: '最热门', icon: Users },
  { value: 'newest', labelKey: 'marketplace.newest', fallback: '最新上架', icon: Clock },
  {
    value: 'price-asc',
    labelKey: 'marketplace.priceAsc',
    fallback: '价格从低到高',
    icon: ArrowDownAZ,
  },
  {
    value: 'price-desc',
    labelKey: 'marketplace.priceDesc',
    fallback: '价格从高到低',
    icon: ArrowUpAZ,
  },
] as const

function parseFilterList(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeSort(value?: string) {
  if (value === 'newest' || value === 'price-asc' || value === 'price-desc') return value
  return 'popular'
}

function serializeSearchState(state: SearchState): string {
  const keys = {
    q: state.query,
    device: state.device,
    os: state.os,
    sort: state.sort === 'popular' ? '' : state.sort,
  } as const

  return JSON.stringify(keys)
}

function getDeviceLabelKey(tier: Listing['deviceTier']) {
  if (tier === 'high_end') return 'marketplace.deviceHighEnd'
  if (tier === 'mid_range') return 'marketplace.deviceMidRange'
  return 'marketplace.deviceLowEnd'
}

function getDeviceFallback(tier: Listing['deviceTier']) {
  if (tier === 'high_end') return '顶配'
  if (tier === 'mid_range') return '中端'
  return '入门'
}

function useQuerySync() {
  const location = useLocation()
  const routeSearch = useSearch({ strict: false }) as {
    q?: string
    sort?: 'popular' | 'newest' | 'price-asc' | 'price-desc'
    device?: string
    os?: string
  }
  const normalizedPath = location.pathname.replace(/^\/app(?=\/|$)/, '').replace(/\/+$/, '')
  const isMarketRoute = normalizedPath === '/settings/buddy/market'

  const {
    searchQuery,
    deviceTiers,
    osTypes,
    sortBy,
    setSearchQuery,
    toggleDeviceTier,
    setDeviceTiers,
    toggleOsType,
    setOsTypes,
    setSortBy,
  } = useMarketplaceStore()

  const routeFilterSignature = useMemo(
    () =>
      serializeSearchState({
        query: routeSearch.q?.trim() ?? '',
        device: routeSearch.device?.trim() ?? '',
        os: routeSearch.os?.trim() ?? '',
        sort: normalizeSort(routeSearch.sort),
      }),
    [routeSearch.q, routeSearch.device, routeSearch.os, routeSearch.sort],
  )

  useEffect(() => {
    if (!isMarketRoute) return

    const nextQuery = routeSearch.q?.trim() ?? ''
    const nextDevice = parseFilterList(routeSearch.device)
    const nextOS = parseFilterList(routeSearch.os)
    const nextSort = normalizeSort(routeSearch.sort)

    if (nextQuery !== searchQuery) {
      setSearchQuery(nextQuery)
    }

    if (JSON.stringify(nextDevice) !== JSON.stringify(deviceTiers)) {
      setDeviceTiers(nextDevice)
    }

    if (JSON.stringify(nextOS) !== JSON.stringify(osTypes)) {
      setOsTypes(nextOS)
    }

    if (nextSort !== sortBy) {
      setSortBy(nextSort)
    }
  }, [
    deviceTiers,
    osTypes,
    routeSearch.device,
    routeSearch.os,
    routeSearch.q,
    routeSearch.sort,
    searchQuery,
    setDeviceTiers,
    setOsTypes,
    setSearchQuery,
    setSortBy,
    sortBy,
  ])

  const syncedRouteSignature = useMemo(
    () =>
      serializeSearchState({
        query: searchQuery.trim(),
        device: deviceTiers.join(','),
        os: osTypes.join(','),
        sort: sortBy,
      }),
    [searchQuery, deviceTiers, osTypes, sortBy],
  )

  return {
    routeSearch,
    routeFilterSignature,
    routeSearchState: {
      searchQuery,
      deviceTiers,
      osTypes,
      sortBy,
    },
    syncedRouteSignature,
    setSearchQuery,
    toggleDeviceTier,
    setDeviceTiers,
    toggleOsType,
    setOsTypes,
    setSortBy,
  }
}

export function BuddyMarketContent() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    routeSearch,
    routeFilterSignature,
    routeSearchState,
    syncedRouteSignature,
    setSearchQuery,
    toggleDeviceTier,
    toggleOsType,
    setDeviceTiers,
    setOsTypes,
    setSortBy,
  } = useQuerySync()
  const { searchQuery, deviceTiers, osTypes, sortBy } = routeSearchState

  const [hasManualSyncAttempted, setHasManualSyncAttempted] = useState(false)

  useEffect(() => {
    if (
      !routeSearch.q &&
      !routeSearch.device &&
      !routeSearch.os &&
      !routeSearch.sort &&
      searchQuery === '' &&
      deviceTiers.length === 0 &&
      osTypes.length === 0 &&
      sortBy === 'popular' &&
      !hasManualSyncAttempted
    ) {
      setHasManualSyncAttempted(true)
      return
    }
    if (routeSearch.q || routeSearch.device || routeSearch.os || routeSearch.sort) {
      setHasManualSyncAttempted(true)
    }
  }, [
    hasManualSyncAttempted,
    osTypes.length,
    routeSearch.device,
    routeSearch.q,
    routeSearch.os,
    routeSearch.sort,
    searchQuery,
    sortBy,
    deviceTiers.length,
  ])

  useEffect(() => {
    if (syncedRouteSignature !== routeFilterSignature) {
      navigate({
        to: '/settings/buddy/market',
        search: {
          q: searchQuery.trim(),
          device: deviceTiers.join(','),
          os: osTypes.join(','),
          sort: sortBy === 'popular' ? undefined : sortBy,
        },
        replace: true,
      })
    }
  }, [
    navigate,
    routeFilterSignature,
    searchQuery,
    deviceTiers,
    osTypes,
    sortBy,
    syncedRouteSignature,
  ])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    const keyword = searchQuery.trim()
    if (keyword) params.set('keyword', keyword)
    if (deviceTiers.length > 0) params.set('deviceTier', deviceTiers.join(','))
    if (osTypes.length > 0) params.set('osType', osTypes.join(','))
    params.set('sortBy', sortBy)
    params.set('limit', String(LIST_PAGE_SIZE))
    return params.toString()
  }, [deviceTiers, osTypes, searchQuery, sortBy])

  const {
    data: listingData,
    error,
    isLoading,
    isFetching,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['marketplace', 'listings', queryString],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams(queryString)
      params.set('offset', String(pageParam))
      return fetchApi<{ listings: Listing[]; total: number }>(`/api/marketplace/listings?${params}`)
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((acc, page) => acc + page.listings.length, 0)
      if (loadedCount >= lastPage.total) return undefined
      return loadedCount
    },
    staleTime: 30_000,
  })

  const listingPages = listingData?.pages ?? []
  const listings = listingPages.flatMap((page) => page.listings)
  const total = listingPages[0]?.total ?? 0
  const hasFilters = searchQuery.trim() || deviceTiers.length > 0 || osTypes.length > 0
  const hasActiveSortFilter = deviceTiers.length > 0 || osTypes.length > 0 || sortBy !== 'popular'
  const hasMore = Boolean(total && listings.length < total)
  const isListLoading = isLoading && !isFetchingNextPage

  const clearFilters = () => {
    setSearchQuery('')
    setDeviceTiers([])
    setOsTypes([])
    setSortBy('popular')
    void refetch()
  }

  const openLoadMore = useCallback(() => {
    if (!hasMore || isFetchingNextPage) return
    void fetchNextPage()
  }, [fetchNextPage, hasMore, isFetchingNextPage])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <UiSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('marketplace.searchPlaceholder', '搜索 Buddy 设备、技能、工具...')}
            className="h-11"
          />
          <DropdownMenu
            trigger={
              <button
                type="button"
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
                  hasActiveSortFilter
                    ? 'border-primary/55 bg-primary/12 text-primary'
                    : 'border-border-subtle text-text-muted hover:border-primary/40 hover:text-text-secondary'
                }`}
                title={`${t('marketplace.sortBy', '排序')} / ${t('marketplace.filter', '筛选')}`}
              >
                <ListFilter size={16} />
              </button>
            }
          >
            <DropdownMenuContent align="end" className="w-80 p-3">
              <div className="space-y-3" onClick={(event) => event.stopPropagation()}>
                <div className="space-y-2">
                  <DropdownMenuLabel className="px-0 py-0">
                    {t('marketplace.sortBy', '排序')}
                  </DropdownMenuLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {SORT_OPTIONS.map((option) => {
                      const Icon = option.icon
                      const selected = sortBy === option.value

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSortBy(option.value)}
                          className={`flex min-h-9 items-center gap-2 rounded-[16px] border px-3 text-left transition ${
                            selected
                              ? 'border-primary/35 bg-primary/12 text-text-primary'
                              : 'border-border-subtle bg-bg-secondary/30 text-text-secondary hover:border-primary/30 hover:text-text-primary'
                          }`}
                        >
                          <Icon size={14} />
                          <span className="text-xs font-black uppercase tracking-[0.12em]">
                            {t(option.labelKey, option.fallback)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <DropdownMenuSeparator className="mx-0" />

                <div className="space-y-2">
                  <DropdownMenuLabel className="px-0 py-0">
                    {t('marketplace.filter', '筛选')}
                  </DropdownMenuLabel>

                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-text-muted">
                      {t('marketplace.allDevices', '全部设备')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEVICE_TIERS.map((tier) => {
                        const active = deviceTiers.includes(tier)
                        return (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => toggleDeviceTier(tier)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition ${
                              active
                                ? 'border-primary/35 bg-primary/12 text-primary'
                                : 'border-border-subtle text-text-secondary hover:border-primary/30'
                            }`}
                          >
                            {active ? <Check size={12} /> : null}
                            <span>{t(getDeviceLabelKey(tier), getDeviceFallback(tier))}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-text-muted">
                      {t('marketplace.allOS', '全部系统')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {OS_TYPES.map((os) => {
                        const active = osTypes.includes(os)
                        return (
                          <button
                            key={os}
                            type="button"
                            onClick={() => toggleOsType(os)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black transition ${
                              active
                                ? 'border-primary/35 bg-primary/12 text-primary'
                                : 'border-border-subtle text-text-secondary hover:border-primary/30'
                            }`}
                          >
                            {active ? <Check size={12} /> : null}
                            <span>
                              {os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : 'Linux'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {hasActiveSortFilter && (
                  <div className="flex items-center justify-between">
                    <Button type="button" onClick={clearFilters} size="xs" variant="ghost" icon={X}>
                      {t('marketplace.clearFilters', '清除筛选')}
                    </Button>
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isListLoading ? (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <MarketListingSkeleton key={`market-skeleton-${index}`} />
            ))}
          </div>
        ) : error ? (
          <Card
            variant="glass"
            className="border border-danger/30 bg-danger/10 overflow-hidden rounded-[32px]"
          >
            <CardContent className="space-y-4 px-6 py-8 text-center">
              <p className="text-sm font-bold text-danger">
                {error instanceof Error
                  ? error.message
                  : t('marketplace.listLoadFailed', '列表加载失败，请稍后重试')}
              </p>
              <Button onClick={() => refetch()} variant="ghost" size="sm">
                {t('common.retry', '重试')}
              </Button>
            </CardContent>
          </Card>
        ) : !listings.length ? (
          <Card
            variant="glass"
            className="overflow-hidden rounded-[32px] border border-dashed border-border-subtle"
          >
            <EmptyState
              icon={Users}
              title={
                hasFilters
                  ? t('marketplace.emptyTitle', '暂无挂单')
                  : t('marketplace.emptyTitle', '暂无挂单')
              }
              description={
                hasFilters
                  ? t('marketplace.noResults', '暂无可租赁的 Buddy，快来发布第一个吧！')
                  : t('marketplace.emptyDesc', '还没有人上架 Buddy，快来成为第一个吧！')
              }
              action={{
                label: hasFilters
                  ? t('marketplace.clearFilters', '清除筛选')
                  : t('marketplace.createListing', '出租'),
                onClick: hasFilters
                  ? clearFilters
                  : () => navigate({ to: '/settings/buddy/create' }),
              }}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {listings.map((listing) => (
                <BuddyListingCard
                  key={listing.id}
                  listing={toBuddyListingCardData(listing)}
                  onOpen={() =>
                    navigate({
                      to: '/marketplace/$listingId',
                      params: { listingId: listing.id },
                    })
                  }
                />
              ))}
            </div>

            {isFetchingNextPage && (
              <div className="pointer-events-none sticky bottom-3 mx-auto w-fit rounded-full border border-border-subtle bg-bg-deep/80 px-3 py-1 text-xs font-bold text-text-muted shadow-sm backdrop-blur-xl">
                {t('common.loading', '加载中...')}
              </div>
            )}

            {!isFetching && hasMore ? (
              <div className="flex justify-center pt-2">
                <Button
                  onClick={openLoadMore}
                  disabled={isFetchingNextPage}
                  variant="ghost"
                  size="sm"
                >
                  {isFetchingNextPage
                    ? t('common.loading', '加载中...')
                    : t('common.loadMore', '加载更多')}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function MarketListingSkeleton() {
  return (
    <Card
      variant="glass"
      className="h-full overflow-hidden rounded-[32px] border border-border-subtle"
    >
      <CardContent className="space-y-4 p-0">
        <div className="space-y-3 px-4 pb-4">
          <div className="flex items-start gap-3">
            <Skeleton variant="circle" width={48} height={48} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-36" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="rounded-xl border border-border-subtle bg-bg-secondary/20 p-3">
            <Skeleton className="h-3.5 w-28" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-secondary/20 p-3">
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function toBuddyListingCardData(listing: Listing): BuddyListingCardData {
  return {
    id: listing.id,
    ownerId: listing.ownerId,
    title: listing.title,
    description: listing.description,
    skills: listing.skills,
    tags: listing.tags,
    hourlyRate: listing.hourlyRate,
    viewCount: listing.viewCount,
    rentalCount: listing.rentalCount,
    totalOnlineSeconds: listing.totalOnlineSeconds,
    owner: listing.owner,
  }
}
