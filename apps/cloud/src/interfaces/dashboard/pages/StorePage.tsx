import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Heart,
  Package,
  Rocket,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { SearchInput } from '@/components/SearchInput'
import { useDebounce } from '@/hooks/useDebounce'
import {
  api,
  type TemplateCatalogSummary,
  type TemplateCategoryId,
  type TemplateCategoryInfo,
} from '@/lib/api'
import { getCategoryColor, getDifficultyColor } from '@/lib/store-data'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

function getDifficultyLabel(
  difficulty: TemplateCatalogSummary['difficulty'],
  translate: (key: string, options?: Record<string, unknown>) => string,
) {
  return translate(`store.difficulties.${difficulty}`)
}

function CategoryPill({
  category,
  count,
  active,
  onClick,
}: {
  category: TemplateCategoryInfo
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all',
        active ? 'nf-glow' : 'hover:-translate-y-0.5',
      )}
      style={{
        background: active ? 'var(--nf-sidebar-active)' : 'var(--nf-bg-glass-2)',
        borderColor: active ? 'rgba(0, 243, 255, 0.25)' : 'var(--nf-border)',
        color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-mid)',
      }}
    >
      <span>{category.emoji}</span>
      <span>{category.label}</span>
      <span
        className="rounded-full px-2 py-0.5 text-[11px]"
        style={{
          background: active ? 'rgba(0, 243, 255, 0.12)' : 'var(--nf-bg-raised)',
          color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-muted)',
        }}
      >
        {count}
      </span>
    </button>
  )
}

function InlineMetric({
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
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
      style={{
        background: 'var(--nf-bg-glass-2)',
        borderColor: 'var(--nf-border)',
        color: 'var(--nf-text-mid)',
      }}
      title={label}
    >
      <span style={{ color: 'var(--color-nf-cyan)' }}>{icon}</span>
      <span style={{ color: 'var(--nf-text-high)' }}>{value}</span>
    </span>
  )
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
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: 'var(--nf-bg-raised)',
        borderColor: 'var(--nf-border)',
        color: 'var(--nf-text-mid)',
      }}
      title={label}
    >
      {icon}
      <span>{value}</span>
    </span>
  )
}

