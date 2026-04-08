/**
 * Shared UI primitives for all settings tab pages.
 * Every tab imports from here so styling stays consistent.
 */
import { cn } from '@shadowob/ui'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/* ── Page wrapper with fade-in ── */
export function SettingsPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl pb-20',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ── Section header (icon + title + optional description) ── */
export function SettingsHeader({
  titleKey,
  titleFallback,
  descKey,
  descFallback,
  icon: Icon,
}: {
  titleKey: string
  titleFallback: string
  descKey?: string
  descFallback?: string
  icon?: LucideIcon
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-4">
      {Icon && (
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Icon size={20} strokeWidth={2.5} />
        </div>
      )}
      <div className="min-w-0">
        <h2 className="text-2xl font-black text-text-primary tracking-tight leading-none">
          {t(titleKey, titleFallback)}
        </h2>
        {descKey && (
          <p className="text-sm text-text-muted font-medium mt-1.5">
            {t(descKey, descFallback ?? '')}
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Glass card wrapper ── */
export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-border-subtle bg-[var(--glass-bg)] backdrop-blur-2xl p-6 shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ── Labeled group inside a card ── */
export function SettingsGroup({
  labelKey,
  labelFallback,
  children,
}: {
  labelKey?: string
  labelFallback?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      {labelKey && (
        <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
          {t(labelKey, labelFallback ?? '')}
        </span>
      )}
      {children}
    </div>
  )
}

/* ── Row inside a card (icon + label + right slot) ── */
export function SettingsRow({
  icon: Icon,
  labelKey,
  labelFallback,
  descKey,
  descFallback,
  children,
  onClick,
  active,
  className,
}: {
  icon?: LucideIcon
  labelKey: string
  labelFallback: string
  descKey?: string
  descFallback?: string
  children?: ReactNode
  onClick?: () => void
  active?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 p-4 rounded-2xl transition-all duration-300',
        onClick && 'cursor-pointer hover:bg-bg-modifier-hover',
        active && 'bg-primary/10 ring-1 ring-primary/30',
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
            active ? 'bg-primary/20 text-primary' : 'bg-bg-tertiary/50 text-text-muted',
          )}
        >
          <Icon size={20} strokeWidth={2.5} />
        </div>
      )}
      <div className="flex-1 min-w-0 text-left">
        <p className={cn('text-sm font-bold', active ? 'text-primary' : 'text-text-primary')}>
          {t(labelKey, labelFallback)}
        </p>
        {descKey && (
          <p className="text-xs text-text-muted mt-0.5">{t(descKey, descFallback ?? '')}</p>
        )}
      </div>
      {children}
    </Comp>
  )
}

/* ── Danger zone wrapper ── */
export function SettingsDanger({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4 pt-8 border-t border-danger/20">
      <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-danger/60">
        {t('settings.dangerTitle', 'Danger Zone')}
      </span>
      {children}
    </div>
  )
}
