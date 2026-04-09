import {
  Avatar,
  AvatarFallback,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ServerAvatar,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  Compass,
  Copy,
  Globe,
  Info,
  Lock,
  LogOut,
  Plus,
  UserPlus,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { getLastChannelId } from '../../lib/last-channel'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { ContextMenu } from '../common/context-menu'

interface ServerEntry {
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
    ownerId: string
    isPublic?: boolean
  }
  member: { role: string }
}

// Individual server item component to properly use hooks
function ServerItem({
  server,
  member,
  isActive,
  unreadCount,
  isMuted,
  onSelect,
  onContextMenu,
}: {
  server: ServerEntry['server']
  member: ServerEntry['member']
  isActive: boolean
  unreadCount: number
  isMuted: boolean
  onSelect: (id: string, slug?: string | null) => void
  onContextMenu: (e: React.MouseEvent, serverEntry: ServerEntry) => void
}) {
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      onContextMenu(e, { server, member })
    },
    [onContextMenu, server, member],
  )

  return (
    <div className="relative shrink-0 flex items-center justify-center group/item w-[56px] h-[56px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(server.id, server.slug)}
            onContextMenu={handleContextMenu}
            className={cn(
              'w-[56px] h-[56px] transition-all duration-300 flex items-center justify-center overflow-visible bouncy',
              isActive
                ? // Server item should be rounded rect to distinguish from user avatar, with stronger highlight when active
                  'rounded-3xl ring-[3px] ring-primary ring-offset-2 ring-offset-bg-deep shadow-[0_0_24px_rgba(0,243,255,0.4)]'
                : 'rounded-3xl ring-0 hover:ring-[3px] hover:ring-primary/50 hover:shadow-[0_0_16px_rgba(0,243,255,0.15)] opacity-80 hover:opacity-100',
            )}
          >
            <ServerAvatar iconUrl={server.iconUrl} name={server.name} />{' '}
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="right"
            className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
          >
            {server.name}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      {server.isPublic === false && (
        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bg-deep/80 backdrop-blur flex items-center justify-center shadow-sm">
          <Lock size={10} className="text-text-muted" />
        </span>
      )}
      {unreadCount > 0 && !isMuted && (
        <span className="absolute top-0 right-0 min-w-[12px] h-3 rounded-full border-2 border-[#12121a] bg-primary shadow-[0_0_6px_rgba(0,243,255,0.5)] z-10" />
      )}
    </div>
  )
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
  const [isPublic, setIsPublic] = useState(true)
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
    mutationFn: ({ name, isPublic }: { name: string; isPublic: boolean }) =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreate(false)
      setNewName('')
      setIsPublic(true)
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
      navigate({ to: '/' })
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
        to: '/servers/$serverSlug/channels/$channelId',
        params: { serverSlug, channelId: lastChannelId },
      })
    } else {
      navigate({ to: '/servers/$serverSlug', params: { serverSlug } })
    }
    requestMarkScopeRead({ serverId })
    onNavigate?.()
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-[88px] glass-panel !overflow-visible flex flex-col items-center py-4 shrink-0 h-full z-50">
        {/* User avatar → settings/profile */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: '/settings' })}
              className="w-[56px] h-[56px] rounded-full p-0 overflow-visible hover:ring-[3px] hover:ring-primary hover:shadow-[0_0_24px_rgba(0,243,255,0.4)] transition-all duration-300 flex items-center justify-center relative bouncy"
            >
              <Avatar
                avatarUrl={user?.avatarUrl}
                displayName={user?.displayName || user?.username}
                className="w-[56px] h-[56px]"
              >
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                  {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="right"
              className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
            >
              {user?.displayName || user?.username}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>

        <div className="w-8 h-0.5 bg-border/20 rounded-full my-1 shrink-0" />

        {/* Scrollable server list */}
        <div className="flex-1 overflow-y-auto overflow-x-visible px-4 flex flex-col items-center gap-3 min-h-0 py-3 scrollbar-hidden w-full">
          {servers.map((s) => (
            <ServerItem
              key={s.server.id}
              server={s.server}
              member={s.member}
              isActive={activeServerId === s.server.id}
              unreadCount={scopedUnread?.serverUnread?.[s.server.id] ?? 0}
              isMuted={notificationPreference?.mutedServerIds?.includes(s.server.id) ?? false}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>

        {/* Action buttons — fixed at bottom */}
        <div className="flex flex-col items-center gap-2 pt-2 shrink-0">
          <div className="w-8 h-0.5 bg-border/20 rounded-full" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="glass"
                size="icon"
                className="w-[56px] h-[56px] rounded-full bouncy"
                onClick={() => setShowCreate(!showCreate)}
              >
                <Plus size={24} />
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
              >
                {t('server.createServer')}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          {/* Join server */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="glass"
                size="icon"
                className="w-[56px] h-[56px] rounded-full bouncy"
                onClick={() => setShowJoin(!showJoin)}
              >
                <UserPlus size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
              >
                {t('server.joinServer')}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          {/* Discover servers */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="glass"
                size="icon"
                className="w-[56px] h-[56px] rounded-full bouncy"
                onClick={() => navigate({ to: '/discover' })}
              >
                <Compass size={24} className="opacity-90" />
              </Button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent
                side="right"
                className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
              >
                {t('server.discover')}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>

          {/* OpenClaw — desktop only */}
          {'desktopAPI' in window && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-[56px] h-[56px] rounded-full hover:scale-105 bouncy"
                  onClick={() => navigate({ to: '/openclaw' })}
                >
                  <svg
                    width={24}
                    height={24}
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <defs>
                      <radialGradient
                        id="sb_oc_body"
                        cx="0"
                        cy="0"
                        r="1"
                        gradientUnits="userSpaceOnUse"
                        gradientTransform="translate(50 48) rotate(90) scale(42)"
                      >
                        <stop stopColor="#FF5E69" />
                        <stop offset="1" stopColor="#E53945" />
                      </radialGradient>
                      <linearGradient
                        id="sb_oc_claw"
                        x1="10"
                        y1="50"
                        x2="30"
                        y2="70"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop stopColor="#FF5E69" />
                        <stop offset="1" stopColor="#D93540" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M40 15C35 5 25 5 20 10"
                      stroke="#E53945"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M60 15C65 5 75 5 80 10"
                      stroke="#E53945"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M35 85C35 88 32 92 28 92C24 92 22 88 24 85"
                      stroke="#B3242E"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M65 85C65 88 68 92 72 92C76 92 78 88 76 85"
                      stroke="#B3242E"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    <circle cx="15" cy="55" r="12" fill="url(#sb_oc_claw)" />
                    <circle cx="85" cy="55" r="12" fill="url(#sb_oc_claw)" />
                    <circle cx="50" cy="50" r="40" fill="url(#sb_oc_body)" />
                    <circle cx="35" cy="42" r="9" fill="white" />
                    <circle cx="65" cy="42" r="9" fill="white" />
                    <circle cx="37" cy="41" r="5" fill="#1a1a2e" />
                    <circle cx="67" cy="41" r="5" fill="#1a1a2e" />
                    <circle cx="38" cy="39" r="2" fill="white" />
                    <circle cx="68" cy="39" r="2" fill="white" />
                    <circle cx="24" cy="55" r="5" fill="#FFC1C7" opacity="0.5" />
                    <circle cx="76" cy="55" r="5" fill="#FFC1C7" opacity="0.5" />
                    <path
                      d="M42 60C45 64 55 64 58 60"
                      stroke="#8B1A24"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent
                  side="right"
                  className="z-[100] font-bold px-3 py-1.5 text-[14px] bg-bg-secondary/90 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.4)] rounded-2xl ml-4"
                >
                  OpenClaw
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}
        </div>

        {/* Simple create dialog */}
        <Dialog isOpen={showCreate} onClose={() => setShowCreate(false)}>
          <DialogContent className="max-w-sm rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
            <DialogHeader>
              <DialogTitle>{t('server.createServer')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <Input
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
                    createServer.mutate({ name: newName.trim(), isPublic })
                  }
                }}
                placeholder={t('server.serverName')}
                className="w-full rounded-2xl px-5 py-3.5 font-bold"
              />
              {/* Public/Private toggle */}
              <div className="flex items-center justify-between p-4 bg-bg-tertiary/50 rounded-2xl border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-bg-tertiary/50 flex items-center justify-center shadow-inner">
                    {isPublic ? (
                      <Globe size={16} className="text-text-primary" />
                    ) : (
                      <Lock size={16} className="text-text-primary" />
                    )}
                  </div>
                  <div>
                    <div className="text-text-primary font-bold text-sm">
                      {isPublic ? t('server.publicServer') : t('server.privateServer')}
                    </div>
                    <div className="text-text-muted text-xs font-bold opacity-60">
                      {isPublic ? t('server.publicServerDesc') : t('server.privateServerDesc')}
                    </div>
                  </div>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowCreate(false)}
                className="uppercase tracking-widest font-black"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  newName.trim() && createServer.mutate({ name: newName.trim(), isPublic })
                }
                disabled={!newName.trim() || createServer.isPending}
                loading={createServer.isPending}
                className="uppercase tracking-widest font-black"
              >
                {t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Join server dialog */}
        <Dialog isOpen={showJoin} onClose={() => setShowJoin(false)}>
          <DialogContent className="max-w-sm rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
            <DialogHeader>
              <DialogTitle>{t('server.joinServer')}</DialogTitle>
            </DialogHeader>
            <p className="text-text-muted text-sm font-bold opacity-60">
              {t('server.joinServerDesc')}
            </p>
            <Input
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
              className="w-full rounded-2xl px-5 py-3.5 font-mono text-center text-lg tracking-widest"
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowJoin(false)}
                className="uppercase tracking-widest font-black"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => joinCode.trim() && joinServer.mutate(joinCode.trim())}
                disabled={joinCode.trim().length !== 8 || joinServer.isPending}
                loading={joinServer.isPending}
                className="uppercase tracking-widest font-black"
              >
                {t('server.joinButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Server context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={closeContextMenu}
            groups={[
              {
                items: [
                  {
                    icon: Info,
                    label: t('server.serverInfo'),
                    onClick: () =>
                      handleSelect(contextMenu.server.server.id, contextMenu.server.server.slug),
                  },
                  {
                    icon: UserPlus,
                    label: t('server.inviteMembers'),
                    onClick: () =>
                      handleSelect(contextMenu.server.server.id, contextMenu.server.server.slug),
                  },
                ],
              },
              {
                items: [
                  {
                    icon: Volume2,
                    label: (notificationPreference?.mutedServerIds ?? []).includes(
                      contextMenu.server.server.id,
                    )
                      ? '取消静音服务器'
                      : '静音服务器通知',
                    onClick: () => {
                      const targetId = contextMenu.server.server.id
                      const current = notificationPreference?.mutedServerIds ?? []
                      const isMuted = current.includes(targetId)
                      const next = isMuted
                        ? current.filter((id) => id !== targetId)
                        : [...current, targetId]
                      updateNotificationPreference.mutate({ mutedServerIds: next })
                    },
                  },
                  {
                    icon: copiedId ? Check : Copy,
                    label: copiedId ? t('common.copied') : t('server.copyServerId'),
                    onClick: () => {
                      navigator.clipboard.writeText(contextMenu.server.server.id)
                      setCopiedId(true)
                      setTimeout(() => setCopiedId(false), 2000)
                    },
                  },
                ],
              },
              ...(user?.id !== contextMenu.server.server.ownerId
                ? [
                    {
                      items: [
                        {
                          icon: LogOut,
                          label: t('server.leaveServer'),
                          danger: true,
                          onClick: async () => {
                            const name = contextMenu.server.server.name
                            const ok = await useConfirmStore.getState().confirm({
                              title: t('server.leaveServer'),
                              message: t('server.leaveConfirm', { name }),
                            })
                            if (ok) {
                              leaveServer.mutate(contextMenu.server.server.id)
                            }
                          },
                        },
                      ],
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
    </TooltipProvider>
  )
}
