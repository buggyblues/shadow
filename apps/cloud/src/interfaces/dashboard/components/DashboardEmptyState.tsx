import { Card, EmptyState } from '@shadowob/ui'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DashboardEmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  contentClassName?: string
  cardVariant?: 'default' | 'glass' | 'surface' | 'gradient' | 'danger'
}

export function DashboardEmptyState({
  icon,
  title,
  description,
  action,
  className,
  contentClassName,
  cardVariant = 'glass',
}: DashboardEmptyStateProps) {
  return (
    <Card variant={cardVariant} className={cn('p-6', className)}>
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={action}
        className={cn('py-16', contentClassName)}
      />
    </Card>
  )
}
