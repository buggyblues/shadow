import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import { ArrowRight } from './icons.js'

interface LinkedSourceChipProps {
  className?: string
  icon?: ReactNode
  iconTone?: string
  label: ReactNode
  meta?: ReactNode
  tone?: string
}

export function LinkedSourceChip({
  className,
  icon,
  iconTone = 'bg-sage text-olive',
  label,
  meta,
  tone = 'bg-white text-ink',
}: LinkedSourceChipProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-xl border border-line px-2 py-1.5 shadow-[0_6px_18px_rgba(31,35,24,0.04)]',
        tone,
        className,
      )}
    >
      {icon ? (
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', iconTone)}>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold text-[12px]">{label}</span>
        {meta ? <span className="mt-0.5 block truncate font-bold text-[11px]">{meta}</span> : null}
      </span>
      <ArrowRight className="shrink-0 text-muted" size={13} />
    </span>
  )
}
