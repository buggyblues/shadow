import type * as React from 'react'
import { cn } from '../../lib/utils'

export function SectionHeader({
  title,
  description,
  icon: Icon,
  className = '',
}: {
  title: string
  description?: string
  icon?: React.ElementType
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-4 mb-8', className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner shrink-0 border border-primary/10">
          <Icon size={24} strokeWidth={3} />
        </div>
      )}
      <div className="min-w-0 flex-1 flex flex-col justify-center text-left">
        <h2 className="text-2xl font-black text-text-primary tracking-tight uppercase leading-none mb-1.5">
          {title}
        </h2>
        {description && (
          <p className="text-sm font-bold text-text-muted leading-relaxed opacity-80 italic m-0">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
