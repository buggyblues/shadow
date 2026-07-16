import { cn } from '@shadowob/ui'
import { ChevronDown, Menu, Minus, PictureInPicture2, X } from 'lucide-react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenuWrapper } from '../../../../components/common/context-menu'
import type { OsWindowState } from '../../types'
import { OsWindowTitleIcon } from '../icon-and-dock'
import type { OsWindowMenuItem } from '../window-menu'

export function maximizedWindowTabPortalId(windowId: string) {
  return `os-maximized-window-tab-${windowId}`
}

function MaximizedWindowMenuItems({
  items,
  onAction,
}: {
  items: OsWindowMenuItem[]
  onAction: () => void
}) {
  return items.map((item, index) => {
    const key = item.type === 'separator' ? (item.id ?? `separator-${index}`) : item.id
    if (item.type === 'separator') {
      return <div key={key} className="mx-2 my-1 h-px bg-white/10" />
    }

    const icon = item.icon ? (
      <span className="grid h-4 w-4 shrink-0 place-items-center text-text-muted">{item.icon}</span>
    ) : null

    if (item.type === 'submenu') {
      return (
        <div key={key} className="py-0.5">
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-black text-text-muted">
            {icon}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <ChevronDown size={13} aria-hidden="true" />
          </div>
          <div className="ml-4 border-white/10 border-l pl-1">
            <MaximizedWindowMenuItems items={item.items} onAction={onAction} />
          </div>
        </div>
      )
    }

    return (
      <button
        key={key}
        type="button"
        disabled={item.disabled}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-text-primary transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-45',
          item.danger && 'text-danger hover:bg-danger/10',
        )}
        onClick={() => {
          item.onSelect()
          onAction()
        }}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </button>
    )
  })
}

type OsMaximizedWindowTabProps = {
  item: OsWindowState
  headerTools: Array<[string, ReactNode]>
  headerSearches: Array<[string, ReactNode]>
  windowMenuItems: OsWindowMenuItem[]
  onRestore: () => void
  onMinimize: () => void
  onClose: () => void
}

export function OsMaximizedWindowTab({
  item,
  headerTools,
  headerSearches,
  windowMenuItems,
  onRestore,
  onMinimize,
  onClose,
}: OsMaximizedWindowTabProps) {
  const { t } = useTranslation()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const openContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  const openKeyboardContextMenu = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const opensContextMenu = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
    const activatesTab = event.key === 'Enter' || event.key === ' '
    if (!opensContextMenu && !activatesTab) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ x: opensContextMenu ? rect.left + 20 : rect.left, y: rect.bottom + 4 })
  }

  const openDropdownMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ x: rect.left, y: rect.bottom + 4 })
  }

  const openTabMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('[data-window-inline-controls="true"]')) return
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ x: rect.left, y: rect.bottom + 4 })
  }

  const runControlAction = (action: () => void) => {
    setContextMenu(null)
    action()
  }

  return (
    <>
      <div
        role="tab"
        tabIndex={0}
        aria-selected="true"
        aria-label={item.title}
        title={item.title}
        data-maximized-window-tab="true"
        aria-haspopup="menu"
        aria-expanded={contextMenu ? 'true' : 'false'}
        className="relative flex h-8 min-w-32 max-w-[min(560px,62vw)] shrink-0 cursor-pointer select-none items-center gap-1 rounded-lg bg-white/12 py-0 pl-0.5 pr-4 text-left text-xs font-black text-white shadow-[0_6px_16px_rgba(0,0,0,0.16)] ring-1 ring-white/10 transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/65"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={openTabMenu}
        onContextMenu={openContextMenu}
        onKeyDown={openKeyboardContextMenu}
      >
        <button
          type="button"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/56 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/65"
          aria-label={t('os.windowMenu')}
          title={t('os.windowMenu')}
          aria-expanded={contextMenu ? 'true' : 'false'}
          onClick={openDropdownMenu}
        >
          <Menu size={14} aria-hidden="true" />
        </button>
        <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md">
          <OsWindowTitleIcon item={item} className="!h-5 !w-5" />
        </span>
        <span className="block min-w-0 max-w-40 shrink truncate">{item.title}</span>
        {headerTools.length > 0 || headerSearches.length > 0 ? (
          <span
            className="ml-1 flex min-w-0 shrink-0 items-center gap-0.5"
            data-window-inline-controls="true"
          >
            {headerTools.length > 0 ? (
              <span className="flex h-7 shrink-0 items-center gap-0.5 [&_button]:!h-7 [&_button]:!w-7 [&_button]:!rounded-lg [&_button]:!border-transparent [&_button]:!bg-transparent [&_button]:!shadow-none [&_button]:!backdrop-blur-none [&_button]:!transform-none hover:[&_button]:!bg-white/10">
                {headerTools.map(([slotId, tools]) => (
                  <span key={slotId} className="contents">
                    {tools}
                  </span>
                ))}
              </span>
            ) : null}
            {headerSearches.map(([slotId, search]) => (
              <span
                key={slotId}
                className="min-w-0 [&>button]:!h-7 [&>button]:!w-7 [&>button]:!rounded-lg"
              >
                {search}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {contextMenu ? (
        <ContextMenuWrapper
          x={contextMenu.x}
          y={contextMenu.y}
          zIndex={920}
          onClose={() => setContextMenu(null)}
        >
          <div className="w-[min(320px,calc(100vw-24px))]">
            {windowMenuItems.length > 0 ? (
              <MaximizedWindowMenuItems
                items={windowMenuItems}
                onAction={() => setContextMenu(null)}
              />
            ) : null}
            {windowMenuItems.length > 0 ? <div className="mx-2 my-1 h-px bg-white/10" /> : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-text-primary transition hover:bg-white/10"
              onClick={() => runControlAction(onRestore)}
            >
              <PictureInPicture2 size={16} />
              <span className="min-w-0 flex-1 truncate">{t('os.restoreWindow')}</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-text-primary transition hover:bg-white/10"
              onClick={() => runControlAction(onMinimize)}
            >
              <Minus size={16} />
              <span className="min-w-0 flex-1 truncate">{t('os.hide')}</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-danger transition hover:bg-danger/10"
              onClick={() => runControlAction(onClose)}
            >
              <X size={16} />
              <span className="min-w-0 flex-1 truncate">{t('os.close')}</span>
            </button>
          </div>
        </ContextMenuWrapper>
      ) : null}
    </>
  )
}
