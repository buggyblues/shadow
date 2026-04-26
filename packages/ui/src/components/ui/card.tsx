import * as React from 'react'
import { cn } from '../../lib/utils'

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?:
      | 'default'
      | 'glass'
      | 'surface'
      | 'gradient'
      | 'danger'
      | 'glassPanel'
      | 'glassCard'
      | 'stat'
    hoverable?: boolean
    active?: boolean
  }
>(({ className, variant = 'default', hoverable = false, active = false, ...props }, ref) => {
  const variants = {
    default: 'rounded-[40px] bg-bg-secondary border-border-subtle shadow-sm',
    surface: 'rounded-3xl bg-bg-primary border-border-subtle shadow-md',
    glass:
      'rounded-[32px] bg-[rgba(255,255,255,0.75)] dark:bg-[rgba(255,255,255,0.03)] backdrop-blur-[32px] border-[var(--glass-line)] dark:border-[var(--glass-line)] dark:border-t-[var(--glass-line-strong)] shadow-[0_15px_45px_rgba(0,0,0,0.04),inset_0_2px_12px_rgba(255,255,255,0.8)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]',
    gradient:
      'rounded-3xl bg-gradient-to-br from-primary/10 via-bg-secondary to-bg-secondary border-primary/20 shadow-lg',
    danger: 'rounded-3xl bg-danger/5 border-danger/20 shadow-sm',
    glassPanel:
      'rounded-3xl bg-[var(--glass-bg)] border-[var(--glass-line)] backdrop-blur-[48px] shadow-[inset_0_1px_0_0_var(--glass-line-soft),0_12px_48px_-12px_rgba(0,0,0,0.5)]',
    glassCard:
      'rounded-[32px] bg-[var(--glass-bg)] border-[var(--glass-line)] border-t-[var(--glass-line-strong)] backdrop-blur-[48px] shadow-[var(--shadow-soft)]',
    stat: 'rounded-2xl bg-[var(--glass-bg)] border-[var(--glass-line)] backdrop-blur-[24px] shadow-[var(--shadow-soft)] hover:border-primary/20',
  }

  return (
    <div
      ref={ref}
      className={cn(
        'border transition-all duration-500 overflow-hidden',
        variants[variant],
        active && 'border-primary/60 bg-bg-tertiary shadow-2xl scale-[1.02]',
        hoverable &&
          'hover:border-primary/40 hover:bg-bg-tertiary hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98]',
        className,
      )}
      {...props}
    />
  )
})
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    subtitle?: string
    action?: React.ReactNode
    icon?: React.ElementType
  }
>(({ className, subtitle, action, icon: Icon, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col space-y-1.5 p-6 border-b border-border-subtle bg-bg-secondary/30',
      className,
    )}
    {...props}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Icon size={20} strokeWidth={3} />
          </div>
        )}
        <div className="flex flex-col space-y-1.5">
          {children}
          {subtitle && (
            <p className="text-sm font-bold italic text-text-muted opacity-60 m-0">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  </div>
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-lg font-black leading-tight tracking-tight text-text-primary m-0',
        className,
      )}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm font-bold italic text-text-muted opacity-60 m-0', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
