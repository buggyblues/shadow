import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronRight,
  Clock3,
  Heart,
  Package,
  Rocket,
  Search,
  Sparkles,
  Star,
  Store,
  TrendingUp,
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
        'inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all',
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

function HeroMetric({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon: ReactNode
}) {
  return (
    <div className="nf-stat-chip min-w-[170px]">
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--nf-text-muted)' }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-black tracking-tight" style={{ color: 'var(--nf-text-high)' }}>
        {value}
      </div>
    </div>
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
  const primaryHighlight = template.highlights[0] ?? template.overview[0] ?? template.description

  return (
    <article className="nf-card nf-bouncy group !p-6 space-y-5">
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
              className="text-lg font-black truncate hover:opacity-85 transition-opacity"
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
            <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
              {template.teamName}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toggleFavorite(template.name)}
          className={cn(
            'rounded-full border p-2 transition-colors shrink-0',
            isFavorite
              ? 'bg-red-900/20 border-red-800/60 text-red-400'
              : 'border-gray-800 text-gray-500 hover:border-red-800/50 hover:text-red-300',
          )}
          title={t('common.favorite')}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <p className="text-sm leading-7 line-clamp-2" style={{ color: 'var(--nf-text-mid)' }}>
        {template.description}
      </p>

      <div
        className="rounded-[24px] border px-4 py-3 text-sm leading-6"
        style={{
          background: 'var(--nf-bg-glass-2)',
          borderColor: 'var(--nf-border)',
          color: 'var(--nf-text-high)',
        }}
      >
        {primaryHighlight}
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
            color: 'var(--nf-text-mid)',
          }}
        >
          <Users size={11} />
          {t('store.agentCount', { count: template.agentCount })}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
            color: 'var(--nf-text-mid)',
          }}
        >
          <Clock3 size={11} />
          {template.estimatedDeployTime}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
            color: 'var(--nf-text-mid)',
          }}
        >
          <Star size={11} style={{ color: 'var(--color-nf-yellow)' }} />
          {t('store.popularPercent', { count: template.popularity })}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <Link
          to="/store/$name"
          params={{ name: template.name }}
          className="inline-flex items-center gap-1 text-sm font-semibold hover:opacity-85 transition-opacity"
          style={{ color: 'var(--nf-text-high)' }}
        >
          <span>{t('store.viewTemplate')}</span>
          <ChevronRight size={14} />
        </Link>

        <Link
          to="/store/$name/deploy"
          params={{ name: template.name }}
          className="nf-pill nf-pill-cyan text-sm"
        >
          <Rocket size={14} />
          <span>{t('store.deployTemplate')}</span>
        </Link>
      </div>
    </article>
  )
}

