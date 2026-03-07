import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Compass, Copy, Info, LogOut, Plus, Settings, UserPlus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { getCatAvatar } from '../../lib/pixel-cats'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

export function ServerSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeServerId, setActiveServer } = useChatStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [copiedId, setCopiedId] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    server: ServerEntry
  } | null>(null)

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

  const { setMobileView } = useUIStore()

  const leaveServer = useMutation({
    mutationFn: (serverId: string) =>
      fetchApi(`/api/servers/${serverId}/leave`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setContextMenu(null)
      navigate({ to: '/app' })
    },
  })

  const handleContextMenu = useCallback((e: React.MouseEvent, server: ServerEntry) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, server })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleSelect = (serverId: string, slug?: string | null) => {
    setActiveServer(serverId)
    setMobileView('channels')
    navigate({ to: '/app/servers/$serverId', params: { serverId: slug ?? serverId } })
    onNavigate?.()
  }

  return (
    <div className="w-[72px] bg-bg-tertiary flex flex-col items-center py-3 gap-2 shrink-0">
      {/* Home button */}
      <button
        onClick={() => navigate({ to: '/app' })}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-bg-primary hover:bg-[#5865F2] transition-all duration-200 flex items-center justify-center overflow-hidden"
        title={t('server.home')}
      >
        <img src="/Logo.svg" alt="Shadow" className="w-7 h-7" />
      </button>

      <div className="w-8 h-0.5 bg-[#404249] rounded-full my-1" />

      {/* Server list */}
      {servers.map((s, i) => (
        <div key={s.server.id} className="relative group/server">
          <button
            onClick={() => handleSelect(s.server.id, s.server.slug)}
            onContextMenu={(e) => handleContextMenu(e, s)}
            className={`w-12 h-12 transition-all duration-200 flex items-center justify-center font-bold text-[15px] overflow-hidden ${
              activeServerId === s.server.id
                ? 'bg-[#5865F2] rounded-[16px] text-white shadow-sm'
                : 'bg-bg-primary text-text-primary rounded-[24px] hover:rounded-[16px] hover:bg-[#5865F2] hover:text-white'
            }`}
          >
            {s.server.iconUrl ? (
              <img src={s.server.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <img src={getCatAvatar(i)} alt={s.server.name} className="w-10 h-10" />
            )}
          </button>
          {/* Tooltip */}
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-zinc-900 text-white text-sm font-medium rounded-md shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover/server:opacity-100 transition-opacity z-50">
            {s.server.name}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900" />
          </div>
        </div>
      ))}

      {/* Add server */}
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-bg-primary hover:bg-[#23a559] transition-all duration-200 flex items-center justify-center text-[#23a559] hover:text-white"
        title={t('server.createServer')}
      >
        <Plus size={24} />
      </button>

      {/* Join server */}
      <button
        onClick={() => setShowJoin(!showJoin)}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-bg-primary hover:bg-[#5865F2] transition-all duration-200 flex items-center justify-center text-[#5865F2] hover:text-white"
        title={t('server.joinServer')}
      >
        <UserPlus size={20} />
      </button>

      {/* Discover servers */}
      <button
        onClick={() => navigate({ to: '/app/discover' })}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-bg-primary hover:bg-[#23a559] transition-all duration-200 flex items-center justify-center text-[#23a559] hover:text-white"
        title={t('server.discover')}
      >
        <Compass size={24} className="opacity-90" />
      </button>

      {/* Settings */}
      <div className="mt-auto flex flex-col items-center gap-2">
        {/* Buddy management */}
        <button
          onClick={() => navigate({ to: '/app/agents' })}
          className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-bg-primary hover:bg-[#5865F2] transition-all duration-200 flex items-center justify-center text-[#5865F2] hover:text-white"
          title={t('agentMgmt.title')}
        >
          <img src="/Logo.svg" alt="Buddy" className="w-6 h-6 opacity-90" />
        </button>

        <button
          onClick={() => navigate({ to: '/app/settings' })}
          className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-bg-primary hover:bg-[#80848e] transition-all duration-200 flex items-center justify-center text-text-muted hover:text-white"
          title={t('server.settings')}
        >
          <Settings size={22} className="opacity-90" />
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

      {/* Server context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={closeContextMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              closeContextMenu()
            }}
          />
          <div
            className="fixed z-[61] bg-bg-tertiary border border-white/10 rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {/* Server info */}
            <button
              type="button"
              onClick={() => {
                handleSelect(contextMenu.server.server.id, contextMenu.server.server.slug)
                setContextMenu(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
            >
              <Info size={14} />
              {t('server.serverInfo')}
            </button>

            {/* Invite members */}
            <button
              type="button"
              onClick={() => {
                handleSelect(contextMenu.server.server.id, contextMenu.server.server.slug)
                setContextMenu(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
            >
              <UserPlus size={14} />
              {t('server.inviteMembers')}
            </button>

            {/* Copy server ID */}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.server.server.id)
                setCopiedId(true)
                setTimeout(() => setCopiedId(false), 2000)
                setContextMenu(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
            >
              {copiedId ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copiedId ? t('common.copied') : t('server.copyServerId')}
            </button>

            {/* Leave server */}
            <div className="h-px bg-white/5 my-1" />
            <button
              type="button"
              onClick={() => {
                const name = contextMenu.server.server.name
                if (confirm(t('server.leaveConfirm', { name }))) {
                  leaveServer.mutate(contextMenu.server.server.id)
                }
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
            >
              <LogOut size={14} />
              {t('server.leaveServer')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
