import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../../lib/utils'

const toggleVariants = cva(
  'inline-flex items-center justify-center rounded-xl text-sm font-black uppercase tracking-widest ring-offset-background transition-all hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-primary data-[state=on]:text-bg-deep active:scale-95',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-border-subtle bg-transparent hover:bg-bg-tertiary hover:text-text-primary',
      },
      size: {
        default: 'h-10 px-3',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants> & { enabled?: boolean; onChange?: (val: boolean) => void }
>(({ className, variant, size, enabled, onChange, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    pressed={enabled !== undefined ? enabled : props.pressed}
    onPressedChange={onChange || props.onPressedChange}
    {...props}
  />
))

Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants }
