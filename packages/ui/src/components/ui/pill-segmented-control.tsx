import * as React from 'react'
import { cn } from '../../lib/utils'

export interface PillSegmentedControlItem<Value extends string = string> {
  value: Value
  label: React.ReactNode
  icon?: React.ReactNode
  trailing?: React.ReactNode
  disabled?: boolean
}

type PillSegmentedControlSize = 'sm' | 'md'
type PillSegmentedControlMode = 'group' | 'button'
type PillSegmentedControlVariant = 'default' | 'topbar'

function pillSegmentedItemClassName({
  active,
  size,
  variant,
}: {
  active?: boolean
  size: PillSegmentedControlSize
  variant: PillSegmentedControlVariant
}) {
  return cn(
    'inline-flex shrink-0 items-center gap-2 rounded-full font-semibold normal-case tracking-normal transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:pointer-events-none disabled:opacity-50',
    variant === 'topbar'
      ? 'h-7 min-w-0 flex-1 gap-1.5 px-2 text-sm'
      : size === 'sm'
        ? 'h-9 px-3 text-xs'
        : 'h-10 px-4 text-sm',
    active
      ? 'bg-bg-primary/70 text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_18px_rgba(0,0,0,0.12)]'
      : 'text-text-muted hover:bg-white/[0.07] hover:text-text-primary',
  )
}

export interface PillSegmentedControlProps<Value extends string = string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: PillSegmentedControlItem<Value>[]
  value: Value
  onValueChange: (value: Value) => void
  size?: PillSegmentedControlSize
  mode?: PillSegmentedControlMode
  variant?: PillSegmentedControlVariant
}

export function PillSegmentedControl<Value extends string = string>({
  items,
  value,
  onValueChange,
  size = 'md',
  mode = 'group',
  variant = 'default',
  className,
  ...props
}: PillSegmentedControlProps<Value>) {
  if (mode === 'button') {
    const item = items[0]
    if (!item) return null
    const { onClick, ...buttonProps } = props as React.ButtonHTMLAttributes<HTMLButtonElement>

    return (
      <button
        type="button"
        className={cn(
          'inline-flex min-w-0 items-center rounded-full bg-bg-secondary/25 p-1 backdrop-blur-xl transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
          variant === 'topbar' ? 'h-8 max-w-[260px]' : 'h-11',
          className,
        )}
        onClick={(event) => {
          onValueChange(item.value)
          onClick?.(event)
        }}
        {...buttonProps}
      >
        <span className={pillSegmentedItemClassName({ active: true, size, variant })}>
          {item.icon ? (
            <span className="inline-flex shrink-0 items-center justify-center">{item.icon}</span>
          ) : null}
          <span className={cn('min-w-0 truncate', variant === 'topbar' && 'flex-1 text-left')}>
            {item.label}
          </span>
          {item.trailing ? (
            <span className="inline-flex shrink-0 items-center justify-center">
              {item.trailing}
            </span>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <div className={cn('min-w-0 overflow-x-auto scrollbar-hidden', className)} {...props}>
      <div className="inline-flex min-w-max items-center gap-1 rounded-full bg-bg-secondary/25 p-1 backdrop-blur-xl">
        {items.map((item) => {
          const active = item.value === value
          return (
            <button
              key={item.value}
              type="button"
              disabled={item.disabled}
              onClick={() => onValueChange(item.value)}
              className={pillSegmentedItemClassName({ active, size, variant })}
            >
              {item.icon ? (
                <span className="inline-flex shrink-0 items-center justify-center">
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 truncate">{item.label}</span>
              {item.trailing ? (
                <span className="inline-flex shrink-0 items-center justify-center">
                  {item.trailing}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
