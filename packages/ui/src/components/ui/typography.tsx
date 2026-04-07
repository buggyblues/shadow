import type * as React from 'react'
import { cn } from '../../lib/utils'

export function Typography({
  variant = 'body',
  children,
  className = '',
  as: Component = 'p',
}: {
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'micro'
  children: React.ReactNode
  className?: string
  as?: React.ElementType
}) {
  const variants = {
    h1: 'text-4xl md:text-6xl font-black font-sans uppercase tracking-tighter leading-none text-text-primary',
    h2: 'text-2xl md:text-4xl font-black font-sans uppercase tracking-tight leading-none text-text-primary',
    h3: 'text-xl font-black font-sans uppercase tracking-tight text-text-primary',
    body: 'text-base font-bold text-text-secondary leading-relaxed',
    small: 'text-sm font-bold text-text-muted italic',
    micro: 'text-[10px] font-black font-mono uppercase tracking-[0.2em] text-text-muted/60',
  }

  return <Component className={cn(variants[variant], className)}>{children}</Component>
}
