import { Search as SearchIcon, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SearchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (val: string) => void
  onClear?: () => void
  clearLabel?: string
  variant?: 'default' | 'small'
}

const Search = React.forwardRef<HTMLInputElement, SearchProps>(
  (
    {
      className,
      onChange,
      onClear,
      clearLabel,
      value,
      defaultValue,
      variant = 'default',
      onCompositionStart,
      onCompositionEnd,
      ...props
    },
    ref,
  ) => {
    const [draftValue, setDraftValue] = React.useState(() => String(value ?? defaultValue ?? ''))
    const isComposingRef = React.useRef(false)
    const committedCompositionValueRef = React.useRef<string | null>(null)
    const small = variant === 'small'
    const canClear = !!onClear && draftValue.length > 0

    React.useEffect(() => {
      if (value === undefined || isComposingRef.current) return
      setDraftValue(String(value))
    }, [value])

    return (
      <div className="relative group w-full">
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 flex items-center text-text-muted transition-colors group-focus-within:text-primary',
            small ? 'left-2.5' : 'left-4',
          )}
        >
          <SearchIcon size={small ? 14 : 18} strokeWidth={2.5} />
        </div>
        <input
          className={cn(
            'w-full border border-border-subtle bg-bg-tertiary/50 py-0 font-bold text-text-primary shadow-inner outline-none transition-all placeholder:text-text-muted/30 focus:border-primary/30 focus:bg-bg-primary focus:ring-primary/10',
            small
              ? 'h-8 rounded-xl pl-8 pr-3 text-xs focus:ring-2'
              : 'h-11 rounded-2xl pl-11 pr-4 text-sm focus:ring-4',
            canClear && (small ? 'pr-8' : 'pr-11'),
            className,
          )}
          ref={ref}
          onChange={(event) => {
            const nextValue = event.target.value
            setDraftValue(nextValue)
            if (isComposingRef.current) return
            if (committedCompositionValueRef.current === nextValue) {
              committedCompositionValueRef.current = null
              return
            }
            committedCompositionValueRef.current = null
            onChange?.(nextValue)
          }}
          onCompositionStart={(event) => {
            isComposingRef.current = true
            onCompositionStart?.(event)
          }}
          onCompositionEnd={(event) => {
            isComposingRef.current = false
            const nextValue = event.currentTarget.value
            setDraftValue(nextValue)
            committedCompositionValueRef.current = nextValue
            onChange?.(nextValue)
            onCompositionEnd?.(event)
          }}
          value={draftValue}
          {...props}
          type="text"
        />
        {canClear ? (
          <button
            type="button"
            aria-label={clearLabel}
            title={clearLabel}
            className={cn(
              'absolute inset-y-0 my-auto grid place-items-center rounded-full text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
              small ? 'right-1.5 h-5 w-5' : 'right-3 h-6 w-6',
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              committedCompositionValueRef.current = null
              setDraftValue('')
              onClear?.()
            }}
          >
            <X size={small ? 12 : 13} />
          </button>
        ) : null}
      </div>
    )
  },
)
Search.displayName = 'Search'

export { Search }
