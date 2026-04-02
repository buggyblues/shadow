import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, CreditCard, Filter, RefreshCw, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useRechargeStore } from '../../stores/recharge.store'

type TransactionType =
  | 'topup'
  | 'purchase'
  | 'refund'
  | 'reward'
  | 'transfer'
  | 'adjustment'
  | 'settlement'

type FilterType = 'all' | 'income' | 'expense'

interface WalletTransaction {
  id: string
  walletId: string
  type: TransactionType
  amount: number
  balanceAfter: number
  currency: string
  referenceId: string | null
  referenceType: string | null
  note: string | null
  createdAt: string
}

const TYPE_ICONS: Record<TransactionType, typeof CreditCard> = {
  topup: CreditCard,
  purchase: ArrowUpRight,
  refund: ArrowDownLeft,
  reward: ArrowDownLeft,
  transfer: ArrowUpRight,
  adjustment: RefreshCw,
  settlement: ArrowUpRight,
}

const TYPE_COLORS: Record<TransactionType, string> = {
  topup: 'text-green-500 bg-green-500/10',
  purchase: 'text-orange-500 bg-orange-500/10',
  refund: 'text-blue-500 bg-blue-500/10',
  reward: 'text-amber-500 bg-amber-500/10',
  transfer: 'text-purple-500 bg-purple-500/10',
  adjustment: 'text-gray-500 bg-gray-500/10',
  settlement: 'text-red-500 bg-red-500/10',
}

const PAGE_SIZE = 20

export function WalletSettings() {
  const { t } = useTranslation()
  const { openModal } = useRechargeStore()
  const [filter, setFilter] = useState<FilterType>('all')
  const [offset, setOffset] = useState(0)

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ id: string; balance: number; frozenAmount: number }>('/api/wallet'),
  })

  const { data: txCount } = useQuery({
    queryKey: ['wallet-transactions-count'],
    queryFn: () => fetchApi<{ count: number }>('/api/wallet/transactions/count'),
  })

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['wallet-transactions', offset],
    queryFn: () =>
      fetchApi<WalletTransaction[]>(`/api/wallet/transactions?limit=${PAGE_SIZE}&offset=${offset}`),
  })

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'income') return tx.amount > 0
    if (filter === 'expense') return tx.amount < 0
    return true
  })

  const totalCount = txCount?.count ?? 0
  const hasMore = offset + PAGE_SIZE < totalCount

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-text-primary">{t('wallet.title')}</h2>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent rounded-2xl p-6 border border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-muted mb-1">{t('wallet.balance')}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-text-primary">
                {wallet?.balance?.toLocaleString() ?? '—'}
              </span>
              <span className="text-xl">🦐</span>
            </div>
            {(wallet?.frozenAmount ?? 0) > 0 && (
              <p className="text-xs text-text-muted mt-1">
                {t('wallet.frozen', '冻结')}: {wallet?.frozenAmount?.toLocaleString()} 🦐
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={openModal}
            className="px-5 py-2.5 rounded-xl font-bold text-white bg-primary hover:bg-primary-hover transition-all shadow-md shadow-primary/25"
          >
            {t('wallet.rechargeBtn')}
          </button>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{t('wallet.transactionHistory')}</h3>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-bg-tertiary rounded-lg p-1">
            {(['all', 'income', 'expense'] as FilterType[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f)
                  setOffset(0)
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                  filter === f
                    ? 'bg-bg-secondary text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {f === 'all' && <Filter size={12} className="inline mr-1" />}
                {f === 'income' && <ArrowDownLeft size={12} className="inline mr-1" />}
                {f === 'expense' && <ArrowUpRight size={12} className="inline mr-1" />}
                {t(`wallet.${f === 'all' ? 'filterAll' : f}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-text-muted" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-text-muted">
            <Wallet size={48} className="mb-3 opacity-30" />
            <p className="text-sm">{t('wallet.noTransactions')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTransactions.map((tx) => {
              const Icon = TYPE_ICONS[tx.type] ?? RefreshCw
              const colorClass = TYPE_COLORS[tx.type] ?? 'text-gray-500 bg-gray-500/10'
              const isPositive = tx.amount > 0

              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-bg-secondary/50 hover:bg-bg-secondary transition"
                >
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
                  >
                    <Icon size={18} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {t(`wallet.type.${tx.type}`)}
                      </span>
                    </div>
                    {tx.note && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{tx.note}</p>
                    )}
                    <p className="text-[11px] text-text-muted/60 mt-0.5">
                      {formatDate(tx.createdAt)}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        isPositive ? 'text-green-500' : 'text-text-primary'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {tx.amount.toLocaleString()} 🦐
                    </span>
                    <p className="text-[11px] text-text-muted/60 mt-0.5">
                      {t('wallet.balanceAfter')}: {tx.balanceAfter.toLocaleString()}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-bg-secondary text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              ← {t('recharge.back')}
            </button>
            <span className="text-xs text-text-muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} / {totalCount}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition"
              >
                {t('wallet.loadMore')} →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
