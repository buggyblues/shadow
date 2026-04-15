import {
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumb as UIBreadcrumb,
  BreadcrumbItem as UIBreadcrumbItem,
} from '@shadowob/ui'
import { Link } from '@tanstack/react-router'
import { Home } from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const { t } = useTranslation()

  return (
    <UIBreadcrumb className={cn('pb-2', className)} aria-label={t('common.breadcrumb')}>
      <BreadcrumbList className="gap-1 text-sm">
        <UIBreadcrumbItem>
          <BreadcrumbLink
            asChild
            className="flex items-center p-0.5 text-text-muted hover:text-text-primary"
          >
            <Link to="/" title={t('nav.agentStore')}>
              <Home size={14} />
            </Link>
          </BreadcrumbLink>
        </UIBreadcrumbItem>

        {items.map((item, i) => (
          <Fragment key={`group-${item.label}-${i}`}>
            <BreadcrumbSeparator className="opacity-40" />
            <UIBreadcrumbItem>
              {item.to ? (
                <BreadcrumbLink
                  asChild
                  className="font-bold tracking-[0.08em] text-text-secondary hover:text-text-primary"
                >
                  <Link to={item.to}>{item.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="tracking-[0.08em]">{item.label}</BreadcrumbPage>
              )}
            </UIBreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </UIBreadcrumb>
  )
}
