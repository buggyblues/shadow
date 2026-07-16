import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import type { IconComponent } from './icons.js'

interface MetricCardProps {
  detail?: ReactNode
  icon?: IconComponent
  label: ReactNode
  tone?: string
  value: ReactNode
  className?: string
}

export function MetricCard({
  className,
  detail,
  icon,
  label,
  tone = 'bg-white text-olive',
  value,
}: MetricCardProps) {
  const Icon = icon

  return (
    <div
      className={cn(
        'min-w-0 rounded-[14px] bg-paper/70 px-3 py-2 text-[11px] text-muted',
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0">
          <strong className="block truncate font-extrabold text-[17px] leading-6 text-ink">
            {value}
          </strong>
          <span className="block truncate leading-4">{label}</span>
          {detail ? <span className="mt-0.5 block truncate leading-4">{detail}</span> : null}
        </span>
        {Icon ? (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tone)}>
            <Icon size={16} />
          </span>
        ) : null}
      </div>
    </div>
  )
}
