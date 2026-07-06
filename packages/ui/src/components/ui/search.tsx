import { Search as SearchIcon, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SearchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (val: string) => void
  onClear?: () => void
  clearLabel?: string
}

const Search = React.forwardRef<HTMLInputElement, SearchProps>(
  ({ className, onChange, onClear, clearLabel, value, ...props }, ref) => {
    const canClear = !!onClear && value != null && String(value).length > 0

    return (
      <div className="relative group w-full">
        <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-text-muted group-focus-within:text-primary transition-colors">
          <SearchIcon size={18} strokeWidth={2.5} />
        </div>
        <input
          type="text"
          className={cn(
            'h-11 w-full bg-bg-tertiary/50 border border-border-subtle text-text-primary rounded-2xl pl-11 pr-4 py-0 text-sm font-bold outline-none transition-all placeholder:text-text-muted/30 focus:ring-4 focus:ring-primary/10 focus:bg-bg-primary focus:border-primary/30 shadow-inner',
            canClear && 'pr-11',
            className,
          )}
          ref={ref}
          onChange={(e) => onChange?.(e.target.value)}
          value={value}
          {...props}
        />
        {canClear ? (
          <button
            type="button"
            aria-label={clearLabel}
            title={clearLabel}
            className="absolute inset-y-0 right-3 my-auto grid h-6 w-6 place-items-center rounded-full text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
          >
            <X size={13} />
          </button>
        ) : null}
      </div>
    )
  },
)
Search.displayName = 'Search'

export { Search }
