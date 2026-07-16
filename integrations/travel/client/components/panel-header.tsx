import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import { IconBadge } from './icon-badge.js'
import type { IconComponent } from './icons.js'

interface PanelHeaderProps {
  action?: ReactNode
  className?: string
  icon?: IconComponent
  subtitle?: ReactNode
  title: ReactNode
  tone?: string
}

export function PanelHeader({
  action,
  className,
  icon: Icon,
  subtitle,
  title,
  tone,
}: PanelHeaderProps) {
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <IconBadge size="sm" tone={tone}>
            <Icon size={15} />
          </IconBadge>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate font-extrabold text-[15px] leading-5">{title}</h2>
          {subtitle ? <p className="mt-0.5 truncate text-[12px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}
