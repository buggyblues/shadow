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
            'flex h-12 w-full cursor-pointer appearance-none rounded-2xl border border-border-subtle/55 bg-bg-primary/45 px-4 py-0 pr-11 text-sm font-bold text-text-primary outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all placeholder:text-text-muted/35 disabled:cursor-not-allowed disabled:opacity-50',
            'focus:border-primary/70 focus:bg-bg-primary/60 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_4px_rgba(0,198,209,0.12)]',
            error &&
              'border-danger focus:border-danger focus:shadow-[0_0_0_4px_rgba(255,42,85,0.15)]',
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted transition-colors group-focus-within:text-primary">
          <ChevronDown size={16} strokeWidth={3} />
        </div>
      </div>
    )
  },
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
