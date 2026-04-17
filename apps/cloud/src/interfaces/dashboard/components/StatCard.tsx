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
        'p-4 transition-all',
        onClick && 'cursor-pointer hover:-translate-y-0.5',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('inline-flex items-center justify-center', colors.icon)}>{icon}</span>
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
