import { Badge, Button, cn, EmptyState, GlassPanel, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  ArrowRight,
  Bot,
  Cloud,
  Coins,
  Compass,
  Loader2,
  type LucideIcon,
  PackageOpen,
  Play,
  Search,
  Server,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
} from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QuickCreateBuddyModal } from '../components/buddy-management/quick-create-buddy-modal'
import type { Agent } from '../components/buddy-management/types'
import {
  BuddyListingCard,
  type BuddyListingCardData,
} from '../components/buddy-market/buddy-listing-card'
import {
  type CloudTemplateSource,
  DiscoverCloudTemplateCard,
  toTemplateCatalogSummary,
} from '../components/discover/cloud-template-card'
import { DiscoverPlayCard, type DiscoverPlayCardData } from '../components/discover/play-card'
import { DiscoverShopCard, type DiscoverShopCardData } from '../components/discover/shop-card'
import { PriceDisplay } from '../components/shop/ui/currency'
import type { ProductCardProduct } from '../components/shop/ui/product-card'
import { ProductVisual } from '../components/shop/ui/product-visual'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'

type HubSection = 'all' | 'plays' | 'buddies' | 'market' | 'shops' | 'cloud' | 'communities'

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

interface HubOwner {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

interface HubServer {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
}

interface HubBuddy {
  id: string
  title: string
  description: string | null
  skills: string[] | null
  tags: string[] | null
  deviceTier: string | null
  osType: string | null
  baseDailyRate: number
  messageFee: number
  rentalCount: number
  viewCount: number
  buddy: HubOwner | null
  owner: HubOwner | null
}

interface HubProduct {
  id: string
  name: string
  summary: string | null
  description: string | null
  type: 'physical' | 'entitlement' | string
  billingMode: string
  price: number
  currency: string
  tags?: string[]
  entitlementConfig?: ProductCardProduct['entitlementConfig']
  globalPublic?: boolean
  media?: ProductCardProduct['media']
  salesCount: number
  ratingCount: number
  avgRating: number
  imageUrl: string | null
  shop: {
    id: string
    name: string
    scopeKind: 'server' | 'user' | string
    logoUrl: string | null
    bannerUrl: string | null
    server: HubServer | null
    owner: HubOwner | null
  }
}

interface HubShop {
  id: string
  name: string
  description: string | null
  scopeKind: 'server' | 'user' | string
  logoUrl: string | null
  bannerUrl: string | null
  productCount: number
  server: HubServer | null
  owner: HubOwner | null
}

interface HubCommunity {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  memberCount: number
  inviteCode: string
  heatScore: number
}

type PlayAvailability = 'available' | 'gated' | 'coming_soon' | 'misconfigured'

interface PlayCatalogItem {
  id: string
  image: string
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  starts: string
  accentColor: string
  hot?: boolean
  status: PlayAvailability
  action?: {
    kind: 'public_channel' | 'private_room' | 'cloud_deploy' | 'external_oauth_app' | 'landing_page'
    templateSlug?: string
  }
  template?: {
    slug: string
  }
}

interface DiscoverCommerceResponse {
  buddies: HubBuddy[]
  products: HubProduct[]
  shops: HubShop[]
  communities: HubCommunity[]
  totals: {
    buddies: number
    products: number
    shops: number
    communities: number
  }
}

interface MarketplaceProductsResponse {
  products: HubProduct[]
  total: number
  hasMore: boolean
}

interface MarketplaceCategory {
  tag: string
  title: string
  productCount: number
  salesCount: number
  ratingCount: number
  avgRating: number
  score: number
  href: string
}

interface MarketplaceCategoriesResponse {
  categories: MarketplaceCategory[]
  total: number
}

const HUB_SECTIONS: Array<{ key: HubSection; icon: LucideIcon }> = [
  { key: 'all', icon: Compass },
  { key: 'plays', icon: Play },
  { key: 'buddies', icon: Bot },
  { key: 'market', icon: ShoppingBag },
  { key: 'shops', icon: Store },
  { key: 'cloud', icon: Cloud },
  { key: 'communities', icon: Server },
]

const CATEGORY_ICON_POOL: LucideIcon[] = [Sparkles, PackageOpen, ShoppingBag, Tags, Store]

const FEATURED_LIMIT = 6
const SECTION_PAGE_SIZE = 12

const initialSectionPages: Record<HubSection, number> = {
  all: 1,
  plays: 1,
  buddies: 1,
  market: 1,
  shops: 1,
  cloud: 1,
  communities: 1,
}

function parseHubSection(value: unknown): HubSection | null {
  return HUB_SECTIONS.some((section) => section.key === value) ? (value as HubSection) : null
}

export function DiscoverPage() {
  const { t, i18n } = useTranslation()
  const unreadCount = useUnreadCount()
  const navigate = useNavigate()
  const routeSearch = useSearch({ strict: false }) as {
    createBuddy?: string | number | boolean
    desktopCreateBuddyAt?: string | number
    tab?: string
    tag?: string
  }
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSection, setActiveSection] = useState<HubSection>(
    () => parseHubSection(routeSearch.tab) ?? 'all',
  )
  const [selectedMarketplaceTag, setSelectedMarketplaceTag] = useState(routeSearch.tag ?? '')
  const [sectionPages, setSectionPages] = useState<Record<HubSection, number>>(initialSectionPages)
  const [showCreateBuddy, setShowCreateBuddy] = useState(false)
  const normalizedSearch = searchQuery.trim()
  const effectiveSearch = normalizedSearch.length >= 2 ? normalizedSearch : ''
  useAppStatus({
    title: t('discover.title'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  useEffect(() => {
    if (
      routeSearch.createBuddy === '1' ||
      routeSearch.createBuddy === 1 ||
      routeSearch.createBuddy === true ||
      routeSearch.createBuddy === 'true'
    ) {
      setShowCreateBuddy(true)
    }
  }, [routeSearch.createBuddy, routeSearch.desktopCreateBuddyAt])

  const closeCreateBuddy = () => {
    setShowCreateBuddy(false)
    if (routeSearch.createBuddy) {
      navigate({ to: '/discover', search: {}, replace: true })
    }
  }

  const handleCreatedBuddy = async (_agent: Agent) => {
    queryClient.invalidateQueries({ queryKey: ['agents'] })
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
    closeCreateBuddy()
  }

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['discover-commerce', effectiveSearch],
    queryFn: () =>
      fetchApi<DiscoverCommerceResponse>(
        `/api/discover/business?limit=48${effectiveSearch ? `&q=${encodeURIComponent(effectiveSearch)}` : ''}`,
      ),
  })

  const { data: marketplaceData, isLoading: isMarketplaceLoading } = useQuery({
    queryKey: ['discover-marketplace-products', effectiveSearch, selectedMarketplaceTag],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '72' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      if (selectedMarketplaceTag) params.set('tag', selectedMarketplaceTag)
      return fetchApi<MarketplaceProductsResponse>(`/api/discover/marketplace/products?${params}`)
    },
  })

