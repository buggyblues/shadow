import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

interface DialogProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
  isOpen?: boolean
  onClose?: () => void
  maxWidth?: string
}

const Dialog = ({
  isOpen,
  onClose,
  open,
  onOpenChange,
  maxWidth,
  children,
  ...props
}: DialogProps) => (
  <DialogPrimitive.Root
    open={isOpen !== undefined ? isOpen : open}
    onOpenChange={(val) => {
      onOpenChange?.(val)
      if (!val) onClose?.()
    }}
    {...props}
  >
    {children}
  </DialogPrimitive.Root>
)

const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-bg-deep/80 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  maxWidth?: string
  hideCloseButton?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, maxWidth: contentMaxWidth, hideCloseButton = false, ...props }, ref) => {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 rounded-[48px] border border-white dark:border-white/10 bg-[rgba(255,255,255,0.85)] dark:bg-bg-secondary/60 backdrop-blur-3xl p-10 shadow-[0_15px_45px_rgba(0,0,0,0.08)] dark:shadow-[0_32px_120px_rgba(0,0,0,0.5)] duration-300 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-4 data-[state=open]:slide-in-from-top-4 motion-reduce:duration-0 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
          contentMaxWidth || 'max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close className="absolute right-5 top-5 z-20 rounded-2xl border border-black/5 bg-white/80 p-2.5 text-text-muted shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition-all hover:-translate-y-0.5 hover:bg-white hover:text-text-primary dark:border-white/10 dark:bg-bg-secondary/80 dark:hover:bg-bg-secondary focus:outline-none disabled:pointer-events-none active:scale-95">
            <X className="h-5 w-5" strokeWidth={3} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-2xl font-black uppercase tracking-tight leading-none text-text-primary',
      className,
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm font-bold text-text-muted italic opacity-80', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
