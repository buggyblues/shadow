/**
 * ContextMenu - A reusable right-click menu component with automatic boundary detection
 *
 * Features:
 * - Automatic viewport boundary detection (prevents menu from being cut off)
 * - Portal rendering to escape scroll containers
 * - Keyboard navigation support (Escape to close)
 * - Consistent styling across all context menus
 */
import {
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export interface ContextMenuItem {
  icon?: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  label: string
  shortcut?: string
  onClick?: () => void
  submenu?: ContextMenuItem[]
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
  zIndex?: number
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

export function ContextMenu({
  x,
  y,
  groups,
  onClose,
  minWidth = 180,
  zIndex = 101,
}: ContextMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const submenuCloseTimerRef = useRef<number | null>(null)
  const position = useContextMenuPosition(x, y, menuRef, minWidth)
  const [activeSubmenuKey, setActiveSubmenuKey] = useState<string | null>(null)
  const stopMenuEvent = useCallback((event: SyntheticEvent) => {
    event.stopPropagation()
  }, [])
  const submenuSide =
    typeof window !== 'undefined' && position.x + minWidth + 196 > window.innerWidth - 8
      ? 'left'
      : 'right'

  const clearSubmenuCloseTimer = useCallback(() => {
    if (submenuCloseTimerRef.current === null) return
    window.clearTimeout(submenuCloseTimerRef.current)
    submenuCloseTimerRef.current = null
  }, [])

  const openSubmenu = useCallback(
    (key: string) => {
      clearSubmenuCloseTimer()
      setActiveSubmenuKey(key)
    },
    [clearSubmenuCloseTimer],
  )

  const closeSubmenuSoon = useCallback(
    (key: string) => {
      clearSubmenuCloseTimer()
      submenuCloseTimerRef.current = window.setTimeout(() => {
        setActiveSubmenuKey((current) => (current === key ? null : current))
        submenuCloseTimerRef.current = null
      }, 180)
    },
    [clearSubmenuCloseTimer],
  )

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

  useEffect(() => {
    return () => clearSubmenuCloseTimer()
  }, [clearSubmenuCloseTimer])

  const visibleGroups = groups.filter((group) => group.items.length > 0)

  const handleItemClick = useCallback(
    (item: ContextMenuItem, event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (item.disabled) return
      if (item.submenu?.length) return
      item.onClick?.()
      onClose()
    },
    [onClose],
  )

  if (visibleGroups.length === 0) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 z-[100]"
        style={{ zIndex: zIndex - 1 }}
        onPointerDown={stopMenuEvent}
        onMouseDown={stopMenuEvent}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[101] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 animate-in fade-in zoom-in-95 duration-100"
        style={{ left: position.x, top: position.y, minWidth: `${minWidth}px`, zIndex }}
        onPointerDown={stopMenuEvent}
        onMouseDown={stopMenuEvent}
        onClick={stopMenuEvent}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className="flex flex-col gap-0.5 px-1.5">
          {visibleGroups.map((group, gi) => (
            <div key={gi} className="contents">
              {gi > 0 && <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1 shrink-0" />}
              {group.title && (
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-bold uppercase tracking-widest text-text-muted/60 select-none">
                  {group.title}
                </div>
              )}
              {group.items.map((item, ii) => {
                const hasSubmenu = Boolean(item.submenu?.length)
                const submenuKey = `${gi}:${ii}`
                const submenuOpen = activeSubmenuKey === submenuKey
                return (
                  <div
                    key={`${item.label}-${ii}`}
                    className="relative"
                    onPointerEnter={() => {
                      if (hasSubmenu) {
                        openSubmenu(submenuKey)
                      } else {
                        clearSubmenuCloseTimer()
                        setActiveSubmenuKey(null)
                      }
                    }}
                    onPointerLeave={() => {
                      if (hasSubmenu) closeSubmenuSoon(submenuKey)
                    }}
                    onFocus={() => {
                      if (hasSubmenu) openSubmenu(submenuKey)
                    }}
                  >
                    <button
                      type="button"
                      disabled={item.disabled}
                      onPointerDown={stopMenuEvent}
                      onMouseDown={stopMenuEvent}
                      onClick={(event) => handleItemClick(item, event)}
                      className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors ${
                        item.disabled
                          ? 'cursor-not-allowed text-text-muted/40'
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
                        <span className="ml-4 shrink-0 font-mono text-[11px] text-text-muted/50">
                          {item.shortcut}
                        </span>
                      )}
                      {hasSubmenu ? (
                        <span className="ml-3 shrink-0 text-[15px] leading-none text-text-muted/55">
                          ›
                        </span>
                      ) : null}
                    </button>
                    {hasSubmenu ? (
                      <div
                        className={`absolute top-[-6px] z-[1] min-w-48 transition duration-100 ${
                          submenuSide === 'right' ? 'left-full pl-2' : 'right-full pr-2'
                        } ${submenuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}
                        onPointerEnter={() => openSubmenu(submenuKey)}
                        onPointerLeave={() => closeSubmenuSoon(submenuKey)}
                      >
                        <div className="rounded-[16px] border border-black/5 bg-white/95 py-2 shadow-[0_12px_48px_rgba(0,0,0,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#1A1D24]/95 dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)]">
                          <div className="flex flex-col gap-0.5 px-1.5">
                            {item.submenu?.map((subitem, subIndex) => (
                              <button
                                key={`${subitem.label}-${subIndex}`}
                                type="button"
                                disabled={subitem.disabled}
                                onPointerDown={stopMenuEvent}
                                onMouseDown={stopMenuEvent}
                                onClick={(event) => handleItemClick(subitem, event)}
                                className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors ${
                                  subitem.disabled
                                    ? 'cursor-not-allowed text-text-muted/40'
                                    : subitem.danger
                                      ? 'text-danger hover:bg-danger/10 hover:text-danger group'
                                      : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/10'
                                }`}
                              >
                                {subitem.icon && (
                                  <subitem.icon
                                    size={16}
                                    strokeWidth={2}
                                    className={`shrink-0 ${subitem.danger ? 'opacity-80 group-hover:opacity-100' : 'opacity-70'}`}
                                  />
                                )}
                                <span className="flex-1 text-left leading-none">
                                  {subitem.label}
                                </span>
                                {subitem.shortcut && (
                                  <span className="ml-4 shrink-0 font-mono text-[11px] text-text-muted/50">
                                    {subitem.shortcut}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
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
  zIndex = 101,
}: {
  x: number
  y: number
  onClose: () => void
  children: React.ReactNode
  zIndex?: number
}) {
  const { t } = useTranslation()
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
      <button
        type="button"
        aria-label={t('common.close')}
        className="fixed inset-0 z-[100]"
        style={{ zIndex: zIndex - 1 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[101] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
        style={{ left: position.x, top: position.y, zIndex }}
      >
        <div className="flex flex-col gap-0.5 px-1.5">{children}</div>
      </div>
    </>,
    document.body,
  )
}
