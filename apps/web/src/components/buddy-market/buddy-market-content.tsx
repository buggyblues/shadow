import { Button, cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowDownAZ, ArrowUpAZ, Clock, Eye, Filter, Monitor, Search, Users, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../common/avatar'
import { PriceDisplay } from '../shop/ui/currency'
import { fetchApi } from '../../lib/api'
import { useMarketplaceStore } from '../../stores/marketplace.store'

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

const DEVICE_TIERS = ['high_end', 'mid_range', 'low_end'] as const
const OS_TYPES = ['macos', 'windows', 'linux'] as const

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

function formatOnlineDuration(seconds: number) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`
  const hours = Math.floor(seconds / 3600)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`
}

function getDeviceLabelKey(tier: Listing['deviceTier']) {
  switch (tier) {
    case 'high_end':
      return 'marketplace.deviceHighEnd'
    case 'mid_range':
      return 'marketplace.deviceMidRange'
    case 'low_end':
      return 'marketplace.deviceLowEnd'
  }
}

function getDeviceFallback(tier: Listing['deviceTier']) {
  switch (tier) {
    case 'high_end':
      return '顶配'
    case 'mid_range':
      return '中端'
    case 'low_end':
      return '入门'
  }
}

export function BuddyMarketContent() {
  const { t } = useTranslation()
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

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('keyword', searchQuery.trim())
    if (deviceTiers.length > 0) params.set('deviceTier', deviceTiers.join(','))
    if (osTypes.length > 0) params.set('osType', osTypes.join(','))
    params.set('sortBy', sortBy)
    params.set('limit', '60')
    return params.toString()
  }, [deviceTiers, osTypes, searchQuery, sortBy])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['marketplace', 'listings', queryString],
    queryFn: () =>
      fetchApi<{ listings: Listing[]; total: number }>(`/api/marketplace/listings?${queryString}`),
    staleTime: 30_000,
  })

  const listings = data?.listings ?? []
  const total = data?.total ?? 0
  const hasFilters = searchQuery.trim() || deviceTiers.length > 0 || osTypes.length > 0

  const clearFilters = () => {
    setSearchQuery('')
    setDeviceTiers([])
    setOsTypes([])
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col rounded-2xl border border-[var(--glass-line)] bg-[var(--glass-bg)] shadow-sm backdrop-blur-3xl">
      <div className="shrink-0 border-b border-[var(--glass-line)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-text-primary">
              {t('marketplace.title', 'Buddy 市场')}
            </h2>
            <p className="mt-1 text-xs font-bold text-text-muted">
              {t('marketplace.resultCount', '共 {{count}} 个 Buddy 可供租赁', { count: total })}
            </p>
          </div>
          <Link
            to="/settings"
            search={{ tab: 'buddy', section: 'rentals' }}
            className="inline-flex h-9 items-center justify-center rounded-full border border-border-subtle px-4 text-sm font-bold text-text-secondary transition hover:border-primary/40 hover:text-primary"
          >
            {t('marketplace.myRentalsCta', '查看我的租赁')}
          </Link>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('marketplace.searchPlaceholder', '搜索 Buddy 设备、技能、工具...')}
              className="h-10 w-full rounded-xl border border-border-subtle bg-bg-tertiary/50 pl-9 pr-3 text-sm font-bold text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-subtle px-3 text-xs font-black uppercase tracking-[0.16em] text-text-muted">
              <Filter size={13} />
              {t('marketplace.filter', '筛选')}
            </span>
            {DEVICE_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => toggleDeviceTier(tier)}
                className={cn(
                  'h-9 rounded-full px-3 text-xs font-bold transition',
                  deviceTiers.includes(tier)
                    ? 'bg-primary/15 text-primary'
                    : 'bg-bg-tertiary/40 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                )}
              >
                {t(getDeviceLabelKey(tier), getDeviceFallback(tier))}
              </button>
            ))}
            {OS_TYPES.map((os) => (
              <button
                key={os}
                type="button"
                onClick={() => toggleOsType(os)}
                className={cn(
                  'h-9 rounded-full px-3 text-xs font-bold transition',
                  osTypes.includes(os)
                    ? 'bg-primary/15 text-primary'
                    : 'bg-bg-tertiary/40 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                )}
              >
                {os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : 'Linux'}
              </button>
            ))}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-bold text-text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <X size={13} />
                {t('marketplace.clearFilters', '清除筛选')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-text-muted">
            {t('marketplace.sortBy', '排序')}
          </span>
          {SORT_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSortBy(option.value)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition',
                  sortBy === option.value
                    ? 'bg-primary/15 text-primary'
                    : 'text-text-muted hover:bg-bg-tertiary/50 hover:text-text-primary',
                )}
              >
                <Icon size={13} />
                {t(option.labelKey, option.fallback)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm font-bold text-text-muted">
            {t('common.loading', '加载中...')}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
            <Monitor size={42} className="mb-3 text-text-muted/50" strokeWidth={1.5} />
            <p className="text-sm font-black uppercase tracking-[0.18em] text-text-primary">
              {t('marketplace.emptyTitle', '暂无挂单')}
            </p>
            <p className="mt-2 max-w-sm text-sm text-text-muted">
              {t('marketplace.noResults', '暂无可租赁的 Buddy，快来发布第一个吧！')}
            </p>
            <Button asChild variant="primary" size="sm" className="mt-5 rounded-full">
              <Link to="/marketplace/create">{t('marketplace.createListing', '创建挂单')}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
        {isFetching && !isLoading && (
          <div className="pointer-events-none sticky bottom-3 mx-auto mt-3 w-fit rounded-full border border-border-subtle bg-bg-deep/80 px-3 py-1 text-xs font-bold text-text-muted shadow-sm backdrop-blur-xl">
            {t('common.loading', '加载中...')}
          </div>
        )}
      </div>
    </div>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  const { t } = useTranslation()
  const ownerName = listing.owner?.displayName || listing.owner?.username || 'Buddy'
  const tags = listing.skills.length > 0 ? listing.skills : listing.tags
  const model = listing.deviceInfo?.model || listing.deviceInfo?.cpu || null

  return (
    <Link
      to={`/marketplace/${listing.id}`}
      className="group flex min-h-[260px] flex-col rounded-2xl border border-border-subtle bg-bg-secondary/30 p-4 text-left shadow-sm transition hover:border-primary/35 hover:bg-bg-secondary/50"
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          userId={listing.owner?.id ?? listing.ownerId}
          avatarUrl={listing.owner?.avatarUrl}
          displayName={ownerName}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-black text-text-primary group-hover:text-primary">
              {listing.title}
            </h3>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
              {t(getDeviceLabelKey(listing.deviceTier), getDeviceFallback(listing.deviceTier))}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs font-bold text-text-muted">
            {ownerName} · {listing.osType === 'macos' ? 'macOS' : listing.osType}
          </p>
        </div>
      </div>

      {listing.description && (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-text-secondary">
          {listing.description}
        </p>
      )}

      <div className="mt-4 flex min-h-[26px] flex-wrap gap-1.5">
        {tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-bg-tertiary/60 px-2 py-1 text-[11px] font-bold text-text-secondary"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto space-y-3 pt-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-bg-tertiary/40 p-2">
            <div className="mb-1 flex items-center gap-1 text-text-muted">
              <Clock size={12} />
              {t('marketplace.totalOnline', '累计')}
            </div>
            <div className="font-black text-text-primary">
              {formatOnlineDuration(listing.totalOnlineSeconds)}
            </div>
          </div>
          <div className="rounded-xl bg-bg-tertiary/40 p-2">
            <div className="mb-1 flex items-center gap-1 text-text-muted">
              <Eye size={12} />
              {t('marketplace.views', '浏览')}
            </div>
            <div className="font-black text-text-primary">{listing.viewCount}</div>
          </div>
        </div>

        {model && <p className="truncate text-xs font-bold text-text-muted">{model}</p>}

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-text-muted">
              {t('marketplace.hourlyRate', '时租')}
            </div>
            <PriceDisplay amount={listing.hourlyRate} size={18} />
          </div>
          <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-primary/20 transition group-hover:bg-primary-hover">
            {t('marketplace.viewDetails', '查看详情')}
          </span>
        </div>
      </div>
    </Link>
  )
}
