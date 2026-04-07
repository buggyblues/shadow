import { ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative group w-full">
        <select
          className={cn(
            'flex h-11 w-full bg-bg-tertiary/50 border border-border-subtle text-text-primary rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all appearance-none cursor-pointer placeholder:text-text-muted/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-inner pr-10',
            'focus:ring-4 focus:ring-primary/10 focus:bg-bg-primary focus:border-primary/30',
            error && 'border-danger focus:ring-danger/10 focus:border-danger/30',
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
          <ChevronDown size={16} strokeWidth={3} />
        </div>
      </div>
    )
  },
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
