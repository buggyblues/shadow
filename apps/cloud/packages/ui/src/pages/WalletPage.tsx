import { Badge, Button, Card, EmptyState } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Coins, Loader2, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { useApiClient } from '@/lib/api-context'

type WalletApi = {
  wallet?: {
    get: () => Promise<{ balance: number }>
    transactions: (params?: {
      limit?: number
      offset?: number
    }) => Promise<{ transactions: Transaction[]; total: number; limit: number; offset: number }>
  }
}

type Transaction = {
  id: string
  type: string
  amount: number
  balanceAfter: number
  referenceId: string | null
  referenceType: string | null
  note: string | null
  createdAt: string
}

const TX_TYPE_LABELS: Record<string, string> = {
  topup: '充值',
  purchase: '消费',
  refund: '退款',
  settlement: '结算',
  cloud_deploy: '部署',
}

const PAGE_SIZE = 20

export function WalletPage() {
  const { t } = useTranslation()
  const api = useApiClient() as WalletApi

  const [offset, setOffset] = useState(0)

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.wallet?.get?.() ?? Promise.resolve({ balance: 0 }),
  })

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['wallet-transactions', offset],
    queryFn: () =>
      api.wallet?.transactions?.({ limit: PAGE_SIZE, offset }) ??
      Promise.resolve({ transactions: [], total: 0, limit: PAGE_SIZE, offset }),
  })

  /**
   * Open the apps/web global Stripe recharge modal.
   * The host app listens for 'shadow:open-recharge' and dispatches to its zustand store.
   * Falls back to navigating to /shop if the listener is not present (standalone dashboard).
   */
  const openRecharge = () => {
    const evt = new CustomEvent('shadow:open-recharge')
    let handled = false
    const ack = () => {
      handled = true
    }
    window.addEventListener('shadow:open-recharge:ack', ack, { once: true })
    window.dispatchEvent(evt)
    setTimeout(() => {
      window.removeEventListener('shadow:open-recharge:ack', ack)
      if (!handled) {
        // Standalone dashboard fallback
        window.location.assign('/shop')
      }
    }, 50)
  }

  const total = txData?.total ?? 0
  const transactions = txData?.transactions ?? []
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <PageShell
      breadcrumb={[{ label: t('nav.wallet') }]}
      title={t('wallet.title')}
      description={t('wallet.description')}
    >
      {/* Balance card */}
      <Card className="p-6 flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Wallet size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-text-muted">{t('wallet.currentBalance')}</p>
            {walletLoading ? (
              <Loader2 size={16} className="animate-spin mt-1" />
            ) : (
              <p className="text-2xl font-bold">
                {(walletData?.balance ?? 0).toLocaleString()}{' '}
                <span className="text-sm font-normal text-text-muted">
                  {t('wallet.shrimpCoins')}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={openRecharge}>
            <Coins size={14} className="mr-1" />
            {t('wallet.topUp')}
          </Button>
        </div>
      </Card>

      {/* Transaction history */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{t('wallet.transactionHistory')}</h3>
        {txLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={Coins}
            title={t('wallet.noTransactions')}
            description={t('wallet.noTransactionsDesc')}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-bg-secondary text-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">{t('wallet.txType')}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t('wallet.txNote')}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t('wallet.txAmount')}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t('wallet.txBalance')}</th>
                    <th className="px-4 py-2.5 text-left font-medium">{t('wallet.txDate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-bg-secondary/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <Badge variant={tx.amount > 0 ? 'success' : 'warning'} className="text-xs">
                          {TX_TYPE_LABELS[tx.type] ?? tx.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary max-w-[200px] truncate">
                        {tx.note ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        <span
                          className={
                            tx.amount > 0
                              ? 'text-green-600 flex items-center justify-end gap-1'
                              : 'text-red-500 flex items-center justify-end gap-1'
                          }
                        >
                          {tx.amount > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {tx.amount > 0 ? '+' : ''}
                          {tx.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm text-text-secondary">
                        {tx.balanceAfter.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-muted whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-text-muted">
                  {t('wallet.page', { current: currentPage, total: totalPages })}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    {t('common.prev')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
