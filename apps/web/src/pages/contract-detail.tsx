import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  DollarSign,
  FileText,
  MessageCircle,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RouteQueryState } from '../components/common/route-query-state'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'

interface ContractDetail {
  id: string
  contractNo: string
  listingId: string
  ownerId: string
  tenantId: string
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'violated' | 'disputed'
  startsAt: string | null
  expiresAt: string | null
  terminatedAt: string | null
  hourlyRate: number
  dailyRate?: number
  monthlyRate?: number
  baseDailyRate?: number
  messageFee?: number
  pricingVersion?: number
  messageCount?: number
  platformFeeRate?: number
  depositAmount: number
  totalCost: number
  listingSnapshot: Record<string, unknown>
  ownerTerms: string | null
  platformTerms: string | null
  terminationReason?: string | null
  listing?: { title: string; deviceTier: string; osType: string } | null
  agentUserId?: string | null
  createdAt: string
}

interface ListingSnapshot {
  title?: string
  description?: string
  deviceTier?: string
  osType?: string
  skills?: string[]
  guidelines?: string
}

const STATUS_STYLES: Record<
  string,
  { labelKey: string; bg: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    labelKey: 'marketplace.statusPending',
    bg: 'bg-warning/10',
    text: 'text-warning',
    icon: <Clock className="w-4 h-4" />,
  },
  active: {
    labelKey: 'marketplace.statusActive',
    bg: 'bg-success/10',
    text: 'text-success',
    icon: <Zap className="w-4 h-4" />,
  },
  completed: {
    labelKey: 'marketplace.statusCompleted',
    bg: 'bg-bg-tertiary',
    text: 'text-text-secondary',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  cancelled: {
    labelKey: 'marketplace.statusCancelled',
    bg: 'bg-bg-tertiary',
    text: 'text-text-muted',
    icon: <XCircle className="w-4 h-4" />,
  },
  violated: {
    labelKey: 'marketplace.statusViolated',
    bg: 'bg-danger/10',
    text: 'text-danger',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  disputed: {
    labelKey: 'marketplace.statusDisputed',
    bg: 'bg-warning/10',
    text: 'text-warning',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
}

export function ContractDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { contractId } = useParams({ strict: false }) as { contractId: string }
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  const [terminateReason, setTerminateReason] = useState('')
  const [showTerminate, setShowTerminate] = useState(false)

  // Fetch contract
  const {
    data: contract,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['marketplace', 'contract', contractId],
    queryFn: () => fetchApi<ContractDetail>(`/api/marketplace/contracts/${contractId}`),
    enabled: !!contractId,
  })

  // Terminate contract
  const terminateMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/marketplace/contracts/${contractId}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: terminateReason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.contractTerminated'), 'success')
      setShowTerminate(false)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Start chat with rented Buddy
  const startChatMutation = useMutation({
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

  if (isLoading) {
    return <RouteQueryState variant="loading" title={t('marketplace.contractLoadingTitle')} />
  }

  if (isError) {
    return (
      <RouteQueryState
        variant="error"
        title={t('marketplace.contractLoadFailedTitle')}
        description={t('marketplace.contractLoadFailedDesc')}
        onRetry={() => void refetch()}
      />
    )
  }

  if (!contract) {
    return (
      <RouteQueryState
        variant="not-found"
        title={t('marketplace.contractNotFoundTitle')}
        description={t('marketplace.contractNotFoundDesc')}
      />
    )
  }

  const st = STATUS_STYLES[contract.status] ?? STATUS_STYLES.pending!
  const isOwner = userId === contract.ownerId
  const isTenant = userId === contract.tenantId
  const canTerminate = contract.status === 'active' && (isOwner || isTenant)

  return (
    <div
      className="min-h-screen overflow-y-auto bg-bg-primary text-text-primary"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <Link
          to="/settings/buddy/market"
          className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors font-bold mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          {t('marketplace.backToRentals')}
        </Link>

        {/* Contract Header */}
        <div className="bg-[var(--glass-bg)] backdrop-blur-xl rounded-2xl border border-[var(--glass-border)] shadow-[var(--shadow-soft)] p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${st.bg} ${st.text}`}
                >
                  {st.icon} {t(st.labelKey)}
                </span>
                <span className="text-sm text-text-muted font-mono">#{contract.contractNo}</span>
              </div>
              <h1 style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }} className="text-2xl font-bold">
                {contract.listing?.title || t('marketplace.unknownListing')}
              </h1>
              <p className="text-sm text-text-muted mt-1 font-medium">
                {isOwner ? t('marketplace.youAreOwner') : t('marketplace.youAreTenant')}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-accent-strong">{contract.totalCost} 🦐</div>
              <div className="text-xs text-text-muted">{t('marketplace.totalSpent')}</div>
            </div>
          </div>

          {/* Contract Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-bg-secondary rounded-xl p-3">
              <div className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {t('marketplace.duration')}
              </div>
              <div className="font-bold">
                {contract.startsAt && contract.expiresAt
                  ? `${Math.round((new Date(contract.expiresAt).getTime() - new Date(contract.startsAt).getTime()) / 3600000)}h`
                  : t('marketplace.unlimited')}
              </div>
            </div>
            <div className="bg-bg-secondary rounded-xl p-3">
              <div className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> {t('marketplace.rate')}
              </div>
              <div className="font-bold">
                {contract.pricingVersion === 2
                  ? `${contract.baseDailyRate ?? 0} 🦐/d`
                  : `${contract.hourlyRate} 🦐/h`}
              </div>
            </div>
            <div className="bg-bg-secondary rounded-xl p-3">
              <div className="text-xs font-bold text-text-muted mb-1 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> {t('marketplace.deposit')}
              </div>
              <div className="font-bold">{contract.depositAmount} 🦐</div>
            </div>
            <div className="bg-bg-secondary rounded-xl p-3">
              <div className="text-xs font-bold text-text-muted mb-1">
                {t('marketplace.startDate')}
              </div>
              <div className="font-bold text-sm">
                {contract.startsAt ? new Date(contract.startsAt).toLocaleDateString() : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Use Buddy & Countdown */}
        {isTenant && contract.status === 'active' && (
          <div className="bg-[var(--glass-bg)] backdrop-blur-xl rounded-2xl border border-[var(--glass-border)] shadow-[var(--shadow-soft)] p-8 mb-6">
            <div className="flex items-center justify-between">
              <div>
                {contract.expiresAt && <CountdownTimer expiresAt={contract.expiresAt} t={t} />}
                {!contract.expiresAt && (
                  <p className="text-sm text-text-muted font-medium">
                    {t('marketplace.unlimitedUsage')}
                  </p>
                )}
              </div>
              {contract.agentUserId && (
                <button
                  type="button"
                  onClick={() => startChatMutation.mutate(contract.agentUserId!)}
                  disabled={startChatMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-bg-deep font-bold hover:bg-primary-hover transition-all shadow-[var(--shadow-cyan)] hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                >
                  <MessageCircle className="w-4 h-4" />
                  {startChatMutation.isPending ? t('common.loading') : t('marketplace.useBuddy')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Contract Info */}
        <ContractInfoSection contract={contract} t={t} />

        {/* Actions */}
        {canTerminate && (
          <div className="bg-[var(--glass-bg)] backdrop-blur-xl rounded-2xl border border-[var(--glass-border)] shadow-[var(--shadow-soft)] p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4 flex items-center gap-2"
            >
              <AlertTriangle className="w-5 h-5 text-danger" />
              {t('marketplace.actions')}
            </h2>

            {!showTerminate ? (
              <button
                type="button"
                onClick={() => setShowTerminate(true)}
                className="px-5 py-2.5 rounded-xl bg-danger/10 text-danger font-bold hover:bg-danger/20 transition-colors"
              >
                {t('marketplace.terminateContract')}
              </button>
            ) : (
              <div className="space-y-4">
                <textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder={t('marketplace.terminateReason')}
                  className="w-full px-4 py-3 rounded-xl border-2 border-border-subtle font-medium focus:outline-none focus:border-danger/30 focus:ring-2 focus:ring-danger/10 resize-none bg-bg-secondary text-text-primary"
                  rows={3}
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => terminateMutation.mutate()}
                    disabled={terminateMutation.isPending}
                    className="px-5 py-2.5 rounded-xl bg-danger text-white font-bold hover:bg-danger/80 transition-colors disabled:opacity-50"
                  >
                    {terminateMutation.isPending
                      ? t('common.loading')
                      : t('marketplace.confirmTerminate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTerminate(false)}
                    className="px-5 py-2.5 rounded-xl bg-bg-tertiary text-text-secondary font-bold hover:bg-bg-modifier-active transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
                <p className="text-xs text-danger font-medium">
                  {t('marketplace.terminateWarning')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ──────────────── Contract Info Section ──────────────── */

const DEVICE_TIER_LABEL_KEYS: Record<string, string> = {
  high_end: 'marketplace.deviceHighEnd',
  mid_range: 'marketplace.deviceMidRange',
  low_end: 'marketplace.deviceLowEnd',
}

function ContractInfoSection({ contract, t }: { contract: ContractDetail; t: TFunction }) {
  const [expanded, setExpanded] = useState(false)
  const snapshot = contract.listingSnapshot as ListingSnapshot | null

  return (
    <div className="bg-[var(--glass-bg)] backdrop-blur-xl rounded-2xl border border-[var(--glass-border)] shadow-[var(--shadow-soft)] p-8 mb-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h2
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className="text-lg font-bold flex items-center gap-2"
        >
          <FileText className="w-5 h-5 text-primary" />
          {t('marketplace.contractInfo')}
        </h2>
        <ChevronDown
          className={`w-5 h-5 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Summary (always visible) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
        <div className="bg-bg-secondary rounded-xl p-3">
          <div className="text-xs text-text-muted font-bold mb-1">
            {t('marketplace.contractNo')}
          </div>
          <div className="font-mono font-bold text-sm">#{contract.contractNo}</div>
        </div>
        <div className="bg-bg-secondary rounded-xl p-3">
          <div className="text-xs text-text-muted font-bold mb-1">{t('marketplace.rate')}</div>
          <div className="font-bold text-sm">
            {contract.pricingVersion === 2
              ? `${contract.baseDailyRate ?? 0} 🦐/d`
              : `${contract.hourlyRate} 🦐/h`}
          </div>
        </div>
        <div className="bg-bg-secondary rounded-xl p-3">
          <div className="text-xs text-text-muted font-bold mb-1">{t('marketplace.deposit')}</div>
          <div className="font-bold text-sm">{contract.depositAmount} 🦐</div>
        </div>
        <div className="bg-bg-secondary rounded-xl p-3">
          <div className="text-xs text-text-muted font-bold mb-1">{t('marketplace.signDate')}</div>
          <div className="font-bold text-sm">
            {new Date(contract.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="bg-bg-secondary rounded-xl p-3">
          <div className="text-xs text-text-muted font-bold mb-1">{t('marketplace.startDate')}</div>
          <div className="font-bold text-sm">
            {contract.startsAt ? new Date(contract.startsAt).toLocaleDateString() : '-'}
          </div>
        </div>
        <div className="bg-bg-secondary rounded-xl p-3">
          <div className="text-xs text-text-muted font-bold mb-1">{t('marketplace.endDate')}</div>
          <div className="font-bold text-sm">
            {contract.expiresAt
              ? new Date(contract.expiresAt).toLocaleDateString()
              : t('marketplace.unlimited')}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-6 space-y-5 animate-in slide-in-from-top-2 duration-200">
          {/* Pricing details */}
          {contract.pricingVersion === 2 ? (
            <div>
              <h3 className="text-sm font-bold text-text-secondary mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" /> {t('marketplace.pricingDetail')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-bg-secondary rounded-lg p-2.5">
                  <div className="text-xs text-text-muted">{t('marketplace.baseDailyRate')}</div>
                  <div className="font-bold text-sm">{contract.baseDailyRate ?? 0} 🦐/d</div>
                </div>
                <div className="bg-bg-secondary rounded-lg p-2.5">
                  <div className="text-xs text-text-muted">{t('marketplace.messageFee')}</div>
                  <div className="font-bold text-sm">{contract.messageFee ?? 0} 🦐/msg</div>
                </div>
                <div className="bg-bg-secondary rounded-lg p-2.5">
                  <div className="text-xs text-text-muted">{t('marketplace.messageCount')}</div>
                  <div className="font-bold text-sm">{contract.messageCount ?? 0}</div>
                </div>
                {contract.platformFeeRate ? (
                  <div className="bg-bg-secondary rounded-lg p-2.5">
                    <div className="text-xs text-text-muted">{t('marketplace.platformFee')}</div>
                    <div className="font-bold text-sm">
                      {(contract.platformFeeRate / 100).toFixed(1)}%
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : contract.dailyRate || contract.monthlyRate || contract.platformFeeRate ? (
            <div>
              <h3 className="text-sm font-bold text-text-secondary mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" /> {t('marketplace.pricingDetail')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-bg-secondary rounded-lg p-2.5">
                  <div className="text-xs text-text-muted">{t('marketplace.hourlyRate')}</div>
                  <div className="font-bold text-sm">{contract.hourlyRate} 🦐</div>
                </div>
                {contract.dailyRate ? (
                  <div className="bg-bg-secondary rounded-lg p-2.5">
                    <div className="text-xs text-text-muted">{t('marketplace.dailyRate')}</div>
                    <div className="font-bold text-sm">{contract.dailyRate} 🦐</div>
                  </div>
                ) : null}
                {contract.monthlyRate ? (
                  <div className="bg-bg-secondary rounded-lg p-2.5">
                    <div className="text-xs text-text-muted">{t('marketplace.monthlyRate')}</div>
                    <div className="font-bold text-sm">{contract.monthlyRate} 🦐</div>
                  </div>
                ) : null}
                {contract.platformFeeRate ? (
                  <div className="bg-bg-secondary rounded-lg p-2.5">
                    <div className="text-xs text-text-muted">{t('marketplace.platformFee')}</div>
                    <div className="font-bold text-sm">
                      {(contract.platformFeeRate / 100).toFixed(1)}%
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Listing snapshot */}
          {snapshot && (
            <div>
              <h3 className="text-sm font-bold text-text-secondary mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> {t('marketplace.listingSnapshot')}
              </h3>
              <div className="bg-bg-secondary rounded-xl p-4 space-y-2 text-sm">
                {snapshot.title && (
                  <div>
                    <span className="text-text-muted font-bold">{t('marketplace.title')}：</span>
                    <span className="text-text-primary">{String(snapshot.title)}</span>
                  </div>
                )}
                {snapshot.description && (
                  <div>
                    <span className="text-text-muted font-bold">
                      {t('marketplace.description')}：
                    </span>
                    <span className="text-text-primary">{String(snapshot.description)}</span>
                  </div>
                )}
                {snapshot.deviceTier && (
                  <div>
                    <span className="text-text-muted font-bold">
                      {t('marketplace.deviceTier')}：
                    </span>
                    <span className="text-text-primary">
                      {DEVICE_TIER_LABEL_KEYS[String(snapshot.deviceTier)]
                        ? t(DEVICE_TIER_LABEL_KEYS[String(snapshot.deviceTier)]!)
                        : String(snapshot.deviceTier)}
                    </span>
                  </div>
                )}
                {snapshot.osType && (
                  <div>
                    <span className="text-text-muted font-bold">{t('marketplace.os')}：</span>
                    <span className="text-text-primary">{String(snapshot.osType)}</span>
                  </div>
                )}
                {Array.isArray(snapshot.skills) && snapshot.skills.length > 0 && (
                  <div>
                    <span className="text-text-muted font-bold">{t('marketplace.skills')}：</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(snapshot.skills as string[]).map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-bold"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {snapshot.guidelines && (
                  <div>
                    <span className="text-text-muted font-bold">
                      {t('marketplace.guidelines')}：
                    </span>
                    <p className="text-text-primary whitespace-pre-wrap mt-1">
                      {String(snapshot.guidelines)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Terms */}
          {(contract.ownerTerms || contract.platformTerms) && (
            <div>
              <h3 className="text-sm font-bold text-text-secondary mb-2 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> {t('marketplace.terms')}
              </h3>
              <div className="space-y-3">
                {contract.ownerTerms && (
                  <div className="bg-warning/10 rounded-xl p-4">
                    <div className="text-xs font-bold text-warning mb-1">
                      {t('marketplace.ownerTerms')}
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">
                      {contract.ownerTerms}
                    </p>
                  </div>
                )}
                {contract.platformTerms && (
                  <div className="bg-primary/10 rounded-xl p-4">
                    <div className="text-xs font-bold text-primary mb-1">
                      {t('marketplace.platformTerms')}
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">
                      {contract.platformTerms}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Termination info */}
          {contract.terminatedAt && (
            <div className="bg-danger/10 rounded-xl p-4">
              <div className="text-xs font-bold text-danger mb-1">
                {t('marketplace.terminationInfo')}
              </div>
              <div className="text-sm text-text-primary">
                <div>
                  {t('marketplace.terminatedAt')}：
                  {new Date(contract.terminatedAt).toLocaleString()}
                </div>
                {contract.terminationReason && (
                  <div className="mt-1">
                    {t('marketplace.terminateReason')}：{contract.terminationReason}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ──────────────── Countdown Timer ──────────────── */

function CountdownTimer({ expiresAt, t }: { expiresAt: string; t: TFunction }) {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt))

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(calcRemaining(expiresAt))
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  if (remaining <= 0) {
    return <div className="text-sm font-bold text-danger">{t('marketplace.expired')}</div>
  }

  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-primary" />
      <span className="text-sm font-bold text-text-secondary">
        {t('marketplace.remainingTime')}
      </span>
      <span className="font-mono font-bold text-primary">{formatCountdown(remaining, t)}</span>
    </div>
  )
}

function calcRemaining(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now())
}

function formatCountdown(ms: number, t: TFunction): string {
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return t('marketplace.countdownDays', { days: d, hours: h, minutes: m })
  if (h > 0) return t('marketplace.countdownHours', { hours: h, minutes: m, seconds: s })
  return t('marketplace.countdownMinutes', { minutes: m, seconds: s })
}
