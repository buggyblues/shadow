import { Button, cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Coins,
  CreditCard,
  Filter,
  Gift,
  HandCoins,
  HeartHandshake,
  LockKeyhole,
  Package,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  UnlockKeyhole,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirmStore } from '../../components/common/confirm-dialog'
import { CommunityEconomySendModal } from '../../components/community-economy/community-economy-send-modal'
import { ShrimpCoinIcon } from '../../components/shop/ui/currency'
import { ProductVisual } from '../../components/shop/ui/product-visual'
import {
  type CommunityAsset,
  type SettlementLine,
  useCommunityAssets,
  useConsumeCommunityAsset,
  useLockCommunityAsset,
  useRevokeCommunityAsset,
  useSettleAvailableLines,
  useSettlementLines,
  useUnlockCommunityAsset,
} from '../../hooks/use-community-economy'
import { fetchApi } from '../../lib/api'
import { useRechargeStore } from '../../stores/recharge.store'
import { EntitlementsPage } from '../commerce'
import { SettingsCard, SettingsPanel, SettingsSectionBlock } from './_shared'

type TransactionType =
  | 'topup'
  | 'purchase'
  | 'refund'
  | 'reward'
  | 'transfer'
  | 'adjustment'
  | 'settlement'

type FilterType = 'all' | 'income' | 'expense'
export type WalletSettingsSection =
  | 'transactions'
  | 'entitlements'
  | 'assets'
  | 'settlements'
  | 'actions'

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
  display?: {
    title?: string | null
    subtitle?: string | null
  } | null
  order?: {
    id: string
    entitlementId?: string | null
    orderNo: string
    status: string
    totalAmount: number
    currency: string
    productName?: string | null
    shop?: {
      id: string
      name?: string | null
      scopeKind?: 'server' | 'user' | null
      ownerUserId?: string | null
      serverId?: string | null
      serverSlug?: string | null
    } | null
  } | null
  counterparty?: {
    userId?: string | null
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

interface WalletEntitlement {
  status: string
  isActive: boolean
  expiresAt?: string | null
  resourceType?: string | null
  resourceId?: string | null
  paidFile?: { id: string } | null
}

type WalletTransactionShop = NonNullable<NonNullable<WalletTransaction['order']>['shop']>

const TYPE_ICONS: Record<TransactionType, typeof CreditCard> = {
  topup: CreditCard,
  purchase: ArrowUpRight,
  refund: ArrowDownLeft,
  reward: ArrowDownLeft,
  transfer: ArrowUpRight,
  adjustment: RefreshCw,
  settlement: ArrowDownLeft,
}

const TYPE_COLORS: Record<TransactionType, string> = {
  topup: 'text-success bg-success/10',
  purchase: 'text-warning bg-warning/10',
  refund: 'text-primary bg-primary/10',
  reward: 'text-warning bg-warning/10',
  transfer: 'text-info bg-info/10',
  adjustment: 'text-text-muted bg-text-muted/10',
  settlement: 'text-success bg-success/10',
}

const PAGE_SIZE = 20

function createIdempotencyKey(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
}

function formatApiError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function formatOptionalDate(dateStr?: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function walletEntitlementActive(entitlement: WalletEntitlement) {
  if (!entitlement.isActive || entitlement.status !== 'active') return false
  if (!entitlement.expiresAt) return true
  return new Date(entitlement.expiresAt).getTime() > Date.now()
}

function walletEntitlementOpenable(entitlement: WalletEntitlement) {
  return (
    walletEntitlementActive(entitlement) &&
    Boolean(
      entitlement.paidFile?.id ||
        (entitlement.resourceType === 'workspace_file' && entitlement.resourceId),
    )
  )
}

function walletShopHref(shop?: WalletTransactionShop | null) {
  if (!shop) return null
  if (shop.ownerUserId) return `/app/shop/users/${shop.ownerUserId}?view=buyer`
  if (shop.serverSlug || shop.serverId)
    return `/app/servers/${shop.serverSlug ?? shop.serverId}/shop`
  return null
}

function walletCounterpartyName(tx: WalletTransaction) {
  const counterparty = tx.counterparty
  return counterparty?.displayName ?? counterparty?.username ?? counterparty?.userId ?? null
}

export function WalletSettings({
  initialSection = 'transactions',
}: {
  initialSection?: WalletSettingsSection
} = {}) {
  const { t } = useTranslation()
  const { openModal } = useRechargeStore()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterType>('all')
  const [offset, setOffset] = useState(0)
  const [activeSection, setActiveSection] = useState<WalletSettingsSection>(initialSection)
  const transactionDirection = filter === 'income' || filter === 'expense' ? filter : 'all'

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ id: string; balance: number; frozenAmount: number }>('/api/wallet'),
  })

  const { data: entitlementSummary = [] } = useQuery({
    queryKey: ['entitlements'],
    queryFn: async () => {
      const result = await fetchApi<unknown>('/api/entitlements')
      return Array.isArray(result) ? (result as WalletEntitlement[]) : []
    },
  })

  const { data: communityAssetsSummary } = useCommunityAssets()
  const { data: settlementSummary } = useSettlementLines({ limit: 50, offset: 0 })

  const { data: txCount } = useQuery({
    queryKey: ['wallet-transactions-count', transactionDirection],
    queryFn: () =>
      fetchApi<{ count: number }>(
        `/api/wallet/transactions/count?audience=consumer&direction=${transactionDirection}`,
      ),
  })

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['wallet-transactions', offset, transactionDirection],
    queryFn: () => {
      const params = new URLSearchParams({
        audience: 'consumer',
        direction: transactionDirection,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      return fetchApi<WalletTransaction[]>(`/api/wallet/transactions?${params}`)
    },
  })
  const filteredTransactions = transactions

  const totalCount = txCount?.count ?? 0
  const hasMore = offset + PAGE_SIZE < totalCount
  const activeEntitlementCount = entitlementSummary.filter(walletEntitlementActive).length
  const openableEntitlementCount = entitlementSummary.filter(walletEntitlementOpenable).length
  const activeAssets = (communityAssetsSummary?.assets ?? []).filter(
    (asset) =>
      (asset.grant.status === 'active' || asset.grant.status === 'locked') &&
      asset.grant.remainingQuantity > 0,
  )
  const giftableAssetCount = activeAssets.filter((asset) => asset.definition.giftable).length
  const settlementLines = settlementSummary?.settlements ?? []
  const availableSettlementCount = settlementLines.filter(
    (line) => line.status === 'available',
  ).length
  const pendingSettlementNet = settlementLines
    .filter((line) => line.status === 'pending' || line.status === 'held')
    .reduce((sum, line) => sum + line.netAmount, 0)

  const sectionOptions: Array<{
    section: WalletSettingsSection
    label: string
    caption: string
    metric: string
    icon: LucideIcon
  }> = [
    {
      section: 'transactions',
      label: t('wallet.transactionHistory'),
      caption: t('wallet.sectionHint.transactions'),
      metric: totalCount.toLocaleString(),
      icon: ReceiptText,
    },
    {
      section: 'entitlements',
      label: t('commerce.entitlements'),
      caption: t('wallet.sectionHint.entitlements'),
      metric: openableEntitlementCount.toLocaleString(),
      icon: ShieldCheck,
    },
    {
      section: 'assets',
      label: t('communityEconomy.assets'),
      caption: t('wallet.sectionHint.assets'),
      metric: activeAssets.length.toLocaleString(),
      icon: Package,
    },
    {
      section: 'settlements',
      label: t('communityEconomy.settlements'),
      caption: t('wallet.sectionHint.settlements'),
      metric: availableSettlementCount.toLocaleString(),
      icon: HandCoins,
    },
    {
      section: 'actions',
      label: t('communityEconomy.actions'),
      caption: t('wallet.sectionHint.actions'),
      metric: giftableAssetCount.toLocaleString(),
      icon: HeartHandshake,
    },
  ]

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
    <SettingsPanel className="space-y-5">
      <SettingsCard className="overflow-hidden border-primary/25 bg-bg-secondary/60 p-0">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-primary">
              <Sparkles size={15} />
              {t('wallet.hubEyebrow')}
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-muted">{t('wallet.balance')}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-text-primary tabular-nums sm:text-5xl">
                    {wallet?.balance?.toLocaleString() ?? '—'}
                  </span>
                  <ShrimpCoinIcon size={26} />
                </div>
                {(wallet?.frozenAmount ?? 0) > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">
                    {t('wallet.frozen')}: {wallet?.frozenAmount?.toLocaleString()}{' '}
                    <ShrimpCoinIcon size={12} />
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="md"
                  type="button"
                  onClick={openModal}
                  className="shadow-lg shadow-primary/25"
                >
                  {t('wallet.rechargeBtn')}
                </Button>
                <Button
                  variant={(wallet?.balance ?? 0) < 100 ? 'secondary' : 'ghost'}
                  size="md"
                  type="button"
                  onClick={() => navigate({ to: '/settings/tasks', replace: true })}
                  icon={Target}
                >
                  {t('wallet.earnByTasks')}
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-2 border-t border-border-subtle bg-bg-primary/35 p-4 lg:border-l lg:border-t-0">
            <WalletSignal
              icon={ShoppingBag}
              label={t('wallet.readyToUse')}
              value={activeEntitlementCount.toLocaleString()}
              detail={t('wallet.readyToUseDetail', { count: openableEntitlementCount })}
              onClick={() => setActiveSection('entitlements')}
            />
            <WalletSignal
              icon={Package}
              label={t('wallet.communityInventory')}
              value={activeAssets.length.toLocaleString()}
              detail={t('wallet.communityInventoryDetail', { count: giftableAssetCount })}
              onClick={() => setActiveSection('assets')}
            />
            <WalletSignal
              icon={HandCoins}
              label={t('wallet.creatorIncome')}
              value={availableSettlementCount.toLocaleString()}
              detail={t('wallet.creatorIncomeDetail', {
                amount: pendingSettlementNet.toLocaleString(),
              })}
              onClick={() => setActiveSection('settlements')}
            />
          </div>
        </div>
      </SettingsCard>

      <div className="grid gap-2 md:grid-cols-5">
        {sectionOptions.map(({ section, label, caption, metric, icon: Icon }) => (
          <button
            key={section}
            type="button"
            aria-pressed={activeSection === section}
            onClick={() => setActiveSection(section)}
            className={cn(
              'min-h-[96px] rounded-2xl border px-3 py-3 text-left transition',
              activeSection === section
                ? 'border-primary/50 bg-primary/12 text-primary shadow-[0_12px_28px_rgba(0,198,209,0.12)]'
                : 'border-border-subtle bg-bg-secondary/35 text-text-muted hover:border-primary/30 hover:text-text-primary',
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Icon size={16} className={activeSection === section ? 'text-primary' : ''} />
              <span className="rounded-full bg-bg-primary/50 px-2 py-0.5 text-[11px] font-black tabular-nums">
                {metric}
              </span>
            </div>
            <div className="text-sm font-black">{label}</div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{caption}</p>
          </button>
        ))}
      </div>

      {activeSection === 'entitlements' ? (
        <EntitlementsPage embedded />
      ) : activeSection === 'assets' ? (
        <CommunityAssetsSection />
      ) : activeSection === 'settlements' ? (
        <CommunitySettlementsSection />
      ) : activeSection === 'actions' ? (
        <CommunityActionsSection onOpenAssets={() => setActiveSection('assets')} />
      ) : (
        <>
          {/* Transaction History */}
          <SettingsSectionBlock
            titleKey="wallet.transactionHistory"
            actions={
              <div className="flex items-center gap-1 bg-bg-tertiary/30 rounded-full p-1">
                {(['all', 'income', 'expense'] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFilter(f)
                      setOffset(0)
                    }}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-black transition-all',
                      filter === f
                        ? 'bg-primary/15 text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                  >
                    {f === 'all' && <Filter size={12} className="inline mr-1" />}
                    {f === 'income' && <ArrowDownLeft size={12} className="inline mr-1" />}
                    {f === 'expense' && <ArrowUpRight size={12} className="inline mr-1" />}
                    {t(`wallet.${f === 'all' ? 'filterAll' : f}`)}
                  </button>
                ))}
              </div>
            }
          >
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
                  const colorClass = TYPE_COLORS[tx.type] ?? 'text-text-muted bg-text-muted/10'
                  const isPositive = tx.amount > 0
                  const transactionTitle = tx.display?.title ?? tx.note
                  const counterpartyName = walletCounterpartyName(tx)
                  const orderHref = tx.order?.entitlementId
                    ? `/app/settings/wallet/orders/${tx.order.entitlementId}`
                    : tx.order?.id
                      ? `/app/settings/wallet/orders/${tx.order.id}?by=order`
                      : null
                  const shopHref = walletShopHref(tx.order?.shop)

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--glass-bg)] backdrop-blur-xl border border-border-subtle hover:bg-bg-modifier-hover transition-all"
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
                      >
                        <Icon size={18} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text-primary">
                            {t(`wallet.type.${tx.type}`)}
                          </span>
                        </div>
                        {transactionTitle && (
                          <p className="text-xs text-text-muted truncate mt-0.5">
                            {transactionTitle}
                          </p>
                        )}
                        {tx.display?.subtitle && (
                          <p className="text-[11px] text-text-muted/60 truncate mt-0.5">
                            {tx.display.subtitle}
                          </p>
                        )}
                        <p className="text-[11px] text-text-muted/60 mt-0.5">
                          {formatDate(tx.createdAt)}
                        </p>
                        {(counterpartyName || orderHref || shopHref) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black">
                            {counterpartyName && (
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-bg-primary/55 px-2 py-1 text-text-muted">
                                <span className="text-text-secondary">{t('commerce.buyer')}</span>
                                <span className="truncate text-text-primary">
                                  {counterpartyName}
                                </span>
                              </span>
                            )}
                            {orderHref && (
                              <a
                                href={orderHref}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-primary transition hover:bg-primary/15"
                              >
                                <ReceiptText size={12} />
                                {t('commerce.viewOrderDetail')}
                              </a>
                            )}
                            {shopHref && (
                              <a
                                href={shopHref}
                                className="inline-flex items-center gap-1 rounded-full bg-bg-primary/55 px-2 py-1 text-text-secondary transition hover:text-primary"
                              >
                                <ShoppingBag size={12} />
                                {t('commerce.openShop')}
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={cn(
                            'text-sm font-black tabular-nums inline-flex items-center gap-1',
                            isPositive
                              ? 'text-success bg-success/10 px-2 py-0.5 rounded-full'
                              : 'text-text-secondary',
                          )}
                        >
                          {isPositive ? '+' : ''}
                          {tx.amount.toLocaleString()} <ShrimpCoinIcon size={14} />
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
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  ← {t('recharge.back')}
                </Button>
                <span className="text-xs text-text-muted">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} / {totalCount}
                </span>
                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    {t('wallet.loadMore')} →
                  </Button>
                )}
              </div>
            )}
          </SettingsSectionBlock>
        </>
      )}
    </SettingsPanel>
  )
}

