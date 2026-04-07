import * as React from 'react'
import { cn } from '../../lib/utils'

export function FormField({
  label,
  error,
  hint,
  children,
  className = '',
}: {
  label?: string
  error?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  const id = React.useId()

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label
          htmlFor={id}
          className="block text-[11px] font-black uppercase text-text-muted tracking-[0.2em] ml-1"
        >
          {label}
        </label>
      )}
      <div id={label ? id : undefined}>{children}</div>
      {error ? (
        <p className="text-xs font-bold text-danger ml-1 animate-in fade-in slide-in-from-top-1">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[10px] font-bold text-text-muted ml-1 opacity-60 uppercase tracking-widest">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
