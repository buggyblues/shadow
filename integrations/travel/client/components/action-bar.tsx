import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

interface ActionBarProps {
  children: ReactNode
  className?: string
  columns?: 1 | 2 | 3
}

const columnClasses: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
}

export function ActionBar({ children, className, columns = 2 }: ActionBarProps) {
  return <div className={cn('grid gap-3', columnClasses[columns], className)}>{children}</div>
}
