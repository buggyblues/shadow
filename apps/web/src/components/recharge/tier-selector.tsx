import { useTranslation } from 'react-i18next'
import { type RechargeTier, useRechargeStore } from '../../stores/recharge.store'

const TIERS: {
  key: RechargeTier
  coins: number
  usdCents: number
  labelKey: string
  badge?: string
}[] = [
  { key: '1000', coins: 1000, usdCents: 1000, labelKey: 'recharge.starter' },
  { key: '3000', coins: 3000, usdCents: 2999, labelKey: 'recharge.bestValue', badge: '🔥' },
  { key: '5000', coins: 5000, usdCents: 4999, labelKey: 'recharge.premium' },
]

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function TierSelector() {
  const { t } = useTranslation()
  const { selectedTier, customAmount, setTier, setCustomAmount } = useRechargeStore()

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted font-medium">{t('recharge.selectTier')}</p>

      <div className="grid grid-cols-3 gap-3">
        {TIERS.map((tier) => (
          <button
            key={tier.key}
            type="button"
            onClick={() => setTier(tier.key)}
            className={`relative flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${
              selectedTier === tier.key
                ? 'border-primary bg-primary/10 shadow-md'
                : 'border-border-subtle hover:border-primary/50 bg-bg-tertiary'
            }`}
          >
            {tier.badge && (
              <span className="absolute -top-2 -right-2 text-xs bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                {tier.badge}
              </span>
            )}
            <span className="text-lg font-bold text-text-primary">
              {tier.coins.toLocaleString()}
            </span>
            <span className="text-xs text-text-muted">{t(tier.labelKey)}</span>
            <span className="text-sm font-semibold text-primary">{formatUsd(tier.usdCents)}</span>
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <button
        type="button"
        onClick={() => setTier('custom')}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
          selectedTier === 'custom'
            ? 'border-primary bg-primary/10'
            : 'border-border-subtle hover:border-primary/50 bg-bg-tertiary'
        }`}
      >
        <span className="text-sm font-medium text-text-primary">{t('recharge.custom')}</span>
        {selectedTier === 'custom' && (
          <input
            type="number"
            min={100}
            step={100}
            value={customAmount || ''}
            onChange={(e) => setCustomAmount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
            onClick={(e) => e.stopPropagation()}
            placeholder={t('recharge.customPlaceholder')}
            className="flex-1 bg-bg-primary border border-border-subtle rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary"
          />
        )}
        {selectedTier === 'custom' && customAmount >= 100 && (
          <span className="text-sm font-semibold text-primary whitespace-nowrap">
            {formatUsd(customAmount)}
          </span>
        )}
      </button>
    </div>
  )
}
