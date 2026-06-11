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
  AppWindow,
  ArrowRight,
  Bookmark,
  Bot,
  Cloud,
  Compass,
  Heart,
  LayoutGrid,
  List,
  Loader2,
  type LucideIcon,
  MessageCircle,
  Repeat2,
  Rss,
  Search,
  Server,
  ShoppingBag,
  Store,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  useEffect,
  useMemo,
  useRef,
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
import type { Message as ChatMessage } from '../components/chat/message-bubble'
import { MessageMarkdown } from '../components/chat/message-bubble/markdown'
import { resolveAttachmentMediaUrl } from '../components/chat/message-bubble/media'
import type { Attachment } from '../components/chat/message-bubble/types'
import { VoiceMessageView } from '../components/chat/message-bubble/voice-message'
import { type Thread, ThreadPanel } from '../components/chat/thread-panel'
import { UserAvatar } from '../components/common/avatar'
import {
  type CloudTemplateSource,
  DiscoverCloudTemplateCard,
  toTemplateCatalogSummary,
} from '../components/discover/cloud-template-card'
import { DiscoverPlaceholderVisual } from '../components/discover/discover-placeholder'
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
import { preloadCloudSaasApp } from '../lib/cloud-saas-app'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'

type HubSection = 'all' | 'feed' | 'buddies' | 'market' | 'shops' | 'cloud' | 'communities' | 'apps'

type DiscoverView = 'browse' | 'explore' | 'market' | 'apps' | 'cloud'
type DiscoverModuleId =
  | 'subscriptions'
  | 'communities'
  | 'cloud'
  | 'products'
  | 'buddies'
  | 'shops'
  | 'apps'
type FeedViewMode = 'timeline' | 'masonry'

interface DiscoverViewConfig {
  id: DiscoverView
  enabled: boolean
  modules: DiscoverModuleId[]
}

interface DiscoverLayoutConfig {
  views: DiscoverViewConfig[]
}

interface DiscoverRouteSearch {
  createBuddy?: string | number | boolean
  desktopCreateBuddyAt?: string | number
  feedView?: string
  tab?: string
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

interface PreviewAttachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
}

const HUB_SECTIONS: Array<{ key: HubSection; icon: LucideIcon }> = [
  { key: 'feed', icon: Rss },
  { key: 'buddies', icon: Bot },
  { key: 'market', icon: ShoppingBag },
  { key: 'shops', icon: Store },
  { key: 'cloud', icon: Cloud },
  { key: 'communities', icon: Server },
]

const DISCOVER_VIEWS: Array<{ key: DiscoverView; icon: LucideIcon; labelFallback: string }> = [
  { key: 'browse', icon: Rss, labelFallback: '浏览' },
  { key: 'explore', icon: Compass, labelFallback: '探索' },
  { key: 'apps', icon: AppWindow, labelFallback: '应用' },
  { key: 'market', icon: ShoppingBag, labelFallback: '市场' },
  { key: 'cloud', icon: Cloud, labelFallback: '云' },
]

const DISCOVER_CONFIG_SCHEMA_NAME = 'discover-page'
const DEFAULT_DISCOVER_LAYOUT: DiscoverLayoutConfig = {
  views: [
    { id: 'browse', enabled: true, modules: ['subscriptions'] },
    { id: 'explore', enabled: true, modules: ['communities'] },
    { id: 'apps', enabled: true, modules: ['apps'] },
    { id: 'market', enabled: true, modules: ['products', 'buddies', 'shops'] },
    { id: 'cloud', enabled: true, modules: ['cloud'] },
  ],
}
const DISCOVER_VIEW_ORDER = DISCOVER_VIEWS.map((view) => view.key)
const DISCOVER_MODULE_BY_VIEW: Record<DiscoverView, DiscoverModuleId[]> = {
  browse: ['subscriptions'],
  explore: ['communities'],
  market: ['products', 'buddies', 'shops'],
  apps: ['apps'],
  cloud: ['cloud'],
}
const DISCOVER_VIEW_PATH = {
  browse: '/discover/browse',
  explore: '/discover/explore',
  market: '/discover/market',
  apps: '/discover/apps',
  cloud: '/discover/cloud',
} as const satisfies Record<DiscoverView, string>

const DISCOVER_MODULE_ICON: Record<DiscoverModuleId, LucideIcon> = {
  subscriptions: Rss,
  communities: Server,
  cloud: Cloud,
  products: ShoppingBag,
  buddies: Bot,
  shops: Store,
  apps: AppWindow,
}

const DISCOVER_MODULE_ANCHOR_ID: Record<DiscoverModuleId, string> = {
  subscriptions: 'discover-module-subscriptions',
  communities: 'discover-module-communities',
  products: 'discover-module-products',
  buddies: 'discover-module-buddies',
  shops: 'discover-module-shops',
  apps: 'discover-module-apps',
  cloud: 'discover-module-cloud',
}

const SECTION_PAGE_SIZE = 12
const DISCOVER_STALE_MS = 60_000
const DISCOVER_GC_MS = 10 * 60 * 1000
const DISCOVER_FEED_VIEW_STORAGE_KEY = 'shadow.discover.feedViewMode'
const DISCOVER_DOCUMENT_PREVIEW_WIDTH = 720
const DISCOVER_TIMELINE_MEDIA_ASPECT_RATIO = '16 / 10'
const DISCOVER_VIDEO_ASPECT_RATIO = '16 / 9'
const DISCOVER_MASONRY_IMAGE_ASPECT_RATIOS = [
  '4 / 5',
  '1 / 1',
  '5 / 4',
  '4 / 3',
  '16 / 10',
] as const

const initialSectionPages: Record<HubSection, number> = {
  all: 1,
  feed: 1,
  buddies: 1,
  market: 1,
  shops: 1,
  cloud: 1,
  communities: 1,
  apps: 1,
}

function parseHubSection(value: unknown): HubSection | null {
  return HUB_SECTIONS.some((section) => section.key === value) ? (value as HubSection) : null
}

