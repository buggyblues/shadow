import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface ResponsibilityCardProps {
  className?: string
  icon: ReactNode
  title: ReactNode
  value: ReactNode
}

export function ResponsibilityCard({ className, icon, title, value }: ResponsibilityCardProps) {
  return (
    <div className={cn('rounded-xl border border-line bg-paper p-2.5', className)}>
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 font-extrabold text-[12px]">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-olive">
          {icon}
        </span>
        <span className="min-w-0 truncate">{title}</span>
      </div>
      <div className="line-clamp-2 min-h-8 text-[11px] text-muted leading-4">{value}</div>
    </div>
  )
}
