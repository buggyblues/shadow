import { Badge, Button, Card, cn, EmptyState, GlassHeader, GlassPanel, Input } from '@shadowob/ui'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Flame, Hash, Search, Server, Users, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { getCatAvatar } from '../lib/pixel-cats'

type FeedItemType = 'server' | 'channel' | 'rental'
type FilterType = 'all' | 'servers' | 'channels' | 'rentals'

interface FeedItem {
  id: string
  type: FeedItemType
  heatScore: number
  data: ServerData | ChannelData | RentalData
}

interface ServerData {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  memberCount: number
  isPublic: boolean
  inviteCode: string
  createdAt: string
}

interface ChannelData {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
  }
  memberCount: number
  lastMessage: {
    content: string
    createdAt: string
  } | null
}

interface RentalData {
  contractId: string
  contractNo: string
  startedAt: string
  expiresAt: string | null
  listing: {
    id: string
    title: string
    description: string | null
    deviceTier: string | null
    osType: string | null
    hourlyRate: number
    tags: string[] | null
  } | null
  tenant: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  owner: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  agent: {
    id: string
    name: string
    status: string
    lastHeartbeat: string | null
  } | null
}

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

interface FeedResponse {
  items: FeedItem[]
  total: number
  hasMore: boolean
}

/* ── Neon Frost glass helpers ── */
const neonSpinner =
  'animate-spin w-8 h-8 rounded-full border-2 border-primary border-t-transparent drop-shadow-[0_0_6px_rgba(0,243,255,0.5)]'

const FILTER_ITEMS = [
  { key: 'all', labelKey: 'discover.filters.all', icon: Flame },
  { key: 'servers', labelKey: 'discover.filters.servers', icon: Server },
  { key: 'channels', labelKey: 'discover.filters.channels', icon: Hash },
  { key: 'rentals', labelKey: 'discover.filters.rentals', icon: Zap },
] as const

