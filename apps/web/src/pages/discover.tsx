import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Globe, Search, Shield } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { getCatAvatar } from '../lib/pixel-cats'

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

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

export function DiscoverPage() {
  const { t } = useTranslation()
  const unreadCount = useUnreadCount()
  useAppStatus({
    title: t('discover.title'),
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['discover-servers'],
    queryFn: () => fetchApi<DiscoverServer[]>('/api/servers/discover'),
  })

  // Fetch user's joined servers to determine joined status
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
      navigate({ to: '/app/servers/$serverId', params: { serverId: data.id } })
    },
    onError: (err: unknown, variables) => {
      const status = (err as { status?: number })?.status
      if (status === 409) {
        // Already a member — navigate to the server
        queryClient.invalidateQueries({ queryKey: ['servers'] })
        navigate({ to: '/app/servers/$serverId', params: { serverId: variables.serverId } })
      }
    },
  })

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-y-auto">
      {/* Header */}
      <div className="border-b-2 border-bg-tertiary px-6 py-8 bg-bg-primary">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Globe size={28} className="text-primary" />
            <h1 className="text-2xl font-bold text-text-primary">{t('discover.title')}</h1>
          </div>
          <p className="text-[#dbdee1] mb-6 text-[15px]">{t('discover.subtitle')}</p>

          {/* Search */}
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#949ba4]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('discover.searchPlaceholder')}
              className="w-full bg-[#1e1f22] text-text-primary rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-primary text-[15px] shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Server grid */}
      <div className="max-w-4xl mx-auto w-full px-6 py-6">
        {isLoading ? (
          <div className="text-center text-text-muted py-12">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-text-muted py-12">{t('discover.noServers')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((server, i) => {
              const isJoined = joinedServerIds.has(server.id)
              return (
                <div
                  key={server.id}
                  onClick={() => {
                    if (isJoined) {
                      navigate({
                        to: '/app/servers/$serverId',
                        params: { serverId: server.slug ?? server.id },
                      })
                    }
                  }}
                  className="bg-[#2b2d31] rounded-[16px] overflow-hidden hover:bg-[#383a40] hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 group flex flex-col cursor-pointer border border-[#1e1f22] relative"
                >
                  {/* Server banner */}
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

                  {/* Avatar overlapping banner */}
                  <div className="absolute top-[92px] left-4 p-1.5 bg-[#2b2d31] group-hover:bg-[#383a40] rounded-[18px] transition-colors duration-200 z-20">
                    <div className="w-[48px] h-[48px] rounded-[12px] overflow-hidden bg-[#1e1f22] flex items-center justify-center">
                      {server.iconUrl ? (
                        <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <img src={getCatAvatar(i)} alt={server.name} className="w-9 h-9" />
                      )}
                    </div>
                  </div>

                  <div className="pt-10 p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-[#f2f3f5] text-[16px] mb-1 truncate">
                      {server.name}
                    </h3>
                    <p className="text-[#dbdee1] text-[14px] mb-4 line-clamp-2 min-h-[2.5rem] flex-1">
                      {server.description ?? t('discover.noDescription')}
                    </p>
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {(server.memberAvatars ?? []).slice(0, 5).map((m) => (
                            <div
                              key={m.id}
                              className="w-6 h-6 rounded-full border-2 border-[#2b2d31] group-hover:border-[#383a40] overflow-hidden bg-[#1e1f22] transition-colors duration-200"
                            >
                              {m.avatarUrl ? (
                                <img
                                  src={m.avatarUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#dbdee1]">
                                  👤
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#949ba4]">
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
                              to: '/app/servers/$serverId',
                              params: { serverId: server.slug ?? server.id },
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
        )}
      </div>
    </div>
  )
}
