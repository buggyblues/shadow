import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

type PanelTone = 'default' | 'paper' | 'ghost' | 'dashed'
type PanelPadding = 'none' | 'sm' | 'md' | 'lg'

const toneClasses: Record<PanelTone, string> = {
  dashed: 'border-dashed border-line/80 bg-white/55',
  default: 'border-transparent bg-white/92 shadow-[0_10px_30px_rgba(34,55,48,0.065)]',
  ghost: 'border-transparent bg-transparent',
  paper: 'border-transparent bg-paper',
}

const paddingClasses: Record<PanelPadding, string> = {
  lg: 'p-4',
  md: 'p-3',
  none: 'p-0',
  sm: 'p-2',
}

interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'aside' | 'div' | 'header' | 'section'
  children: ReactNode
  padding?: PanelPadding
  tone?: PanelTone
}

export function Panel({
  as: Component = 'section',
  children,
  className,
  padding = 'md',
  tone = 'default',
  ...props
}: PanelProps) {
  return (
    <Component
      className={cn('rounded-[20px] border', toneClasses[tone], paddingClasses[padding], className)}
      {...props}
    >
      {children}
    </Component>
  )
}

export function Surface({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl bg-paper px-3 py-2', className)} {...props}>
      {children}
    </div>
  )
}
