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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration, OnlineRank } from '../components/common/online-rank'
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
  baseDailyRate?: number
  messageFee?: number
  pricingVersion?: number
  depositAmount: number
  tokenFeePassthrough: boolean
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

interface CostEstimate {
  rentalCost: number
  electricityCost: number
  platformFee: number
  deposit: number
  totalPerHour: number
  totalEstimate: number
  note: string
  // v2 fields
  baseDailyRate?: number
  dailyBaseCost?: number
  estimatedMessageCost?: number
  messageFee?: number
  pricingVersion?: number
}

const DEVICE_TIER_INFO: Record<string, { labelKey: string; color: string; icon: string }> = {
  high_end: {
    labelKey: 'marketplace.deviceHighEnd',
    color: 'text-accent-strong bg-accent-strong/10',
    icon: '🔥',
  },
  mid_range: {
    labelKey: 'marketplace.deviceMidRange',
    color: 'text-primary bg-primary/10',
    icon: '⚡',
  },
  low_end: {
    labelKey: 'marketplace.deviceLowEnd',
    color: 'text-text-secondary bg-bg-tertiary',
    icon: '💡',
  },
}

const OS_INFO: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
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
  const [isAlreadyRented, setIsAlreadyRented] = useState(false)

  // Fetch listing detail
  const { data: listing, isLoading } = useQuery({
    queryKey: ['marketplace', 'listing', listingId],
    queryFn: () => fetchApi<Listing>(`/api/marketplace/listings/${listingId}`),
    enabled: !!listingId,
  })

  // Compute max available hours based on availability window
  const maxAvailableHours = useMemo(() => {
    if (!listing?.availableUntil) return null
    const until = new Date(listing.availableUntil)
    const now = new Date()
    const diffMs = until.getTime() - now.getTime()
    if (diffMs <= 0) return 0
    return Math.floor(diffMs / 3600000)
  }, [listing?.availableUntil])

  const isOverLimit = maxAvailableHours !== null && durationHours > maxAvailableHours
  const effectiveDurationHours = isOverLimit ? maxAvailableHours : durationHours

  // Fetch cost estimate (use effective duration capped by availability)
  const { data: estimate } = useQuery({
    queryKey: ['marketplace', 'estimate', listingId, effectiveDurationHours],
    queryFn: () =>
      fetchApi<CostEstimate>(
        `/api/marketplace/listings/${listingId}/estimate?hours=${effectiveDurationHours}`,
      ),
    enabled: !!listingId && effectiveDurationHours > 0,
  })

  // Sign contract mutation
  const signMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string }>('/api/marketplace/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          durationHours: effectiveDurationHours || null,
          agreedToTerms: true,
        }),
      }),
    onSuccess: (contract) => {
      setSigned(true)
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.contractSigned', '合同签署成功！'), 'success')
      setTimeout(
        () =>
          navigate({
            to: '/marketplace/contracts/$contractId',
            params: { contractId: contract.id },
          }),
        2500,
      )
    },
    onError: (err: Error) => {
      // Handle "already rented" error gracefully
      if (err.message.includes('currently rented')) {
        setIsAlreadyRented(true)
        setShowContract(false)
        showToast(
          t('marketplace.alreadyRented', '该 Claw 已被其他用户租赁，请稍后再试或选择其他 Claw'),
          'error',
        )
      } else {
        showToast(err.message, 'error')
      }
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
      navigate({ to: '/marketplace/my-rentals' })
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

  if (isLoading || !listing) {
    return (
      <div className="min-h-screen bg-bg-deep flex items-center justify-center">
        <div className="animate-pulse text-text-muted text-lg font-bold">
          {t('common.loading', '加载中...')}
        </div>
      </div>
    )
  }

  const tier = DEVICE_TIER_INFO[listing.deviceTier] ?? DEVICE_TIER_INFO.mid_range!
  const isOwner = currentUser?.id === listing.ownerId

  return (
    <div
      className="min-h-screen bg-bg-deep text-text-primary"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Back */}
        <a
          href="/buddies"
          className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors font-bold mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          {t('marketplace.backToMarket', '返回集市')}
        </a>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Listing Detail */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card */}
            <div className="bg-glass-bg backdrop-blur rounded-2xl border border-glass-border shadow-soft p-8">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                    className="text-3xl font-bold mb-2"
                  >
                    {listing.title}
                  </h1>
                  <div className="flex items-center gap-3 text-sm text-text-muted font-bold">
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
                <p className="text-text-secondary font-medium leading-relaxed mb-6">
                  {listing.description}
                </p>
              )}

              {/* Online rank */}
              {listing.totalOnlineSeconds > 0 && (
                <div className="flex items-center gap-3 mb-6 bg-accent-strong/10 rounded-xl p-3">
                  <span className="text-sm font-bold text-text-secondary">
                    累计在线 {formatDuration(listing.totalOnlineSeconds)}
                  </span>
                  <OnlineRank totalSeconds={listing.totalOnlineSeconds} />
                </div>
              )}

              {/* Skills */}
              {listing.skills.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-text-muted mb-2">
                    {t('marketplace.skills', '技能标签')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {listing.skills.map((skill) => (
                      <span
                        key={skill}
                        className="bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full"
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
                  <div className="bg-bg-secondary rounded-xl p-3">
                    <div className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
                      <Monitor className="w-3.5 h-3.5" /> {t('marketplace.model', '型号')}
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.model}</div>
                  </div>
                )}
                {listing.deviceInfo.cpu && (
                  <div className="bg-bg-secondary rounded-xl p-3">
                    <div className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5" /> CPU
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.cpu}</div>
                  </div>
                )}
                {listing.deviceInfo.ram && (
                  <div className="bg-bg-secondary rounded-xl p-3">
                    <div className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
                      <MemoryStick className="w-3.5 h-3.5" /> RAM
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.ram}</div>
                  </div>
                )}
                {listing.deviceInfo.storage && (
                  <div className="bg-bg-secondary rounded-xl p-3">
                    <div className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" /> {t('marketplace.storage', '存储')}
                    </div>
                    <div className="text-sm font-bold">{listing.deviceInfo.storage}</div>
                  </div>
                )}
              </div>

              {/* Software Tools */}
              {listing.softwareTools.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-text-muted mb-2">
                    {t('marketplace.softwareTools', '已安装工具')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {listing.softwareTools.map((tool) => (
                      <span
                        key={tool}
                        className="bg-bg-tertiary text-text-secondary text-xs font-bold px-2.5 py-1 rounded-full"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Availability Window */}
              {(listing.availableFrom || listing.availableUntil) && (
                <div className="bg-success/5 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-text-muted mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-success" />
                    {t('marketplace.availability', '可用时间')}
                  </h3>
                  <div className="flex gap-4 text-sm font-medium text-text-secondary">
                    {listing.availableFrom && (
                      <span>
                        {t('marketplace.availableFrom', '开始时间')}:{' '}
                        {new Date(listing.availableFrom).toLocaleString()}
                      </span>
                    )}
                    {listing.availableUntil && (
                      <span>
                        {t('marketplace.availableUntil', '结束时间')}:{' '}
                        {new Date(listing.availableUntil).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Guidelines */}
            {listing.guidelines && (
              <div className="bg-glass-bg backdrop-blur rounded-2xl border border-glass-border shadow-soft p-8">
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-warning" />
                  {t('marketplace.usageGuidelines', '使用准则')}
                </h2>
                <div className="text-text-secondary font-medium leading-relaxed whitespace-pre-wrap">
                  {listing.guidelines}
                </div>
              </div>
            )}
          </div>

          {/* Right: Pricing & Action */}
          <div className="space-y-6">
            {/* Pricing Card */}
            <div className="bg-glass-bg backdrop-blur rounded-2xl border border-glass-border shadow-soft p-6 sticky top-6">
              <h2
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                className="text-xl font-bold mb-4"
              >
                {t('marketplace.pricing', '费用详情')}
              </h2>

              {/* Rates */}
              <div className="space-y-3 mb-6">
                {listing.pricingVersion === 2 ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-text-muted flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />{' '}
                        {t('marketplace.baseDailyRate', '基础每日费用')}
                      </span>
                      <span className="text-lg font-bold text-accent-strong">
                        {listing.baseDailyRate ?? 0} 🦐/d
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-text-muted">
                        {t('marketplace.messageFee', '每条消息费用')}
                      </span>
                      <span className="font-bold text-accent-strong">
                        {listing.messageFee ?? 0} 🦐/msg
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-text-muted flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> {t('marketplace.hourlyRate', '时租')}
                      </span>
                      <span className="text-lg font-bold text-accent-strong">
                        {listing.hourlyRate} 🦐/h
                      </span>
                    </div>
                    {listing.dailyRate > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-text-muted">
                          {t('marketplace.dailyRate', '日租')}
                        </span>
                        <span className="font-bold text-accent-strong">
                          {listing.dailyRate} 🦐/d
                        </span>
                      </div>
                    )}
                    {listing.monthlyRate > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-text-muted">
                          {t('marketplace.monthlyRate', '月租')}
                        </span>
                        <span className="font-bold text-accent-strong">
                          {listing.monthlyRate} 🦐/m
                        </span>
                      </div>
                    )}
                  </>
                )}
                {listing.depositAmount > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-divider">
                    <span className="text-sm font-medium text-text-muted flex items-center gap-1.5">
                      <Shield className="w-4 h-4" /> {t('marketplace.deposit', '押金')}
                    </span>
                    <span className="font-bold text-danger">{listing.depositAmount} 🦐</span>
                  </div>
                )}
              </div>

              {/* Duration Selector */}
              <div className="mb-4">
                <label className="text-sm font-bold text-text-muted mb-2 block">
                  {t('marketplace.rentalDuration', '租赁时长（小时）')}
                  <input
                    type="number"
                    min={1}
                    max={8760}
                    value={durationHours}
                    onChange={(e) => setDurationHours(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-border-subtle bg-bg-secondary font-bold text-center text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-border-subtle text-text-muted hover:border-border-subtle'
                      }`}
                    >
                      {h === 1 ? '1h' : h === 24 ? '1d' : h === 168 ? '1w' : '1m'}
                    </button>
                  ))}
                </div>
                {isOverLimit && maxAvailableHours !== null && (
                  <div className="mt-2 bg-warning/10 rounded-lg p-3 text-xs text-warning font-medium">
                    <Clock className="w-3.5 h-3.5 inline mr-1" />
                    {t(
                      'marketplace.availabilityWarning',
                      '此 Claw 最长可用至 {{date}}（剩余 {{hours}} 小时），费用和合同将按限制时间计算。',
                      {
                        date: new Date(listing!.availableUntil!).toLocaleString(),
                        hours: maxAvailableHours,
                      },
                    )}
                  </div>
                )}
              </div>

              {/* Cost Estimate */}
              {estimate && (
                <div className="bg-bg-secondary rounded-xl p-4 mb-6 space-y-2">
                  {estimate.pricingVersion === 2 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">
                          {t('marketplace.dailyBaseCost', '基础日费')}
                        </span>
                        <span className="font-bold">{estimate.dailyBaseCost ?? 0} 🦐</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">
                          {t('marketplace.estimatedMessageCost', '预估消息费')}
                        </span>
                        <span className="font-bold">{estimate.estimatedMessageCost ?? 0} 🦐</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">
                          {t('marketplace.rentalCost', '租赁费用')}
                        </span>
                        <span className="font-bold">{estimate.rentalCost} 🦐</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">
                          {t('marketplace.electricityCost', '电费')}
                        </span>
                        <span className="font-bold">{estimate.electricityCost} 🦐</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">
                      {t('marketplace.platformFee', '平台手续费 (5%)')}
                    </span>
                    <span className="font-bold">{estimate.platformFee} 🦐</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-divider font-bold">
                    <span>{t('marketplace.totalEstimate', '预估总费用')}</span>
                    <span className="text-accent-strong text-base">
                      {estimate.totalEstimate} 🦐
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{estimate.note}</p>
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
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-danger to-danger text-white font-bold text-base hover:brightness-110 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                  >
                    {delistMutation.isPending
                      ? t('common.loading', '处理中...')
                      : t('marketplace.delistClaw', '下架 Claw')}
                  </button>
                  <p className="text-xs text-text-muted text-center mt-3 font-medium">
                    {t('marketplace.delistHint', '下架后此 Claw 将不再展示在集市中')}
                  </p>
                </>
              ) : isAlreadyRented ? (
                <>
                  <button
                    type="button"
                    disabled
                    className="w-full py-3 rounded-xl bg-bg-tertiary text-text-muted font-bold text-base cursor-not-allowed"
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                  >
                    {t('marketplace.alreadyRentedButton', '已被租赁')}
                  </button>
                  <p className="text-xs text-warning text-center mt-3 font-medium">
                    {t(
                      'marketplace.alreadyRentedHint',
                      '该 Claw 当前正在被其他用户使用，暂时无法租赁。请稍后再来看看吧~',
                    )}
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowContract(true)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-accent to-accent-strong text-bg-deep font-bold text-base hover:brightness-110 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                    style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                  >
                    {t('marketplace.rentNow', '立即租赁')}
                  </button>
                  <p className="text-xs text-text-muted text-center mt-3 font-medium">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/50 backdrop-blur-sm p-4"
          onClick={handleModalBackdropClick}
          onKeyDown={() => {}}
        >
          <div
            className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-[#fdfaf5] rounded-xl shadow-2xl p-6 md:p-8 border border-amber-900/10"
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
                className="text-6xl font-black text-amber-900 uppercase tracking-widest whitespace-nowrap opacity-[0.03]"
                style={{ fontFamily: "'ZCOOL KuaiLe', cursive", transform: 'rotate(-20deg)' }}
              >
                SHADOW
              </div>
            </div>

            {/* Paw Stamp */}
            {signed && (
              <div
                className="absolute right-6 md:right-10 bottom-16 pointer-events-none z-20 mix-blend-multiply"
                style={{
                  animation: 'stampIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                }}
              >
                <div className="relative">
                  <svg
                    viewBox="0 0 100 100"
                    className="w-28 h-28 text-red-600/90 drop-shadow-sm fill-current"
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
                  <div className="absolute inset-0 flex items-center justify-center -rotate-12 mt-8">
                    <span
                      className="text-red-700/90 text-base font-bold border-2 border-red-700/90 px-2 py-0.5 rounded-sm tracking-widest"
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
              <div className="text-center mb-5 border-b-2 border-amber-900/10 pb-4">
                <h2
                  className="text-2xl md:text-3xl font-bold text-amber-950 mb-1"
                  style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                >
                  {t('marketplace.rentalContract', 'Buddy 租赁合同')}
                </h2>
                <p className="text-amber-800/60 font-bold uppercase tracking-[0.2em] text-xs">
                  P2P RENTAL AGREEMENT
                </p>
              </div>

              {/* Listing Summary */}
              <div className="bg-white/60 p-3 rounded-xl border border-amber-900/10 mb-4">
                <h3 className="font-bold text-amber-950 text-base mb-0.5">{listing.title}</h3>
                <p className="text-xs text-amber-900/60">
                  {tier.icon} {t(tier.labelKey)} · {OS_INFO[listing.osType]} · {listing.hourlyRate}{' '}
                  🦐/h
                </p>
              </div>

              {/* Terms Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-5 text-sm">
                <div className="flex items-center justify-between border-b border-amber-900/10 pb-2">
                  <span className="font-bold text-amber-950/80 flex items-center gap-1.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {t('marketplace.contractStart', '租赁开始')}
                  </span>
                  <span className="font-mono font-medium text-xs">
                    {new Date().toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-amber-900/10 pb-2">
                  <span className="font-bold text-amber-950/80 flex items-center gap-1.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {t('marketplace.contractDuration', '租赁时长')}
                  </span>
                  <span className="font-mono font-medium text-xs">{effectiveDurationHours}h</span>
                </div>
                <div className="flex items-center justify-between border-b border-amber-900/10 pb-2">
                  <span className="font-bold text-amber-950/80 flex items-center gap-1.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    {t('marketplace.estimatedCost', '预估费用')}
                  </span>
                  <span className="font-mono font-bold text-xs text-amber-700">
                    {estimate?.totalEstimate ?? '...'} 🦐
                  </span>
                </div>
                {listing.depositAmount > 0 && (
                  <div className="flex items-center justify-between pb-2">
                    <span className="font-bold text-amber-950/80 flex items-center gap-1.5 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-danger" />
                      {t('marketplace.contractDeposit', '违约保证金')}
                    </span>
                    <span className="font-mono font-bold text-xs text-danger">
                      {listing.depositAmount} 🦐
                    </span>
                  </div>
                )}
              </div>

              {/* Owner Terms + Platform Terms side by side on larger screens */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {listing.guidelines && (
                  <div>
                    <h3 className="font-bold text-amber-950/80 mb-1.5 flex items-center gap-1.5 text-xs">
                      <FileText className="w-3.5 h-3.5 text-amber-500" />
                      {t('marketplace.ownerTerms', '出租方使用规约')}
                    </h3>
                    <div className="bg-white/40 rounded-lg p-3 text-xs text-amber-900/70 leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto">
                      {listing.guidelines}
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-amber-950/80 mb-1.5 flex items-center gap-1.5 text-xs">
                    <Shield className="w-3.5 h-3.5 text-cyan-500" />
                    {t('marketplace.platformTerms', '平台服务条款')}
                  </h3>
                  <div className="bg-white/40 rounded-lg p-3 text-xs text-amber-900/70 leading-relaxed whitespace-pre-wrap max-h-28 overflow-y-auto">
                    {`虾豆平台 Buddy 租赁服务条款

1. 平台收取 5% 的服务手续费。
2. 出租方不得自行使用已出租的 Buddy，违者需支付违约金。
3. 使用方应遵守使用准则，不得滥用或用于非法用途。
4. Token 消耗费用和电费由使用方承担。
5. 任一方可提前终止租约，已产生的费用不予退还。
6. 发生争议时，平台有权介入调解。
7. 平台保留对违规行为进行处罚的权利。`}
                  </div>
                </div>
              </div>

              {/* Agreement Checkbox */}
              <label className="flex items-start gap-2.5 mb-5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border-subtle text-accent focus:ring-accent/30"
                />
                <span className="text-xs text-amber-900/80 font-medium leading-relaxed">
                  {t(
                    'marketplace.agreeTerms',
                    '我已阅读并同意出租方的使用规约和虾豆平台服务条款，理解租赁期间的费用计算规则、违约条款及相关责任。',
                  )}
                </span>
              </label>

              {/* Signatures */}
              <div className="flex flex-col sm:flex-row justify-between items-end gap-6 px-2">
                <div className="w-full sm:w-2/5">
                  <div className="border-b-[3px] border-amber-900/30 h-10 flex items-end justify-center pb-1.5">
                    <span
                      className="font-medium text-amber-900/70 italic text-lg"
                      style={{ fontFamily: "cursive, 'ZCOOL KuaiLe'" }}
                    >
                      {listing.owner?.displayName ||
                        listing.owner?.username ||
                        t('marketplace.ownerSignature', '出租方')}
                    </span>
                  </div>
                  <p className="text-center text-[11px] text-amber-900/60 mt-1.5 uppercase tracking-widest font-semibold">
                    {t('marketplace.ownerSignatureLabel', '出租方签名')}
                  </p>
                </div>

                <div className="w-full sm:w-2/5 relative flex flex-col items-center min-h-[2.5rem]">
                  {!signed ? (
                    <button
                      type="button"
                      disabled={!agreedToTerms || signMutation.isPending}
                      onClick={() => signMutation.mutate()}
                      className={`w-full max-w-[180px] py-2.5 px-5 rounded-full font-bold text-base shadow-xl transition-all transform ${
                        agreedToTerms
                          ? 'bg-gradient-to-r from-accent to-accent-strong hover:brightness-110 text-bg-deep hover:-translate-y-1 hover:scale-105 active:scale-95 ring-4 ring-accent/20'
                          : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                      }`}
                      style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                    >
                      {signMutation.isPending
                        ? t('common.loading', '处理中...')
                        : t('marketplace.signContract', '确认签约')}
                    </button>
                  ) : (
                    <div className="border-b-[3px] border-amber-900/30 h-10 w-full flex items-end justify-center pb-1.5">
                      <span className="font-medium text-amber-900 font-serif text-xl italic drop-shadow-sm">
                        {currentUser?.displayName ||
                          currentUser?.username ||
                          t('marketplace.signedTenant', '使用方已签')}
                      </span>
                    </div>
                  )}
                  <p className="text-center text-[11px] text-amber-900/60 mt-1.5 uppercase tracking-widest font-semibold">
                    {t('marketplace.tenantSignatureLabel', '使用方签名')}
                  </p>
                </div>
              </div>

              {/* Close button */}
              {!signed && (
                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => setShowContract(false)}
                    className="text-sm text-text-muted hover:text-text-primary font-bold"
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
