import type { ReactNode } from 'react'

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function OpenClawSplitLayout({
  sidebar,
  content,
}: {
  sidebar: ReactNode
  content: ReactNode
}) {
  return (
    <div className="h-full min-h-0 grid grid-cols-[320px_minmax(0,1fr)]">
      <aside className="h-full min-h-0 border-r border-bg-tertiary bg-bg-secondary/40 overflow-hidden">
        {sidebar}
      </aside>
      <section className="h-full min-h-0 overflow-hidden">{content}</section>
    </div>
  )
}

export function OpenClawButton({
  children,
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'subtle' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'icon'
}) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' && 'bg-danger text-white hover:bg-danger/90',
        variant === 'subtle' && 'bg-danger/10 text-danger hover:bg-danger/15',
        variant === 'danger' && 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
        variant === 'ghost' && 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'icon' && 'w-9 h-9',
        className,
      )}
    >
      {children}
    </button>
  )
}
