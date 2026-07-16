import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/class-names.js'

const openSheetStack: symbol[] = []

interface SheetProps {
  children: ReactNode
  backdropClassName?: string
  className?: string
  mode?: 'absolute' | 'fixed'
  onClose?: () => void
  open?: boolean
}

export function Sheet({
  backdropClassName,
  children,
  className,
  mode = 'fixed',
  onClose,
  open = true,
}: SheetProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const sheetIdRef = useRef(Symbol('travel-sheet'))
  useEffect(() => {
    if (!open) return
    const sheetId = sheetIdRef.current
    openSheetStack.push(sheetId)
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusPanel = window.requestAnimationFrame(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(focusableSelector)
      ;(firstFocusable ?? panelRef.current)?.focus()
    })
    const handleKeyboard = (event: KeyboardEvent) => {
      if (openSheetStack.at(-1) !== sheetId) return
      if (event.key === 'Escape' && onClose) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => {
      window.cancelAnimationFrame(focusPanel)
      window.removeEventListener('keydown', handleKeyboard)
      const stackIndex = openSheetStack.lastIndexOf(sheetId)
      if (stackIndex >= 0) openSheetStack.splice(stackIndex, 1)
      previousFocus?.focus()
    }
  }, [onClose, open])

  if (!open) return null
  const fixed = mode === 'fixed'
  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose?.()
  }

  const sheet = (
    <div
      className={cn(
        'travel-sheet-backdrop pointer-events-auto inset-0 z-[7000] bg-ink/10 backdrop-blur-[1px]',
        fixed ? 'fixed' : 'absolute',
        backdropClassName,
      )}
      onMouseDown={closeFromBackdrop}
    >
      <aside
        aria-modal="true"
        className={cn(
          'travel-sheet-panel pointer-events-auto absolute inset-x-0 bottom-0 max-h-[88dvh] w-full overflow-auto rounded-t-[24px] border-line border-x-0 border-b-0 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_24px_80px_rgba(37,35,30,0.22)] sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:h-full sm:w-[430px] sm:rounded-t-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0 sm:border-l sm:pb-4',
          className,
        )}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
        {children}
      </aside>
    </div>
  )
  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body)
}
