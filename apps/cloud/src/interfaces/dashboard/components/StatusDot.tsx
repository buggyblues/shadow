import { Indicator } from '@shadowob/ui'
import { cn } from '@/lib/utils'

export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface StatusDotProps {
  status: StatusType
  label?: string
  pulse?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const indicatorStatusMap: Record<StatusType, 'running' | 'idle' | 'error' | 'offline'> = {
  success: 'running',
  warning: 'idle',
  error: 'error',
  info: 'running',
  neutral: 'offline',
}

const labelColors: Record<StatusType, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
  info: 'text-primary',
  neutral: 'text-text-muted',
}

export function StatusDot({ status, label, pulse, size = 'sm', className }: StatusDotProps) {
  const indicatorSize = size === 'sm' ? 'sm' : 'md'

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn(pulse && 'animate-pulse')}>
        <Indicator status={indicatorStatusMap[status]} size={indicatorSize} />
      </span>
      {label && <span className={cn('text-xs font-medium', labelColors[status])}>{label}</span>}
    </span>
  )
}
