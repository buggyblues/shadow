/**
 * ContextMenu - A reusable right-click menu component with automatic boundary detection
 *
 * Features:
 * - Automatic viewport boundary detection (prevents menu from being cut off)
 * - Portal rendering to escape scroll containers
 * - Keyboard navigation support (Escape to close)
 * - Consistent styling across all context menus
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  icon?: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  label: string
  shortcut?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
}

export interface ContextMenuGroup {
  title?: string
  items: ContextMenuItem[]
}

interface ContextMenuProps {
  x: number
  y: number
  groups: ContextMenuGroup[]
  onClose: () => void
  minWidth?: number
}

/**
 * Hook to calculate safe menu position within viewport
 */
export function useContextMenuPosition(
  x: number,
  y: number,
  menuRef: React.RefObject<HTMLDivElement | null>,
  minWidth = 180,
) {
  const [position, setPosition] = useState({ x, y })

  useEffect(() => {
    const el = menuRef.current
    if (!el) {
      // Pre-render estimate
      const estimatedWidth = minWidth
      const estimatedHeight = 200 // rough estimate
      let px = x
      let py = y
      if (px + estimatedWidth > window.innerWidth - 8) px = window.innerWidth - estimatedWidth - 8
      if (py + estimatedHeight > window.innerHeight - 8)
        py = window.innerHeight - estimatedHeight - 8
      if (px < 8) px = 8
      if (py < 8) py = 8
      setPosition({ x: px, y: py })
      return
    }

    // Measure actual menu size
    const rect = el.getBoundingClientRect()
    let px = x
    let py = y
    if (px + rect.width > window.innerWidth - 8) px = window.innerWidth - rect.width - 8
    if (py + rect.height > window.innerHeight - 8) py = window.innerHeight - rect.height - 8
    if (px < 8) px = 8
    if (py < 8) py = 8
    setPosition({ x: px, y: py })
  }, [x, y, menuRef, minWidth])

  return position
}

export function ContextMenu({ x, y, groups, onClose, minWidth = 180 }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const position = useContextMenuPosition(x, y, menuRef, minWidth)

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on scroll
  useEffect(() => {
    const handleScroll = () => onClose()
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [onClose])

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return
      item.onClick?.()
      onClose()
    },
    [onClose],
  )

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[101] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 animate-in fade-in zoom-in-95 duration-100"
        style={{ left: position.x, top: position.y, minWidth: `${minWidth}px` }}
      >
        <div className="flex flex-col gap-0.5 px-1.5">
          {groups.map((group, gi) => (
            <div key={gi} className="contents">
              {gi > 0 && <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1 shrink-0" />}
              {group.title && (
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-bold uppercase tracking-widest text-text-muted/60 select-none">
                  {group.title}
                </div>
              )}
              {group.items.map((item, ii) => (
                <button
                  key={`${item.label}-${ii}`}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => handleItemClick(item)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-[14px] font-medium transition-colors rounded-[10px] ${
                    item.disabled
                      ? 'text-text-muted/40 cursor-not-allowed'
                      : item.danger
                        ? 'text-danger hover:bg-danger/10 hover:text-danger group'
                        : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  {item.icon && (
                    <item.icon
                      size={16}
                      strokeWidth={2}
                      className={`shrink-0 ${item.danger ? 'opacity-80 group-hover:opacity-100' : 'opacity-70'}`}
                    />
                  )}
                  <span className="flex-1 text-left leading-none">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-[11px] text-text-muted/50 font-mono ml-4 shrink-0">
                      {item.shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}

/**
 * Generic context menu wrapper for simple cases
 */
export function ContextMenuWrapper({
  x,
  y,
  onClose,
  children,
}: {
  x: number
  y: number
  onClose: () => void
  children: React.ReactNode
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let px = x
    let py = y
    if (px + rect.width > window.innerWidth - 8) px = window.innerWidth - rect.width - 8
    if (py + rect.height > window.innerHeight - 8) py = window.innerHeight - rect.height - 8
    if (px < 8) px = 8
    if (py < 8) py = 8
    setPosition({ x: px, y: py })
  }, [x, y])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[101] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
        style={{ left: position.x, top: position.y }}
      >
        <div className="flex flex-col gap-0.5 px-1.5">{children}</div>
      </div>
    </>,
    document.body,
  )
}
