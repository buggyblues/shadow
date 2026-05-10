import { Button, GlassCard, Search } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ChevronRight, Package, Rocket, Star, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { PageShell } from '@/components/PageShell'
import { TemplateGalleryCard } from '@/components/TemplateGalleryCard'
import { useDebounce } from '@/hooks/useDebounce'
import { useTypewriterPlaceholder } from '@/hooks/useTypewriterPlaceholder'
import { useApiClient } from '@/lib/api-context'

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
      description={undefined}
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
        <DashboardEmptyState
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
            <TemplateGalleryCard
              key={template.name}
              template={template}
              categoryLabel={categoryLabels[template.category] ?? template.category}
              difficultyLabel={t(`store.difficulties.${template.difficulty}`)}
              title={template.title || template.name}
              summary={template.description || template.overview[0]}
              detailHref={`/store/${encodeURIComponent(template.name)}`}
              primaryAction={{
                href: `/store/${encodeURIComponent(template.name)}/deploy`,
                label: t('store.deployTemplate'),
                icon: <Rocket size={14} />,
                variant: 'primary',
              }}
              secondaryAction={{
                href: `/store/${encodeURIComponent(template.name)}`,
                label: t('store.viewTemplate'),
                icon: <ChevronRight size={14} />,
                variant: 'secondary',
              }}
              metrics={[
                {
                  icon: <Users size={11} className="text-primary" />,
                  value: template.agentCount,
                  label: t('store.agentCount', { count: template.agentCount }),
                },
                {
                  icon: <Star size={11} className="text-warning" />,
                  value: `${template.popularity}%`,
                  label: t('store.popularity'),
                },
              ]}
            />
          ))}
        </div>
      )}
    </PageShell>
  )
}
