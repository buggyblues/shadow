import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../../lib/utils'

const alertVariants = cva(
  'relative w-full rounded-[24px] border p-5 [&>svg~div]:pl-9 [&>svg]:absolute [&>svg]:left-5 [&>svg]:top-5 [&>svg]:text-text-primary shadow-sm backdrop-blur-md',
  {
    variants: {
      variant: {
        default: 'bg-bg-secondary/80 border-border-subtle text-text-primary',
        destructive:
          'border-danger/30 bg-danger/5 text-danger [&>svg]:text-danger shadow-[0_0_15px_rgba(233,69,96,0.1)]',
        success:
          'border-success/30 bg-success/5 text-success [&>svg]:text-success shadow-[0_0_15px_rgba(87,242,135,0.1)]',
        info: 'border-primary/30 bg-primary/5 text-primary [&>svg]:text-primary shadow-[0_0_15px_rgba(0,209,255,0.1)]',
        warning:
          'border-warning/30 bg-warning/5 text-warning [&>svg]:text-warning shadow-[0_0_15px_rgba(250,176,5,0.1)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
))
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-black leading-none uppercase tracking-tight', className)}
      {...props}
    />
  ),
)
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm font-bold opacity-80 italic [&_p]:leading-relaxed', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertDescription, AlertTitle }
