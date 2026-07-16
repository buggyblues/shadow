import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  icon?: ReactNode
}

export function Chip({ active, icon, className, children, ...props }: ChipProps) {
  return (
    <button
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-[12px] font-semibold leading-none transition',
        active
          ? 'border-olive bg-olive text-white shadow-sm'
          : 'border-line bg-white text-ink hover:bg-sage',
        className,
      )}
      type="button"
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}
