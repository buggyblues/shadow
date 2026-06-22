import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DiscoverIcons,
  DiscoverListScreen,
  DiscoverRow,
  DiscoverSection,
  formatCompact,
  type MarketplaceProductsResponse,
  sortBuddies,
  sortProducts,
  sortShops,
  useCommerceData,
  useDiscoverActions,
  useDiscoverSearch,
} from '../../../src/features/discover/list-pages'
import { fetchApi } from '../../../src/lib/api'

export default function DiscoverMarketScreen() {
  const { t } = useTranslation()
  const search = useDiscoverSearch()
  const actions = useDiscoverActions()
  const commerceQuery = useCommerceData(search.effectiveQuery)

  const productsQuery = useQuery({
    queryKey: ['discover-marketplace-products', search.effectiveQuery],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '72' })
      if (search.effectiveQuery) params.set('q', search.effectiveQuery)
      return fetchApi<MarketplaceProductsResponse>(`/api/discover/marketplace/products?${params}`)
    },
  })

  const products = useMemo(
    () => sortProducts(productsQuery.data?.products ?? []),
    [productsQuery.data?.products],
  )
  const buddies = useMemo(
    () => sortBuddies(commerceQuery.data?.buddies ?? []),
    [commerceQuery.data?.buddies],
  )
  const shops = useMemo(
    () => sortShops(commerceQuery.data?.shops ?? []),
    [commerceQuery.data?.shops],
  )
  const isLoading = productsQuery.isLoading || commerceQuery.isLoading
  const isEmpty = products.length === 0 && buddies.length === 0 && shops.length === 0

  return (
    <DiscoverListScreen
      title={t('discover.views.market')}
      search={search}
      loading={isLoading}
      empty={
        isEmpty
          ? {
              icon: DiscoverIcons.ShoppingBag,
              title: search.effectiveQuery
                ? t('discover.noSearchResults')
                : t('discover.emptyLane.market'),
              description: search.effectiveQuery
                ? t('discover.noSearchResultsDesc')
                : t('discover.laneDescriptions.market'),
            }
          : undefined
      }
    >
      <DiscoverSection
        title={t('discover.lanes.market')}
        description={t('discover.laneDescriptions.market')}
        empty={t('discover.emptyLane.market')}
      >
        {products.map((product) => (
          <DiscoverRow
            key={product.id}
            title={product.name}
            meta={product.shop.name}
            description={product.summary || product.description || t('discover.noDescription')}
            coverImageUrl={product.imageUrl}
            imageUrl={product.imageUrl}
            icon={DiscoverIcons.Package}
            badge={String(product.price)}
            chips={(product.tags ?? []).slice(0, 3)}
            facts={[
              {
                icon: DiscoverIcons.Sparkles,
                label: t('discover.productSales'),
                value: formatCompact(product.salesCount),
              },
            ]}
            actionLabel={t('discover.openProduct')}
            onPress={() => actions.openProduct(product)}
          />
        ))}
      </DiscoverSection>

      <DiscoverSection
        title={t('discover.lanes.buddies')}
        description={t('discover.laneDescriptions.buddies')}
        empty={t('discover.emptyLane.buddies')}
      >
        {buddies.map((buddy) => (
          <DiscoverRow
            key={buddy.id}
            title={buddy.title}
            meta={buddy.owner?.displayName ?? buddy.owner?.username ?? t('common.unknown')}
            description={buddy.description || t('discover.noDescription')}
            imageUrl={buddy.buddy?.avatarUrl}
            icon={DiscoverIcons.Bot}
            badge={t('discover.badges.buddy')}
            facts={[
              {
                icon: DiscoverIcons.Coins,
                label: t('discover.facts.daily'),
                value: String(buddy.baseDailyRate),
              },
              {
                icon: DiscoverIcons.ShieldCheck,
                label: t('discover.facts.rentals'),
                value: String(buddy.rentalCount),
              },
            ]}
            actionLabel={t('discover.openBuddy')}
            onPress={() => actions.openBuddy(buddy)}
          />
        ))}
      </DiscoverSection>

      <DiscoverSection
        title={t('discover.lanes.shops')}
        description={t('discover.laneDescriptions.shops')}
        empty={t('discover.emptyLane.shops')}
      >
        {shops.map((shop) => (
          <DiscoverRow
            key={shop.id}
            title={shop.name}
            meta={shop.server?.name ?? shop.owner?.displayName ?? shop.owner?.username}
            description={shop.description || t('discover.shopFallback')}
            coverImageUrl={shop.bannerUrl}
            imageUrl={shop.logoUrl ?? shop.bannerUrl}
            icon={DiscoverIcons.Store}
            badge={t(`discover.shopScope.${shop.scopeKind === 'server' ? 'server' : 'user'}`)}
            facts={[
              {
                icon: DiscoverIcons.Package,
                label: t('discover.sections.products'),
                value: String(shop.productCount),
              },
            ]}
            actionLabel={t('discover.openShop')}
            onPress={() => actions.openShop(shop)}
          />
        ))}
      </DiscoverSection>
    </DiscoverListScreen>
  )
}
