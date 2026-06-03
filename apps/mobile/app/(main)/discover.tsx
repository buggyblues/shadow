import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  AppWindow,
  ArrowRight,
  Bot,
  Cloud,
  Coins,
  Compass,
  type LucideIcon,
  Package,
  Play,
  Rocket,
  Search,
  Server,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  X,
} from 'lucide-react-native'
import { Children, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  BackgroundSurface,
  Badge,
  Button,
  CardPressable,
  EmptyState,
  GlassPanel,
  IconButton,
  MobileTabBar,
  PageScroll,
  TextField,
} from '../../src/components/ui'
import { API_BASE, fetchApi } from '../../src/lib/api'
import { errorHaptic, selectionHaptic, successHaptic } from '../../src/lib/haptics'
import { animateNextLayout } from '../../src/lib/layout-animation'
import { showToast } from '../../src/lib/toast'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  radius,
  size,
  spacing,
  useColors,
} from '../../src/theme'

type HubSection =
  | 'all'
  | 'plays'
  | 'buddies'
  | 'market'
  | 'shops'
  | 'cloud'
  | 'communities'
  | 'apps'
type DiscoverView = 'explore' | 'market' | 'apps'
type DiscoverModuleId =
  | 'plays'
  | 'communities'
  | 'cloud'
  | 'products'
  | 'buddies'
  | 'shops'
  | 'apps'

interface DiscoverViewConfig {
  id: DiscoverView
  enabled: boolean
  modules: DiscoverModuleId[]
}

interface DiscoverLayoutConfig {
  views: DiscoverViewConfig[]
}

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
  skills?: string[] | null
  tags?: string[] | null
  deviceTier?: string | null
  osType?: string | null
  baseDailyRate: number
  messageFee: number
  rentalCount: number
  viewCount?: number
  buddy: HubOwner | null
  owner: HubOwner | null
}

interface HubProduct {
  id: string
  name: string
  summary: string | null
  description: string | null
  type: 'physical' | 'entitlement' | string
  billingMode?: string
  price: number
  currency?: string
  tags?: string[]
  imageUrl: string | null
  salesCount: number
  ratingCount?: number
  avgRating?: number
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
  heatScore?: number
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
}

interface CloudTemplateSource {
  slug: string
  name: string
  description?: string | null
  source?: string | null
  tags?: string[] | null
  category?: string | null
  deployCount?: number | null
  content?: Record<string, unknown> | null
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

interface MarketplaceProductSection {
  key: string
  title: string
  products: HubProduct[]
}

interface ServerAppDirectoryEntry {
  id: string
  appKey: string
  name: string
  description: string | null
  iconUrl: string | null
  tagline: string | null
  summary: string | null
  categories: string[]
  supportedLanguages: string[]
  coverImageUrl: string | null
  serverCount: number
  commandCount: number
  skillCount: number
}

interface ServerAppDirectoryResponse {
  apps: ServerAppDirectoryEntry[]
  total: number
  hasMore: boolean
}

const DISCOVER_VIEWS: Array<{ key: DiscoverView; icon: LucideIcon }> = [
  { key: 'explore', icon: Compass },
  { key: 'market', icon: ShoppingBag },
  { key: 'apps', icon: AppWindow },
]

const DISCOVER_CONFIG_SCHEMA_NAME = 'discover-page'
const DEFAULT_DISCOVER_LAYOUT: DiscoverLayoutConfig = {
  views: [
    { id: 'explore', enabled: true, modules: ['plays', 'communities'] },
    { id: 'market', enabled: true, modules: ['cloud', 'products', 'buddies', 'shops'] },
    { id: 'apps', enabled: true, modules: ['apps'] },
  ],
}
const DISCOVER_VIEW_ORDER: DiscoverView[] = ['explore', 'market', 'apps']
const DISCOVER_MODULE_BY_VIEW: Record<DiscoverView, DiscoverModuleId[]> = {
  explore: ['plays', 'communities'],
  market: ['cloud', 'products', 'buddies', 'shops'],
  apps: ['apps'],
}
const SECTION_PAGE_SIZE = 12

function isDiscoverView(value: unknown): value is DiscoverView {
  return DISCOVER_VIEW_ORDER.includes(value as DiscoverView)
}

function isDiscoverModule(value: unknown): value is DiscoverModuleId {
  return (
    value === 'plays' ||
    value === 'communities' ||
    value === 'cloud' ||
    value === 'products' ||
    value === 'buddies' ||
    value === 'shops' ||
    value === 'apps'
  )
}

function normalizeDiscoverLayout(value: unknown): DiscoverLayoutConfig {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  const inputViews = Array.isArray(record?.views) ? record.views : DEFAULT_DISCOVER_LAYOUT.views
  const normalized = new Map<DiscoverView, DiscoverViewConfig>()

  for (const item of inputViews) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const view = item as Record<string, unknown>
    if (!isDiscoverView(view.id)) continue
    const allowedModules = DISCOVER_MODULE_BY_VIEW[view.id]
    const modules = Array.isArray(view.modules)
      ? view.modules.filter(
          (module): module is DiscoverModuleId =>
            isDiscoverModule(module) && allowedModules.includes(module),
        )
      : allowedModules
    normalized.set(view.id, {
      id: view.id,
      enabled: view.enabled !== false,
      modules: modules.length ? [...new Set(modules)] : allowedModules,
    })
  }

