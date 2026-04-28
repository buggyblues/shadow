import * as React from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'label'> {
  error?: boolean
  icon?: React.ElementType
  label?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, icon: Icon, label, id: providedId, ...props }, ref) => {
    const generatedId = React.useId()
    const id = providedId || generatedId

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
          {Icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
              <Icon size={18} strokeWidth={2.5} />
            </div>
          )}
          <input
            id={id}
            type={type}
            className={cn(
              'flex h-12 w-full rounded-2xl border border-border-subtle/55 bg-bg-primary/45 px-4 py-0 text-sm font-bold text-text-primary outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all placeholder:text-text-muted/35 disabled:cursor-not-allowed disabled:opacity-50',
              'focus:border-primary/70 focus:bg-bg-primary/60 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_4px_rgba(0,198,209,0.12)]',
              Icon && 'pl-12',
              error &&
                'border-danger focus:border-danger focus:shadow-[0_0_0_4px_rgba(255,42,85,0.15)]',
              className,
            )}
            ref={ref}
            {...props}
          />
        </div>
      </div>
    )
  },
)
Input.displayName = 'Input'

export { Input }
