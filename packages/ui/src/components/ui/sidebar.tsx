import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { cn } from '../../lib/utils'

const Sidebar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex h-full w-[260px] flex-col bg-bg-secondary/30 border-r border-border-subtle overflow-hidden',
        className,
      )}
      {...props}
    />
  ),
)
Sidebar.displayName = 'Sidebar'

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6 border-b border-border-subtle bg-bg-secondary/30', className)}
      {...props}
    />
  ),
)
SidebarHeader.displayName = 'SidebarHeader'

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex-1 overflow-y-auto custom-scrollbar px-4 py-6 space-y-8', className)}
      {...props}
    />
  ),
)
SidebarContent.displayName = 'SidebarContent'

const SidebarItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean
    icon?: React.ElementType
    variant?: 'default' | 'dashboard'
    asChild?: boolean
  }
>(
  (
    { className, active, icon: Icon, variant = 'default', asChild = false, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'

    const variantClasses = {
      default: {
        base: 'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[14px] font-black transition-all duration-300 group select-none outline-none',
        active: 'bg-primary text-bg-deep shadow-xl shadow-primary/20 scale-[1.02]',
        inactive: 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
        icon: active ? 'text-bg-deep' : 'text-text-muted group-hover:text-primary',
        pulse: 'bg-bg-deep',
      },
      dashboard: {
        base: 'w-full flex items-center gap-3 rounded-[20px] border px-3 py-2.5 text-sm font-semibold normal-case tracking-normal transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        active:
          'border-primary/20 bg-primary/10 text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_28px_rgba(0,198,209,0.14)]',
        inactive:
          'border-transparent bg-transparent text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary',
        icon: active ? 'text-primary' : 'text-text-muted',
        pulse: 'bg-primary',
      },
    } as const

    const styles = variantClasses[variant]

    return (
      <Comp
        ref={ref}
        className={cn(styles.base, active ? styles.active : styles.inactive, className)}
        {...(!asChild ? { type: 'button' } : {})}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {Icon && (
              <Icon
                size={variant === 'dashboard' ? 16 : 20}
                className={cn('shrink-0 transition-colors', styles.icon)}
                strokeWidth={active ? 2.75 : 2.25}
              />
            )}
            <span className="truncate flex-1 text-left">{children}</span>
            {active && variant === 'default' && (
              <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', styles.pulse)} />
            )}
          </>
        )}
      </Comp>
    )
  },
)
SidebarItem.displayName = 'SidebarItem'

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-4 bg-bg-deep/20 border-t border-border-subtle mt-auto', className)}
      {...props}
    />
  ),
)
SidebarFooter.displayName = 'SidebarFooter'

const SidebarSectionLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'px-2 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted/50',
        className,
      )}
      {...props}
    />
  ),
)
SidebarSectionLabel.displayName = 'SidebarSectionLabel'

export { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarItem, SidebarSectionLabel }