  for (const fallback of DEFAULT_DISCOVER_LAYOUT.views) {
    if (!normalized.has(fallback.id)) normalized.set(fallback.id, fallback)
  }

  return {
    views: DISCOVER_VIEW_ORDER.map((id) => normalized.get(id)).filter(
      (view): view is DiscoverViewConfig => Boolean(view),
    ),
  }
}

const initialSectionPages: Record<HubSection, number> = {
  all: 1,
  plays: 1,
  buddies: 1,
  market: 1,
  shops: 1,
  cloud: 1,
  communities: 1,
  apps: 1,
}

export default function DiscoverScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeView, setActiveView] = useState<DiscoverView>('explore')
  const [sectionPages, setSectionPages] = useState<Record<HubSection, number>>(initialSectionPages)
  const normalizedSearch = searchQuery.trim()
  const effectiveSearch = normalizedSearch.length >= 2 ? normalizedSearch : ''

  useEffect(() => {
    setSectionPages(initialSectionPages)
  }, [effectiveSearch])

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })
  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])

  const { data, isLoading } = useQuery({
    queryKey: ['discover-commerce', effectiveSearch],
    queryFn: () =>
      fetchApi<DiscoverCommerceResponse>(
        `/api/discover/business?limit=48${effectiveSearch ? `&q=${encodeURIComponent(effectiveSearch)}` : ''}`,
      ),
  })

  const { data: discoverConfigData } = useQuery({
    queryKey: ['discover-page-config'],
    queryFn: () =>
      fetchApi<{ data: unknown; version: number; publishedAt: string | null }>(
        `/api/v1/config/${DISCOVER_CONFIG_SCHEMA_NAME}?env=prod`,
      ),
    retry: false,
  })

  const { data: marketplaceData, isLoading: isMarketplaceLoading } = useQuery({
    queryKey: ['discover-marketplace-products', effectiveSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '72' })
      if (effectiveSearch) params.set('q', effectiveSearch)
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

  const { data: serverAppDirectoryData, isLoading: isServerAppsLoading } = useQuery({
    queryKey: ['discover-server-apps', effectiveSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '72' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<ServerAppDirectoryResponse>(`/api/discover/server-apps?${params}`)
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
  const productSections = useMemo(
    () => buildProductSections(products, marketplaceCategories),
    [marketplaceCategories, products],
  )
  const shops = useMemo(() => sortShops(hub.shops), [hub.shops])
  const serverApps = useMemo(
    () => sortServerApps(serverAppDirectoryData?.apps ?? []),
    [serverAppDirectoryData?.apps],
  )
  const communities = useMemo(() => sortCommunities(hub.communities), [hub.communities])
  const cloudCards = useMemo(() => sortCloudTemplates(cloudTemplates), [cloudTemplates])
  const isZh = i18n.language.startsWith('zh')
  const discoverLayout = useMemo(
    () => normalizeDiscoverLayout(discoverConfigData?.data),
    [discoverConfigData?.data],
  )
  const visibleViews = useMemo(
    () => discoverLayout.views.filter((view) => view.enabled),
    [discoverLayout.views],
  )

  useEffect(() => {
    if (visibleViews.some((view) => view.id === activeView)) return
    setActiveView(visibleViews[0]?.id ?? 'explore')
  }, [activeView, visibleViews])

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string }) =>
      fetchApi<{ id: string; slug?: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (server) => {
      successHaptic()
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.push(`/(main)/servers/${server.slug ?? server.id}`)
    },
    onError: (err: { message?: string }) => {
      errorHaptic()
      showToast(err?.message || t('common.error'), 'error')
    },
  })

  const isSearching = effectiveSearch.length > 0
  const loadingContent =
    isLoading || isMarketplaceLoading || (activeView === 'apps' && isServerAppsLoading)
  const moduleCounts = useMemo(
    () => ({
      plays: plays.length,
      communities: communities.length,
      cloud: cloudCards.length,
      products: products.length,
      buddies: buddies.length,
      shops: shops.length,
      apps: serverApps.length,
    }),
    [
      buddies.length,
      cloudCards.length,
      communities.length,
      plays.length,
      products.length,
      serverApps.length,
      shops.length,
    ],
  )
  const enabledModuleIds = useMemo(
    () =>
      new Set(
        visibleViews.flatMap((view) =>
          view.modules.filter((module) => moduleHasContent(module, moduleCounts)),
        ),
      ),
    [moduleCounts, visibleViews],
  )
  const activeViewConfig = visibleViews.find((view) => view.id === activeView)
  const activeViewHasContent = (activeViewConfig?.modules ?? []).some((module) =>
    enabledModuleIds.has(module),
  )
  const emptyStateTitle =
    activeView === 'apps' && !isSearching
      ? t('discover.emptyLane.apps')
      : isSearching
        ? t('discover.noSearchResults')
        : t('discover.emptyTitle')
  const emptyStateDescription =
    activeView === 'apps' && !isSearching
      ? t('discover.laneDescriptions.apps')
      : isSearching
        ? t('discover.noSearchResultsDesc')
        : t('discover.emptyDesc')

  const selectView = (view: DiscoverView) => {
    if (view !== activeView) {
      animateNextLayout()
      setActiveView(view)
      setSectionPages(initialSectionPages)
    }
  }

  const loadMore = (section: HubSection) => {
    selectionHaptic()
    animateNextLayout()
    setSectionPages((current) => ({ ...current, [section]: current[section] + 1 }))
  }

  const openSeller = (owner: HubOwner | null) => {
    if (owner?.id) {
      selectionHaptic()
      router.push(`/(main)/profile/${owner.id}`)
    }
  }

  const openShop = (shop: HubShop | HubProduct['shop']) => {
    if (shop.server) {
      selectionHaptic()
      router.push(`/(main)/servers/${shop.server.slug ?? shop.server.id}/shop` as never)
      return
    }
    openSeller(shop.owner)
  }

  const openProduct = (product: HubProduct) => {
    if (product.shop.server) {
      selectionHaptic()
      const serverSlug = product.shop.server.slug ?? product.shop.server.id
      router.push(`/(main)/servers/${serverSlug}/shop?productId=${product.id}` as never)
      return
    }
    openSeller(product.shop.owner)
  }

  const openPlay = (play: PlayCatalogItem) => {
    selectionHaptic()
    router.push({
      pathname: '/(main)/webview-preview',
      params: {
        url: encodeURIComponent(`${API_BASE}/play/launch?play=${encodeURIComponent(play.id)}`),
        title: isZh ? play.title : play.titleEn,
      },
    })
  }

  const openCloudTemplate = (template: CloudTemplateSource) => {
    selectionHaptic()
    const slug = encodeURIComponent(template.slug || template.name)
    router.push({
      pathname: '/(main)/webview-preview',
      params: {
        url: encodeURIComponent(`${API_BASE}/cloud/store/${slug}/deploy`),
        title: template.name || template.slug,
      },
    })
  }

  const openCloudCashback = () => {
    selectionHaptic()
    router.push({
      pathname: '/(main)/webview-preview',
      params: {
        url: encodeURIComponent(`${API_BASE}/cloud/diy`),
        title: t('discover.cashbackTitle'),
      },
    })
  }

  const openServerApp = (app: ServerAppDirectoryEntry) => {
    selectionHaptic()
    router.push({
      pathname: '/(main)/webview-preview',
      params: {
        url: encodeURIComponent(`${API_BASE}/app/discover/apps/${encodeURIComponent(app.appKey)}`),
        title: app.name,
      },
    })
  }

  const openCommunity = (community: HubCommunity) => {
    selectionHaptic()
    router.push(`/(main)/servers/${community.slug ?? community.id}`)
  }

  const sectionItems = <T,>(items: T[], itemSection: HubSection) =>
    items.slice(0, sectionPages[itemSection] * SECTION_PAGE_SIZE)

  const hasMore = (visibleCount: number, totalCount: number) => visibleCount < totalCount

  const renderSectionContent = (view: DiscoverView) => {
    if (loadingContent) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )
    }

    if (!activeViewHasContent) {
      return (
        <GlassPanel style={styles.emptyPanel}>
          <EmptyState icon={Search} title={emptyStateTitle} description={emptyStateDescription} />
        </GlassPanel>
      )
    }

    const shownPlays = sectionItems(plays, 'plays')
    const shownBuddies = sectionItems(buddies, 'buddies')
    const shownShops = sectionItems(shops, 'shops')
    const shownServerApps = sectionItems(serverApps, 'apps')
    const shownCommunities = sectionItems(communities, 'communities')
    const cloudLimit = Math.max(sectionPages.cloud * SECTION_PAGE_SIZE - 1, 0)
    const shownCloud = cloudCards.slice(0, cloudLimit)

    return (
      <View style={styles.lanes}>
        {view === 'explore' && enabledModuleIds.has('plays') && (
          <HubLane
            icon={Play}
            title={t('discover.lanes.plays')}
            description={t('discover.laneDescriptions.plays')}
            empty={t('discover.emptyLane.plays')}
            hasContent
            hasMore={hasMore(shownPlays.length, plays.length)}
            loadMoreLabel={t('discover.loadMoreItems')}
            onLoadMore={() => loadMore('plays')}
          >
            {shownPlays.map((play) => (
              <PlayCard key={play.id} play={play} isZh={isZh} onOpen={() => openPlay(play)} />
            ))}
          </HubLane>
        )}

        {view === 'market' && enabledModuleIds.has('cloud') && (
          <HubLane
            icon={Cloud}
            title={t('discover.lanes.cloud')}
            description={t('discover.laneDescriptions.cloud')}
            empty={t('discover.emptyLane.cloud')}
            hasContent
            hasMore={hasMore(shownCloud.length + 1, cloudCards.length + 1)}
            loadMoreLabel={t('discover.loadMoreItems')}
            onLoadMore={() => loadMore('cloud')}
          >
            <CloudCashbackCard onOpen={openCloudCashback} />
            {shownCloud.map((template) => (
              <CloudTemplateCard
                key={template.slug}
                template={template}
                onOpen={() => openCloudTemplate(template)}
              />
            ))}
          </HubLane>
        )}

        {view === 'market' &&
          enabledModuleIds.has('products') &&
          productSections.map((section) => {
            const shownProducts = sectionItems(section.products, 'market')
            return (
              <HubLane
                key={section.key}
                icon={ShoppingBag}
                title={section.key === 'all-products' ? t(section.title) : section.title}
                description={t('discover.laneDescriptions.market')}
                empty={t('discover.emptyLane.market')}
                hasContent
                hasMore={hasMore(shownProducts.length, section.products.length)}
                loadMoreLabel={t('discover.loadMoreItems')}
                onLoadMore={() => loadMore('market')}
              >
                {shownProducts.map((item) => (
                  <ProductCard key={item.id} item={item} onOpen={() => openProduct(item)} />
                ))}
              </HubLane>
            )
          })}

        {view === 'market' && enabledModuleIds.has('buddies') && (
          <HubLane
            icon={Bot}
            title={t('discover.lanes.buddies')}
            description={t('discover.laneDescriptions.buddies')}
            empty={t('discover.emptyLane.buddies')}
            hasContent
            hasMore={hasMore(shownBuddies.length, buddies.length)}
            loadMoreLabel={t('discover.loadMoreItems')}
            onLoadMore={() => loadMore('buddies')}
          >
            {shownBuddies.map((item) => (
              <BuddyCard key={item.id} item={item} onOpen={() => openSeller(item.owner)} />
            ))}
          </HubLane>
        )}

        {view === 'market' && enabledModuleIds.has('shops') && (
          <HubLane
            icon={Store}
            title={t('discover.lanes.shops')}
            description={t('discover.laneDescriptions.shops')}
            empty={t('discover.emptyLane.shops')}
            hasContent
            hasMore={hasMore(shownShops.length, shops.length)}
            loadMoreLabel={t('discover.loadMoreItems')}
            onLoadMore={() => loadMore('shops')}
          >
            {shownShops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} onOpen={() => openShop(shop)} />
            ))}
          </HubLane>
        )}

        {view === 'apps' && enabledModuleIds.has('apps') && (
          <HubLane
            icon={AppWindow}
            title={t('discover.lanes.apps')}
            description={t('discover.laneDescriptions.apps')}
            empty={t('discover.emptyLane.apps')}
            hasContent
            hasMore={hasMore(shownServerApps.length, serverApps.length)}
            loadMoreLabel={t('discover.loadMoreItems')}
            onLoadMore={() => loadMore('apps')}
          >
            {shownServerApps.map((app) => (
              <ServerAppCard key={app.id} app={app} onOpen={() => openServerApp(app)} />
            ))}
          </HubLane>
        )}

        {view === 'explore' && enabledModuleIds.has('communities') && (
          <HubLane
            icon={Server}
            title={t('discover.lanes.communities')}
            description={t('discover.laneDescriptions.communities')}
            empty={t('discover.emptyLane.communities')}
            hasContent
            hasMore={hasMore(shownCommunities.length, communities.length)}
            loadMoreLabel={t('discover.loadMoreItems')}
            onLoadMore={() => loadMore('communities')}
          >
            {shownCommunities.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                joined={joinedServerIds.has(community.id)}
                pending={joinMutation.isPending}
                onEnter={() => openCommunity(community)}
                onJoin={() => {
                  selectionHaptic()
                  joinMutation.mutate({ inviteCode: community.inviteCode })
                }}
              />
            ))}
          </HubLane>
        )}
      </View>
    )
  }

  return (
    <BackgroundSurface style={styles.container}>
      <PageScroll compact contentContainerStyle={styles.content}>
        <GlassPanel style={styles.hero}>
          <View style={styles.eyebrow}>
            <Compass size={iconSize.sm} color={colors.primary} />
            <Text style={[styles.eyebrowText, { color: colors.primary }]}>
              {t('discover.mobile.eyebrow')}
            </Text>
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {t('discover.mobile.title')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            {t('discover.mobile.subtitle')}
          </Text>
          <TextField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('discover.searchPlaceholder')}
            left={<Search size={iconSize.lg} color={colors.textMuted} />}
            right={
              searchQuery.length > 0 ? (
                <IconButton
                  icon={X}
                  variant="ghost"
                  iconColor={colors.textMuted}
                  iconSize={iconSize.lg}
                  style={styles.clearButton}
                  onPress={() => {
                    selectionHaptic()
                    setSearchQuery('')
                  }}
                />
              ) : null
            }
            style={styles.searchBox}
          />
        </GlassPanel>

        <MobileTabBar
          value={activeView}
          options={visibleViews
            .map((viewConfig) => DISCOVER_VIEWS.find((view) => view.key === viewConfig.id))
            .filter((view): view is (typeof DISCOVER_VIEWS)[number] => Boolean(view))
            .map((view) => ({
              value: view.key,
              label: t(`discover.views.${view.key}`),
              icon: view.icon,
            }))}
          onChange={selectView}
          tone="primary"
        />
        {renderSectionContent(activeView)}
      </PageScroll>
    </BackgroundSurface>
  )
}

