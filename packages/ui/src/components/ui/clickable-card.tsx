import { Slot } from '@radix-ui/react-slot'
import * as React from 'react'
import { cn } from '../../lib/utils'

const INTERACTIVE_TARGET_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[data-clickable-card-ignore="true"]',
].join(',')

function hasNestedInteractiveTarget(currentTarget: EventTarget, target: EventTarget | null) {
  if (!(currentTarget instanceof HTMLElement) || !(target instanceof Element)) return false
  const interactiveTarget = target.closest(INTERACTIVE_TARGET_SELECTOR)
  return Boolean(interactiveTarget && interactiveTarget !== currentTarget)
}

export type ClickableCardPressEvent =
  | React.MouseEvent<HTMLDivElement>
  | React.KeyboardEvent<HTMLDivElement>

export type ClickableCardProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onClick' | 'onKeyDown'
> & {
  asChild?: boolean
  disabled?: boolean
  onClick?: React.MouseEventHandler<HTMLDivElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
  onPress?: (event: ClickableCardPressEvent) => void
}

export const ClickableCard = React.forwardRef<HTMLDivElement, ClickableCardProps>(
  (
    {
      asChild,
      className,
      disabled,
      onClick,
      onKeyDown,
      onPress,
      role = 'button',
      tabIndex,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'div'
    const resolvedTabIndex = disabled ? -1 : (tabIndex ?? 0)

    return (
      <Comp
        ref={ref}
        role={role}
        aria-disabled={disabled || undefined}
        tabIndex={resolvedTabIndex}
        className={cn(
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
          disabled && 'pointer-events-none opacity-60',
          className,
        )}
        onClick={(event) => {
          onClick?.(event)
          if (event.defaultPrevented || disabled) return
          if (hasNestedInteractiveTarget(event.currentTarget, event.target)) return
          onPress?.(event)
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented || disabled) return
          if (hasNestedInteractiveTarget(event.currentTarget, event.target)) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onPress?.(event)
        }}
        {...props}
      />
    )
  },
)
ClickableCard.displayName = 'ClickableCard'
