import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Globe, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { getCatAvatar } from '../lib/pixel-cats'

interface DiscoverServer {
  id: string
  name: string
  description: string | null
  iconUrl: string | null
  memberCount: number
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

  const _joinMutation = useMutation({
    mutationFn: (inviteCode: string) =>
      fetchApi<{ id: string }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      navigate({ to: '/app/servers/$serverId', params: { serverId: data.id } })
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
            {filtered.map((server, i) => (
              <div
                key={server.id}
                className="bg-bg-secondary rounded-xl border border-white/5 overflow-hidden hover:border-white/10 transition group"
              >
                {/* Server banner */}
                <div className="h-24 bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center">
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

                <div className="p-4">
                  <h3 className="font-bold text-text-primary mb-1 truncate">{server.name}</h3>
                  <p className="text-text-muted text-sm mb-3 line-clamp-2 min-h-[2.5rem]">
                    {server.description ?? t('discover.noDescription')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-text-muted">
                      <Users size={14} />
                      {server.memberCount} {t('discover.members')}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        // Navigate to the server's invite page
                        navigate({ to: '/app/servers/$serverId', params: { serverId: server.id } })
                      }}
                      className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition"
                    >
                      {t('discover.joinButton')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
