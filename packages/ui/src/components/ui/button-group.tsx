import * as React from 'react'
import { cn } from '../../lib/utils'

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass'
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-1 p-1.5 border border-border-subtle rounded-[24px] shadow-2xl',
          variant === 'default' ? 'bg-bg-secondary/90' : 'bg-bg-tertiary/50 backdrop-blur-xl',
          className,
        )}
        {...props}
      />
    )
  },
)
ButtonGroup.displayName = 'ButtonGroup'

export { ButtonGroup }
