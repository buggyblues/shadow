import { Card } from '@shadowob/ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: { value: string; positive: boolean }
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'purple'
  className?: string
  onClick?: () => void
}

const colorMap = {
  default: { icon: 'text-text-muted', value: 'text-text-primary' },
  green: { icon: 'text-success', value: 'text-success' },
  yellow: { icon: 'text-warning', value: 'text-warning' },
  red: { icon: 'text-danger', value: 'text-danger' },
  blue: { icon: 'text-primary', value: 'text-primary' },
  purple: { icon: 'text-accent', value: 'text-accent' },
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  color = 'default',
  className,
  onClick,
}: StatCardProps) {
  const colors = colorMap[color]

  return (
    <Card
      variant="stat"
      hoverable={Boolean(onClick)}
      className={cn(
        'min-w-0 p-4 transition-all',
        onClick && 'cursor-pointer hover:-translate-y-0.5',
        className,
      )}
      onClick={onClick}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <span className={cn('inline-flex items-center justify-center', colors.icon)}>{icon}</span>
          <span className="min-w-0 break-words text-text-muted">{label}</span>
        </div>
        {trend && (
          <span
            className={cn(
              'shrink-0 rounded-full border border-border-subtle px-1.5 py-0.5 text-xs',
              trend.positive
                ? 'text-success bg-success/10 border-success/20'
                : 'text-danger bg-danger/10 border-danger/20',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      <p
        className={cn(
          'break-words text-[clamp(1.25rem,2vw,1.75rem)] font-black leading-tight tracking-tight',
          colors.value,
        )}
      >
        {value}
      </p>
    </Card>
  )
}
