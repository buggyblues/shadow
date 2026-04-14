import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Heart,
  Layers,
  Package,
  Rocket,
  Search,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { EmptyState } from '@/components/EmptyState'
import { SearchInput } from '@/components/SearchInput'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type Template } from '@/lib/api'
import {
  CATEGORIES,
  getCategoryColor,
  getDifficultyColor,
  getTemplateMeta,
  type StoreCategory,
} from '@/lib/store-data'
import { cn, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ template }: { template: Template }) {
  const meta = getTemplateMeta(template.name)
  const isFavorite = useAppStore((s) => s.favorites.includes(template.name))
  const toggleFavorite = useAppStore((s) => s.toggleFavorite)

  return (
    <div className="group bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all hover:shadow-lg hover:shadow-blue-900/5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <Link
              to="/store/$name"
              params={{ name: template.name }}
              className="font-semibold text-sm text-white hover:text-blue-400 transition-colors"
            >
              {template.name}
            </Link>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="default" size="sm" className={getCategoryColor(meta.category)}>
                {meta.category}
              </Badge>
              <Badge variant="default" size="sm" className={getDifficultyColor(meta.difficulty)}>
                {meta.difficulty}
              </Badge>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleFavorite(template.name)}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            isFavorite
              ? 'text-red-400 hover:text-red-300'
              : 'text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100',
          )}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 leading-relaxed line-clamp-2 mb-3">
        {template.description}
      </p>

      {/* Features preview */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {meta.features.slice(0, 3).map((f) => (
          <span key={f} className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {f}
          </span>
        ))}
        {meta.features.length > 3 && (
          <span className="text-[10px] text-gray-600">+{meta.features.length - 3} more</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users size={12} />
            {template.agentCount} {pluralize(template.agentCount, 'agent')}
          </span>
          <span className="flex items-center gap-1">
            <Star size={12} className="text-yellow-500" />
            {meta.popularity}
          </span>
          <span className="text-gray-600">{meta.estimatedDeployTime}</span>
        </div>
        <Link
          to="/store/$name"
          params={{ name: template.name }}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          View
          <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  )
}

// ── Featured Card (larger) ────────────────────────────────────────────────────

function FeaturedCard({ template }: { template: Template }) {
  const meta = getTemplateMeta(template.name)

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-blue-950/30 border border-gray-800 rounded-xl p-6 hover:border-blue-800/50 transition-all">
      <div className="flex items-start gap-4">
        <span className="text-4xl">{meta.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/store/$name"
              params={{ name: template.name }}
              className="font-bold text-base text-white hover:text-blue-400 transition-colors"
            >
              {template.name}
            </Link>
            <Badge variant="info" size="sm" icon={<Sparkles size={10} />}>
              Featured
            </Badge>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed mb-3">{template.description}</p>

          {/* Highlights */}
          <div className="space-y-1 mb-4">
            {meta.highlights.map((h) => (
              <div key={h} className="flex items-center gap-2 text-xs text-gray-300">
                <Zap size={11} className="text-yellow-500 shrink-0" />
                {h}
              </div>
            ))}
          </div>

          {/* Stats + Action */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Users size={12} />
                {template.agentCount} agents
              </span>
              <span className="flex items-center gap-1">
                <Star size={12} className="text-yellow-500" />
                {meta.popularity}% popular
              </span>
            </div>
            <Link
              to="/store/$name/deploy"
              params={{ name: template.name }}
              className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              <Rocket size={13} />
              Deploy
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Category Card ─────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  count,
  active,
  onClick,
}: {
  category: (typeof CATEGORIES)[number]
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors whitespace-nowrap',
        active
          ? 'bg-blue-600/20 border-blue-700 text-blue-400'
          : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white',
      )}
    >
      <span>{category.emoji}</span>
      <span>{category.label}</span>
      <span
        className={cn('text-xs px-1.5 rounded-full', active ? 'bg-blue-600/30' : 'bg-gray-800')}
      >
        {count}
      </span>
    </button>
  )
}

// ── Sort Options ──────────────────────────────────────────────────────────────

type SortOption = 'popular' | 'name' | 'agents-desc' | 'agents-asc'

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'agents-desc', label: 'Most Agents' },
  { value: 'agents-asc', label: 'Fewest Agents' },
]

// ── Main Page ─────────────────────────────────────────────────────────────────

