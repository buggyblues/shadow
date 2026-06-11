import { Card } from '@shadowob/ui'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DashboardNamespaceCardProps {
  headerLeft: ReactNode
  headerRight?: ReactNode
  rows: ReactNode
  footer?: ReactNode
  className?: string
  onNavigate?: () => void
  navigateLabel?: string
}

export function DashboardNamespaceCard({
  headerLeft,
  headerRight,
  rows,
  footer,
  className,
  onNavigate,
  navigateLabel,
}: DashboardNamespaceCardProps) {
  const isNavigationEnabled = Boolean(onNavigate)

  const shouldIgnoreCardNavigation = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false
    return Boolean(
      target.closest(
        'a,button,input,select,textarea,[role="button"],[data-card-nav-ignore="true"]',
      ),
    )
  }

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onNavigate || shouldIgnoreCardNavigation(event.target)) return
    onNavigate()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onNavigate || shouldIgnoreCardNavigation(event.target)) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onNavigate()
  }

  return (
    <Card
      variant="glassPanel"
      role={isNavigationEnabled ? 'link' : undefined}
      tabIndex={isNavigationEnabled ? 0 : undefined}
      aria-label={navigateLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-xl border border-border-subtle bg-bg-secondary/20',
        isNavigationEnabled &&
          'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-[var(--glass-line)] px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">{headerLeft}</div>
        {headerRight ? (
          <div className="w-full min-w-0 md:w-auto md:shrink-0">{headerRight}</div>
        ) : null}
      </div>

      <div className="divide-y divide-[var(--glass-line-soft)]">{rows}</div>

      {footer ? (
        <div className="flex flex-col gap-2 border-t border-[var(--glass-line)] bg-bg-secondary/35 px-4 py-2.5 md:flex-row md:items-center md:justify-between">
          {footer}
        </div>
      ) : null}
    </Card>
  )
}
