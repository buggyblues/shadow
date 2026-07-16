import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

export interface TabOption<T extends string> {
  id: T
  label: ReactNode
}

type TabsVariant = 'underline' | 'segmented'

interface TabsProps<T extends string> {
  options: Array<TabOption<T>>
  value: T
  onChange: (value: T) => void
  className?: string
  variant?: TabsVariant
}

export function Tabs<T extends string>({
  className,
  onChange,
  options,
  value,
  variant = 'underline',
}: TabsProps<T>) {
  if (variant === 'segmented') {
    return (
      <div
        className={cn(
          'flex min-w-max flex-nowrap rounded-[var(--radius-card)] bg-paper/80 p-1',
          className,
        )}
      >
        {options.map((option) => {
          const selected = option.id === value
          return (
            <button
              aria-pressed={selected}
              className={cn(
                'h-10 shrink-0 rounded-[var(--radius-control)] px-3 font-extrabold text-[12px] transition sm:px-2.5 sm:text-[11px]',
                selected
                  ? 'bg-olive text-white shadow-[0_6px_14px_rgba(49,92,80,0.16)]'
                  : 'text-muted hover:bg-paper',
              )}
              key={option.id}
              onClick={() => onChange(option.id)}
              type="button"
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('flex min-w-0 gap-5 overflow-x-auto xl:gap-8', className)}>
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            aria-pressed={selected}
            className={cn(
              'relative h-10 shrink-0 px-0 font-bold text-[13px] transition xl:h-11 xl:text-[14px]',
              selected ? 'text-olive' : 'text-ink/75 hover:text-ink',
            )}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            {option.label}
            {selected ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-olive" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