function HubLane({
  icon: Icon,
  title,
  description,
  empty,
  hasContent,
  before,
  children,
  action,
  onAction,
  hasMore,
  loadMoreLabel,
  onLoadMore,
}: {
  icon: LucideIcon
  title: string
  description: string
  empty: string
  hasContent: boolean
  before?: ReactNode
  children: ReactNode
  action?: string
  onAction?: () => void
  hasMore?: boolean
  loadMoreLabel?: string
  onLoadMore?: () => void
}) {
  const colors = useColors()
  return (
    <View style={styles.lane}>
      <View style={styles.laneHeader}>
        <View style={[styles.laneIcon, { backgroundColor: colors.tonePrimarySurface }]}>
          <Icon size={iconSize.lg} color={colors.primary} />
        </View>
        <View style={styles.laneTitleBlock}>
          <Text style={[styles.laneTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.laneDescription, { color: colors.textMuted }]} numberOfLines={2}>
            {description}
          </Text>
        </View>
        {action && onAction ? (
          <Button
            variant="glass"
            size="xs"
            iconRight={ArrowRight}
            onPress={() => {
              selectionHaptic()
              onAction()
            }}
            style={styles.laneAction}
          >
            {action}
          </Button>
        ) : null}
      </View>
      <View style={styles.cardStack}>
        {before}
        {hasContent ? (
          <>
            <WaterfallGrid>{children}</WaterfallGrid>
            {hasMore && loadMoreLabel && onLoadMore ? (
              <Button variant="glass" size="sm" onPress={onLoadMore} style={styles.loadMoreButton}>
                {loadMoreLabel}
              </Button>
            ) : null}
          </>
        ) : (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{empty}</Text>
        )}
      </View>
    </View>
  )
}

