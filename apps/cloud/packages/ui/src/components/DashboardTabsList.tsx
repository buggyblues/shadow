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
    <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className="h-auto gap-2 px-4 py-2.5 text-xs font-bold normal-case tracking-normal"
        >
          {tab.icon && (
            <span className="inline-flex items-center justify-center text-text-muted">
              {tab.icon}
            </span>
          )}
          <span>{tab.label}</span>
          {typeof tab.count === 'number' && (
            <span className="rounded-full bg-bg-tertiary/70 px-2 py-0.5 text-[0.625rem] font-extrabold leading-[1.3] tracking-normal text-text-muted">
              {tab.count}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
