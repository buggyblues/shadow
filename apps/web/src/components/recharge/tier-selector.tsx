import { cn } from '@shadowob/ui'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useRechargeStore } from '../../stores/recharge.store'

export type RechargeTierOption = {
  key: string
  shrimpCoins: number
  usdCents: number
  label: string
}

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function TierSelector({
  tiers,
  customAmountMin,
  customAmountMax,
  exchangeRate,
  hourlyCost,
}: {
  tiers: RechargeTierOption[]
  customAmountMin: number
  customAmountMax: number
  exchangeRate: number
  hourlyCost?: number
}) {
  const { t } = useTranslation()
  const { selectedTier, customAmount, setTier, setCustomAmount } = useRechargeStore()
  const runtimeEstimate = (coins: number) =>
    hourlyCost && hourlyCost > 0
      ? t('recharge.runtimeEstimate', { hours: Math.floor(coins / hourlyCost) })
      : null

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-bold text-text-primary">{t('recharge.selectAmount')}</p>
        <p className="mt-1 text-xs text-text-muted">{t('recharge.selectAmountDesc')}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {tiers.map((tier) => {
          const selected = selectedTier === tier.key
          return (
            <button
              type="button"
              key={tier.key}
              className={cn(
                'relative rounded-2xl border px-4 py-3 text-left transition',
                selected
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                  : 'border-border-subtle bg-bg-secondary hover:border-text-muted/30 hover:bg-bg-tertiary',
              )}
              onClick={() => setTier(tier.key)}
            >
              {selected ? (
                <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
                  <Check size={12} />
                </span>
              ) : null}
              <span className="block text-base font-black text-text-primary">
                {tier.shrimpCoins.toLocaleString()}
              </span>
              <span className="mt-0.5 block text-xs text-text-muted">{t('recharge.coins')}</span>
              <span className="mt-2 block text-sm font-bold text-text-primary">
                {formatUsd(tier.usdCents)}
              </span>
              {runtimeEstimate(tier.shrimpCoins) ? (
                <span className="mt-1 block text-[11px] text-text-muted">
                  {runtimeEstimate(tier.shrimpCoins)}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className={cn(
          'w-full rounded-2xl border p-3 text-left transition',
          selectedTier === 'custom'
            ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
            : 'border-border-subtle bg-bg-secondary hover:border-text-muted/30',
        )}
        onClick={() => setTier('custom')}
      >
        <span className="text-sm font-bold text-text-primary">{t('recharge.custom')}</span>
        {selectedTier === 'custom' ? (
          <div className="mt-2 flex items-center gap-3">
            <input
              type="number"
              min={customAmountMin}
              max={customAmountMax}
              step={100}
              value={customAmount || ''}
              onChange={(event) =>
                setCustomAmount(Math.max(0, Number.parseInt(event.target.value, 10) || 0))
              }
              onClick={(event) => event.stopPropagation()}
              placeholder={t('recharge.customPlaceholder')}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border-subtle bg-bg-base px-3 text-sm text-text-primary outline-none focus:border-primary"
            />
            {customAmount >= customAmountMin && customAmount <= customAmountMax ? (
              <span className="shrink-0 text-sm font-bold text-text-primary">
                {formatUsd(Math.round((customAmount / Math.max(exchangeRate, 1)) * 100))}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="ml-2 text-xs text-text-muted">
            {t('recharge.customRange', {
              min: customAmountMin.toLocaleString(),
              max: customAmountMax.toLocaleString(),
            })}
          </span>
        )}
      </button>
    </div>
  )
}
