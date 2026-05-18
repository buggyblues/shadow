import { Badge, Button, cn, EmptyState, GlassPanel, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  ArrowRight,
  Bot,
  Cloud,
  Coins,
  Compass,
  Loader2,
  type LucideIcon,
  Package,
  Play,
  Search,
  Server,
  Store,
} from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { ProductCard, type ProductCardProduct } from '../components/shop/ui/product-card'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'

type HubSection = 'all' | 'plays' | 'buddies' | 'products' | 'shops' | 'cloud' | 'communities'

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

const HUB_SECTIONS: Array<{ key: HubSection; icon: LucideIcon }> = [
  { key: 'all', icon: Compass },
  { key: 'plays', icon: Play },
  { key: 'buddies', icon: Bot },
  { key: 'products', icon: Package },
  { key: 'shops', icon: Store },
  { key: 'cloud', icon: Cloud },
  { key: 'communities', icon: Server },
]

const FEATURED_LIMIT = 6
const SECTION_PAGE_SIZE = 12

const initialSectionPages: Record<HubSection, number> = {
  all: 1,
  plays: 1,
  buddies: 1,
  products: 1,
  shops: 1,
  cloud: 1,
  communities: 1,
}

export function DiscoverPage() {
  const { t, i18n } = useTranslation()
  const unreadCount = useUnreadCount()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSection, setActiveSection] = useState<HubSection>('all')
  const [sectionPages, setSectionPages] = useState<Record<HubSection, number>>(initialSectionPages)
  const normalizedSearch = searchQuery.trim()
  const effectiveSearch = normalizedSearch.length >= 2 ? normalizedSearch : ''
  const searchHints = useMemo(
    () => [
      t('discover.searchHints.buddy'),
      t('discover.searchHints.service'),
      t('discover.searchHints.shop'),
      t('discover.searchHints.server'),
      t('discover.searchHints.cloud'),
    ],
    [t],
  )
  const typedSearchPlaceholder = useTypewriterPlaceholder(searchHints)

  useAppStatus({
    title: t('discover.title'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

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
  }, [effectiveSearch])

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
  const products = useMemo(() => sortProducts(hub.products), [hub.products])
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
  const visibleProducts = sectionItems(products, 'products')
  const visibleShops = sectionItems(shops, 'shops')
  const visibleCommunities = sectionItems(communities, 'communities')
  const visibleCloudCards =
    activeSection === 'all'
      ? cloudCards.slice(0, Math.max(FEATURED_LIMIT - 1, 0))
      : cloudCards.slice(0, Math.max(sectionPages.cloud * SECTION_PAGE_SIZE - 1, 0))

  const hasMore = (section: HubSection, visibleCount: number, totalCount: number) =>
    activeSection === section && visibleCount < totalCount

  const counts = {
    all:
      plays.length +
      buddies.length +
      products.length +
      shops.length +
      cloudCards.length +
      1 +
      communities.length,
    plays: plays.length,
    buddies: hub.totals.buddies,
    products: hub.totals.products,
    shops: hub.totals.shops,
    cloud: cloudCards.length + 1,
    communities: hub.totals.communities,
  }

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

  const isSearching = effectiveSearch.length > 0
  const empty =
    plays.length === 0 &&
    hub.buddies.length === 0 &&
    hub.products.length === 0 &&
    hub.shops.length === 0 &&
    (isSearching ? cloudCards.length === 0 : false) &&
    hub.communities.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <GlassPanel className="p-4 md:p-5">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
                <Compass size={14} />
                {t('discover.eyebrow')}
              </div>
              <h1 className="text-2xl font-black leading-tight text-text-primary md:text-3xl">
                {t('discover.businessTitle')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {t('discover.businessSubtitle')}
              </p>
              <div className="mt-4 max-w-xl">
                <Input
                  icon={Search}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={typedSearchPlaceholder || t('discover.searchPlaceholder')}
                  className="!rounded-lg"
                />
              </div>
            </div>
          </GlassPanel>

          <div className="flex flex-wrap gap-2">
            {HUB_SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => selectSection(section.key)}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black transition',
                    activeSection === section.key
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border-subtle bg-bg-secondary/65 text-text-muted hover:border-primary/30 hover:text-text-primary',
                  )}
                >
                  <Icon size={15} />
                  {t(`discover.sections.${section.key}`)}
                  <span className="rounded-full bg-bg-primary/70 px-1.5 py-0.5 text-[10px]">
                    {counts[section.key]}
                  </span>
                </button>
              )
            })}
          </div>

          {isLoading ? (
            <GlassPanel className="flex min-h-[360px] items-center justify-center text-primary">
              <Loader2 className="animate-spin" />
            </GlassPanel>
          ) : empty ? (
            <GlassPanel className="p-6">
              <EmptyState
                icon={Search}
                title={isSearching ? t('discover.noSearchResults') : t('discover.emptyTitle')}
                description={
                  isSearching ? t('discover.noSearchResultsDesc') : t('discover.emptyDesc')
                }
              />
            </GlassPanel>
          ) : (
            <div className="flex flex-col gap-4">
              {(activeSection === 'all' || activeSection === 'plays') && (
                <HubLane
                  title={t('discover.lanes.plays')}
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
                  title={t('discover.lanes.buddies')}
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

              {(activeSection === 'all' || activeSection === 'products') && (
                <HubLane
                  title={t('discover.lanes.products')}
                  action={activeSection === 'all' ? t('discover.viewAll') : undefined}
                  onAction={() => selectSection('products')}
                  hasMore={hasMore('products', visibleProducts.length, products.length)}
                  loadMoreLabel={t('discover.loadMoreItems')}
                  onLoadMore={() => loadMore('products')}
                >
                  {visibleProducts.length ? (
                    visibleProducts.map((item) => (
                      <ProductCard
                        key={item.id}
                        product={toProductCardProduct(item)}
                        shopName={item.shop.name}
                        serverName={item.shop.server?.name ?? null}
                        onClick={() =>
                          navigate({
                            to: '/shop/products/$productId',
                            params: { productId: item.id },
                          })
                        }
                        onShopClick={() => openShop(item.shop)}
                      />
                    ))
                  ) : (
                    <LaneEmpty text={t('discover.emptyLane.products')} />
                  )}
                </HubLane>
              )}

              {(activeSection === 'all' || activeSection === 'cloud') && (
                <HubLane
                  title={t('discover.lanes.cloud')}
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
                  title={t('discover.lanes.shops')}
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
                  title={t('discover.lanes.communities')}
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
        </div>
      </div>
    </div>
  )
}

function handleCardKey(event: KeyboardEvent, onOpen: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onOpen()
}

function useTypewriterPlaceholder(values: string[]) {
  const [hintIndex, setHintIndex] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const current = values[hintIndex] ?? values[0] ?? ''

  useEffect(() => {
    if (!current) return
    const isComplete = charCount >= current.length
    const isEmpty = charCount <= 0
    const delay = isComplete && !deleting ? 1100 : deleting ? 34 : 58

    const timer = window.setTimeout(() => {
      if (isComplete && !deleting) {
        setDeleting(true)
        return
      }
      if (isEmpty && deleting) {
        setDeleting(false)
        setHintIndex((index) => (index + 1) % Math.max(values.length, 1))
        return
      }
      setCharCount((count) => count + (deleting ? -1 : 1))
    }, delay)

    return () => window.clearTimeout(timer)
  }, [charCount, current, deleting, values.length])

  return current.slice(0, charCount) || values[0] || ''
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
  title,
  action,
  onAction,
  hasMore,
  loadMoreLabel,
  onLoadMore,
  children,
}: {
  title: string
  action?: string
  onAction?: () => void
  hasMore?: boolean
  loadMoreLabel?: string
  onLoadMore?: () => void
  children: ReactNode
}) {
  return (
    <GlassPanel className="p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-text-primary">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 text-xs font-black text-primary"
          >
            {action}
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      {hasMore && loadMoreLabel && onLoadMore ? (
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="glass" size="sm" onClick={onLoadMore}>
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </GlassPanel>
  )
}

function LaneEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-subtle bg-bg-secondary/35 p-5 text-sm font-bold text-text-muted">
      {text}
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

function toProductCardProduct(item: HubProduct): ProductCardProduct {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    summary: item.summary ?? item.description,
    description: item.description,
    basePrice: item.price,
    currency: item.currency,
    tags: [],
    salesCount: item.salesCount,
    avgRating: item.avgRating,
    ratingCount: item.ratingCount,
    imageUrl: item.imageUrl,
    entitlementConfig:
      item.type === 'physical'
        ? null
        : {
            resourceType: 'service',
          },
  }
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
