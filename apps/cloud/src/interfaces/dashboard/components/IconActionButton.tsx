import {
  Button,
  type ButtonProps,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@shadowob/ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface IconActionButtonProps
  extends Omit<ButtonProps, 'children' | 'size' | 'icon' | 'iconRight'> {
  label: string
  icon: ReactNode
  tooltip?: string
  withTooltip?: boolean
}

export function IconActionButton({
  label,
  icon,
  tooltip,
  withTooltip = true,
  className,
  ...props
}: IconActionButtonProps) {
  const button = (
    <Button
      size="icon"
      aria-label={label}
      title={label}
      className={cn(
        'focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
        className,
      )}
      {...props}
    >
      {icon}
    </Button>
  )

  if (!withTooltip) {
    return button
  }

  return (
    <TooltipProvider delayDuration={180}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
