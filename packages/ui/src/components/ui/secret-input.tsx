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
              'flex w-full bg-white dark:bg-[rgba(0,0,0,0.3)] border-2 border-[#F1F5F9] dark:border-[rgba(255,255,255,0.1)] text-text-primary rounded-[20px] px-6 py-4 pr-14 text-base font-bold outline-none transition-all placeholder:text-text-muted/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06)] dark:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.25)]',
              'focus:border-primary-strong dark:focus:border-primary focus:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04),0_0_0_4px_rgba(0,198,209,0.12)] dark:focus:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.15),0_0_0_4px_rgba(0,243,255,0.1)]',
              error &&
                'border-danger focus:shadow-[0_0_0_5px_rgba(255,42,85,0.15)] focus:border-danger',
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
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-[16px] border-2 border-[#F1F5F9] dark:border-[rgba(255,255,255,0.1)] bg-white/70 dark:bg-[rgba(0,0,0,0.2)] text-text-muted transition-colors hover:bg-bg-modifier-hover hover:text-text-primary"
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
