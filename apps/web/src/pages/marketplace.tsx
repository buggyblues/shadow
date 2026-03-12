import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Apple,
  ArrowUpDown,
  ChevronDown,
  Eye,
  Laptop,
  Monitor,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { useMarketplaceStore } from '../stores/marketplace.store'
import { PublicFooter, PublicNav } from './home'

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
}

const DEVICE_TIER_COLORS: Record<string, { color: string; icon: string; labelKey: string }> = {
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

const OS_LABELS: Record<string, { label: string; icon: typeof Apple }> = {
  macos: { label: 'macOS', icon: Apple },
  windows: { label: 'Windows', icon: Monitor },
  linux: { label: 'Linux', icon: Laptop },
}

const SORT_OPTIONS = [
  { value: 'popular', labelKey: 'marketplace.popular' },
  { value: 'newest', labelKey: 'marketplace.newest' },
  { value: 'price-asc', labelKey: 'marketplace.priceAsc' },
  { value: 'price-desc', labelKey: 'marketplace.priceDesc' },
] as const

export function MarketplacePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  useAppStatus({ title: t('marketplace.title', 'Buddy 集市'), variant: 'market' })

  const {
    searchQuery,
    setSearchQuery,
    deviceTier,
    setDeviceTier,
    osType,
    setOsType,
    sortBy,
    setSortBy,
  } = useMarketplaceStore()

  const [showFilters, setShowFilters] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', 'listings', searchQuery, deviceTier, osType, sortBy],
    queryFn: () => {
      const params = new URLSearchParams()
      if (searchQuery) params.set('keyword', searchQuery)
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

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <PublicNav />

      {/* Hero Section */}
      <section className="pt-28 pb-8 px-8 md:px-16 max-w-7xl mx-auto text-center relative overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-yellow-300/15 rounded-full blur-3xl -z-10 animate-pulse" />
        <div
          className="absolute top-32 right-10 w-80 h-80 bg-cyan-300/15 rounded-full blur-3xl -z-10 animate-pulse"
          style={{ animationDelay: '1s' }}
        />

        <h1
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className="text-4xl md:text-6xl mb-4 leading-tight"
        >
          {t('marketplace.title', 'Buddy 集市')}
        </h1>
        <p className="text-lg md:text-xl text-gray-600 font-bold max-w-3xl mx-auto mb-8">
          {t('marketplace.subtitle', '在这里找到适合你的 OpenClaw，让别人的 Buddy 为你打工！')}
        </p>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('marketplace.searchPlaceholder', '搜索 OpenClaw 名称、技能、标签...')}
            className="w-full pl-12 pr-12 py-4 rounded-2xl bg-white/80 backdrop-blur border-2 border-white/90 shadow-lg text-base font-medium placeholder:text-gray-400 focus:outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${showFilters ? 'bg-cyan-100 text-cyan-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="max-w-2xl mx-auto mt-4 bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-6 animate-fade-in-up">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Device Tier */}
              <div>
                <div className="text-sm font-bold text-gray-500 mb-2">
                  {t('marketplace.deviceTier', '设备级别')}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(DEVICE_TIER_COLORS).map(([key, { icon, labelKey }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDeviceTier(deviceTier === key ? null : key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all ${
                        deviceTier === key
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {icon} {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              {/* OS Type */}
              <div>
                <div className="text-sm font-bold text-gray-500 mb-2">
                  {t('marketplace.osType', '操作系统')}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(OS_LABELS).map(([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOsType(osType === key ? null : key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all ${
                        osType === key
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Toolbar */}
      <section className="max-w-7xl mx-auto px-8 md:px-16 pb-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-gray-500">
            {t('marketplace.resultCount', '共 {{count}} 个 OpenClaw 可供租赁', { count: total })}
          </div>
          <div className="flex items-center gap-3">
            {/* Sort */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 border-2 border-white/90 text-sm font-bold text-gray-600 hover:border-gray-300 transition-all"
              >
                <ArrowUpDown className="w-4 h-4" />
                {t(
                  SORT_OPTIONS.find((o) => o.value === sortBy)?.labelKey ??
                    'marketplace.sortPopular',
                )}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-20 min-w-[140px]">
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

            {/* List my claw button */}
            {isAuthenticated && (
              <Link
                to="/app/marketplace/create"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 font-bold text-sm hover:scale-105 transition-transform shadow-md"
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              >
                <Plus className="w-4 h-4" />
                {t('marketplace.listMyClaw', '出租我的 Claw')}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Listing Grid */}
      <section className="max-w-7xl mx-auto px-8 md:px-16 pb-24">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div key={`skel-${n}`} className="bg-white/60 rounded-2xl p-6 animate-pulse h-72" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-lg font-bold text-gray-500">
              {t('marketplace.noResults', '暂无可租赁的 OpenClaw，快来发布第一个吧！')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listings.map((listing) => (
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
        )}
      </section>

      {/* CTA: My Rentals */}
      {isAuthenticated && (
        <section className="max-w-4xl mx-auto px-8 md:px-16 pb-20">
          <div className="bg-gradient-to-r from-yellow-50 to-cyan-50 border-2 border-white/90 rounded-3xl p-10 md:p-14 text-center">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-3xl md:text-4xl mb-4"
            >
              {t('marketplace.myRentalsCta', '查看我的租赁')}
            </h2>
            <p className="text-lg text-gray-600 font-bold mb-8">
              {t('marketplace.myRentalsCtaDesc', '管理你出租和使用中的 OpenClaw 合约')}
            </p>
            <Link
              to="/app/marketplace/my-rentals"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-400 to-cyan-500 text-white font-bold px-10 py-4 rounded-full text-xl hover:scale-105 transition-transform shadow-lg"
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
            >
              {t('marketplace.goToMyRentals', '我的租赁')}
            </Link>
          </div>
        </section>
      )}

      <PublicFooter />
    </div>
  )
}

/* ──────────────── Listing Card Component ──────────────── */

function ListingCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const { t } = useTranslation()
  const tier = DEVICE_TIER_COLORS[listing.deviceTier] || DEVICE_TIER_COLORS.mid_range
  const os = OS_LABELS[listing.osType] || OS_LABELS.macos

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left bg-white/70 backdrop-blur-lg border-2 border-white/90 rounded-2xl p-6 hover:-translate-y-1.5 hover:shadow-xl transition-all group cursor-pointer"
    >
      {/* Header: device tier badge + OS */}
      <div className="flex items-center justify-between mb-4">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${tier.color}`}
        >
          {tier.icon} {t(tier.labelKey)}
        </span>
        <span className="text-xs font-bold text-gray-400 flex items-center gap-1">{os.label}</span>
      </div>

      {/* Title */}
      <h3
        style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
        className="text-lg font-bold mb-2 line-clamp-1 group-hover:text-cyan-600 transition-colors"
      >
        {listing.title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-500 font-medium line-clamp-2 mb-4 leading-relaxed">
        {listing.description || t('marketplace.noDescription', '暂无描述')}
      </p>

      {/* Skills */}
      {listing.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {listing.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="bg-cyan-50 text-cyan-700 text-xs font-bold px-2 py-0.5 rounded-full"
            >
              {skill}
            </span>
          ))}
          {listing.skills.length > 3 && (
            <span className="text-xs font-bold text-gray-400">+{listing.skills.length - 3}</span>
          )}
        </div>
      )}

      {/* Price & Stats */}
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
