import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DiscoverIcons,
  DiscoverListScreen,
  DiscoverRow,
  DiscoverSection,
  type ServerAppDirectoryResponse,
  sortServerApps,
  useDiscoverActions,
  useDiscoverSearch,
} from '../../../src/features/discover/list-pages'
import { fetchApi } from '../../../src/lib/api'

export default function DiscoverAppsScreen() {
  const { t } = useTranslation()
  const search = useDiscoverSearch()
  const actions = useDiscoverActions()

  const appsQuery = useQuery({
    queryKey: ['discover-server-apps', search.effectiveQuery],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '72' })
      if (search.effectiveQuery) params.set('q', search.effectiveQuery)
      return fetchApi<ServerAppDirectoryResponse>(`/api/discover/server-apps?${params}`)
    },
  })

  const apps = useMemo(() => sortServerApps(appsQuery.data?.apps ?? []), [appsQuery.data?.apps])
  const isEmpty = apps.length === 0

  return (
    <DiscoverListScreen
      title={t('discover.views.apps')}
      search={search}
      loading={appsQuery.isLoading}
      empty={
        isEmpty
          ? {
              icon: DiscoverIcons.AppWindow,
              title: search.effectiveQuery
                ? t('discover.noSearchResults')
                : t('discover.emptyLane.apps'),
              description: search.effectiveQuery
                ? t('discover.noSearchResultsDesc')
                : t('discover.laneDescriptions.apps'),
            }
          : undefined
      }
    >
      <DiscoverSection
        title={t('discover.lanes.apps')}
        description={t('discover.laneDescriptions.apps')}
        empty={t('discover.emptyLane.apps')}
      >
        {apps.map((app) => {
          const categories = Array.isArray(app.categories) ? app.categories : []
          const chips = categories.length ? categories.slice(0, 4) : [t('serverApps.noCategories')]
          return (
            <DiscoverRow
              key={app.id}
              title={app.name}
              meta={app.appKey}
              description={
                app.tagline || app.description || app.summary || t('discover.noDescription')
              }
              coverImageUrl={app.coverImageUrl}
              imageUrl={app.iconUrl}
              icon={DiscoverIcons.AppWindow}
              badge={t('discover.appServerCount', { count: app.serverCount })}
              chips={chips}
              facts={[
                {
                  icon: DiscoverIcons.Sparkles,
                  label: t('discover.appCommands'),
                  value: String(app.commandCount),
                },
                {
                  icon: DiscoverIcons.ShieldCheck,
                  label: t('discover.appSkills'),
                  value: String(app.skillCount),
                },
              ]}
              actionLabel={t('discover.openApp')}
              onPress={() => actions.openServerApp(app)}
            />
          )
        })}
      </DiscoverSection>
    </DiscoverListScreen>
  )
}
