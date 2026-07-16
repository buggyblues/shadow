import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import { Money } from './money.js'

interface MoneySummaryProps {
  amount: number
  className?: string
  currency: string
  detail?: ReactNode
  label: ReactNode
}

export function MoneySummary({ amount, className, currency, detail, label }: MoneySummaryProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 truncate font-extrabold text-[15px] text-ink">
        <Money amount={amount} currency={currency} />
      </div>
      {detail ? <div className="mt-0.5 truncate text-[11px] text-muted">{detail}</div> : null}
    </div>
  )
}