function WaterfallGrid({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean)
  const left = items.filter((_, index) => index % 2 === 0)
  const right = items.filter((_, index) => index % 2 === 1)
  return (
    <View style={styles.waterfall}>
      <View style={styles.waterfallColumn}>{left}</View>
      <View style={styles.waterfallColumn}>{right}</View>
    </View>
  )
}

function PlayCard({
  play,
  isZh,
  onOpen,
}: {
  play: PlayCatalogItem
  isZh: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const title = isZh ? play.title : play.titleEn
  const desc = isZh ? play.desc : play.descEn
  const category = isZh ? play.category : play.categoryEn
  const gated = play.status === 'gated'
  return (
    <FeedCard onPress={onOpen} accessibilityLabel={title}>
      <Visual imageUrl={play.image} icon={Play} label={title} />
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {category}
          </Text>
        </View>
        <Badge variant={gated ? 'neutral' : 'primary'} size="xs">
          {gated ? t('discover.memberPlay') : t('discover.readyPlay')}
        </Badge>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {desc}
      </Text>
      <FeedAction label={t('discover.startPlay')} />
    </FeedCard>
  )
}

function BuddyCard({ item, onOpen }: { item: HubBuddy; onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  const buddyName =
    item.buddy?.displayName ?? item.buddy?.username ?? item.owner?.displayName ?? item.title
  const ownerName = item.owner?.displayName ?? item.owner?.username ?? t('common.unknown')
  return (
    <FeedCard onPress={onOpen} accessibilityLabel={item.title}>
      <View style={styles.row}>
        <Avatar imageUrl={item.buddy?.avatarUrl} icon={Bot} label={buddyName} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {ownerName}
          </Text>
        </View>
        <Badge variant="primary" size="xs">
          {t('discover.badges.buddy')}
        </Badge>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {item.description || t('discover.noDescription')}
      </Text>
      <View style={styles.factRow}>
        <Fact icon={Coins} label={t('discover.facts.daily')} value={String(item.baseDailyRate)} />
        <Fact
          icon={ShieldCheck}
          label={t('discover.facts.rentals')}
          value={String(item.rentalCount)}
        />
      </View>
      <FeedAction label={t('discover.openBuddy')} />
    </FeedCard>
  )
}

function ProductCard({ item, onOpen }: { item: HubProduct; onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <FeedCard onPress={onOpen} accessibilityLabel={item.name}>
      <Visual imageUrl={item.imageUrl} icon={Package} label={item.name} />
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.primary }]} numberOfLines={1}>
            {item.shop.name}
          </Text>
        </View>
        <Text style={[styles.price, { color: colors.shrimpCoin }]}>{item.price}</Text>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {item.summary || item.description || t('discover.noDescription')}
      </Text>
      <FeedAction label={t('discover.openProduct')} />
    </FeedCard>
  )
}

