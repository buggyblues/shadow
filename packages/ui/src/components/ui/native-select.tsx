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
            'flex w-full appearance-none cursor-pointer bg-white dark:bg-[rgba(0,0,0,0.3)] border-2 border-[#F1F5F9] dark:border-[rgba(255,255,255,0.1)] text-text-primary rounded-[20px] px-6 py-4 pr-12 text-base font-bold outline-none transition-all placeholder:text-text-muted/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06)] dark:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.25)]',
            'focus:border-primary-strong dark:focus:border-primary focus:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04),0_0_0_4px_rgba(0,198,209,0.12)] dark:focus:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.15),0_0_0_4px_rgba(0,243,255,0.1)]',
            error &&
              'border-danger focus:shadow-[0_0_0_5px_rgba(255,42,85,0.15)] focus:border-danger',
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
          <ChevronDown size={16} strokeWidth={3} />
        </div>
      </div>
    )
  },
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
