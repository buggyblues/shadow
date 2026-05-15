import { getCatAvatar } from '@shadowob/shared'
import { Badge, Button, Card, cn, EmptyState, GlassHeader, GlassPanel, Input } from '@shadowob/ui'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { ArrowRight, Flame, Hash, Search, Server, Users, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'

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

interface PlayCatalogItem {
  id: string
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  status: 'available' | 'gated' | 'coming_soon' | 'misconfigured'
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
  const { t, i18n } = useTranslation()
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
  const { data: playCatalog } = useQuery({
    queryKey: ['play-catalog', 'discover'],
    queryFn: () => fetchApi<{ plays: PlayCatalogItem[] }>('/api/play/catalog'),
  })

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])
  const featuredPlays = useMemo(() => {
    const plays = (playCatalog?.plays ?? []).filter((play) =>
      ['available', 'gated'].includes(play.status),
    )
    const littleMatchGirl = plays.find((play) => play.id === 'little-match-girl')
    const rest = plays.filter((play) => play.id !== 'little-match-girl')
    return [...(littleMatchGirl ? [littleMatchGirl] : []), ...rest].slice(0, 4)
  }, [playCatalog])

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
    <div className="relative flex h-full min-h-0 overflow-hidden overflow-x-hidden">
      {/* Ambient orb blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[180px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[160px]" />
      </div>

      <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row flex-1">
        <GlassPanel as="aside" className="hidden w-[240px] shrink-0 md:flex md:flex-col">
          <div className="border-b border-border-subtle px-4 py-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Flame size={20} className="text-primary" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-black tracking-tight text-text-primary">
                  {t('discover.title')}
                </h1>
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

        <main className="flex h-full min-h-0 min-w-0 flex-1 w-full flex-col">
          <div className="desktop-drag-titlebar md:hidden px-4 pt-4">
            <GlassPanel className="border-border-subtle/70 px-6 py-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Flame size={20} className="text-primary" strokeWidth={2.5} />
                  </div>
                  <h1 className="text-base font-black tracking-tight text-text-primary">
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

          <GlassPanel className="flex-1 min-h-0 w-full flex flex-col md:h-full">
            <GlassHeader className="hidden items-center justify-between gap-4 border-b border-border-subtle/70 px-4 py-4 md:flex">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ActiveFilterIcon size={20} strokeWidth={2.5} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black tracking-tight text-text-primary">
                    {t(activeFilterItem.labelKey)}
                  </h2>
                </div>
              </div>

              <Badge variant="neutral" className="shrink-0">
                {allItems.length}
              </Badge>
            </GlassHeader>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="w-full px-4 py-4 md:p-6">
                {!isSearching && featuredPlays.length > 0 && (
                  <section className="mb-5">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h2 className="text-base font-black text-text-primary">
                          {t('discover.playsTitle')}
                        </h2>
                        <p className="mt-1 text-xs font-medium text-text-muted">
                          {t('discover.playsSubtitle')}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {featuredPlays.map((play) => {
                        const isZh = i18n.language.startsWith('zh')
                        const title = isZh ? play.title : play.titleEn
                        const desc = isZh ? play.desc : play.descEn
                        const category = isZh ? play.category : play.categoryEn
                        return (
                          <button
                            key={play.id}
                            type="button"
                            onClick={() =>
                              navigate({
                                to: '/play/launch',
                                search: { play: play.id },
                              })
                            }
                            className="group rounded-lg border border-border-subtle bg-bg-secondary/70 p-4 text-left transition hover:border-primary/50 hover:bg-bg-secondary"
                          >
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <span className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-primary">
                                <Zap size={13} />
                                {category}
                              </span>
                              <span className="text-xs font-bold text-text-muted">
                                {play.status === 'gated'
                                  ? t('discover.memberPlay')
                                  : t('discover.readyPlay')}
                              </span>
                            </div>
                            <div className="font-black text-text-primary">{title}</div>
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-muted">
                              {desc}
                            </p>
                            <div className="mt-4 inline-flex items-center gap-2 text-sm font-black text-primary">
                              {t('discover.startPlay')}
                              <ArrowRight
                                size={14}
                                className="transition group-hover:translate-x-0.5"
                              />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}
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
                  <div className="grid w-full gap-5 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
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

const FEED_CARD_CLASS =
  'relative overflow-hidden rounded-2xl bg-bg-secondary/90 p-5 min-h-[250px] shadow-sm ring-1 ring-border-subtle/12'
const FEED_CARD_GLOW =
  'after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:opacity-35 after:transition-opacity after:duration-300 hover:after:opacity-100'
const FEED_CARD_THEME: Record<
  FeedItemType,
  {
    chipClass: string
    iconClass: string
  }
> = {
  server: {
    chipClass: 'bg-primary/12 text-primary',
    iconClass: 'text-primary',
  },
  channel: {
    chipClass: 'bg-success/12 text-success',
    iconClass: 'text-success',
  },
  rental: {
    chipClass: 'bg-accent/12 text-accent',
    iconClass: 'text-accent',
  },
}

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
  t: TFunction
}) {
  if (item.type === 'server') {
    const server = item.data as ServerData
    const isJoined = joinedServerIds.has(server.id)

    return (
      <Card
        variant="default"
        hoverable
        onClick={() => {
          if (isJoined) {
            navigate({
              to: '/servers/$serverSlug',
              params: { serverSlug: server.slug ?? server.id },
            })
          }
        }}
        className={cn(
          FEED_CARD_CLASS,
          FEED_CARD_GLOW,
          'overflow-hidden relative cursor-pointer group',
        )}
      >
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full border bg-bg-tertiary/60 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]',
                FEED_CARD_THEME.server.chipClass,
              )}
            >
              <Server size={13} className={FEED_CARD_THEME.server.iconClass} />
              {t('discover.filters.servers', '服务器')}
            </div>
            <span className="text-[11px] font-bold text-text-muted/80">
              {t('discover.score', '热度')}
            </span>
          </div>

          <div className="relative h-28 rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-bg-secondary/10 mb-5">
            {server.bannerUrl ? (
              <img
                src={server.bannerUrl}
                alt=""
                className="w-full h-full object-cover opacity-75 group-hover:scale-[1.04] transition-transform duration-500"
              />
            ) : (
              <div className="absolute inset-0" />
            )}
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-bg-deep/75 border-4 border-bg-deep shadow-xl">
                {server.iconUrl ? (
                  <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={getCatAvatar(0)}
                    alt={server.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
            <div className="absolute left-0 right-0 bottom-2 px-3 flex items-center justify-end gap-1.5">
              <Badge variant="neutral" size="sm" className="bg-bg-deep/55 border-border-subtle">
                <Users size={11} />
                {server.memberCount}
              </Badge>
              <Badge variant="neutral" size="sm" className="bg-bg-deep/55 border-border-subtle">
                {item.heatScore}
              </Badge>
              {server.isPublic && (
                <Badge variant="neutral" size="sm" className="bg-bg-deep/55 border-border-subtle">
                  {t('discover.public')}
                </Badge>
              )}
            </div>
          </div>

          <h3 className="font-black text-text-primary text-base mb-2 truncate tracking-tight">
            {server.name}
          </h3>
          <p className="text-text-muted text-sm mb-4 line-clamp-2 min-h-[2.6rem]">
            {server.description ?? t('discover.noDescription')}
          </p>

          <div className="mt-auto flex items-center justify-between">
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
        variant="default"
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
        className={cn(
          FEED_CARD_CLASS,
          FEED_CARD_GLOW,
          'overflow-hidden cursor-pointer group relative',
        )}
      >
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full border bg-bg-tertiary/60 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]',
                FEED_CARD_THEME.channel.chipClass,
              )}
            >
              <Hash size={13} className={FEED_CARD_THEME.channel.iconClass} />
              {t('discover.filters.channels', '频道')}
            </div>
            <span className="text-[11px] font-bold text-text-muted/80">
              {t('discover.score', '热度')}
            </span>
          </div>

          <div className="mb-4 flex items-start gap-3">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-bg-tertiary border border-border-subtle">
              {channel.server.iconUrl ? (
                <img src={channel.server.iconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <img
                  src={getCatAvatar(0)}
                  alt={channel.server.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-base text-text-primary mb-1 truncate tracking-tight">
                #{channel.name}
              </h3>
              <p className="text-text-muted text-xs truncate">{channel.server.name}</p>
            </div>
          </div>

          <p className="text-text-muted text-sm line-clamp-2 min-h-[2.5rem]">
            {channel.topic || t('discover.channelNoTopic', '暂无主题')}
          </p>

          {channel.lastMessage && (
            <div className="mt-3 flex justify-end">
              <div className="relative max-w-[92%] rounded-[16px] rounded-bl-lg border border-border-subtle/70 bg-bg-tertiary/70 px-3.5 py-2.5 shadow-sm">
                <span className="absolute -left-[8px] top-4 h-3.5 w-3.5 rotate-45 border-l border-b border-border-subtle/70 bg-bg-tertiary/70" />

                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-success">
                    {t('discover.active', '活跃')}
                  </span>
                </div>
                <p className="text-text-muted text-xs leading-relaxed line-clamp-2">
                  {channel.lastMessage.content}
                </p>
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 flex items-center justify-between border-t border-border-subtle/60">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-text-muted">
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
      <Card variant="default" hoverable className={cn(FEED_CARD_CLASS, FEED_CARD_GLOW, 'relative')}>
        <div className="flex gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 border border-accent/20 shadow-inner">
            <Zap size={24} className="text-accent" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border bg-bg-tertiary/60 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em]',
                  FEED_CARD_THEME.rental.chipClass,
                )}
              >
                <Server size={13} className={FEED_CARD_THEME.rental.iconClass} />
                {t('discover.filters.rentals', '租赁')}
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-black text-text-muted">
                {t('discover.score', '热度')}: {item.heatScore}
              </span>
            </div>

            <h3 className="font-black text-text-primary text-base tracking-tight">
              {rental.listing?.title || t('discover.unknownListing')}
            </h3>
            <p className="text-text-muted text-xs mb-2">
              {rental.agent?.name || t('discover.unknownAgent')}
            </p>

            {rental.listing?.description && (
              <p className="text-text-muted text-sm mt-2 line-clamp-2 min-h-[2.6rem]">
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
                {rental.listing?.hourlyRate}
                <span className="text-text-muted font-normal ml-1">{t('recharge.coins')}/h</span>
              </span>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return null
}
