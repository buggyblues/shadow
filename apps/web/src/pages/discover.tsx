import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Flame,
  Hash,
  MessageCircle,
  MoreHorizontal,
  Search,
  Server,
  Shield,
  Users,
  Zap,
} from 'lucide-react'
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

export function DiscoverPage() {
  const { t } = useTranslation()
  const unreadCount = useUnreadCount()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.length >= 2) {
      setIsSearching(true)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setIsSearching(false)
  }

  const formatTimeAgo = (date: string) => {
    const now = new Date()
    const then = new Date(date)
    const diff = now.getTime() - then.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return t('discover.justNow')
    if (minutes < 60) return t('discover.minutesAgo', { count: minutes })
    if (hours < 24) return t('discover.hoursAgo', { count: hours })
    if (days < 7) return t('discover.daysAgo', { count: days })
    return then.toLocaleDateString()
  }

  const getHeatLevel = (score: number) => {
    if (score >= 100) return { level: 'hot', color: 'text-red-400', icon: Flame }
    if (score >= 50) return { level: 'warm', color: 'text-orange-400', icon: Zap }
    return { level: 'normal', color: 'text-text-muted', icon: null }
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-y-auto">
      {/* Header */}
      <div className="desktop-drag-titlebar border-b border-bg-tertiary bg-bg-primary">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Flame size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('discover.title')}</h1>
              <p className="text-text-secondary text-sm">{t('discover.subtitle')}</p>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative mb-4">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.length >= 2 && setIsSearching(true)}
                placeholder={t('discover.searchPlaceholder')}
                className="w-full bg-bg-tertiary text-text-primary rounded-xl pl-12 pr-10 py-3 outline-none focus:ring-2 focus:ring-primary/50 text-[15px] transition-shadow"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  ×
                </button>
              )}
            </div>
          </form>

          {/* Filter Tabs */}
          <div className="flex gap-2">
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
                className={[
                  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition',
                  activeFilter === key
                    ? 'bg-primary text-white'
                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary',
                ].join(' ')}
              >
                <Icon size={14} />
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
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : allItems.length === 0 ? (
            <EmptyState isSearching={isSearching} t={t} />
          ) : (
            <div className="space-y-4">
              {allItems.map((item, index) => (
                <FeedCard
                  key={`${item.type}-${item.id}-${index}`}
                  item={item}
                  joinedServerIds={joinedServerIds}
                  joinMutation={joinMutation}
                  navigate={navigate}
                  t={t}
                  formatTimeAgo={formatTimeAgo}
                  getHeatLevel={getHeatLevel}
                />
              ))}

              {/* Load More Trigger */}
              {!isSearching && (
                <div ref={loadMoreRef} className="py-4 text-center">
                  {isFetchingNextPage ? (
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                  ) : hasNextPage ? (
                    <span className="text-text-muted text-sm">{t('discover.loadMore')}</span>
                  ) : (
                    <span className="text-text-muted text-sm">{t('discover.noMore')}</span>
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

// Empty State Component
function EmptyState({
  isSearching,
  t,
}: {
  isSearching: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-bg-tertiary flex items-center justify-center mb-4">
        <Search size={32} className="text-text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        {isSearching ? t('discover.noSearchResults') : t('discover.emptyTitle')}
      </h3>
      <p className="text-text-secondary text-sm max-w-sm">
        {isSearching ? t('discover.noSearchResultsDesc') : t('discover.emptyDesc')}
      </p>
    </div>
  )
}

// Feed Card Component
function FeedCard({
  item,
  joinedServerIds,
  joinMutation,
  navigate,
  t,
  formatTimeAgo,
  getHeatLevel,
}: {
  item: FeedItem
  joinedServerIds: Set<string>
  joinMutation: ReturnType<typeof useMutation>
  navigate: ReturnType<typeof useNavigate>
  t: (key: string, options?: Record<string, unknown>) => string
  formatTimeAgo: (date: string) => string
  getHeatLevel: (score: number) => { level: string; color: string; icon: typeof Flame | null }
}) {
  const heat = getHeatLevel(item.heatScore)

  if (item.type === 'server') {
    const server = item.data as ServerData
    const isJoined = joinedServerIds.has(server.id)

    return (
      <div
        onClick={() => {
          if (isJoined) {
            navigate({
              to: '/servers/$serverSlug',
              params: { serverSlug: server.slug ?? server.id },
            })
          }
        }}
        className="bg-bg-secondary rounded-2xl p-4 hover:bg-[#383a40] transition cursor-pointer border border-[#1e1f22] group"
      >
        <div className="flex gap-4">
          {/* Server Icon */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-bg-tertiary">
              {server.iconUrl ? (
                <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <img src={getCatAvatar(0)} alt={server.name} className="w-full h-full" />
              )}
            </div>
            {server.isPublic && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <Shield size={10} className="text-white" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-text-primary text-[16px] truncate">{server.name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[12px] text-text-muted">
                    <Users size={12} />
                    {server.memberCount} {t('discover.members')}
                  </span>
                  {heat.icon && (
                    <span className={['flex items-center gap-1 text-[12px]', heat.color].join(' ')}>
                      <heat.icon size={12} />
                      {t('discover.heat.hot')}
                    </span>
                  )}
                </div>
              </div>

              {isJoined ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate({
                      to: '/servers/$serverSlug',
                      params: { serverSlug: server.slug ?? server.id },
                    })
                  }}
                  className="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[13px] font-medium transition"
                >
                  {t('discover.enterButton')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    joinMutation.mutate({ inviteCode: server.inviteCode })
                  }}
                  disabled={joinMutation.isPending}
                  className="px-4 py-1.5 bg-primary hover:bg-primary/80 text-white rounded-lg text-[13px] font-medium transition disabled:opacity-50"
                >
                  {t('discover.joinButton')}
                </button>
              )}
            </div>

            {server.description && (
              <p className="text-text-secondary text-[14px] mt-2 line-clamp-2">
                {server.description}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'channel') {
    const channel = item.data as ChannelData
    const isJoined = joinedServerIds.has(channel.server.id)

    return (
      <div
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
        className="bg-bg-secondary rounded-2xl p-4 hover:bg-[#383a40] transition cursor-pointer border border-[#1e1f22]"
      >
        <div className="flex gap-4">
          {/* Server Icon */}
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-bg-tertiary shrink-0">
            {channel.server.iconUrl ? (
              <img src={channel.server.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-primary/60">
                {channel.server.name.charAt(0)}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-text-muted text-[13px]">{channel.server.name}</span>
              <span className="text-text-muted">/</span>
              <div className="flex items-center gap-1">
                <Hash size={14} className="text-text-muted" />
                <span className="font-semibold text-text-primary">{channel.name}</span>
              </div>
            </div>

            {channel.topic && (
              <p className="text-text-secondary text-[13px] mb-2">{channel.topic}</p>
            )}

            {channel.lastMessage && (
              <div className="bg-bg-tertiary/50 rounded-lg p-3 mt-2">
                <p className="text-text-secondary text-[13px] line-clamp-2">
                  {channel.lastMessage.content}
                </p>
                <p className="text-text-muted text-[11px] mt-1">
                  {formatTimeAgo(channel.lastMessage.createdAt)}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 mt-3">
              <span className="flex items-center gap-1 text-[12px] text-text-muted">
                <MessageCircle size={12} />
                {channel.memberCount} {t('discover.members')}
              </span>
              {!isJoined && (
                <span className="text-[11px] text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">
                  {t('discover.joinToView')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'rental') {
    const rental = item.data as RentalData

    return (
      <div className="bg-bg-secondary rounded-2xl p-4 border border-[#1e1f22]">
        <div className="flex gap-4">
          {/* Agent Avatar */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
            <span className="text-2xl">🤖</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-text-primary text-[16px]">
                  {rental.listing?.title || t('discover.unknownListing')}
                </h3>
                <p className="text-text-secondary text-[13px]">
                  {rental.agent?.name || t('discover.unknownAgent')}
                </p>
              </div>
              <div className="flex items-center gap-1 text-[12px] text-text-muted">
                <Zap size={12} />
                {t('discover.rentedSince')} {formatTimeAgo(rental.startedAt)}
              </div>
            </div>

            {rental.listing?.description && (
              <p className="text-text-secondary text-[13px] mt-2 line-clamp-2">
                {rental.listing.description}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              {rental.listing?.deviceTier && (
                <span className="text-[11px] px-2 py-1 bg-bg-tertiary rounded-full text-text-secondary">
                  {rental.listing.deviceTier}
                </span>
              )}
              {rental.listing?.osType && (
                <span className="text-[11px] px-2 py-1 bg-bg-tertiary rounded-full text-text-secondary">
                  {rental.listing.osType}
                </span>
              )}
              {rental.agent?.status && (
                <span
                  className={[
                    'text-[11px] px-2 py-1 rounded-full',
                    rental.agent.status === 'online'
                      ? 'bg-green-500/20 text-green-400'
                      : rental.agent.status === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-bg-tertiary text-text-secondary',
                  ].join(' ')}
                >
                  {rental.agent.status}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-bg-tertiary">
              <div className="w-6 h-6 rounded-full bg-bg-tertiary overflow-hidden">
                {rental.tenant?.avatarUrl ? (
                  <img
                    src={rental.tenant.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px]">
                    👤
                  </div>
                )}
              </div>
              <span className="text-text-secondary text-[12px]">
                {rental.tenant?.displayName || rental.tenant?.username || t('discover.unknownUser')}
              </span>
              <span className="text-text-muted text-[12px]">
                · {rental.listing?.hourlyRate}虾币/h
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
