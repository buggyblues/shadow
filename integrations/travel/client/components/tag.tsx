import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

type TagTone = 'neutral' | 'olive' | 'warning' | 'danger' | 'info'

const toneClasses: Record<TagTone, string> = {
  danger: 'bg-[#fff0ec] text-coral',
  info: 'bg-[#eef7fb] text-[#356f96]',
  neutral: 'bg-paper text-muted',
  olive: 'bg-sage text-olive',
  warning: 'bg-[#fff4dd] text-[#9b6b1f]',
}

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: ReactNode
  tone?: TagTone
}

export function Tag({ children, className, icon, tone = 'neutral', ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2 font-bold text-[11px]',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}
