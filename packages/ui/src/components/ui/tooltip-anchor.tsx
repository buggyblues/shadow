import * as React from 'react'
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from './tooltip'

export interface TooltipAnchorProps {
  label: React.ReactNode
  children: React.ReactElement
  contentClassName?: string
  delayDuration?: number
  side?: React.ComponentPropsWithoutRef<typeof TooltipContent>['side']
  align?: React.ComponentPropsWithoutRef<typeof TooltipContent>['align']
  disabled?: boolean
}

function TooltipAnchor({
  label,
  children,
  contentClassName,
  delayDuration = 200,
  side = 'top',
  align = 'center',
  disabled = false,
}: TooltipAnchorProps) {
  if (disabled || label == null || label === '') return children

  const childProps = children.props as { title?: unknown }
  const trigger =
    typeof label === 'string' && childProps.title == null
      ? React.cloneElement(children as React.ReactElement<{ title?: string }>, { title: label })
      : children

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side={side} align={align} className={contentClassName}>
            {label}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  )
}

export { TooltipAnchor }