function ShopCard({ shop, onOpen }: { shop: HubShop; onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  const owner =
    shop.server?.name ?? shop.owner?.displayName ?? shop.owner?.username ?? t('common.unknown')
  return (
    <FeedCard onPress={onOpen} accessibilityLabel={shop.name}>
      <Visual imageUrl={shop.bannerUrl ?? shop.logoUrl} icon={Store} label={shop.name} />
      <View style={styles.row}>
        <Avatar imageUrl={shop.logoUrl} icon={Store} label={shop.name} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {shop.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {owner}
          </Text>
        </View>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {shop.description || t('discover.shopFallback')}
      </Text>
      <View style={styles.row}>
        <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
          {t('discover.productCount', { count: shop.productCount })}
        </Text>
        <FeedAction label={t('discover.openShop')} />
      </View>
    </FeedCard>
  )
}

function ServerAppCard({ app, onOpen }: { app: ServerAppDirectoryEntry; onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  const leadText = app.tagline || app.description || app.summary || t('discover.noDescription')
  const categories = Array.isArray(app.categories) ? app.categories : []
  const categoryLabels = categories.length ? categories.slice(0, 4) : [t('serverApps.noCategories')]
  return (
    <FeedCard onPress={onOpen} accessibilityLabel={app.name}>
      <Visual imageUrl={app.coverImageUrl ?? app.iconUrl} icon={AppWindow} label={app.name} />
      <View style={styles.row}>
        <Avatar imageUrl={app.iconUrl} icon={AppWindow} label={app.name} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {app.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {app.appKey}
          </Text>
        </View>
        <Badge variant="primary" size="xs">
          {t('discover.sections.apps')}
        </Badge>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {leadText}
      </Text>
      <View style={styles.appCategoryRow}>
        {categoryLabels.map((category) => (
          <View
            key={category}
            style={[
              styles.appCategoryChip,
              { borderColor: colors.border, backgroundColor: colors.inputBackground },
            ]}
          >
            <Text
              style={[styles.appCategoryText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {category}
            </Text>
          </View>
        ))}
      </View>
    </FeedCard>
  )
}

function CloudCashbackCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <FeedCard onPress={onOpen} accessibilityLabel={t('discover.cashbackTitle')}>
      <View style={[styles.cloudVisual, { backgroundColor: colors.tonePrimarySurface }]}>
        <Badge variant="primary" size="sm">
          {t('discover.cashbackBadge')}
        </Badge>
        <View style={[styles.cloudIcon, { backgroundColor: colors.surface }]}>
          <Coins size={iconSize['4xl']} color={colors.primary} />
        </View>
      </View>
      <Text style={[styles.cardTitle, { color: colors.text }]}>{t('discover.cashbackTitle')}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={3}>
        {t('discover.cashbackDesc')}
      </Text>
      <FeedAction label={t('discover.cashbackAction')} />
    </FeedCard>
  )
}

function CloudTemplateCard({
  template,
  onOpen,
}: {
  template: CloudTemplateSource
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const meta = getTemplateMeta(template)
  return (
    <FeedCard onPress={onOpen} accessibilityLabel={template.name || template.slug}>
      <View style={styles.row}>
        <Avatar imageUrl={null} icon={Cloud} label={template.name || template.slug} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {template.name || template.slug}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {template.category ?? t('discover.sections.cloud')}
          </Text>
        </View>
        <Badge variant="primary" size="xs">
          {t('discover.templateCashbackHint')}
        </Badge>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {template.description || t('discover.cloudTemplateFallback')}
      </Text>
      <View style={styles.factRow}>
        <Fact
          icon={Users}
          label={t('discover.cloudMetricAgents')}
          value={String(meta.agentCount)}
        />
        <Fact
          icon={Sparkles}
          label={t('discover.cloudMetricPopularity')}
          value={formatCompact(template.deployCount ?? 0)}
        />
      </View>
      <FeedAction label={t('discover.cloudTemplateAction')} />
    </FeedCard>
  )
}

function CommunityCard({
  community,
  joined,
  pending,
  onEnter,
  onJoin,
}: {
  community: HubCommunity
  joined: boolean
  pending: boolean
  onEnter: () => void
  onJoin: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <FeedCard
      onPress={joined ? onEnter : onJoin}
      disabled={pending}
      accessibilityLabel={community.name}
    >
      <Visual imageUrl={community.bannerUrl} icon={Server} label={community.name} />
      <View style={styles.row}>
        <Avatar imageUrl={community.iconUrl} icon={Server} label={community.name} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {community.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
            {t('discover.memberCount', { count: community.memberCount })}
          </Text>
        </View>
        <Badge variant={joined ? 'success' : 'neutral'} size="xs">
          {joined ? t('discover.joined') : t('discover.public')}
        </Badge>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {community.description || t('discover.noDescription')}
      </Text>
      <FeedAction label={joined ? t('discover.enterButton') : t('discover.joinButton')} />
    </FeedCard>
  )
}

function FeedCard({
  children,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  children: ReactNode
  onPress: () => void
  disabled?: boolean
  accessibilityLabel: string
}) {
  return (
    <CardPressable
      variant="glassPanel"
      style={styles.itemCard}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </CardPressable>
  )
}

function FeedAction({ label }: { label: string }) {
  const colors = useColors()
  return (
    <View style={styles.feedAction}>
      <Text style={[styles.feedActionText, { color: colors.primary }]} numberOfLines={1}>
        {label}
      </Text>
      <ArrowRight size={iconSize.sm} color={colors.primary} strokeWidth={2.5} />
    </View>
  )
}

function Avatar({
  imageUrl,
  icon: Icon,
  label,
}: {
  imageUrl?: string | null
  icon: LucideIcon
  label: string
}) {
  const colors = useColors()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: colors.inputBackground, borderColor: colors.border },
      ]}
    >
      {imageUrl && !failed ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.avatarImage}
          accessibilityLabel={label}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon size={iconSize.xl} color={colors.primary} />
      )}
    </View>
  )
}

