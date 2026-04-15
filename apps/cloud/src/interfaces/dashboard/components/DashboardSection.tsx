import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DashboardSectionProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function DashboardSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: DashboardSectionProps) {
  return (
    <section className={cn('glass-panel p-6', className)}>
      {(title || description || actions) && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title}
            {description}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn('space-y-4', contentClassName)}>{children}</div>
    </section>
  )
}
