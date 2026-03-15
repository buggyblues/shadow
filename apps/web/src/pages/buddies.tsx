import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  Eye,
  Loader2,
  ChevronLeft as PageLeft,
  ChevronRight as PageRight,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { formatDuration, OnlineRank } from '../components/common/online-rank'
import { useAppStatus } from '../hooks/use-app-status'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { useMarketplaceStore } from '../stores/marketplace.store'
import { PublicFooter, PublicNav } from './home'

/* ──────────── P2P Marketplace Data ──────────── */

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
  depositAmount: number
  viewCount: number
  rentalCount: number
  tags: string[]
  totalOnlineSeconds: number
  availableFrom: string | null
  availableUntil: string | null
  createdAt: string
  owner: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

const DEVICE_TIER_COLORS: Record<
  Listing['deviceTier'],
  { color: string; icon: string; labelKey: string }
> = {
  high_end: {
    color: 'from-amber-400 to-orange-500',
    icon: '🔥',
    labelKey: 'marketplace.deviceHighEnd',
  },
  mid_range: {
    color: 'from-blue-400 to-cyan-500',
    icon: '⚡',
    labelKey: 'marketplace.deviceMidRange',
  },
  low_end: { color: 'from-gray-400 to-gray-500', icon: '💡', labelKey: 'marketplace.deviceLowEnd' },
}

const OS_LABELS: Record<string, { label: string }> = {
  macos: { label: 'macOS' },
  windows: { label: 'Windows' },
  linux: { label: 'Linux' },
}

const SORT_OPTIONS = [
  { value: 'popular', labelKey: 'marketplace.popular' },
  { value: 'newest', labelKey: 'marketplace.newest' },
  { value: 'price-asc', labelKey: 'marketplace.priceAsc' },
  { value: 'price-desc', labelKey: 'marketplace.priceDesc' },
] as const

/* ──────────── Main Page ──────────── */

