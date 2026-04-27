import { Eye, EyeOff } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'label'> {
  error?: boolean
  label?: string
}

const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  ({ className, error, label, id: providedId, style, autoComplete, ...props }, ref) => {
    const generatedId = React.useId()
    const id = providedId || generatedId
    const [revealed, setRevealed] = React.useState(false)

    return (
      <div className="relative group w-full space-y-2">
        {label && (
          <label
            htmlFor={id}
            className="block text-[11px] font-black uppercase text-text-muted tracking-[0.2em] ml-1"
          >
            {label}
          </label>
        )}
        <div className="relative group w-full">
          <input
            id={id}
            type="text"
            className={cn(
              'flex h-12 w-full rounded-2xl border border-border-subtle/55 bg-bg-primary/45 px-4 py-0 pr-12 text-sm font-bold text-text-primary outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all placeholder:text-text-muted/35 disabled:cursor-not-allowed disabled:opacity-50',
              'focus:border-primary/70 focus:bg-bg-primary/60 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_4px_rgba(0,198,209,0.12)]',
              error &&
                'border-danger focus:border-danger focus:shadow-[0_0_0_4px_rgba(255,42,85,0.15)]',
              className,
            )}
            ref={ref}
            autoComplete={autoComplete ?? 'new-password'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            style={
              revealed
                ? style
                : ({
                    ...style,
                    WebkitTextSecurity: 'disc',
                  } as React.CSSProperties)
            }
            {...props}
          />
          <button
            type="button"
            aria-label={revealed ? 'Hide secret value' : 'Show secret value'}
            onClick={() => setRevealed((prev) => !prev)}
            className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-border-subtle/45 bg-bg-secondary/30 text-text-muted transition-colors hover:bg-bg-modifier-hover hover:text-text-primary"
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
    )
  },
)

SecretInput.displayName = 'SecretInput'

export { SecretInput }
