import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
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
import { useMemo, useState } from 'react'
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
        background: active ? 'var(--nf-sidebar-active)' : 'var(--nf-bg-surface)',
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

  return (
    <div className="nf-card nf-bouncy group !p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="text-3xl shrink-0">{template.emoji}</div>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/store/$name"
                params={{ name: template.name }}
                className="text-base font-black truncate hover:opacity-85 transition-opacity"
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
              <Badge
                variant="default"
                size="sm"
                className={getDifficultyColor(template.difficulty)}
              >
                {getDifficultyLabel(template.difficulty, t)}
              </Badge>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toggleFavorite(template.name)}
          className={cn(
            'p-2 rounded-full border transition-colors shrink-0',
            isFavorite
              ? 'text-red-400 border-red-800/60 bg-red-900/20'
              : 'text-gray-500 border-gray-800 hover:text-red-300 hover:border-red-800/50',
          )}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <p className="text-sm leading-6 line-clamp-2" style={{ color: 'var(--nf-text-mid)' }}>
        {template.description}
      </p>

      <div className="flex flex-wrap gap-2">
        {template.highlights.slice(0, 2).map((highlight) => (
          <span
            key={highlight}
            className="px-3 py-1 rounded-full text-[11px] border"
            style={{
              background: 'var(--nf-bg-raised)',
              borderColor: 'var(--nf-border)',
              color: 'var(--nf-text-mid)',
            }}
          >
            {highlight}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--nf-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <Users size={12} />
            {t('store.agentCount', { count: template.agentCount })}
          </span>
          <span className="flex items-center gap-1.5">
            <Star size={12} style={{ color: 'var(--color-nf-yellow)' }} />
            {t('store.popularPercent', { count: template.popularity })}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to="/store/$name" params={{ name: template.name }} className="nf-pill text-sm">
            <span>{t('store.viewTemplate')}</span>
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
    </div>
  )
}

function SpotlightCard({ template }: { template: TemplateCatalogSummary }) {
  const { t } = useTranslation()

  return (
    <div className="nf-card relative overflow-hidden !p-6 h-full">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, rgba(0,243,255,0.16), transparent 40%), radial-gradient(circle at 100% 0%, rgba(124,77,255,0.12), transparent 38%)',
        }}
      />

      <div className="relative h-full flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="text-5xl shrink-0">{template.emoji}</div>
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="info" size="sm" icon={<Sparkles size={10} />}>
                {t('store.featuredTemplates')}
              </Badge>
              <Badge
                variant="default"
                size="sm"
                className={getDifficultyColor(template.difficulty)}
              >
                {getDifficultyLabel(template.difficulty, t)}
              </Badge>
            </div>

            <Link
              to="/store/$name"
              params={{ name: template.name }}
              className="block text-2xl font-black hover:opacity-85 transition-opacity"
              style={{ color: 'var(--nf-text-high)' }}
            >
              {template.name}
            </Link>

            <p className="text-sm leading-7 max-w-2xl" style={{ color: 'var(--nf-text-mid)' }}>
              {template.overview[0] ?? template.description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {template.highlights.slice(0, 4).map((highlight) => (
            <div
              key={highlight}
              className="rounded-2xl px-4 py-3 text-sm border"
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

        <div className="flex items-center justify-between gap-4 flex-wrap pt-2 mt-auto">
          <div
            className="flex items-center gap-4 text-xs"
            style={{ color: 'var(--nf-text-muted)' }}
          >
            <span className="flex items-center gap-1.5">
              <Users size={12} />
              {t('store.agentCount', { count: template.agentCount })}
            </span>
            <span className="flex items-center gap-1.5">
              <Star size={12} style={{ color: 'var(--color-nf-yellow)' }} />
              {t('store.popularPercent', { count: template.popularity })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/store/$name" params={{ name: template.name }} className="nf-pill text-sm">
              <span>{t('store.viewTemplate')}</span>
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
      </div>
    </div>
  )
}

function LeaderboardPanel({
  templates,
  categoryLabels,
}: {
  templates: TemplateCatalogSummary[]
  categoryLabels: Record<string, string>
}) {
  const { t } = useTranslation()

  return (
    <div className="nf-card !p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} style={{ color: 'var(--color-nf-yellow)' }} />
        <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
          {t('store.topCharts')}
        </h2>
      </div>

      <div className="space-y-3">
        {templates.map((template, index) => (
          <Link
            key={template.name}
            to="/store/$name"
            params={{ name: template.name }}
            className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-white/5"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0"
              style={{
                background: 'var(--nf-bg-raised)',
                color: 'var(--nf-text-high)',
              }}
            >
              {index + 1}
            </div>
            <div className="text-2xl shrink-0">{template.emoji}</div>
            <div className="min-w-0 flex-1">
              <div
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--nf-text-high)' }}
              >
                {template.name}
              </div>
              <div className="text-xs truncate" style={{ color: 'var(--nf-text-muted)' }}>
                {categoryLabels[template.category] ?? template.category}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold" style={{ color: 'var(--nf-text-high)' }}>
                {template.popularity}%
              </div>
              <div className="text-[11px]" style={{ color: 'var(--nf-text-muted)' }}>
                {t('store.popularity')}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-black" style={{ color: 'var(--nf-text-high)' }}>
            {title}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--nf-text-mid)' }}>
            {description}
          </p>
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="nf-pill text-sm">
            <span>{t('common.viewAll')}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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
    () => [...templates].sort((left, right) => right.popularity - left.popularity).slice(0, 5),
    [templates],
  )

  const recommended = useMemo(() => {
    const ranked = new Set(leaderboard.map((template) => template.name))
    return [...templates]
      .filter((template) => !ranked.has(template.name))
      .sort((left, right) => right.popularity - left.popularity)
      .slice(0, 4)
  }, [leaderboard, templates])

  const categoryShelves = useMemo(() => {
    return categories
      .filter((category) => category.id !== 'all')
      .map((category) => ({
        category,
        templates: templates
          .filter((template) => template.category === category.id)
          .sort((left, right) => right.popularity - left.popularity)
          .slice(0, 4),
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
    <div className="p-6 max-w-7xl mx-auto">
      <Breadcrumb items={[{ label: t('store.title') }]} className="mb-4" />

      <section className="nf-card relative overflow-hidden mb-8 !p-8">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 0% 0%, rgba(0,243,255,0.16), transparent 42%), radial-gradient(circle at 100% 0%, rgba(248,231,28,0.10), transparent 38%)',
          }}
        />

        <div className="relative space-y-6">
          <div
            className="flex items-center gap-2 text-sm font-bold"
            style={{ color: 'var(--color-nf-cyan)' }}
          >
            <Store size={16} />
            <span>{t('store.title')}</span>
          </div>

          <div className="space-y-3 max-w-3xl">
            <h1
              className="text-3xl font-black tracking-tight"
              style={{ color: 'var(--nf-text-high)' }}
            >
              {t('store.heroTitle')}
            </h1>
            <p className="text-sm leading-7" style={{ color: 'var(--nf-text-mid)' }}>
              {t('store.description')}
            </p>
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('store.searchPlaceholder')}
            size="lg"
            className="max-w-2xl"
          />

          <div className="flex items-center gap-3 overflow-x-auto pb-1">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="nf-glass-2 rounded-3xl p-4">
              <div
                className="flex items-center gap-2 text-xs mb-2"
                style={{ color: 'var(--nf-text-muted)' }}
              >
                <Package size={13} />
                {t('store.totalTemplates')}
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--nf-text-high)' }}>
                {templates.length}
              </div>
            </div>
            <div className="nf-glass-2 rounded-3xl p-4">
              <div
                className="flex items-center gap-2 text-xs mb-2"
                style={{ color: 'var(--nf-text-muted)' }}
              >
                <Users size={13} />
                {t('store.totalAgents')}
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--nf-text-high)' }}>
                {totalAgents}
              </div>
            </div>
            <div className="nf-glass-2 rounded-3xl p-4">
              <div
                className="flex items-center gap-2 text-xs mb-2"
                style={{ color: 'var(--nf-text-muted)' }}
              >
                <Sparkles size={13} />
                {t('store.featured')}
              </div>
              <div className="text-2xl font-black" style={{ color: 'var(--nf-text-high)' }}>
                {featured.length}
              </div>
            </div>
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr] gap-4">
          <div className="nf-card !p-6 animate-pulse h-[360px]" />
          <div className="nf-card !p-6 animate-pulse h-[360px]" />
        </div>
      )}

      {!isLoading && showStorefront && templates.length > 0 && (
        <div className="space-y-10">
          <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr] gap-4">
            {featured[0] ? <SpotlightCard template={featured[0]} /> : <div />}
            <LeaderboardPanel templates={leaderboard} categoryLabels={categoryLabels} />
          </section>

          {recommended.length > 0 && (
            <ShelfSection
              title={t('store.recommended')}
              description={t('store.recommendedDescription')}
              templates={recommended}
              categoryLabels={categoryLabels}
            />
          )}

          <div className="space-y-10">
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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-black" style={{ color: 'var(--nf-text-high)' }}>
                {selectedCategory === 'all'
                  ? t('store.matchingTemplates', { count: filtered.length })
                  : (categoryLabels[selectedCategory] ?? selectedCategory)}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--nf-text-mid)' }}>
                {selectedCategory !== 'all' && !debouncedSearch
                  ? `${categoryLabels[selectedCategory] ?? selectedCategory} · ${t('store.matchingTemplates', { count: filtered.length })}`
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
              className="nf-pill text-sm"
            >
              <span>{t('store.backToDiscover')}</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

      <footer
        className="text-center mt-12 pt-6 border-t"
        style={{ borderColor: 'var(--nf-border)' }}
      >
        <p className="text-xs" style={{ color: 'var(--nf-text-muted)' }}>
          {t('store.allTemplatesOpenSource')}
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--nf-text-muted)' }}>
          {t('store.customTemplatesNote')} <code className="font-mono">shadowob-cloud init</code>
        </p>
      </footer>
    </div>
  )
}
