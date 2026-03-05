import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Globe, LogIn, Search, Shield, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { getCatAvatar } from '../lib/pixel-cats'

interface DiscoverServer {
  id: string
  name: string
  description: string | null
  iconUrl: string | null
  bannerUrl?: string | null
  isPublic: boolean
  inviteCode: string
  memberCount: number
  memberAvatars?: { id: string; avatarUrl: string | null }[]
}

interface ServerEntry {
  server: { id: string; name: string; iconUrl: string | null }
  member: { role: string }
}

export function DiscoverPage() {
  const { t } = useTranslation()
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
      <div className="border-b border-white/5 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Globe size={28} className="text-primary" />
            <h1 className="text-2xl font-bold text-text-primary">{t('discover.title')}</h1>
          </div>
          <p className="text-text-muted mb-6">{t('discover.subtitle')}</p>

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
              className="w-full bg-bg-tertiary text-text-primary rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-primary text-sm"
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
                  className="bg-bg-secondary rounded-xl border border-white/5 overflow-hidden hover:border-white/10 transition group flex flex-col"
                >
                  {/* Server banner */}
                  <div className="h-28 bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center relative">
                    {server.bannerUrl ? (
                      <img
                        src={server.bannerUrl}
                        alt=""
                        className="w-full h-full object-cover absolute inset-0"
                      />
                    ) : null}
                    <div className="relative z-10">
                      {server.iconUrl ? (
                        <img
                          src={server.iconUrl}
                          alt=""
                          className="w-16 h-16 rounded-2xl object-cover"
                        />
                      ) : (
                        <img src={getCatAvatar(i)} alt={server.name} className="w-14 h-14" />
                      )}
                    </div>
                    {server.isPublic && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-primary/80 text-white text-xs rounded-full z-10">
                        <Shield size={10} />
                        {t('discover.public')}
                      </span>
                    )}
                  </div>

                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-text-primary mb-1 truncate">{server.name}</h3>
                    <p className="text-text-muted text-sm mb-3 line-clamp-2 min-h-[2.5rem] flex-1">
                      {server.description ?? t('discover.noDescription')}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {(server.memberAvatars ?? []).slice(0, 5).map((m) => (
                            <div
                              key={m.id}
                              className="w-6 h-6 rounded-full border-2 border-bg-secondary overflow-hidden bg-bg-tertiary"
                            >
                              {m.avatarUrl ? (
                                <img
                                  src={m.avatarUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] text-text-muted">
                                  👤
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <Users size={14} />
                          {server.memberCount} {t('discover.members')}
                        </span>
                      </div>
                      {isJoined ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              to: '/app/servers/$serverId',
                              params: { serverId: server.id },
                            })
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition"
                        >
                          <LogIn size={14} />
                          {t('discover.enterButton')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (server.inviteCode) {
                              joinMutation.mutate({
                                inviteCode: server.inviteCode,
                                serverId: server.id,
                              })
                            }
                          }}
                          disabled={joinMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                        >
                          <UserPlus size={14} />
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
