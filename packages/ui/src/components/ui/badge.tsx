import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border font-black uppercase tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        primary:
          'border-primary/20 bg-primary/10 text-primary shadow-[0_0_10px_rgba(0,209,255,0.1)]',
        success:
          'border-success/20 bg-success/10 text-success shadow-[0_0_10px_rgba(87,242,135,0.1)]',
        warning: 'border-warning/20 bg-warning/10 text-warning',
        danger: 'border-danger/20 bg-danger/10 text-danger',
        info: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
        neutral: 'border-border-subtle bg-bg-tertiary/50 text-text-muted',
      },
      size: {
        xs: 'px-1.5 py-0.5 text-[9px]',
        sm: 'px-2.5 py-0.5 text-[10px]',
        md: 'px-3 py-1 text-xs',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'sm',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge, badgeVariants }
