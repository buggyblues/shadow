import { Button, cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Gift, Package, Search, Send, Wallet, X } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type CommunityAsset,
  useCommunityAssets,
  useSendGift,
  useSendTip,
} from '../../hooks/use-community-economy'
import { fetchApi } from '../../lib/api'
import { UserAvatar } from '../common/avatar'
import { ShrimpCoinIcon } from '../shop/ui/currency'

type SendMode = 'tip' | 'gift'

export interface CommunityEconomyRecipient {
  id: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

interface FriendEntry {
  user: CommunityEconomyRecipient & { status?: string; isBot?: boolean }
}

interface DmChannelEntry {
  otherUser: (CommunityEconomyRecipient & { status?: string; isBot?: boolean }) | null
  lastMessageAt?: string | null
}

function createIdempotencyKey(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
}

function formatApiError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function displayName(recipient: CommunityEconomyRecipient) {
  return recipient.displayName || recipient.username || recipient.id
}

export function CommunityEconomySendModal({
  open,
  mode = 'tip',
  recipient,
  recipientUserId,
  initialAssetGrantId,
  onClose,
}: {
  open: boolean
  mode?: SendMode
  recipient?: CommunityEconomyRecipient
  recipientUserId?: string
  initialAssetGrantId?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data } = useCommunityAssets()
  const sendTip = useSendTip()
  const sendGift = useSendGift()
  const [activeMode, setActiveMode] = useState<SendMode>(mode)
  const [selectedRecipient, setSelectedRecipient] = useState<CommunityEconomyRecipient | null>(
    recipient ?? null,
  )
  const [recipientQuery, setRecipientQuery] = useState('')
  const [amount, setAmount] = useState('')
  const [assetGrantId, setAssetGrantId] = useState(initialAssetGrantId ?? '')
  const [assetQuantity, setAssetQuantity] = useState('1')
  const [message, setMessage] = useState('')

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ id: string; balance: number; frozenAmount: number }>('/api/wallet'),
    enabled: open,
  })

  const { data: resolvedRecipient } = useQuery({
    queryKey: ['community-economy-recipient', recipientUserId],
    queryFn: () => fetchApi<CommunityEconomyRecipient>(`/api/auth/users/${recipientUserId}`),
    enabled: open && !recipient && !!recipientUserId,
  })

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends'),
    enabled: open && !recipient && !recipientUserId,
  })

  const { data: dmChannels = [] } = useQuery({
    queryKey: ['dm-channels'],
    queryFn: () => fetchApi<DmChannelEntry[]>('/api/dm/channels'),
    enabled: open && !recipient && !recipientUserId,
  })

  useEffect(() => {
    if (!open) return
    setActiveMode(mode)
    setSelectedRecipient(recipient ?? resolvedRecipient ?? null)
    setAssetGrantId(initialAssetGrantId ?? '')
    setAssetQuantity('1')
    setAmount('')
    setMessage('')
    setRecipientQuery('')
    sendTip.reset()
    sendGift.reset()
  }, [open, mode, recipient, resolvedRecipient, initialAssetGrantId])

  const contacts = useMemo(() => {
    const map = new Map<string, CommunityEconomyRecipient>()
    for (const channel of dmChannels) {
      if (channel.otherUser) map.set(channel.otherUser.id, channel.otherUser)
    }
    for (const friend of friends) {
      map.set(friend.user.id, friend.user)
    }
    const query = recipientQuery.trim().toLowerCase()
    return Array.from(map.values()).filter((item) => {
      if (!query) return true
      return `${item.displayName ?? ''} ${item.username ?? ''}`.toLowerCase().includes(query)
    })
  }, [dmChannels, friends, recipientQuery])

  if (!open) return null

  const giftableAssets =
    data?.assets.filter(
      (asset) =>
        asset.definition.giftable &&
        asset.grant.status === 'active' &&
        asset.grant.remainingQuantity > 0,
    ) ?? []
  const selectedAsset = giftableAssets.find((asset) => asset.grant.id === assetGrantId) ?? null
  const pending = sendTip.isPending || sendGift.isPending
  const error = sendTip.error ?? sendGift.error
  const completed = sendTip.isSuccess || sendGift.isSuccess
  const amountValue = Number(amount)
  const hasCurrency = Number.isFinite(amountValue) && amountValue > 0
  const quantityValue = Number(assetQuantity)
  const quantityValid =
    !selectedAsset ||
    (Number.isFinite(quantityValue) &&
      quantityValue > 0 &&
      quantityValue <= selectedAsset.grant.remainingQuantity)
  const amountWithinBalance = !wallet || !hasCurrency || amountValue <= wallet.balance
  const canSubmit =
    !!selectedRecipient &&
    !pending &&
    !completed &&
    amountWithinBalance &&
    quantityValid &&
    (activeMode === 'tip' ? hasCurrency : hasCurrency || Boolean(assetGrantId))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedRecipient) return
    if (activeMode === 'tip') {
      sendTip.mutate({
        recipientUserId: selectedRecipient.id,
        amount: amountValue,
        message: message.trim() || undefined,
        idempotencyKey: createIdempotencyKey('tip'),
      })
      return
    }

    sendGift.mutate({
      recipientUserId: selectedRecipient.id,
      currencies: hasCurrency ? [{ currencyCode: 'shrimp_coin', amount: amountValue }] : undefined,
      assets: assetGrantId
        ? [{ assetGrantId, quantity: quantityValue > 0 ? quantityValue : 1 }]
        : undefined,
      message: message.trim() || undefined,
      idempotencyKey: createIdempotencyKey('gift'),
    })
  }

  const resetCurrentMutation = () => {
    sendTip.reset()
    sendGift.reset()
    setAmount('')
    setAssetQuantity('1')
    setMessage('')
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default border-none bg-bg-deep/70 p-0 backdrop-blur-md"
        onClick={onClose}
        aria-label={t('common.close')}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border-subtle bg-bg-primary shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle p-5">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
              {t('communityEconomy.actions')}
            </p>
            <h2 className="text-lg font-black text-text-primary">
              {activeMode === 'tip'
                ? t('communityEconomy.sendTip')
                : t('communityEconomy.sendGift')}
            </h2>
          </div>
          <Button variant="ghost" size="icon" type="button" icon={X} onClick={onClose} />
        </div>

        <form className="min-h-0 overflow-y-auto p-5" onSubmit={submit}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-bg-tertiary/40 p-1">
                {(['tip', 'gift'] as SendMode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setActiveMode(option)}
                    className={cn(
                      'rounded-xl px-3 py-2 text-xs font-black transition',
                      activeMode === option
                        ? 'bg-primary/15 text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-primary',
                    )}
                  >
                    {option === 'tip'
                      ? t('communityEconomy.sendTip')
                      : t('communityEconomy.sendGift')}
                  </button>
                ))}
              </div>

              <RecipientPicker
                fixed={Boolean(recipient || recipientUserId)}
                selected={selectedRecipient}
                contacts={contacts}
                query={recipientQuery}
                onQueryChange={setRecipientQuery}
                onSelect={setSelectedRecipient}
              />

              <AmountPicker
                label={
                  activeMode === 'tip'
                    ? t('communityEconomy.amount')
                    : t('communityEconomy.currencyGiftAmount')
                }
                amount={amount}
                onChange={setAmount}
                required={activeMode === 'tip'}
              />

              {activeMode === 'gift' && (
                <AssetPicker
                  assets={giftableAssets}
                  selectedAsset={selectedAsset}
                  selectedGrantId={assetGrantId}
                  quantity={assetQuantity}
                  onSelect={setAssetGrantId}
                  onQuantityChange={setAssetQuantity}
                />
              )}

              <CommunityEconomyInput
                label={t('communityEconomy.message')}
                value={message}
                onChange={setMessage}
                multiline
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-secondary/50 p-4">
              {completed ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-success/20 bg-success/10 p-4 text-success">
                    <CheckCircle2 size={28} />
                    <p className="mt-3 text-sm font-black">
                      {activeMode === 'tip'
                        ? t('communityEconomy.tipSent')
                        : t('communityEconomy.giftSent')}
                    </p>
                    {selectedRecipient && (
                      <p className="mt-1 text-xs font-bold text-text-muted">
                        {t('communityEconomy.sentTo', { name: displayName(selectedRecipient) })}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    type="button"
                    className="w-full"
                    onClick={onClose}
                  >
                    {t('common.done')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    type="button"
                    className="w-full"
                    onClick={resetCurrentMutation}
                  >
                    {t('communityEconomy.sendAnother')}
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-text-muted/60">
                    {t('communityEconomy.confirmation')}
                  </p>
                  {selectedRecipient ? (
                    <RecipientCard recipient={selectedRecipient} compact />
                  ) : (
                    <p className="text-sm text-text-muted">
                      {t('communityEconomy.chooseRecipient')}
                    </p>
                  )}
                  <div className="rounded-xl bg-bg-tertiary/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-muted/60">
                      {activeMode === 'tip'
                        ? t('communityEconomy.sendTip')
                        : t('communityEconomy.sendGift')}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-lg font-black text-text-primary">
                      {hasCurrency ? amountValue.toLocaleString() : 0}
                      <ShrimpCoinIcon size={16} />
                    </div>
                  </div>
                  <div className="rounded-xl bg-bg-tertiary/50 p-3">
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-text-muted/60">
                      <Wallet size={12} />
                      {t('wallet.balance')}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm font-black text-text-primary">
                      {(wallet?.balance ?? 0).toLocaleString()}
                      <ShrimpCoinIcon size={14} />
                    </div>
                    {hasCurrency && wallet && (
                      <p className="mt-1 text-xs text-text-muted">
                        {t('communityEconomy.estimatedBalanceAfter')}:{' '}
                        {Math.max(0, wallet.balance - amountValue).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {selectedAsset && (
                    <div className="rounded-xl bg-bg-tertiary/50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-muted/60">
                        {t('communityEconomy.assetGift')}
                      </p>
                      <p className="mt-2 truncate text-sm font-black text-text-primary">
                        {selectedAsset.definition.name} × {assetQuantity || 1}
                      </p>
                    </div>
                  )}
                  {!amountWithinBalance && (
                    <InlineWarning message={t('communityEconomy.insufficientBalance')} />
                  )}
                  {!quantityValid && (
                    <InlineWarning message={t('communityEconomy.assetQuantityExceeded')} />
                  )}
                  <Button
                    variant="primary"
                    size="md"
                    type="submit"
                    icon={activeMode === 'tip' ? Send : Gift}
                    disabled={!canSubmit}
                    className="w-full"
                  >
                    {activeMode === 'tip'
                      ? t('communityEconomy.sendTip')
                      : t('communityEconomy.sendGift')}
                  </Button>
                </>
              )}
              {error && (
                <p className="rounded-2xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-bold text-danger">
                  {t('communityEconomy.operationFailed')}: {formatApiError(error)}
                </p>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function InlineWarning({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-warning/25 bg-warning/10 px-3 py-2 text-xs font-bold text-warning">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      {message}
    </p>
  )
}

function RecipientPicker({
  fixed,
  selected,
  contacts,
  query,
  onQueryChange,
  onSelect,
}: {
  fixed: boolean
  selected: CommunityEconomyRecipient | null
  contacts: CommunityEconomyRecipient[]
  query: string
  onQueryChange: (value: string) => void
  onSelect: (recipient: CommunityEconomyRecipient) => void
}) {
  const { t } = useTranslation()
  if (fixed && selected) {
    return (
      <div className="space-y-2">
        <FieldLabel>{t('communityEconomy.sendTo')}</FieldLabel>
        <RecipientCard recipient={selected} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <FieldLabel>{t('communityEconomy.chooseRecipient')}</FieldLabel>
      <label className="flex items-center gap-2 rounded-2xl border border-border-subtle bg-bg-secondary px-3 py-2">
        <Search size={16} className="text-text-muted" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('communityEconomy.searchRecipient')}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </label>
      <div className="grid max-h-44 gap-2 overflow-y-auto pr-1">
        {contacts.length === 0 ? (
          <p className="rounded-2xl border border-border-subtle bg-bg-secondary/50 p-4 text-sm text-text-muted">
            {t('communityEconomy.noRecipients')}
          </p>
        ) : (
          contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelect(contact)}
              className={cn(
                'rounded-2xl border p-3 text-left transition',
                selected?.id === contact.id
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border-subtle bg-bg-secondary/40 hover:border-primary/30',
              )}
            >
              <RecipientCard recipient={contact} compact />
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function RecipientCard({
  recipient,
  compact = false,
}: {
  recipient: CommunityEconomyRecipient
  compact?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar
        userId={recipient.id}
        avatarUrl={recipient.avatarUrl ?? null}
        displayName={displayName(recipient)}
        size={compact ? 'sm' : 'md'}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-text-primary">{displayName(recipient)}</p>
        {recipient.username && (
          <p className="truncate text-xs font-bold text-text-muted">@{recipient.username}</p>
        )}
      </div>
    </div>
  )
}

function AmountPicker({
  label,
  amount,
  onChange,
  required,
}: {
  label: string
  amount: string
  onChange: (value: string) => void
  required: boolean
}) {
  const { t } = useTranslation()
  const presets = [10, 50, 100, 520]
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <div className="grid grid-cols-4 gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(String(preset))}
            className={cn(
              'rounded-2xl border px-3 py-2 text-sm font-black transition',
              amount === String(preset)
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border-subtle bg-bg-secondary/40 text-text-primary hover:border-primary/30',
            )}
          >
            {preset}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 rounded-2xl border border-border-subtle bg-bg-secondary px-3 py-2">
        <ShrimpCoinIcon size={16} />
        <input
          value={amount}
          onChange={(event) => onChange(event.target.value)}
          type="number"
          min={required ? 1 : 0}
          required={required}
          placeholder={t('communityEconomy.customAmount')}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </label>
    </div>
  )
}

function AssetPicker({
  assets,
  selectedAsset,
  selectedGrantId,
  quantity,
  onSelect,
  onQuantityChange,
}: {
  assets: CommunityAsset[]
  selectedAsset: CommunityAsset | null
  selectedGrantId: string
  quantity: string
  onSelect: (grantId: string) => void
  onQuantityChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <FieldLabel>{t('communityEconomy.chooseAsset')}</FieldLabel>
      {assets.length === 0 ? (
        <p className="rounded-2xl border border-border-subtle bg-bg-secondary/50 p-4 text-sm text-text-muted">
          {t('communityEconomy.noGiftableAssets')}
        </p>
      ) : (
        <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => onSelect('')}
            className={cn(
              'rounded-2xl border p-3 text-left text-sm font-bold transition',
              !selectedGrantId
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border-subtle bg-bg-secondary/40 text-text-muted hover:border-primary/30',
            )}
          >
            {t('communityEconomy.noAssetGift')}
          </button>
          {assets.map((asset) => (
            <button
              key={asset.grant.id}
              type="button"
              onClick={() => onSelect(asset.grant.id)}
              className={cn(
                'rounded-2xl border p-3 text-left transition',
                selectedGrantId === asset.grant.id
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border-subtle bg-bg-secondary/40 hover:border-primary/30',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                {asset.definition.imageUrl ? (
                  <img
                    src={asset.definition.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Package size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-text-primary">
                    {asset.definition.name}
                  </span>
                  <span className="block text-xs font-bold text-text-muted">
                    {t('communityEconomy.remaining')}: {asset.grant.remainingQuantity}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {selectedAsset && (
        <CommunityEconomyInput
          label={t('communityEconomy.assetQuantity')}
          value={quantity}
          onChange={onQuantityChange}
          type="number"
          min={1}
          max={selectedAsset.grant.remainingQuantity}
        />
      )}
    </div>
  )
}

function CommunityEconomyInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  min,
  max,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  required?: boolean
  min?: number
  max?: number
  multiline?: boolean
}) {
  const className =
    'w-full rounded-2xl border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-primary'

  return (
    <label className="block space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(className, 'min-h-20 resize-none')}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          min={min}
          max={max}
          required={required}
          className={className}
        />
      )}
    </label>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-black text-text-muted">{children}</span>
}
