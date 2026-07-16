import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

type IconBadgeSize = 'sm' | 'md' | 'lg'

const sizeClasses: Record<IconBadgeSize, string> = {
  lg: 'size-12 rounded-full',
  md: 'size-10 rounded-xl',
  sm: 'size-8 rounded-lg',
}

interface IconBadgeProps {
  children: ReactNode
  className?: string
  size?: IconBadgeSize
  tone?: string
}

export function IconBadge({
  children,
  className,
  size = 'md',
  tone = 'bg-sage text-olive',
}: IconBadgeProps) {
  return (
    <span className={cn('grid shrink-0 place-items-center', sizeClasses[size], tone, className)}>
      {children}
    </span>
  )
}
