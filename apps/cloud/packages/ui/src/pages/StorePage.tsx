import { Badge, Button, EmptyState, GlassCard, Search } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertCircle, ChevronRight, Package, Rocket, Sparkles, Star, Users } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { useDebounce } from '@/hooks/useDebounce'
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder'
import { type TemplateCatalogSummary } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { cn } from '@/lib/utils'

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

function CardMetric({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: string | number
  label: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-primary/60 px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary"
      title={label}
    >
      {icon}
      <span>{value}</span>
    </span>
  )
}

function StoreAppCard({
  template,
  categoryLabel,
}: {
  template: TemplateCatalogSummary
  categoryLabel: string
}) {
  const { t } = useTranslation()
  const displayTitle = template.title || template.name
  const summary = template.description || template.overview[0]
  const bannerStyle = CATEGORY_BANNER[template.category] ?? CATEGORY_BANNER_DEFAULT
  const bannerWords = template.name.split('-').slice(0, 1)

  return (
    <GlassCard className="relative overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:shadow-primary/[0.08] hover:border-border-primary/25 bg-bg-tertiary/60">
      {/* Clickable banner */}
      <Link to="/store/$name" params={{ name: template.name }} className="block">
        <div
          className={cn(
            'relative h-32 overflow-hidden border-b border-border-subtle',
            bannerStyle.bg,
          )}
        >
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-0.5 px-5 overflow-hidden">
            {bannerWords.map((word, i) => (
              <span
                key={`${word}-${i}`}
                className={cn(
                  'font-black tracking-tighter leading-none select-none',
                  bannerStyle.textColor,
                )}
                style={{
                  fontSize: i === 0 ? '2rem' : i === 1 ? '1.35rem' : '0.9rem',
                  opacity: 1 - i * 0.22,
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
                <Sparkles size={10} />
                {t('store.featured')}
              </Badge>
            </div>
          )}
        </div>
      </Link>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="neutral" size="sm">
            {categoryLabel}
          </Badge>
          <Badge variant="neutral" size="sm">
            {t(`store.difficulties.${template.difficulty}`)}
          </Badge>
        </div>

        <Link
          to="/store/$name"
          params={{ name: template.name }}
          className="line-clamp-1 text-[15px] font-extrabold text-text-primary transition-colors hover:text-primary"
        >
          {displayTitle}
        </Link>

        <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">{summary}</p>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <CardMetric
            icon={<Users size={11} className="text-primary" />}
            value={template.agentCount}
            label={t('store.agentCount', { count: template.agentCount })}
          />
          <CardMetric
            icon={<Star size={11} className="text-warning" />}
            value={`${template.popularity}%`}
            label={t('store.popularity')}
          />
        </div>

        <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
          <Button asChild variant="primary" className="flex-1">
            <Link to="/store/$name/deploy" params={{ name: template.name }}>
              <Rocket size={14} />
              <span className="truncate">{t('store.deployTemplate')}</span>
            </Link>
          </Button>
          <Button asChild variant="secondary" size="icon">
            <Link to="/store/$name" params={{ name: template.name }}>
              <ChevronRight size={14} />
            </Link>
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

export function StorePage() {
  const { t, i18n } = useTranslation()
  const api = useApiClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-catalog', i18n.language],
    queryFn: () => api.community.catalog(i18n.language),
  })

  const typewriterPlaceholder = useTypewriterPlaceholder(
    t('store.typewriterPhrases', { returnObjects: true }) as string[],
  )

  const templates = data?.templates ?? []
  const categories = data?.categories ?? []
  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.id, category.label])) as Record<
        string,
        string
      >,
    [categories],
  )

  const filtered = useMemo(() => {
    let list = templates

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      list = list.filter((template) => {
        const categoryLabel = categoryLabels[template.category] ?? template.category

        return (
          template.name.toLowerCase().includes(query) ||
          template.title.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          categoryLabel.toLowerCase().includes(query) ||
          template.features.some((feature) => feature.toLowerCase().includes(query)) ||
          template.highlights.some((highlight) => highlight.toLowerCase().includes(query))
        )
      })
    }

    return [...list].sort(
      (left, right) =>
        Number(right.featured) - Number(left.featured) ||
        right.popularity - left.popularity ||
        left.title.localeCompare(right.title) ||
        left.name.localeCompare(right.name),
    )
  }, [categoryLabels, debouncedSearch, templates])

  return (
    <PageShell
      breadcrumb={[]}
      title={t('store.title')}
      description={t('store.description')}
      headerContent={
        <Search
          value={search}
          onChange={setSearch}
          placeholder={typewriterPlaceholder || t('store.searchPlaceholder')}
        />
      }
      bodyClassName="space-y-4"
    >
      {isError && (
        <GlassCard className="flex items-center gap-3 px-5 py-4 text-sm">
          <AlertCircle size={16} className="shrink-0 text-warning" />
          <span className="text-text-secondary">{t('store.communityUnavailable')}</span>
          <Button variant="secondary" size="sm" className="ml-auto shrink-0">
            {t('community.configure')}
          </Button>
        </GlassCard>
      )}

      {search.trim() && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            {t('store.matchingTemplates', { count: filtered.length })}
            {t('store.matchingQuery', { query: debouncedSearch })}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSearch('')}>
            {t('store.clearFilters')}
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`store-skeleton-${index}`}
              className="h-[240px] rounded-3xl border border-border-subtle bg-bg-secondary/60 animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Package}
          title={t('store.noTemplatesFound')}
          description={
            debouncedSearch
              ? t('store.noTemplatesMatch', { query: debouncedSearch })
              : t('store.noTemplatesInCategory')
          }
          action={
            <Button type="button" variant="primary" size="sm" onClick={() => setSearch('')}>
              {t('store.clearFilters')}
            </Button>
          }
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((template) => (
            <StoreAppCard
              key={template.name}
              template={template}
              categoryLabel={categoryLabels[template.category] ?? template.category}
            />
          ))}
        </div>
      )}
    </PageShell>
  )
}
