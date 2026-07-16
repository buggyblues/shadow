import { ChevronLeft, X } from 'lucide-react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

interface ModalContextValue {
  onClose?: () => void
}

const ModalContext = React.createContext<ModalContextValue | null>(null)

let openModalCount = 0
let previousBodyOverflow = ''
let previousBodyPaddingRight = ''

function lockBodyScroll() {
  if (typeof document === 'undefined') return

  if (openModalCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    previousBodyPaddingRight = document.body.style.paddingRight

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
  }

  openModalCount += 1
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return

  openModalCount = Math.max(0, openModalCount - 1)

  if (openModalCount === 0) {
    document.body.style.overflow = previousBodyOverflow
    document.body.style.paddingRight = previousBodyPaddingRight
  }
}

export interface ModalProps {
  open: boolean
  onClose?: () => void
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  children: React.ReactNode
}

export function Modal({
  open,
  onClose,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  children,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open) return

    lockBodyScroll()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      unlockBodyScroll()
    }
  }, [closeOnEscape, onClose, open])

  if (!mounted || !open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <ModalContext.Provider value={{ onClose }}>
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 bg-bg-deep/70 backdrop-blur-md animate-in fade-in-0 duration-200"
          onClick={closeOnOverlayClick ? onClose : undefined}
          aria-hidden="true"
        />
        <div className="relative z-10 flex h-full items-center justify-center p-4 md:p-6">
          {children}
        </div>
      </div>
    </ModalContext.Provider>,
    document.body,
  )
}

const modalSizeClassName = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
} as const

export interface ModalContentProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof modalSizeClassName
  maxWidth?: string
}

export const ModalContent = React.forwardRef<HTMLDivElement, ModalContentProps>(
  ({ className, size = 'md', maxWidth, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'relative flex w-full max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[36px] border border-border-subtle/80 bg-[var(--glass-bg)] text-text-primary shadow-[0_32px_120px_rgba(0,0,0,0.5)] backdrop-blur-[28px] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-300 supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]',
          maxWidth ?? modalSizeClassName[size],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
ModalContent.displayName = 'ModalContent'

export interface ModalHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  overline?: React.ReactNode
  icon?: React.ReactNode
  title?: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  onBack?: () => void
  backLabel?: string
  onClose?: () => void
  closeLabel?: string
  hideCloseButton?: boolean
}

export const ModalHeader = React.forwardRef<HTMLDivElement, ModalHeaderProps>(
  (
    {
      className,
      overline,
      icon,
      title,
      subtitle,
      action,
      onBack,
      backLabel = 'Back',
      onClose,
      closeLabel = 'Close',
      hideCloseButton = false,
      ...props
    },
    ref,
  ) => {
    const context = React.useContext(ModalContext)
    const handleClose = onClose ?? context?.onClose
    const hasContent = (value: React.ReactNode) =>
      value !== null && value !== undefined && value !== false && value !== ''
    const hasOverline = hasContent(overline)
    const hasIcon = hasContent(icon)
    const hasTitle = hasContent(title)
    const hasSubtitle = hasContent(subtitle)
    const hasBack = Boolean(onBack)
    const hasLeading = hasBack || hasIcon || hasOverline || hasTitle || hasSubtitle
    const hasClose = !hideCloseButton && Boolean(handleClose)
    const hasControls = hasContent(action) || hasClose

    if (!hasLeading && !hasControls) return null

    return (
      <div
        ref={ref}
        className={cn(
          'shrink-0 border-b border-border-subtle/80 bg-bg-secondary/20 px-5 py-4 backdrop-blur-xl',
          hasControls
            ? 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4'
            : 'grid grid-cols-1',
          className,
        )}
        {...props}
      >
        {hasLeading ? (
          <div className="flex min-h-11 min-w-0 items-center gap-3.5">
            {hasBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-[var(--glass-bg)] text-text-muted shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-bg-tertiary/60 hover:text-text-primary active:scale-95"
                aria-label={backLabel}
              >
                <ChevronLeft size={19} strokeWidth={2.6} />
              </button>
            ) : null}
            {hasIcon ? (
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[0_14px_30px_rgba(0,198,209,0.12)]">
                {icon}
              </div>
            ) : null}
            {hasOverline || hasTitle || hasSubtitle ? (
              <div className="flex min-h-11 min-w-0 flex-col justify-center">
                {hasOverline ? (
                  <p className="text-[10px] font-black uppercase leading-4 tracking-[0.24em] text-text-muted/50">
                    {overline}
                  </p>
                ) : null}
                {hasTitle ? (
                  <h2 className="line-clamp-2 text-base font-black leading-tight tracking-tight text-text-primary md:text-lg">
                    {title}
                  </h2>
                ) : null}
                {hasSubtitle ? (
                  <p
                    className={cn(
                      'line-clamp-2 text-sm font-medium leading-5 text-text-muted',
                      (hasTitle || hasOverline) && 'mt-1',
                    )}
                  >
                    {subtitle}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : hasControls ? (
          <span aria-hidden />
        ) : null}

        {hasControls ? (
          <div className="flex min-h-11 shrink-0 items-center gap-2">
            {action}
            {hasClose ? (
              <button
                type="button"
                onClick={() => handleClose?.()}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle bg-[var(--glass-bg)] text-text-muted shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-bg-tertiary/60 hover:text-text-primary active:scale-95"
                aria-label={closeLabel}
              >
                <X size={18} strokeWidth={2.6} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  },
)
ModalHeader.displayName = 'ModalHeader'

export const ModalBody = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <section
      ref={ref}
      className={cn('flex-1 min-h-0 overflow-y-auto px-6 py-5', className)}
      {...props}
    />
  ),
)
ModalBody.displayName = 'ModalBody'

export const ModalFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3 border-t border-border-subtle/80 bg-bg-secondary/10 px-6 py-4 backdrop-blur-xl shrink-0',
        className,
      )}
      {...props}
    />
  ),
)
ModalFooter.displayName = 'ModalFooter'

export const ModalButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('ml-auto flex flex-wrap items-center justify-end gap-3', className)}
    {...props}
  />
))
ModalButtonGroup.displayName = 'ModalButtonGroup'
