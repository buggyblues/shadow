import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '../utils/class-names.js'
import { CheckCircle, ChevronDown } from './icons.js'

export interface SelectOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  selected?: boolean
}

interface SelectProps<T extends string> {
  label: string
  valueLabel: string
  options: SelectOption<T>[]
  onSelect: (value: T) => void
  className?: string
  align?: 'left' | 'right'
  placement?: 'bottom' | 'top'
  multiple?: boolean
}

export function Select<T extends string>({
  label,
  valueLabel,
  options,
  onSelect,
  className,
  align = 'right',
  placement = 'bottom',
  multiple = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-10 max-w-full min-w-[132px] items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 font-bold text-[12px] leading-none shadow-sm transition hover:bg-sage"
        onClick={() => setOpen((next) => !next)}
        type="button"
      >
        <span className="min-w-0 truncate">{valueLabel}</span>
        <ChevronDown className="shrink-0 text-muted" size={14} />
      </button>
      {open ? (
        <div
          className={cn(
            'absolute z-[5200] grid max-h-[320px] min-w-[184px] gap-1 overflow-auto rounded-xl border border-line bg-white p-1 shadow-[0_18px_44px_rgba(37,35,30,0.16)]',
            placement === 'top' ? 'bottom-12' : 'top-12',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((option) => (
            <button
              aria-label={`${label} ${option.label}`}
              aria-pressed={multiple ? option.selected : undefined}
              className={cn(
                'flex h-9 items-center gap-2 rounded-lg px-2.5 text-left font-semibold text-[12px] transition hover:bg-sage',
                option.selected ? 'bg-sage text-olive' : 'text-ink',
              )}
              key={option.value}
              onClick={() => {
                onSelect(option.value)
                if (!multiple) setOpen(false)
              }}
              type="button"
            >
              {option.icon ? (
                <span className="grid size-5 shrink-0 place-items-center">{option.icon}</span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.selected ? <CheckCircle className="shrink-0 text-olive" size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface NativeSelectProps<T extends string> {
  label: string
  onChange: (value: T) => void
  options: Array<{ label: string; value: T }>
  value: T
  className?: string
}

export function NativeSelect<T extends string>({
  className,
  label,
  onChange,
  options,
  value,
}: NativeSelectProps<T>) {
  return (
    <label
      className={cn(
        'relative inline-flex h-10 min-w-[132px] items-center rounded-xl border border-line bg-white shadow-sm',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-full w-full appearance-none rounded-xl bg-transparent py-0 pr-7 pl-3 font-bold text-[12px] outline-none transition focus:ring-4 focus:ring-olive/10"
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
        <ChevronDown size={14} />
      </span>
    </label>
  )
}
