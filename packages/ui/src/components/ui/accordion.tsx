import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import * as React from 'react'
import { cn } from '../../lib/utils'

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      'border-b border-border-subtle bg-bg-secondary/30 rounded-2xl overflow-hidden mb-2 last:mb-0',
      className,
    )}
    {...props}
  />
))
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { icon?: React.ElementType }
>(({ className, children, icon: Icon, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between p-6 text-sm font-black uppercase tracking-tight transition-all hover:bg-bg-tertiary [&[data-state=open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3 text-left">
        {Icon && <Icon className="h-5 w-5 text-primary shrink-0" strokeWidth={3} />}
        {children}
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 text-text-muted ml-4" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('px-6 pb-6 pt-0 font-bold text-text-secondary leading-relaxed', className)}>
      {children}
    </div>
  </AccordionPrimitive.Content>
))
AccordionContent.displayName = AccordionPrimitive.Content.displayName

type AccordionProps = (
  | AccordionPrimitive.AccordionSingleProps
  | AccordionPrimitive.AccordionMultipleProps
) & {
  title?: string
  icon?: React.ElementType
}

const Accordion = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Root>,
  AccordionProps
>(({ title, icon, children, ...props }, ref) => {
  if (title) {
    if (props.type === 'single') {
      const { type: _type, collapsible: _collapsible, ...otherProps } = props
      return (
        <AccordionPrimitive.Root ref={ref} type="single" collapsible {...otherProps}>
          <AccordionItem value="item-1">
            <AccordionTrigger icon={icon}>{title}</AccordionTrigger>
            <AccordionContent>{children}</AccordionContent>
          </AccordionItem>
        </AccordionPrimitive.Root>
      )
    }
    const { type: _type, ...otherProps } = props as AccordionPrimitive.AccordionMultipleProps
    return (
      <AccordionPrimitive.Root ref={ref} type="multiple" {...otherProps}>
        <AccordionItem value="item-1">
          <AccordionTrigger icon={icon}>{title}</AccordionTrigger>
          <AccordionContent>{children}</AccordionContent>
        </AccordionItem>
      </AccordionPrimitive.Root>
    )
  }

  if (props.type === 'single') {
    return <AccordionPrimitive.Root ref={ref} {...props} />
  }
  return <AccordionPrimitive.Root ref={ref} {...props} />
})
Accordion.displayName = 'Accordion'

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
