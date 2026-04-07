import * as React from 'react'
import { cn } from '../../lib/utils'

const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center w-full gap-2', className)} {...props} />
  ),
)
InputGroup.displayName = 'InputGroup'

const InputGroupText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'flex items-center px-3 text-xs font-black uppercase tracking-widest text-text-muted',
        className,
      )}
      {...props}
    />
  ),
)
InputGroupText.displayName = 'InputGroupText'

export { InputGroup, InputGroupText }