function SpotlightCard({
  template,
  categoryLabel,
}: {
  template: TemplateCatalogSummary
  categoryLabel: string
}) {
  const { t } = useTranslation()

  return (
    <section className="nf-card relative overflow-hidden !p-8">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(0,243,255,0.18), transparent 42%), radial-gradient(circle at 100% 0%, rgba(248,231,28,0.12), transparent 36%)',
        }}
      />

      <div className="relative space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="nf-kicker">{t('store.featuredTemplates')}</span>
          <Badge variant="default" size="sm" className={getCategoryColor(template.category)}>
            {categoryLabel}
          </Badge>
          <Badge variant="default" size="sm" className={getDifficultyColor(template.difficulty)}>
            {getDifficultyLabel(template.difficulty, t)}
          </Badge>
        </div>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-[24px] text-4xl"
                style={{
                  background: 'var(--nf-bg-glass-2)',
                  border: '1px solid var(--nf-border)',
                }}
              >
                {template.emoji}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--nf-text-muted)' }}>
                  {template.teamName}
                </p>
                <Link
                  to="/store/$name"
                  params={{ name: template.name }}
                  className="block text-3xl font-black tracking-tight hover:opacity-85 transition-opacity"
                  style={{ color: 'var(--nf-text-high)' }}
                >
                  {template.name}
                </Link>
              </div>
            </div>

            <p className="text-base leading-8" style={{ color: 'var(--nf-text-mid)' }}>
              {template.overview[0] ?? template.description}
            </p>

            <div className="flex flex-wrap gap-3">
              <HeroMetric
                label={t('store.agentCount', { count: template.agentCount })}
                value={template.agentCount}
                icon={<Users size={13} />}
              />
              <HeroMetric
                label={t('store.popularity')}
                value={`${template.popularity}%`}
                icon={<TrendingUp size={13} />}
              />
              <HeroMetric
                label={t('deploy.deployTimeLabel')}
                value={template.estimatedDeployTime}
                icon={<Clock3 size={13} />}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:justify-end">
            <Link
              to="/store/$name"
              params={{ name: template.name }}
              className="nf-soft-button text-sm"
            >
              <span>{t('store.viewTemplate')}</span>
              <ChevronRight size={14} />
            </Link>
            <Link
              to="/store/$name/deploy"
              params={{ name: template.name }}
              className="nf-pill nf-pill-cyan text-sm"
            >
              <Rocket size={14} />
              <span>{t('store.deployTemplate')}</span>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {template.highlights.slice(0, 3).map((highlight) => (
            <div
              key={highlight}
              className="rounded-[24px] border px-4 py-4 text-sm leading-6"
              style={{
                background: 'var(--nf-bg-glass-2)',
                borderColor: 'var(--nf-border)',
                color: 'var(--nf-text-high)',
              }}
            >
              {highlight}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrendingPanel({
  templates,
  categoryLabels,
}: {
  templates: TemplateCatalogSummary[]
  categoryLabels: Record<string, string>
}) {
  const { t } = useTranslation()

  return (
    <aside className="nf-card !p-6 h-full space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp size={16} style={{ color: 'var(--color-nf-yellow)' }} />
        <h2 className="text-xl font-black" style={{ color: 'var(--nf-text-high)' }}>
          {t('store.topCharts')}
        </h2>
      </div>

      <div className="space-y-3">
        {templates.map((template, index) => (
          <Link
            key={template.name}
            to="/store/$name"
            params={{ name: template.name }}
            className="block rounded-[24px] border px-4 py-4 transition-colors hover:bg-white/5"
            style={{
              background: 'var(--nf-bg-glass-2)',
              borderColor: 'var(--nf-border)',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black"
                style={{
                  background: 'var(--nf-bg-raised)',
                  color: 'var(--nf-text-high)',
                }}
              >
                {index + 1}
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl">
                {template.emoji}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-sm font-black truncate"
                      style={{ color: 'var(--nf-text-high)' }}
                    >
                      {template.name}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--nf-text-muted)' }}>
                      {categoryLabels[template.category] ?? template.category}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: 'var(--nf-text-high)' }}>
                      {template.popularity}%
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--nf-text-muted)' }}>
                      {t('store.popularity')}
                    </p>
                  </div>
                </div>

                <p
                  className="mt-2 text-xs leading-6 line-clamp-2"
                  style={{ color: 'var(--nf-text-mid)' }}
                >
                  {template.overview[0] ?? template.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  )
}

function ShelfSection({
  title,
  description,
  templates,
  categoryLabels,
  onViewAll,
}: {
  title: string
  description: string
  templates: TemplateCatalogSummary[]
  categoryLabels: Record<string, string>
  onViewAll?: () => void
}) {
  const { t } = useTranslation()

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black" style={{ color: 'var(--nf-text-high)' }}>
            {title}
          </h2>
          <p className="mt-2 text-sm leading-7" style={{ color: 'var(--nf-text-mid)' }}>
            {description}
          </p>
        </div>

        {onViewAll && (
          <button type="button" onClick={onViewAll} className="nf-soft-button text-sm">
            <span>{t('common.viewAll')}</span>
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <StoreAppCard
            key={template.name}
            template={template}
            categoryLabel={categoryLabels[template.category] ?? template.category}
          />
        ))}
      </div>
    </section>
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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length }

    for (const template of templates) {
      counts[template.category] = (counts[template.category] ?? 0) + 1
    }

    return counts
  }, [templates])

  const featured = useMemo(
    () =>
      [...templates]
        .filter((template) => template.featured)
        .sort((left, right) => right.popularity - left.popularity),
    [templates],
  )

  const leaderboard = useMemo(
    () => [...templates].sort((left, right) => right.popularity - left.popularity).slice(0, 4),
    [templates],
  )

  const recommended = useMemo(() => {
    const ranked = new Set([featured[0]?.name, ...leaderboard.map((template) => template.name)])

    return [...templates]
      .filter((template) => !ranked.has(template.name))
      .sort((left, right) => right.popularity - left.popularity)
      .slice(0, 3)
  }, [featured, leaderboard, templates])

  const categoryShelves = useMemo(() => {
    return categories
      .filter((category) => category.id !== 'all')
      .map((category) => ({
        category,
        templates: templates
          .filter((template) => template.category === category.id)
          .sort((left, right) => right.popularity - left.popularity)
          .slice(0, 3),
      }))
      .filter((section) => section.templates.length > 0)
  }, [categories, templates])

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

    return [...list].sort((left, right) => right.popularity - left.popularity)
  }, [categoryLabels, debouncedSearch, selectedCategory, templates])

  const showStorefront = !debouncedSearch && selectedCategory === 'all'

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <Breadcrumb items={[{ label: t('store.title') }]} className="mb-1" />

      <section className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="nf-card relative overflow-hidden !p-8">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 0% 0%, rgba(0,243,255,0.2), transparent 40%), radial-gradient(circle at 100% 0%, rgba(248,231,28,0.12), transparent 32%)',
            }}
          />

          <div className="relative space-y-6">
            <div className="flex items-center gap-2">
              <Store size={16} style={{ color: 'var(--color-nf-cyan)' }} />
              <span className="nf-kicker">{t('store.title')}</span>
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="nf-title">{t('store.heroTitle')}</h1>
              <p className="nf-subtitle">{t('store.description')}</p>
            </div>

            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('store.searchPlaceholder')}
              size="lg"
              className="max-w-2xl"
            />

            <div className="flex flex-wrap gap-3">
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

            <div className="flex flex-wrap gap-3">
              <HeroMetric
                label={t('store.totalTemplates')}
                value={templates.length}
                icon={<Package size={13} />}
              />
              <HeroMetric
                label={t('store.totalAgents')}
                value={totalAgents}
                icon={<Users size={13} />}
              />
              <HeroMetric
                label={t('store.featured')}
                value={featured.length}
                icon={<Sparkles size={13} />}
              />
            </div>
          </div>
        </div>

        <TrendingPanel templates={leaderboard} categoryLabels={categoryLabels} />
      </section>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="nf-card !h-[320px] !p-6 animate-pulse" />
          <div className="nf-card !h-[320px] !p-6 animate-pulse" />
        </div>
      )}

      {!isLoading && showStorefront && templates.length > 0 && (
        <div className="space-y-12">
          {featured[0] && (
            <SpotlightCard
              template={featured[0]}
              categoryLabel={categoryLabels[featured[0].category] ?? featured[0].category}
            />
          )}

          {recommended.length > 0 && (
            <ShelfSection
              title={t('store.recommended')}
              description={t('store.recommendedDescription')}
              templates={recommended}
              categoryLabels={categoryLabels}
            />
          )}

          <div className="space-y-12">
            {categoryShelves.map((section) => (
              <ShelfSection
                key={section.category.id}
                title={section.category.label}
                description={section.category.description}
                templates={section.templates}
                categoryLabels={categoryLabels}
                onViewAll={() => setSelectedCategory(section.category.id as TemplateCategoryId)}
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !showStorefront && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="nf-kicker">
                {selectedCategory === 'all'
                  ? t('store.browseByCategory')
                  : (categoryLabels[selectedCategory] ?? selectedCategory)}
              </span>
              <h2 className="mt-2 text-2xl font-black" style={{ color: 'var(--nf-text-high)' }}>
                {selectedCategory === 'all'
                  ? t('store.matchingTemplates', { count: filtered.length })
                  : (categoryLabels[selectedCategory] ?? selectedCategory)}
              </h2>
              <p className="mt-2 text-sm leading-7" style={{ color: 'var(--nf-text-mid)' }}>
                {selectedCategory !== 'all' && !debouncedSearch
                  ? `${t('store.matchingTemplates', { count: filtered.length })} · ${categoryLabels[selectedCategory] ?? selectedCategory}`
                  : debouncedSearch
                    ? `${t('store.matchingTemplates', { count: filtered.length })} · ${t('store.matchingQuery', { query: debouncedSearch })}`
                    : t('store.browseByCategory')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSearch('')
                setSelectedCategory('all')
              }}
              className="nf-soft-button text-sm"
            >
              <span>{t('store.backToDiscover')}</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search size={40} />}
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
          ) : (
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
        </section>
      )}

      <footer className="border-t pt-6 text-center" style={{ borderColor: 'var(--nf-border)' }}>
        <p className="text-xs" style={{ color: 'var(--nf-text-muted)' }}>
          {t('store.allTemplatesOpenSource')}
        </p>
        <p className="mt-2 text-xs" style={{ color: 'var(--nf-text-muted)' }}>
          {t('store.customTemplatesNote')} <code className="font-mono">shadowob-cloud init</code>
        </p>
      </footer>
    </div>
  )
}
