import { Badge, Card } from '@shadowob/ui'
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
      <p className="text-sm text-text-muted font-black uppercase tracking-widest">
        {t('recharge.selectTier')}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {TIERS.map((tier) => (
          <Card
            key={tier.key}
            variant="glass"
            active={selectedTier === tier.key}
            hoverable
            className="!rounded-[40px] relative cursor-pointer"
            onClick={() => setTier(tier.key)}
          >
            <div className="flex flex-col items-center gap-1 p-4">
              {tier.badge && (
                <div className="absolute -top-2 -right-2">
                  <Badge variant="warning" size="xs">
                    {tier.badge}
                  </Badge>
                </div>
              )}
              <span className="text-lg font-black text-text-primary">
                {tier.coins.toLocaleString()}
              </span>
              <span className="text-xs text-text-muted font-bold">{t(tier.labelKey)}</span>
              <span className="text-sm font-black text-primary">{formatUsd(tier.usdCents)}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Custom amount */}
      <Card
        variant="glass"
        active={selectedTier === 'custom'}
        hoverable
        className="!rounded-[40px] cursor-pointer"
        onClick={() => setTier('custom')}
      >
        <div className="flex items-center gap-3 p-3">
          <span className="text-sm font-black text-text-primary">{t('recharge.custom')}</span>
          {selectedTier === 'custom' && (
            <input
              type="number"
              min={100}
              step={100}
              value={customAmount || ''}
              onChange={(e) =>
                setCustomAmount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
              }
              onClick={(e) => e.stopPropagation()}
              placeholder={t('recharge.customPlaceholder')}
              className="flex-1 bg-bg-tertiary border-2 border-border-subtle rounded-2xl px-4 py-2 text-sm text-text-primary font-bold placeholder-text-muted/30 outline-none focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)] transition-all"
            />
          )}
          {selectedTier === 'custom' && customAmount >= 100 && (
            <span className="text-sm font-black text-primary whitespace-nowrap">
              {formatUsd(customAmount)}
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}