export function StorePage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<StoreCategory | 'all'>('all')
  const [sort, setSort] = useState<SortOption>('popular')
  const debouncedSearch = useDebounce(search)

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates', i18n.language],
    queryFn: () => api.templates.listByLocale(i18n.language),
  })

  // Computed values
  const totalAgents = useMemo(
    () => templates?.reduce((sum, t) => sum + t.agentCount, 0) ?? 0,
    [templates],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates?.length ?? 0 }
    for (const t of templates ?? []) {
      const cat = getTemplateMeta(t.name).category
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    return counts
  }, [templates])

  const featured = useMemo(
    () => (templates ?? []).filter((t) => getTemplateMeta(t.name).featured),
    [templates],
  )

  const filtered = useMemo(() => {
    let list = templates ?? []

    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((t) => getTemplateMeta(t.name).category === selectedCategory)
    }

    // Search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          getTemplateMeta(t.name).category.includes(q) ||
          getTemplateMeta(t.name).features.some((f) => f.toLowerCase().includes(q)),
      )
    }

    // Sort
    list = [...list].sort((a, b) => {
      const metaA = getTemplateMeta(a.name)
      const metaB = getTemplateMeta(b.name)
      switch (sort) {
        case 'popular':
          return metaB.popularity - metaA.popularity
        case 'name':
          return a.name.localeCompare(b.name)
        case 'agents-desc':
          return b.agentCount - a.agentCount
        case 'agents-asc':
          return a.agentCount - b.agentCount
        default:
          return 0
      }
    })

    return list
  }, [templates, selectedCategory, debouncedSearch, sort])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Breadcrumb items={[{ label: t('store.title') }]} className="mb-4" />

      {/* ── Hero Section ─────────────────────────────────────────── */}
      <div className="relative mb-8 bg-gradient-to-r from-blue-950/40 via-purple-950/20 to-gray-900 border border-gray-800 rounded-2xl p-8 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/5 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
            <Store size={16} />
            <span className="font-medium">{t('store.title')}</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('store.heroTitle')}</h1>
          <p className="text-gray-400 text-sm max-w-xl mb-5">{t('store.description')}</p>

          {/* Search */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('store.searchPlaceholder')}
            size="lg"
            className="max-w-lg"
          />

          {/* Stats */}
          <div className="flex items-center gap-6 mt-5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Package size={13} />
              {templates?.length ?? 0} {t('store.totalTemplates')}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              {totalAgents} {t('store.totalAgents')}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers size={13} />
              {CATEGORIES.length - 1} {t('store.totalCategories')}
            </span>
          </div>
        </div>
      </div>

      {/* ── Featured Templates ───────────────────────────────────── */}
      {!search && selectedCategory === 'all' && featured.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-yellow-500" />
            <h2 className="font-semibold">{t('store.featuredTemplates')}</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {featured.slice(0, 4).map((t) => (
              <FeaturedCard key={t.name} template={t} />
            ))}
          </div>
        </section>
      )}

      {/* ── Categories ───────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              count={categoryCounts[cat.id] ?? 0}
              active={selectedCategory === cat.id}
              onClick={() => setSelectedCategory(cat.id as StoreCategory | 'all')}
            />
          ))}
        </div>
      </section>

      {/* ── Sort Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {filtered.length} {pluralize(filtered.length, 'template')}
          {selectedCategory !== 'all' && ` in ${selectedCategory}`}
          {debouncedSearch && ` matching "${debouncedSearch}"`}
        </p>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-400 focus:outline-none focus:border-blue-500"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Template Grid ────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse"
            >
              <div className="h-5 w-24 bg-gray-800 rounded mb-3" />
              <div className="h-4 w-full bg-gray-800 rounded mb-2" />
              <div className="h-4 w-2/3 bg-gray-800 rounded mb-4" />
              <div className="h-8 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<Search size={40} />}
          title={t('store.noTemplatesFound')}
          description={
            debouncedSearch
              ? `No templates match "${debouncedSearch}". Try a different search term.`
              : t('store.noTemplatesInCategory')
          }
          action={
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setSelectedCategory('all')
              }}
              className="text-sm text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-4 py-2 transition-colors"
            >
              {t('store.clearFilters')}
            </button>
          }
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard key={t.name} template={t} />
          ))}
        </div>
      )}

      {/* ── Store Footer Info ────────────────────────────────────── */}
      <div className="mt-12 text-center text-xs text-gray-600 border-t border-gray-800 pt-6">
        <p>{t('store.allTemplatesOpenSource')}</p>
        <p className="mt-1">
          {t('store.customTemplatesNote')}{' '}
          <code className="font-mono text-gray-500">shadowob-cloud init</code>.
        </p>
      </div>
    </div>
  )
}
