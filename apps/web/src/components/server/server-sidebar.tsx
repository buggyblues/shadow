import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Compass, Copy, Info, LogOut, Plus, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { getLastChannelId } from '../../lib/last-channel'
import { getCatAvatar } from '../../lib/pixel-cats'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { useConfirmStore } from '../common/confirm-dialog'

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null; ownerId: string }
  member: { role: string }
}

interface NotificationPreference {
  strategy: 'all' | 'mention_only' | 'none'
  mutedServerIds: string[]
  mutedChannelIds: string[]
}

interface ScopedUnread {
  channelUnread: Record<string, number>
  serverUnread: Record<string, number>
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
  const scopeReadCooldownRef = useRef<Map<string, number>>(new Map())
  const scopeReadInFlightRef = useRef<Set<string>>(new Set())
  const { user } = useAuthStore()

  // Listen for 'create-server' pending action from task center
  const pendingAction = useUIStore((s) => s.pendingAction)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'create-server') {
      setShowCreate(true)
      setPendingAction(null)
    }
  }, [pendingAction, setPendingAction])

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: scopedUnread } = useQuery({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
    refetchInterval: 15_000,
  })

  const { data: notificationPreference } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => fetchApi<NotificationPreference>('/api/notifications/preferences'),
  })

  const updateNotificationPreference = useMutation({
    mutationFn: (payload: Partial<NotificationPreference>) =>
      fetchApi<NotificationPreference>('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const createServer = useMutation({
    mutationFn: (name: string) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreate(false)
      setNewName('')
      handleSelect(data.id, data.slug)
    },
  })

  const requestMarkScopeRead = useCallback(
    async (payload: { serverId?: string; channelId?: string }) => {
      const key = payload.channelId
        ? `channel:${payload.channelId}`
        : payload.serverId
          ? `server:${payload.serverId}`
          : ''
      if (!key) return

      const now = Date.now()
      const last = scopeReadCooldownRef.current.get(key) ?? 0
      if (now - last < 1200) return
      if (scopeReadInFlightRef.current.has(key)) return

      scopeReadCooldownRef.current.set(key, now)
      scopeReadInFlightRef.current.add(key)
      try {
        await fetchApi('/api/notifications/read-scope', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      } finally {
        scopeReadInFlightRef.current.delete(key)
      }
    },
    [queryClient],
  )

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  })

  const joinServer = useMutation({
    mutationFn: (inviteCode: string) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowJoin(false)
      setJoinCode('')
      handleSelect(data.id, data.slug)
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
    const serverSlug = slug ?? serverId
    // Navigate to last-visited channel if available, otherwise show server home
    const lastChannelId = getLastChannelId(serverId)
    if (lastChannelId) {
      navigate({
        to: '/app/servers/$serverSlug/channels/$channelId',
        params: { serverSlug, channelId: lastChannelId },
      })
    } else {
      navigate({ to: '/app/servers/$serverSlug', params: { serverSlug } })
    }
    requestMarkScopeRead({ serverId })
    onNavigate?.()
  }

  return (
    <div className="w-[72px] bg-bg-tertiary flex flex-col items-center py-3 shrink-0 h-full overflow-hidden">
      {/* User avatar → settings/profile */}
      <div className="relative group/user shrink-0">
        <button
          onClick={() => navigate({ to: '/app/settings' })}
          className="w-12 h-12 rounded-full bg-bg-primary hover:ring-2 hover:ring-primary/60 transition-all duration-200 flex items-center justify-center overflow-hidden"
          title={user?.displayName || user?.username || t('settings.tabProfile')}
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#5865F2] flex items-center justify-center text-white font-bold text-lg">
              {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </button>
        {/* Tooltip */}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-bg-tertiary text-text-primary text-sm font-medium rounded-md shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover/user:opacity-100 transition-opacity z-50">
          {user?.displayName || user?.username}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-bg-tertiary" />
        </div>
      </div>

      <div className="w-8 h-0.5 bg-divider rounded-full my-1 shrink-0" />

      {/* Scrollable server list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2 min-h-0 py-1 scrollbar-thin">
        {servers.map((s, i) => (
          <div key={s.server.id} className="relative group/server shrink-0">
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
            {(scopedUnread?.serverUnread?.[s.server.id] ?? 0) > 0 &&
              !notificationPreference?.mutedServerIds?.includes(s.server.id) && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-danger border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
              )}
            {/* Tooltip */}
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 bg-bg-tertiary text-text-primary text-sm font-medium rounded-md shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover/server:opacity-100 transition-opacity z-50">
              {s.server.name}
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-bg-tertiary" />
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons — fixed at bottom */}
      <div className="flex flex-col items-center gap-2 pt-2 shrink-0">
        <div className="w-8 h-0.5 bg-divider rounded-full" />
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
      </div>

      {/* Simple create dialog */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-96 border border-border-subtle"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-4">{t('server.createServer')}</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229 &&
                  newName.trim()
                ) {
                  e.preventDefault()
                  createServer.mutate(newName.trim())
                }
              }}
              placeholder={t('server.serverName')}
              className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary mb-4"
              autoFocus
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
            className="bg-bg-secondary rounded-xl p-6 w-96 border border-border-subtle"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-2">{t('server.joinServer')}</h2>
            <p className="text-text-muted text-sm mb-4">{t('server.joinServerDesc')}</p>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229 &&
                  joinCode.trim().length === 8
                ) {
                  e.preventDefault()
                  joinServer.mutate(joinCode.trim())
                }
              }}
              placeholder={t('server.inviteCodePlaceholder')}
              maxLength={8}
              className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary mb-4 font-mono text-center text-lg tracking-widest"
              autoFocus
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
            className="fixed z-[61] bg-bg-tertiary border border-border-dim rounded-lg shadow-xl py-1 min-w-[180px]"
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

            <button
              type="button"
              onClick={() => {
                const targetId = contextMenu.server.server.id
                const current = notificationPreference?.mutedServerIds ?? []
                const isMuted = current.includes(targetId)
                const next = isMuted
                  ? current.filter((id) => id !== targetId)
                  : [...current, targetId]
                updateNotificationPreference.mutate({ mutedServerIds: next })
                setContextMenu(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
            >
              <Info size={14} />
              {(notificationPreference?.mutedServerIds ?? []).includes(contextMenu.server.server.id)
                ? '取消静音服务器'
                : '静音服务器通知'}
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

            {/* Leave server — hidden for owners */}
            {user?.id !== contextMenu.server.server.ownerId && (
              <>
                <div className="h-px bg-border-subtle my-1" />
                <button
                  type="button"
                  onClick={async () => {
                    const name = contextMenu.server.server.name
                    const ok = await useConfirmStore.getState().confirm({
                      title: t('server.leaveServer'),
                      message: t('server.leaveConfirm', { name }),
                    })
                    if (ok) {
                      leaveServer.mutate(contextMenu.server.server.id)
                    }
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
                >
                  <LogOut size={14} />
                  {t('server.leaveServer')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
