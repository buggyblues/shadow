import { Search as SearchIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SearchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (val: string) => void
}

const Search = React.forwardRef<HTMLInputElement, SearchProps>(
  ({ className, onChange, ...props }, ref) => {
    return (
      <div className="relative group w-full">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
          <SearchIcon size={18} strokeWidth={3} />
        </div>
        <input
          type="text"
          className={cn(
            'flex h-11 w-full bg-bg-tertiary/50 border border-border-subtle text-text-primary rounded-2xl pl-12 pr-4 py-3 text-sm font-bold outline-none transition-all placeholder:text-text-muted/30 focus:ring-4 focus:ring-primary/10 focus:bg-bg-primary focus:border-primary/30 shadow-inner',
            className,
          )}
          ref={ref}
          onChange={(e) => onChange?.(e.target.value)}
          {...props}
        />
      </div>
    )
  },
)
Search.displayName = 'Search'

export { Search }
