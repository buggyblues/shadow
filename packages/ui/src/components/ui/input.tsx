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
              'flex w-full bg-white dark:bg-[rgba(0,0,0,0.3)] border-2 border-[#F1F5F9] dark:border-[rgba(255,255,255,0.1)] text-text-primary rounded-[20px] px-6 py-4 text-base font-bold outline-none transition-all placeholder:text-text-muted/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-[inset_0_2px_6px_rgba(0,0,0,0.02)] dark:shadow-none',
              'focus:border-primary-strong dark:focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.15)] dark:focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)]',
              Icon && 'pl-12',
              error && 'border-danger focus:shadow-[0_0_0_5px_rgba(255,42,85,0.15)] focus:border-danger',
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
