import { Badge, Button, GlassCard } from '@shadowob/ui'
import { Link } from '@tanstack/react-router'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type TemplateCatalogSummary } from '../lib/api'
import { cn } from '../lib/utils'

const CATEGORY_BANNER: Record<string, { bg: string; textColor: string }> = {
  devops: {
    bg: 'bg-gradient-to-br from-blue-600/40 via-blue-800/20 to-transparent',
    textColor: 'text-blue-300',
  },
  security: {
    bg: 'bg-gradient-to-br from-red-600/40 via-red-800/20 to-transparent',
    textColor: 'text-red-300',
  },
  support: {
    bg: 'bg-gradient-to-br from-teal-600/40 via-teal-800/20 to-transparent',
    textColor: 'text-teal-300',
  },
  research: {
    bg: 'bg-gradient-to-br from-violet-600/40 via-violet-800/20 to-transparent',
    textColor: 'text-violet-300',
  },
  monitoring: {
    bg: 'bg-gradient-to-br from-orange-600/40 via-orange-800/20 to-transparent',
    textColor: 'text-orange-300',
  },
  business: {
    bg: 'bg-gradient-to-br from-emerald-600/40 via-emerald-800/20 to-transparent',
    textColor: 'text-emerald-300',
  },
  demo: {
    bg: 'bg-gradient-to-br from-pink-600/40 via-pink-800/20 to-transparent',
    textColor: 'text-pink-300',
  },
}

const CATEGORY_BANNER_DEFAULT = {
  bg: 'bg-gradient-to-br from-primary/40 via-primary/15 to-transparent',
  textColor: 'text-primary',
}

export function TemplateCardMetric({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value?: ReactNode
  label?: string
}) {
  const hasLabel = Boolean(label?.trim())
  const hasValue = value !== undefined && value !== null && value !== ''
  const metricTitle = label
    ? `${label} ${typeof value === 'string' || typeof value === 'number' ? `· ${value}` : ''}`.trim()
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined

  if (!hasLabel && !hasValue) return null

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-primary/60 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary"
      title={metricTitle}
    >
      {icon}
      {hasLabel ? <span>{label}</span> : null}
      {hasValue ? <span className="text-text-muted">{value}</span> : null}
    </span>
  )
}

type CardAction = {
  href: string
  label: string
  icon?: ReactNode
  variant?: 'primary' | 'secondary'
}

export function TemplateGalleryCard({
  template,
  categoryLabel,
  difficultyLabel,
  detailHref,
  title,
  summary,
  headerBadges,
  metadata,
  metrics,
  primaryAction,
  secondaryAction,
  headerActions,
}: {
  template: TemplateCatalogSummary
  categoryLabel?: string
  difficultyLabel?: string
  detailHref: string
  title: string
  summary: string
  headerBadges?: ReactNode
  metadata?: ReactNode
  metrics?: Array<{ icon: ReactNode; value?: ReactNode; label?: string }>
  primaryAction?: CardAction
  secondaryAction?: CardAction
  headerActions?: ReactNode
}) {
  const { t } = useTranslation()
  const bannerStyle = CATEGORY_BANNER[template.category] ?? CATEGORY_BANNER_DEFAULT
  const bannerWords = title.split(/[\s-]+/).slice(0, 2)

  return (
    <GlassCard className="relative overflow-hidden rounded-[18px] border border-border-subtle bg-bg-secondary/60 shadow-[0_16px_42px_rgba(0,0,0,0.14)] transition hover:border-primary/35 hover:bg-bg-secondary/72">
      <Link to={detailHref} className="block">
        <div
          className={cn(
            'relative h-36 overflow-hidden border-b border-border-subtle/70',
            bannerStyle.bg,
          )}
        >
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-0.5 px-5 overflow-hidden">
            {bannerWords.map((word, index) => (
              <span
                key={`${word}-${index}`}
                className={cn(
                  'font-black tracking-tighter leading-none select-none',
                  bannerStyle.textColor,
                )}
                style={{
                  fontSize: index === 0 ? '2rem' : index === 1 ? '1.35rem' : '0.9rem',
                  opacity: 1 - index * 0.22,
                }}
              >
                {word.toUpperCase()}
              </span>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          {template.featured && (
            <div className="absolute left-3 top-3">
              <Badge variant="info" size="sm">
                {t('store.featured')}
              </Badge>
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {categoryLabel ? (
            <Badge variant="neutral" size="sm">
              {categoryLabel}
            </Badge>
          ) : null}
          {difficultyLabel ? (
            <Badge variant="neutral" size="sm">
              {difficultyLabel}
            </Badge>
          ) : null}
          {headerBadges}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <Link
              to={detailHref}
              className="line-clamp-1 text-[15px] font-extrabold text-text-primary transition-colors hover:text-primary"
            >
              {title}
            </Link>
            {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
          </div>
          <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">{summary}</p>
        </div>

        {metadata ? <div className="text-sm text-text-muted">{metadata}</div> : null}

        {metrics && metrics.length > 0 ? (
          <div className="mt-auto flex flex-wrap items-center gap-2">
            {metrics.map((metric, index) => (
              <TemplateCardMetric
                key={`${metric.label ?? metric.value ?? 'metric'}-${index}`}
                icon={metric.icon}
                value={metric.value}
                label={metric.label}
              />
            ))}
          </div>
        ) : null}

        {(primaryAction || secondaryAction) && (
          <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
            {primaryAction ? (
              <Button
                asChild
                variant={primaryAction.variant ?? 'primary'}
                size="sm"
                className={secondaryAction ? 'w-auto sm:flex-1' : 'w-full'}
              >
                <Link to={primaryAction.href} className="inline-flex items-center gap-1.5">
                  {primaryAction.icon ? (
                    <span className="size-4 shrink-0">{primaryAction.icon}</span>
                  ) : null}
                  <span className="truncate">{primaryAction.label}</span>
                </Link>
              </Button>
            ) : null}

            {secondaryAction ? (
              <Button
                asChild
                variant={secondaryAction.variant ?? 'secondary'}
                size="sm"
                className={primaryAction ? 'w-auto' : 'w-full'}
              >
                <Link to={secondaryAction.href} className="inline-flex items-center gap-1.5">
                  {secondaryAction.icon ? (
                    <span className="size-4 shrink-0">{secondaryAction.icon}</span>
                  ) : null}
                  <span className="truncate">{secondaryAction.label}</span>
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
