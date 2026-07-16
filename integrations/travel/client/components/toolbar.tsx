import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface ToolbarProps {
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function Toolbar({ actions, children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between',
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
