import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/class-names.js'

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  checked: boolean
  interactive?: boolean
  size?: 'sm' | 'md'
}

function switchClasses({
  checked,
  className,
  isSmall,
}: {
  checked: boolean
  className?: string
  isSmall: boolean
}) {
  return cn(
    'rounded-full border p-0.5 transition',
    isSmall ? 'h-[18px] w-8' : 'h-7 w-12',
    checked ? 'border-olive bg-olive' : 'border-line bg-paper',
    className,
  )
}

function switchThumbClasses({ checked, isSmall }: { checked: boolean; isSmall: boolean }) {
  return cn(
    'block rounded-full bg-white shadow-sm transition',
    isSmall ? 'size-3.5' : 'size-5',
    checked && (isSmall ? 'translate-x-[14px]' : 'translate-x-5'),
  )
}

export function Switch({
  checked,
  className,
  interactive = true,
  size = 'md',
  ...props
}: SwitchProps) {
  const isSmall = size === 'sm'

  if (!interactive) {
    return (
      <span className={switchClasses({ checked, className, isSmall })}>
        <span className={switchThumbClasses({ checked, isSmall })} />
      </span>
    )
  }

  return (
    <button
      aria-checked={checked}
      className={switchClasses({ checked, className, isSmall })}
      role="switch"
      type="button"
      {...props}
    >
      <span className={switchThumbClasses({ checked, isSmall })} />
    </button>
  )
}