function Visual({
  imageUrl,
  icon: Icon,
  label,
}: {
  imageUrl?: string | null
  icon: LucideIcon
  label: string
}) {
  const colors = useColors()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])
  return (
    <View style={[styles.visual, { backgroundColor: colors.inputBackground }]}>
      {imageUrl && !failed ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.visualImage}
          accessibilityLabel={label}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon size={iconSize['4xl']} color={colors.primary} />
      )}
    </View>
  )
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  const colors = useColors()
  return (
    <View style={[styles.fact, { backgroundColor: colors.inputBackground }]}>
      <Icon size={iconSize.sm} color={colors.primary} />
      <Text style={[styles.factText, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.text }]}>{value}</Text>
    </View>
  )
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
      b.rentalCount * 6 + (b.viewCount ?? 0) - (a.rentalCount * 6 + (a.viewCount ?? 0)) ||
      b.messageFee - a.messageFee ||
      a.title.localeCompare(b.title),
  )
}

function sortProducts(products: HubProduct[]) {
  return [...products].sort(
    (a, b) =>
      b.salesCount * 6 +
        (b.ratingCount ?? 0) * 2 +
        (b.avgRating ?? 0) -
        (a.salesCount * 6 + (a.ratingCount ?? 0) * 2 + (a.avgRating ?? 0)) ||
      a.name.localeCompare(b.name),
  )
}

