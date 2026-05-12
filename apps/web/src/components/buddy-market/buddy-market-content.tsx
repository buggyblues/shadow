import {
  Badge,
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
import { Link, useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  Clock,
  Eye,
  ListFilter,
  RefreshCw,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { useMarketplaceStore } from '../../stores/marketplace.store'
import { UserAvatar } from '../common/avatar'
import { EmptyState } from '../common/empty-state'
import { PriceDisplay } from '../shop/ui/currency'

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

function formatOnlineDuration(seconds: number) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`
  const hours = Math.floor(seconds / 3600)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`
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
                <ListingCard key={listing.id} listing={listing} />
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

function ListingCard({ listing }: { listing: Listing }) {
  const { t } = useTranslation()
  const ownerName = listing.owner?.displayName || listing.owner?.username || 'Buddy'
  const tags = listing.skills.length > 0 ? listing.skills : listing.tags
  const visibleTools = (tags?.length ? tags : []).slice(0, 3)
  const descriptionText = listing.description?.trim() || t('marketplace.noDescription', '暂无描述')
  const ownerProfileId = listing.owner?.id ?? listing.ownerId
  const canOpenOwnerProfile = Boolean(ownerProfileId)
  const ownerDisplay =
    listing.owner?.displayName || listing.owner?.username || t('marketplace.owner', '提供者')
  const navigate = useNavigate()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const isOwner = Boolean(currentUserId) && currentUserId === ownerProfileId

  return (
    <Link
      to={`/marketplace/${listing.id}`}
      className="group block overflow-hidden rounded-[32px]"
      aria-label={`${t('marketplace.viewDetails', '查看详情')} · ${listing.title}`}
    >
      <div className="overflow-hidden rounded-[32px]">
        <Card
          variant="glass"
          className="relative h-full border border-border-subtle transition duration-300 hover:border-primary/45 hover:shadow-[0_12px_36px_rgba(0,209,255,0.22)]"
        >
          <CardContent className="space-y-3 p-0">
            <div className="p-4 pb-3">
              <div className="flex items-start gap-3">
                <div className="relative shrink-0 mt-1">
                  <div className="rounded-full p-0.5 ring-1 ring-primary/30">
                    <UserAvatar
                      userId={listing.owner?.id ?? listing.ownerId}
                      avatarUrl={listing.owner?.avatarUrl}
                      displayName={ownerName}
                      size="md"
                    />
                  </div>
                  <span
                    title={t('marketplace.online', '在线')}
                    className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-bg-secondary bg-success"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-black text-text-primary group-hover:text-primary transition-colors">
                    {listing.title}
                  </h3>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (!ownerProfileId) return
                      navigate({
                        to: '/profile/$userId',
                        params: { userId: ownerProfileId },
                      })
                    }}
                    disabled={!canOpenOwnerProfile}
                    className="mt-0.5 inline-flex text-[11px] font-black uppercase tracking-[0.14em] text-text-muted hover:text-primary"
                  >
                    {t('marketplace.provider', '提供者')}：
                    <span className="ml-1 font-normal normal-case text-text-secondary hover:text-primary">
                      {ownerDisplay}
                    </span>
                  </button>
                </div>
                <div className="shrink-0 self-start text-right">
                  <p className="mt-0 flex items-baseline justify-end gap-1">
                    <span className="text-[3rem] font-black leading-none text-primary">
                      <PriceDisplay amount={listing.hourlyRate} size={40} />
                    </span>
                    <span className="text-sm font-black text-text-secondary">
                      {t('marketplace.perHour', '/时')}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 -mt-1">
              <p className="text-sm leading-7 text-text-primary">{descriptionText}</p>
            </div>

            <div className="px-4">
              <div className="mt-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                  {t('marketplace.skills', '技能标签')}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {visibleTools.map((tool) => (
                    <Badge key={tool} variant="info" size="xs" className="normal-case">
                      {tool}
                    </Badge>
                  ))}
                  {visibleTools.length === 0 ? (
                    <span className="text-xs text-text-muted">
                      {t('marketplace.noDescription', '暂无描述')}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="px-4">
              <div className="mt-2">
                <div className="grid grid-cols-3 divide-x divide-border-subtle/70 rounded-xl border border-border-subtle bg-bg-secondary/20 px-1 py-2.5 text-xs text-text-secondary">
                  <div className="flex min-w-0 items-center gap-1.5 px-3">
                    <Clock size={12} className="shrink-0 text-text-muted" />
                    <span className="truncate">{t('marketplace.totalOnline', '累计在线')}</span>
                    <span className="ml-auto font-black text-text-primary">
                      {formatOnlineDuration(listing.totalOnlineSeconds)}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-1.5 px-3">
                    <Eye size={12} className="shrink-0 text-text-muted" />
                    <span className="truncate">{t('marketplace.views', '浏览')}</span>
                    <span className="ml-auto font-black text-text-primary">
                      {listing.viewCount}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-1.5 px-3">
                    <RefreshCw size={12} className="shrink-0 text-text-muted" />
                    <span className="truncate">{t('marketplace.rentalCount', '租赁次数')}</span>
                    <span className="ml-auto font-black text-text-primary">
                      {listing.rentalCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pb-2" />
          </CardContent>
        </Card>
      </div>
    </Link>
  )
}
