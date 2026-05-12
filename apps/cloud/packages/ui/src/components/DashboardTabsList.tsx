import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
  count?: number
}

interface DashboardTabsListProps {
  tabs: TabItem[]
  className?: string
  activeId?: string
  onSelect?: (id: string) => void
}

export function DashboardTabsList({ tabs, className, activeId, onSelect }: DashboardTabsListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex h-auto flex-nowrap items-center justify-start gap-1 rounded-[28px] border border-[var(--glass-line)] bg-white/[0.03] p-1.5 shadow-[inset_0_1px_0_var(--glass-line-soft)] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = activeId === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-state={active ? 'active' : 'inactive'}
            onPointerDown={() => onSelect?.(tab.id)}
            onClick={() => onSelect?.(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect?.(tab.id)
            }}
            className="group inline-flex h-auto items-center justify-center whitespace-nowrap rounded-[20px] border border-transparent gap-2 px-4 py-2.5 text-xs font-bold normal-case tracking-normal text-text-secondary transition-all hover:bg-white/[0.03] hover:text-text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 data-[state=active]:!bg-white/[0.05] data-[state=active]:!text-primary data-[state=active]:!border-[var(--glass-line-strong)] data-[state=active]:shadow-[inset_0_1px_0_var(--glass-line-soft),0_10px_24px_rgba(0,0,0,0.12)]"
          >
            {tab.icon && (
              <span className="inline-flex items-center justify-center text-text-muted transition-colors group-data-[state=active]:text-primary">
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[0.625rem] font-extrabold leading-[1.3] tracking-normal text-text-muted transition-colors group-data-[state=active]:bg-primary/12 group-data-[state=active]:text-primary">
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