  const { data: marketplaceCategoriesData } = useQuery({
    queryKey: ['discover-marketplace-categories', effectiveSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '12' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<MarketplaceCategoriesResponse>(
        `/api/discover/marketplace/categories?${params}`,
      )
    },
  })

  const { data: playData } = useQuery({
    queryKey: ['discover-plays'],
    queryFn: () => fetchApi<{ plays: PlayCatalogItem[] }>('/api/play/catalog'),
  })

  const { data: cloudTemplates = [] } = useQuery({
    queryKey: ['discover-cloud-templates', i18n.language, effectiveSearch],
    queryFn: () =>
      fetchApi<CloudTemplateSource[]>(
        `/api/cloud-saas/templates?locale=${encodeURIComponent(i18n.language)}${effectiveSearch ? `&q=${encodeURIComponent(effectiveSearch)}` : ''}`,
      ),
    retry: false,
  })

  useEffect(() => {
    setSectionPages(initialSectionPages)
  }, [effectiveSearch, selectedMarketplaceTag])

  useEffect(() => {
    const nextSection = parseHubSection(routeSearch.tab)
    if (nextSection) setActiveSection(nextSection)
  }, [routeSearch.tab])

  useEffect(() => {
    setSelectedMarketplaceTag(routeSearch.tag ?? '')
  }, [routeSearch.tag])

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])
  const hub = data ?? {
    buddies: [],
    products: [],
    shops: [],
    communities: [],
    totals: { buddies: 0, products: 0, shops: 0, communities: 0 },
  }
  const plays = useMemo(
    () => sortPlays(filterPlays(playData?.plays ?? [], effectiveSearch)),
    [effectiveSearch, playData?.plays],
  )
  const buddies = useMemo(() => sortBuddies(hub.buddies), [hub.buddies])
  const products = useMemo(
    () => sortProducts(marketplaceData?.products ?? []),
    [marketplaceData?.products],
  )
  const marketplaceCategories = useMemo(
    () => buildMarketplaceCategories(marketplaceCategoriesData?.categories, products),
    [marketplaceCategoriesData?.categories, products],
  )
  const shops = useMemo(() => sortShops(hub.shops), [hub.shops])
  const communities = useMemo(() => sortCommunities(hub.communities), [hub.communities])
  const cloudCards = useMemo(
    () => cloudTemplates.map(toTemplateCatalogSummary).sort(sortCloudTemplates),
    [cloudTemplates],
  )
  const isZh = i18n.language.startsWith('zh')

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string }) =>
      fetchApi<{ id: string; slug?: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      navigate({ to: '/servers/$serverSlug', params: { serverSlug: server.slug ?? server.id } })
    },
  })

  const selectSection = (section: HubSection) => {
    setActiveSection(section)
    setSectionPages((current) => ({ ...current, [section]: 1 }))
  }

  const loadMore = (section: HubSection) => {
    setSectionPages((current) => ({ ...current, [section]: current[section] + 1 }))
  }

  const sectionItems = <T,>(items: T[], section: HubSection) =>
    activeSection === 'all'
      ? items.slice(0, FEATURED_LIMIT)
      : items.slice(0, sectionPages[section] * SECTION_PAGE_SIZE)

  const visiblePlays = sectionItems(plays, 'plays')
  const visibleBuddies = sectionItems(buddies, 'buddies')
  const visibleProducts = sectionItems(products, 'market')
  const visibleShops = sectionItems(shops, 'shops')
  const visibleCommunities = sectionItems(communities, 'communities')
  const visibleCloudCards =
    activeSection === 'all'
      ? cloudCards.slice(0, Math.max(FEATURED_LIMIT - 1, 0))
      : cloudCards.slice(0, Math.max(sectionPages.cloud * SECTION_PAGE_SIZE - 1, 0))

  const hasMore = (section: HubSection, visibleCount: number, totalCount: number) =>
    activeSection === section && visibleCount < totalCount

  const openShop = (shop: HubShop | HubProduct['shop']) => {
    if (shop.server) {
      navigate({
        to: '/servers/$serverSlug/shop',
        params: { serverSlug: shop.server.slug ?? shop.server.id },
      })
      return
    }
    if (shop.owner) {
      navigate({
        to: '/shop/users/$userId',
        params: { userId: shop.owner.id },
        search: { view: 'buyer' },
      })
    }
  }

  const openMarketplaceTag = (tag: string) => {
    navigate({
      to: '/shop/tags/$tag',
      params: { tag },
    })
  }

  const isSearching = effectiveSearch.length > 0
  const empty =
    plays.length === 0 &&
    hub.buddies.length === 0 &&
    products.length === 0 &&
    hub.shops.length === 0 &&
    (isSearching ? cloudCards.length === 0 : false) &&
    hub.communities.length === 0

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <GlassPanel className="mx-auto flex max-w-7xl flex-col gap-4 overflow-hidden !rounded-[32px] border-white/10 bg-[#050508]/62 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.26)] backdrop-blur-2xl md:p-5">
            <MarketplaceSearchHeader
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder={t('commerceMarketplace.searchInMarketplace')}
            />

            <SupermarketTabs t={t} activeSection={activeSection} onSelect={selectSection} />

            {isLoading || isMarketplaceLoading ? (
              <ContentMartSkeleton />
            ) : empty ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
                <EmptyState
                  icon={Search}
                  title={isSearching ? t('discover.noSearchResults') : t('discover.emptyTitle')}
                  description={
                    isSearching ? t('discover.noSearchResultsDesc') : t('discover.emptyDesc')
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {(activeSection === 'all' || activeSection === 'plays') && (
                  <HubLane
                    icon={Play}
                    title={t('discover.lanes.plays')}
                    description={t('discover.laneDescriptions.plays')}
                    action={activeSection === 'all' ? t('discover.viewAll') : undefined}
                    onAction={() => selectSection('plays')}
                    hasMore={hasMore('plays', visiblePlays.length, plays.length)}
                    loadMoreLabel={t('discover.loadMoreItems')}
                    onLoadMore={() => loadMore('plays')}
                  >
                    {visiblePlays.length ? (
                      visiblePlays.map((play) => (
                        <DiscoverPlayCard
                          key={play.id}
                          play={toDiscoverPlayCardData(play, isZh, t)}
                          actionLabel={t('discover.startPlay')}
                          onOpen={() =>
                            navigate({
                              to: '/play/launch',
                              search: { play: play.id },
                            })
                          }
                        />
                      ))
                    ) : (
                      <LaneEmpty text={t('discover.emptyLane.plays')} />
                    )}
                  </HubLane>
                )}

                {(activeSection === 'all' || activeSection === 'buddies') && (
                  <HubLane
                    icon={Bot}
                    title={t('discover.lanes.buddies')}
                    description={t('discover.laneDescriptions.buddies')}
                    action={activeSection === 'all' ? t('discover.viewAll') : undefined}
                    onAction={() => selectSection('buddies')}
                    hasMore={hasMore('buddies', visibleBuddies.length, buddies.length)}
                    loadMoreLabel={t('discover.loadMoreItems')}
                    onLoadMore={() => loadMore('buddies')}
                  >
                    {visibleBuddies.length ? (
                      visibleBuddies.map((item) => (
                        <BuddyListingCard
                          key={item.id}
                          listing={toBuddyListingCardData(item)}
                          onOpen={() =>
                            navigate({
                              to: '/marketplace/$listingId',
                              params: { listingId: item.id },
                              search: { from: 'discover' },
                            })
                          }
                        />
                      ))
                    ) : (
                      <LaneEmpty text={t('discover.emptyLane.buddies')} />
                    )}
                  </HubLane>
                )}

                {(activeSection === 'all' || activeSection === 'market') && (
                  <HubLane
                    icon={ShoppingBag}
                    title={t('discover.lanes.market')}
                    description={t('discover.laneDescriptions.market')}
                    action={activeSection === 'all' ? t('discover.viewAll') : undefined}
                    onAction={() => selectSection('market')}
                    hasMore={hasMore(
                      'market',
                      visibleProducts.length,
                      marketplaceData?.total ?? products.length,
                    )}
                    loadMoreLabel={t('discover.loadMoreItems')}
                    onLoadMore={() => loadMore('market')}
                  >
                    <MarketplaceAisleDirectory
                      t={t}
                      selectedTag={selectedMarketplaceTag}
                      onSelectTag={(tag) => {
                        setSelectedMarketplaceTag(tag)
                        setActiveSection('market')
                      }}
                      onOpenTag={openMarketplaceTag}
                      categories={marketplaceCategories}
                    />
                    {visibleProducts.length ? (
                      visibleProducts.map((item) => (
                        <MarketplaceProductTile
                          key={item.id}
                          product={item}
                          t={t}
                          onOpen={() =>
                            navigate({
                              to: '/shop/products/$productId',
                              params: { productId: item.id },
                            })
                          }
                          onShopClick={() => openShop(item.shop)}
                        />
                      ))
                    ) : (
                      <LaneEmpty text={t('discover.emptyLane.market')} />
                    )}
                  </HubLane>
                )}

                {(activeSection === 'all' || activeSection === 'cloud') && (
                  <HubLane
                    icon={Cloud}
                    title={t('discover.lanes.cloud')}
                    description={t('discover.laneDescriptions.cloud')}
                    action={activeSection === 'all' ? t('discover.viewAll') : undefined}
                    onAction={() => selectSection('cloud')}
                    hasMore={hasMore('cloud', visibleCloudCards.length + 1, cloudCards.length + 1)}
                    loadMoreLabel={t('discover.loadMoreItems')}
                    onLoadMore={() => loadMore('cloud')}
                  >
                    <CloudCashbackCard
                      t={t}
                      onOpen={() => {
                        navigate({ to: '/cloud/diy' })
                      }}
                    />
                    {visibleCloudCards.map((template) => (
                      <DiscoverCloudTemplateCard
                        key={template.name}
                        template={template}
                        locale={i18n.language}
                        categoryLabel={template.category}
                        difficultyLabel={t(`discover.cloudDifficulty.${template.difficulty}`)}
                        cashbackLabel={t('discover.templateCashbackHint')}
                        deployLabel={t('discover.cloudTemplateAction')}
                        agentCountLabel={t('discover.cloudMetricAgents')}
                        popularityLabel={t('discover.cloudMetricPopularity')}
                        summaryFallback={t('discover.cloudTemplateFallback')}
                      />
                    ))}
                  </HubLane>
                )}

                {(activeSection === 'all' || activeSection === 'shops') && (
                  <HubLane
                    icon={Store}
                    title={t('discover.lanes.shops')}
                    description={t('discover.laneDescriptions.shops')}
                    action={activeSection === 'all' ? t('discover.viewAll') : undefined}
                    onAction={() => selectSection('shops')}
                    hasMore={hasMore('shops', visibleShops.length, shops.length)}
                    loadMoreLabel={t('discover.loadMoreItems')}
                    onLoadMore={() => loadMore('shops')}
                  >
                    {visibleShops.length ? (
                      visibleShops.map((shop) => (
                        <DiscoverShopCard
                          key={shop.id}
                          shop={toDiscoverShopCardData(shop, t)}
                          actionLabel={t('discover.openShop')}
                          onOpen={() => openShop(shop)}
                        />
                      ))
                    ) : (
                      <LaneEmpty text={t('discover.emptyLane.shops')} />
                    )}
                  </HubLane>
                )}

                {(activeSection === 'all' || activeSection === 'communities') && (
                  <HubLane
                    icon={Server}
                    title={t('discover.lanes.communities')}
                    description={t('discover.laneDescriptions.communities')}
                    action={activeSection === 'all' ? t('discover.viewAll') : undefined}
                    onAction={() => selectSection('communities')}
                    hasMore={hasMore('communities', visibleCommunities.length, communities.length)}
                    loadMoreLabel={t('discover.loadMoreItems')}
                    onLoadMore={() => loadMore('communities')}
                  >
                    {visibleCommunities.length ? (
                      visibleCommunities.map((community) => (
                        <CommunityHubCard
                          key={community.id}
                          community={community}
                          joined={joinedServerIds.has(community.id)}
                          pending={joinMutation.isPending}
                          t={t}
                          onEnter={() =>
                            navigate({
                              to: '/servers/$serverSlug',
                              params: { serverSlug: community.slug ?? community.id },
                            })
                          }
                          onJoin={() => joinMutation.mutate({ inviteCode: community.inviteCode })}
                        />
                      ))
                    ) : (
                      <LaneEmpty text={t('discover.emptyLane.communities')} />
                    )}
                  </HubLane>
                )}
              </div>
            )}
          </GlassPanel>
        </div>
      </div>
      <QuickCreateBuddyModal
        open={showCreateBuddy}
        onClose={closeCreateBuddy}
        onSuccess={handleCreatedBuddy}
      />
    </>
  )
}

