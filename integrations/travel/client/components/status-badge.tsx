import type { ReactNode } from 'react'
import { Tag } from './tag.js'

type StatusBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const toneMap: Record<StatusBadgeTone, 'neutral' | 'olive' | 'warning' | 'danger' | 'info'> = {
  danger: 'danger',
  info: 'info',
  neutral: 'neutral',
  success: 'olive',
  warning: 'warning',
}

interface StatusBadgeProps {
  children: ReactNode
  className?: string
  icon?: ReactNode
  tone?: StatusBadgeTone
}

export function StatusBadge({ children, className, icon, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <Tag className={className} icon={icon} tone={toneMap[tone]}>
      {children}
    </Tag>
  )
}
