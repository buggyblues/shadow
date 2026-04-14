import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Clock3, Heart, Package, Rocket, Sparkles, Star, Users } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Search } from '@shadowob/ui'
import { Breadcrumb } from '@/components/Breadcrumb'
import { useDebounce } from '@/hooks/useDebounce'
import {
  api,
  type TemplateCatalogSummary,
  type TemplateCategoryId,
  type TemplateCategoryInfo,
} from '@/lib/api'
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
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      size="sm"
    >
      <span className="shrink-0">{category.emoji}</span>
      <span className="truncate">{category.label}</span>
      <span className={cn('rounded-xl px-2 py-0.5 text-[11px]', active ? 'bg-primary/15 text-primary' : 'bg-bg-tertiary/80 text-text-muted')}>
        {count}
      </span>
    </Button>
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
    <span className="inline-flex min-h-[40px] items-center gap-2.5 rounded-2xl border border-border-subtle bg-bg-secondary/70 px-3.5 py-2 text-xs font-semibold text-text-secondary whitespace-nowrap" title={label}>
      <span className="text-primary">{icon}</span>
      <span className="font-bold text-text-primary">{value}</span>
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
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-bg-primary/60 px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary" title={label}>
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
  const isFavorite = useAppStore((state) => state.favorites.includes(template.name))
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
  const summary = template.overview[0] ?? template.description

  return (
    <Card variant="glass">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-bg-primary/50 text-[28px] shadow-sm">
          {template.emoji}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to="/store/$name"
                  params={{ name: template.name }}
                  className="truncate text-[17px] font-extrabold tracking-[-0.02em] text-text-primary transition-colors hover:text-primary"
                >
                  {template.name}
                </Link>
                {template.featured && (
                  <Badge variant="info" size="sm">
                    <Sparkles size={10} />
                    {t('store.featured')}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="neutral" size="sm">
                  {categoryLabel}
                </Badge>
                <Badge variant="neutral" size="sm">
                  {getDifficultyLabel(template.difficulty, t)}
                </Badge>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => toggleFavorite(template.name)}
              variant="ghost"
              size="icon"
              style={
                isFavorite
                  ? {
                    color: '#ff8ea8',
                    borderColor: 'rgba(255, 42, 85, 0.2)',
                    background: 'rgba(255, 42, 85, 0.1)',
                  }
                  : undefined
              }
              title={t('common.favorite')}
            >
              <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
            </Button>
          </div>

          <p className="line-clamp-3 text-sm leading-6 text-text-secondary">
            {summary}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <CardMetric
          icon={<Users size={11} className="text-primary" />}
          value={template.agentCount}
          label={t('store.agentCount', { count: template.agentCount })}
        />
        <CardMetric
          icon={<Clock3 size={11} className="text-primary" />}
          value={template.estimatedDeployTime}
          label={t('deploy.deployTimeLabel')}
        />
        <CardMetric
          icon={<Star size={11} className="text-warning" />}
          value={`${template.popularity}%`}
          label={t('store.popularity')}
        />
      </div>

      <div className="mt-auto flex flex-col items-stretch gap-2 border-t border-border-subtle pt-4 sm:flex-row">
        <Button asChild variant="primary">
          <Link to="/store/$name/deploy" params={{ name: template.name }}>
            <Rocket size={14} />
            <span className="truncate">{t('store.deployTemplate')}</span>
          </Link>
        </Button>

        <Button asChild variant="secondary">
          <Link to="/store/$name" params={{ name: template.name }}>
            <span className="truncate">{t('store.viewTemplate')}</span>
            <ChevronRight size={14} />
          </Link>
        </Button>
      </div>
    </Card>
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
    <div className="mx-auto max-w-[1440px] space-y-8 px-6 py-6 md:px-8">
      <Breadcrumb items={[{ label: t('store.title') }]} className="mb-1" />

      <section className="glass-panel space-y-5 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <h1
              className="text-[30px] font-extrabold tracking-[-0.04em] text-text-primary md:text-[34px]"
            >
              {t('store.title')}
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-text-secondary md:text-[15px]">
              {t('store.description')}
            </p>
          </div>

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

        <Search
          value={search}
          onChange={setSearch}
          placeholder={t('store.searchPlaceholder')}
        />

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
          <p className="text-sm text-text-muted">
            {t('store.matchingTemplates', { count: filtered.length })}
            {selectedCategory !== 'all'
              ? ` · ${categoryLabels[selectedCategory] ?? selectedCategory}`
              : ''}
            {debouncedSearch ? ` · ${t('store.matchingQuery', { query: debouncedSearch })}` : ''}
          </p>

          {hasFilters && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch('')
                setSelectedCategory('all')
              }}
            >
              {t('store.clearFilters')}
            </Button>
          )}
        </div>
      </section>

      {isLoading && (
        <div className="glass-panel p-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`store-skeleton-${index}`}
                className="h-[248px] rounded-3xl border border-border-subtle bg-bg-secondary/60 p-5 animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="glass-panel p-6">
          <EmptyState
            icon={Package}
            title={t('store.noTemplatesFound')}
            description={
              debouncedSearch
                ? t('store.noTemplatesMatch', { query: debouncedSearch })
                : t('store.noTemplatesInCategory')
            }
            action={
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setSelectedCategory('all')
                }}
              >
                {t('store.clearFilters')}
              </Button>
            }
          />
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="glass-panel p-5 md:p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((template) => (
              <StoreAppCard
                key={template.name}
                template={template}
                categoryLabel={categoryLabels[template.category] ?? template.category}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