export function BuddyMarketPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  useAppStatus({ title: t('nav.buddies'), variant: 'market' })

  const {
    searchQuery,
    setSearchQuery,
    deviceTiers,
    toggleDeviceTier,
    setDeviceTiers,
    osTypes,
    toggleOsType,
    setOsTypes,
    sortBy,
    setSortBy,
  } = useMarketplaceStore()

  const [sortOpen, setSortOpen] = useState(false)
  const [tierDropdownOpen, setTierDropdownOpen] = useState(false)
  const [osDropdownOpen, setOsDropdownOpen] = useState(false)
  const [listMyClawLoading, setListMyClawLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const sortRef = useRef<HTMLDivElement>(null)
  const tierRef = useRef<HTMLDivElement>(null)
  const osRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (sortOpen && sortRef.current && !sortRef.current.contains(target)) setSortOpen(false)
      if (tierDropdownOpen && tierRef.current && !tierRef.current.contains(target))
        setTierDropdownOpen(false)
      if (osDropdownOpen && osRef.current && !osRef.current.contains(target))
        setOsDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sortOpen, tierDropdownOpen, osDropdownOpen])

  /** Items per page = 4 rows × 4 columns on xl, fits different breakpoints */
  const ITEMS_PER_PAGE = 16

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', 'listings', searchQuery, deviceTiers, osTypes, sortBy],
    queryFn: () => {
      const params = new URLSearchParams()
      if (searchQuery) params.set('keyword', searchQuery)
      if (deviceTiers.length > 0) params.set('deviceTier', deviceTiers.join(','))
      if (osTypes.length > 0) params.set('osType', osTypes.join(','))
      params.set('sortBy', sortBy)
      params.set('limit', '40')
      return fetchApi<{ listings: Listing[]; total: number }>(`/api/marketplace/listings?${params}`)
    },
    staleTime: 30_000,
  })

  const listings = data?.listings ?? []

  // Query to check if user has any active listings or rental contracts
  const { data: myListingsData } = useQuery({
    queryKey: ['marketplace', 'my-listings'],
    queryFn: () =>
      fetchApi<{ listings: { id: string; isListed: boolean; listingStatus: string }[] }>(
        '/api/marketplace/my-listings',
      ),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })
  const { data: myOwnerContracts } = useQuery({
    queryKey: ['marketplace', 'contracts', 'owner'],
    queryFn: () =>
      fetchApi<{ contracts: { id: string; status: string }[] }>(
        '/api/marketplace/contracts?role=owner',
      ),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })

  const hasActiveRentalsOrListings = useMemo(() => {
    const hasListings = myListingsData?.listings?.some(
      (l) => l.isListed || l.listingStatus === 'active',
    )
    const hasContracts = myOwnerContracts?.contracts?.some(
      (c) => c.status === 'active' || c.status === 'pending',
    )
    return hasListings || hasContracts
  }, [myListingsData, myOwnerContracts])

  const totalCount = data?.total ?? 0

  const totalPages = Math.max(1, Math.ceil(listings.length / ITEMS_PER_PAGE))
  const paginatedItems = listings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  // Reset page when filters change
  const resetPage = () => setCurrentPage(1)

  // Handle "上架我的 Claw" click
  const handleListMyClaw = async () => {
    if (!isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/app/marketplace/create' } })
      return
    }
    setListMyClawLoading(true)
    try {
      const agents = await fetchApi<{ id: string }[]>('/api/agents')
      if (!agents || agents.length === 0) {
        navigate({ to: '/app/buddies' })
      } else {
        navigate({ to: '/app/marketplace/create' })
      }
    } catch {
      navigate({ to: '/app/marketplace/create' })
    } finally {
      setListMyClawLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <PublicNav />

      {/* ───── Hero + Search ───── */}
      <section className="pt-32 pb-8 px-8 md:px-16 max-w-6xl mx-auto text-center relative overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-yellow-300/15 rounded-full blur-3xl -z-10 animate-pulse" />
        <div
          className="absolute top-32 right-10 w-80 h-80 bg-cyan-300/15 rounded-full blur-3xl -z-10 animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <h1
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className="text-4xl md:text-6xl mb-6 leading-tight"
        >
          {t('agents.pageTitle')}
        </h1>
        <p className="text-lg md:text-xl text-gray-600 font-bold max-w-2xl mx-auto mb-8">
          {t('agents.pageSubtitle')}
        </p>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('marketplace.searchPlaceholder')}
            className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/80 backdrop-blur border-2 border-white/90 shadow-lg text-base font-medium placeholder:text-gray-400 focus:outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100 transition-all"
          />
        </div>
      </section>

      {/* ───── Unified Buddy Grid ───── */}
      <section className="max-w-7xl mx-auto px-8 md:px-16 pt-4 pb-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Sort dropdown */}
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 border-2 border-white/90 text-sm font-bold text-gray-600 hover:border-gray-300 transition-all"
              >
                <ArrowUpDown className="w-4 h-4" />
                {t(SORT_OPTIONS.find((o) => o.value === sortBy)?.labelKey ?? 'marketplace.popular')}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {sortOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-20 min-w-[140px]">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setSortBy(opt.value)
                        setSortOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                        sortBy === opt.value
                          ? 'bg-cyan-50 text-cyan-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-200" />

            {/* Device Tier Dropdown */}
            <div className="relative" ref={tierRef}>
              <button
                type="button"
                onClick={() => {
                  setTierDropdownOpen(!tierDropdownOpen)
                  setOsDropdownOpen(false)
                  setSortOpen(false)
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 border-2 text-sm font-bold transition-all ${
                  deviceTiers.length > 0
                    ? 'border-cyan-300 text-cyan-700 bg-cyan-50'
                    : 'border-white/90 text-gray-600 hover:border-gray-300'
                }`}
              >
                {t('marketplace.deviceTier', '设备配置')}
                {deviceTiers.length > 0 && (
                  <span className="bg-cyan-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {deviceTiers.length}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {tierDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-20 min-w-[160px]">
                  <button
                    type="button"
                    onClick={() => {
                      setDeviceTiers([])
                      resetPage()
                    }}
                    className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors flex items-center justify-between ${
                      deviceTiers.length === 0
                        ? 'bg-cyan-50 text-cyan-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t('marketplace.filterAll', '全部')}
                    {deviceTiers.length === 0 && <Check className="w-4 h-4 text-cyan-500" />}
                  </button>
                  {Object.entries(DEVICE_TIER_COLORS).map(([key, { icon, labelKey }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        toggleDeviceTier(key)
                        resetPage()
                      }}
                      className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors flex items-center justify-between ${
                        deviceTiers.includes(key)
                          ? 'bg-cyan-50 text-cyan-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>
                        {icon} {t(labelKey)}
                      </span>
                      {deviceTiers.includes(key) && <Check className="w-4 h-4 text-cyan-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* OS Type Dropdown */}
            <div className="relative" ref={osRef}>
              <button
                type="button"
                onClick={() => {
                  setOsDropdownOpen(!osDropdownOpen)
                  setTierDropdownOpen(false)
                  setSortOpen(false)
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 border-2 text-sm font-bold transition-all ${
                  osTypes.length > 0
                    ? 'border-cyan-300 text-cyan-700 bg-cyan-50'
                    : 'border-white/90 text-gray-600 hover:border-gray-300'
                }`}
              >
                {t('marketplace.osType', '操作系统')}
                {osTypes.length > 0 && (
                  <span className="bg-cyan-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {osTypes.length}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {osDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-20 min-w-[160px]">
                  <button
                    type="button"
                    onClick={() => {
                      setOsTypes([])
                      resetPage()
                    }}
                    className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors flex items-center justify-between ${
                      osTypes.length === 0
                        ? 'bg-cyan-50 text-cyan-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t('marketplace.filterAll', '全部')}
                    {osTypes.length === 0 && <Check className="w-4 h-4 text-cyan-500" />}
                  </button>
                  {Object.entries(OS_LABELS).map(([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        toggleOsType(key)
                        resetPage()
                      }}
                      className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors flex items-center justify-between ${
                        osTypes.includes(key)
                          ? 'bg-cyan-50 text-cyan-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>{label}</span>
                      {osTypes.includes(key) && <Check className="w-4 h-4 text-cyan-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-200" />

            <div className="text-sm font-bold text-gray-500">
              {t('marketplace.resultCount', { count: totalCount })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated && hasActiveRentalsOrListings && (
              <Link
                to="/app/marketplace/my-rentals"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 text-white font-bold text-sm hover:scale-105 transition-transform shadow-md"
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              >
                {t('marketplace.viewMyRentals', '查看我的租赁')}
              </Link>
            )}
            <button
              type="button"
              onClick={handleListMyClaw}
              disabled={listMyClawLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 font-bold text-sm hover:scale-105 transition-transform shadow-md disabled:opacity-60"
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
            >
              {listMyClawLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t('marketplace.listMyClaw')}
            </button>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div key={`skel-${n}`} className="bg-white/60 rounded-2xl p-6 animate-pulse h-72" />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-lg font-bold text-gray-500">{t('marketplace.noResults')}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {paginatedItems.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  onClick={() => {
                    if (isAuthenticated) {
                      navigate({ to: `/app/marketplace/${listing.id}` })
                    } else {
                      navigate({ to: '/login' })
                    }
                  }}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-white/80 border-2 border-white/90 text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <PageLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                      currentPage === page
                        ? 'bg-cyan-500 text-white shadow-md'
                        : 'bg-white/80 border-2 border-white/90 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-white/80 border-2 border-white/90 text-gray-600 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <PageRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ───── Docs CTA ───── */}
      <section className="max-w-4xl mx-auto px-8 md:px-16 pb-20">
        <div className="bg-gradient-to-r from-yellow-50 to-cyan-50 border-2 border-white/90 rounded-3xl p-10 md:p-14 text-center">
          <h2
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
            className="text-3xl md:text-4xl mb-4"
          >
            {t('agents.ctaTitle')}
          </h2>
          <p className="text-lg text-gray-600 font-bold mb-8">{t('agents.ctaSubtitle')}</p>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 font-bold px-10 py-4 rounded-full border-3 border-gray-800 text-xl hover:scale-105 transition-transform"
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          >
            {t('agents.ctaButton')}
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}

/* ──────────────── Listing Card Component ──────────────── */

function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const { t } = useTranslation()
  const tier = DEVICE_TIER_COLORS[listing.deviceTier]

  // Format availability time for display
  const availabilityLabel = (() => {
    if (!listing.availableUntil) return null
    const until = new Date(listing.availableUntil)
    const now = new Date()
    const diffHours = Math.max(0, Math.round((until.getTime() - now.getTime()) / 3600000))
    if (diffHours <= 0) return null
    if (diffHours < 24) return `${diffHours}h`
    const diffDays = Math.round(diffHours / 24)
    if (diffDays < 30) return `${diffDays}d`
    return `${Math.round(diffDays / 30)}mo`
  })()

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left bg-white/70 backdrop-blur-lg border-2 border-white/90 rounded-2xl p-6 hover:-translate-y-1.5 hover:shadow-xl transition-all group cursor-pointer"
    >
      {/* Top row: avatar left, tags right */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar
            userId={listing.ownerId}
            avatarUrl={listing.owner?.avatarUrl}
            displayName={listing.owner?.displayName ?? listing.owner?.username}
            size="md"
            className="shrink-0"
          />
          {listing.owner && (
            <span className="text-xs font-bold text-gray-500 truncate">
              {listing.owner.displayName || listing.owner.username}
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-gradient-to-r ${tier.color}`}
          >
            {tier.icon} {t(tier.labelKey)}
          </span>
          {availabilityLabel && (
            <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
              <Clock className="w-2.5 h-2.5" /> {availabilityLabel}
            </span>
          )}
        </div>
      </div>

      {/* Title: 1 line */}
      <h3
        style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
        className="text-lg font-bold mb-2 line-clamp-1 group-hover:text-cyan-600 transition-colors"
      >
        {listing.title}
      </h3>

      {/* Description: fixed 2-line height */}
      <p className="text-sm text-gray-500 font-medium line-clamp-2 mb-4 leading-relaxed h-[2.8em]">
        {listing.description || t('marketplace.noDescription')}
      </p>

      {/* Online rank */}
      {listing.totalOnlineSeconds > 0 && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-400 font-medium">
          <span>在线 {formatDuration(listing.totalOnlineSeconds)}</span>
          <OnlineRank totalSeconds={listing.totalOnlineSeconds} />
        </div>
      )}

      {/* Footer: price left, stats right */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-amber-600">{listing.hourlyRate}</span>
          <span className="text-xs font-bold text-gray-400">🦐/h</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 font-bold">
          <span className="flex items-center gap-0.5">
            <Eye className="w-3.5 h-3.5" /> {listing.viewCount}
          </span>
          <span className="flex items-center gap-0.5">
            <Users className="w-3.5 h-3.5" /> {listing.rentalCount}
          </span>
        </div>
      </div>
    </button>
  )
}
