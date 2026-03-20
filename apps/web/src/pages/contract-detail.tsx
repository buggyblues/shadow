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

const STATUS_STYLES: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  pending: {
    label: '待生效',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    icon: <Clock className="w-4 h-4" />,
  },
  active: {
    label: '租赁中',
    bg: 'bg-green-50',
    text: 'text-green-700',
    icon: <Zap className="w-4 h-4" />,
  },
  completed: {
    label: '已完成',
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  cancelled: {
    label: '已取消',
    bg: 'bg-gray-50',
    text: 'text-gray-500',
    icon: <XCircle className="w-4 h-4" />,
  },
  violated: {
    label: '已违约',
    bg: 'bg-red-50',
    text: 'text-red-700',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  disputed: {
    label: '争议中',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
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
  const { data: contract, isLoading } = useQuery({
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
      showToast(t('marketplace.contractTerminated', '合同已终止'), 'success')
      setShowTerminate(false)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Start chat with rented claw
  const startChatMutation = useMutation({
    mutationFn: (agentUserId: string) =>
      fetchApi<{ id: string }>('/api/dm/channels', {
        method: 'POST',
        body: JSON.stringify({ userId: agentUserId }),
      }),
    onSuccess: (data) => {
      navigate({ to: '/settings', search: { tab: 'chat', dm: data.id } })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  if (isLoading || !contract) {
    return (
      <div className="min-h-screen bg-[#f2f7fc] flex items-center justify-center">
        <div className="animate-pulse text-gray-400 text-lg font-bold">
          {t('common.loading', '加载中...')}
        </div>
      </div>
    )
  }

  const st = STATUS_STYLES[contract.status] ?? STATUS_STYLES.pending!
  const isOwner = userId === contract.ownerId
  const isTenant = userId === contract.tenantId
  const canTerminate =
    (contract.status === 'active' || contract.status === 'pending') && (isOwner || isTenant)

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <Link
          to="/marketplace/my-rentals"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors font-bold mb-6"
        >
          <ChevronLeft className="w-5 h-5" />
          {t('marketplace.backToRentals', '返回我的租赁')}
        </Link>

        {/* Contract Header */}
        <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${st.bg} ${st.text}`}
                >
                  {st.icon} {st.label}
                </span>
                <span className="text-sm text-gray-400 font-mono">#{contract.contractNo}</span>
              </div>
              <h1 style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }} className="text-2xl font-bold">
                {contract.listing?.title || t('marketplace.unknownListing', '未知挂单')}
              </h1>
              <p className="text-sm text-gray-500 mt-1 font-medium">
                {isOwner
                  ? t('marketplace.youAreOwner', '你是出租方')
                  : t('marketplace.youAreTenant', '你是使用方')}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-600">{contract.totalCost} 🦐</div>
              <div className="text-xs text-gray-400">{t('marketplace.totalSpent', '累计费用')}</div>
            </div>
          </div>

          {/* Contract Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {t('marketplace.duration', '时长')}
              </div>
              <div className="font-bold">
                {contract.startsAt && contract.expiresAt
                  ? `${Math.round((new Date(contract.expiresAt).getTime() - new Date(contract.startsAt).getTime()) / 3600000)}h`
                  : t('marketplace.unlimited', '不限时')}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> {t('marketplace.rate', '费率')}
              </div>
              <div className="font-bold">{contract.hourlyRate} 🦐/h</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> {t('marketplace.deposit', '押金')}
              </div>
              <div className="font-bold">{contract.depositAmount} 🦐</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-bold text-gray-400 mb-1">
                {t('marketplace.startDate', '开始日期')}
              </div>
              <div className="font-bold text-sm">
                {contract.startsAt ? new Date(contract.startsAt).toLocaleDateString() : '-'}
              </div>
            </div>
          </div>
        </div>

        {/* Use Claw & Countdown */}
        {isTenant && contract.status === 'active' && (
          <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-8 mb-6">
            <div className="flex items-center justify-between">
              <div>
                {contract.expiresAt && <CountdownTimer expiresAt={contract.expiresAt} t={t} />}
                {!contract.expiresAt && (
                  <p className="text-sm text-gray-500 font-medium">
                    {t('marketplace.unlimitedUsage', '不限时使用')}
                  </p>
                )}
              </div>
              {contract.agentUserId && (
                <button
                  type="button"
                  onClick={() => startChatMutation.mutate(contract.agentUserId!)}
                  disabled={startChatMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 text-white font-bold hover:from-cyan-500 hover:to-cyan-600 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
                >
                  <MessageCircle className="w-4 h-4" />
                  {startChatMutation.isPending
                    ? t('common.loading', '处理中...')
                    : t('marketplace.useClaw', '开始使用')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Contract Info */}
        <ContractInfoSection contract={contract} t={t} />

        {/* Actions */}
        {canTerminate && (
          <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-8">
            <h2
              style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
              className="text-lg font-bold mb-4 flex items-center gap-2"
            >
              <AlertTriangle className="w-5 h-5 text-red-500" />
              {t('marketplace.actions', '操作')}
            </h2>

            {!showTerminate ? (
              <button
                type="button"
                onClick={() => setShowTerminate(true)}
                className="px-5 py-2.5 rounded-xl bg-red-50 text-red-700 font-bold hover:bg-red-100 transition-colors"
              >
                {t('marketplace.terminateContract', '提前终止合同')}
              </button>
            ) : (
              <div className="space-y-4">
                <textarea
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                  placeholder={t('marketplace.terminateReason', '请输入终止原因...')}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 font-medium focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 resize-none"
                  rows={3}
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => terminateMutation.mutate()}
                    disabled={terminateMutation.isPending}
                    className="px-5 py-2.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {terminateMutation.isPending
                      ? t('common.loading', '处理中...')
                      : t('marketplace.confirmTerminate', '确认终止')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTerminate(false)}
                    className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition-colors"
                  >
                    {t('common.cancel', '取消')}
                  </button>
                </div>
                <p className="text-xs text-red-400 font-medium">
                  {t(
                    'marketplace.terminateWarning',
                    '⚠️ 终止后，已产生的费用不予退还。押金将在终止后退回。',
                  )}
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

const DEVICE_TIERS: Record<string, string> = {
  high_end: '🔥 高端',
  mid_range: '⚡ 中端',
  low_end: '💡 入门',
}

function ContractInfoSection({ contract, t }: { contract: ContractDetail; t: TFunction }) {
  const [expanded, setExpanded] = useState(false)
  const snapshot = contract.listingSnapshot as Record<string, unknown> | null

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-8 mb-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <h2
          style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
          className="text-lg font-bold flex items-center gap-2"
        >
          <FileText className="w-5 h-5 text-cyan-500" />
          {t('marketplace.contractInfo', '合同信息')}
        </h2>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Summary (always visible) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 font-bold mb-1">
            {t('marketplace.contractNo', '合同编号')}
          </div>
          <div className="font-mono font-bold text-sm">#{contract.contractNo}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 font-bold mb-1">
            {t('marketplace.rate', '费率')}
          </div>
          <div className="font-bold text-sm">{contract.hourlyRate} 🦐/h</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 font-bold mb-1">
            {t('marketplace.deposit', '押金')}
          </div>
          <div className="font-bold text-sm">{contract.depositAmount} 🦐</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 font-bold mb-1">
            {t('marketplace.signDate', '签约日期')}
          </div>
          <div className="font-bold text-sm">
            {new Date(contract.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 font-bold mb-1">
            {t('marketplace.startDate', '开始日期')}
          </div>
          <div className="font-bold text-sm">
            {contract.startsAt ? new Date(contract.startsAt).toLocaleDateString() : '-'}
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-xs text-gray-400 font-bold mb-1">
            {t('marketplace.endDate', '到期日期')}
          </div>
          <div className="font-bold text-sm">
            {contract.expiresAt
              ? new Date(contract.expiresAt).toLocaleDateString()
              : t('marketplace.unlimited', '不限时')}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-6 space-y-5 animate-in slide-in-from-top-2 duration-200">
          {/* Pricing details */}
          {(contract.dailyRate || contract.monthlyRate || contract.platformFeeRate) && (
            <div>
              <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" /> {t('marketplace.pricingDetail', '费率详情')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-xs text-gray-400">{t('marketplace.hourlyRate', '时租')}</div>
                  <div className="font-bold text-sm">{contract.hourlyRate} 🦐</div>
                </div>
                {contract.dailyRate ? (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-xs text-gray-400">
                      {t('marketplace.dailyRate', '日租')}
                    </div>
                    <div className="font-bold text-sm">{contract.dailyRate} 🦐</div>
                  </div>
                ) : null}
                {contract.monthlyRate ? (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-xs text-gray-400">
                      {t('marketplace.monthlyRate', '月租')}
                    </div>
                    <div className="font-bold text-sm">{contract.monthlyRate} 🦐</div>
                  </div>
                ) : null}
                {contract.platformFeeRate ? (
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="text-xs text-gray-400">
                      {t('marketplace.platformFee', '平台费率')}
                    </div>
                    <div className="font-bold text-sm">
                      {(contract.platformFeeRate / 100).toFixed(1)}%
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Listing snapshot */}
          {snapshot && (
            <div>
              <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> {t('marketplace.listingSnapshot', '挂单快照')}
              </h3>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                {snapshot.title && (
                  <div>
                    <span className="text-gray-400 font-bold">
                      {t('marketplace.title', '标题')}：
                    </span>
                    <span className="text-gray-700">{String(snapshot.title)}</span>
                  </div>
                )}
                {snapshot.description && (
                  <div>
                    <span className="text-gray-400 font-bold">
                      {t('marketplace.description', '描述')}：
                    </span>
                    <span className="text-gray-700">{String(snapshot.description)}</span>
                  </div>
                )}
                {snapshot.deviceTier && (
                  <div>
                    <span className="text-gray-400 font-bold">
                      {t('marketplace.deviceTier', '设备等级')}：
                    </span>
                    <span className="text-gray-700">
                      {DEVICE_TIERS[String(snapshot.deviceTier)] || String(snapshot.deviceTier)}
                    </span>
                  </div>
                )}
                {snapshot.osType && (
                  <div>
                    <span className="text-gray-400 font-bold">
                      {t('marketplace.os', '操作系统')}：
                    </span>
                    <span className="text-gray-700">{String(snapshot.osType)}</span>
                  </div>
                )}
                {Array.isArray(snapshot.skills) && snapshot.skills.length > 0 && (
                  <div>
                    <span className="text-gray-400 font-bold">
                      {t('marketplace.skills', '技能')}：
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(snapshot.skills as string[]).map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 bg-cyan-50 text-cyan-700 text-xs rounded-full font-bold"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {snapshot.guidelines && (
                  <div>
                    <span className="text-gray-400 font-bold">
                      {t('marketplace.guidelines', '使用须知')}：
                    </span>
                    <p className="text-gray-700 whitespace-pre-wrap mt-1">
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
              <h3 className="text-sm font-bold text-gray-600 mb-2 flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> {t('marketplace.terms', '合同条款')}
              </h3>
              <div className="space-y-3">
                {contract.ownerTerms && (
                  <div className="bg-amber-50 rounded-xl p-4">
                    <div className="text-xs font-bold text-amber-600 mb-1">
                      {t('marketplace.ownerTerms', '出租方条款')}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {contract.ownerTerms}
                    </p>
                  </div>
                )}
                {contract.platformTerms && (
                  <div className="bg-blue-50 rounded-xl p-4">
                    <div className="text-xs font-bold text-blue-600 mb-1">
                      {t('marketplace.platformTerms', '平台条款')}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {contract.platformTerms}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Termination info */}
          {contract.terminatedAt && (
            <div className="bg-red-50 rounded-xl p-4">
              <div className="text-xs font-bold text-red-600 mb-1">
                {t('marketplace.terminationInfo', '终止信息')}
              </div>
              <div className="text-sm text-gray-700">
                <div>
                  {t('marketplace.terminatedAt', '终止时间')}：
                  {new Date(contract.terminatedAt).toLocaleString()}
                </div>
                {contract.terminationReason && (
                  <div className="mt-1">
                    {t('marketplace.terminateReason', '终止原因')}：{contract.terminationReason}
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
    return (
      <div className="text-sm font-bold text-red-500">{t('marketplace.expired', '租赁已到期')}</div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-cyan-500" />
      <span className="text-sm font-bold text-gray-600">
        {t('marketplace.remainingTime', '剩余时间')}
      </span>
      <span className="font-mono font-bold text-cyan-700">{formatCountdown(remaining)}</span>
    </div>
  )
}

function calcRemaining(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now())
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return `${d}天 ${h}时 ${m}分`
  if (h > 0) return `${h}时 ${m}分 ${s}秒`
  return `${m}分 ${s}秒`
}
