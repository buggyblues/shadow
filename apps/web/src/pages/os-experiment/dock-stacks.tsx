import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@shadowob/ui'
import { AppWindow, FileText } from 'lucide-react'
import { type MouseEvent, memo, type ReactNode, useState } from 'react'
import { OsBuiltinAppIcon } from './builtin-icons'
import { AppIcon, OsDockButton } from './components'
import type { OsWindowState } from './types'

function windowDockIcon(item: OsWindowState) {
  if (item.kind === 'app') return <AppIcon iconUrl={item.iconUrl} />
  if (item.kind === 'chat-file') return <FileText size={18} />
  if (item.kind === 'workspace-file') return <FileText size={18} />
  if (item.kind === 'builtin') {
    return <OsBuiltinAppIcon appKey={item.builtinKey} />
  }
  return <AppWindow size={18} />
}

export interface OsDockAppStackEntry {
  id: string
  label: string
  icon: ReactNode
  signature?: string
  active?: boolean
  minimized?: boolean
  onSelect: () => void
  onContextMenu?: (event: MouseEvent) => void
}

export const OsDockAppStack = memo(function OsDockAppStack({
  label,
  icon,
  entries,
}: {
  label: string
  icon: ReactNode
  entries: OsDockAppStackEntry[]
}) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null

  const activeCount = entries.filter((item) => item.active).length

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      trigger={
        <OsDockButton
          active={activeCount > 0}
          badge={activeCount || undefined}
          label={label}
          icon={icon}
          data-os-dock-stack="apps"
        />
      }
    >
      <DropdownMenuContent
        align="center"
        side="top"
        sideOffset={12}
        className="z-[2147482000] max-h-[min(420px,calc(100vh-72px))] w-72 select-none overflow-y-auto overscroll-contain border-white/12 bg-bg-secondary p-2 text-text-primary shadow-[0_22px_70px_rgba(0,0,0,0.42)]"
      >
        {entries.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="select-none gap-3 normal-case tracking-normal"
            onPointerDown={(event) => {
              if (event.button !== 2) return
              event.preventDefault()
              event.stopPropagation()
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              item.onContextMenu?.(event)
              setOpen(false)
            }}
            onSelect={() => {
              item.onSelect()
              setOpen(false)
            }}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg text-text-muted">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-black">{item.label}</span>
            {item.minimized ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            ) : item.active ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

export const OsDockWindowStack = memo(function OsDockWindowStack({
  stackKey,
  label,
  icon,
  windows,
  focusedWindowId,
  onSelect,
}: {
  stackKey: 'files' | 'minimized'
  label: string
  icon: ReactNode
  windows: OsWindowState[]
  focusedWindowId: string | null
  onSelect: (id: string) => void
}) {
  if (windows.length === 0) return null

  return (
    <DropdownMenu
      trigger={
        <OsDockButton
          active={windows.some((item) => item.id === focusedWindowId)}
          badge={windows.length}
          label={label}
          icon={icon}
          data-os-dock-stack={stackKey}
        />
      }
    >
      <DropdownMenuContent
        align="center"
        side="top"
        sideOffset={12}
        className="z-[2147482000] max-h-[min(420px,calc(100vh-72px))] w-64 select-none overflow-y-auto overscroll-contain border-white/12 bg-bg-secondary p-2 text-text-primary shadow-[0_22px_70px_rgba(0,0,0,0.42)]"
      >
        {windows.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="select-none gap-3 normal-case tracking-normal"
            onSelect={() => onSelect(item.id)}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg text-text-muted">
              {windowDockIcon(item)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-black">{item.title}</span>
            {item.minimized ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
