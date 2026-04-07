import * as React from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'
import { cn } from '../../lib/utils'

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
)
Drawer.displayName = 'Drawer'

const DrawerTrigger = (props: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Trigger>) => (
  <DrawerPrimitive.Trigger {...props} />
)
DrawerTrigger.displayName = 'DrawerTrigger'

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = (props: React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Close>) => (
  <DrawerPrimitive.Close {...props} />
)
DrawerClose.displayName = 'DrawerClose'

type DrawerOverlayComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay> &
    React.RefAttributes<HTMLDivElement>
>

const DrawerOverlay: DrawerOverlayComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>((props, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-bg-deep/80 backdrop-blur-md', props.className)}
    {...props}
  />
))
DrawerOverlay.displayName = 'DrawerOverlay'

type DrawerContentComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> &
    React.RefAttributes<HTMLDivElement>
>

const DrawerContent: DrawerContentComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[48px] border border-border-subtle bg-bg-secondary p-6 shadow-[0_-32px_120px_rgba(0,0,0,0.5)] outline-none',
        props.className,
      )}
      {...props}
    >
      <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-bg-tertiary shadow-inner border border-border-subtle" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = 'DrawerContent'

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-1.5 p-4 text-center sm:text-left', className)} {...props} />
)
DrawerHeader.displayName = 'DrawerHeader'

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
)
DrawerFooter.displayName = 'DrawerFooter'

type DrawerTitleComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title> & React.RefAttributes<HTMLDivElement>
>

const DrawerTitle: DrawerTitleComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>((props, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      'text-2xl font-black uppercase tracking-tight leading-none text-text-primary',
      props.className,
    )}
    {...props}
  />
))
DrawerTitle.displayName = 'DrawerTitle'

type DrawerDescriptionComponent = React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description> &
    React.RefAttributes<HTMLDivElement>
>

const DrawerDescription: DrawerDescriptionComponent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>((props, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn('text-sm font-bold text-text-muted italic opacity-80', props.className)}
    {...props}
  />
))
DrawerDescription.displayName = 'DrawerDescription'

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
}