export function DiscoverPage() {
  const { t } = useTranslation()
  const unreadCount = useUnreadCount()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [isSearching, setIsSearching] = useState(false)

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

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])

  // 无限滚动加载推荐流
  const {
    data: feedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: feedLoading,
  } = useInfiniteQuery({
    queryKey: ['discover-feed', activeFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetchApi<FeedResponse>(
        `/api/discover/feed?type=${activeFilter}&limit=20&offset=${pageParam}`,
      )
      return res
    },
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage.hasMore) return undefined
      return pages.length * 20
    },
    initialPageParam: 0,
  })

  // 搜索
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['discover-search', searchQuery, activeFilter],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return { items: [] }
      const res = await fetchApi<{ items: FeedItem[] }>(
        `/api/discover/search?q=${encodeURIComponent(searchQuery)}&type=${activeFilter}`,
      )
      return res
    },
    enabled: isSearching && searchQuery.length >= 2,
  })

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string }) =>
      fetchApi<{ id: string; slug?: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: data.slug ?? data.id },
      })
    },
  })

  // 合并所有页面数据
  const allItems = useMemo(() => {
    if (isSearching) return searchResults?.items || []
    return feedData?.pages.flatMap((page) => page.items) || []
  }, [feedData, searchResults, isSearching])

  // 监听滚动加载更多
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSearching) return
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage({})
        }
      },
      { threshold: 0.1 },
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => observerRef.current?.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isSearching])

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (value.length >= 2) setIsSearching(true)
    else setIsSearching(false)
  }

  const activeFilterItem = FILTER_ITEMS.find((item) => item.key === activeFilter) ?? FILTER_ITEMS[0]
  const ActiveFilterIcon = activeFilterItem.icon

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      {/* Ambient orb blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[180px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[160px]" />
      </div>

      <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
        <GlassPanel as="aside" className="hidden w-[240px] shrink-0 md:flex md:flex-col">
          <div className="border-b border-border-subtle px-4 py-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Flame size={20} className="text-primary" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black tracking-tight text-text-primary">
                  {t('discover.title')}
                </h1>
                <p className="truncate text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  {t('discover.filters.all')}
                </p>
              </div>
            </div>

            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-muted"
              />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={t('discover.searchPlaceholder')}
                className="w-full rounded-xl border-border-subtle bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 px-3 py-3">
            {FILTER_ITEMS.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveFilter(key as FilterType)
                  setIsSearching(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-[13px] font-bold transition-all duration-200',
                  activeFilter === key
                    ? 'bg-primary/15 text-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary',
                )}
              >
                <Icon
                  size={16}
                  strokeWidth={activeFilter === key ? 2.8 : 2.2}
                  className={cn(
                    'shrink-0 transition-colors',
                    activeFilter === key ? 'text-primary' : 'text-text-muted',
                  )}
                />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </GlassPanel>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="desktop-drag-titlebar md:hidden px-4 pt-4">
            <GlassPanel className="border-border-subtle/70 px-6 py-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Flame size={20} className="text-primary" strokeWidth={2.5} />
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-text-primary">
                    {t('discover.title')}
                  </h1>
                </div>

                <div className="hidden w-72 md:block">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-muted"
                    />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder={t('discover.searchPlaceholder')}
                      className="w-full rounded-xl border-border-subtle bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto scrollbar-hidden">
                {FILTER_ITEMS.map(({ key, labelKey, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveFilter(key as FilterType)
                      setIsSearching(false)
                    }}
                    className={cn(
                      'flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all active:scale-95',
                      activeFilter === key
                        ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
                        : 'text-text-muted hover:bg-bg-tertiary/50 hover:text-text-primary',
                    )}
                  >
                    <Icon size={14} strokeWidth={activeFilter === key ? 3 : 2} />
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </GlassPanel>
          </div>

          <GlassPanel className="flex-1 min-h-0 overflow-hidden md:h-full">
            <GlassHeader className="hidden justify-between gap-4 md:flex">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary/50 text-primary shadow-inner">
                  <ActiveFilterIcon size={16} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-black uppercase tracking-tight text-text-primary">
                    {t(activeFilterItem.labelKey)}
                  </h2>
                  <p className="truncate text-xs text-text-muted">
                    {isSearching ? t('discover.searchPlaceholder') : t('discover.title')}
                  </p>
                </div>
              </div>

              <Badge variant="neutral" className="shrink-0">
                {allItems.length}
              </Badge>
            </GlassHeader>

            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-6xl px-4 py-4 md:p-6">
                {isSearching && searchLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 animate-bounce">
                        <div className="h-6 w-6 rounded-full bg-primary" />
                      </div>
                      <span className="animate-pulse text-xs font-black uppercase tracking-widest text-primary">
                        {t('common.loading')}...
                      </span>
                    </div>
                  </div>
                ) : allItems.length === 0 ? (
                  <EmptyState
                    icon={Search}
                    title={isSearching ? t('discover.noSearchResults') : t('discover.emptyTitle')}
                    description={
                      isSearching ? t('discover.noSearchResultsDesc') : t('discover.emptyDesc')
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {allItems.map((item, index) => (
                      <FeedCard
                        key={`${item.type}-${item.id}-${index}`}
                        item={item}
                        joinedServerIds={joinedServerIds}
                        joinMutation={joinMutation}
                        navigate={navigate}
                        t={t}
                      />
                    ))}

                    {!isSearching && (
                      <div ref={loadMoreRef} className="col-span-full py-6 text-center">
                        {isFetchingNextPage ? (
                          <div className="mx-auto h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        ) : hasNextPage ? (
                          <span className="text-xs font-black uppercase tracking-widest text-text-muted/40">
                            {t('discover.loadMore')}
                          </span>
                        ) : (
                          <span className="text-xs font-black uppercase tracking-widest text-text-muted/40">
                            {t('discover.noMore')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </GlassPanel>
        </main>
      </div>
    </div>
  )
}

// ── Feed Card ──
function FeedCard({
  item,
  joinedServerIds,
  joinMutation,
  navigate,
  t,
}: {
  item: FeedItem
  joinedServerIds: Set<string>
  joinMutation: {
    mutate: (variables: { inviteCode: string }) => void
    isPending: boolean
  }
  navigate: ReturnType<typeof useNavigate>
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (item.type === 'server') {
    const server = item.data as ServerData
    const isJoined = joinedServerIds.has(server.id)

    return (
      <Card
        variant="glass"
        hoverable
        onClick={() => {
          if (isJoined) {
            navigate({
              to: '/servers/$serverSlug',
              params: { serverSlug: server.slug ?? server.id },
            })
          }
        }}
        className="rounded-[40px] overflow-hidden cursor-pointer group relative"
      >
        {/* Banner */}
        <div className="h-28 bg-gradient-to-br from-primary/15 to-primary/[0.03] relative overflow-hidden">
          {server.bannerUrl ? (
            <img
              src={server.bannerUrl}
              alt=""
              className="w-full h-full object-cover absolute inset-0 group-hover:scale-110 transition-transform duration-500"
            />
          ) : null}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
            <Badge
              variant="neutral"
              size="sm"
              className="backdrop-blur-md bg-bg-deep/30 border-border-subtle"
            >
              <Users size={10} />
              {server.memberCount}
            </Badge>
            {server.isPublic && (
              <Badge
                variant="neutral"
                size="sm"
                className="backdrop-blur-md bg-bg-deep/30 border-border-subtle"
              >
                {t('discover.public')}
              </Badge>
            )}
          </div>
        </div>

        {/* Icon overlay */}
        <div className="absolute top-[84px] left-5 z-20">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-bg-deep border-4 border-bg-deep shadow-xl">
            {server.iconUrl ? (
              <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <img src={getCatAvatar(0)} alt={server.name} className="w-full h-full object-cover" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="pt-10 px-5 pb-5 flex flex-col flex-1">
          <h3 className="font-black text-text-primary text-base mb-1 truncate tracking-tight">
            {server.name}
          </h3>
          <p className="text-text-muted text-sm mb-4 line-clamp-2 min-h-[2.5rem] flex-1">
            {server.description ?? t('discover.noDescription')}
          </p>

          <div className="flex items-center justify-between mt-auto">
            {isJoined ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate({
                    to: '/servers/$serverSlug',
                    params: { serverSlug: server.slug ?? server.id },
                  })
                }}
                className="rounded-xl"
              >
                {t('discover.enterButton')}
                <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  joinMutation.mutate({ inviteCode: server.inviteCode })
                }}
                disabled={joinMutation.isPending}
                className="rounded-xl"
              >
                {t('discover.joinButton')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
  }

  if (item.type === 'channel') {
    const channel = item.data as ChannelData
    const isJoined = joinedServerIds.has(channel.server.id)

    return (
      <Card
        variant="glass"
        hoverable
        onClick={() => {
          if (isJoined) {
            navigate({
              to: '/servers/$serverSlug/channels/$channelId',
              params: {
                serverSlug: channel.server.slug ?? channel.server.id,
                channelId: channel.id,
              },
            })
          } else {
            navigate({
              to: '/servers/$serverSlug',
              params: { serverSlug: channel.server.slug ?? channel.server.id },
            })
          }
        }}
        className="rounded-[40px] overflow-hidden cursor-pointer group relative"
      >
        <div className="p-5 flex flex-col flex-1">
          {/* Channel Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Hash size={18} className="text-primary" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-black text-text-primary text-base truncate block tracking-tight">
                {channel.name}
              </span>
              <span className="text-text-muted text-xs truncate block">{channel.server.name}</span>
            </div>
            <ArrowRight
              size={16}
              className="text-text-muted/30 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0"
            />
          </div>

          {channel.topic && (
            <p className="text-text-muted text-sm mb-3 line-clamp-2">{channel.topic}</p>
          )}

          {channel.lastMessage && (
            <div className="bg-bg-tertiary/50 rounded-2xl p-3 mb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-widest text-success">
                  Active
                </span>
              </div>
              <p className="text-text-muted text-xs line-clamp-2">{channel.lastMessage.content}</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle">
            <span className="flex items-center gap-1.5 text-xs font-bold text-text-muted">
              <Users size={12} />
              {channel.memberCount}
            </span>
            {!isJoined ? (
              <Badge variant="neutral" size="sm">
                {t('discover.joinToView')}
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                {t('discover.enterButton')}
              </Badge>
            )}
          </div>
        </div>
      </Card>
    )
  }

  if (item.type === 'rental') {
    const rental = item.data as RentalData

    return (
      <Card variant="glass" hoverable className="rounded-[40px] p-5">
        <div className="flex gap-4">
          {/* Agent Avatar */}
          <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 border border-accent/20">
            <Zap size={24} className="text-accent" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-text-primary text-base tracking-tight">
              {rental.listing?.title || t('discover.unknownListing')}
            </h3>
            <p className="text-text-muted text-xs mb-2">
              {rental.agent?.name || t('discover.unknownAgent')}
            </p>

            {rental.listing?.description && (
              <p className="text-text-muted text-sm mt-2 line-clamp-2">
                {rental.listing.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 mt-3">
              {rental.listing?.deviceTier && (
                <Badge variant="neutral" size="sm">
                  {rental.listing.deviceTier}
                </Badge>
              )}
              {rental.listing?.osType && (
                <Badge variant="neutral" size="sm">
                  {rental.listing.osType}
                </Badge>
              )}
              {rental.agent?.status && (
                <Badge
                  variant={
                    rental.agent.status === 'online'
                      ? 'success'
                      : rental.agent.status === 'error'
                        ? 'danger'
                        : 'neutral'
                  }
                  size="sm"
                >
                  {rental.agent.status}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
              <div className="w-6 h-6 rounded-lg bg-bg-tertiary/50 overflow-hidden">
                {rental.tenant?.avatarUrl ? (
                  <img
                    src={rental.tenant.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px]">
                    👤
                  </div>
                )}
              </div>
              <span className="text-text-muted text-xs font-bold">
                {rental.tenant?.displayName || rental.tenant?.username || t('discover.unknownUser')}
              </span>
              <span className="text-accent text-xs font-black ml-auto">
                {rental.listing?.hourlyRate}虾币/h
              </span>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return null
}