function MarketplaceSearchHeader({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
}: {
  searchQuery: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-2">
      <Input
        icon={Search}
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        className="h-12 !rounded-full border-white/10 bg-bg-primary/70"
      />
    </div>
  )
}

function SupermarketTabs({
  t,
  activeSection,
  onSelect,
}: {
  t: TFunction
  activeSection: HubSection
  onSelect: (section: HubSection) => void
}) {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-full border border-white/10 bg-[#050508]/58 p-2 backdrop-blur-2xl">
      <div className="flex min-w-max gap-2">
        {HUB_SECTIONS.map((section) => {
          const Icon = section.icon
          const active = activeSection === section.key
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onSelect(section.key)}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-black transition active:scale-[0.99]',
                active
                  ? 'border-primary/45 bg-primary text-bg-primary shadow-[0_10px_28px_rgba(0,198,209,0.28)]'
                  : 'border-white/10 bg-white/[0.035] text-text-muted hover:border-primary/30 hover:bg-white/[0.06] hover:text-text-primary',
              )}
            >
              <Icon size={16} />
              <span>{t(`discover.sections.${section.key}`)}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function ContentMartSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[260px] animate-pulse rounded-lg border border-border-subtle bg-bg-secondary/45"
          >
            <div className="h-32 rounded-t-lg bg-bg-tertiary/55" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-2/3 rounded bg-bg-tertiary/70" />
              <div className="h-3 w-full rounded bg-bg-tertiary/50" />
              <div className="h-3 w-3/4 rounded bg-bg-tertiary/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function handleCardKey(event: KeyboardEvent, onOpen: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onOpen()
}

function filterPlays(plays: PlayCatalogItem[], query: string) {
  const normalized = query.trim().toLowerCase()
  const visible = plays.filter((play) => play.status !== 'misconfigured')
  if (!normalized) return visible
  return visible.filter((play) =>
    [play.title, play.titleEn, play.desc, play.descEn, play.category, play.categoryEn]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized)),
  )
}

