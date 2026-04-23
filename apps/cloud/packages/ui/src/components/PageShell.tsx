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
}: PageShellProps) {
  return (
    <div
      className={cn('mx-auto max-w-[1440px] p-6 md:px-8', narrow && 'max-w-[1280px]', className)}
    >
      <section className="glass-panel p-6">
        {/* Title row */}
        <div
          className={cn(
            'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
            (description || headerContent) && 'mb-4',
          )}
        >
          <h1 className="text-[1.875rem] font-extrabold tracking-[-0.03em] text-text-primary md:text-[2.125rem]">
            {title}
          </h1>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        {description && (
          <p className={cn('text-sm leading-7 text-text-muted', headerContent && 'mb-5')}>
            {description}
          </p>
        )}

        {headerContent}
      </section>

      {children && <div className={cn('mt-6', bodyClassName)}>{children}</div>}
    </div>
  )
}
