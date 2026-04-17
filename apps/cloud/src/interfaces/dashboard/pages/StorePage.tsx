import { Badge, Button, Card, EmptyState, Search } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ChevronRight,
  Heart,
  Package,
  Rocket,
  Settings,
  Sparkles,
  Star,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { useDebounce } from '@/hooks/useDebounce'
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder'
import { api, type TemplateCatalogSummary, type TemplateCategoryId } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

function getDifficultyLabel(
  difficulty: TemplateCatalogSummary['difficulty'],
  translate: (key: string, options?: Record<string, unknown>) => string,
) {
  return translate(`store.difficulties.${difficulty}`)
}

const CATEGORY_BANNER: Record<string, { bg: string; textColor: string }> = {
  devops: {
    bg: 'bg-gradient-to-br from-blue-500/25 via-indigo-500/10 to-transparent',
    textColor: 'text-blue-500',
  },
  security: {
    bg: 'bg-gradient-to-br from-red-500/25 via-orange-500/10 to-transparent',
    textColor: 'text-red-500',
  },
  support: {
    bg: 'bg-gradient-to-br from-teal-500/25 via-cyan-500/10 to-transparent',
    textColor: 'text-teal-500',
  },
  research: {
    bg: 'bg-gradient-to-br from-purple-500/25 via-pink-500/10 to-transparent',
    textColor: 'text-purple-500',
  },
  monitoring: {
    bg: 'bg-gradient-to-br from-amber-500/25 via-yellow-500/10 to-transparent',
    textColor: 'text-amber-500',
  },
  business: {
    bg: 'bg-gradient-to-br from-green-500/25 via-emerald-500/10 to-transparent',
    textColor: 'text-green-500',
  },
  demo: {
    bg: 'bg-gradient-to-br from-fuchsia-500/25 via-violet-500/10 to-transparent',
    textColor: 'text-fuchsia-500',
  },
}
const CATEGORY_BANNER_DEFAULT = {
  bg: 'bg-gradient-to-br from-primary/20 via-bg-secondary to-transparent',
  textColor: 'text-primary',
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 select-none',
        active
          ? 'border-primary/30 bg-primary/15 text-primary'
          : 'border-border-subtle bg-transparent text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary',
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-px text-[11px] tabular-nums',
          active ? 'bg-primary/20' : 'bg-bg-tertiary/80 text-text-muted',
        )}
      >
        {count}
      </span>
    </button>
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
  const isFavorite = useAppStore((state) => state.favorites.includes(template.name))
  const toggleFavorite = useAppStore((state) => state.toggleFavorite)
  const summary = template.overview[0] ?? template.description
  const bannerStyle = CATEGORY_BANNER[template.category] ?? CATEGORY_BANNER_DEFAULT
  const bannerWords = template.name.split('-').slice(0, 3)

  return (
    <Card
      variant="surface"
      className="relative transition-shadow duration-200 hover:shadow-lg hover:shadow-primary/[0.06] hover:border-border-primary/25"
    >
      {/* Clickable banner */}
      <Link to="/store/$name" params={{ name: template.name }} className="block">
        <div
          className={cn(
            'relative h-36 overflow-hidden border-b border-border-subtle',
            bannerStyle.bg,
          )}
        >
          {/* Stacked uppercase words */}
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-0.5 px-5 overflow-hidden">
            {bannerWords.map((word, i) => (
              <span
                key={`${word}-${i}`}
                className={cn(
                  'font-black tracking-tighter leading-none select-none',
                  bannerStyle.textColor,
                )}
                style={{
                  fontSize: i === 0 ? '2.4rem' : i === 1 ? '1.6rem' : '1.05rem',
                  opacity: 1 - i * 0.22,
                }}
              >
                {word.toUpperCase()}
              </span>
            ))}
          </div>
          {/* Bottom fade for depth */}
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          {/* Featured badge */}
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

      {/* Favorite — outside the link, overlays banner corner */}
      <button
        type="button"
        onClick={() => toggleFavorite(template.name)}
        className={cn(
          'absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200',
          isFavorite
            ? 'border-pink-500/20 bg-pink-500/10 text-pink-400'
            : 'border-border-subtle bg-bg-secondary/80 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover',
        )}
        title={t('common.favorite')}
      >
        <Heart size={13} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="neutral" size="sm">
            {categoryLabel}
          </Badge>
          <Badge variant="neutral" size="sm">
            {getDifficultyLabel(template.difficulty, t)}
          </Badge>
        </div>

        <Link
          to="/store/$name"
          params={{ name: template.name }}
          className="line-clamp-1 text-[15px] font-extrabold tracking-[-0.02em] text-text-primary transition-colors hover:text-primary"
        >
          {template.name}
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
    </Card>
  )
}