function sortPlays(plays: PlayCatalogItem[]) {
  const statusRank: Record<PlayAvailability, number> = {
    available: 0,
    gated: 1,
    coming_soon: 2,
    misconfigured: 3,
  }
  return [...plays].sort((a, b) => {
    const statusDelta = statusRank[a.status] - statusRank[b.status]
    if (statusDelta !== 0) return statusDelta
    if (a.hot !== b.hot) return a.hot ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}

function sortBuddies(buddies: HubBuddy[]) {
  return [...buddies].sort(
    (a, b) =>
      b.rentalCount * 6 + b.viewCount - (a.rentalCount * 6 + a.viewCount) ||
      b.messageFee - a.messageFee ||
      a.title.localeCompare(b.title),
  )
}

function sortProducts(products: HubProduct[]) {
  return [...products].sort(
    (a, b) =>
      b.salesCount * 6 +
        b.ratingCount * 2 +
        b.avgRating -
        (a.salesCount * 6 + a.ratingCount * 2 + a.avgRating) || a.name.localeCompare(b.name),
  )
}

function buildMarketplaceCategories(
  categories: MarketplaceCategory[] | undefined,
  products: HubProduct[],
) {
  const fallback = categoriesFromProducts(products)
  const source = categories?.length ? mergeMarketplaceCategories(categories, fallback) : fallback
  return source.slice(0, 12)
}

function categoriesFromProducts(products: HubProduct[]): MarketplaceCategory[] {
  const categoryMap = new Map<
    string,
    { productCount: number; salesCount: number; ratingCount: number; avgRating: number }
  >()
  for (const product of products) {
    const tags = [...new Set((product.tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
    for (const tag of tags) {
      const current = categoryMap.get(tag) ?? {
        productCount: 0,
        salesCount: 0,
        ratingCount: 0,
        avgRating: 0,
      }
      current.productCount += 1
      current.salesCount += product.salesCount
      current.ratingCount += product.ratingCount
      current.avgRating += product.avgRating
      categoryMap.set(tag, current)
    }
  }
  return [...categoryMap.entries()]
    .map(([tag, value]) => ({
      tag,
      title: tag,
      productCount: value.productCount,
      salesCount: value.salesCount,
      ratingCount: value.ratingCount,
      avgRating: value.productCount ? Math.round(value.avgRating / value.productCount) : 0,
      score: value.productCount * 100 + value.salesCount * 8 + value.ratingCount * 4,
      href: `/app/shop/tags/${encodeURIComponent(tag)}`,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.productCount - a.productCount ||
        b.salesCount - a.salesCount ||
        a.title.localeCompare(b.title),
    )
}

function mergeMarketplaceCategories(
  categories: MarketplaceCategory[],
  fallback: MarketplaceCategory[],
) {
  const byTag = new Map(categories.map((category) => [category.tag, category]))
  for (const category of fallback) {
    if (!byTag.has(category.tag)) byTag.set(category.tag, category)
  }
  return [...byTag.values()]
}

function ensureSelectedCategory(categories: MarketplaceCategory[], selectedTag: string) {
  if (!selectedTag || categories.some((category) => category.tag === selectedTag)) return categories
  return [
    {
      tag: selectedTag,
      title: selectedTag,
      productCount: 0,
      salesCount: 0,
      ratingCount: 0,
      avgRating: 0,
      score: 0,
      href: `/app/shop/tags/${encodeURIComponent(selectedTag)}`,
    },
    ...categories,
  ]
}

function sortShops(shops: HubShop[]) {
  return [...shops].sort(
    (a, b) => (b.productCount ?? 0) - (a.productCount ?? 0) || a.name.localeCompare(b.name),
  )
}

function sortCommunities(communities: HubCommunity[]) {
  return [...communities].sort(
    (a, b) =>
      b.heatScore - a.heatScore || b.memberCount - a.memberCount || a.name.localeCompare(b.name),
  )
}

function sortCloudTemplates(
  a: ReturnType<typeof toTemplateCatalogSummary>,
  b: ReturnType<typeof toTemplateCatalogSummary>,
) {
  if (a.featured !== b.featured) return a.featured ? -1 : 1
  return b.popularity - a.popularity || a.title.localeCompare(b.title)
}

function toDiscoverPlayCardData(
  play: PlayCatalogItem,
  isZh: boolean,
  t: TFunction,
): DiscoverPlayCardData {
  return {
    id: play.id,
    title: isZh ? play.title : play.titleEn,
    description: isZh ? play.desc : play.descEn,
    category: isZh ? play.category : play.categoryEn,
    image: play.image,
    accentColor: play.accentColor,
    statusLabel: play.status === 'gated' ? t('discover.memberPlay') : t('discover.readyPlay'),
    statusTone: play.status === 'gated' ? 'warning' : 'success',
    startsLabel: play.starts,
  }
}

function toDiscoverShopCardData(shop: HubShop, t: TFunction): DiscoverShopCardData {
  const ownerName =
    shop.server?.name ?? shop.owner?.displayName ?? shop.owner?.username ?? t('common.unknown')
  const scopeKind = shop.scopeKind === 'server' ? 'server' : 'user'

  return {
    id: shop.id,
    name: shop.name,
    description: shop.description,
    scopeKind,
    logoUrl: shop.logoUrl,
    bannerUrl: shop.bannerUrl,
    productCount: shop.productCount,
    ownerName,
    scopeLabel: t(`discover.shopScope.${scopeKind}`),
    productCountLabel: t('discover.productCount', { count: shop.productCount }),
    fallbackDescription: t('discover.shopFallback'),
  }
}

function HubLane({
  icon: Icon,
  title,
  description,
  action,
  onAction,
  hasMore,
  loadMoreLabel,
  onLoadMore,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: string
  onAction?: () => void
  hasMore?: boolean
  loadMoreLabel?: string
  onLoadMore?: () => void
  children: ReactNode
}) {
  return (
    <section className="py-3">
      <div className="mb-4 flex items-end justify-between gap-3 px-1 md:px-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-primary/20 bg-primary/10 text-primary shadow-[0_12px_34px_rgba(0,198,209,0.10)]">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-[-0.03em] text-text-primary">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">{description}</p>
          </div>
        </div>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-xs font-black text-primary transition hover:bg-primary/15"
          >
            {action}
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      {hasMore && loadMoreLabel && onLoadMore ? (
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="glass" size="sm" onClick={onLoadMore}>
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function LaneEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-subtle bg-bg-secondary/35 p-5 text-sm font-bold text-text-muted">
      {text}
    </div>
  )
}

function MarketplaceAisleDirectory({
  t,
  selectedTag,
  onSelectTag,
  onOpenTag,
  categories,
}: {
  t: TFunction
  selectedTag: string
  onSelectTag: (tag: string) => void
  onOpenTag: (tag: string) => void
  categories: MarketplaceCategory[]
}) {
  const visibleCategories = selectedTag
    ? ensureSelectedCategory(categories, selectedTag)
    : categories
  const shownCategories = visibleCategories.slice(0, 12)

  return (
    <div className="col-span-full overflow-hidden rounded-[28px] border border-white/10 bg-[#050508]/56 p-4 backdrop-blur-2xl">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-base font-black text-text-primary">
            <Sparkles size={18} className="text-primary" />
            {t('discover.supermarket.aislesTitle')}
          </div>
          <p className="mt-1 text-sm font-bold leading-6 text-text-muted">
            {t('discover.supermarket.aislesSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelectTag('')}
          className={cn(
            'inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-black transition',
            !selectedTag
              ? 'border-primary/45 bg-primary text-bg-primary'
              : 'border-white/10 bg-white/[0.05] text-text-muted hover:text-text-primary',
          )}
        >
          {t('discover.marketTags.all')}
        </button>
      </div>
      {shownCategories.length ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {shownCategories.map((category, index) => {
            const Icon = CATEGORY_ICON_POOL[index % CATEGORY_ICON_POOL.length] ?? Tags
            const active = selectedTag === category.tag
            return (
              <button
                key={category.tag}
                type="button"
                onClick={() => onSelectTag(category.tag)}
                onDoubleClick={() => onOpenTag(category.tag)}
                className={cn(
                  'group relative min-h-[136px] min-w-[220px] overflow-hidden rounded-[24px] border p-4 text-left transition active:scale-[0.99]',
                  active
                    ? 'border-primary/45 bg-primary/15 shadow-[0_18px_52px_rgba(0,198,209,0.13)]'
                    : 'border-white/10 bg-white/[0.045] hover:-translate-y-1 hover:border-primary/35 hover:bg-white/[0.07]',
                )}
              >
                <span className="pointer-events-none absolute -right-5 -top-8 h-28 w-28 rounded-full bg-primary/14 blur-2xl transition group-hover:bg-primary/24" />
                <span className="relative flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/20 bg-primary/10 text-primary">
                  <Icon size={20} />
                </span>
                <span className="relative mt-5 block min-w-0">
                  <span className="block truncate text-base font-black text-text-primary group-hover:text-primary">
                    {category.title}
                  </span>
                  <span className="mt-1 block truncate text-xs font-bold text-text-muted">
                    {t('discover.supermarket.categoryProductCount', {
                      count: category.productCount,
                    })}
                  </span>
                </span>
                <ArrowRight
                  size={16}
                  className="absolute bottom-4 right-4 text-text-muted group-hover:text-primary"
                />
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function toBuddyListingCardData(item: HubBuddy): BuddyListingCardData {
  const owner = item.owner ?? item.buddy

  return {
    id: item.id,
    ownerId: owner?.id ?? item.owner?.id ?? item.buddy?.id ?? null,
    title: item.title,
    description: item.description,
    skills: item.skills,
    tags: item.tags,
    hourlyRate: item.messageFee,
    viewCount: item.viewCount,
    rentalCount: item.rentalCount,
    totalOnlineSeconds: null,
    owner: owner
      ? {
          id: owner.id,
          username: owner.username,
          displayName: owner.displayName,
          avatarUrl: owner.avatarUrl,
        }
      : null,
  }
}

function getProductResourceType(product: HubProduct | null) {
  const entitlementConfig = Array.isArray(product?.entitlementConfig)
    ? product.entitlementConfig[0]
    : product?.entitlementConfig
  return entitlementConfig?.resourceType ?? null
}

function MarketplaceProductTile({
  product,
  t,
  onOpen,
  onShopClick,
}: {
  product: HubProduct
  t: TFunction
  onOpen: () => void
  onShopClick: () => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className="group cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-[#050508]/55 shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition hover:-translate-y-1 hover:border-primary/35 hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-bg-tertiary/40">
        <ProductVisual
          name={product.name}
          imageUrl={product.imageUrl}
          media={product.media}
          productType={product.type}
          resourceType={getProductResourceType(product)}
          className="h-full w-full rounded-none border-0 transition duration-700 group-hover:scale-[1.04]"
          showLabel={false}
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
          <PriceDisplay amount={product.price} size={18} showFree />
          <span className="rounded-full border border-white/10 bg-white/12 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur-xl">
            {t('discover.openProduct')}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-base font-black leading-tight text-text-primary group-hover:text-primary">
          {product.name}
        </h3>
        <p className="mt-2 line-clamp-2 min-h-[40px] text-sm leading-5 text-text-secondary">
          {product.summary ?? product.description ?? product.shop.name}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onShopClick()
            }}
            className="min-w-0 truncate text-left text-xs font-black text-text-muted transition hover:text-primary"
          >
            {product.shop.name}
          </button>
          <span className="shrink-0 text-xs font-bold text-text-muted">
            {t('shop.soldCount')} {product.salesCount > 999 ? '999+' : product.salesCount}
          </span>
        </div>
      </div>
    </article>
  )
}

function CloudCashbackCard({ t, onOpen }: { t: TFunction; onOpen: () => void }) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className="cursor-pointer overflow-hidden rounded-[18px] border border-border-subtle bg-bg-secondary/60 shadow-[0_16px_42px_rgba(0,0,0,0.14)] transition hover:border-primary/35 hover:bg-bg-secondary/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <div className="relative h-36 overflow-hidden border-b border-border-subtle/70 bg-[#10242c] p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(255,51,102,0.28),transparent_27%),radial-gradient(circle_at_18%_18%,rgba(0,209,255,0.22),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent)]" />
        <Badge variant="warning" size="sm" className="relative">
          {t('discover.cashbackBadge')}
        </Badge>
        <div className="relative mt-8 flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary/10 text-primary ring-1 ring-primary/25">
          <Coins size={28} />
        </div>
      </div>
      <div className="flex min-h-[184px] flex-col p-4">
        <h3 className="text-base font-black text-text-primary">{t('discover.cashbackTitle')}</h3>
        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-text-secondary">
          {t('discover.cashbackDesc')}
        </p>
        <div className="mt-4 border-t border-border-subtle/60 pt-3">
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            {t('discover.cashbackAction')}
          </Button>
        </div>
      </div>
    </article>
  )
}

function CommunityHubCard({
  community,
  joined,
  pending,
  t,
  onEnter,
  onJoin,
}: {
  community: HubCommunity
  joined: boolean
  pending: boolean
  t: TFunction
  onEnter: () => void
  onJoin: () => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={joined ? onEnter : onJoin}
      onKeyDown={(event) => handleCardKey(event, joined ? onEnter : onJoin)}
      className="cursor-pointer overflow-hidden rounded-[18px] border border-border-subtle bg-bg-secondary/60 shadow-[0_16px_42px_rgba(0,0,0,0.14)] transition hover:border-primary/35 hover:bg-bg-secondary/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <CardVisual
        imageUrl={community.bannerUrl}
        icon={<Server size={26} />}
        label={community.name}
      />
      <div className="flex min-h-[168px] flex-col p-4">
        <div className="mb-3 flex items-start gap-3">
          <AvatarImage
            imageUrl={community.iconUrl}
            label={community.name}
            icon={<Server size={20} />}
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-black text-text-primary">{community.name}</h3>
            <p className="mt-1 text-xs font-bold text-text-muted">
              {t('discover.memberCount', { count: community.memberCount })}
            </p>
          </div>
          <Badge variant={joined ? 'success' : 'neutral'}>
            {joined ? t('discover.joined') : t('discover.public')}
          </Badge>
        </div>
        <p className="line-clamp-2 flex-1 text-sm leading-5 text-text-secondary">
          {community.description || t('discover.noDescription')}
        </p>
        <Button
          className="mt-4 w-full"
          variant={joined ? 'glass' : 'primary'}
          onClick={(event) => {
            event.stopPropagation()
            if (joined) onEnter()
            else onJoin()
          }}
          disabled={pending}
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {joined ? t('discover.enterButton') : t('discover.joinButton')}
        </Button>
      </div>
    </article>
  )
}

function AvatarImage({
  imageUrl,
  label,
  icon,
}: {
  imageUrl?: string | null
  label: string
  icon: ReactNode
}) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-border-subtle bg-bg-primary text-primary">
      {imageUrl ? <img src={imageUrl} alt={label} className="h-full w-full object-cover" /> : icon}
    </div>
  )
}

function CardVisual({
  imageUrl,
  icon,
  label,
}: {
  imageUrl?: string | null
  icon: ReactNode
  label: string
}) {
  return (
    <div className="relative h-28 overflow-hidden border-b border-border-subtle/70 bg-bg-tertiary">
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-end justify-between bg-[radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.22),transparent_28%),linear-gradient(135deg,rgba(0,243,255,0.24),rgba(71,85,105,0.18)_48%,rgba(255,42,85,0.16))] p-4 text-primary">
          <span className="max-w-[70%] truncate text-lg font-black text-text-primary">{label}</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/15 bg-bg-primary/55">
            {icon}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-secondary/85 via-transparent to-transparent" />
    </div>
  )
}
