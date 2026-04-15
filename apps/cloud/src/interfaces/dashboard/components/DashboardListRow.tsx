import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DashboardListRowProps {
  leading?: ReactNode
  main: ReactNode
  sub?: ReactNode
  trailing?: ReactNode
  className?: string
}

export function DashboardListRow({
  leading,
  main,
  sub,
  trailing,
  className,
}: DashboardListRowProps) {
  return (
    <div
      className={cn(
        'px-5 py-3 flex items-center justify-between gap-3 transition-colors hover:bg-bg-modifier-hover/70',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <div className="min-w-0">{main}</div>
          {sub ? <div className="mt-0.5 text-xs text-text-muted">{sub}</div> : null}
        </div>
      </div>

      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}
