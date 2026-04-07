import { Badge, Button, Card, cn, EmptyState, Input } from '@shadowob/ui'
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
  const observerRef = useRef<IntersectionObserver>()
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSearching) return
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
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

  return (
    <div className="relative flex-1 flex flex-col bg-bg-deep overflow-y-auto scrollbar-hidden">
      {/* Ambient orb blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[180px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[160px]" />
      </div>

      {/* Header */}
      <div className="desktop-drag-titlebar border-b border-border-subtle bg-bg-deep/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Flame size={20} className="text-primary" strokeWidth={2.5} />
              </div>
              <h1 className="text-2xl font-black text-text-primary tracking-tight">
                {t('discover.title')}
              </h1>
            </div>

            {/* Search on desktop */}
            <div className="hidden md:block w-72">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted z-10"
                />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={t('discover.searchPlaceholder')}
                  className="w-full rounded-xl pl-9 pr-3 py-2 text-sm bg-bg-tertiary/50 border-border-subtle"
                />
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hidden">
            {[
              { key: 'all', label: t('discover.filters.all'), icon: Flame },
              { key: 'servers', label: t('discover.filters.servers'), icon: Server },
              { key: 'channels', label: t('discover.filters.channels'), icon: Hash },
              { key: 'rentals', label: t('discover.filters.rentals'), icon: Zap },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveFilter(key as FilterType)
                  setIsSearching(false)
                }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap active:scale-95',
                  activeFilter === key
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
                    : 'text-text-muted hover:bg-bg-tertiary/50 hover:text-text-primary',
                )}
              >
                <Icon size={14} strokeWidth={activeFilter === key ? 3 : 2} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Feed */}
      <div className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {isSearching && searchLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center animate-bounce">
                  <div className="w-6 h-6 rounded-full bg-primary" />
                </div>
                <span className="text-primary font-black text-xs uppercase tracking-widest animate-pulse">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

              {/* Load More Trigger */}
              {!isSearching && (
                <div ref={loadMoreRef} className="col-span-full py-6 text-center">
                  {isFetchingNextPage ? (
                    <div className="w-6 h-6 mx-auto rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  ) : hasNextPage ? (
                    <span className="text-text-muted/40 text-xs font-black uppercase tracking-widest">
                      {t('discover.loadMore')}
                    </span>
                  ) : (
                    <span className="text-text-muted/40 text-xs font-black uppercase tracking-widest">
                      {t('discover.noMore')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
  joinMutation: ReturnType<typeof useMutation>
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
