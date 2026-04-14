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
  default: { icon: 'text-gray-400', value: 'text-white' },
  green: { icon: 'text-green-400', value: 'text-green-400' },
  yellow: { icon: 'text-yellow-400', value: 'text-yellow-400' },
  red: { icon: 'text-red-400', value: 'text-red-400' },
  blue: { icon: 'text-blue-400', value: 'text-blue-400' },
  purple: { icon: 'text-purple-400', value: 'text-purple-400' },
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
    <div
      className={cn(
        'rounded-3xl p-4 transition-all duration-200',
        onClick && 'cursor-pointer hover:-translate-y-0.5',
        className,
      )}
      style={{
        background: 'var(--nf-bg-glass-2)',
        border: '1px solid var(--nf-border)',
        boxShadow: 'var(--nf-shadow-soft)',
      }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={cn('flex items-center gap-2 text-xs', colors.icon)}>
          {icon}
          <span style={{ color: 'var(--nf-text-muted)' }}>{label}</span>
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              trend.positive ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/30',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      <p className={cn('text-2xl font-black tracking-tight', colors.value)}>{value}</p>
    </div>
  )
}
