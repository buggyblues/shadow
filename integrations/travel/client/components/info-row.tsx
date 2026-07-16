import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface InfoRowProps {
  action?: ReactNode
  className?: string
  icon?: ReactNode
  label: ReactNode
  value: ReactNode
}

export function InfoRow({ action, className, icon, label, value }: InfoRowProps) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-2 text-[12px]',
        className,
      )}
    >
      {icon ? <span className="text-muted">{icon}</span> : <span />}
      <span className="min-w-0 truncate text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-bold text-ink">{value}</span>
      {action ? <span className="col-span-3">{action}</span> : null}
    </div>
  )
}

interface DetailListProps {
  children: ReactNode
  className?: string
}

export function DetailList({ children, className }: DetailListProps) {
  return <dl className={cn('grid divide-y divide-line text-[12px]', className)}>{children}</dl>
}
