import {
  Badge,
  Button,
  cn,
  EmptyState,
  GlassPanel,
  ServerAvatar,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@shadowob/ui'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import {
  ArrowRight,
  Bookmark,
  Bot,
  Cloud,
  Coins,
  Compass,
  Heart,
  Loader2,
  type LucideIcon,
  MessageCircle,
  Play,
  Repeat2,
  Rss,
  Search,
  Server,
  ShoppingBag,
  Store,
} from 'lucide-react'
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { QuickCreateBuddyModal } from '../components/buddy-management/quick-create-buddy-modal'
import type { Agent } from '../components/buddy-management/types'
import {
  BuddyListingCard,
  type BuddyListingCardData,
} from '../components/buddy-market/buddy-listing-card'
import { FileCard } from '../components/chat/file-card'
import { FilePreviewPanel } from '../components/chat/file-preview-panel'
import { MessageMarkdown } from '../components/chat/message-bubble/markdown'
import { resolveAttachmentMediaUrl } from '../components/chat/message-bubble/media'
import type { Attachment } from '../components/chat/message-bubble/types'
import { VoiceMessageView } from '../components/chat/message-bubble/voice-message'
import { UserAvatar } from '../components/common/avatar'
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
import { useSocketEvent } from '../hooks/use-socket'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { getApiErrorMessage } from '../lib/api-errors'
import { copyToClipboardSilent } from '../lib/clipboard'
import { showToast } from '../lib/toast'

type HubSection =
  | 'all'
  | 'feed'
  | 'plays'
  | 'buddies'
  | 'market'
  | 'shops'
  | 'cloud'
  | 'communities'

type DiscoverView = 'browse' | 'explore' | 'market' | 'cloud'
type DiscoverModuleId =
  | 'subscriptions'
  | 'plays'
  | 'communities'
  | 'cloud'
  | 'products'
  | 'buddies'
  | 'shops'

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

interface MarketplaceProductSection {
  key: string
  title: string
  products: HubProduct[]
}

type ContentFeedKind = 'image' | 'html' | 'pdf' | 'file' | 'voice' | 'card'
type ContentFeedReadState = 'unread' | 'seen' | 'opened' | 'saved' | 'hidden' | 'dismissed'

interface ServerAppCardRef {
  id?: string | null
  kind: 'server_app'
  appKey?: string | null
  title?: string | null
  description?: string | null
  label?: string | null
  action?: {
    mode?: 'open_app'
    path?: string | null
  }
}

interface ContentFeedItem {
  id: string
  messageId: string
  channelId: string
  serverId: string
  title: string
  summary: string | null
  contentKinds: ContentFeedKind[]
  primaryAttachmentId: string | null
  primaryAttachmentContentType: string | null
  primaryAttachmentSize: number | null
  primaryAttachmentDurationMs?: number | null
  attachmentIds: string[]
  cardRefs: ServerAppCardRef[]
  readState: ContentFeedReadState
  publishedAt: string
  channel: {
    id: string
    name: string
    type: string
    serverId: string | null
  }
  server: {
    id: string
    name: string
    slug?: string | null
    iconUrl?: string | null
  }
  author: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  }
  interactions?: {
    likeCount: number
    viewerLiked: boolean
    commentCount: number
    viewerSaved: boolean
  }
}

interface ContentFeedPage {
  items: ContentFeedItem[]
  hasMore: boolean
  nextCursor: string | null
}

interface MessageThread {
  id: string
  name: string
  channelId: string
  parentMessageId: string
  creatorId?: string
  isArchived?: boolean
  createdAt: string
  updatedAt?: string
}

interface MessageThreadMessage {
  id: string
  content: string
  channelId: string
  authorId: string
  replyToId: string | null
  createdAt: string
  updatedAt: string
  author: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  } | null
}

interface PreviewAttachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
}

const HUB_SECTIONS: Array<{ key: HubSection; icon: LucideIcon }> = [
  { key: 'feed', icon: Rss },
  { key: 'plays', icon: Play },
  { key: 'buddies', icon: Bot },
  { key: 'market', icon: ShoppingBag },
  { key: 'shops', icon: Store },
  { key: 'cloud', icon: Cloud },
  { key: 'communities', icon: Server },
]

const DISCOVER_VIEWS: Array<{ key: DiscoverView; icon: LucideIcon; labelFallback: string }> = [
  { key: 'browse', icon: Rss, labelFallback: '浏览' },
  { key: 'explore', icon: Compass, labelFallback: '探索' },
  { key: 'market', icon: ShoppingBag, labelFallback: '市场' },
  { key: 'cloud', icon: Cloud, labelFallback: '云' },
]

const DISCOVER_CONFIG_SCHEMA_NAME = 'discover-page'
const DEFAULT_DISCOVER_LAYOUT: DiscoverLayoutConfig = {
  views: [
    { id: 'browse', enabled: true, modules: ['subscriptions'] },
    { id: 'explore', enabled: true, modules: ['plays', 'communities'] },
    { id: 'market', enabled: true, modules: ['products', 'buddies', 'shops'] },
    { id: 'cloud', enabled: true, modules: ['cloud'] },
  ],
}
const DISCOVER_VIEW_ORDER = DISCOVER_VIEWS.map((view) => view.key)
const DISCOVER_MODULE_BY_VIEW: Record<DiscoverView, DiscoverModuleId[]> = {
  browse: ['subscriptions'],
  explore: ['plays', 'communities'],
  market: ['products', 'buddies', 'shops'],
  cloud: ['cloud'],
}
const DISCOVER_VIEW_PATH = {
  browse: '/discover/browse',
  explore: '/discover/explore',
  market: '/discover/market',
  cloud: '/discover/cloud',
} as const satisfies Record<DiscoverView, string>