export function StorePage() {
  const { t, i18n } = useTranslation()
  const openSettings = useAppStore((state) => state.openSettings)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategoryId | 'all'>('all')
  const [selectedDifficulty, setSelectedDifficulty] = useState<
    TemplateCatalogSummary['difficulty'] | 'all'
  >('all')
  const debouncedSearch = useDebounce(search)

  // Use community catalog (with local fallback built into the backend)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-catalog', i18n.language],
    queryFn: () => api.community.catalog(i18n.language),
  })

  const typewriterPlaceholder = useTypewriterPlaceholder(
    t('store.typewriterPhrases', { returnObjects: true }) as string[],
  )

  const templates = data?.templates ?? []
  const categories = data?.categories ?? []
  const isCommunitySource = data?.source === 'community'
  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.id, category.label])) as Record<
        string,
        string
      >,
    [categories],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length }

    for (const template of templates) {
      counts[template.category] = (counts[template.category] ?? 0) + 1
    }

    return counts
  }, [templates])

  const difficultyCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length }

    for (const template of templates) {
      counts[template.difficulty] = (counts[template.difficulty] ?? 0) + 1
    }

    return counts
  }, [templates])

  const filtered = useMemo(() => {
    let list = templates

    if (selectedDifficulty !== 'all') {
      list = list.filter((template) => template.difficulty === selectedDifficulty)
    }

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
  }, [categoryLabels, debouncedSearch, selectedCategory, selectedDifficulty, templates])

  const hasFilters =
    selectedCategory !== 'all' || selectedDifficulty !== 'all' || Boolean(search.trim())

  return (
    <PageShell
      breadcrumb={[{ label: t('store.title') }]}
      title={t('store.title')}
      description={t('store.description')}
      headerContent={
        <div className="flex items-center gap-2">
          <Search
            value={search}
            onChange={setSearch}
            placeholder={typewriterPlaceholder || t('store.searchPlaceholder')}
          />
          {/* Community source indicator */}
          <div
            className={cn(
              'hidden sm:flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium',
              isCommunitySource
                ? 'border-primary/20 bg-primary/8 text-primary'
                : 'border-border-subtle bg-bg-secondary text-text-muted',
            )}
            title={isCommunitySource ? t('store.communitySource') : t('store.localSource')}
          >
            {isCommunitySource ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span className="whitespace-nowrap">
              {isCommunitySource ? t('store.communitySource') : t('store.localSource')}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex"
            onClick={() => openSettings('community')}
          >
            <Settings size={13} />
          </Button>
        </div>
      }
      bodyClassName="space-y-4"
    >
      {/* Error — community unreachable (shouldn't happen since we fall back, but just in case) */}
      {isError && (
        <div className="glass-card flex items-center gap-3 px-5 py-4 text-sm">
          <AlertCircle size={16} className="shrink-0 text-warning" />
          <span className="text-text-secondary">{t('store.communityUnavailable')}</span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => openSettings('community')}
          >
            <Settings size={12} className="mr-1" />
            {t('community.configure')}
          </Button>
        </div>
      )}
      {/* Filter strip — colocated with cards */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((diff) => (
            <FilterPill
              key={diff}
              label={diff === 'all' ? t('store.categories.all') : getDifficultyLabel(diff, t)}
              count={difficultyCounts[diff] ?? 0}
              active={selectedDifficulty === diff}
              onClick={() => setSelectedDifficulty(diff)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <FilterPill
              key={category.id}
              label={category.label}
              count={categoryCounts[category.id] ?? 0}
              active={selectedCategory === category.id}
              onClick={() => setSelectedCategory(category.id as TemplateCategoryId | 'all')}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            {t('store.matchingTemplates', { count: filtered.length })}
            {selectedDifficulty !== 'all' ? ` · ${getDifficultyLabel(selectedDifficulty, t)}` : ''}
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
                setSelectedDifficulty('all')
              }}
            >
              {t('store.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`store-skeleton-${index}`}
              className="h-[248px] rounded-3xl border border-border-subtle bg-bg-secondary/60 animate-pulse"
            />
          ))}
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
                  setSelectedDifficulty('all')
                }}
              >
                {t('store.clearFilters')}
              </Button>
            }
          />
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
