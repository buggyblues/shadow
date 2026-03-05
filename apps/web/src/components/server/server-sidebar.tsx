import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Compass, LogIn, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { getCatAvatar } from '../../lib/pixel-cats'
import { useChatStore } from '../../stores/chat.store'

interface ServerEntry {
  server: { id: string; name: string; iconUrl: string | null }
  member: { role: string }
}

export function ServerSidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeServerId, setActiveServer } = useChatStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const createServer = useMutation({
    mutationFn: (name: string) =>
      fetchApi('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreate(false)
      setNewName('')
    },
  })

  const joinServer = useMutation({
    mutationFn: (inviteCode: string) =>
      fetchApi<{ id: string }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowJoin(false)
      setJoinCode('')
      handleSelect(data.id)
    },
  })

  const handleSelect = (serverId: string) => {
    setActiveServer(serverId)
    navigate({ to: '/app/servers/$serverId', params: { serverId } })
  }

  return (
    <div className="w-[72px] bg-bg-tertiary flex flex-col items-center py-3 gap-2 shrink-0">
      {/* Home button */}
      <button
        onClick={() => navigate({ to: '/app' })}
        className="w-12 h-12 rounded-2xl bg-bg-primary hover:bg-primary hover:rounded-xl transition-all flex items-center justify-center overflow-hidden"
        title={t('server.home')}
      >
        <img src="/Logo.svg" alt="Shadow" className="w-8 h-8" />
      </button>

      <div className="w-8 h-0.5 bg-bg-primary rounded-full my-1" />

      {/* Server list */}
      {servers.map((s, i) => (
        <button
          key={s.server.id}
          onClick={() => handleSelect(s.server.id)}
          className={`w-12 h-12 rounded-2xl hover:rounded-xl transition-all flex items-center justify-center font-bold text-sm overflow-hidden ${
            activeServerId === s.server.id
              ? 'bg-primary rounded-xl text-white ring-2 ring-primary/50'
              : 'bg-bg-primary text-text-primary hover:bg-primary/20'
          }`}
          title={s.server.name}
        >
          {s.server.iconUrl ? (
            <img src={s.server.iconUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <img src={getCatAvatar(i)} alt={s.server.name} className="w-10 h-10" />
          )}
        </button>
      ))}

      {/* Add server */}
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-12 h-12 rounded-2xl bg-bg-primary hover:bg-green-600 hover:rounded-xl transition-all flex items-center justify-center text-green-500 hover:text-white"
        title={t('server.createServer')}
      >
        <Plus size={24} />
      </button>

      {/* Join server */}
      <button
        onClick={() => setShowJoin(!showJoin)}
        className="w-12 h-12 rounded-2xl bg-bg-primary hover:bg-blue-600 hover:rounded-xl transition-all flex items-center justify-center text-blue-500 hover:text-white"
        title={t('server.joinServer')}
      >
        <LogIn size={20} />
      </button>

      {/* Discover servers */}
      <button
        onClick={() => navigate({ to: '/app/discover' })}
        className="w-12 h-12 rounded-2xl bg-bg-primary hover:bg-emerald-600 hover:rounded-xl transition-all flex items-center justify-center text-emerald-500 hover:text-white"
        title={t('server.discover')}
      >
        <Compass size={20} />
      </button>

      {/* Settings */}
      <div className="mt-auto">
        <button
          onClick={() => navigate({ to: '/app/settings' })}
          className="w-12 h-12 rounded-2xl bg-bg-primary hover:bg-bg-secondary hover:rounded-xl transition-all flex items-center justify-center text-text-muted hover:text-text-primary"
          title={t('server.settings')}
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Simple create dialog */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-96 border border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-4">{t('server.createServer')}</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('server.serverName')}
              className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => newName.trim() && createServer.mutate(newName.trim())}
                disabled={!newName.trim() || createServer.isPending}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition disabled:opacity-50 font-bold"
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join server dialog */}
      {showJoin && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowJoin(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-96 border border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-2">{t('server.joinServer')}</h2>
            <p className="text-text-muted text-sm mb-4">{t('server.joinServerDesc')}</p>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder={t('server.inviteCodePlaceholder')}
              maxLength={8}
              className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary mb-4 font-mono text-center text-lg tracking-widest"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowJoin(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => joinCode.trim() && joinServer.mutate(joinCode.trim())}
                disabled={joinCode.trim().length !== 8 || joinServer.isPending}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition disabled:opacity-50 font-bold"
              >
                {t('server.joinButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
