import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  GlassPanel,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Separator,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  HardDrive,
  Laptop,
  MessageSquare,
  Monitor,
  Shield,
  Tag,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration, OnlineRank } from '../components/common/online-rank'
import { PriceDisplay } from '../components/shop/ui/currency'
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
  baseDailyRate?: number
  dailyBaseCost?: number
  estimatedMessageCost?: number
  messageFee?: number
  pricingVersion?: number
}

const OS_LABEL: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

const RENTAL_PRESETS = [
  { label: '1h', value: 1 },
  { label: '1d', value: 24 },
  { label: '7d', value: 168 },
  { label: '30d', value: 720 },
] as const

function getDeviceTierLabel(listing: Listing, t: TFunction<'translation', undefined>) {
  if (listing.deviceTier === 'high_end') return t('marketplace.deviceHighEnd', '高配')
  if (listing.deviceTier === 'mid_range') return t('marketplace.deviceMidRange', '中端')
  return t('marketplace.deviceLowEnd', '入门')
}

export function MarketplaceDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { listingId } = useParams({ strict: false }) as { listingId: string }
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [durationHours, setDurationHours] = useState(24)
  const [showContract, setShowContract] = useState(false)
  const [isAlreadyRented, setIsAlreadyRented] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const { data: listing, isLoading } = useQuery({
    queryKey: ['marketplace', 'listing', listingId],
    queryFn: () => fetchApi<Listing>(`/api/marketplace/listings/${listingId}`),
    enabled: !!listingId,
  })

  const maxAvailableHours = useMemo(() => {
    if (!listing?.availableUntil) return null
    const until = new Date(listing.availableUntil)
    const now = new Date()
    const remainMs = until.getTime() - now.getTime()
    if (remainMs <= 0) return 0
    return Math.floor(remainMs / 3600000)
  }, [listing?.availableUntil])

  const isUnavailableByWindow = maxAvailableHours === 0
  const effectiveDurationHours =
    maxAvailableHours == null || maxAvailableHours <= 0
      ? Math.max(1, durationHours)
      : Math.min(durationHours, maxAvailableHours)
  const isScheduleLimited = maxAvailableHours !== null && maxAvailableHours > 0
  const effectiveDuration = isUnavailableByWindow ? 0 : effectiveDurationHours

  const { data: estimate } = useQuery({
    queryKey: ['marketplace', 'estimate', listingId, effectiveDuration],
    queryFn: () =>
      fetchApi<CostEstimate>(
        `/api/marketplace/listings/${listingId}/estimate?hours=${effectiveDuration}`,
      ),
    enabled: !!listingId && effectiveDuration > 0,
  })

  const signMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string }>('/api/marketplace/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          durationHours: effectiveDuration || null,
          agreedToTerms: true,
        }),
      }),
    onSuccess: (contract) => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.contractSigned', '合同签署成功！'), 'success')
      setShowContract(false)
      setTimeout(() => {
        navigate({
          to: '/marketplace/contracts/$contractId',
          params: { contractId: contract.id },
        })
      }, 1800)
    },
    onError: (err: Error) => {
      if (err.message.includes('currently rented')) {
        setIsAlreadyRented(true)
        setShowContract(false)
        showToast(
          t('marketplace.alreadyRented', '该 Buddy 已被其他用户租赁，请稍后再试或选择其他 Buddy'),
          'error',
        )
      } else {
        showToast(err.message, 'error')
      }
    },
  })

  const delistMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/marketplace/listings/${listingId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isListed: false }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.delistSuccess', 'Buddy 已下架'), 'success')
      navigate({ to: '/settings/buddy/market', search: {} })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const isOwner = currentUser?.id === listing?.ownerId
  const ownerName =
    listing?.owner?.displayName || listing?.owner?.username || t('marketplace.unknownOwner', '未知')
  const ownerLink = listing?.owner?.id ? `/profile/${listing.owner.id}` : undefined
  const ownerUserId = listing?.owner?.id
  const canMessageOwner = Boolean(ownerUserId && currentUser?.id && ownerUserId !== currentUser.id)
  const messageOwnerMutation = useMutation({
    mutationFn: (agentUserId: string) =>
      fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId: agentUserId }),
      }),
    onSuccess: (data) => {
      navigate({ to: '/dm/$dmChannelId', params: { dmChannelId: data.id } })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })
  const avatarStatus =
    listing?.totalOnlineSeconds && listing.totalOnlineSeconds > 0 ? 'running' : 'offline'
  const displayRateLabel =
    listing?.pricingVersion === 2
      ? t('marketplace.dailyRate', '日租')
      : t('marketplace.hourlyRate', '时租')
  const displayRateValue =
    listing?.pricingVersion === 2
      ? (listing.baseDailyRate ?? listing.dailyRate ?? 0)
      : (listing?.hourlyRate ?? 0)
  const displayRateUnit =
    listing?.pricingVersion === 2
      ? t('marketplace.dailyRateUnit', '🦐/d')
      : t('marketplace.hourlyRateUnit', '🦐/h')

  const capabilityRows = useMemo(() => {
    if (!listing) return [] as Array<{ label: string; value: string; icon: typeof Laptop }>
    return [
      {
        label: t('marketplace.model', '型号'),
        value: listing.deviceInfo.model ?? t('marketplace.noDescription', '未填写'),
        icon: Laptop,
      },
      {
        label: t('marketplace.cpu', 'CPU'),
        value: listing.deviceInfo.cpu ?? t('marketplace.noDescription', '未填写'),
        icon: Monitor,
      },
      {
        label: t('marketplace.ram', '内存'),
        value: listing.deviceInfo.ram ?? t('marketplace.noDescription', '未填写'),
        icon: Cpu,
      },
      {
        label: t('marketplace.storage', '存储'),
        value: listing.deviceInfo.storage ?? t('marketplace.noDescription', '未填写'),
        icon: HardDrive,
      },
      {
        label: t('marketplace.gpu', '显卡'),
        value: listing.deviceInfo.gpu ?? t('marketplace.noDescription', '未填写'),
        icon: Users,
      },
    ].filter((item) => item.value)
  }, [listing, t])

  const skillBadges = useMemo(() => {
    const fromSkills = listing?.skills ?? []
    const fromTags = listing?.tags ?? []
    return fromSkills.length > 0 ? fromSkills : fromTags
  }, [listing?.skills, listing?.tags])

  const actionButtonLabel = isOwner
    ? t('marketplace.delistBuddy', '下架 Buddy')
    : isUnavailableByWindow
      ? t('marketplace.unavailable', '当前不可租赁')
      : isAlreadyRented
        ? t('marketplace.alreadyRentedButton', '已被租赁')
        : t('marketplace.rentNow', '立即租赁')

  const actionDisabled = isOwner
    ? delistMutation.isPending
    : isUnavailableByWindow || isAlreadyRented || signMutation.isPending

  if (isLoading || !listing) {
    return (
      <GlassPanel className="h-full min-h-screen overflow-y-auto rounded-[32px] border border-[var(--glass-line)] p-6">
        <div className="flex h-full items-center justify-center text-text-muted">
          <div className="text-sm font-black">{t('common.loading', '加载中...')}</div>
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="h-full min-h-screen overflow-y-auto rounded-[32px] border border-[var(--glass-line)] text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/buddy/market" className="text-text-muted hover:text-text-primary">
              <ArrowLeft size={15} />
              {t('marketplace.backToMarket', '返回集市')}
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            <Card variant="glassPanel" className="overflow-hidden">
              <div className="space-y-4 p-5 md:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0 pt-0.5">
                      <Avatar
                        userId={listing.ownerId}
                        avatarUrl={listing.owner?.avatarUrl ?? null}
                        displayName={ownerName}
                        size="lg"
                        status={avatarStatus}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-black leading-tight text-text-primary md:text-3xl">
                          {listing.title}
                        </h1>
                        <Badge size="sm" variant="neutral">
                          {getDeviceTierLabel(listing, t)}
                        </Badge>
                        <Badge size="sm" variant="neutral">
                          {OS_LABEL[listing.osType]}
                        </Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span className="font-black uppercase tracking-[0.1em] text-text-muted/70">
                          {t('marketplace.owner', '出租方')}
                        </span>
                        {ownerLink ? (
                          <Button asChild variant="ghost" size="xs">
                            <Link to={ownerLink}>{ownerName}</Link>
                          </Button>
                        ) : (
                          <span>{ownerName}</span>
                        )}
                      </div>

                      <div className="mt-3 inline-flex flex-wrap items-center gap-2">
                        <Badge variant="neutral" size="sm">
                          {t('marketplace.online', '在线')}{' '}
                          {formatDuration(listing.totalOnlineSeconds)}
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          <OnlineRank totalSeconds={listing.totalOnlineSeconds} />
                          <span className="ml-1">{t('marketplace.rentalQuality', '在线状态')}</span>
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {listing.viewCount} {t('marketplace.views', '浏览')}
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {listing.rentalCount} {t('marketplace.rentals', '次租赁')}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--glass-line)] bg-bg-secondary/40 px-4 py-3 text-right">
                    <p className="text-xs font-black uppercase tracking-wider text-text-muted">
                      {displayRateLabel}
                    </p>
                    <p className="mt-1 text-3xl font-black leading-none">
                      <PriceDisplay amount={displayRateValue} size={28} />
                      <span className="ml-1.5 text-sm font-bold text-text-muted">
                        {displayRateUnit}
                      </span>
                    </p>
                  </div>
                </div>

                {listing.description ? (
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {listing.description}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canMessageOwner ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={MessageSquare}
                      loading={messageOwnerMutation.isPending}
                      onClick={() => {
                        if (!ownerUserId) return
                        messageOwnerMutation.mutate(ownerUserId)
                      }}
                    >
                      {t('marketplace.messageOwner', '私信')}
                    </Button>
                  ) : null}
                </div>

                {skillBadges.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skillBadges.map((skill) => (
                      <Badge key={skill} size="sm" variant="primary">
                        <Tag size={12} />
                        {skill}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.14em] text-text-secondary">
                    {t('marketplace.deviceInfo', '设备信息')}
                  </h2>
                  <Badge variant="neutral" size="sm">
                    {t('marketplace.hardware', '硬件')}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {capabilityRows.map((row) => {
                    const Icon = row.icon
                    return (
                      <div
                        key={row.label}
                        className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary/35 px-3 py-2.5"
                      >
                        <Icon size={14} className="text-text-muted shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.1em] text-text-muted">
                            {row.label}
                          </p>
                          <p className="truncate font-black">{row.value}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>

            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-text-secondary">
                  {t('marketplace.usageGuidelines', '使用准则')}
                </h2>
                <p className="mt-3 min-h-10 text-sm leading-relaxed text-text-secondary">
                  {listing.guidelines || t('marketplace.noDescription', '暂无说明')}
                </p>
              </div>
            </Card>

            {listing.availableFrom || listing.availableUntil ? (
              <Card variant="glassPanel" className="overflow-hidden">
                <div className="p-5 md:p-6">
                  <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                    <CalendarClock size={14} />
                    {t('marketplace.availability', '可用时间')}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {listing.availableFrom ? (
                      <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 px-3 py-2.5 text-sm text-text-secondary">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                          {t('marketplace.availableFrom', '开始时间')}
                        </p>
                        <p className="mt-1 font-bold text-text-primary">
                          {new Date(listing.availableFrom).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                    {listing.availableUntil ? (
                      <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 px-3 py-2.5 text-sm text-text-secondary">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                          {t('marketplace.availableUntil', '结束时间')}
                        </p>
                        <p className="mt-1 font-bold text-text-primary">
                          {new Date(listing.availableUntil).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : null}

            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-text-secondary">
                  {t('marketplace.rentalDuration', '租赁时长（小时）')}
                </h2>
                <div className="mt-4 space-y-3">
                  <input
                    type="number"
                    min={1}
                    max={12000}
                    value={durationHours}
                    onChange={(event) =>
                      setDurationHours(Math.max(1, Number(event.target.value) || 1))
                    }
                    className="h-11 w-full rounded-xl border border-border-subtle bg-bg-tertiary px-4 font-black text-sm text-text-primary outline-none ring-0 transition-all focus:border-primary/45 focus:bg-bg-primary/50"
                  />
                  <div className="flex flex-wrap gap-2">
                    {RENTAL_PRESETS.map((preset) => (
                      <Button
                        key={preset.value}
                        type="button"
                        size="xs"
                        variant={durationHours === preset.value ? 'primary' : 'ghost'}
                        onClick={() => setDurationHours(preset.value)}
                        className="min-w-16 flex-1 sm:flex-none"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  {isScheduleLimited && !isUnavailableByWindow ? (
                    <div className="rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
                      <p className="font-black">
                        {t(
                          'marketplace.availabilityWarning',
                          '该 Buddy 最长可用至 {{date}}，当前已选时长会按限制自动生效。',
                          { date: new Date(listing.availableUntil!).toLocaleString() },
                        )}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-text-secondary">
                  {t('marketplace.pricingDetail', '费率详情')}
                </h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                      {displayRateLabel}
                    </p>
                    <p className="text-lg font-black">
                      <PriceDisplay amount={displayRateValue} size={20} />
                      <span className="ml-1.5 text-xs font-bold text-text-muted">
                        {displayRateUnit}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                      {t('marketplace.deposit', '押金')}
                    </p>
                    <p className="text-lg font-black">
                      {listing.depositAmount ? (
                        <PriceDisplay amount={listing.depositAmount} size={20} />
                      ) : (
                        t('common.none', '暂无')
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                      {t('marketplace.dailyRate', '日租')}
                    </p>
                    <p className="text-lg font-black">
                      {listing.dailyRate ? (
                        <PriceDisplay amount={listing.dailyRate} size={20} />
                      ) : (
                        '-'
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                      {t('marketplace.monthlyRate', '月租')}
                    </p>
                    <p className="text-lg font-black">
                      {listing.monthlyRate ? (
                        <PriceDisplay amount={listing.monthlyRate} size={20} />
                      ) : (
                        '-'
                      )}
                    </p>
                  </div>
                </div>

                {listing.pricingVersion === 2 ? (
                  <div className="mt-4 space-y-2 rounded-xl border border-border-subtle bg-bg-secondary/35 p-3 text-sm text-text-secondary">
                    <p>
                      {t('marketplace.baseDailyRate', '基础每日费用')}：{listing.baseDailyRate ?? 0}{' '}
                      🦐/d
                    </p>
                    <p>
                      {t('marketplace.messageFee', '每条消息费用')}：{listing.messageFee ?? 0}{' '}
                      🦐/msg
                    </p>
                  </div>
                ) : null}

                {estimate ? (
                  <div className="mt-4 rounded-xl border border-border-subtle bg-bg-secondary/35 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-black uppercase tracking-[0.08em] text-text-muted">
                        {t('marketplace.totalEstimate', '预估总费用')}
                      </span>
                      <span className="text-xl font-black text-text-primary">
                        <PriceDisplay amount={estimate.totalEstimate} size={22} />
                      </span>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-2 text-text-secondary">
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('marketplace.rentalCost', '租赁费用')}</span>
                        <span className="font-black">{estimate.rentalCost}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('marketplace.electricityCost', '电费')}</span>
                        <span>{estimate.electricityCost}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('marketplace.platformFee', '平台手续费 (5%)')}</span>
                        <span>{estimate.platformFee}</span>
                      </div>
                      {estimate.note ? (
                        <p className="text-xs text-warning">{estimate.note}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </section>

          <aside id="market-action" className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.15em] text-text-secondary">
                    {t('marketplace.pricing', '费用详情')}
                  </h2>
                  {isOwner ? (
                    <Badge variant="warning" size="sm">
                      {t('marketplace.ownerMode', '出租方')}
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-2 text-xs uppercase tracking-[0.12em] text-text-muted">
                  {displayRateLabel} · {displayRateValue} {displayRateUnit}
                </p>
                <p className="mt-1 text-3xl font-black">
                  {estimate ? (
                    <PriceDisplay amount={estimate.totalEstimate} size={36} />
                  ) : (
                    t('common.loading', '加载中...')
                  )}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {t('marketplace.estimatedFor', '预估费用（{{hours}}小时）', {
                    hours: durationHours,
                  })}
                </p>

                <p className="mt-4 text-xs text-text-muted leading-relaxed">
                  {isOwner
                    ? t('marketplace.delistHint', '下架后此 Buddy 将不再展示在集市中')
                    : t('marketplace.rentDisclaimer', '租赁前请仔细阅读使用规约和平台条款')}
                </p>

                <Button
                  type="button"
                  variant={isOwner ? 'danger' : 'accent'}
                  size="lg"
                  className="mt-4 w-full"
                  disabled={actionDisabled}
                  onClick={() => {
                    if (isOwner) {
                      if (
                        window.confirm(t('marketplace.confirmDelist', '确定要下架此 Buddy 吗？'))
                      ) {
                        delistMutation.mutate()
                      }
                      return
                    }

                    setAgreedToTerms(false)
                    setShowContract(true)
                  }}
                >
                  {signMutation.isPending && !isOwner
                    ? t('common.loading', '处理中...')
                    : actionButtonLabel}
                </Button>
              </div>
            </Card>

            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-text-secondary">
                  {t('marketplace.pricingExplain', '费用信息')}
                </h3>
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  <p className="flex items-start gap-2">
                    <MessageSquare size={14} className="mt-0.5" />
                    {t(
                      'marketplace.pricingNote',
                      '最终费用 = 基础租金 + 电费 (2🦐/h) + Token消耗 (如开启代付) + 5% 平台手续费。',
                    )}
                  </p>
                  <p className="flex items-start gap-2">
                    <Shield size={14} className="mt-0.5" />
                    {t('marketplace.platformTerms', '平台服务条款')}
                  </p>
                  <p className="flex items-start gap-2">
                    <FileText size={14} className="mt-0.5" />
                    {t('marketplace.ownerTerms', '出租方使用规约')}
                  </p>
                  <p className="flex items-start gap-2">
                    <Users size={14} className="mt-0.5" />
                    {t('marketplace.softwareTools', '已安装工具')}：
                    {listing.softwareTools.length || t('common.none', '暂无')}
                  </p>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>

      <Modal
        open={showContract}
        onClose={() => setShowContract(false)}
        closeOnOverlayClick={!isOwner}
      >
        <ModalContent size="md">
          <ModalHeader
            title={t('marketplace.rentalContract', 'Buddy 租赁合同')}
            subtitle={
              listing
                ? `${getDeviceTierLabel(listing, t)} · ${OS_LABEL[listing.osType]} · ${displayRateValue} ${displayRateUnit}`
                : undefined
            }
            onClose={() => setShowContract(false)}
            icon={<FileText size={16} className="text-primary" />}
          />

          <ModalBody className="space-y-4">
            <div className="rounded-xl border border-border-subtle bg-bg-secondary/40 p-3 text-sm">
              <p className="text-xs text-text-muted">{t('marketplace.rentalItem', '租赁条目')}</p>
              <p className="mt-1 font-black text-text-primary">{listing.title}</p>
            </div>

            <div className="rounded-xl border border-border-subtle p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-muted">
                  {t('marketplace.contractStart', '租赁开始')}
                </span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-muted">
                  {t('marketplace.contractDuration', '租赁时长')}
                </span>
                <span>
                  {durationHours} {t('marketplace.duration', '时长')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-muted">
                  {t('marketplace.estimatedCost', '预估费用')}
                </span>
                <span className="font-black">
                  {estimate ? (
                    <PriceDisplay amount={estimate.totalEstimate} size={16} />
                  ) : (
                    t('common.loading', '加载中...')
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                {t('marketplace.rentalTerms', '租赁确认')}
              </p>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={agreedToTerms}
                  onCheckedChange={(value) => setAgreedToTerms(value === true)}
                />
                <label className="text-sm text-text-secondary">
                  {t(
                    'marketplace.agreeTerms',
                    '我已阅读并同意出租方的使用规约和虾豆平台服务条款，理解租赁期间的费用计算规则、违约条款及相关责任。',
                  )}
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 p-3 text-xs text-text-muted">
              <p className="flex items-start gap-2">
                <Clock size={13} className="mt-0.5" />
                {t(
                  'marketplace.totalEstimateFormula',
                  '费用说明：基本费率 + 电费 + 服务费，账单以实际使用时长与结算策略为准。',
                )}
              </p>
            </div>
          </ModalBody>

          <ModalFooter>
            <ModalButtonGroup>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowContract(false)
                  setAgreedToTerms(false)
                }}
              >
                {t('common.cancel', '取消')}
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                loading={signMutation.isPending}
                disabled={!agreedToTerms || signMutation.isPending}
                onClick={() => signMutation.mutate()}
                icon={CheckCircle2}
              >
                {signMutation.isPending
                  ? t('common.loading', '处理中...')
                  : t('marketplace.signContract', '确认签约')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </GlassPanel>
  )
}
