import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as React from 'react'
import { cn } from '../../lib/utils'

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    variant?: 'primary' | 'success' | 'accent' | 'danger'
    showLabel?: boolean
  }
>(({ className, value, variant = 'primary', showLabel, ...props }, ref) => {
  const variants = {
    primary: 'bg-primary shadow-[0_0_15px_rgba(0,209,255,0.5)]',
    success: 'bg-success shadow-[0_0_15px_rgba(87,242,135,0.5)]',
    accent: 'bg-accent shadow-[0_0_15px_rgba(250,176,5,0.5)]',
    danger: 'bg-danger shadow-[0_0_15px_rgba(240,56,71,0.5)]',
  }

  return (
    <div className="w-full space-y-2">
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          'relative h-3 w-full overflow-hidden rounded-full bg-bg-tertiary shadow-inner border border-border-subtle',
          className,
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            'h-full w-full flex-1 transition-all duration-1000 ease-out rounded-full',
            variants[variant],
          )}
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Root>
      {showLabel && (
        <div className="flex justify-end">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-muted opacity-60">
            {Math.round(value || 0)}%
          </span>
        </div>
      )}
    </div>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

const ProgressBar = Progress

export { Progress, ProgressBar }
