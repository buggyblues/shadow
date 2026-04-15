import { EmptyState } from '@shadowob/ui'
import { AlertTriangle, Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface DashboardLoadingStateProps {
  rows?: number
  className?: string
  inline?: boolean
}

export function DashboardLoadingState({
  rows = 2,
  className,
  inline = false,
}: DashboardLoadingStateProps) {
  const { t } = useTranslation()

  if (inline) {
    return (
      <div
        className={cn('flex items-center justify-center py-20 text-sm text-text-muted', className)}
      >
        <Loader2 size={18} className="mr-2 animate-spin" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are static placeholders
          key={idx}
          className="animate-pulse rounded-xl border border-border-subtle bg-bg-secondary/60 p-4"
        >
          <div className="mb-4 h-5 w-32 rounded bg-bg-tertiary" />
          <div className="h-12 rounded bg-bg-tertiary" />
        </div>
      ))}
    </div>
  )
}

interface DashboardErrorStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: LucideIcon
  className?: string
}

export function DashboardErrorState({
  title,
  description,
  action,
  icon = AlertTriangle,
  className,
}: DashboardErrorStateProps) {
  return (
    <div className={cn('rounded-xl border border-danger/30 bg-danger/5 p-4', className)}>
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  )
}
