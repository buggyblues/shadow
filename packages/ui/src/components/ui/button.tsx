import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-black uppercase tracking-widest transition-all duration-500 disabled:pointer-events-none disabled:opacity-50 active:scale-95 shrink-0 select-none backdrop-blur-xl',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-br from-[#00F3FF] to-[#00c6d1] text-[#050508] border-none shadow-[0_10px_25px_rgba(0,198,209,0.35),inset_0_2px_4px_rgba(255,255,255,0.7)] dark:shadow-[0_10px_25px_rgba(0,243,255,0.4),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:shadow-[0_12px_32px_rgba(0,198,209,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] dark:hover:shadow-[0_12px_32px_rgba(0,243,255,0.6),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:-translate-y-1',
        secondary:
          'bg-gradient-to-br from-[#F8E71C] to-[#ffb300] text-[#050508] border-none shadow-[0_10px_25px_rgba(248,231,28,0.35),inset_0_2px_4px_rgba(255,255,255,0.7)] dark:shadow-[0_10px_25px_rgba(248,231,28,0.3),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:shadow-[0_12px_32px_rgba(248,231,28,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] dark:hover:shadow-[0_12px_32px_rgba(248,231,28,0.5),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:-translate-y-1',
        accent:
          'bg-gradient-to-br from-[#00F3FF] to-[#00a3b0] text-[#050508] border-none shadow-[0_10px_25px_rgba(0,198,209,0.4),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:shadow-[0_12px_32px_rgba(0,243,255,0.6),inset_0_2px_4px_rgba(255,255,255,0.5)] hover:-translate-y-1',
        danger:
          'bg-gradient-to-br from-[#FF2A55] to-[#E11D48] text-white border-none shadow-[0_10px_25px_rgba(255,42,85,0.4),inset_0_2px_4px_rgba(255,255,255,0.3)] hover:shadow-[0_12px_32px_rgba(255,42,85,0.6),inset_0_2px_4px_rgba(255,255,255,0.3)] hover:-translate-y-1',
        glass:
          'bg-white/80 dark:bg-white/5 text-text-primary border-2 border-[#F1F5F9] dark:border-white/10 hover:bg-white dark:hover:bg-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.04),inset_0_2px_4px_rgba(255,255,255,0.7)] dark:shadow-[0_10px_25px_rgba(0,0,0,0.2),inset_0_2px_4px_rgba(255,255,255,0.3)] hover:-translate-y-1',
        ghost:
          'bg-transparent text-text-muted hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent shadow-none',
        outline:
          'bg-transparent text-primary border border-primary/30 hover:border-primary hover:bg-primary/5 shadow-none',
      },
      size: {
        xs: 'h-7 px-3 text-[10px] rounded-full gap-1',
        sm: 'h-9 px-4 text-xs rounded-full gap-1.5',
        md: 'h-11 px-6 text-sm rounded-full gap-2',
        lg: 'h-14 px-10 text-base rounded-full gap-2.5',
        xl: 'h-16 px-12 text-lg rounded-full gap-3',
        icon: 'h-11 w-11 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  icon?: React.ElementType
  iconRight?: React.ElementType
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading,
      icon: Icon,
      iconRight: IconRight,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), 'bouncy')}
        ref={ref}
        disabled={props.disabled || loading}
        {...props}
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        ) : Icon ? (
          <Icon size={18} className="shrink-0" strokeWidth={2.5} />
        ) : null}
        <Slottable>{children}</Slottable>
        {IconRight && <IconRight size={18} className="shrink-0 ml-1" strokeWidth={2.5} />}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
