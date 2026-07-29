import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  active?: boolean
  size?: 'sm' | 'md'
}

const sizeClasses = {
  md: 'size-10 rounded-[13px]',
  sm: 'size-8 rounded-[10px]',
}

export function IconButton({
  label,
  children,
  active,
  className,
  size = 'md',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center bg-white/92 text-ink shadow-[0_6px_18px_rgba(34,55,48,0.07)] transition hover:bg-sage',
        sizeClasses[size],
        active && 'bg-olive text-white hover:bg-olive',
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}