function parseDiscoverView(value: unknown): DiscoverView | null {
  const directView = normalizeDiscoverViewId(value)
  if (directView) return directView
  const section = parseHubSection(value)
  if (section === 'all' || section === 'feed') return 'browse'
  if (section === 'communities') return 'explore'
  if (section === 'cloud') return 'cloud'
  if (section === 'apps') return 'apps'
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

function parseFeedViewMode(value: unknown): FeedViewMode | null {
  return value === 'timeline' || value === 'masonry' ? value : null
}

function stableFeedIndex(value: string, modulo: number) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash % modulo
}

function getFeedMediaAspectRatio(
  item: ContentFeedItem,
  previewKind: FeedPreviewKind,
  variant: 'timeline' | 'masonry',
) {
  if (previewKind === 'video') return DISCOVER_VIDEO_ASPECT_RATIO
  if (variant === 'timeline') return DISCOVER_TIMELINE_MEDIA_ASPECT_RATIO
  return DISCOVER_MASONRY_IMAGE_ASPECT_RATIOS[
    stableFeedIndex(
      item.primaryAttachmentId ?? item.id,
      DISCOVER_MASONRY_IMAGE_ASPECT_RATIOS.length,
    )
  ]
}

function readStoredFeedViewMode(): FeedViewMode | null {
  if (typeof window === 'undefined') return null
  return parseFeedViewMode(window.localStorage.getItem(DISCOVER_FEED_VIEW_STORAGE_KEY))
}

function writeStoredFeedViewMode(value: FeedViewMode) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DISCOVER_FEED_VIEW_STORAGE_KEY, value)
}

function discoverFeedSearch(routeSearch: DiscoverRouteSearch, feedViewMode: FeedViewMode) {
  const nextSearch: Record<string, unknown> = { ...routeSearch, feedView: feedViewMode }
  delete nextSearch.tab
  return nextSearch
}

