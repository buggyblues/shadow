import { Card } from '@shadowob/ui'
import { EmptyState } from '@shadowob/ui/components/ui/empty-state'
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
  cardVariant?: 'default' | 'glass' | 'glassPanel' | 'surface' | 'gradient' | 'danger'
}

export function DashboardEmptyState({
  icon,
  title,
  description,
  action,
  className,
  contentClassName,
  cardVariant = 'default',
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
