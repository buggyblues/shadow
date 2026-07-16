import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import { Users } from './icons.js'
import { Money } from './money.js'

interface SplitSummaryProps {
  amount: number
  className?: string
  count: number
  currency: string
  label: ReactNode
}

export function SplitSummary({ amount, className, count, currency, label }: SplitSummaryProps) {
  const perPerson = amount / Math.max(1, count)

  return (
    <div
      className={cn(
        'flex min-w-0 items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-[12px]',
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-muted">
        <Users size={15} />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-extrabold text-ink">
        <Money amount={perPerson} currency={currency} />
      </span>
    </div>
  )
}
