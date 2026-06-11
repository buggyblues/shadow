import { Button } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

export interface WalletRechargeMetadata {
  requiredAmount?: number
  balance?: number
  shortfall?: number
  model?: string
}

const WALLET_RECHARGE_MARKER_PATTERN = /<!--\s*shadow:wallet-recharge\s+([A-Za-z0-9_-]+)\s*-->/u

function formatCoinValue(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
}

export function decodeWalletRechargeMarker(content: string): WalletRechargeMetadata | null {
  const match = content.match(WALLET_RECHARGE_MARKER_PATTERN)
  const encoded = match?.[1]
  if (!encoded || typeof window === 'undefined') return null
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const parsed = JSON.parse(window.atob(padded)) as Record<string, unknown>
    const pickNumber = (key: string) => {
      const value = parsed[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined
    }
    return {
      requiredAmount: pickNumber('requiredAmount'),
      balance: pickNumber('balance'),
      shortfall: pickNumber('shortfall'),
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
    }
  } catch {
    return null
  }
}

export function stripWalletRechargeMarker(content: string): string {
  return content.replace(WALLET_RECHARGE_MARKER_PATTERN, '').trim()
}

function openRechargeModal(onUnavailable: () => void) {
  if (typeof window === 'undefined') return
  let acked = false
  const onAck = () => {
    acked = true
    window.removeEventListener('shadow:open-recharge:ack', onAck)
  }
  window.addEventListener('shadow:open-recharge:ack', onAck)
  window.dispatchEvent(new CustomEvent('shadow:open-recharge', { detail: { source: 'chat' } }))
  window.setTimeout(() => {
    window.removeEventListener('shadow:open-recharge:ack', onAck)
    if (!acked) onUnavailable()
  }, 500)
}

function WalletRechargeCardBase({ data }: { data: WalletRechargeMetadata }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="mt-3 max-w-lg rounded-2xl bg-warning/10 p-4 text-left shadow-[0_0_0_1px_rgba(245,158,11,0.18)_inset]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <Wallet size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-black text-text-primary">
            {t('chat.modelWalletRechargeTitle')}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            {t('chat.modelWalletRechargeBody')}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-bg-primary/35 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted">
            {t('chat.modelWalletRechargeNeeded')}
          </p>
          <p className="mt-1 text-sm font-black text-text-primary">
            {formatCoinValue(data.requiredAmount)}
          </p>
        </div>
        <div className="rounded-xl bg-bg-primary/35 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted">
            {t('chat.modelWalletRechargeBalance')}
          </p>
          <p className="mt-1 text-sm font-black text-text-primary">
            {formatCoinValue(data.balance)}
          </p>
        </div>
        <div className="rounded-xl bg-bg-primary/35 px-3 py-2">
          <p className="text-[11px] font-semibold text-text-muted">
            {t('chat.modelWalletRechargeShortfall')}
          </p>
          <p className="mt-1 text-sm font-black text-warning">{formatCoinValue(data.shortfall)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => openRechargeModal(() => navigate({ to: '/settings/wallet' }))}
          className="!rounded-xl"
        >
          <Wallet size={14} />
          {t('chat.modelWalletRechargeAction')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate({ to: '/settings/tasks' })}
          className="!rounded-xl"
        >
          {t('chat.modelWalletTasksAction')}
        </Button>
      </div>
    </div>
  )
}

export const WalletRechargeCard = memo(WalletRechargeCardBase)
WalletRechargeCard.displayName = 'WalletRechargeCard'
