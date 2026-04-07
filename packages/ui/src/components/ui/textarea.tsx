import * as React from 'react'
import { cn } from '../../lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full bg-bg-tertiary/50 border border-border-subtle text-text-primary rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all placeholder:text-text-muted/30 disabled:cursor-not-allowed disabled:opacity-50 shadow-inner resize-none',
          'focus:ring-4 focus:ring-primary/10 focus:bg-bg-primary focus:border-primary/30',
          error && 'border-danger focus:ring-danger/10 focus:border-danger/30',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
