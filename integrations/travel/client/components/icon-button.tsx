import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  active?: boolean
}

export function IconButton({ label, children, active, className, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-[13px] bg-white/92 text-ink shadow-[0_6px_18px_rgba(34,55,48,0.07)] transition hover:bg-sage',
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
