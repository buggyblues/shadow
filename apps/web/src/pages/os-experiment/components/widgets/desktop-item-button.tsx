import { cn } from '@shadowob/ui'
import {
  type FormEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { DesktopItemIcon, desktopItemLabel } from '../../desktop/desktop-item'
import { DESKTOP_ICON_TEXT_SHADOW } from '../../desktop/geometry'
import type { OsDesktopItem, OsDesktopWorkspaceItem } from '../../types'

type DesktopItemPreview = {
  id: string
  x: number
  y: number
} | null

type OsDesktopItemButtonProps = {
  item: OsDesktopItem
  isRenaming: boolean
  preview: DesktopItemPreview
  renameDraft: string
  wallpaperInteractive: boolean
  onOpenItem: (item: OsDesktopItem) => void
  onItemKeyDown: (item: OsDesktopItem, event: ReactKeyboardEvent<HTMLDivElement>) => void
  onPointerDown: (item: OsDesktopItem, event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
  onContextMenu: (item: OsDesktopItem, event: ReactMouseEvent<HTMLDivElement>) => void
  onRenameDraftChange: (value: string) => void
  onSubmitRename: (item: OsDesktopWorkspaceItem) => void
  onCancelRename: () => void
}

export const OsDesktopItemButton = memo(function OsDesktopItemButton({
  item,
  isRenaming,
  preview,
  renameDraft,
  wallpaperInteractive,
  onOpenItem,
  onItemKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onPointerCancel,
  onContextMenu,
  onRenameDraftChange,
  onSubmitRename,
  onCancelRename,
}: OsDesktopItemButtonProps) {
  const label = desktopItemLabel(item)

  const submitRenameForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (item.kind === 'workspace-node') onSubmitRename(item)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group absolute flex h-[104px] w-[88px] select-none flex-col items-center gap-1.5 rounded-[14px] p-1.5 text-center text-white/86 transition-colors',
        'hover:bg-white/10 focus-visible:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        preview && 'z-20 cursor-grabbing transition-none',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        contain: 'layout paint style',
        left: preview?.x ?? item.x,
        top: preview?.y ?? item.y,
      }}
      title={label}
      aria-label={label}
      onDoubleClick={() => onOpenItem(item)}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => onItemKeyDown(item, event)}
      onPointerDown={(event) => onPointerDown(item, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerCancel}
      onContextMenu={(event) => onContextMenu(item, event)}
    >
      <DesktopItemIcon item={item} />
      {isRenaming && item.kind === 'workspace-node' ? (
        <form className="w-full" onSubmit={submitRenameForm}>
          <input
            autoFocus
            value={renameDraft}
            className="h-6 w-full rounded-md border border-primary/50 bg-black/65 px-1 text-center text-xs font-black text-white outline-none"
            onChange={(event) => onRenameDraftChange(event.currentTarget.value)}
            onBlur={() => onSubmitRename(item)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancelRename()
              }
            }}
          />
        </form>
      ) : (
        <span
          className="line-clamp-2 w-full text-xs font-black leading-4"
          style={{ textShadow: DESKTOP_ICON_TEXT_SHADOW }}
        >
          {label}
        </span>
      )}
    </div>
  )
})
