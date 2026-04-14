import { Package } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center rounded-3xl border',
        className,
      )}
      style={{
        background: 'var(--nf-bg-glass-2)',
        borderColor: 'var(--nf-border)',
        boxShadow: 'var(--nf-shadow-soft)',
      }}
    >
      <div className="mb-4" style={{ color: 'var(--nf-text-muted)' }}>
        {icon ?? <Package size={40} />}
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--nf-text-high)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-md mb-4" style={{ color: 'var(--nf-text-mid)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
