import { Button, type ButtonProps } from '@shadowob/ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ToolbarActionButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconRight'> {
  icon: ReactNode
  label: ReactNode
  iconClassName?: string
}

export function ToolbarActionButton({
  icon,
  label,
  iconClassName,
  className,
  ...props
}: ToolbarActionButtonProps) {
  return (
    <Button size="sm" className={cn('gap-2 px-3', className)} {...props}>
      <span className={cn('inline-flex items-center justify-center align-middle', iconClassName)}>
        {icon}
      </span>
      <span className="align-middle">{label}</span>
    </Button>
  )
}
