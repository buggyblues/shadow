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
  default: { icon: 'text-text-muted', value: 'text-text-primary', chip: 'bg-bg-tertiary/70' },
  green: { icon: 'text-success', value: 'text-success', chip: 'bg-success/12' },
  yellow: { icon: 'text-warning', value: 'text-warning', chip: 'bg-warning/12' },
  red: { icon: 'text-danger', value: 'text-danger', chip: 'bg-danger/12' },
  blue: { icon: 'text-primary', value: 'text-primary', chip: 'bg-primary/12' },
  purple: { icon: 'text-accent', value: 'text-accent', chip: 'bg-accent/12' },
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
        'p-4 transition-all',
        onClick && 'cursor-pointer hover:-translate-y-0.5',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-lg border border-border-subtle',
              colors.chip,
              colors.icon,
            )}
          >
            {icon}
          </span>
          <span className="text-text-muted">{label}</span>
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full border border-border-subtle',
              trend.positive
                ? 'text-success bg-success/10 border-success/20'
                : 'text-danger bg-danger/10 border-danger/20',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      <p className={cn('text-2xl font-black tracking-tight', colors.value)}>{value}</p>
    </Card>
  )
}
