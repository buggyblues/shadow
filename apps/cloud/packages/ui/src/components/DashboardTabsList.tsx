import { TabsList, TabsTrigger } from '@shadowob/ui'
import type { ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
  count?: number
}

interface DashboardTabsListProps {
  tabs: TabItem[]
}

export function DashboardTabsList({ tabs }: DashboardTabsListProps) {
  return (
    <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 border-[var(--glass-line)] bg-white/[0.03] shadow-[inset_0_1px_0_var(--glass-line-soft)] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className="group h-auto gap-2 px-4 py-2.5 text-xs font-bold normal-case tracking-normal text-text-secondary hover:bg-white/[0.03] hover:text-text-primary data-[state=active]:!bg-white/[0.05] data-[state=active]:!text-primary data-[state=active]:!border-[var(--glass-line-strong)] data-[state=active]:shadow-[inset_0_1px_0_var(--glass-line-soft),0_10px_24px_rgba(0,0,0,0.12)]"
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
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
