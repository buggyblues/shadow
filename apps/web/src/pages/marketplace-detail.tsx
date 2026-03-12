import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  ChevronLeft,
  Clock,
  Cpu,
  Eye,
  FileText,
  HardDrive,
  MemoryStick,
  Monitor,
  Shield,
  Users,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'

interface Listing {
  id: string
  ownerId: string
  title: string
  description: string | null
  skills: string[]
  guidelines: string | null
  deviceTier: 'high_end' | 'mid_range' | 'low_end'
  osType: 'macos' | 'windows' | 'linux'
  deviceInfo: { model?: string; cpu?: string; ram?: string; storage?: string; gpu?: string }
  softwareTools: string[]
  hourlyRate: number
  dailyRate: number
  monthlyRate: number
  premiumMarkup: number
  depositAmount: number
  tokenFeePassthrough: boolean
  viewCount: number
  rentalCount: number
  tags: string[]
  availableFrom: string | null
  availableUntil: string | null
  createdAt: string
}

interface CostEstimate {
  rentalCost: number
  electricityCost: number
  platformFee: number
  deposit: number
  totalPerHour: number
  totalEstimate: number
  note: string
}

const DEVICE_TIER_INFO: Record<string, { labelKey: string; color: string; icon: string }> = {
  high_end: {
    labelKey: 'marketplace.deviceHighEnd',
    color: 'text-amber-600 bg-amber-50',
    icon: '🔥',
  },
  mid_range: {
    labelKey: 'marketplace.deviceMidRange',
    color: 'text-blue-600 bg-blue-50',
    icon: '⚡',
  },
  low_end: { labelKey: 'marketplace.deviceLowEnd', color: 'text-gray-600 bg-gray-50', icon: '💡' },
}

const OS_INFO: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

/* ──────────── Official Buddy Data ──────────── */

const OFFICIAL_BUDDY_RATE = 5

const OFFICIAL_BUDDIES: Record<string, { nameKey: string; descKey: string; tagKeys: string[] }> = {
  codingcat: {
    nameKey: 'agents.codingCat',
    descKey: 'agents.codingCatDesc',
    tagKeys: ['agents.tagCodeGen', 'agents.tagCodeReview', 'agents.tagDebug'],
  },
  documeow: {
    nameKey: 'agents.docuMeow',
    descKey: 'agents.docuMeowDesc',
    tagKeys: ['agents.tagDocGen', 'agents.tagSummary', 'agents.tagApiDoc'],
  },
  designcat: {
    nameKey: 'agents.designCat',
    descKey: 'agents.designCatDesc',
    tagKeys: ['agents.tagUiDesign', 'agents.tagColor', 'agents.tagComponent'],
  },
  detectivecat: {
    nameKey: 'agents.detectiveCat',
    descKey: 'agents.detectiveCatDesc',
    tagKeys: ['agents.tagDebug', 'agents.tagLogAnalysis', 'agents.tagSearch'],
  },
  opscat: {
    nameKey: 'agents.opsCat',
    descKey: 'agents.opsCatDesc',
    tagKeys: ['agents.tagDevOps', 'agents.tagMonitor', 'agents.tagDeploy'],
  },
  customagent: {
    nameKey: 'agents.customAgent',
    descKey: 'agents.customAgentDesc',
    tagKeys: ['agents.tagCustom', 'agents.tagMcp', 'agents.tagApi'],
  },
}