function isDiscoverModule(value: unknown): value is DiscoverModuleId {
  return (
    value === 'subscriptions' ||
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
  const routeSearch = useSearch({ strict: false }) as DiscoverRouteSearch
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.user)
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
  const [previewInitialFullscreen, setPreviewInitialFullscreen] = useState(false)
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [activeThreadParent, setActiveThreadParent] = useState<ChatMessage | null>(null)
  const [activeThreadContext, setActiveThreadContext] = useState<{
    serverId: string
    channelName: string
  } | null>(null)
  const [activeModule, setActiveModule] = useState<DiscoverModuleId | null>(null)
  const [feedViewMode, setFeedViewMode] = useState<FeedViewMode>(
    () => parseFeedViewMode(routeSearch.feedView) ?? readStoredFeedViewMode() ?? 'timeline',
  )
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

  const { data: serverAppDirectoryData, isLoading: isServerAppsLoading } = useQuery({
    queryKey: ['discover-server-apps', i18n.language, effectiveSearch],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: '72' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<ServerAppDirectoryResponse>(`/api/discover/server-apps?${params}`, {
        signal,
      })
    },
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

  useEffect(() => {
    const nextFeedViewMode = parseFeedViewMode(routeSearch.feedView)
    if (!nextFeedViewMode) return
    setFeedViewMode(nextFeedViewMode)
    writeStoredFeedViewMode(nextFeedViewMode)
  }, [routeSearch.feedView])

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
  const cloudCards = useMemo(
    () => cloudTemplates.map(toTemplateCatalogSummary).sort(sortCloudTemplates),
    [cloudTemplates],
  )
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
    navigate({
      to: DISCOVER_VIEW_PATH[view],
      search: view === 'browse' ? discoverFeedSearch(routeSearch, feedViewMode) : {},
    })
  }

  const selectFeedViewMode = (viewMode: FeedViewMode) => {
    setFeedViewMode(viewMode)
    writeStoredFeedViewMode(viewMode)
    navigate({
      to: DISCOVER_VIEW_PATH.browse,
      search: discoverFeedSearch(routeSearch, viewMode),
    })
  }

  const loadMore = (section: HubSection) => {
    setSectionPages((current) => ({ ...current, [section]: current[section] + 1 }))
  }

  const sectionItems = <T,>(items: T[], section: HubSection) =>
    items.slice(0, sectionPages[section] * SECTION_PAGE_SIZE)

  const visibleFeedItems = feedItems
  const visibleMasonryFeedItems = useMemo(
    () => visibleFeedItems.filter(isMasonryFeedItem),
    [visibleFeedItems],
  )
  const visibleBuddies = sectionItems(buddies, 'buddies')
  const visibleShops = sectionItems(shops, 'shops')
  const visibleServerApps = sectionItems(serverApps, 'apps')
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
        setPreviewInitialFullscreen(shouldOpenFeedPreviewFullscreen(item))
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

  const openContentFeedThread = async (item: ContentFeedItem) => {
    try {
      const mediaPromise = item.primaryAttachmentId
        ? resolveAttachmentMediaUrl(item.primaryAttachmentId, 'inline')
            .then((media) => media.url)
            .catch(() => '')
        : Promise.resolve('')
      const [thread, attachmentUrl] = await Promise.all([
        fetchApi<Thread>(`/api/messages/${item.messageId}/thread`, {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        mediaPromise,
      ])

      queryClient.setQueryData(['message-thread', item.messageId], thread)
      queryClient.setQueryData<Thread[]>(['threads', item.channelId], (current) => {
        const existing = current ?? []
        if (existing.some((entry) => entry.id === thread.id)) return existing
        return [thread, ...existing]
      })
      setActiveThread(thread)
      setActiveThreadParent(buildContentFeedParentMessage(item, attachmentUrl))
      setActiveThreadContext({ serverId: item.serverId, channelName: item.channel.name })
      recordContentOpened(item.id)
    } catch (error) {
      showToast(getApiErrorMessage(error, t, 'discover.timeline.commentFailed'), 'error')
    }
  }

  const openThreadAttachmentPreview = async (attachment: Attachment) => {
    try {
      const url =
        attachment.url ||
        (await resolveAttachmentMediaUrl(attachment.id, 'inline').then((media) => media.url))
      setPreviewInitialFullscreen(shouldOpenAttachmentPreviewFullscreen(attachment))
      setPreviewFile({
        id: attachment.id,
        filename: attachment.filename,
        url,
        contentType: attachment.contentType,
        size: attachment.size,
      })
    } catch (error) {
      showToast(getApiErrorMessage(error, t, 'discover.feedOpenFailed'), 'error')
    }
  }

  const closeThreadPanel = () => {
    setActiveThread(null)
    setActiveThreadParent(null)
    setActiveThreadContext(null)
  }

  const handleModuleSelect = (module: DiscoverModuleId) => {
    setActiveModule(module)
    const anchorId = DISCOVER_MODULE_ANCHOR_ID[module]
    document.getElementById(anchorId)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const handleDiscoverScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    let nextActiveModule: DiscoverModuleId | null = null
    let bestOffset = Number.NEGATIVE_INFINITY
    const topAnchor = target.getBoundingClientRect().top + 96

    sectionAnchors.forEach(({ module, ids }) => {
      ids.forEach((id) => {
        const sectionElement = document.getElementById(id)
        if (!sectionElement) return
        const sectionTop = sectionElement.getBoundingClientRect().top - topAnchor
        if (sectionTop <= 0 && sectionTop >= bestOffset) {
          bestOffset = sectionTop
          nextActiveModule = module
        }
      })
    })

    if (!nextActiveModule && sectionAnchors[0]) {
      const first = sectionAnchors[0]
      if (first.ids.some((id) => Boolean(document.getElementById(id)))) {
        nextActiveModule = first.module
      }
    }

    if (nextActiveModule && nextActiveModule !== activeModule) {
      setActiveModule(nextActiveModule)
    }

    if (activeView !== 'browse') return
    if (!hasNextContentFeedPage || isFetchingNextContentFeedPage) return
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight
    if (remaining < 720) void fetchNextContentFeedPage()
  }

  const isSearching = effectiveSearch.length > 0
  const moduleCounts = useMemo(
    () => ({
      subscriptions: feedItems.length,
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
      feedItems.length,
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

  useEffect(() => {
    if (activeView === 'cloud' && enabledModuleIds.has('cloud')) {
      preloadCloudSaasApp()
    }
  }, [activeView, enabledModuleIds])

  const activeViewConfig = visibleViews.find((view) => view.id === activeView)
  const activeModules = activeViewConfig?.modules ?? []
  const visibleModules = useMemo(
    () => activeModules.filter((module) => enabledModuleIds.has(module)),
    [activeModules, enabledModuleIds],
  )
  const activeViewHasContent = activeModules.some((module) => enabledModuleIds.has(module))
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
  const sectionAnchors = useMemo(() => {
    const anchors: Array<{ module: DiscoverModuleId; ids: string[] }> = []

    if (activeView === 'browse' && visibleModules.includes('subscriptions')) {
      anchors.push({ module: 'subscriptions', ids: ['discover-module-subscriptions'] })
    }
    if (activeView === 'explore' && visibleModules.includes('communities')) {
      anchors.push({ module: 'communities', ids: ['discover-module-communities'] })
    }
    if (activeView === 'market') {
      if (visibleModules.includes('products')) {
        anchors.push({
          module: 'products',
          ids: [
            'discover-module-products',
            ...productSections.slice(1).map((section) => `discover-module-products-${section.key}`),
          ],
        })
      }
      if (visibleModules.includes('buddies')) {
        anchors.push({ module: 'buddies', ids: ['discover-module-buddies'] })
      }
      if (visibleModules.includes('shops')) {
        anchors.push({ module: 'shops', ids: ['discover-module-shops'] })
      }
    }
    if (activeView === 'apps' && visibleModules.includes('apps')) {
      anchors.push({ module: 'apps', ids: ['discover-module-apps'] })
    }
    if (activeView === 'cloud' && visibleModules.includes('cloud')) {
      anchors.push({ module: 'cloud', ids: ['discover-module-cloud'] })
    }

    return anchors
  }, [activeView, productSections, visibleModules])
  const visibleModuleKey = visibleModules.join('|')
  useEffect(() => {
    setActiveModule((current) => {
      const fallback = visibleModules[0] ?? null
      if (current && visibleModules.includes(current)) return current
      return fallback
    })
  }, [visibleModuleKey])

  useEffect(() => {
    if (activeView !== 'browse') return
    if (parseFeedViewMode(routeSearch.feedView)) return
    navigate({
      to: DISCOVER_VIEW_PATH.browse,
      search: discoverFeedSearch(routeSearch, feedViewMode),
      replace: true,
    })
  }, [activeView, feedViewMode, navigate, routeSearch.feedView])

  const isActiveViewLoading =
    activeView === 'browse'
      ? isContentFeedLoading
      : activeView === 'explore'
        ? isLoading
        : activeView === 'market'
          ? isLoading || isMarketplaceLoading
          : activeView === 'apps'
            ? isServerAppsLoading
            : isCloudTemplatesLoading

  return (
    <>
      <div className="flex h-full min-h-0 gap-3 overflow-hidden bg-transparent px-3 text-text-primary md:gap-4 md:px-4">
        <GlassPanel
          as="aside"
          className="hidden w-[248px] shrink-0 flex-col overflow-hidden p-0 md:flex"
        >
          <div className="flex h-16 items-center border-b border-[var(--glass-line)] px-5">
            <h1 className="truncate text-xl font-black leading-none text-white">
              {t('discover.title')}
            </h1>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <DiscoverViewTabs
              t={t}
              views={visibleViews}
              activeView={activeView}
              onSelect={selectView}
            />
          </div>
        </GlassPanel>

        <GlassPanel as="main" className="flex min-w-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex min-h-16 shrink-0 items-center gap-3 bg-bg-secondary/20 px-4 backdrop-blur-xl md:h-16 lg:px-5">
            <DiscoverModuleTabs
              t={t}
              modules={visibleModules}
              activeModule={activeModule}
              onModuleSelect={handleModuleSelect}
            />
            {activeView === 'browse' && enabledModuleIds.has('subscriptions') ? (
              <FeedViewModeTabs t={t} value={feedViewMode} onChange={selectFeedViewMode} />
            ) : null}
            <MarketplaceSearchHeader
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder={t('discover.searchPlaceholder')}
              className="ml-auto shrink-0"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="h-full overflow-y-auto px-3 md:px-4" onScroll={handleDiscoverScroll}>
              {activeView !== 'browse' ? (
                <DiscoverHero
                  t={t}
                  activeView={activeView}
                  onDiyCloudOpen={() => {
                    navigate({ to: '/cloud/diy' })
                  }}
                />
              ) : null}
              {isActiveViewLoading ? (
                <div className="py-5">
                  <ContentMartSkeleton />
                </div>
              ) : !activeViewHasContent ? (
                <div className="py-5">
                  <DashboardEmptyState
                    icon={Search}
                    title={emptyStateTitle}
                    description={emptyStateDescription}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-8 py-5">
                  {activeView === 'browse' && enabledModuleIds.has('subscriptions') && (
                    <HubLane
                      id="discover-module-subscriptions"
                      icon={Rss}
                      layout={feedViewMode}
                      hasMore={Boolean(hasNextContentFeedPage)}
                      loadMoreLabel={t('discover.loadMoreItems')}
                      loadingMore={isFetchingNextContentFeedPage}
                      onLoadMore={() => void fetchNextContentFeedPage()}
                    >
                      {feedViewMode === 'timeline'
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
                              onOpenThread={() => void openContentFeedThread(item)}
                            />
                          ))
                        : visibleMasonryFeedItems.map((item) => (
                            <MasonryFeedCard
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
                              onOpenThread={() => void openContentFeedThread(item)}
                            />
                          ))}
                      {feedViewMode === 'masonry' && !visibleMasonryFeedItems.length ? (
                        <MasonryFeedEmptyState t={t} />
                      ) : null}
                    </HubLane>
                  )}

                  {activeView === 'explore' && (
                    <>
                      {enabledModuleIds.has('communities') && (
                        <HubLane
                          id="discover-module-communities"
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
                        productSections.map((section, index) => {
                          const visibleSectionProducts = sectionItems(section.products, 'market')
                          return (
                            <HubLane
                              id={
                                index === 0
                                  ? 'discover-module-products'
                                  : `discover-module-products-${section.key}`
                              }
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
                          id="discover-module-buddies"
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
                          id="discover-module-shops"
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

                  {activeView === 'apps' && enabledModuleIds.has('apps') && (
                    <HubLane
                      id="discover-module-apps"
                      icon={AppWindow}
                      title={t('discover.lanes.apps')}
                      description={t('discover.laneDescriptions.apps')}
                      hasMore={hasMore(visibleServerApps.length, serverApps.length)}
                      loadMoreLabel={t('discover.loadMoreItems')}
                      onLoadMore={() => loadMore('apps')}
                    >
                      {visibleServerApps.map((app) => (
                        <ServerAppDirectoryCard
                          key={app.id}
                          app={app}
                          t={t}
                          onOpen={() =>
                            navigate({
                              to: '/discover/apps/$appKey',
                              params: { appKey: app.appKey },
                            })
                          }
                        />
                      ))}
                    </HubLane>
                  )}

                  {activeView === 'cloud' && enabledModuleIds.has('cloud') && (
                    <HubLane
                      id="discover-module-cloud"
                      icon={Cloud}
                      title={t('discover.lanes.cloud')}
                      description={t('discover.laneDescriptions.cloud')}
                      hasMore={hasMore(visibleCloudCards.length, cloudCards.length)}
                      loadMoreLabel={t('discover.loadMoreItems')}
                      onLoadMore={() => loadMore('cloud')}
                    >
                      {visibleCloudCards.map((template) => (
                        <DiscoverCloudTemplateCard
                          key={template.name}
                          template={template}
                          agentCountLabel={t('discover.cloudMetricAgents')}
                          summaryFallback={t('discover.cloudTemplateFallback')}
                        />
                      ))}
                    </HubLane>
                  )}
                </div>
              )}
            </div>
          </div>
        </GlassPanel>
      </div>
      <QuickCreateBuddyModal
        open={showCreateBuddy}
        onClose={closeCreateBuddy}
        onSuccess={handleCreatedBuddy}
      />
      {activeThread ? (
        <ThreadPanel
          thread={activeThread}
          parentMessage={activeThreadParent}
          currentUserId={currentUser?.id ?? ''}
          serverId={activeThreadContext?.serverId}
          channelName={activeThreadContext?.channelName}
          onClose={closeThreadPanel}
          onPreviewFile={(attachment) => void openThreadAttachmentPreview(attachment)}
          forceSheet
        />
      ) : null}
      {previewFile ? (
        <FilePreviewPanel
          attachment={previewFile}
          initialFullscreen={previewInitialFullscreen}
          presentation="overlay"
          onClose={() => {
            setPreviewFile(null)
            setPreviewInitialFullscreen(false)
          }}
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
    <label
      className={cn(
        'flex h-11 min-w-[220px] items-center gap-2 rounded-[18px] border border-[var(--glass-line)] bg-bg-primary/45 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition focus-within:border-primary/45 focus-within:shadow-[0_0_0_3px_rgba(0,243,255,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] sm:w-[min(360px,32vw)]',
        className,
      )}
    >
      <Search size={17} className="shrink-0 text-text-muted" strokeWidth={2.4} />
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-text-muted"
      />
    </label>
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
    <nav className="space-y-2" aria-label={t('discover.title')}>
      {views.map((viewConfig) => {
        const view = DISCOVER_VIEWS.find((item) => item.key === viewConfig.id)
        if (!view) return null
        const Icon = view.icon
        const active = view.key === activeView
        return (
          <button
            key={view.key}
            type="button"
            onClick={() => onSelect(view.key)}
            className={cn(
              'flex h-12 w-full items-center gap-3 rounded-[18px] px-3.5 text-left text-base font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
              active
                ? 'bg-primary text-bg-primary shadow-[0_16px_32px_rgba(0,243,255,0.18)]'
                : 'text-text-secondary hover:bg-white/[0.07] hover:text-white',
            )}
          >
            <Icon size={22} className="shrink-0" />
            <span className="min-w-0 truncate">
              {t(`discover.views.${view.key}`, view.labelFallback)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function DiscoverModuleTabs({
  t,
  modules,
  activeModule,
  onModuleSelect,
}: {
  t: TFunction
  modules: DiscoverModuleId[]
  activeModule: DiscoverModuleId | null
  onModuleSelect: (module: DiscoverModuleId) => void
}) {
  if (!modules.length) return null
  const selectedModule = activeModule && modules.includes(activeModule) ? activeModule : modules[0]

  return (
    <Tabs
      value={selectedModule ?? modules[0]}
      onValueChange={(value) => {
        if (!isDiscoverModule(value)) return
        if (selectedModule === value) return
        onModuleSelect(value)
      }}
      className="min-w-0 overflow-x-auto pr-2"
    >
      <TabsList
        aria-label={t('discover.title')}
        className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[var(--glass-line)]/40 bg-bg-secondary/25 px-1 py-1"
      >
        {modules.map((module) => {
          const Icon = DISCOVER_MODULE_ICON[module]
          return (
            <TabsTrigger
              key={module}
              value={module}
              className={cn(
                'group relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full border-0 bg-transparent px-4 py-1.5 text-sm font-semibold normal-case tracking-normal text-text-secondary transition-colors',
                'data-[state=active]:bg-bg-primary/15 data-[state=active]:text-text-primary data-[state=active]:shadow-[inset_0_2px_8px_rgba(255,255,255,0.35)] data-[state=active]:ring-0',
                'hover:text-text-primary hover:bg-bg-primary/8',
              )}
            >
              <Icon size={18} />
              {t(`discover.lanes.${module === 'subscriptions' ? 'feed' : module}`)}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

function DiscoverHero({
  t,
  activeView,
  onDiyCloudOpen,
}: {
  t: TFunction
  activeView: DiscoverView
  onDiyCloudOpen: () => void
}) {
  return (
    <section className="relative -mx-3 min-h-[240px] overflow-hidden border-y border-white/10 bg-[linear-gradient(120deg,rgba(0,243,255,0.28)_0%,rgba(72,103,167,0.40)_28%,rgba(35,45,74,0.70)_65%,rgba(8,11,24,0.95)_100%] px-5 py-9 md:-mx-4 md:px-8 md:py-12 lg:py-14">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_48%),linear-gradient(90deg,rgba(255,255,255,0.08),transparent_45%,rgba(255,255,255,0.02))]" />
      <div className="relative">
        <h2 className="max-w-3xl text-[clamp(1.9rem,5vw,3rem)] font-black leading-[1.02] text-white">
          {t(`discover.hero.${activeView}.title`)}
        </h2>
        <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-white/78 md:text-lg">
          {t(`discover.hero.${activeView}.subtitle`)}
        </p>
        {activeView === 'cloud' ? (
          <div className="mt-7">
            <Button type="button" size="sm" onClick={onDiyCloudOpen}>
              {t('discover.cashbackAction')}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
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

function FeedViewModeTabs({
  t,
  value,
  onChange,
}: {
  t: TFunction
  value: FeedViewMode
  onChange: (value: FeedViewMode) => void
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== 'timeline' && nextValue !== 'masonry') return
        onChange(nextValue)
      }}
      className="shrink-0"
    >
      <TabsList
        aria-label={t('discover.feedView.label')}
        className="h-11 rounded-[18px] border border-[var(--glass-line)]/70 bg-bg-primary/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        <TabsTrigger
          value="timeline"
          className="h-9 gap-2 rounded-[14px] px-3 text-xs font-black normal-case tracking-normal"
        >
          <List size={15} />
          {t('discover.feedView.timeline')}
        </TabsTrigger>
        <TabsTrigger
          value="masonry"
          className="h-9 gap-2 rounded-[14px] px-3 text-xs font-black normal-case tracking-normal"
        >
          <LayoutGrid size={15} />
          {t('discover.feedView.masonry')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
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

function sortServerApps(apps: ServerAppDirectoryEntry[]) {
  return [...apps].sort(
    (a, b) =>
      b.serverCount * 8 +
        b.commandCount * 2 +
        b.skillCount -
        (a.serverCount * 8 + a.commandCount * 2 + a.skillCount) || a.name.localeCompare(b.name),
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
  id,
  title,
  layout = 'grid',
  toolbar,
  action,
  onAction,
  hasMore,
  loadMoreLabel,
  loadingMore,
  onLoadMore,
  children,
}: {
  id?: string
  icon: LucideIcon
  title?: string
  description?: string
  layout?: 'grid' | 'timeline' | 'masonry'
  toolbar?: ReactNode
  action?: string
  onAction?: () => void
  hasMore?: boolean
  loadMoreLabel?: string
  loadingMore?: boolean
  onLoadMore?: () => void
  children: ReactNode
}) {
  const showHeader = layout === 'grid' || Boolean(title || toolbar || action)
  return (
    <section id={id} className="scroll-mt-4">
      {showHeader ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {title ? (
              <div className="min-w-0">
                <h2 className="text-xl font-black leading-7 text-white">{title}</h2>
              </div>
            ) : null}
            {toolbar}
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
            ? 'mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/40 shadow-[0_18px_54px_rgba(0,0,0,0.20)]'
            : layout === 'masonry'
              ? 'mx-auto w-full max-w-[1720px] columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 [column-fill:_balance]'
              : 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]'
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
  showCount = true,
  showDot = false,
  onClick,
}: {
  active?: boolean
  label: string
  count?: number
  icon: LucideIcon
  showCount?: boolean
  showDot?: boolean
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
        'relative inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
        active ? 'text-primary' : 'text-text-muted hover:text-text-primary',
      )}
    >
      <Icon size={17} fill={active ? 'currentColor' : 'none'} />
      {showDot ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger shadow-[0_0_8px_rgba(255,42,85,0.7)]"
        />
      ) : null}
      {showCount && typeof count === 'number' && count > 0 ? <span>{count}</span> : null}
    </button>
  )
}

function isTaskLikeFeedItem(item: ContentFeedItem) {
  return item.contentKinds.includes('card') && !firstServerAppCard(item)
}

function useContentFeedInteractions(item: ContentFeedItem, t: TFunction) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const interactions = item.interactions ?? {
    likeCount: 0,
    viewerLiked: false,
    commentCount: 0,
    viewerSaved: item.readState === 'saved',
  }
  const invalidateFeed = () => queryClient.invalidateQueries({ queryKey: ['content-feed'] })
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

  return {
    handleShare,
    interactions,
    openAuthor,
    saveMutation,
    likeMutation,
  }
}

function FeedInteractionSection({
  item,
  t,
  onOpenThread,
  className,
}: {
  item: ContentFeedItem
  t: TFunction
  onOpenThread: () => void
  className?: string
}) {
  const { handleShare, interactions, likeMutation, openAuthor, saveMutation } =
    useContentFeedInteractions(item, t)
  const taskLike = isTaskLikeFeedItem(item)

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-text-muted">
        <div className="flex min-w-0 items-center gap-1">
          <TimelineActionButton
            active={interactions.viewerLiked}
            label={t('discover.timeline.like')}
            count={interactions.likeCount}
            icon={Heart}
            onClick={() => likeMutation.mutate()}
          />
          <TimelineActionButton
            label={t('discover.timeline.comment')}
            count={interactions.commentCount}
            icon={MessageCircle}
            showCount={!taskLike}
            showDot={taskLike && interactions.commentCount > 0}
            onClick={onOpenThread}
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
    </div>
  )
}

function ContentFeedCard({
  item,
  t,
  onOpenServer,
  onOpenChannel,
  onOpen,
  onOpenThread,
}: {
  item: ContentFeedItem
  t: TFunction
  onOpenServer: () => void
  onOpenChannel: () => void
  onOpen: () => void
  onOpenThread: () => void
}) {
  const appCard = firstServerAppCard(item)
  const hasPayload = hasContentFeedPayload(item)
  const showTitle = Boolean(appCard) || !hasPayload
  const summaryText = normalizeFeedText(item.summary)
  const displayText = summaryText || (hasPayload ? getContentFeedPlaceholderText(t, item) : '')
  const hasTextContent = showTitle || Boolean(displayText)
  const publishedAt = new Date(item.publishedAt)
  const publishedLabel = Number.isNaN(publishedAt.getTime()) ? '' : publishedAt.toLocaleDateString()

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className="group cursor-pointer border-b border-black/25 px-4 py-4 transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 md:px-5"
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
          <FeedInteractionSection item={item} t={t} onOpenThread={onOpenThread} className="mt-3" />
        </div>
      </div>
    </article>
  )
}

function MasonryFeedCard({
  item,
  t,
  onOpenServer,
  onOpenChannel,
  onOpen,
  onOpenThread,
}: {
  item: ContentFeedItem
  t: TFunction
  onOpenServer: () => void
  onOpenChannel: () => void
  onOpen: () => void
  onOpenThread: () => void
}) {
  const summaryText = normalizeFeedText(item.summary)
  const displayText = summaryText || getContentFeedPlaceholderText(t, item)
  const publishedAt = new Date(item.publishedAt)
  const publishedLabel = Number.isNaN(publishedAt.getTime()) ? '' : publishedAt.toLocaleDateString()

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className="mb-4 break-inside-avoid overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/42 shadow-[0_18px_54px_rgba(0,0,0,0.20)] backdrop-blur-xl transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <FeedAttachmentPreview item={item} onOpen={onOpen} variant="masonry" />
      <div className="space-y-3 p-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            title={t('discover.timeline.openServer')}
            onClick={(event) => {
              event.stopPropagation()
              onOpenServer()
            }}
            className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-3xl transition hover:ring-[3px] hover:ring-primary/50 hover:shadow-[0_0_16px_rgba(0,243,255,0.15)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/60"
          >
            <ServerAvatar iconUrl={item.server.iconUrl} name={item.server.name} />
          </button>
          <div className="min-w-0 flex-1 text-sm leading-5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                className="min-w-0 truncate font-black text-text-primary decoration-primary/50 underline-offset-4 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
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
            </div>
            {publishedLabel ? (
              <div className="mt-0.5 truncate text-xs font-semibold text-text-muted">
                {publishedLabel}
              </div>
            ) : null}
          </div>
        </div>
        {displayText ? (
          <p className="line-clamp-3 text-sm font-semibold leading-6 text-text-secondary">
            {displayText}
          </p>
        ) : null}
        <FeedInteractionSection item={item} t={t} onOpenThread={onOpenThread} />
      </div>
    </article>
  )
}

function MasonryFeedEmptyState({ t }: { t: TFunction }) {
  return (
    <div className="break-inside-avoid rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/42 p-6 shadow-[0_18px_54px_rgba(0,0,0,0.18)]">
      <EmptyState
        icon={LayoutGrid}
        title={t('discover.feedView.emptyTitle')}
        description={t('discover.feedView.emptyDesc')}
        className="py-10"
      />
    </div>
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

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const updateWidth = () => setWidth(Math.round(element.clientWidth))
    updateWidth()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

function ScaledHtmlPreviewCard({
  className,
  html,
  onOpen,
  title,
}: {
  className: string
  html: string
  onOpen: () => void
  title: string
}) {
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>()
  const fallbackWidth = 420
  const width = frameWidth || fallbackWidth
  const scale = Math.min(1, Math.max(0.34, width / DISCOVER_DOCUMENT_PREVIEW_WIDTH))
  const frameHeight = width * (4 / 3)
  const documentHeight = Math.max(960, Math.ceil(frameHeight / scale))

  return (
    <div
      ref={frameRef}
      role="button"
      tabIndex={0}
      className={cn(className, 'bg-white')}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        handleCardKey(event, onOpen)
      }}
    >
      <div
        className="origin-top-left"
        style={{
          height: documentHeight,
          transform: `scale(${scale})`,
          width: DISCOVER_DOCUMENT_PREVIEW_WIDTH,
        }}
      >
        <iframe
          title={title}
          srcDoc={html}
          sandbox=""
          className="pointer-events-none h-full w-full bg-white"
          loading="lazy"
          tabIndex={-1}
        />
      </div>
    </div>
  )
}

function ScaledMarkdownPreviewCard({
  className,
  onOpen,
  text,
}: {
  className: string
  onOpen: () => void
  text: string
}) {
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>()
  const fallbackWidth = 420
  const width = frameWidth || fallbackWidth
  const scale = Math.min(1, Math.max(0.34, width / DISCOVER_DOCUMENT_PREVIEW_WIDTH))
  const frameHeight = width * (4 / 3)
  const documentHeight = Math.max(960, Math.ceil(frameHeight / scale))

  return (
    <div
      ref={frameRef}
      role="button"
      tabIndex={0}
      className={cn(className, 'bg-bg-primary/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]')}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        handleCardKey(event, onOpen)
      }}
    >
      <div
        className="pointer-events-none origin-top-left overflow-hidden p-6"
        style={{
          height: documentHeight,
          transform: `scale(${scale})`,
          width: DISCOVER_DOCUMENT_PREVIEW_WIDTH,
        }}
      >
        <MessageMarkdown content={text} renderMentions={(children) => children} />
      </div>
    </div>
  )
}

function ProgressiveFeedImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
  }, [src])

  return (
    <>
      <DiscoverPlaceholderVisual
        className={cn(
          'absolute inset-0 transition-opacity duration-500 ease-out motion-reduce:transition-none',
          loaded ? 'opacity-0' : 'opacity-100',
        )}
      />
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-[filter,opacity,transform] duration-700 ease-out motion-reduce:transition-none',
          loaded
            ? 'scale-100 opacity-100 blur-0'
            : 'scale-[1.035] opacity-0 blur-2xl motion-reduce:opacity-100 motion-reduce:blur-0 motion-reduce:scale-100',
        )}
      />
    </>
  )
}

function ProgressiveFeedVideo({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
  }, [src])

  return (
    <>
      <DiscoverPlaceholderVisual
        className={cn(
          'absolute inset-0 transition-opacity duration-500 ease-out motion-reduce:transition-none',
          loaded ? 'opacity-0' : 'opacity-100',
        )}
      />
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        onLoadedData={() => setLoaded(true)}
        className={cn(
          'absolute inset-0 h-full w-full bg-black object-cover transition-[filter,opacity,transform] duration-700 ease-out motion-reduce:transition-none',
          loaded
            ? 'scale-100 opacity-100 blur-0'
            : 'scale-[1.035] opacity-0 blur-2xl motion-reduce:opacity-100 motion-reduce:blur-0 motion-reduce:scale-100',
        )}
      />
    </>
  )
}

function FeedAttachmentPreview({
  item,
  onOpen,
  variant = 'timeline',
}: {
  item: ContentFeedItem
  onOpen: () => void
  variant?: 'timeline' | 'masonry'
}) {
  const previewKind = getFeedPreviewKind(item)
  const needsMediaUrl = ['image', 'video', 'markdown', 'html', 'file'].includes(previewKind)
  const previewOffset = variant === 'masonry' ? 'mt-0' : 'mt-3'
  const embeddedFrameClass =
    variant === 'masonry'
      ? 'rounded-none border-0 border-b border-white/10'
      : 'rounded-2xl border border-white/10'
  const documentFrameClass = cn(
    previewOffset,
    'aspect-[3/4] w-full cursor-pointer overflow-hidden transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
    variant === 'masonry' ? 'max-w-none rounded-none border-0' : 'max-w-[420px]',
    embeddedFrameClass,
  )
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
  const mediaFrameStyle = { aspectRatio: getFeedMediaAspectRatio(item, previewKind, variant) }
  const mediaFrameClass = cn(
    previewOffset,
    'relative w-full cursor-pointer overflow-hidden bg-black/20 transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
    embeddedFrameClass,
    'max-h-[520px]',
  )
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
  if (previewKind === 'image' && item.primaryAttachmentId) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={item.title}
        className={mediaFrameClass}
        style={mediaFrameStyle}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          handleCardKey(event, onOpen)
        }}
      >
        {mediaUrl ? (
          <ProgressiveFeedImage src={mediaUrl} />
        ) : (
          <DiscoverPlaceholderVisual className="absolute inset-0" />
        )}
      </div>
    )
  }
  if (previewKind === 'video' && item.primaryAttachmentId) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={item.title}
        className={cn(mediaFrameClass, 'bg-black')}
        style={mediaFrameStyle}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          handleCardKey(event, onOpen)
        }}
      >
        {mediaUrl ? (
          <ProgressiveFeedVideo src={mediaUrl} />
        ) : (
          <DiscoverPlaceholderVisual className="absolute inset-0" />
        )}
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
        className={cn(
          previewOffset,
          variant === 'masonry' &&
            'overflow-hidden border-b border-white/10 p-3 [&>div]:!w-full [&>div]:!min-w-0 [&>div]:!max-w-full [&_button]:!w-full [&_button]:!min-w-0 [&_button]:!max-w-full [&_[aria-label]]:!min-w-0 [&_[aria-label]]:!max-w-full [&_[aria-label]]:!overflow-hidden',
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <VoiceMessageView attachment={attachment} />
      </div>
    )
  }
  if (previewKind === 'html') {
    return (
      <ScaledHtmlPreviewCard
        className={documentFrameClass}
        html={htmlQuery.data ?? ''}
        onOpen={onOpen}
        title={item.title}
      />
    )
  }
  if (previewKind === 'markdown') {
    const text = markdownQuery.data ?? item.summary ?? ''
    return text ? (
      <ScaledMarkdownPreviewCard className={documentFrameClass} onOpen={onOpen} text={text} />
    ) : null
  }
  if (item.primaryAttachmentId) {
    const attachment = contentFeedAttachment(item, mediaUrl ?? '')
    return (
      <div
        className={cn(
          previewOffset,
          variant === 'masonry'
            ? 'overflow-hidden border-b border-white/10 bg-bg-primary/25 p-3 [&>div]:!w-full [&>div]:!min-w-0 [&>div]:!max-w-full [&>div]:!box-border'
            : 'w-fit',
        )}
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

function buildContentFeedParentMessage(item: ContentFeedItem, attachmentUrl = ''): ChatMessage {
  const authorName =
    item.author.displayName?.trim() || item.author.username?.trim() || item.author.id
  const content = normalizeFeedText(item.summary)
  const attachments = item.primaryAttachmentId ? [contentFeedAttachment(item, attachmentUrl)] : []

  return {
    id: item.messageId,
    content,
    channelId: item.channelId,
    authorId: item.author.id,
    threadId: null,
    replyToId: null,
    isEdited: false,
    createdAt: item.publishedAt,
    updatedAt: item.publishedAt,
    author: {
      id: item.author.id,
      username: item.author.username,
      displayName: authorName,
      avatarUrl: item.author.avatarUrl ?? null,
      isBot: Boolean(item.author.isBot),
    },
    attachments,
    reactions: [],
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

function isMasonryFeedItem(item: ContentFeedItem) {
  const kind = getFeedPreviewKind(item)
  if (kind === 'markdown')
    return Boolean(item.primaryAttachmentId || normalizeFeedText(item.summary))
  if (
    kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'html' ||
    kind === 'file'
  ) {
    return Boolean(item.primaryAttachmentId)
  }
  return false
}

function shouldOpenFeedPreviewFullscreen(item: ContentFeedItem) {
  const kind = getFeedPreviewKind(item)
  const contentType = (item.primaryAttachmentContentType ?? '').toLowerCase()
  if (kind === 'html' || kind === 'markdown') return true
  if (contentType.includes('pdf')) return true
  return (
    kind === 'file' &&
    !contentType.startsWith('image/') &&
    !contentType.startsWith('video/') &&
    !contentType.startsWith('audio/')
  )
}

function shouldOpenAttachmentPreviewFullscreen(attachment: Attachment) {
  const contentType = attachment.contentType.toLowerCase()
  const filename = attachment.filename.toLowerCase()
  if (
    contentType.includes('html') ||
    contentType.includes('markdown') ||
    contentType.includes('pdf') ||
    filename.endsWith('.html') ||
    filename.endsWith('.htm') ||
    filename.endsWith('.md') ||
    filename.endsWith('.markdown') ||
    filename.endsWith('.pdf')
  ) {
    return true
  }
  return (
    !contentType.startsWith('image/') &&
    !contentType.startsWith('video/') &&
    !contentType.startsWith('audio/')
  )
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

function ServerAppDirectoryCard({
  app,
  t,
  onOpen,
}: {
  app: ServerAppDirectoryEntry
  t: TFunction
  onOpen: () => void
}) {
  const leadText = app.tagline ?? app.description ?? app.summary ?? t('discover.noDescription')
  const categories = Array.isArray(app.categories) ? app.categories : []
  const categoryLabels = categories.length ? categories.slice(0, 4) : [t('serverApps.noCategories')]
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className="group cursor-pointer overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/48 shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-bg-tertiary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-bg-primary/55">
        <CardImageWithFallback
          imageUrl={app.coverImageUrl}
          alt=""
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-3">
          <AppIconWithFallback imageUrl={app.iconUrl} label={app.name} />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black leading-6 text-white">{app.name}</h3>
            <p className="truncate text-xs font-bold text-white/72">{app.appKey}</p>
          </div>
        </div>
      </div>
      <div className="flex min-h-[188px] flex-col p-4">
        <p className="line-clamp-3 text-sm font-semibold leading-6 text-text-secondary">
          {leadText}
        </p>
        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
          {categoryLabels.map((category) => (
            <span
              key={category}
              className="rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-1 text-xs font-bold text-text-secondary"
            >
              {category}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}

function CardImageWithFallback({
  imageUrl,
  alt,
  className,
}: {
  imageUrl?: string | null
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])
  if (!imageUrl || failed) return <DiscoverPlaceholderVisual className={className} />
  return <img src={imageUrl} alt={alt} className={className} onError={() => setFailed(true)} />
}

function AppIconWithFallback({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])
  return (
    <div className="relative flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/15 bg-bg-primary text-primary">
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={label}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <DiscoverPlaceholderVisual className="absolute inset-0" />
          <AppWindow size={24} className="relative text-primary" />
        </>
      )}
    </div>
  )
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
      className="group cursor-pointer overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/48 shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-bg-tertiary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-bg-primary/55">
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
          <span className="rounded bg-black/55 px-2.5 py-1 text-[11px] font-black text-white">
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

function CommunityHubCard({
  community,
  joined,
  t,
  onEnter,
  onJoin,
}: {
  community: HubCommunity
  joined: boolean
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
      className="cursor-pointer overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/48 shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-bg-tertiary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <div className="relative">
        <CardVisual imageUrl={community.bannerUrl} label={community.name} />
        <div className="pointer-events-none absolute left-4 -bottom-7">
          <AvatarImage imageUrl={community.iconUrl} label={community.name} />
        </div>
      </div>
      <div className="flex min-h-[172px] flex-col px-4 pb-4 pt-9">
        <div className="mb-3 flex items-start justify-between gap-3">
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
        <p className="h-16 min-h-16 max-h-16 overflow-hidden text-sm leading-5 text-text-secondary">
          {community.description || t('discover.noDescription')}
        </p>
      </div>
    </article>
  )
}

function AvatarImage({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
  return <ServerAvatar iconUrl={imageUrl} name={label} className="w-[56px] h-[56px] rounded-3xl" />
}

function CardVisual({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
  return (
    <div className="relative h-40 overflow-hidden border-b border-white/10 bg-bg-primary/55">
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <DiscoverPlaceholderVisual />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-secondary/85 via-transparent to-transparent" />
    </div>
  )
}
