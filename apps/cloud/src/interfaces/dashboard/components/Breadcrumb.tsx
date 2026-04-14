import { Link } from '@tanstack/react-router'
import { ChevronRight, Home } from 'lucide-react'
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
    <nav
      className={cn('flex items-center gap-1 text-sm', className)}
      aria-label={t('common.breadcrumb')}
    >
      <Link
        to="/"
        className="text-gray-500 hover:text-white transition-colors p-0.5"
        title={t('nav.agentStore')}
      >
        <Home size={14} />
      </Link>
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          <ChevronRight size={12} className="text-gray-600" />
          {item.to ? (
            <Link to={item.to} className="text-gray-400 hover:text-white transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-200">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
