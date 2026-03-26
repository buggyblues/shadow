import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Globe, Hash, Search, Shield, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { getCatAvatar } from '../lib/pixel-cats'

type TabType = 'servers' | 'channels' | 'rentals'

interface DiscoverServer {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl?: string | null
  isPublic: boolean
  inviteCode: string
  memberCount: number
  memberAvatars?: { id: string; avatarUrl: string | null }[]
}

interface DiscoverChannel {
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
    authorId: string
  } | null
}

interface DiscoverRental {
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
    dailyRate: number | null
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

export function DiscoverPage() {
  const { t } = useTranslation()
  const unreadCount = useUnreadCount()
  const [activeTab, setActiveTab] = useState<TabType>('servers')
  const [search, setSearch] = useState('')
  useAppStatus({
    title: t('discover.title'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['discover-servers'],
    queryFn: () => fetchApi<DiscoverServer[]>('/api/servers/discover'),
  })

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['discover-channels'],
    queryFn: () => fetchApi<DiscoverChannel[]>('/api/discover/channels'),
    enabled: activeTab === 'channels',
  })

  const { data: rentals = [], isLoading: rentalsLoading } = useQuery({
    queryKey: ['discover-rentals'],
    queryFn: () => fetchApi<DiscoverRental[]>('/api/discover/rentals'),
    enabled: activeTab === 'rentals',
  })

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string; serverId: string }) =>
      fetchApi<{ id: string }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: (data as { slug?: string; id: string }).slug ?? data.id },
      })
    },
    onError: (err: unknown, variables) => {
      const status = (err as { status?: number })?.status
      if (status === 409) {
        queryClient.invalidateQueries({ queryKey: ['servers'] })
        const srv = servers.find((s) => s.id === variables.serverId)
        navigate({
          to: '/servers/$serverSlug',
          params: { serverSlug: srv?.slug ?? variables.serverId },
        })
      }
    },
  })

  const filteredServers = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()),
  )

  const filteredChannels = channels.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.topic?.toLowerCase().includes(search.toLowerCase()) ||
      c.server.name.toLowerCase().includes(search.toLowerCase()),
  )

  const filteredRentals = rentals.filter(
    (r) =>
      r.listing?.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.listing?.description?.toLowerCase().includes(search.toLowerCase()) ||
      r.agent?.name?.toLowerCase().includes(search.toLowerCase()),
  )

  const isLoading =
    (activeTab === 'servers' && serversLoading) ||
    (activeTab === 'channels' && channelsLoading) ||
    (activeTab === 'rentals' && rentalsLoading)

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
    return t('discover.daysAgo', { count: days })
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-y-auto">
      {/* Header */}
      <div className="desktop-drag-titlebar border-b-2 border-bg-tertiary px-6 py-8 bg-bg-primary">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Globe size={28} className="text-primary" />
            <h1 className="text-2xl font-bold text-text-primary">{t('discover.title')}</h1>
          </div>
          <p className="text-text-primary mb-6 text-[15px]">{t('discover.subtitle')}</p>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('servers')}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition',
                activeTab === 'servers'
                  ? 'bg-primary text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary',
              ].join(' ')}
            >
              <Globe size={16} />
              {t('discover.tabs.servers')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('channels')}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition',
                activeTab === 'channels'
                  ? 'bg-primary text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary',
              ].join(' ')}
            >
              <Hash size={16} />
              {t('discover.tabs.channels')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rentals')}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition',
                activeTab === 'rentals'
                  ? 'bg-primary text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary',
              ].join(' ')}
            >
              <Zap size={16} />
              {t('discover.tabs.rentals')}
            </button>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('discover.searchPlaceholder')}
              className="w-full bg-bg-tertiary text-text-primary rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-primary text-[15px] shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto w-full px-6 py-6">
        {isLoading ? (
          <div className="text-center text-text-muted py-12">{t('common.loading')}</div>
        ) : activeTab === 'servers' ? (
          <ServersTab
            servers={filteredServers}
            joinedServerIds={joinedServerIds}
            joinMutation={joinMutation}
            navigate={navigate}
            t={t}
          />
        ) : activeTab === 'channels' ? (
          <ChannelsTab
            channels={filteredChannels}
            joinedServerIds={joinedServerIds}
            navigate={navigate}
            t={t}
            formatTimeAgo={formatTimeAgo}
          />
        ) : (
          <RentalsTab rentals={filteredRentals} t={t} formatTimeAgo={formatTimeAgo} />
        )}
      </div>
    </div>
  )
}

