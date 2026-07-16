import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

export interface VisibilityOption<T extends string> {
  icon?: ReactNode
  label: ReactNode
  value: T
}

interface VisibilitySelectorProps<T extends string> {
  className?: string
  onChange: (value: T) => void
  options: Array<VisibilityOption<T>>
  value: T
}

export function VisibilitySelector<T extends string>({
  className,
  onChange,
  options,
  value,
}: VisibilitySelectorProps<T>) {
  return (
    <div className={cn('grid gap-1.5 sm:grid-cols-2', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            aria-pressed={selected}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 font-bold text-[12px] transition',
              selected
                ? 'border-olive bg-sage text-olive'
                : 'border-line bg-white text-muted hover:bg-sage hover:text-ink',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
