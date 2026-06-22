import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type CloudTemplateSource,
  DiscoverIcons,
  DiscoverListScreen,
  DiscoverRow,
  DiscoverSection,
  formatCompact,
  getTemplateMeta,
  sortCloudTemplates,
  useDiscoverActions,
  useDiscoverSearch,
} from '../../../src/features/discover/list-pages'
import { fetchApi } from '../../../src/lib/api'

export default function DiscoverCloudScreen() {
  const { t, i18n } = useTranslation()
  const search = useDiscoverSearch()
  const actions = useDiscoverActions()

  const templatesQuery = useQuery({
    queryKey: ['discover-cloud-templates', i18n.language, search.effectiveQuery],
    queryFn: () =>
      fetchApi<CloudTemplateSource[]>(
        `/api/cloud-saas/templates?locale=${encodeURIComponent(i18n.language)}${
          search.effectiveQuery ? `&q=${encodeURIComponent(search.effectiveQuery)}` : ''
        }`,
      ),
    retry: false,
  })

  const templates = useMemo(
    () => sortCloudTemplates(templatesQuery.data ?? []),
    [templatesQuery.data],
  )
  const rows = search.effectiveQuery ? templates : templates

  return (
    <DiscoverListScreen
      title={t('discover.views.cloud')}
      search={search}
      loading={templatesQuery.isLoading}
      empty={
        rows.length === 0
          ? {
              icon: DiscoverIcons.Cloud,
              title: search.effectiveQuery
                ? t('discover.noSearchResults')
                : t('discover.emptyLane.cloud'),
              description: search.effectiveQuery
                ? t('discover.noSearchResultsDesc')
                : t('discover.laneDescriptions.cloud'),
            }
          : undefined
      }
    >
      <DiscoverSection
        title={t('discover.lanes.cloud')}
        description={t('discover.laneDescriptions.cloud')}
        empty={t('discover.emptyLane.cloud')}
      >
        {!search.effectiveQuery ? (
          <DiscoverRow
            title={t('discover.cashbackTitle')}
            meta={t('discover.cashbackBadge')}
            description={t('discover.cashbackDesc')}
            icon={DiscoverIcons.Coins}
            badge={t('discover.cashbackBadge')}
            actionLabel={t('discover.cashbackAction')}
            onPress={actions.openCloudCashback}
          />
        ) : null}
        {rows.map((template) => {
          const meta = getTemplateMeta(template)
          return (
            <DiscoverRow
              key={template.slug || template.name}
              title={template.name || template.slug}
              meta={template.category ?? t('discover.sections.cloud')}
              description={template.description || t('discover.cloudTemplateFallback')}
              icon={DiscoverIcons.Cloud}
              badge={t('discover.templateCashbackHint')}
              chips={(template.tags ?? []).slice(0, 3)}
              facts={[
                {
                  icon: DiscoverIcons.Users,
                  label: t('discover.cloudMetricAgents'),
                  value: String(meta.agentCount),
                },
                {
                  icon: DiscoverIcons.Sparkles,
                  label: t('discover.cloudMetricPopularity'),
                  value: formatCompact(template.deployCount ?? 0),
                },
              ]}
              actionLabel={t('discover.cloudTemplateAction')}
              onPress={() => actions.openCloudTemplate(template)}
            />
          )
        })}
      </DiscoverSection>
    </DiscoverListScreen>
  )
}
