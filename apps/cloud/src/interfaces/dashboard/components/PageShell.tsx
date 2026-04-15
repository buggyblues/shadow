import type { ReactNode } from 'react'
import { Breadcrumb, type BreadcrumbItem } from '@/components/Breadcrumb'
import { cn } from '@/lib/utils'

interface PageShellProps {
  /** Breadcrumb trail — last item is the current page */
  breadcrumb: BreadcrumbItem[]
  title: ReactNode
  description?: ReactNode
  /** Buttons / actions placed in the top-right of the header */
  actions?: ReactNode
  /** Content inside the header glass-panel (filters, tabs, banners, etc.) */
  headerContent?: ReactNode
  /** Main body content below the header panel */
  children: ReactNode
  /** Extra classes on the outer shell */
  className?: string
  /** Narrow variant (max-width 1280px instead of 1440px) */
  narrow?: boolean
  /** gap between header and body sections, default space-y-6 */
  bodyClassName?: string
}

/**
 * PageShell — the canonical one-size-fits-all page layout.
 *
 * Structure:
 *   dashboard-page-shell
 *     Breadcrumb
 *     glass-panel p-6            ← header panel
 *       title row (title + actions)
 *       description
 *       [headerContent]           ← optional: tabs, filters, banners
 *     [children]                  ← optional body sections
 */
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
      className={cn('dashboard-page-shell', narrow && 'dashboard-page-shell--narrow', className)}
    >
      <Breadcrumb items={breadcrumb} className="mb-4" />

      <section className="glass-panel p-6">
        {/* Title row */}
        <div
          className={cn(
            'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
            (description || headerContent) && 'mb-4',
          )}
        >
          <h1 className="dashboard-page-title">{title}</h1>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        {description && (
          <p className={cn('dashboard-page-description', headerContent && 'mb-5')}>{description}</p>
        )}

        {headerContent}
      </section>

      {children && <div className={cn('mt-6', bodyClassName)}>{children}</div>}
    </div>
  )
}