function WalletSignal({
  icon: Icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/45 px-3 py-2.5 text-left transition hover:border-primary/35 hover:bg-bg-secondary/70"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-xl font-black text-text-primary tabular-nums">{value}</span>
          <span className="truncate text-xs font-black text-text-secondary">{label}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs font-bold text-text-muted">{detail}</span>
      </span>
    </button>
  )
}

function CommunityAssetsSection() {
  const { t } = useTranslation()
  const { data, isLoading } = useCommunityAssets()
  const consumeMutation = useConsumeCommunityAsset()
  const lockMutation = useLockCommunityAsset()
  const unlockMutation = useUnlockCommunityAsset()
  const revokeMutation = useRevokeCommunityAsset()
  const assets = data?.assets ?? []
  const assetTypes = Array.from(new Set(assets.map((asset) => asset.definition.assetType))).sort()
  const [assetTypeFilter, setAssetTypeFilter] = useState('all')
  const [assetUseFilter, setAssetUseFilter] = useState<'all' | 'usable' | 'giftable' | 'history'>(
    'all',
  )
  const [giftGrantId, setGiftGrantId] = useState<string | null>(null)
  const usableAssets = assets.filter(
    (asset) => asset.grant.status === 'active' && asset.grant.remainingQuantity > 0,
  )
  const giftableAssets = usableAssets.filter((asset) => asset.definition.giftable)
  const historyAssets = assets.filter(
    (asset) =>
      asset.grant.status !== 'active' ||
      asset.grant.remainingQuantity <= 0 ||
      (asset.grant.expiresAt && new Date(asset.grant.expiresAt).getTime() <= Date.now()),
  )
  const displayedAssets =
    assetTypeFilter === 'all'
      ? assets
      : assets.filter((asset) => asset.definition.assetType === assetTypeFilter)
  const filteredAssets = displayedAssets.filter((asset) => {
    if (assetUseFilter === 'usable') {
      return asset.grant.status === 'active' && asset.grant.remainingQuantity > 0
    }
    if (assetUseFilter === 'giftable') {
      return (
        asset.definition.giftable &&
        asset.grant.status === 'active' &&
        asset.grant.remainingQuantity > 0
      )
    }
    if (assetUseFilter === 'history') {
      return historyAssets.some((historyAsset) => historyAsset.grant.id === asset.grant.id)
    }
    return true
  })

  const assetFilterOptions: Array<{
    key: typeof assetUseFilter
    count: number
    icon: ReactNode
  }> = [
    { key: 'all', count: assets.length, icon: <Package size={13} /> },
    { key: 'usable', count: usableAssets.length, icon: <CheckCircle2 size={13} /> },
    { key: 'giftable', count: giftableAssets.length, icon: <Gift size={13} /> },
    { key: 'history', count: historyAssets.length, icon: <ReceiptText size={13} /> },
  ]

  const runGrantAction = async (
    action: 'consume' | 'lock' | 'unlock' | 'revoke',
    grantId: string,
    reason?: string,
  ) => {
    if (action === 'consume' || action === 'revoke') {
      const ok = await useConfirmStore.getState().confirm({
        title: t(`communityEconomy.${action}`),
        message: t(`communityEconomy.confirm.${action}`),
        confirmLabel: t(`communityEconomy.${action}`),
        cancelLabel: t('common.cancel'),
        danger: action === 'revoke',
      })
      if (!ok) return
    }

    const idempotencyKey = createIdempotencyKey(`asset-${action}`)
    if (action === 'consume') consumeMutation.mutate({ grantId, idempotencyKey })
    if (action === 'lock') lockMutation.mutate({ grantId, idempotencyKey })
    if (action === 'unlock') unlockMutation.mutate({ grantId, idempotencyKey })
    if (action === 'revoke') revokeMutation.mutate({ grantId, idempotencyKey, reason })
  }

  const pending =
    consumeMutation.isPending ||
    lockMutation.isPending ||
    unlockMutation.isPending ||
    revokeMutation.isPending
  const error =
    consumeMutation.error ?? lockMutation.error ?? unlockMutation.error ?? revokeMutation.error

  return (
    <SettingsSectionBlock
      titleKey="communityEconomy.assetLibraryTitle"
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {assetTypes.length > 0 && (
            <select
              value={assetTypeFilter}
              onChange={(event) => setAssetTypeFilter(event.target.value)}
              className="rounded-full border border-border-subtle bg-bg-secondary px-3 py-1.5 text-xs font-bold text-text-primary outline-none focus:border-primary"
            >
              <option value="all">{t('communityEconomy.allAssetTypes')}</option>
              {assetTypes.map((type) => (
                <option key={type} value={type}>
                  {t(`communityEconomy.assetTypes.${type}`, { defaultValue: type })}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs font-bold text-text-muted">
            {t('communityEconomy.assetCount', { count: filteredAssets.length })}
          </span>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryMetric
          label={t('communityEconomy.usableAssets')}
          value={String(usableAssets.length)}
        />
        <SummaryMetric
          label={t('communityEconomy.giftableAssets')}
          value={String(giftableAssets.length)}
        />
        <SummaryMetric
          label={t('communityEconomy.historyAssets')}
          value={String(historyAssets.length)}
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-2xl bg-bg-tertiary/25 p-1">
        {assetFilterOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={assetUseFilter === option.key}
            onClick={() => setAssetUseFilter(option.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition',
              assetUseFilter === option.key
                ? 'bg-primary/15 text-primary'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {option.icon}
            {t(`communityEconomy.assetFilters.${option.key}`)}
            <span className="rounded-full bg-bg-primary/50 px-1.5 py-0.5 text-[10px] tabular-nums">
              {option.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-text-muted" />
        </div>
      ) : filteredAssets.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            assets.length === 0
              ? t('communityEconomy.noAssets')
              : t('communityEconomy.noFilteredAssets')
          }
          description={
            assets.length === 0
              ? t('communityEconomy.noAssetsHint')
              : t('communityEconomy.noFilteredAssetsHint')
          }
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredAssets.map((asset) => (
            <CommunityAssetCard
              key={asset.grant.id}
              asset={asset}
              pending={pending}
              onAction={runGrantAction}
              onGift={setGiftGrantId}
            />
          ))}
        </div>
      )}
      {error && <MutationError message={formatApiError(error)} />}
      <CommunityEconomySendModal
        open={!!giftGrantId}
        mode="gift"
        initialAssetGrantId={giftGrantId ?? undefined}
        onClose={() => setGiftGrantId(null)}
      />
    </SettingsSectionBlock>
  )
}

function CommunityAssetCard({
  asset,
  pending,
  onAction,
  onGift,
}: {
  asset: CommunityAsset
  pending: boolean
  onAction: (
    action: 'consume' | 'lock' | 'unlock' | 'revoke',
    grantId: string,
    reason?: string,
  ) => void
  onGift: (grantId: string) => void
}) {
  const { t } = useTranslation()
  const { grant, definition } = asset
  const expiresAt = formatOptionalDate(grant.expiresAt)
  const isActive = grant.status === 'active'
  const isLocked = grant.status === 'locked'
  const assetTypeLabel = t(`communityEconomy.assetTypes.${definition.assetType}`, {
    defaultValue: definition.assetType,
  })
  const behaviorLabels = [
    definition.consumable
      ? t('communityEconomy.assetBehavior.consumable')
      : t('communityEconomy.assetBehavior.holdable'),
    definition.giftable
      ? t('communityEconomy.assetBehavior.giftable')
      : t('communityEconomy.assetBehavior.bound'),
  ]

  return (
    <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/35 p-3 sm:grid-cols-[132px_minmax(0,1fr)]">
      <ProductVisual
        name={definition.name}
        imageUrl={definition.imageUrl}
        resourceType="community_asset"
        assetType={definition.assetType}
        className="aspect-[3/2] w-full rounded-xl border border-border-subtle sm:w-[132px]"
      />
      <div className="min-w-0 space-y-3">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate text-base font-black text-text-primary">{definition.name}</h4>
              {definition.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                  {definition.description}
                </p>
              )}
            </div>
            <StatusPill status={grant.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-black text-primary">
              {assetTypeLabel}
            </span>
            {behaviorLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-bg-primary/60 px-2 py-1 text-[11px] font-black text-text-muted"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <AssetMeta
            label={t('communityEconomy.remaining')}
            value={`${grant.remainingQuantity}/${grant.quantity}`}
          />
          <AssetMeta
            label={t('communityEconomy.expiresAt')}
            value={expiresAt ?? t('communityEconomy.never')}
          />
        </div>

        <div className="grid gap-2 min-[520px]:grid-cols-2">
          <a
            href={`/app/assets/${grant.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-subtle bg-bg-primary/70 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
          >
            <Package size={14} />
            {t('communityEconomy.assetHome')}
          </a>
          {definition.consumable && isActive && grant.remainingQuantity > 0 && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              icon={Coins}
              disabled={pending}
              onClick={() => onAction('consume', grant.id)}
            >
              {t('communityEconomy.consume')}
            </Button>
          )}
          {definition.giftable && isActive && grant.remainingQuantity > 0 && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              icon={Gift}
              disabled={pending}
              onClick={() => onGift(grant.id)}
            >
              {t('communityEconomy.sendGift')}
            </Button>
          )}
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              icon={LockKeyhole}
              disabled={pending}
              onClick={() => onAction('lock', grant.id)}
            >
              {t('communityEconomy.lock')}
            </Button>
          )}
          {isLocked && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              icon={UnlockKeyhole}
              disabled={pending}
              onClick={() => onAction('unlock', grant.id)}
            >
              {t('communityEconomy.unlock')}
            </Button>
          )}
          {(isActive || isLocked) && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              icon={Ban}
              disabled={pending}
              onClick={() => onAction('revoke', grant.id, 'user_requested')}
            >
              {t('communityEconomy.revoke')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function CommunitySettlementsSection() {
  const { t } = useTranslation()
  const { data, isLoading } = useSettlementLines({ limit: 50, offset: 0 })
  const settleMutation = useSettleAvailableLines()
  const settlements = data?.settlements ?? []
  const availableCount = settlements.filter((line) => line.status === 'available').length
  const availableNet = settlements
    .filter((line) => line.status === 'available')
    .reduce((sum, line) => sum + line.netAmount, 0)
  const pendingNet = settlements
    .filter((line) => line.status === 'pending' || line.status === 'held')
    .reduce((sum, line) => sum + line.netAmount, 0)
  const settledCount = settlements.filter((line) => line.status === 'settled').length

  return (
    <SettingsSectionBlock
      titleKey="communityEconomy.settlementCenterTitle"
      actions={
        <Button
          variant="primary"
          size="sm"
          type="button"
          icon={HandCoins}
          disabled={availableCount === 0 || settleMutation.isPending}
          onClick={() => settleMutation.mutate()}
        >
          {t('communityEconomy.settleAvailable')}
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryMetric
          label={t('communityEconomy.totalLines')}
          value={String(settlements.length)}
        />
        <SummaryMetric
          label={t('communityEconomy.availableLines')}
          value={String(availableCount)}
        />
        <SummaryMetric
          label={t('communityEconomy.availableNet')}
          value={availableNet.toLocaleString()}
          icon={<ShrimpCoinIcon size={14} />}
        />
        <SummaryMetric
          label={t('communityEconomy.pendingNet')}
          value={pendingNet.toLocaleString()}
          icon={<ShrimpCoinIcon size={14} />}
        />
      </div>
      {settledCount > 0 && (
        <p className="text-xs font-bold text-text-muted">
          {t('communityEconomy.settledLinesHint', { count: settledCount })}
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-text-muted" />
        </div>
      ) : settlements.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={t('communityEconomy.noSettlements')}
          description={t('communityEconomy.noSettlementsHint')}
        />
      ) : (
        <div className="grid gap-3">
          {settlements.map((line) => (
            <SettlementRow key={line.id} line={line} />
          ))}
        </div>
      )}

      {settleMutation.error && <MutationError message={formatApiError(settleMutation.error)} />}
    </SettingsSectionBlock>
  )
}

function SettlementRow({ line }: { line: SettlementLine }) {
  const { t } = useTranslation()
  const availableAt = formatOptionalDate(line.availableAt)
  const settledAt = formatOptionalDate(line.settledAt)

  return (
    <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/35 p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 text-success">
            <HandCoins size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-black text-text-primary">
                {t(`communityEconomy.source.${line.sourceType}`, line.sourceType)}
              </span>
              <StatusPill status={line.status} />
            </div>
            <p className="mt-1 truncate text-xs font-bold text-text-muted">
              {t('communityEconomy.availableAt')}:{' '}
              {availableAt ?? t('communityEconomy.notAvailable')}
              {settledAt ? ` · ${t('communityEconomy.settledAt')}: ${settledAt}` : ''}
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <AmountMeta label={t('communityEconomy.gross')} amount={line.grossAmount} />
        <AmountMeta label={t('communityEconomy.fee')} amount={line.platformFee} />
        <AmountMeta label={t('communityEconomy.net')} amount={line.netAmount} emphasis />
      </div>
    </div>
  )
}

function CommunityActionsSection({ onOpenAssets }: { onOpenAssets?: () => void }) {
  const { t } = useTranslation()
  const [showTipModal, setShowTipModal] = useState(false)

  return (
    <div className="grid gap-4">
      <SettingsSectionBlock titleKey="communityEconomy.communitySupportTitle">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border-subtle bg-bg-secondary/50 p-4">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HandCoins size={22} />
            </div>
            <p className="text-sm font-black text-text-primary">
              {t('communityEconomy.tipEntryTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {t('communityEconomy.tipEntryHint')}
            </p>
            <Button
              className="mt-4"
              variant="primary"
              size="md"
              type="button"
              icon={HandCoins}
              onClick={() => setShowTipModal(true)}
            >
              {t('communityEconomy.sendTip')}
            </Button>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-bg-secondary/50 p-4">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <Gift size={22} />
            </div>
            <p className="text-sm font-black text-text-primary">
              {t('communityEconomy.giftEntryTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {t('communityEconomy.giftEntryHint')}
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              size="md"
              type="button"
              icon={Gift}
              onClick={onOpenAssets}
            >
              {t('communityEconomy.openGiftShelf')}
            </Button>
          </div>
        </div>
      </SettingsSectionBlock>
      <CommunityEconomySendModal
        open={showTipModal}
        mode="tip"
        onClose={() => setShowTipModal(false)}
      />
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center py-12 text-center text-text-muted">
      <Icon size={48} className="mb-3 opacity-30" />
      <p className="text-sm font-bold text-text-secondary">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed">{description}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation()
  const tone =
    status === 'active' || status === 'available' || status === 'settled'
      ? 'bg-success/10 text-success'
      : status === 'pending' || status === 'held' || status === 'locked'
        ? 'bg-warning/10 text-warning'
        : 'bg-text-muted/10 text-text-muted'

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase', tone)}>
      {t(`communityEconomy.status.${status}`, status)}
    </span>
  )
}

function AssetMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-bg-tertiary/40 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-text-muted/60">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-bold text-text-primary">{value}</p>
    </div>
  )
}

function SummaryMetric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-bg-secondary/50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-text-muted/60">
        {label}
      </p>
      <p className="mt-1 flex items-center gap-1 text-lg font-black text-text-primary">
        {value}
        {icon}
      </p>
    </div>
  )
}

function AmountMeta({
  label,
  amount,
  emphasis = false,
}: {
  label: string
  amount: number
  emphasis?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-text-muted/60">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 inline-flex items-center justify-end gap-1 font-black tabular-nums',
          emphasis ? 'text-success' : 'text-text-primary',
        )}
      >
        {amount.toLocaleString()} <ShrimpCoinIcon size={12} />
      </p>
    </div>
  )
}

function MutationError({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <p className="rounded-2xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-bold text-danger">
      {t('communityEconomy.operationFailed')}: {message}
    </p>
  )
}

function MutationSuccess({ message }: { message: string }) {
  return (
    <p className="rounded-2xl border border-success/20 bg-success/10 px-3 py-2 text-xs font-bold text-success">
      {message}
    </p>
  )
}