const SECTION_PAGE_SIZE = 12
const DISCOVER_STALE_MS = 60_000
const DISCOVER_GC_MS = 10 * 60 * 1000

const initialSectionPages: Record<HubSection, number> = {
  all: 1,
  feed: 1,
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

function parseDiscoverView(value: unknown): DiscoverView | null {
  const directView = normalizeDiscoverViewId(value)
  if (directView) return directView
  const section = parseHubSection(value)
  if (section === 'all' || section === 'feed') return 'browse'
  if (section === 'plays' || section === 'communities') return 'explore'
  if (section === 'cloud') return 'cloud'
  if (section === 'buddies' || section === 'market' || section === 'shops') return 'market'
  return null
}

function parseDiscoverViewFromPath(pathname: string): DiscoverView | null {
  const path = pathname.replace(/^\/app(?=\/|$)/, '').replace(/\/+$/, '')
  const [, viewSegment] = path.split('/discover/')
  return normalizeDiscoverViewId(viewSegment)
}

function normalizeDiscoverViewId(value: unknown): DiscoverView | null {
  if (value === 'subscriptions' || value === 'feed' || value === 'all') return 'browse'
  if (DISCOVER_VIEW_ORDER.includes(value as DiscoverView)) return value as DiscoverView
  return null
}

function isDiscoverModule(value: unknown): value is DiscoverModuleId {
  return (
    value === 'subscriptions' ||
    value === 'plays' ||
    value === 'communities' ||
    value === 'cloud' ||
    value === 'products' ||
    value === 'buddies' ||
    value === 'shops'
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
    const viewId = normalizeDiscoverViewId(view.id)
    if (!viewId) continue
    const allowedModules = DISCOVER_MODULE_BY_VIEW[viewId]
    const modules = Array.isArray(view.modules)
      ? view.modules.filter(
          (module): module is DiscoverModuleId =>
            isDiscoverModule(module) && allowedModules.includes(module),
        )
      : allowedModules
    normalized.set(viewId, {
      id: viewId,
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

export function DiscoverPage() {
  const { t, i18n } = useTranslation()
  const unreadCount = useUnreadCount()
  const navigate = useNavigate()
  const location = useLocation()
  const routeSearch = useSearch({ strict: false }) as {
    createBuddy?: string | number | boolean
    desktopCreateBuddyAt?: string | number
    tab?: string
  }
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeView, setActiveView] = useState<DiscoverView>(
    () =>
      parseDiscoverViewFromPath(location.pathname) ??
      parseDiscoverView(routeSearch.tab) ??
      'browse',
  )
  const [sectionPages, setSectionPages] = useState<Record<HubSection, number>>(initialSectionPages)
  const [showCreateBuddy, setShowCreateBuddy] = useState(false)
  const [previewFile, setPreviewFile] = useState<PreviewAttachment | null>(null)
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
    queryFn: ({ signal }) => fetchApi<ServerEntry[]>('/api/servers', { signal }),
    staleTime: DISCOVER_STALE_MS,
    gcTime: DISCOVER_GC_MS,
  })

  const { data: discoverConfigData } = useQuery({
    queryKey: ['discover-page-config'],
    queryFn: ({ signal }) =>
      fetchApi<{ data: unknown; version: number; publishedAt: string | null }>(
        `/api/v1/config/${DISCOVER_CONFIG_SCHEMA_NAME}?env=prod`,
        { signal },
      ),
    retry: false,
    staleTime: DISCOVER_STALE_MS,
    gcTime: DISCOVER_GC_MS,
  })

  const {
    data: contentFeedData,
    isLoading: isContentFeedLoading,
    fetchNextPage: fetchNextContentFeedPage,
    hasNextPage: hasNextContentFeedPage,
    isFetchingNextPage: isFetchingNextContentFeedPage,
  } = useInfiniteQuery({
    queryKey: ['content-feed', 'discover'],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '30', sort: 'latest' })
      if (typeof pageParam === 'string' && pageParam) params.set('cursor', pageParam)
      return fetchApi<ContentFeedPage>(`/api/content-feed?${params}`, { signal })
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: DISCOVER_GC_MS,
  })

  useSocketEvent('content_feed:new', () => {
    void queryClient.invalidateQueries({ queryKey: ['content-feed'] })
  })

  useSocketEvent('reaction:updated', () => {
    void queryClient.invalidateQueries({ queryKey: ['content-feed'] })
  })

  useSocketEvent<{ threadId?: string | null }>('message:new', (message) => {
    if (!message.threadId) return
    void queryClient.invalidateQueries({ queryKey: ['content-feed'] })
    void queryClient.invalidateQueries({ queryKey: ['thread-messages', message.threadId] })
  })

  const { data, isLoading } = useQuery({
    queryKey: ['discover-commerce', effectiveSearch],
    queryFn: ({ signal }) =>
      fetchApi<DiscoverCommerceResponse>(
        `/api/discover/business?limit=48${effectiveSearch ? `&q=${encodeURIComponent(effectiveSearch)}` : ''}`,
        { signal },
      ),
    staleTime: DISCOVER_STALE_MS,
    gcTime: DISCOVER_GC_MS,
  })

  const { data: marketplaceData, isLoading: isMarketplaceLoading } = useQuery({
    queryKey: ['discover-marketplace-products', effectiveSearch],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: '72' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<MarketplaceProductsResponse>(`/api/discover/marketplace/products?${params}`, {
        signal,
      })
    },
    staleTime: DISCOVER_STALE_MS,
    gcTime: DISCOVER_GC_MS,
  })

  const { data: marketplaceCategoriesData } = useQuery({
    queryKey: ['discover-marketplace-categories', effectiveSearch],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: '12' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<MarketplaceCategoriesResponse>(
        `/api/discover/marketplace/categories?${params}`,
        { signal },
      )
    },
    staleTime: DISCOVER_STALE_MS,
    gcTime: DISCOVER_GC_MS,
  })

  const { data: playData } = useQuery({
    queryKey: ['discover-plays'],
    queryFn: ({ signal }) =>
      fetchApi<{ plays: PlayCatalogItem[] }>('/api/play/catalog', { signal }),
    staleTime: DISCOVER_STALE_MS,
    gcTime: DISCOVER_GC_MS,
  })

  const { data: cloudTemplates = [], isLoading: isCloudTemplatesLoading } = useQuery({
    queryKey: ['discover-cloud-templates', i18n.language, effectiveSearch],
    queryFn: ({ signal }) =>
      fetchApi<CloudTemplateSource[]>(
        `/api/cloud-saas/templates?locale=${encodeURIComponent(i18n.language)}${effectiveSearch ? `&q=${encodeURIComponent(effectiveSearch)}` : ''}`,
        { signal },
      ),
    retry: false,
    staleTime: DISCOVER_STALE_MS,
    gcTime: DISCOVER_GC_MS,
  })

  useEffect(() => {
    setSectionPages(initialSectionPages)
  }, [effectiveSearch])

  useEffect(() => {
    const nextView =
      parseDiscoverViewFromPath(location.pathname) ?? parseDiscoverView(routeSearch.tab)
    if (nextView) setActiveView(nextView)
  }, [location.pathname, routeSearch.tab])

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
    setActiveView(visibleViews[0]?.id ?? 'browse')
  }, [activeView, visibleViews])

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])
  const hub = data ?? {
    buddies: [],
    products: [],
    shops: [],
    communities: [],
    totals: { buddies: 0, products: 0, shops: 0, communities: 0 },
  }
  const rawFeedItems = useMemo(
    () => contentFeedData?.pages.flatMap((page) => page.items) ?? [],
    [contentFeedData?.pages],
  )
  const feedItems = useMemo(
    () => filterContentFeed(rawFeedItems, effectiveSearch),
    [effectiveSearch, rawFeedItems],
  )
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

  const selectView = (view: DiscoverView) => {
    setActiveView(view)
    setSectionPages(initialSectionPages)
    navigate({ to: DISCOVER_VIEW_PATH[view] })
  }

  const loadMore = (section: HubSection) => {
    setSectionPages((current) => ({ ...current, [section]: current[section] + 1 }))
  }

  const sectionItems = <T,>(items: T[], section: HubSection) =>
    items.slice(0, sectionPages[section] * SECTION_PAGE_SIZE)

  const visibleFeedItems = feedItems
  const visiblePlays = sectionItems(plays, 'plays')
  const visibleBuddies = sectionItems(buddies, 'buddies')
  const visibleShops = sectionItems(shops, 'shops')
  const visibleCommunities = sectionItems(communities, 'communities')
  const visibleCloudCards = cloudCards.slice(
    0,
    Math.max(sectionPages.cloud * SECTION_PAGE_SIZE - 1, 0),
  )

  const hasMore = (visibleCount: number, totalCount: number) => visibleCount < totalCount

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

  const recordContentOpened = (itemId: string) => {
    void fetchApi(`/api/content-feed/${itemId}/events`, {
      method: 'POST',
      body: JSON.stringify({ state: 'opened' }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ['content-feed'] }))
      .catch(() => undefined)
  }

  const openContentFeedItem = async (item: ContentFeedItem) => {
    try {
      const appCard = firstServerAppCard(item)
      if (appCard?.appKey) {
        const path =
          appCard.action?.mode === 'open_app' && typeof appCard.action.path === 'string'
            ? appCard.action.path.trim()
            : ''
        recordContentOpened(item.id)
        navigate({
          to: '/servers/$serverSlug/apps/$appKey',
          params: { serverSlug: item.server.slug ?? item.server.id, appKey: appCard.appKey },
          search: path.startsWith('/') && !path.startsWith('//') ? { appPath: path } : {},
        })
        return
      }

      if (item.primaryAttachmentId) {
        const media = await resolveAttachmentMediaUrl(item.primaryAttachmentId, 'inline')
        setPreviewFile({
          id: item.primaryAttachmentId,
          filename: item.title,
          url: media.url,
          contentType: item.primaryAttachmentContentType ?? 'application/octet-stream',
          size: item.primaryAttachmentSize ?? 0,
        })
        recordContentOpened(item.id)
        return
      }

      recordContentOpened(item.id)
      navigate({
        to: '/servers/$serverSlug/channels/$channelId',
        params: { serverSlug: item.server.slug ?? item.server.id, channelId: item.channelId },
        search: { msg: item.messageId },
      })
    } catch (error) {
      showToast(getApiErrorMessage(error, t, 'discover.feedOpenFailed'), 'error')
    }
  }

  const handleDiscoverScroll = (event: UIEvent<HTMLDivElement>) => {
    if (activeView !== 'browse') return
    if (!hasNextContentFeedPage || isFetchingNextContentFeedPage) return
    const target = event.currentTarget
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight
    if (remaining < 720) void fetchNextContentFeedPage()
  }

  const isSearching = effectiveSearch.length > 0
  const moduleCounts = useMemo(
    () => ({
      subscriptions: feedItems.length,
      plays: plays.length,
      communities: communities.length,
      cloud: cloudCards.length,
      products: products.length,
      buddies: buddies.length,
      shops: shops.length,
    }),
    [
      buddies.length,
      cloudCards.length,
      communities.length,
      feedItems.length,
      plays.length,
      products.length,
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
  const activeModules = activeViewConfig?.modules ?? []
  const activeViewHasContent = activeModules.some((module) => enabledModuleIds.has(module))
  const isActiveViewLoading =
    activeView === 'browse'
      ? isContentFeedLoading
      : activeView === 'explore'
        ? isLoading
        : activeView === 'market'
          ? isLoading || isMarketplaceLoading
          : isCloudTemplatesLoading

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="grid h-full min-h-0 w-full grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 md:grid-cols-[184px_minmax(0,1fr)] md:grid-rows-[56px_minmax(0,1fr)] lg:grid-cols-[196px_minmax(0,1fr)]">
          <MarketplaceSearchHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t('discover.searchPlaceholder')}
            className="md:col-span-2"
          />

          <GlassPanel className="min-h-0 overflow-hidden !rounded-[18px] border-white/10 bg-[#050508]/58 p-2 md:p-3">
            <DiscoverViewTabs
              t={t}
              views={visibleViews}
              activeView={activeView}
              onSelect={selectView}
            />
          </GlassPanel>

          <GlassPanel className="min-h-0 overflow-hidden !rounded-[18px] border-white/10 bg-[#050508]/62 shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
            <div
              className="h-full overflow-y-auto px-3 py-2 md:px-5 md:py-4"
              onScroll={handleDiscoverScroll}
            >
              {isActiveViewLoading ? (
                <ContentMartSkeleton />
              ) : !activeViewHasContent ? (
                <DashboardEmptyState
                  icon={Search}
                  title={isSearching ? t('discover.noSearchResults') : t('discover.emptyTitle')}
                  description={
                    isSearching ? t('discover.noSearchResultsDesc') : t('discover.emptyDesc')
                  }
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {activeView === 'browse' && enabledModuleIds.has('subscriptions') && (
                    <HubLane
                      icon={Rss}
                      layout="timeline"
                      hasMore={Boolean(hasNextContentFeedPage)}
                      loadMoreLabel={t('discover.loadMoreItems')}
                      loadingMore={isFetchingNextContentFeedPage}
                      onLoadMore={() => void fetchNextContentFeedPage()}
                    >
                      {visibleFeedItems.length
                        ? visibleFeedItems.map((item) => (
                            <ContentFeedCard
                              key={item.id}
                              item={item}
                              t={t}
                              onOpenServer={() =>
                                navigate({
                                  to: '/servers/$serverSlug',
                                  params: { serverSlug: item.server.slug ?? item.server.id },
                                })
                              }
                              onOpenChannel={() =>
                                navigate({
                                  to: '/servers/$serverSlug/channels/$channelId',
                                  params: {
                                    serverSlug: item.server.slug ?? item.server.id,
                                    channelId: item.channelId,
                                  },
                                  search: { msg: item.messageId },
                                })
                              }
                              onOpen={() => void openContentFeedItem(item)}
                            />
                          ))
                        : null}
                    </HubLane>
                  )}

                  {activeView === 'explore' && (
                    <>
                      {enabledModuleIds.has('plays') && (
                        <HubLane
                          icon={Play}
                          title={t('discover.lanes.plays')}
                          description={t('discover.laneDescriptions.plays')}
                          hasMore={hasMore(visiblePlays.length, plays.length)}
                          loadMoreLabel={t('discover.loadMoreItems')}
                          onLoadMore={() => loadMore('plays')}
                        >
                          {visiblePlays.map((play) => (
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
                          ))}
                        </HubLane>
                      )}

                      {enabledModuleIds.has('communities') && (
                        <HubLane
                          icon={Server}
                          title={t('discover.lanes.communities')}
                          description={t('discover.laneDescriptions.communities')}
                          hasMore={hasMore(visibleCommunities.length, communities.length)}
                          loadMoreLabel={t('discover.loadMoreItems')}
                          onLoadMore={() => loadMore('communities')}
                        >
                          {visibleCommunities.map((community) => (
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
                              onJoin={() =>
                                joinMutation.mutate({ inviteCode: community.inviteCode })
                              }
                            />
                          ))}
                        </HubLane>
                      )}
                    </>
                  )}

                  {activeView === 'market' && (
                    <>
                      {enabledModuleIds.has('products') &&
                        productSections.map((section) => {
                          const visibleSectionProducts = sectionItems(section.products, 'market')
                          return (
                            <HubLane
                              key={section.key}
                              icon={ShoppingBag}
                              title={
                                section.key === 'all-products' ? t(section.title) : section.title
                              }
                              description={t('discover.laneDescriptions.market')}
                              hasMore={hasMore(
                                visibleSectionProducts.length,
                                section.products.length,
                              )}
                              loadMoreLabel={t('discover.loadMoreItems')}
                              onLoadMore={() => loadMore('market')}
                            >
                              {visibleSectionProducts.map((item) => (
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
                              ))}
                            </HubLane>
                          )
                        })}

                      {enabledModuleIds.has('buddies') && (
                        <HubLane
                          icon={Bot}
                          title={t('discover.lanes.buddies')}
                          description={t('discover.laneDescriptions.buddies')}
                          hasMore={hasMore(visibleBuddies.length, buddies.length)}
                          loadMoreLabel={t('discover.loadMoreItems')}
                          onLoadMore={() => loadMore('buddies')}
                        >
                          {visibleBuddies.map((item) => (
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
                          ))}
                        </HubLane>
                      )}

                      {enabledModuleIds.has('shops') && (
                        <HubLane
                          icon={Store}
                          title={t('discover.lanes.shops')}
                          description={t('discover.laneDescriptions.shops')}
                          hasMore={hasMore(visibleShops.length, shops.length)}
                          loadMoreLabel={t('discover.loadMoreItems')}
                          onLoadMore={() => loadMore('shops')}
                        >
                          {visibleShops.map((shop) => (
                            <DiscoverShopCard
                              key={shop.id}
                              shop={toDiscoverShopCardData(shop, t)}
                              actionLabel={t('discover.openShop')}
                              onOpen={() => openShop(shop)}
                            />
                          ))}
                        </HubLane>
                      )}
                    </>
                  )}

                  {activeView === 'cloud' && enabledModuleIds.has('cloud') && (
                    <HubLane
                      icon={Cloud}
                      title={t('discover.lanes.cloud')}
                      description={t('discover.laneDescriptions.cloud')}
                      hasMore={hasMore(visibleCloudCards.length + 1, cloudCards.length + 1)}
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
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
      <QuickCreateBuddyModal
        open={showCreateBuddy}
        onClose={closeCreateBuddy}
        onSuccess={handleCreatedBuddy}
      />
      {previewFile ? (
        <FilePreviewPanel
          attachment={previewFile}
          presentation="overlay"
          onClose={() => setPreviewFile(null)}
        />
      ) : null}
    </>
  )
}

function MarketplaceSearchHeader({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  className,
}: {
  searchQuery: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  className?: string
}) {
  return (
    <GlassPanel
      className={cn(
        'flex h-14 items-center gap-3 !rounded-[18px] px-5 transition-shadow focus-within:shadow-[0_0_0_3px_rgba(0,198,209,0.20),var(--nf-shadow-card,var(--shadow-soft))]',
        className,
      )}
    >
      <Search size={20} className="shrink-0 text-text-muted" strokeWidth={2.5} />
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        className="min-w-0 flex-1 bg-transparent text-sm font-bold text-text-primary outline-none placeholder:text-text-muted/70"
      />
    </GlassPanel>
  )
}

function DiscoverViewTabs({
  t,
  views,
  activeView,
  onSelect,
}: {
  t: TFunction
  views: DiscoverViewConfig[]
  activeView: DiscoverView
  onSelect: (view: DiscoverView) => void
}) {
  return (
    <Tabs
      value={activeView}
      onChange={(value) => onSelect(value as DiscoverView)}
      className="block"
    >
      <TabsList className="!contents !h-auto !rounded-none !border-0 !bg-transparent !p-0 !shadow-none !backdrop-blur-0">
        {views.map((viewConfig) => {
          const view = DISCOVER_VIEWS.find((item) => item.key === viewConfig.id)
          if (!view) return null
          const Icon = view.icon
          return (
            <TabsTrigger
              key={view.key}
              value={view.key}
              className="h-11 min-w-[104px] justify-start gap-2 rounded-xl px-3 text-sm font-bold normal-case tracking-normal text-text-secondary data-[state=active]:!border-transparent data-[state=active]:bg-primary data-[state=active]:text-bg-primary data-[state=active]:!shadow-none md:w-full md:min-w-0"
            >
              <Icon size={16} />
              <span className="truncate">
                {t(`discover.views.${view.key}`, view.labelFallback)}
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

function DashboardEmptyState({
  icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <EmptyState icon={icon} title={title} description={description} className="py-16" />
    </div>
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

function firstServerAppCard(item: ContentFeedItem) {
  return item.cardRefs.find(
    (card) => card.kind === 'server_app' && typeof card.appKey === 'string' && card.appKey,
  )
}

function filterContentFeed(items: ContentFeedItem[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return items
  return items.filter((item) =>
    [
      item.title,
      item.summary,
      item.channel.name,
      item.server.name,
      item.author.displayName,
      item.author.username,
      ...item.contentKinds,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .some((value) => value.toLowerCase().includes(normalized)),
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
  layout = 'grid',
  action,
  onAction,
  hasMore,
  loadMoreLabel,
  loadingMore,
  onLoadMore,
  children,
}: {
  icon: LucideIcon
  title?: string
  description?: string
  layout?: 'grid' | 'timeline'
  action?: string
  onAction?: () => void
  hasMore?: boolean
  loadMoreLabel?: string
  loadingMore?: boolean
  onLoadMore?: () => void
  children: ReactNode
}) {
  return (
    <section className="py-3">
      {layout === 'grid' ? (
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
      ) : null}
      <div
        className={
          layout === 'timeline'
            ? 'mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#050508]/42'
            : 'grid gap-4 xl:grid-cols-2 min-[2400px]:grid-cols-3'
        }
      >
        {children}
      </div>
      {hasMore && loadMoreLabel && onLoadMore ? (
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="glass" size="sm" onClick={onLoadMore}>
            {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

type FeedPreviewKind = 'image' | 'video' | 'audio' | 'markdown' | 'html' | 'app' | 'file'
const CONTENT_FEED_LIKE_EMOJI = '❤️'

function TimelineActionButton({
  active,
  label,
  count,
  icon: Icon,
  onClick,
}: {
  active?: boolean
  label: string
  count?: number
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
        active ? 'text-primary' : 'text-text-muted hover:text-text-primary',
      )}
    >
      <Icon size={17} fill={active ? 'currentColor' : 'none'} />
      {typeof count === 'number' && count > 0 ? <span>{count}</span> : null}
    </button>
  )
}

function ContentFeedCard({
  item,
  t,
  onOpenServer,
  onOpenChannel,
  onOpen,
}: {
  item: ContentFeedItem
  t: TFunction
  onOpenServer: () => void
  onOpenChannel: () => void
  onOpen: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const interactions = item.interactions ?? {
    likeCount: 0,
    viewerLiked: false,
    commentCount: 0,
    viewerSaved: item.readState === 'saved',
  }
  const appCard = firstServerAppCard(item)
  const hasPayload = hasContentFeedPayload(item)
  const showTitle = Boolean(appCard) || !hasPayload
  const summaryText = normalizeFeedText(item.summary)
  const displayText = summaryText || (hasPayload ? getContentFeedPlaceholderText(t, item) : '')
  const hasTextContent = showTitle || Boolean(displayText)
  const publishedAt = new Date(item.publishedAt)
  const publishedLabel = Number.isNaN(publishedAt.getTime()) ? '' : publishedAt.toLocaleDateString()
  const invalidateFeed = () => queryClient.invalidateQueries({ queryKey: ['content-feed'] })
  const threadQuery = useQuery({
    queryKey: ['message-thread', item.messageId],
    enabled: commentOpen,
    staleTime: 20_000,
    queryFn: ({ signal }) =>
      fetchApi<MessageThread>(`/api/messages/${item.messageId}/thread`, {
        method: 'POST',
        body: JSON.stringify({}),
        signal,
      }),
  })
  const threadMessagesQuery = useQuery({
    queryKey: ['thread-messages', threadQuery.data?.id],
    enabled: commentOpen && Boolean(threadQuery.data?.id),
    staleTime: 20_000,
    queryFn: ({ signal }) =>
      fetchApi<MessageThreadMessage[]>(`/api/threads/${threadQuery.data!.id}/messages?limit=20`, {
        signal,
      }),
  })
  const likeMutation = useMutation({
    mutationFn: () =>
      interactions.viewerLiked
        ? fetchApi(
            `/api/messages/${item.messageId}/reactions/${encodeURIComponent(CONTENT_FEED_LIKE_EMOJI)}`,
            {
              method: 'DELETE',
            },
          )
        : fetchApi(`/api/messages/${item.messageId}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji: CONTENT_FEED_LIKE_EMOJI }),
          }),
    onSuccess: invalidateFeed,
    onError: (error) =>
      showToast(getApiErrorMessage(error, t, 'discover.timeline.likeFailed'), 'error'),
  })
  const saveMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/content-feed/${item.id}/events`, {
        method: 'POST',
        body: JSON.stringify({ state: interactions.viewerSaved ? 'seen' : 'saved' }),
      }),
    onSuccess: invalidateFeed,
    onError: (error) =>
      showToast(getApiErrorMessage(error, t, 'discover.timeline.saveFailed'), 'error'),
  })
  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const thread =
        threadQuery.data ??
        (await fetchApi<MessageThread>(`/api/messages/${item.messageId}/thread`, {
          method: 'POST',
          body: JSON.stringify({}),
        }))
      const message = await fetchApi<MessageThreadMessage>(`/api/threads/${thread.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      return { message, thread }
    },
    onSuccess: ({ thread }) => {
      setCommentText('')
      setCommentOpen(true)
      queryClient.setQueryData(['message-thread', item.messageId], thread)
      void queryClient.invalidateQueries({ queryKey: ['thread-messages', thread.id] })
      void invalidateFeed()
    },
    onError: (error) =>
      showToast(getApiErrorMessage(error, t, 'discover.timeline.commentFailed'), 'error'),
  })

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = commentText.trim()
    if (!content) return
    commentMutation.mutate(content)
  }

  const handleShare = async () => {
    const url = contentFeedMessageUrl(item)
    try {
      if (navigator.share) {
        await navigator.share({ title: item.summary ?? item.server.name, url })
      } else {
        await copyToClipboardSilent(url)
        showToast(t('discover.timeline.shareCopied'), 'success')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      showToast(getApiErrorMessage(error, t, 'discover.timeline.shareFailed'), 'error')
    }
  }

  const openAuthor = () => {
    navigate({ to: '/profile/$userId', params: { userId: item.author.id } })
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className="group cursor-pointer border-b border-white/10 px-4 py-4 transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 md:px-5"
    >
      <div className="flex min-w-0 gap-3">
        <SourceAvatar item={item} centered={!hasTextContent} onOpen={onOpenServer} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'flex min-w-0 items-center gap-1.5 text-sm leading-5',
              !hasTextContent && 'h-14',
            )}
          >
            <button
              type="button"
              className="min-w-0 truncate font-bold text-text-primary decoration-primary/50 underline-offset-4 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
              title={t('discover.timeline.openServer')}
              onClick={(event) => {
                event.stopPropagation()
                onOpenServer()
              }}
            >
              {item.server.name}
            </button>
            <span className="shrink-0 text-text-muted">/</span>
            <button
              type="button"
              className="min-w-0 truncate font-bold text-text-secondary decoration-primary/50 underline-offset-4 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
              title={t('discover.timeline.openChannel')}
              onClick={(event) => {
                event.stopPropagation()
                onOpenChannel()
              }}
            >
              #{item.channel.name}
            </button>
            {publishedLabel ? (
              <>
                <span className="shrink-0 text-text-muted">·</span>
                <span className="shrink-0 text-text-muted">{publishedLabel}</span>
              </>
            ) : null}
          </div>
          {showTitle ? (
            <h3 className="mt-1 line-clamp-3 text-[1.03rem] font-extrabold leading-6 text-text-primary group-hover:text-primary">
              {appCard?.title ?? item.title}
            </h3>
          ) : null}
          {displayText ? (
            <p className="mt-1 line-clamp-4 text-sm leading-6 text-text-secondary">{displayText}</p>
          ) : null}
          <FeedAttachmentPreview item={item} onOpen={onOpen} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-text-muted">
            <div className="flex min-w-0 items-center gap-1">
              <TimelineActionButton
                active={interactions.viewerLiked}
                label={t('discover.timeline.like')}
                count={interactions.likeCount}
                icon={Heart}
                onClick={() => likeMutation.mutate()}
              />
              <TimelineActionButton
                active={commentOpen}
                label={t('discover.timeline.comment')}
                count={interactions.commentCount}
                icon={MessageCircle}
                onClick={() => setCommentOpen((value) => !value)}
              />
              <TimelineActionButton
                active={interactions.viewerSaved}
                label={t('discover.timeline.save')}
                icon={Bookmark}
                onClick={() => saveMutation.mutate()}
              />
              <TimelineActionButton
                label={t('discover.timeline.share')}
                icon={Repeat2}
                onClick={() => void handleShare()}
              />
            </div>
            <FeedAuthorBadge item={item} onOpen={openAuthor} />
          </div>
          {commentOpen ? (
            <div
              className="mt-3 space-y-3"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <FeedReplies
                replies={threadMessagesQuery.data ?? []}
                isLoading={threadQuery.isLoading || threadMessagesQuery.isLoading}
              />
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.stopPropagation()
                  handleCommentSubmit(event)
                }}
              >
                <input
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder={t('discover.timeline.commentPlaceholder')}
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-bg-primary/70 px-4 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/50"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={!commentText.trim() || commentMutation.isPending}
                >
                  {commentMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    t('discover.timeline.sendComment')
                  )}
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function FeedAuthorBadge({ item, onOpen }: { item: ContentFeedItem; onOpen: () => void }) {
  const authorName =
    item.author.displayName?.trim() || item.author.username?.trim() || item.author.id
  const authorHandle = item.author.username?.trim() || authorName

  return (
    <button
      type="button"
      title={`@${authorHandle}`}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className="inline-flex max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-xs font-black text-text-secondary transition hover:border-primary/35 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <UserAvatar
        userId={item.author.id}
        avatarUrl={item.author.avatarUrl}
        displayName={authorName}
        size="xs"
        className="h-5 w-5"
      />
      <span className="min-w-0 truncate">@{authorHandle}</span>
    </button>
  )
}

function SourceAvatar({
  item,
  centered,
  onOpen,
}: {
  item: ContentFeedItem
  centered?: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      title={item.server.name}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className={cn(
        'flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-visible rounded-3xl transition hover:ring-[3px] hover:ring-primary/50 hover:shadow-[0_0_16px_rgba(0,243,255,0.15)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/60',
        centered ? 'mt-0' : 'mt-0.5',
      )}
    >
      <ServerAvatar iconUrl={item.server.iconUrl} name={item.server.name} />
    </button>
  )
}

function FeedReplies({
  replies,
  isLoading,
}: {
  replies: MessageThreadMessage[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
        <Loader2 size={13} className="animate-spin" />
      </div>
    )
  }

  if (!replies.length) return null

  return (
    <div className="space-y-2 border-l border-white/10 pl-3">
      {replies.map((reply) => {
        const name =
          reply.author?.displayName?.trim() || reply.author?.username?.trim() || reply.authorId
        const initial = name.trim().slice(0, 1) || '#'
        return (
          <div key={reply.id} className="flex gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-black text-text-secondary">
              {reply.author?.avatarUrl ? (
                <img
                  src={reply.author.avatarUrl}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                initial.toUpperCase()
              )}
            </span>
            <div className="min-w-0 rounded-2xl bg-white/[0.045] px-3 py-2">
              <div className="truncate text-xs font-black text-text-primary">{name}</div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-text-secondary">
                {reply.content}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FeedAttachmentPreview({ item, onOpen }: { item: ContentFeedItem; onOpen: () => void }) {
  const previewKind = getFeedPreviewKind(item)
  const needsMediaUrl = ['image', 'video', 'markdown', 'html', 'file'].includes(previewKind)
  const mediaQuery = useQuery({
    queryKey: ['content-feed-attachment-media', item.primaryAttachmentId, previewKind],
    enabled: Boolean(item.primaryAttachmentId) && needsMediaUrl,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      if (!item.primaryAttachmentId) throw new Error('missing attachment')
      if (previewKind === 'image') {
        try {
          return await resolveAttachmentMediaUrl(item.primaryAttachmentId, 'inline', 'preview')
        } catch {
          return resolveAttachmentMediaUrl(item.primaryAttachmentId, 'inline')
        }
      }
      if (previewKind === 'file') {
        return resolveAttachmentMediaUrl(item.primaryAttachmentId, 'attachment')
      }
      return resolveAttachmentMediaUrl(item.primaryAttachmentId, 'inline')
    },
  })
  const mediaUrl = mediaQuery.data?.url ?? null
  const markdownQuery = useQuery({
    queryKey: ['content-feed-markdown-preview', mediaUrl],
    enabled: previewKind === 'markdown' && Boolean(mediaUrl),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const response = await fetch(mediaUrl as string)
      if (!response.ok) throw new Error('failed to load markdown preview')
      return (await response.text()).slice(0, 1800)
    },
  })
  const htmlQuery = useQuery({
    queryKey: ['content-feed-html-preview', mediaUrl],
    enabled: previewKind === 'html' && Boolean(mediaUrl),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const response = await fetch(mediaUrl as string)
      if (!response.ok) throw new Error('failed to load html preview')
      return (await response.text()).slice(0, 120_000)
    },
  })

  if (previewKind === 'app') return <ServerAppPreview item={item} />
  if (previewKind === 'image' && mediaUrl) {
    return (
      <div className={cn('mt-3', 'overflow-hidden rounded-2xl border border-white/10 bg-black/20')}>
        <img src={mediaUrl} alt="" loading="lazy" className="max-h-[520px] w-full object-cover" />
      </div>
    )
  }
  if (previewKind === 'video' && mediaUrl) {
    return (
      <div
        className={cn(
          'mt-3',
          'relative overflow-hidden rounded-2xl border border-white/10 bg-black',
        )}
      >
        <video
          src={mediaUrl}
          muted
          playsInline
          preload="metadata"
          className="max-h-[520px] w-full bg-black object-cover"
        />
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
          <span className="h-12 w-12 rounded-full bg-black/55 shadow-[0_8px_22px_rgba(0,0,0,0.35)]">
            <span className="ml-[19px] mt-[14px] block h-0 w-0 border-y-[10px] border-l-[15px] border-y-transparent border-l-white" />
          </span>
        </span>
      </div>
    )
  }
  if (previewKind === 'audio' && item.primaryAttachmentId) {
    const attachment = contentFeedAttachment(item)
    return (
      <div
        className="mt-3"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <VoiceMessageView attachment={attachment} />
      </div>
    )
  }
  if (previewKind === 'html') {
    return (
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'mt-3',
          'aspect-[3/4] w-full max-w-[420px] cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
        )}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          handleCardKey(event, onOpen)
        }}
      >
        <div className="h-[161.29%] w-[161.29%] origin-top-left scale-[0.62]">
          <iframe
            title={item.title}
            srcDoc={htmlQuery.data ?? ''}
            sandbox=""
            className="pointer-events-none h-full w-full bg-white"
            loading="lazy"
            tabIndex={-1}
          />
        </div>
      </div>
    )
  }
  if (previewKind === 'markdown') {
    const text = markdownQuery.data ?? item.summary ?? ''
    return text ? (
      <div
        className={cn(
          'mt-3',
          'max-h-72 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-4',
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MessageMarkdown content={text} renderMentions={(children) => children} />
      </div>
    ) : null
  }
  if (item.primaryAttachmentId) {
    const attachment = contentFeedAttachment(item, mediaUrl ?? '')
    return (
      <div
        className="mt-3 w-fit"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <FileCard
          filename={attachment.filename}
          url={attachment.url || '#'}
          contentType={attachment.contentType}
          size={attachment.size}
          onClick={onOpen}
        />
      </div>
    )
  }
  return null
}

function ServerAppPreview({ item }: { item: ContentFeedItem }) {
  const appCard = firstServerAppCard(item)
  if (!appCard) return null
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
      <p className="line-clamp-2 text-sm font-extrabold text-text-primary">
        {appCard.title ?? item.title}
      </p>
      {appCard.description ? (
        <p className="mt-1 line-clamp-3 text-sm leading-6 text-text-muted">{appCard.description}</p>
      ) : null}
    </div>
  )
}

function contentFeedAttachment(item: ContentFeedItem, url = ''): Attachment {
  const contentType = item.primaryAttachmentContentType ?? 'application/octet-stream'
  return {
    id: item.primaryAttachmentId ?? item.id,
    messageId: item.messageId,
    filename: item.title,
    url,
    contentType,
    size: item.primaryAttachmentSize ?? 0,
    kind:
      item.contentKinds.includes('voice') || contentType.startsWith('audio/')
        ? 'voice'
        : item.contentKinds.includes('image') || contentType.startsWith('image/')
          ? 'image'
          : 'file',
    durationMs: item.primaryAttachmentDurationMs ?? null,
  }
}

function getFeedPreviewKind(item: ContentFeedItem): FeedPreviewKind {
  const contentType = (item.primaryAttachmentContentType ?? '').toLowerCase()
  const title = item.title.toLowerCase()
  if (contentType.startsWith('image/') || item.contentKinds.includes('image')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/') || item.contentKinds.includes('voice')) return 'audio'
  if (contentType.includes('html') || title.endsWith('.html') || title.endsWith('.htm'))
    return 'html'
  if (
    contentType.includes('markdown') ||
    title.endsWith('.md') ||
    title.endsWith('.markdown') ||
    title.endsWith('.mdown')
  ) {
    return 'markdown'
  }
  if (firstServerAppCard(item)) return 'app'
  return 'file'
}

function normalizeFeedText(value?: string | null) {
  return (value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasContentFeedPayload(item: ContentFeedItem) {
  return Boolean(
    item.primaryAttachmentId ||
      item.attachmentIds.length > 0 ||
      item.cardRefs.length > 0 ||
      item.contentKinds.length > 0,
  )
}

function getContentFeedPlaceholderText(t: TFunction, item: ContentFeedItem) {
  const kind = getFeedPreviewKind(item)
  if (kind === 'image') return t('discover.timeline.placeholderImage')
  if (kind === 'video') return t('discover.timeline.placeholderVideo')
  if (kind === 'audio') return t('discover.timeline.placeholderAudio')
  if (kind === 'html') return t('discover.timeline.placeholderHtml')
  if (kind === 'markdown') return t('discover.timeline.placeholderMarkdown')
  if (kind === 'app') return t('discover.timeline.placeholderApp')
  const contentType = (item.primaryAttachmentContentType ?? '').toLowerCase()
  if (contentType.includes('pdf') || item.contentKinds.includes('pdf')) {
    return t('discover.timeline.placeholderPdf')
  }
  return t('discover.timeline.placeholderFile')
}

function contentFeedMessageUrl(item: ContentFeedItem) {
  const serverSlug = item.server.slug ?? item.server.id
  const path = `/servers/${encodeURIComponent(serverSlug)}/channels/${encodeURIComponent(item.channelId)}?msg=${encodeURIComponent(item.messageId)}`
  return `${window.location.origin}${path}`
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