function sortShops(shops: HubShop[]) {
  return [...shops].sort(
    (a, b) => (b.productCount ?? 0) - (a.productCount ?? 0) || a.name.localeCompare(b.name),
  )
}

function sortServerApps(apps: ServerAppDirectoryEntry[]) {
  return [...apps].sort(
    (a, b) =>
      b.serverCount * 8 +
        b.commandCount * 2 +
        b.skillCount -
        (a.serverCount * 8 + a.commandCount * 2 + a.skillCount) || a.name.localeCompare(b.name),
  )
}

function sortCommunities(communities: HubCommunity[]) {
  return [...communities].sort(
    (a, b) =>
      (b.heatScore ?? 0) - (a.heatScore ?? 0) ||
      b.memberCount - a.memberCount ||
      a.name.localeCompare(b.name),
  )
}

function sortCloudTemplates(templates: CloudTemplateSource[]) {
  return [...templates].sort((a, b) => {
    const officialDelta = Number(b.source === 'official') - Number(a.source === 'official')
    if (officialDelta !== 0) return officialDelta
    return (b.deployCount ?? 0) - (a.deployCount ?? 0) || a.name.localeCompare(b.name)
  })
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
      current.ratingCount += product.ratingCount ?? 0
      current.avgRating += product.avgRating ?? 0
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

function buildProductSections(
  products: HubProduct[],
  categories: MarketplaceCategory[],
): MarketplaceProductSection[] {
  if (!products.length) return []
  const productByCategory = categories
    .map((category) => ({
      key: `category:${category.tag}`,
      title: category.title,
      products: products.filter((product) =>
        (product.tags ?? []).some((tag) => tag.trim() === category.tag),
      ),
    }))
    .filter((section) => section.products.length > 0)
    .slice(0, 6)

  if (productByCategory.length) return productByCategory

  return [
    {
      key: 'all-products',
      title: 'discover.lanes.market',
      products,
    },
  ]
}

function moduleHasContent(module: DiscoverModuleId, counts: Record<DiscoverModuleId, number>) {
  return counts[module] > 0
}

function getTemplateMeta(template: CloudTemplateSource) {
  const deployments =
    template.content && typeof template.content === 'object'
      ? (template.content.deployments as { namespace?: unknown; agents?: unknown[] } | undefined)
      : undefined
  return {
    namespace:
      typeof deployments?.namespace === 'string' && deployments.namespace.trim()
        ? deployments.namespace
        : template.slug,
    agentCount: Array.isArray(deployments?.agents) ? deployments.agents.length : 0,
  }
}

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.0', '')}K`
  return String(value)
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
  },
  hero: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  eyebrowText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  heroSubtitle: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  searchBox: {
    marginTop: spacing.xs,
  },
  heroCategories: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  heroCategory: {
    height: size.controlSm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderWidth: border.hairline,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
  },
  heroCategoryText: {
    maxWidth: size.compactChipMaxWidth,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  clearButton: {
    width: size.sectionCompactIcon,
    height: size.sectionCompactIcon,
  },
  tabPage: {
    paddingBottom: spacing.xl,
  },
  centerContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  lanes: {
    gap: spacing.md,
  },
  lane: {
    gap: spacing.sm,
  },
  laneHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  laneIcon: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  laneTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  laneDescription: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '700',
  },
  laneAction: {
    flexShrink: 0,
  },
  cardStack: {
    gap: spacing.sm,
  },
  loadMoreButton: {
    alignSelf: 'center',
  },
  waterfall: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  waterfallColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  emptyPanel: {
    minHeight: size.mediaPlaceholderMinHeight,
    justifyContent: 'center',
  },
  itemCard: {
    gap: spacing.sm,
  },
  feedAction: {
    minHeight: size.controlSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  feedActionText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  cardMeta: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  appCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  appCategoryChip: {
    maxWidth: size.compactChipMaxWidth,
    borderWidth: border.hairline,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  appCategoryText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  avatar: {
    width: size.controlMd,
    height: size.controlMd,
    borderWidth: border.hairline,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  visual: {
    height: size.panelStateMinHeight,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  visualImage: {
    width: '100%',
    height: '100%',
  },
  cloudVisual: {
    minHeight: size.panelStateMinHeight,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  cloudIcon: {
    marginTop: spacing.lg,
    width: size.plusPanelIcon,
    height: size.plusPanelIcon,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fact: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  factText: {
    fontSize: fontSize.micro,
    fontWeight: '800',
  },
  factValue: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
})
