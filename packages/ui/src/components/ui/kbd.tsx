import * as React from 'react'
import { cn } from '../../lib/utils'

const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border-subtle bg-bg-tertiary px-1.5 font-mono text-[10px] font-black uppercase text-text-muted opacity-100 shadow-sm',
        className,
      )}
      {...props}
    />
  ),
)
Kbd.displayName = 'Kbd'

export { Kbd }
