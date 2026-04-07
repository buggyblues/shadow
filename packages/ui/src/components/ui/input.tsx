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
              'flex h-11 w-full bg-bg-tertiary/50 border border-border-subtle text-text-primary rounded-[20px] px-4 py-3 text-sm font-bold outline-none transition-all placeholder:text-text-muted/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-inner',
              'focus:ring-4 focus:ring-primary/10 focus:bg-bg-primary focus:border-primary',
              Icon && 'pl-12',
              error && 'border-danger focus:ring-danger/10 focus:border-danger/30',
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
