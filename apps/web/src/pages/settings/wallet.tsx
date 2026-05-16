import { Button, cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Coins,
  CreditCard,
  Filter,
  Gift,
  HandCoins,
  LockKeyhole,
  Package,
  RefreshCw,
  Target,
  UnlockKeyhole,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommunityEconomySendModal } from '../../components/community-economy/community-economy-send-modal'
import { ShrimpCoinIcon } from '../../components/shop/ui/currency'
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
    orderNo: string
    status: string
    totalAmount: number
    currency: string
    productName?: string | null
    shop?: { id: string; name?: string | null } | null
  } | null
  counterparty?: {
    userId?: string | null
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

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
    <SettingsPanel>
      {/* Balance Card — Brand Gradient */}
      <SettingsCard className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-success/5 border-primary/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-success/10 rounded-full blur-3xl -ml-10 -mb-10" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 mb-1">
              {t('wallet.balance')}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-text-primary tabular-nums">
                {wallet?.balance?.toLocaleString() ?? '—'}
              </span>
              <ShrimpCoinIcon size={24} />
            </div>
            {(wallet?.frozenAmount ?? 0) > 0 && (
              <p className="text-xs text-text-muted mt-1 inline-flex items-center gap-1">
                {t('wallet.frozen')}: {wallet?.frozenAmount?.toLocaleString()}{' '}
                <ShrimpCoinIcon size={12} />
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={openModal}
              className="shadow-lg shadow-primary/25"
            >
              {t('wallet.rechargeBtn')}
            </Button>
            {(wallet?.balance ?? 0) < 100 && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => navigate({ to: '/settings/tasks', replace: true })}
                icon={Target}
              >
                {t('wallet.earnByTasks')}
              </Button>
            )}
          </div>
        </div>
      </SettingsCard>

      <div className="flex flex-wrap items-center gap-1 rounded-full bg-bg-tertiary/30 p-1">
        {(
          [
            ['transactions', t('wallet.transactionHistory')],
            ['entitlements', t('commerce.entitlements')],
            ['assets', t('communityEconomy.assets')],
            ['settlements', t('communityEconomy.settlements')],
            ['actions', t('communityEconomy.actions')],
          ] as Array<[WalletSettingsSection, string]>
        ).map(([section, label]) => (
          <button
            key={section}
            type="button"
            aria-pressed={activeSection === section}
            onClick={() => setActiveSection(section)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-black transition',
              activeSection === section
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {label}
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
        <CommunityActionsSection />
      ) : (
        <>
          {/* Transaction History */}
          <SettingsSectionBlock
            titleKey="wallet.transactionHistory"
            titleFallback="Transaction History"
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
  const [giftGrantId, setGiftGrantId] = useState<string | null>(null)
  const displayedAssets =
    assetTypeFilter === 'all'
      ? assets
      : assets.filter((asset) => asset.definition.assetType === assetTypeFilter)

  const runGrantAction = (
    action: 'consume' | 'lock' | 'unlock' | 'revoke',
    grantId: string,
    reason?: string,
  ) => {
    if (
      (action === 'consume' || action === 'revoke') &&
      !window.confirm(t(`communityEconomy.confirm.${action}`))
    ) {
      return
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
      titleKey="communityEconomy.assets"
      titleFallback="Community Assets"
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
                  {type}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs font-bold text-text-muted">
            {t('communityEconomy.assetCount', { count: displayedAssets.length })}
          </span>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-text-muted" />
        </div>
      ) : displayedAssets.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t('communityEconomy.noAssets')}
          description={t('communityEconomy.noAssetsHint')}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {displayedAssets.map((asset) => (
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

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-secondary/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        {definition.imageUrl ? (
          <img
            src={definition.imageUrl}
            alt=""
            className="h-12 w-12 rounded-2xl object-cover border border-border-subtle"
          />
        ) : (
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Package size={20} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-black text-text-primary">{definition.name}</h4>
            <StatusPill status={grant.status} />
          </div>
          {definition.description && (
            <p className="mt-1 line-clamp-2 text-xs text-text-muted">{definition.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <AssetMeta label={t('communityEconomy.quantity')} value={String(grant.quantity)} />
        <AssetMeta
          label={t('communityEconomy.remaining')}
          value={String(grant.remainingQuantity)}
        />
        <AssetMeta label={t('communityEconomy.type')} value={definition.assetType} />
        <AssetMeta
          label={t('communityEconomy.expiresAt')}
          value={expiresAt ?? t('communityEconomy.never')}
        />
      </div>

      <div className="flex flex-wrap gap-2">
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
  )
}

function CommunitySettlementsSection() {
  const { t } = useTranslation()
  const { data, isLoading } = useSettlementLines({ limit: 50, offset: 0 })
  const settleMutation = useSettleAvailableLines()
  const settlements = data?.settlements ?? []
  const availableCount = settlements.filter((line) => line.status === 'available').length
  const pendingNet = settlements
    .filter((line) => line.status === 'pending' || line.status === 'held')
    .reduce((sum, line) => sum + line.netAmount, 0)

  return (
    <SettingsSectionBlock
      titleKey="communityEconomy.settlements"
      titleFallback="Settlements"
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
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryMetric
          label={t('communityEconomy.totalLines')}
          value={String(settlements.length)}
        />
        <SummaryMetric
          label={t('communityEconomy.availableLines')}
          value={String(availableCount)}
        />
        <SummaryMetric
          label={t('communityEconomy.pendingNet')}
          value={pendingNet.toLocaleString()}
          icon={<ShrimpCoinIcon size={14} />}
        />
      </div>

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
        <div className="space-y-2">
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/30 p-3 md:flex-row md:items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-text-primary">
            {t(`communityEconomy.source.${line.sourceType}`, line.sourceType)}
          </span>
          <StatusPill status={line.status} />
        </div>
        <p className="mt-1 truncate text-xs text-text-muted">
          {t('communityEconomy.availableAt')}: {availableAt ?? t('communityEconomy.notAvailable')}
          {settledAt ? ` · ${t('communityEconomy.settledAt')}: ${settledAt}` : ''}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-right text-xs md:w-72">
        <AmountMeta label={t('communityEconomy.gross')} amount={line.grossAmount} />
        <AmountMeta label={t('communityEconomy.fee')} amount={line.platformFee} />
        <AmountMeta label={t('communityEconomy.net')} amount={line.netAmount} emphasis />
      </div>
    </div>
  )
}

function CommunityActionsSection() {
  const { t } = useTranslation()
  const [showTipModal, setShowTipModal] = useState(false)

  return (
    <div className="grid gap-4">
      <SettingsSectionBlock titleKey="communityEconomy.sendTip" titleFallback="Send tip">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border-subtle bg-bg-secondary/50 p-4">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HandCoins size={22} />
            </div>
            <p className="text-sm font-black text-text-primary">
              {t('communityEconomy.tipEntryTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {t('communityEconomy.tipEntryHint')}
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            type="button"
            icon={HandCoins}
            onClick={() => setShowTipModal(true)}
          >
            {t('communityEconomy.sendTip')}
          </Button>
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
