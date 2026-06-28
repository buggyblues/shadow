import {
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
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
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
import { useConfirmStore } from '../components/common/confirm-dialog'
import { formatDuration, OnlineRank } from '../components/common/online-rank'
import { PresenceAvatar } from '../components/common/presence-avatar'
import { RouteQueryState } from '../components/common/route-query-state'
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
  if (listing.deviceTier === 'high_end') return t('marketplace.deviceHighEnd')
  if (listing.deviceTier === 'mid_range') return t('marketplace.deviceMidRange')
  return t('marketplace.deviceLowEnd')
}

export function MarketplaceDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { listingId } = useParams({ strict: false }) as { listingId: string }
  const search = useSearch({ strict: false }) as { from?: string }
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [durationHours, setDurationHours] = useState(24)
  const [showContract, setShowContract] = useState(false)
  const [isAlreadyRented, setIsAlreadyRented] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const {
    data: listing,
    isLoading,
    isError,
    refetch,
  } = useQuery({
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
      showToast(t('marketplace.contractSigned'), 'success')
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
        showToast(t('marketplace.alreadyRented'), 'error')
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
      showToast(t('marketplace.delistSuccess'), 'success')
      navigate({ to: '/settings/buddy/market', search: {} })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const isOwner = currentUser?.id === listing?.ownerId
  const backToDiscover = search.from === 'discover'
  const handleBack = () => {
    if (backToDiscover) {
      navigate({ to: '/discover' })
      return
    }
    navigate({ to: '/settings/buddy/market', search: {} })
  }
  const ownerName =
    listing?.owner?.displayName || listing?.owner?.username || t('marketplace.unknownOwner')
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
    listing?.totalOnlineSeconds && listing.totalOnlineSeconds > 0 ? 'online' : 'offline'
  const displayRateLabel =
    listing?.pricingVersion === 2 ? t('marketplace.dailyRate') : t('marketplace.hourlyRate')
  const displayRateValue =
    listing?.pricingVersion === 2
      ? (listing.baseDailyRate ?? listing.dailyRate ?? 0)
      : (listing?.hourlyRate ?? 0)
  const displayRateUnit =
    listing?.pricingVersion === 2 ? t('marketplace.dailyRateUnit') : t('marketplace.hourlyRateUnit')

  const capabilityRows = useMemo(() => {
    if (!listing) return [] as Array<{ label: string; value: string; icon: typeof Laptop }>
    return [
      {
        label: t('marketplace.model'),
        value: listing.deviceInfo.model ?? t('marketplace.noDescription'),
        icon: Laptop,
      },
      {
        label: t('marketplace.cpu'),
        value: listing.deviceInfo.cpu ?? t('marketplace.noDescription'),
        icon: Monitor,
      },
      {
        label: t('marketplace.ram'),
        value: listing.deviceInfo.ram ?? t('marketplace.noDescription'),
        icon: Cpu,
      },
      {
        label: t('marketplace.storage'),
        value: listing.deviceInfo.storage ?? t('marketplace.noDescription'),
        icon: HardDrive,
      },
      {
        label: t('marketplace.gpu'),
        value: listing.deviceInfo.gpu ?? t('marketplace.noDescription'),
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
    ? t('marketplace.delistBuddy')
    : isUnavailableByWindow
      ? t('marketplace.unavailable')
      : isAlreadyRented
        ? t('marketplace.alreadyRentedButton')
        : t('marketplace.rentNow')

  const actionDisabled = isOwner
    ? delistMutation.isPending
    : isUnavailableByWindow || isAlreadyRented || signMutation.isPending

  if (isLoading) {
    return (
      <GlassPanel className="h-full min-h-screen overflow-y-auto rounded-[32px] border border-[var(--glass-line)] p-6">
        <RouteQueryState
          variant="loading"
          title={t('marketplace.listingLoadingTitle')}
          className="min-h-[60vh] bg-transparent"
        />
      </GlassPanel>
    )
  }

  if (isError) {
    return (
      <GlassPanel className="h-full min-h-screen overflow-y-auto rounded-[32px] border border-[var(--glass-line)] p-6">
        <RouteQueryState
          variant="error"
          title={t('marketplace.listingLoadFailedTitle')}
          description={t('marketplace.listingLoadFailedDesc')}
          onRetry={() => void refetch()}
          className="min-h-[60vh] bg-transparent"
        />
      </GlassPanel>
    )
  }

  if (!listing) {
    return (
      <GlassPanel className="h-full min-h-screen overflow-y-auto rounded-[32px] border border-[var(--glass-line)] p-6">
        <RouteQueryState
          variant="not-found"
          title={t('marketplace.listingNotFoundTitle')}
          description={t('marketplace.listingNotFoundDesc')}
          className="min-h-[60vh] bg-transparent"
        />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="h-full min-h-screen overflow-y-auto rounded-[32px] border border-[var(--glass-line)] text-text-primary">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-text-muted hover:text-text-primary"
          >
            <ArrowLeft size={15} />
            {backToDiscover ? t('marketplace.backToDiscover') : t('marketplace.backToMarket')}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            <Card variant="glassPanel" className="overflow-hidden">
              <div className="space-y-4 p-5 md:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0 pt-0.5">
                      <PresenceAvatar
                        userId={listing.ownerId}
                        avatarUrl={listing.owner?.avatarUrl ?? null}
                        displayName={ownerName}
                        status={avatarStatus}
                        size="xl"
                        className="h-16 w-16 [&>img]:h-16 [&>img]:w-16"
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
                          {t('marketplace.owner')}
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
                          {t('marketplace.online')} {formatDuration(listing.totalOnlineSeconds, t)}
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          <OnlineRank totalSeconds={listing.totalOnlineSeconds} />
                          <span className="ml-1">{t('marketplace.rentalQuality')}</span>
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {listing.viewCount} {t('marketplace.views')}
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {listing.rentalCount} {t('marketplace.rentals')}
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
                      {t('marketplace.messageOwner')}
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
                    {t('marketplace.deviceInfo')}
                  </h2>
                  <Badge variant="neutral" size="sm">
                    {t('marketplace.hardware')}
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
                  {t('marketplace.usageGuidelines')}
                </h2>
                <p className="mt-3 min-h-10 text-sm leading-relaxed text-text-secondary">
                  {listing.guidelines || t('marketplace.noDescription')}
                </p>
              </div>
            </Card>

            {listing.availableFrom || listing.availableUntil ? (
              <Card variant="glassPanel" className="overflow-hidden">
                <div className="p-5 md:p-6">
                  <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                    <CalendarClock size={14} />
                    {t('marketplace.availability')}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {listing.availableFrom ? (
                      <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 px-3 py-2.5 text-sm text-text-secondary">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                          {t('marketplace.availableFrom')}
                        </p>
                        <p className="mt-1 font-bold text-text-primary">
                          {new Date(listing.availableFrom).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                    {listing.availableUntil ? (
                      <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 px-3 py-2.5 text-sm text-text-secondary">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                          {t('marketplace.availableUntil')}
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
                  {t('marketplace.rentalDuration')}
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
                        {t('marketplace.availabilityWarning', {
                          date: new Date(listing.availableUntil!).toLocaleString(),
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-text-secondary">
                  {t('marketplace.pricingDetail')}
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
                      {t('marketplace.deposit')}
                    </p>
                    <p className="text-lg font-black">
                      {listing.depositAmount ? (
                        <PriceDisplay amount={listing.depositAmount} size={20} />
                      ) : (
                        t('common.none')
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                      {t('marketplace.dailyRate')}
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
                      {t('marketplace.monthlyRate')}
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
                      {t('marketplace.baseDailyRate')}：{listing.baseDailyRate ?? 0} 🦐/d
                    </p>
                    <p>
                      {t('marketplace.messageFee')}：{listing.messageFee ?? 0} 🦐/msg
                    </p>
                  </div>
                ) : null}

                {estimate ? (
                  <div className="mt-4 rounded-xl border border-border-subtle bg-bg-secondary/35 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-black uppercase tracking-[0.08em] text-text-muted">
                        {t('marketplace.totalEstimate')}
                      </span>
                      <span className="text-xl font-black text-text-primary">
                        <PriceDisplay amount={estimate.totalEstimate} size={22} />
                      </span>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-2 text-text-secondary">
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('marketplace.rentalCost')}</span>
                        <span className="font-black">{estimate.rentalCost}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('marketplace.electricityCost')}</span>
                        <span>{estimate.electricityCost}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('marketplace.platformFee')}</span>
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
                    {t('marketplace.pricing')}
                  </h2>
                  {isOwner ? (
                    <Badge variant="warning" size="sm">
                      {t('marketplace.ownerMode')}
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
                    t('common.loading')
                  )}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {t('marketplace.estimatedFor', {
                    hours: durationHours,
                  })}
                </p>

                <p className="mt-4 text-xs text-text-muted leading-relaxed">
                  {isOwner ? t('marketplace.delistHint') : t('marketplace.rentDisclaimer')}
                </p>

                <Button
                  type="button"
                  variant={isOwner ? 'danger' : 'accent'}
                  size="lg"
                  className="mt-4 w-full"
                  disabled={actionDisabled}
                  onClick={async () => {
                    if (isOwner) {
                      const ok = await useConfirmStore.getState().confirm({
                        title: t('marketplace.delistBuddy'),
                        message: t('marketplace.confirmDelist'),
                        confirmLabel: t('marketplace.delistBuddy'),
                        cancelLabel: t('common.cancel'),
                        danger: true,
                      })
                      if (ok) delistMutation.mutate()
                      return
                    }

                    setAgreedToTerms(false)
                    setShowContract(true)
                  }}
                >
                  {signMutation.isPending && !isOwner ? t('common.loading') : actionButtonLabel}
                </Button>
              </div>
            </Card>

            <Card variant="glassPanel" className="overflow-hidden">
              <div className="p-5 md:p-6">
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-text-secondary">
                  {t('marketplace.pricingExplain')}
                </h3>
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  <p className="flex items-start gap-2">
                    <MessageSquare size={14} className="mt-0.5" />
                    {t('marketplace.pricingNote')}
                  </p>
                  <p className="flex items-start gap-2">
                    <Shield size={14} className="mt-0.5" />
                    {t('marketplace.platformTerms')}
                  </p>
                  <p className="flex items-start gap-2">
                    <FileText size={14} className="mt-0.5" />
                    {t('marketplace.ownerTerms')}
                  </p>
                  <p className="flex items-start gap-2">
                    <Users size={14} className="mt-0.5" />
                    {t('marketplace.softwareTools')}：
                    {listing.softwareTools.length || t('common.none')}
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
            title={t('marketplace.rentalContract')}
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
              <p className="text-xs text-text-muted">{t('marketplace.rentalItem')}</p>
              <p className="mt-1 font-black text-text-primary">{listing.title}</p>
            </div>

            <div className="rounded-xl border border-border-subtle p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-muted">{t('marketplace.contractStart')}</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-muted">{t('marketplace.contractDuration')}</span>
                <span>
                  {durationHours} {t('marketplace.duration')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-muted">{t('marketplace.estimatedCost')}</span>
                <span className="font-black">
                  {estimate ? (
                    <PriceDisplay amount={estimate.totalEstimate} size={16} />
                  ) : (
                    t('common.loading')
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                {t('marketplace.rentalTerms')}
              </p>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={agreedToTerms}
                  onCheckedChange={(value) => setAgreedToTerms(value === true)}
                />
                <label className="text-sm text-text-secondary">{t('marketplace.agreeTerms')}</label>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-bg-secondary/35 p-3 text-xs text-text-muted">
              <p className="flex items-start gap-2">
                <Clock size={13} className="mt-0.5" />
                {t('marketplace.totalEstimateFormula')}
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
                {t('common.cancel')}
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
                {signMutation.isPending ? t('common.loading') : t('marketplace.signContract')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </GlassPanel>
  )
}
