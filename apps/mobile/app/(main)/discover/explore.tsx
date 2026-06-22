import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DiscoverIcons,
  DiscoverListScreen,
  DiscoverRow,
  DiscoverSection,
  formatCompact,
  sortCommunities,
  useCommerceData,
  useCommunityJoin,
  useDiscoverActions,
  useDiscoverSearch,
  useJoinedServerIds,
} from '../../../src/features/discover/list-pages'

export default function DiscoverExploreScreen() {
  const { t } = useTranslation()
  const search = useDiscoverSearch()
  const actions = useDiscoverActions()
  const joinedServerIds = useJoinedServerIds()
  const joinCommunity = useCommunityJoin()

  const commerceQuery = useCommerceData(search.effectiveQuery)

  const communities = useMemo(
    () => sortCommunities(commerceQuery.data?.communities ?? []),
    [commerceQuery.data?.communities],
  )
  const isEmpty = communities.length === 0

  return (
    <DiscoverListScreen
      title={t('discover.views.explore')}
      search={search}
      searchPlaceholder={t('discover.serverSearchPlaceholder')}
      loading={commerceQuery.isLoading}
      empty={
        isEmpty
          ? {
              icon: DiscoverIcons.Server,
              title: search.effectiveQuery
                ? t('discover.noSearchResults')
                : t('discover.emptyTitle'),
              description: search.effectiveQuery
                ? t('discover.noSearchResultsDesc')
                : t('discover.emptyDesc'),
            }
          : undefined
      }
    >
      <DiscoverSection
        title={t('discover.lanes.communities')}
        description={t('discover.laneDescriptions.communities')}
        empty={t('discover.emptyLane.communities')}
      >
        {communities.map((community) => {
          const joined = joinedServerIds.has(community.id)
          return (
            <DiscoverRow
              key={community.id}
              title={community.name}
              meta={t('discover.memberCount', { count: community.memberCount })}
              description={community.description || t('discover.noDescription')}
              coverImageUrl={community.bannerUrl}
              imageUrl={community.iconUrl}
              icon={DiscoverIcons.Server}
              badge={joined ? t('discover.joined') : t('discover.public')}
              facts={[
                {
                  icon: DiscoverIcons.Users,
                  label: t('discover.members'),
                  value: formatCompact(community.memberCount),
                },
                {
                  icon: DiscoverIcons.Sparkles,
                  label: t('discover.activityScore'),
                  value: formatCompact(community.heatScore ?? community.memberCount),
                },
              ]}
              actionLabel={joined ? t('discover.enterButton') : t('discover.joinButton')}
              disabled={joinCommunity.isPending}
              onPress={() =>
                joined
                  ? actions.openCommunity(community)
                  : joinCommunity.mutate({ inviteCode: community.inviteCode })
              }
            />
          )
        })}
      </DiscoverSection>
    </DiscoverListScreen>
  )
}