// Server Tab Component
function ServersTab({
  servers,
  joinedServerIds,
  joinMutation,
  navigate,
  t,
}: {
  servers: DiscoverServer[]
  joinedServerIds: Set<string>
  joinMutation: ReturnType<typeof useMutation>
  navigate: ReturnType<typeof useNavigate>
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (servers.length === 0) {
    return <div className="text-center text-text-muted py-12">{t('discover.noServers')}</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {servers.map((server, i) => {
        const isJoined = joinedServerIds.has(server.id)
        return (
          <div
            key={server.id}
            onClick={() => {
              if (isJoined) {
                navigate({
                  to: '/servers/$serverSlug',
                  params: { serverSlug: server.slug ?? server.id },
                })
              }
            }}
            className="bg-bg-secondary rounded-[16px] overflow-hidden hover:bg-[#383a40] hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 group flex flex-col cursor-pointer border border-[#1e1f22] relative"
          >
            <div className="h-[120px] bg-gradient-to-br from-[#5865F2]/20 to-[#5865F2]/5 relative">
              {server.bannerUrl && (
                <img
                  src={server.bannerUrl}
                  alt=""
                  className="w-full h-full object-cover absolute inset-0"
                />
              )}
              {server.isPublic && (
                <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 bg-black/50 backdrop-blur-md text-white text-[11px] font-bold rounded-full z-10 uppercase tracking-widest">
                  <Shield size={12} />
                  {t('discover.public')}
                </span>
              )}
            </div>

            <div className="absolute top-[92px] left-4 p-1.5 bg-bg-secondary group-hover:bg-[#383a40] rounded-[18px] transition-colors duration-200 z-20">
              <div className="w-[48px] h-[48px] rounded-[12px] overflow-hidden bg-bg-tertiary flex items-center justify-center">
                {server.iconUrl ? (
                  <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <img src={getCatAvatar(i)} alt={server.name} className="w-9 h-9" />
                )}
              </div>
            </div>

            <div className="pt-10 p-4 flex flex-col flex-1">
              <h3 className="font-bold text-[#f2f3f5] text-[16px] mb-1 truncate">{server.name}</h3>
              <p className="text-text-primary text-[14px] mb-4 line-clamp-2 min-h-[2.5rem] flex-1">
                {server.description ?? t('discover.noDescription')}
              </p>
              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {(server.memberAvatars ?? []).slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        className="w-6 h-6 rounded-full border-2 border-[#2b2d31] group-hover:border-[#383a40] overflow-hidden bg-bg-tertiary transition-colors duration-200"
                      >
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-text-primary">
                            👤
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
                    <div className="w-2 h-2 rounded-full bg-[#23a559]"></div>
                    {server.memberCount} {t('discover.members')}
                  </span>
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
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-[#23a559] hover:bg-[#1d8749] text-white rounded-[3px] text-[14px] font-medium transition"
                  >
                    {t('discover.enterButton')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (server.inviteCode) {
                        joinMutation.mutate({
                          inviteCode: server.inviteCode,
                          serverId: server.id,
                        })
                      }
                    }}
                    disabled={joinMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-[3px] text-[14px] font-medium transition disabled:opacity-50"
                  >
                    {t('discover.joinButton')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Channels Tab Component
function ChannelsTab({
  channels,
  joinedServerIds,
  navigate,
  t,
  formatTimeAgo,
}: {
  channels: DiscoverChannel[]
  joinedServerIds: Set<string>
  navigate: ReturnType<typeof useNavigate>
  t: (key: string, options?: Record<string, unknown>) => string
  formatTimeAgo: (date: string) => string
}) {
  if (channels.length === 0) {
    return <div className="text-center text-text-muted py-12">{t('discover.noChannels')}</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {channels.map((channel) => {
        const isJoined = joinedServerIds.has(channel.server.id)
        return (
          <div
            key={channel.id}
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
            className="bg-bg-secondary rounded-[16px] overflow-hidden hover:bg-[#383a40] hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 group flex flex-col cursor-pointer border border-[#1e1f22] relative p-4"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 rounded-[12px] overflow-hidden bg-bg-tertiary flex items-center justify-center shrink-0">
                {channel.server.iconUrl ? (
                  <img src={channel.server.iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[18px] font-bold text-text-primary bg-primary/20">
                    {channel.server.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Hash size={14} className="text-text-muted" />
                  <h3 className="font-bold text-[#f2f3f5] text-[15px] truncate">{channel.name}</h3>
                </div>
                <p className="text-text-secondary text-[13px] truncate">{channel.server.name}</p>
              </div>
            </div>

            {channel.topic && (
              <p className="text-text-secondary text-[13px] mb-3 line-clamp-2">{channel.topic}</p>
            )}

            {channel.lastMessage && (
              <div className="bg-bg-tertiary rounded-lg p-3 mb-3">
                <p className="text-text-primary text-[13px] line-clamp-2 mb-1">
                  {channel.lastMessage.content}
                </p>
                <p className="text-text-muted text-[11px]">
                  {formatTimeAgo(channel.lastMessage.createdAt)}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between mt-auto pt-2 border-t border-bg-tertiary">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-text-muted">
                  {channel.memberCount} {t('discover.members')}
                </span>
              </div>
              {!isJoined && (
                <span className="text-[11px] text-text-muted bg-bg-tertiary px-2 py-1 rounded">
                  {t('discover.joinToView')}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Rentals Tab Component
function RentalsTab({
  rentals,
  t,
  formatTimeAgo,
}: {
  rentals: DiscoverRental[]
  t: (key: string, options?: Record<string, unknown>) => string
  formatTimeAgo: (date: string) => string
}) {
  if (rentals.length === 0) {
    return <div className="text-center text-text-muted py-12">{t('discover.noRentals')}</div>
  }

  const getDeviceTierLabel = (tier: string | null) => {
    switch (tier) {
      case 'high_end':
        return t('discover.deviceTier.highEnd')
      case 'mid_range':
        return t('discover.deviceTier.midRange')
      case 'low_end':
        return t('discover.deviceTier.lowEnd')
      default:
        return t('discover.deviceTier.unknown')
    }
  }

  const getOsTypeLabel = (os: string | null) => {
    switch (os) {
      case 'macos':
        return 'macOS'
      case 'windows':
        return 'Windows'
      case 'linux':
        return 'Linux'
      default:
        return os ?? 'Unknown'
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rentals.map((rental) => (
        <div
          key={rental.contractId}
          className="bg-bg-secondary rounded-[16px] overflow-hidden border border-[#1e1f22] relative p-4"
        >
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 rounded-[12px] overflow-hidden bg-bg-tertiary flex items-center justify-center shrink-0">
              {rental.agent ? (
                <div className="w-full h-full flex items-center justify-center text-[20px]">🤖</div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[18px] font-bold text-text-primary bg-primary/20">
                  {rental.listing?.title?.charAt(0) ?? '?'}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[#f2f3f5] text-[15px] truncate">
                {rental.listing?.title ?? t('discover.unknownListing')}
              </h3>
              <p className="text-text-secondary text-[13px]">
                {rental.agent?.name ?? t('discover.unknownAgent')}
              </p>
            </div>
          </div>

          {rental.listing?.description && (
            <p className="text-text-secondary text-[13px] mb-3 line-clamp-2">
              {rental.listing.description}
            </p>
          )}

          <div className="flex flex-wrap gap-2 mb-3">
            {rental.listing?.deviceTier && (
              <span className="text-[11px] px-2 py-1 bg-bg-tertiary rounded-full text-text-secondary">
                {getDeviceTierLabel(rental.listing.deviceTier)}
              </span>
            )}
            {rental.listing?.osType && (
              <span className="text-[11px] px-2 py-1 bg-bg-tertiary rounded-full text-text-secondary">
                {getOsTypeLabel(rental.listing.osType)}
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

          <div className="flex items-center justify-between pt-3 border-t border-bg-tertiary">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full overflow-hidden bg-bg-tertiary">
                {rental.tenant?.avatarUrl ? (
                  <img
                    src={rental.tenant.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-text-primary">
                    👤
                  </div>
                )}
              </div>
              <span className="text-text-secondary text-[12px]">
                {rental.tenant?.displayName ?? rental.tenant?.username ?? t('discover.unknownUser')}
              </span>
            </div>
            <div className="text-text-muted text-[12px]">
              {t('discover.rentedSince')} {formatTimeAgo(rental.startedAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
