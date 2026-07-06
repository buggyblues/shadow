import * as React from 'react'
import { cn } from '../../lib/utils'

type GlassVariant = 'panel' | 'surface' | 'card'

const glassStyles: Record<GlassVariant, React.CSSProperties> = {
  panel: {
    background: 'color-mix(in srgb, var(--glass-bg) 78%, transparent)',
    border: '1px solid var(--glass-line)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: 'var(--nf-shadow-card, var(--shadow-soft))',
    isolation: 'isolate',
    contain: 'paint',
  },

  surface: {
    background: 'color-mix(in srgb, var(--glass-bg) 64%, transparent)',
    border: '1px solid var(--glass-line)',
    boxShadow: 'var(--nf-shadow-soft, var(--shadow-soft))',
    contain: 'paint',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },

  card: {
    border: '1px solid var(--glass-line)',
    borderTop: '1px solid var(--glass-line-strong)',
    boxShadow: 'var(--nf-shadow-soft, var(--shadow-soft))',
    contain: 'paint',
    isolation: 'isolate',
  },
}

interface GlassProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType
  variant?: GlassVariant
}

const Glass = React.forwardRef<HTMLElement, GlassProps>(
  ({ as: Comp = 'div', className, style, variant = 'panel', ...props }, ref) => {
    return (
      <Comp
        ref={ref}
        className={cn(
          variant === 'card' ? 'relative isolate overflow-hidden rounded-[32px]' : 'rounded-3xl',
          className,
        )}
        style={{ ...glassStyles[variant], ...style }}
        {...props}
      />
    )
  },
)
Glass.displayName = 'Glass'

type GlassVariantProps = Omit<GlassProps, 'variant'>

export const GlassPanel = React.forwardRef<HTMLElement, GlassVariantProps>((props, ref) => (
  <Glass ref={ref} variant="panel" {...props} />
))
GlassPanel.displayName = 'GlassPanel'

export const GlassSurface = React.forwardRef<HTMLElement, GlassVariantProps>((props, ref) => (
  <Glass ref={ref} variant="surface" {...props} />
))
GlassSurface.displayName = 'GlassSurface'

export const GlassCard = React.forwardRef<HTMLElement, GlassVariantProps>((props, ref) => (
  <Glass ref={ref} variant="card" {...props} />
))
GlassCard.displayName = 'GlassCard'

interface GlassHeaderProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType
}

export const GlassHeader = React.forwardRef<HTMLElement, GlassHeaderProps>(
  ({ as: Comp = 'div', className, style, ...props }, ref) => (
    <Comp
      ref={ref}
      className={cn('flex h-14 items-center px-6', className)}
      style={{
        background: 'color-mix(in srgb, var(--glass-bg) 78%, transparent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--glass-line)',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    />
  ),
)
GlassHeader.displayName = 'GlassHeader'

type InputValleySurface = 'glass' | 'solid'

const inputValleyStyles: Record<InputValleySurface, React.CSSProperties> = {
  glass: {
    background: 'color-mix(in srgb, var(--glass-bg) 82%, transparent)',
    border: '2px solid var(--color-border-subtle)',
    boxShadow: 'inset 0 2px 4px color-mix(in srgb, var(--color-bg-deep) 45%, transparent)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    transition: 'all 0.3s ease',
  },
  solid: {
    background: 'var(--color-bg-primary)',
    border: '2px solid var(--color-border-subtle)',
    boxShadow: 'none',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    transition: 'all 0.3s ease',
  },
}

interface InputValleyProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType
  surface?: InputValleySurface
}

export const InputValley = React.forwardRef<HTMLElement, InputValleyProps>(
  ({ as: Comp = 'div', className, surface = 'glass', style, ...props }, ref) => (
    <Comp
      ref={ref}
      className={cn(className)}
      style={{
        ...inputValleyStyles[surface],
        ...style,
      }}
      {...props}
    />
  ),
)
InputValley.displayName = 'InputValley'
