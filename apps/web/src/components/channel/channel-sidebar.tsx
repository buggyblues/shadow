import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Hash,
  Lock,
  Megaphone,
  Menu,
  PawPrint,
  Plus,
  Settings,
  Trash2,
  UserPlus,
  Volume2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChannelSort } from '../../hooks/use-channel-sort'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { joinChannel } from '../../lib/socket'

import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { ContextMenu } from '../common/context-menu'
import { InvitePanel } from '../common/invite-panel'
import { ServerSettingsModal } from '../server/server-settings-modal'
import { ChannelSortFilterButton } from './channel-sort-button'

interface Channel {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  position: number
  isPrivate: boolean
  isArchived?: boolean
  isMember?: boolean
  createdAt?: string
  updatedAt?: string
  lastMessageAt?: string | null
}

interface Server {
  id: string
  name: string
  description: string | null
  slug: string
  iconUrl: string | null
  bannerUrl: string | null
  homepageHtml: string | null
  isPublic: boolean
  inviteCode: string
  ownerId: string
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

interface ServerMember {
  userId: string
  role: string
  user?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot: boolean
  } | null
}

const channelIcons = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
}

export function ChannelSidebar({ serverSlug }: { serverSlug: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeChannelId, setActiveChannel } = useChatStore()
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [showServerEdit, setShowServerEdit] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'text' | 'voice' | 'announcement'>('text')
  const [newIsPrivate, setNewIsPrivate] = useState(false)

  // Listen for 'create-channel' pending action from task center
  const pendingAction = useUIStore((s) => s.pendingAction)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'create-channel') {
      setShowCreate(true)
      setPendingAction(null)
    }
  }, [pendingAction, setPendingAction])

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    channel: Channel
  } | null>(null)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteInitialTab, setInviteInitialTab] = useState<'members' | 'buddies'>('members')
  const [inviteTargetChannel, setInviteTargetChannel] = useState<Channel | null>(null)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [editChannelName, setEditChannelName] = useState('')
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number; y: number } | null>(null)
  const scopeReadCooldownRef = useRef<Map<string, number>>(new Map())
  const scopeReadInFlightRef = useRef<Set<string>>(new Set())
  const lastMarkedChannelRef = useRef<string | null>(null)

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverSlug}`),
  })

  const { data: rawChannels = [] } = useQuery<Channel[]>({
    queryKey: ['channels', serverSlug],
    queryFn: () => fetchApi<Channel[]>(`/api/servers/${serverSlug}/channels`),
  })

  // Channel sorting and filter
  const [showArchived, setShowArchived] = useState(false)
  const { sortChannels, updateLastAccessed } = useChannelSort(server?.id)
  const sortedChannels = sortChannels(rawChannels)
  const channels = showArchived ? sortedChannels : sortedChannels.filter((ch) => !ch.isArchived)

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
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const serverUnreadCount = scopedUnread?.serverUnread?.[server?.id ?? serverSlug] ?? 0

  const createChannel = useMutation({
    mutationFn: (data: { name: string; type: string; isPrivate?: boolean }) =>
      fetchApi<Channel>(`/api/servers/${serverSlug}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverSlug] })
      setShowCreate(false)
      setNewName('')
      setNewIsPrivate(false)
      // Auto-navigate to the newly created channel
      handleSelectChannel(data.id)
      // Show invite panel for the new channel
      setInviteTargetChannel(data)
      setShowInvitePanel(true)
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

  const openServerEdit = () => {
    setShowServerEdit(true)
  }

  const deleteChannel = useMutation({
    mutationFn: (channelId: string) =>
      fetchApi(`/api/channels/${channelId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, deletedChannelId) => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverSlug] })
      // If the deleted channel was active, navigate to next available channel
      if (activeChannelId === deletedChannelId) {
        const remaining = channels.filter((ch) => ch.id !== deletedChannelId)
        if (remaining.length > 0) {
          handleSelectChannel(remaining[0]!.id)
        } else {
          // No channels left — go to server home
          setActiveChannel(null)
          navigate({
            to: '/servers/$serverSlug',
            params: { serverSlug: server?.slug ?? serverSlug },
          })
        }
      }
    },
  })

  const archiveChannel = useMutation({
    mutationFn: (channelId: string) =>
      fetchApi(`/api/channels/${channelId}/archive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverSlug] })
    },
  })

  const unarchiveChannel = useMutation({
    mutationFn: (channelId: string) =>
      fetchApi(`/api/channels/${channelId}/unarchive`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverSlug] })
    },
  })

  const updateChannel = useMutation({
    mutationFn: (data: { channelId: string; name?: string; isPrivate?: boolean }) =>
      fetchApi(`/api/channels/${data.channelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: data.name, isPrivate: data.isPrivate }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverSlug] })
      setEditingChannel(null)
      setEditChannelName('')
    },
  })

  const handleContextMenu = (e: React.MouseEvent, channel: Channel) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, channel })
  }

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  const { setMobileView, openMobileServerSidebar } = useUIStore()

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      requestMarkScopeRead({ channelId })
      updateLastAccessed(channelId)
      setMobileView('chat')
      // Navigate to channel URL using channel ID
      navigate({
        to: '/servers/$serverSlug/channels/$channelId',
        params: { serverSlug: server?.slug ?? serverSlug, channelId },
      })
    },
    [setMobileView, server?.slug, serverSlug, navigate, requestMarkScopeRead, updateLastAccessed],
  )

  // Rejoin active channel room on socket reconnect
  useSocketEvent('connect', () => {
    const currentChannel = useChatStore.getState().activeChannelId
    if (currentChannel) {
      joinChannel(currentChannel)
    }
  })

  useEffect(() => {
    if (!activeChannelId) {
      lastMarkedChannelRef.current = null
      return
    }
    if (lastMarkedChannelRef.current === activeChannelId) return
    lastMarkedChannelRef.current = activeChannelId
    requestMarkScopeRead({ channelId: activeChannelId })
  }, [activeChannelId, requestMarkScopeRead])

  // Auto-refresh channel list when a new channel is created
  useSocketEvent('channel:created', (data: { serverId: string }) => {
    if (data.serverId === serverSlug || data.serverId === server?.id) {
      queryClient.invalidateQueries({ queryKey: ['channels', serverSlug] })
    }
  })

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  })

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  const textChannels = channels.filter((c) => c.type === 'text')
  const voiceChannels = channels.filter((c) => c.type === 'voice')
  const announcementChannels = channels.filter((c) => c.type === 'announcement')

  const renderChannelGroup = (label: string, items: Channel[]) => {
    if (items.length === 0) return null
    const isCollapsed = !!collapsedGroups[label]
    return (
      <div className="mb-0.5">
        <div className="flex items-center justify-between pr-2">
          <button
            type="button"
            onClick={() => toggleGroup(label)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-black tracking-[0.1em] uppercase text-text-muted hover:text-text-primary flex-1 transition-colors"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0 text-text-muted/60">
              {isCollapsed ? (
                <ChevronRight size={10} strokeWidth={3} className="shrink-0" />
              ) : (
                <ChevronDown size={10} strokeWidth={3} className="shrink-0" />
              )}
            </div>
            <span className="truncate">{label}</span>
          </button>
        </div>
        {!isCollapsed && (
          <div className="px-2 space-y-0.5 mt-0.5">
            {items.map((ch) => {
              const Icon = channelIcons[ch.type]
              const isActive = activeChannelId === ch.id
              const isEditing = editingChannel?.id === ch.id
              const unreadCount = scopedUnread?.channelUnread?.[ch.id] ?? 0
              const isUnread = !isActive && unreadCount > 0
              return isEditing ? (
                <div
                  key={ch.id}
                  className="relative flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-xl border border-primary/20"
                >
                  <Icon size={16} className="shrink-0 text-text-muted" />
                  <Input
                    type="text"
                    value={editChannelName}
                    onChange={(e) => setEditChannelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editChannelName.trim()) {
                        updateChannel.mutate({ channelId: ch.id, name: editChannelName.trim() })
                      } else if (e.key === 'Escape') {
                        setEditingChannel(null)
                      }
                    }}
                    // biome-ignore lint/a11y/noAutofocus: needed for inline edit UX
                    autoFocus
                    className="flex-1 !bg-transparent !border-none !shadow-none !ring-0 text-text-primary font-black !rounded-md !px-2 !py-1 text-sm focus:!ring-1 focus:!ring-primary pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editChannelName.trim()) {
                        updateChannel.mutate({ channelId: ch.id, name: editChannelName.trim() })
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-success/20 text-success hover:text-success/80 transition-colors"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  key={ch.id}
                  data-channel-item
                  onClick={async () => {
                    if (ch.isMember === false) {
                      await fetchApi(`/api/channels/${ch.id}/members`, {
                        method: 'POST',
                        body: JSON.stringify({}),
                      })
                      queryClient.invalidateQueries({ queryKey: ['channels', serverSlug] })
                    }
                    handleSelectChannel(ch.id)
                  }}
                  onContextMenu={(e) => handleContextMenu(e, ch)}
                  className={cn(
                    'group flex items-center gap-2 px-2 py-[6px] rounded-xl text-sm font-medium w-full text-left transition-all duration-300',
                    isActive
                      ? 'channel-pill-active text-primary ring-1 ring-primary/20'
                      : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary',
                    isUnread && 'font-bold text-text-primary',
                  )}
                >
                  <div
                    className={cn(
                      'w-6 h-6 flex items-center justify-center rounded-lg shrink-0 transition-all duration-300',
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-bg-tertiary/50 text-text-muted group-hover:text-text-primary',
                    )}
                  >
                    <Icon size={14} />
                  </div>
                  <span className={cn('truncate', ch.isArchived && 'text-text-muted italic')}>
                    {ch.name}
                  </span>
                  {ch.isArchived && <Archive size={12} className="text-text-muted/60 shrink-0" />}
                  {ch.isPrivate && <Lock size={12} className="text-text-muted/60 shrink-0" />}
                  {ch.isMember === false && (
                    <Badge variant="primary" size="xs" className="shrink-0">
                      加入
                    </Badge>
                  )}
                  {isUnread && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/30 shrink-0 animate-pulse" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full h-full glass-panel overflow-hidden flex flex-col shrink-0 relative z-20">
      {/* Server name header — glassmorphic bar */}
      <div
        onClick={openServerEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openServerEdit()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Server settings"
        className="h-14 px-4 flex items-center justify-between bg-bg-secondary/40 backdrop-blur-xl sticky top-0 z-20 transition-all hover:bg-bg-modifier-hover cursor-pointer group/header border-b border-border-subtle"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Mobile menu button to open server sidebar */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openMobileServerSidebar()
            }}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-full bg-bg-tertiary/50 text-text-muted hover:text-primary transition shrink-0"
          >
            <Menu size={18} />
          </button>
          <h2 className="font-black text-text-primary truncate tracking-tight group-hover/header:text-primary transition-colors">
            {server?.name ?? '...'}
          </h2>
          {serverUnreadCount > 0 && (
            <span className="w-2.5 h-2.5 rounded-full bg-danger shrink-0 shadow-lg shadow-danger/20 animate-pulse" />
          )}
        </div>
        <div className="w-8 h-8 flex items-center justify-center rounded-xl bg-transparent group-hover/header:bg-bg-modifier-hover text-text-muted group-hover/header:text-primary transition-all">
          <ChevronDown
            size={18}
            className="group-hover/header:translate-y-0.5 transition-transform"
          />
        </div>
      </div>

      {/* Channel list */}
      <div
        className="flex-1 overflow-y-auto pt-4 scrollbar-hidden"
        onContextMenu={(e) => {
          // Only trigger if clicking on the blank area (not on a channel item)
          if ((e.target as HTMLElement).closest('[data-channel-item]')) return
          e.preventDefault()
          setBlankContextMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {/* Channel filter and sort bar */}
        {server?.id && (
          <div className="flex items-center justify-between px-3 py-1.5 mb-1">
            <span className="text-[11px] font-black tracking-[0.15em] uppercase text-text-muted/60">
              {t('channel.channels', { defaultValue: '频道' })}
            </span>
            <div className="flex items-center gap-1">
              <ChannelSortFilterButton
                serverId={server.id}
                showArchived={showArchived}
                onShowArchivedChange={setShowArchived}
              />
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-primary transition-all hover:bg-primary/10 rounded-full"
                title={t('channel.createChannel')}
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
          </div>
        )}

        <div className="px-1 space-y-0.5">
          {renderChannelGroup(t('channel.announcement'), announcementChannels)}
          {renderChannelGroup(t('channel.text'), textChannels)}
          {renderChannelGroup(t('channel.voice'), voiceChannels)}
        </div>

        {channels.length === 0 && (
          <div className="px-4 py-6 text-center">
            <div className="w-12 h-12 bg-bg-tertiary/50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-text-muted opacity-20">
              <Hash size={24} />
            </div>
            <p className="text-text-muted/40 text-xs font-bold leading-relaxed">
              {t('channel.noChannels')}
            </p>
          </div>
        )}
      </div>

      {/* Create channel dialog */}
      <Dialog isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <DialogContent className="max-w-md rounded-[40px] shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle>{t('channel.createChannel')}</DialogTitle>
            <DialogDescription>
              {t('channel.channels', { defaultValue: '创建一个新频道' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              label={t('channel.channelName')}
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
                  createChannel.mutate({
                    name: newName.trim(),
                    type: newType,
                    isPrivate: newIsPrivate,
                  })
                }
              }}
              placeholder={t('channel.channelName')}
              className="!rounded-2xl !py-3 !bg-bg-tertiary/50 !border-2 !border-border-subtle focus:!ring-4 focus:!ring-primary/10"
            />
            <div className="flex gap-2">
              {(['text', 'voice', 'announcement'] as const).map((chType) => (
                <Button
                  key={chType}
                  variant={newType === chType ? 'primary' : 'glass'}
                  size="xs"
                  onClick={() => setNewType(chType)}
                  className="uppercase tracking-widest font-black"
                >
                  {chType === 'text'
                    ? t('channel.typeText')
                    : chType === 'voice'
                      ? t('channel.typeVoice')
                      : t('channel.typeAnnouncement')}
                </Button>
              ))}
            </div>
            <label className="flex items-center justify-between bg-bg-tertiary/50 rounded-xl px-4 py-3 border border-border-subtle">
              <span className="text-sm text-foreground">私有频道（仅受邀加入）</span>
              <Switch checked={newIsPrivate} onCheckedChange={(val) => setNewIsPrivate(val)} />
            </label>
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
              onClick={() => {
                if (!newName.trim()) return
                createChannel.mutate({
                  name: newName.trim(),
                  type: newType,
                  isPrivate: newIsPrivate,
                })
              }}
              disabled={!newName.trim() || createChannel.isPending}
              loading={createChannel.isPending}
              className="uppercase tracking-widest font-black"
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Server settings modal */}
      <ServerSettingsModal
        open={showServerEdit}
        onClose={() => setShowServerEdit(false)}
        server={server}
        serverSlug={serverSlug}
      />

      {/* Channel context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          groups={[
            {
              items: [
                {
                  icon: UserPlus,
                  label: t('channel.inviteMember'),
                  onClick: () => {
                    setInviteTargetChannel(contextMenu.channel)
                    setInviteInitialTab('members')
                    setShowInvitePanel(true)
                  },
                },
                {
                  icon: PawPrint,
                  label: t('channel.addAgent'),
                  onClick: () => {
                    setInviteTargetChannel(contextMenu.channel)
                    setInviteInitialTab('buddies')
                    setShowInvitePanel(true)
                  },
                },
              ],
            },
            {
              items: [
                {
                  icon: Volume2,
                  label: (notificationPreference?.mutedChannelIds ?? []).includes(
                    contextMenu.channel.id,
                  )
                    ? '取消静音频道'
                    : '静音频道通知',
                  onClick: () => {
                    const current = notificationPreference?.mutedChannelIds ?? []
                    const isMuted = current.includes(contextMenu.channel.id)
                    const next = isMuted
                      ? current.filter((id) => id !== contextMenu.channel.id)
                      : [...current, contextMenu.channel.id]
                    updateNotificationPreference.mutate({ mutedChannelIds: next })
                  },
                },
              ],
            },
            {
              items: [
                {
                  icon: Edit3,
                  label: t('channel.editChannel'),
                  onClick: () => {
                    setEditingChannel(contextMenu.channel)
                    setEditChannelName(contextMenu.channel.name)
                  },
                },
                {
                  icon: Lock,
                  label: contextMenu.channel.isPrivate ? '设为公开频道' : '设为私有频道',
                  onClick: () => {
                    updateChannel.mutate({
                      channelId: contextMenu.channel.id,
                      name: contextMenu.channel.name,
                      isPrivate: !contextMenu.channel.isPrivate,
                    })
                  },
                },
                {
                  icon: Copy,
                  label: t('channel.copyChannelLink'),
                  onClick: () => {
                    const slug = server?.slug ?? serverSlug
                    const channelLink = `${window.location.origin}/app/servers/${slug}/channels/${contextMenu.channel.id}`
                    navigator.clipboard.writeText(channelLink)
                  },
                },
              ],
            },
            {
              items: [
                {
                  icon: Archive,
                  label: contextMenu.channel.isArchived
                    ? t('channel.unarchiveChannel', { defaultValue: '取消归档' })
                    : t('channel.archiveChannel', { defaultValue: '归档频道' }),
                  onClick: async () => {
                    if (contextMenu.channel.isArchived) {
                      const ok = await useConfirmStore.getState().confirm({
                        title: t('channel.unarchiveChannel', { defaultValue: '取消归档' }),
                        message: t('channel.unarchiveChannelConfirm', {
                          defaultValue: '确定要取消归档此频道吗？',
                        }),
                      })
                      if (ok) {
                        unarchiveChannel.mutate(contextMenu.channel.id)
                      }
                    } else {
                      const ok = await useConfirmStore.getState().confirm({
                        title: t('channel.archiveChannel', { defaultValue: '归档频道' }),
                        message: t('channel.archiveChannelConfirm', {
                          defaultValue: '确定要归档此频道吗？归档后频道将变为只读。',
                        }),
                      })
                      if (ok) {
                        archiveChannel.mutate(contextMenu.channel.id)
                      }
                    }
                  },
                },
                {
                  icon: Trash2,
                  label: t('channel.deleteChannel'),
                  danger: true,
                  onClick: async () => {
                    const ok = await useConfirmStore.getState().confirm({
                      title: t('channel.deleteChannel'),
                      message: t('channel.deleteChannelConfirm'),
                    })
                    if (ok) {
                      deleteChannel.mutate(contextMenu.channel.id)
                    }
                  },
                },
              ],
            },
          ]}
        />
      )}

      {/* Blank area context menu */}
      {blankContextMenu && (
        <ContextMenu
          x={blankContextMenu.x}
          y={blankContextMenu.y}
          onClose={() => setBlankContextMenu(null)}
          groups={[
            {
              items: [
                {
                  icon: Plus,
                  label: t('channel.createChannel'),
                  onClick: () => setShowCreate(true),
                },
                {
                  icon: UserPlus,
                  label: t('channel.inviteMember'),
                  onClick: () => {
                    setInviteTargetChannel(null)
                    setInviteInitialTab('members')
                    setShowInvitePanel(true)
                  },
                },
                {
                  icon: PawPrint,
                  label: t('channel.addAgent'),
                  onClick: () => {
                    setInviteTargetChannel(null)
                    setInviteInitialTab('buddies')
                    setShowInvitePanel(true)
                  },
                },
              ],
            },
            {
              items: [
                {
                  icon: Volume2,
                  label: (notificationPreference?.mutedServerIds ?? []).includes(server?.id ?? '')
                    ? '取消静音服务器'
                    : '静音服务器通知',
                  onClick: () => {
                    if (!server?.id) return
                    const current = notificationPreference?.mutedServerIds ?? []
                    const isMuted = current.includes(server.id)
                    const next = isMuted
                      ? current.filter((id) => id !== server.id)
                      : [...current, server.id]
                    updateNotificationPreference.mutate({ mutedServerIds: next })
                  },
                },
                {
                  icon: Settings,
                  label: t('channel.serverSettings'),
                  onClick: openServerEdit,
                },
              ],
            },
          ]}
        />
      )}

      {/* Invite Panel */}
      {showInvitePanel && server?.inviteCode && (
        <InvitePanel
          serverId={serverSlug}
          channelId={inviteTargetChannel?.id}
          channelName={inviteTargetChannel?.name}
          initialTab={inviteInitialTab}
          onClose={() => {
            setShowInvitePanel(false)
            setInviteTargetChannel(null)
          }}
        />
      )}
    </div>
  )
}
