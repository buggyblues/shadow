import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@shadowob/ui'
import {
  AppWindow,
  Cloud,
  Compass,
  FileText,
  Folder,
  PawPrint,
  Settings,
  ShoppingBag,
  Store,
  User,
} from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { AppIcon, OsDockButton, osBuiltinIconToneClassName } from './components'
import type { OsWindowState } from './types'

function windowDockIcon(item: OsWindowState) {
  if (item.kind === 'app') return <AppIcon iconUrl={item.iconUrl} />
  if (item.kind === 'chat-file') return <FileText size={18} />
  if (item.kind === 'workspace-file') return <FileText size={18} />
  if (item.kind === 'builtin') {
    const className = osBuiltinIconToneClassName(item.builtinKey)
    if (item.builtinKey === 'workspace') return <Folder size={18} className={className} />
    if (item.builtinKey === 'app-store') return <Store size={18} className={className} />
    if (item.builtinKey === 'shop') return <ShoppingBag size={18} className={className} />
    if (item.builtinKey === 'settings') return <Settings size={18} className={className} />
    if (item.builtinKey === 'server-settings') return <Settings size={18} className={className} />
    if (item.builtinKey === 'profile') return <User size={18} />
    if (item.builtinKey === 'shadow-cloud') return <Cloud size={18} className={className} />
    if (item.builtinKey === 'discover') return <Compass size={18} className={className} />
    if (item.builtinKey === 'my-buddies') return <PawPrint size={18} className={className} />
  }
  return <AppWindow size={18} />
}

export interface OsDockAppStackEntry {
  id: string
  label: string
  icon: ReactNode
  active?: boolean
  minimized?: boolean
  toneClassName?: string
  onSelect: () => void
  onContextMenu?: (event: MouseEvent) => void
}

export function OsDockAppStack({
  label,
  icon,
  entries,
}: {
  label: string
  icon: ReactNode
  entries: OsDockAppStackEntry[]
}) {
  if (entries.length === 0) return null

  const activeCount = entries.filter((item) => item.active).length

  return (
    <DropdownMenu
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
        className="z-[520] max-h-[min(420px,calc(100vh-72px))] w-72 overflow-y-auto overscroll-contain border-white/12 bg-bg-secondary p-2 text-text-primary shadow-[0_22px_70px_rgba(0,0,0,0.42)]"
      >
        {entries.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="gap-3 normal-case tracking-normal"
            onContextMenu={item.onContextMenu}
            onSelect={() => item.onSelect()}
          >
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg text-text-muted',
                item.toneClassName,
              )}
            >
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
}

export function OsDockWindowStack({
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
        className="z-[520] max-h-[min(420px,calc(100vh-72px))] w-64 overflow-y-auto overscroll-contain border-white/12 bg-bg-secondary p-2 text-text-primary shadow-[0_22px_70px_rgba(0,0,0,0.42)]"
      >
        {windows.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="gap-3 normal-case tracking-normal"
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
}
