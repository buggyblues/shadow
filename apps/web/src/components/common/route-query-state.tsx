import { Button, cn, EmptyState, Spinner } from '@shadowob/ui'
import { AlertTriangle, FileQuestion, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type RouteQueryStateVariant = 'loading' | 'error' | 'not-found'

interface RouteQueryStateProps {
  variant: RouteQueryStateVariant
  title: string
  description?: string
  className?: string
  action?: ReactNode
  onRetry?: () => void
}

export function RouteQueryState({
  variant,
  title,
  description,
  className,
  action,
  onRetry,
}: RouteQueryStateProps) {
  const { t } = useTranslation()

  if (variant === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex min-h-[280px] flex-1 items-center justify-center bg-bg-primary p-6 text-text-muted',
          className,
        )}
      >
        <div className="inline-flex items-center gap-2 text-sm font-semibold">
          <Spinner size="sm" />
          <span>{title}</span>
        </div>
      </div>
    )
  }

  const resolvedAction =
    action ??
    (onRetry ? (
      <Button type="button" variant="glass" size="sm" icon={RefreshCw} onClick={onRetry}>
        {t('common.retry')}
      </Button>
    ) : null)

  return (
    <div
      role={variant === 'error' ? 'alert' : undefined}
      className={cn(
        'flex min-h-[280px] flex-1 items-center justify-center bg-bg-primary p-6',
        className,
      )}
    >
      <EmptyState
        icon={variant === 'error' ? AlertTriangle : FileQuestion}
        title={title}
        description={description}
        action={resolvedAction}
      />
    </div>
  )
}
