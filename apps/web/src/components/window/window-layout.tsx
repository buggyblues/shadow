import { cn } from '@shadowob/ui'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOsWindowHeaderTools, useStableHeaderTool } from './window-header-tools'

export function OsWindowLayout({
  children,
  className,
  padded = false,
  scroll = false,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
  scroll?: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full min-w-0',
        scroll ? 'overflow-y-auto' : 'overflow-hidden',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function OsWindowSidebarLayout({
  sidebar,
  children,
  sidebarLabel,
  defaultSidebarCollapsed = false,
  headerToolSlotId = 'sidebar-toggle',
  className,
  sidebarWidthClassName = 'w-56',
  sidebarClassName,
  contentClassName,
}: {
  sidebar: ReactNode
  children: ReactNode
  sidebarLabel: string
  defaultSidebarCollapsed?: boolean
  headerToolSlotId?: string
  className?: string
  sidebarWidthClassName?: string
  sidebarClassName?: string
  contentClassName?: string
}) {
  const { t } = useTranslation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultSidebarCollapsed)
  const ToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose
  const sidebarToggleLabel = t(sidebarCollapsed ? 'os.showSidebar' : 'os.hideSidebar')
  const sidebarToggle = useStableHeaderTool(
    <button
      type="button"
      aria-label={sidebarToggleLabel}
      title={sidebarToggleLabel}
      onClick={() => setSidebarCollapsed((current) => !current)}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted transition hover:bg-white/10 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <ToggleIcon size={16} />
    </button>,
    [sidebarCollapsed, sidebarToggleLabel],
  )

  useOsWindowHeaderTools(headerToolSlotId, sidebarToggle)

  return (
    <OsWindowLayout className={className}>
      <aside
        aria-label={sidebarLabel}
        aria-hidden={sidebarCollapsed}
        className={cn(
          'min-h-0 shrink-0 overflow-hidden border-r border-white/[0.06] transition-[width,opacity,border-color] duration-200 ease-out',
          sidebarCollapsed ? 'w-0 border-transparent opacity-0' : sidebarWidthClassName,
        )}
      >
        <div
          className={cn('h-full min-h-0 overflow-y-auto', sidebarWidthClassName, sidebarClassName)}
        >
          {sidebar}
        </div>
      </aside>
      <main className={cn('min-h-0 min-w-0 flex-1 overflow-hidden', contentClassName)}>
        {children}
      </main>
    </OsWindowLayout>
  )
}
