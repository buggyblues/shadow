import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

type ButtonVariant = 'primary' | 'action' | 'secondary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variantClasses: Record<ButtonVariant, string> = {
  action: 'bg-olive text-white shadow-[0_12px_28px_rgba(49,92,80,0.2)] hover:bg-[#264d43]',
  primary: 'bg-coral text-white shadow-[0_12px_28px_rgba(230,102,76,0.22)] hover:bg-[#d8563e]',
  secondary: 'bg-white/92 text-olive shadow-[0_6px_18px_rgba(34,55,48,0.075)] hover:bg-sage',
  outline:
    'border border-line/80 bg-white/90 text-ink shadow-[0_6px_16px_rgba(34,55,48,0.06)] hover:bg-sage',
  ghost: 'text-ink hover:bg-sage',
  danger: 'text-coral hover:bg-coral/10',
}

const sizeClasses: Record<ButtonSize, string> = {
  icon: 'size-10 px-0',
  lg: 'h-12 px-4 text-[13px]',
  md: 'h-10 px-3 text-[12px]',
  sm: 'h-9 px-3 text-[12px]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses[size],
        variantClasses[variant],
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

interface FloatingActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  label: ReactNode
}

export function FloatingActionButton({
  className,
  icon,
  label,
  ...props
}: FloatingActionButtonProps) {
  return (
    <Button
      className={cn(
        'fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[5500] h-11 rounded-full px-4 font-extrabold text-[12px] shadow-[0_16px_38px_rgba(49,92,80,0.24)] max-[419px]:size-11 max-[419px]:px-0 xl:right-6 xl:bottom-6',
        className,
      )}
      icon={icon}
      variant="action"
      {...props}
    >
      <span className="max-[419px]:sr-only">{label}</span>
    </Button>
  )
}
