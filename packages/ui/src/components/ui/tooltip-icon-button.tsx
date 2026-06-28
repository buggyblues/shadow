import * as React from 'react'
import type { ButtonProps } from './button'
import { Button } from './button'
import { TooltipContent } from './tooltip'
import { TooltipAnchor } from './tooltip-anchor'

export interface TooltipIconButtonProps
  extends Omit<ButtonProps, 'aria-label' | 'children' | 'icon' | 'iconRight' | 'title'> {
  label: string
  tooltip?: React.ReactNode
  tooltipClassName?: string
  tooltipDelayDuration?: number
  tooltipSide?: React.ComponentPropsWithoutRef<typeof TooltipContent>['side']
  tooltipAlign?: React.ComponentPropsWithoutRef<typeof TooltipContent>['align']
  children: React.ReactNode
}

const TooltipIconButton = React.forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  (
    {
      label,
      tooltip = label,
      tooltipClassName,
      tooltipDelayDuration = 200,
      tooltipSide = 'top',
      tooltipAlign = 'center',
      variant = 'ghost',
      size = 'icon',
      type = 'button',
      children,
      ...props
    },
    ref,
  ) => (
    <TooltipAnchor
      label={tooltip}
      contentClassName={tooltipClassName}
      delayDuration={tooltipDelayDuration}
      side={tooltipSide}
      align={tooltipAlign}
    >
      <Button ref={ref} type={type} variant={variant} size={size} aria-label={label} {...props}>
        {children}
      </Button>
    </TooltipAnchor>
  ),
)
TooltipIconButton.displayName = 'TooltipIconButton'

export { TooltipIconButton }
