import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'

type EmptyStateSize = 'compact' | 'page' | 'section'
type EmptyStateVariant = 'embedded' | 'surface'

interface EmptyStateProps {
  action?: ReactNode
  children?: ReactNode
  className?: string
  description?: ReactNode
  eyebrow?: ReactNode
  icon?: ReactNode
  secondaryAction?: ReactNode
  size?: EmptyStateSize
  title?: ReactNode
  variant?: EmptyStateVariant
}

const layoutClasses: Record<EmptyStateSize, string> = {
  compact: 'min-h-32 gap-2.5 px-4 py-5',
  page: 'min-h-56 gap-3.5 px-5 py-9 sm:px-8 sm:py-10',
  section: 'min-h-44 gap-3 px-5 py-7 sm:px-7 sm:py-8',
}

const iconClasses: Record<EmptyStateSize, string> = {
  compact: 'size-9 rounded-[13px]',
  page: 'size-12 rounded-[16px]',
  section: 'size-11 rounded-[15px]',
}

export function EmptyState({
  action,
  children,
  className,
  description,
  eyebrow,
  icon,
  secondaryAction,
  size = 'section',
  title,
  variant = 'surface',
}: EmptyStateProps) {
  const body = description ?? children
  return (
    <section
      className={cn(
        'relative isolate grid w-full place-items-center overflow-hidden text-center',
        variant === 'surface' &&
          'rounded-[var(--radius-panel)] border border-sage/75 bg-[linear-gradient(145deg,rgba(239,244,237,0.92),rgba(255,255,255,0.96))] shadow-[0_10px_30px_rgba(34,55,48,0.045)]',
        layoutClasses[size],
        className,
      )}
    >
      {variant === 'surface' ? (
        <>
          <span
            aria-hidden="true"
            className="absolute -top-12 -right-10 -z-10 size-32 rounded-full border-[18px] border-white/55 bg-sage/35"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-16 -left-8 -z-10 size-28 rounded-full border border-olive/8"
          />
        </>
      ) : null}
      {icon ? (
        <span
          className={cn(
            'grid place-items-center bg-white text-olive shadow-[0_8px_24px_rgba(34,55,48,0.09)] ring-1 ring-olive/8',
            iconClasses[size],
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className={cn('grid max-w-[420px]', size === 'compact' ? 'gap-0.5' : 'gap-1')}>
        {eyebrow ? (
          <span className="font-extrabold text-[9px] text-olive uppercase tracking-[0.08em]">
            {eyebrow}
          </span>
        ) : null}
        {title ? (
          <strong
            className={cn(
              'text-ink',
              size === 'compact'
                ? 'text-[13px] leading-4'
                : size === 'page'
                  ? 'text-[16px] leading-6'
                  : 'text-[15px] leading-5',
            )}
          >
            {title}
          </strong>
        ) : null}
        {body ? (
          <span
            className={cn(
              'text-muted',
              size === 'compact' ? 'text-[11px] leading-4' : 'text-[12px] leading-5',
            )}
          >
            {body}
          </span>
        ) : null}
      </span>
      {action || secondaryAction ? (
        <span
          className={cn(
            'flex max-w-full flex-wrap items-center justify-center gap-2',
            size !== 'compact' && 'pt-0.5',
          )}
        >
          {action}
          {secondaryAction}
        </span>
      ) : null}
    </section>
  )
}
