import type * as React from 'react'
import { cn } from '../../lib/utils'

export function PageContainer({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-8', className)}>
      {children}
    </div>
  )
}
