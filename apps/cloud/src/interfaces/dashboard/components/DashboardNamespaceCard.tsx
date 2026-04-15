import { Card } from '@shadowob/ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DashboardNamespaceCardProps {
  headerLeft: ReactNode
  headerRight?: ReactNode
  rows: ReactNode
  footer?: ReactNode
  className?: string
}

export function DashboardNamespaceCard({
  headerLeft,
  headerRight,
  rows,
  footer,
  className,
}: DashboardNamespaceCardProps) {
  return (
    <Card variant="glass" className={cn(className)}>
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">{headerLeft}</div>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>

      <div className="divide-y divide-border-subtle/70">{rows}</div>

      {footer ? (
        <div className="flex items-center justify-between border-t border-border-subtle bg-bg-secondary/50 px-5 py-2.5">
          {footer}
        </div>
      ) : null}
    </Card>
  )
}
