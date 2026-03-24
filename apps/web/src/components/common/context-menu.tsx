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
  icon?: React.ComponentType<{ size?: number; className?: string }>
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
      if (py + estimatedHeight > window.innerHeight - 8) py = window.innerHeight - estimatedHeight - 8
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
        className="fixed z-[101] bg-bg-tertiary/95 backdrop-blur-md border border-border-dim/60 rounded-xl shadow-2xl py-1"
        style={{ left: position.x, top: position.y, minWidth: `${minWidth}px` }}
      >
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="h-px bg-border-subtle mx-2 my-1" />}
            {group.title && (
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted/60 select-none">
                {group.title}
              </div>
            )}
            {group.items.map((item, ii) => (
              <button
                key={`${item.label}-${ii}`}
                type="button"
                disabled={item.disabled}
                onClick={() => handleItemClick(item)}
                className={`flex items-center gap-2 w-full px-2.5 py-[5px] text-[12px] transition-all duration-100 rounded-md mx-1 ${
                  item.disabled
                    ? 'text-text-muted/40 cursor-not-allowed'
                    : item.danger
                      ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                      : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                }`}
                style={{ width: 'calc(100% - 8px)' }}
              >
                {item.icon && <item.icon size={14} className="shrink-0" />}
                <span className="flex-1 text-left">{item.label}</span>
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
        className="fixed z-[101] bg-bg-tertiary/95 backdrop-blur-md border border-border-dim/60 rounded-xl shadow-2xl py-1 min-w-[160px]"
        style={{ left: position.x, top: position.y }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}