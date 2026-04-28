import { Badge, type BadgeProps, Card } from '@shadowob/ui'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DashboardTaskCardProps {
  id: number | string
  statusLabel: string
  statusVariant: BadgeProps['variant']
  running?: boolean
  timestamp: string
  meta?: ReactNode
  error?: string | null
  actions?: ReactNode
  className?: string
}

export function DashboardTaskCard({
  id,
  statusLabel,
  statusVariant,
  running,
  timestamp,
  meta,
  error,
  actions,
  className,
}: DashboardTaskCardProps) {
  return (
    <Card variant="glass" className={cn('p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">#{id}</span>
          <Badge variant={statusVariant} size="sm">
            {statusLabel}
          </Badge>
          {running ? <Loader2 size={12} className="animate-spin text-primary" /> : null}
        </div>
        <span className="text-xs text-text-muted">{timestamp}</span>
      </div>

      {meta ? (
        <div className="mt-1.5 flex items-center gap-3 text-xs text-text-muted">{meta}</div>
      ) : null}

      {error ? <div className="mt-2 truncate text-xs text-danger">{error}</div> : null}

      {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </Card>
  )
}