export function MarketplaceDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { listingId } = useParams({ strict: false }) as { listingId: string }
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [durationHours, setDurationHours] = useState(24)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showContract, setShowContract] = useState(false)
  const [signed, setSigned] = useState(false)

  // Detect official buddy
  const isOfficial = listingId?.startsWith('official-')
  const officialSlug = isOfficial ? listingId.slice('official-'.length) : null
  const officialBuddy = officialSlug ? OFFICIAL_BUDDIES[officialSlug] : null

  const officialListing: Listing | null = officialBuddy
    ? {
        id: listingId,
        ownerId: 'system',
        title: t(officialBuddy.nameKey),
        description: t(officialBuddy.descKey),
        skills: officialBuddy.tagKeys.map((k) => t(k)),
        guidelines: null,
        deviceTier: 'high_end',
        osType: 'linux',
        deviceInfo: { model: 'Shadow Cloud', cpu: 'Cloud vCPU', ram: '16GB', storage: '256GB SSD' },
        softwareTools: [],
        hourlyRate: OFFICIAL_BUDDY_RATE,
        dailyRate: OFFICIAL_BUDDY_RATE * 24,
        monthlyRate: OFFICIAL_BUDDY_RATE * 720,
        premiumMarkup: 0,
        depositAmount: 0,
        tokenFeePassthrough: false,
        viewCount: 0,
        rentalCount: 0,
        tags: [],
        availableFrom: null,
        availableUntil: null,
        createdAt: new Date().toISOString(),
      }
    : null

  // Fetch listing detail (skip for official buddies)
  const { data: apiListing, isLoading } = useQuery({
    queryKey: ['marketplace', 'listing', listingId],
    queryFn: () => fetchApi<Listing>(`/api/marketplace/listings/${listingId}`),
    enabled: !!listingId && !isOfficial,
  })

  const listing = isOfficial ? officialListing : apiListing

  // Fetch cost estimate (skip for official buddies)
  const { data: estimate } = useQuery({
    queryKey: ['marketplace', 'estimate', listingId, durationHours],
    queryFn: () =>
      fetchApi<CostEstimate>(
        `/api/marketplace/listings/${listingId}/estimate?hours=${durationHours}`,
      ),
    enabled: !!listingId && !isOfficial && durationHours > 0,
  })

  // Sign contract mutation
  const signMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/marketplace/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          durationHours: durationHours || null,
          agreedToTerms: true,
        }),
      }),
    onSuccess: () => {
      setSigned(true)
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.contractSigned', '合同签署成功！'), 'success')
      setTimeout(() => navigate({ to: '/app/marketplace/my-rentals' }), 2500)
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
    },
  })

  // Delist mutation (for owner's own listing)
  const delistMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/marketplace/listings/${listingId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isListed: false }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.delistSuccess', 'Claw 已下架'), 'success')
      navigate({ to: '/app/marketplace/my-rentals' })
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
    },
  })

  // Handle clicking outside the contract modal to close it
  const handleModalBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !signed) {
        setShowContract(false)
      }
    },
    [signed],
  )

  if ((!isOfficial && isLoading) || !listing) {
    return (
      <div className="min-h-screen bg-[#f2f7fc] flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-lg font-bold">
          {t('common.loading', '加载中...')}
        </div>
      </div>
    )
  }

  const tier = DEVICE_TIER_INFO[listing.deviceTier] ?? DEVICE_TIER_INFO.mid_range!
  const isOwner = currentUser?.id === listing.ownerId

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Back */}
        <Link
          to="/buddies"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors font-bold mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          {t('marketplace.backToMarket', '返回集市')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Listing Detail */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card */}
            <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-8">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                    className="text-3xl font-bold mb-2"
                  >
                    {listing.title}
                  </h1>
                  <div className="flex items-center gap-3 text-sm text-gray-500 font-bold">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${tier.color}`}
                    >
                      {tier.icon} {t(tier.labelKey)}
                    </span>
                    <span>{OS_INFO[listing.osType]}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> {listing.viewCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {listing.rentalCount}{' '}
                      {t('marketplace.rentals', '次租赁')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              {listing.description && (
                <p className="text-gray-600 font-medium leading-relaxed mb-6">
                  {listing.description}
                </p>
              )}

              {/* Skills */}
              {listing.skills.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-gray-500 mb-2">
                    {t('marketplace.skills', '技能标签')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {listing.skills.map((skill) => (
                      <span
                        key={skill}
                        className="bg-cyan-50 text-cyan-700 text-sm font-bold px-3 py-1 rounded-full"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Device Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {listing.deviceInfo.model && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                      <Monitor className="w-3.5 h-3.5" /> {t('marketplace.model', '型号')}
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.model}</div>
                  </div>
                )}
                {listing.deviceInfo.cpu && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5" /> CPU
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.cpu}</div>
                  </div>
                )}
                {listing.deviceInfo.ram && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                      <MemoryStick className="w-3.5 h-3.5" /> RAM
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.ram}</div>
                  </div>
                )}
                {listing.deviceInfo.storage && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" /> {t('marketplace.storage', '存储')}
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.storage}</div>
                  </div>
                )}
              </div>

              {/* Software Tools */}
              {listing.softwareTools.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-2">
                    {t('marketplace.softwareTools', '已安装工具')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {listing.softwareTools.map((tool) => (
                      <span
                        key={tool}
                        className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Guidelines */}
            {listing.guidelines && (
              <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-8">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-500" />
                  {t('marketplace.usageGuidelines', '使用准则')}
                </h2>
                <div className="text-gray-600 font-medium leading-relaxed whitespace-pre-wrap">
                  {listing.guidelines}
                </div>
              </div>
            )}
          </div>

          {/* Right: Pricing & Action */}
          <div className="space-y-6">
            {/* Pricing Card */}
            <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-6 sticky top-6">
              <h2
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                className="text-xl font-bold mb-4"
              >
                {t('marketplace.pricing', '费用详情')}
              </h2>

              {/* Rates */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> {t('marketplace.hourlyRate', '时租')}
                  </span>
                  <span className="text-lg font-bold text-amber-600">
                    {listing.hourlyRate} 🦐/h
                  </span>
                </div>
                {listing.dailyRate > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">
                      {t('marketplace.dailyRate', '日租')}
                    </span>
                    <span className="font-bold text-amber-600">{listing.dailyRate} 🦐/d</span>
                  </div>
                )}
                {listing.monthlyRate > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">
                      {t('marketplace.monthlyRate', '月租')}
                    </span>
                    <span className="font-bold text-amber-600">{listing.monthlyRate} 🦐/m</span>
                  </div>
                )}
                {listing.depositAmount > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                      <Shield className="w-4 h-4" /> {t('marketplace.deposit', '押金')}
                    </span>
                    <span className="font-bold text-rose-600">{listing.depositAmount} 🦐</span>
                  </div>
                )}
              </div>

              {/* Duration Selector */}
              <div className="mb-4">
                <label className="text-sm font-bold text-gray-500 mb-2 block">
                  {t('marketplace.rentalDuration', '租赁时长（小时）')}
                  <input
                    type="number"
                    min={1}
                    max={8760}
                    value={durationHours}
                    onChange={(e) => setDurationHours(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 font-bold text-center focus:outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>
                <div className="flex gap-2 mt-2">
                  {[1, 24, 168, 720].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDurationHours(h)}
                      className={`flex-1 py-1 text-xs font-bold rounded-lg border transition-all ${
                        durationHours === h
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {h === 1 ? '1h' : h === 24 ? '1d' : h === 168 ? '1w' : '1m'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost Estimate */}
              {estimate && (
                <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('marketplace.rentalCost', '租赁费用')}</span>
                    <span className="font-bold">{estimate.rentalCost} 🦐</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {t('marketplace.electricityCost', '电费')}
                    </span>
                    <span className="font-bold">{estimate.electricityCost} 🦐</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {t('marketplace.platformFee', '平台手续费 (5%)')}
                    </span>
                    <span className="font-bold">{estimate.platformFee} 🦐</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-200 font-bold">
                    <span>{t('marketplace.totalEstimate', '预估总费用')}</span>
                    <span className="text-amber-600 text-base">{estimate.totalEstimate} 🦐</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{estimate.note}</p>
                </div>
              )}

              {/* Action Button: delist (owner) or rent (others) */}
              {isOwner ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(t('marketplace.confirmDelist', '确定要下架此 Claw 吗？'))
                      ) {
                        delistMutation.mutate()
                      }
                    }}
                    disabled={delistMutation.isPending}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-red-400 to-red-500 text-white font-bold text-base hover:from-red-500 hover:to-red-600 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                  >
                    {delistMutation.isPending
                      ? t('common.loading', '处理中...')
                      : t('marketplace.delistClaw', '下架 Claw')}
                  </button>
                  <p className="text-xs text-gray-400 text-center mt-3 font-medium">
                    {t('marketplace.delistHint', '下架后此 Claw 将不再展示在集市中')}
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (isOfficial && officialSlug) {
                        navigate({ to: `/buddies/${officialSlug}/contract` })
                      } else {
                        setShowContract(true)
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 font-bold text-base hover:from-amber-500 hover:to-amber-600 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                  >
                    {t('marketplace.rentNow', '立即租赁')}
                  </button>
                  <p className="text-xs text-gray-400 text-center mt-3 font-medium">
                    {t('marketplace.rentDisclaimer', '租赁前请仔细阅读使用规约和平台条款')}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contract Modal */}
      {showContract && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={handleModalBackdropClick}
          onKeyDown={() => {}}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] overflow-y-auto bg-[#fdfaf5] rounded-xl shadow-2xl p-8 md:p-12 border border-amber-900/10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E")`,
              boxShadow:
                '0 25px 50px -12px rgba(135, 120, 80, 0.25), 0 0 15px rgba(220, 200, 160, 0.3) inset',
            }}
          >
            <style
              // biome-ignore lint: needed for inline keyframe anim
              dangerouslySetInnerHTML={{
                __html: `
              @keyframes stampIn {
                0% { opacity: 0; transform: scale(3) rotate(-30deg); }
                50% { opacity: 1; transform: scale(0.9) rotate(-15deg); }
                100% { opacity: 0.85; transform: scale(1) rotate(-15deg); }
              }
            `,
              }}
            />

            {/* Watermark */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none -z-0">
              <div
                className="text-7xl md:text-8xl font-black text-amber-900 uppercase tracking-widest whitespace-nowrap opacity-[0.03]"
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive", transform: 'rotate(-20deg)' }}
              >
                SHADOW
              </div>
            </div>

            {/* Paw Stamp */}
            {signed && (
              <div
                className="absolute right-8 md:right-12 bottom-20 pointer-events-none z-20 mix-blend-multiply"
                style={{
                  animation: 'stampIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                }}
              >
                <div className="relative">
                  <svg
                    viewBox="0 0 100 100"
                    className="w-36 h-36 text-red-600/90 drop-shadow-sm fill-current"
                    style={{ filter: 'url(#stamp-tex)' }}
                  >
                    <title>Approved</title>
                    <defs>
                      <filter id="stamp-tex">
                        <feTurbulence
                          type="fractalNoise"
                          baseFrequency="0.5"
                          numOctaves="2"
                          result="noise"
                        />
                        <feDisplacementMap
                          in="SourceGraphic"
                          in2="noise"
                          scale="3"
                          xChannelSelector="R"
                          yChannelSelector="G"
                        />
                      </filter>
                    </defs>
                    <path d="M50 85 C30 85, 20 70, 25 55 C30 40, 45 45, 50 45 C55 45, 70 40, 75 55 C80 70, 70 85, 50 85 Z" />
                    <circle cx="25" cy="40" r="10" />
                    <circle cx="40" cy="25" r="11" />
                    <circle cx="60" cy="25" r="11" />
                    <circle cx="75" cy="40" r="10" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center -rotate-12 mt-10">
                    <span
                      className="text-red-700/90 text-xl font-bold border-2 border-red-700/90 px-3 py-1 rounded-sm tracking-widest"
                      style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                    >
                      {t('contract.approved', 'APPROVED')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="relative z-10">
              {/* Header */}
              <div className="text-center mb-8 border-b-2 border-amber-900/10 pb-6">
                <h2
                  className="text-3xl md:text-4xl font-bold text-amber-950 mb-2"
                  style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                >
                  {t('marketplace.rentalContract', 'OpenClaw 租赁合同')}
                </h2>
                <p className="text-amber-800/60 font-bold uppercase tracking-[0.2em] text-sm">
                  P2P RENTAL AGREEMENT
                </p>
              </div>

              {/* Listing Summary */}
              <div className="bg-white/60 p-5 rounded-xl border border-amber-900/10 mb-6">
                <h3 className="font-bold text-amber-950 text-lg mb-1">{listing.title}</h3>
                <p className="text-sm text-amber-900/60">
                  {tier.icon} {t(tier.labelKey)} · {OS_INFO[listing.osType]} · {listing.hourlyRate}{' '}
                  🦐/h
                </p>
              </div>

              {/* Terms */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between border-b border-amber-900/10 pb-3">
                  <span className="font-bold text-amber-950/80 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    {t('marketplace.contractStart', '租赁开始')}
                  </span>
                  <span className="font-mono font-medium px-3 py-1 rounded bg-white/50 text-sm">
                    {new Date().toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-amber-900/10 pb-3">
                  <span className="font-bold text-amber-950/80 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    {t('marketplace.contractDuration', '租赁时长')}
                  </span>
                  <span className="font-mono font-medium px-3 py-1 rounded bg-white/50 text-sm">
                    {durationHours}h
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-amber-900/10 pb-3">
                  <span className="font-bold text-amber-950/80 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    {t('marketplace.estimatedCost', '预估费用')}
                  </span>
                  <span className="font-mono font-bold px-3 py-1 rounded bg-amber-50 text-amber-700 text-sm">
                    {estimate?.totalEstimate ?? '...'} 🦐
                  </span>
                </div>
                {listing.depositAmount > 0 && (
                  <div className="flex items-center justify-between pb-3">
                    <span className="font-bold text-amber-950/80 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-400" />
                      {t('marketplace.contractDeposit', '违约保证金')}
                    </span>
                    <span className="font-mono font-bold px-3 py-1 rounded bg-rose-50 text-rose-700 text-sm">
                      {listing.depositAmount} 🦐
                    </span>
                  </div>
                )}
              </div>

              {/* Owner Terms */}
              {listing.guidelines && (
                <div className="mb-6">
                  <h3 className="font-bold text-amber-950/80 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-500" />
                    {t('marketplace.ownerTerms', '出租方使用规约')}
                  </h3>
                  <div className="bg-white/40 rounded-lg p-4 text-sm text-amber-900/70 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {listing.guidelines}
                  </div>
                </div>
              )}

              {/* Platform Terms */}
              <div className="mb-8">
                <h3 className="font-bold text-amber-950/80 mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-500" />
                  {t('marketplace.platformTerms', '平台服务条款')}
                </h3>
                <div className="bg-white/40 rounded-lg p-4 text-sm text-amber-900/70 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {`虾豆平台 OpenClaw 租赁服务条款

1. 平台收取 5% 的服务手续费。
2. 出租方在租赁期间不得自行使用已出租的 OpenClaw，违者需支付合同约定的违约金。
3. 使用方应遵守出租方设定的使用准则，不得滥用或用于非法用途。
4. Token 消耗费用和电费由使用方承担。
5. 任一方可提前终止租约，已产生的费用不予退还。
6. 发生争议时，平台有权介入调解。
7. 平台保留对违规行为进行处罚的权利。`}
                </div>
              </div>

              {/* Agreement Checkbox */}
              <label className="flex items-start gap-3 mb-8 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-amber-500 focus:ring-amber-300"
                />
                <span className="text-sm text-amber-900/80 font-medium leading-relaxed">
                  {t(
                    'marketplace.agreeTerms',
                    '我已阅读并同意出租方的使用规约和虾豆平台服务条款，理解租赁期间的费用计算规则、违约条款及相关责任。',
                  )}
                </span>
              </label>

              {/* Signatures */}
              <div className="flex flex-col sm:flex-row justify-between items-end gap-8 px-2">
                <div className="w-full sm:w-2/5">
                  <div className="border-b-[3px] border-amber-900/30 h-14 flex items-end justify-center pb-2">
                    <span
                      className="font-medium text-amber-900/40 italic text-xl"
                      style={{ fontFamily: "cursive, 'ZCOOL KuaiLe'" }}
                    >
                      {t('marketplace.ownerSignature', '出租方')}
                    </span>
                  </div>
                  <p className="text-center text-xs text-amber-900/60 mt-2 uppercase tracking-widest font-semibold">
                    {t('marketplace.ownerSignatureLabel', '出租方签名')}
                  </p>
                </div>

                <div className="w-full sm:w-2/5 relative flex flex-col items-center min-h-[3.5rem]">
                  {!signed ? (
                    <button
                      type="button"
                      disabled={!agreedToTerms || signMutation.isPending}
                      onClick={() => signMutation.mutate()}
                      className={`w-full max-w-[200px] py-3 px-6 rounded-full font-bold text-lg shadow-xl transition-all transform ${
                        agreedToTerms
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white hover:-translate-y-1 hover:scale-105 active:scale-95 ring-4 ring-amber-100'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                    >
                      {signMutation.isPending
                        ? t('common.loading', '处理中...')
                        : t('marketplace.signContract', '确认签约')}
                    </button>
                  ) : (
                    <div className="border-b-[3px] border-amber-900/30 h-14 w-full flex items-end justify-center pb-2">
                      <span className="font-medium text-amber-900 font-serif text-2xl italic drop-shadow-sm">
                        {t('marketplace.signedTenant', '使用方已签')}
                      </span>
                    </div>
                  )}
                  <p className="text-center text-xs text-amber-900/60 mt-2 uppercase tracking-widest font-semibold">
                    {t('marketplace.tenantSignatureLabel', '使用方签名')}
                  </p>
                </div>
              </div>

              {/* Close button */}
              {!signed && (
                <div className="text-center mt-6">
                  <button
                    type="button"
                    onClick={() => setShowContract(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 font-bold"
                  >
                    {t('common.cancel', '取消')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
