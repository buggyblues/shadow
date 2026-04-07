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
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: React.ElementType }
>(({ className, active, icon: Icon, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[14px] font-black transition-all duration-300 group select-none outline-none',
      active
        ? 'bg-primary text-bg-deep shadow-xl shadow-primary/20 scale-[1.02]'
        : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
      className,
    )}
    {...props}
  >
    {Icon && (
      <Icon
        size={20}
        className={cn(
          'shrink-0 transition-colors',
          active ? 'text-bg-deep' : 'text-text-muted group-hover:text-primary',
        )}
        strokeWidth={active ? 3 : 2.5}
      />
    )}
    <span className="truncate flex-1 text-left">{children}</span>
    {active && <div className="w-1.5 h-1.5 rounded-full bg-bg-deep animate-pulse" />}
  </button>
))
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
