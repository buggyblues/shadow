import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import { MapPoint } from './icons.js'

interface LocationPillProps {
  children: ReactNode
  className?: string
}

export function LocationPill({ children, className }: LocationPillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-paper px-2 font-bold text-[11px] text-ink',
        className,
      )}
    >
      <MapPoint className="shrink-0 text-olive" size={13} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}
