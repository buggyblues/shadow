import { GlassPanel } from '@shadowob/ui'
import type { ReactNode } from 'react'
import { Breadcrumb, type BreadcrumbItem } from '@/components/Breadcrumb'
import { cn } from '@/lib/utils'

interface PageShellProps {
  breadcrumb: BreadcrumbItem[]
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  headerContent?: ReactNode
  children: ReactNode
  className?: string
  narrow?: boolean
  bodyClassName?: string
  breadcrumbPosition?: 'outside' | 'inside'
}

export function PageShell({
  breadcrumb,
  title,
  description,
  actions,
  headerContent,
  children,
  className,
  narrow,
  bodyClassName = 'space-y-6',
  breadcrumbPosition = 'inside',
}: PageShellProps) {
  const hasTitleRow = Boolean(title) || Boolean(actions)
  const renderBreadcrumbInHeader = breadcrumb.length > 0 && breadcrumbPosition === 'inside'

  return (
    <div
      className={cn(
        'mx-auto max-w-[1440px] px-4 pt-0 pb-4 md:px-6 md:pb-5',
        narrow && 'max-w-[1280px]',
        className,
      )}
    >
      {breadcrumb.length > 0 && breadcrumbPosition === 'outside' ? (
        <Breadcrumb items={breadcrumb} className="mb-4" />
      ) : null}

      <GlassPanel as="section" className="p-6">
        {renderBreadcrumbInHeader ? <Breadcrumb items={breadcrumb} className="mb-3" /> : null}
        {/* Title row */}
        {hasTitleRow ? (
          <div
            className={cn(
              'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
              (description || headerContent) && 'mb-3 md:mb-4',
            )}
          >
            <h1 className="text-[1.875rem] font-extrabold tracking-[-0.03em] text-text-primary md:text-[2.125rem]">
              {title}
            </h1>
            {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        ) : null}

        {description && (
          <p className={cn('text-sm leading-6 text-text-muted', headerContent && 'mb-4')}>
            {description}
          </p>
        )}

        {headerContent}
      </GlassPanel>

      {children && <div className={cn('mt-4 md:mt-5', bodyClassName)}>{children}</div>}
    </div>
  )
}