function StoreCardDetails({ template }: { template: TemplateCatalogSummary }) {
  const { t } = useTranslation()
  const details = [...template.highlights.slice(0, 2), ...template.features.slice(0, 4)]

  if (details.length === 0) return null

  return (
    <details
      className="rounded-[20px] border"
      style={{
        background: 'var(--nf-bg-glass-2)',
        borderColor: 'var(--nf-border)',
      }}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold"
        style={{ color: 'var(--nf-text-mid)' }}
      >
        <span>{t('common.details')}</span>
        <ChevronDown size={14} />
      </summary>
      <div className="flex flex-wrap gap-2 px-3 pb-3 pt-0">
        {details.map((item) => (
          <span
            key={item}
            className="rounded-full border px-2.5 py-1 text-[11px]"
            style={{
              background: 'var(--nf-bg-raised)',
              borderColor: 'var(--nf-border)',
              color: 'var(--nf-text-mid)',
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </details>
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
  const isFavorite = useAppStore((state) => state.favorites.includes(template.name))
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
  const summary = template.overview[0] ?? template.description

  return (
    <article className="nf-card nf-bouncy group !p-5 space-y-4">
      <div className="flex items-start gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border text-3xl"
          style={{
            background: 'var(--nf-bg-glass-2)',
            borderColor: 'var(--nf-border)',
          }}
        >
          {template.emoji}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/store/$name"
              params={{ name: template.name }}
              className="truncate text-base font-black transition-opacity hover:opacity-85"
              style={{ color: 'var(--nf-text-high)' }}
            >
              {template.name}
            </Link>
            {template.featured && (
              <Badge variant="info" size="sm" icon={<Sparkles size={10} />}>
                {t('store.featured')}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default" size="sm" className={getCategoryColor(template.category)}>
              {categoryLabel}
            </Badge>
            <Badge variant="default" size="sm" className={getDifficultyColor(template.difficulty)}>
              {getDifficultyLabel(template.difficulty, t)}
            </Badge>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toggleFavorite(template.name)}
          className={cn(
            'shrink-0 rounded-full border p-2 transition-colors',
            isFavorite
              ? 'border-red-800/60 bg-red-900/20 text-red-400'
              : 'border-gray-800 text-gray-500 hover:border-red-800/50 hover:text-red-300',
          )}
          title={t('common.favorite')}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <p className="line-clamp-2 text-sm leading-6" style={{ color: 'var(--nf-text-mid)' }}>
        {summary}
      </p>

      <div className="flex flex-wrap gap-2">
        <CardMetric
          icon={<Users size={11} style={{ color: 'var(--color-nf-cyan)' }} />}
          value={template.agentCount}
          label={t('store.agentCount', { count: template.agentCount })}
        />
        <CardMetric
          icon={<Clock3 size={11} style={{ color: 'var(--color-nf-cyan)' }} />}
          value={template.estimatedDeployTime}
          label={t('deploy.deployTimeLabel')}
        />
        <CardMetric
          icon={<Star size={11} style={{ color: 'var(--color-nf-yellow)' }} />}
          value={`${template.popularity}%`}
          label={t('store.popularity')}
        />
      </div>

      <StoreCardDetails template={template} />

      <div className="flex items-center gap-2">
        <Link
          to="/store/$name/deploy"
          params={{ name: template.name }}
          className="nf-pill nf-pill-cyan flex-1 justify-center text-sm"
        >
          <Rocket size={14} />
          <span>{t('store.deployTemplate')}</span>
        </Link>

        <Link to="/store/$name" params={{ name: template.name }} className="nf-soft-button text-sm">
          <span>{t('store.viewTemplate')}</span>
          <ChevronRight size={14} />
        </Link>
      </div>
    </article>
  )
}

export function StorePage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategoryId | 'all'>('all')
  const debouncedSearch = useDebounce(search)

  const { data, isLoading } = useQuery({
    queryKey: ['template-catalog', i18n.language],
    queryFn: () => api.templates.catalog(i18n.language),
  })

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

  const totalAgents = useMemo(
    () => templates.reduce((sum, template) => sum + template.agentCount, 0),
    [templates],
  )

  const featuredCount = useMemo(
    () => templates.filter((template) => template.featured).length,
    [templates],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length }

    for (const template of templates) {
      counts[template.category] = (counts[template.category] ?? 0) + 1
    }

    return counts
  }, [templates])

  const filtered = useMemo(() => {
    let list = templates

    if (selectedCategory !== 'all') {
      list = list.filter((template) => template.category === selectedCategory)
    }

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase()
      list = list.filter((template) => {
        const categoryLabel = categoryLabels[template.category] ?? template.category

        return (
          template.name.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query) ||
          template.teamName.toLowerCase().includes(query) ||
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
        left.name.localeCompare(right.name),
    )
  }, [categoryLabels, debouncedSearch, selectedCategory, templates])

  const hasFilters = selectedCategory !== 'all' || Boolean(search.trim())

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <Breadcrumb items={[{ label: t('store.title') }]} className="mb-1" />

      <section className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('store.searchPlaceholder')}
            size="lg"
            className="w-full xl:max-w-2xl"
          />

          <div className="flex flex-wrap gap-2">
            <InlineMetric
              icon={<Package size={13} />}
              value={templates.length}
              label={t('store.totalTemplates')}
            />
            <InlineMetric
              icon={<Users size={13} />}
              value={totalAgents}
              label={t('store.totalAgents')}
            />
            <InlineMetric
              icon={<Sparkles size={13} />}
              value={featuredCount}
              label={t('store.featured')}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <CategoryPill
              key={category.id}
              category={category}
              count={categoryCounts[category.id] ?? 0}
              active={selectedCategory === category.id}
              onClick={() => setSelectedCategory(category.id as TemplateCategoryId | 'all')}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: 'var(--nf-text-muted)' }}>
            {t('store.matchingTemplates', { count: filtered.length })}
            {selectedCategory !== 'all'
              ? ` · ${categoryLabels[selectedCategory] ?? selectedCategory}`
              : ''}
            {debouncedSearch ? ` · ${t('store.matchingQuery', { query: debouncedSearch })}` : ''}
          </p>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setSelectedCategory('all')
              }}
              className="nf-soft-button text-sm"
            >
              {t('store.clearFilters')}
            </button>
          )}
        </div>
      </section>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`store-skeleton-${index}`}
              className="nf-card !h-[280px] !p-5 animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<Package size={40} />}
          title={t('store.noTemplatesFound')}
          description={
            debouncedSearch
              ? t('store.noTemplatesMatch', { query: debouncedSearch })
              : t('store.noTemplatesInCategory')
          }
          action={
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setSelectedCategory('all')
              }}
              className="nf-pill nf-pill-cyan text-sm"
            >
              {t('store.clearFilters')}
            </button>
          }
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((template) => (
            <StoreAppCard
              key={template.name}
              template={template}
              categoryLabel={categoryLabels[template.category] ?? template.category}
            />
          ))}
        </div>
      )}
    </div>
  )
}
