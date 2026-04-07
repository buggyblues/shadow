import type * as React from 'react'
import { cn } from '../../lib/utils'
import { BuddyIcon } from './buddy-icon'

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className = '',
}: {
  title: string
  description?: string
  icon?: React.ElementType
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-24 text-center rounded-[40px] border-dashed border-2 border-border-subtle bg-bg-primary/30 backdrop-blur-md',
        className,
      )}
    >
      <div className="w-24 h-24 rounded-[40px] bg-bg-tertiary flex items-center justify-center mb-8 shadow-inner text-text-muted/20 border border-border-subtle">
        {Icon ? <Icon size={48} strokeWidth={1.5} /> : <BuddyIcon size={48} strokeWidth={1.5} />}
      </div>
      <h3 className="text-2xl font-black text-text-primary uppercase tracking-tight mb-3">
        {title}
      </h3>
      {description && (
        <p className="text-base font-bold text-text-muted max-w-sm mx-auto italic mb-10 opacity-60 leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
