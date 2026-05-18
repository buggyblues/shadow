import { cn, GlassPanel, GlassSurface } from '@shadowob/ui'
import { X } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'

type SurfaceTone = 'default' | 'quiet' | 'accent'

const surfaceToneClasses: Record<SurfaceTone, string> = {
  default: 'rounded-2xl border-border-subtle/80',
  quiet: 'rounded-2xl border-border-subtle/70',
  accent: 'rounded-2xl border-primary/25 shadow-[0_20px_54px_rgba(0,198,209,0.10)]',
}

export function CommerceSurface({
  className,
  tone = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: SurfaceTone }) {
  const Surface = tone === 'accent' ? GlassPanel : GlassSurface
  return (
    <Surface
      className={cn(surfaceToneClasses[tone], tone === 'accent' && 'bg-primary/[0.08]', className)}
      {...props}
    />
  )
}

export function CommerceDrawer({
  open,
  title,
  description,
  closeLabel,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: ReactNode
  description?: ReactNode
  closeLabel: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label={closeLabel}
        className="fixed inset-0 z-40 bg-bg-deep/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <GlassPanel
        as="aside"
        className="fixed inset-y-3 right-3 z-50 flex w-[min(520px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle/80 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-text-primary">{title}</h2>
            {description && <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-bg-tertiary/70 hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer className="shrink-0 border-t border-border-subtle/80 px-5 py-4">{footer}</footer>
        )}
      </GlassPanel>
    </>
  )
}

export function CommerceHero({
  eyebrow,
  title,
  description,
  icon,
  metrics,
  action,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  metrics?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <CommerceSurface tone="accent" className={cn('overflow-hidden px-5 py-5 sm:px-6', className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 gap-4">
          {icon && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bg-primary/70 text-primary shadow-inner">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-primary">
                {eyebrow}
              </div>
            )}
            <h1 className="truncate text-2xl font-black text-text-primary sm:text-3xl">{title}</h1>
            {description && (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{description}</p>
            )}
          </div>
        </div>
        {(metrics || action) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:justify-end">
            {metrics && <div className="flex flex-wrap gap-2">{metrics}</div>}
            {action}
          </div>
        )}
      </div>
    </CommerceSurface>
  )
}

export function CommerceMetric({
  label,
  value,
  caption,
  icon,
  className,
}: {
  label: ReactNode
  value: ReactNode
  caption?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-[116px] rounded-xl border border-border-subtle/80 bg-bg-primary/55 px-3 py-2',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-black leading-none text-text-primary tabular-nums">
        {value}
      </div>
      {caption && <div className="mt-1 text-xs font-bold text-text-muted">{caption}</div>}
    </div>
  )
}

type SegmentedOption<T extends string> = {
  value: T
  label: ReactNode
  count?: number
  icon?: ReactNode
}

export function CommerceSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: Array<SegmentedOption<T>>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border-subtle bg-bg-primary/60 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition',
              selected
                ? 'bg-primary text-bg-primary shadow-[0_8px_20px_rgba(0,198,209,0.22)]'
                : 'text-text-muted hover:bg-bg-tertiary/70 hover:text-text-primary',
            )}
          >
            {option.icon}
            <span>{option.label}</span>
            {typeof option.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                  selected ? 'bg-bg-primary/20 text-bg-primary' : 'bg-bg-tertiary text-text-muted',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

type PillTone = 'primary' | 'success' | 'warning' | 'danger' | 'muted'

const pillToneClasses: Record<PillTone, string> = {
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  muted: 'bg-bg-tertiary/70 text-text-muted',
}

export function CommercePill({
  children,
  icon,
  tone = 'muted',
  className,
}: {
  children: ReactNode
  icon?: ReactNode
  tone?: PillTone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black',
        pillToneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function CommerceEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-4 py-10 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-tertiary/70 text-text-muted">
          {icon}
        </div>
      )}
      <div className="text-base font-black text-text-primary">{title}</div>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function CommerceList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <CommerceSurface tone="quiet" className={cn('overflow-hidden p-0', className)} {...props} />
  )
}

export function CommerceListItem({
  media,
  title,
  subtitle,
  meta,
  action,
  children,
  className,
}: {
  media?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-border-subtle px-4 py-4 transition first:border-t-0 hover:bg-bg-modifier-hover/35 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        {media}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-text-primary">{title}</div>
          {subtitle && <div className="mt-1 text-sm leading-5 text-text-secondary">{subtitle}</div>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
          {children}
        </div>
      </div>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{action}</div>
      )}
    </div>
  )
}
