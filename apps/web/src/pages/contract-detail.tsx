import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  DollarSign,
  FileText,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
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
  depositAmount: number
  totalCost: number
  listingSnapshot: Record<string, unknown>
  ownerTerms: string | null
  platformTerms: string | null
  listing?: { title: string; deviceTier: string; osType: string } | null
  createdAt: string
}

interface UsageRecord {
  id: string
  sessionStart: string
  sessionEnd: string
  tokenCost: number
  electricityCost: number
  rentalCost: number
  platformFee: number
  totalCost: number
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

  // Fetch usage records
  const { data: usageData } = useQuery({
    queryKey: ['marketplace', 'contract', contractId, 'usage'],
    queryFn: () =>
      fetchApi<{ records: UsageRecord[] }>(`/api/marketplace/contracts/${contractId}/usage`),
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
  const usageRecords = usageData?.records || []

  return (
    <div
      className="min-h-screen bg-[#f2f7fc] text-gray-800"
      style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}
    >
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <Link
          to="/app/marketplace/my-rentals"
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

        {/* Usage Records */}
        <div className="bg-white/80 backdrop-blur rounded-2xl border-2 border-white/90 shadow-lg p-8 mb-6">
          <h2
            style={{ fontFamily: "'ZCOOL KuaiLe', cursive" }}
            className="text-lg font-bold mb-4 flex items-center gap-2"
          >
            <FileText className="w-5 h-5 text-cyan-500" />
            {t('marketplace.usageRecords', '使用记录')}
          </h2>

          {usageRecords.length === 0 ? (
            <p className="text-gray-400 text-sm font-medium py-6 text-center">
              {t('marketplace.noUsage', '暂无使用记录')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-100">
                    <th className="text-left py-2 px-3 text-gray-400 font-bold">
                      {t('marketplace.session', '会话')}
                    </th>
                    <th className="text-right py-2 px-3 text-gray-400 font-bold">
                      {t('marketplace.tokenCost', 'Token')}
                    </th>
                    <th className="text-right py-2 px-3 text-gray-400 font-bold">
                      {t('marketplace.electricity', '电费')}
                    </th>
                    <th className="text-right py-2 px-3 text-gray-400 font-bold">
                      {t('marketplace.rental', '租金')}
                    </th>
                    <th className="text-right py-2 px-3 text-gray-400 font-bold">
                      {t('marketplace.fee', '手续费')}
                    </th>
                    <th className="text-right py-2 px-3 text-gray-400 font-bold">
                      {t('marketplace.total', '合计')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usageRecords.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2.5 px-3">
                        <div className="font-medium">
                          {new Date(r.sessionStart).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-400">
                          → {new Date(r.sessionEnd).toLocaleString()}
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-3 font-mono">{r.tokenCost}</td>
                      <td className="text-right py-2.5 px-3 font-mono">{r.electricityCost}</td>
                      <td className="text-right py-2.5 px-3 font-mono">{r.rentalCost}</td>
                      <td className="text-right py-2.5 px-3 font-mono text-gray-400">
                        {r.platformFee}
                      </td>
                      <td className="text-right py-2.5 px-3 font-bold text-amber-600">
                        {r.totalCost} 🦐
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
