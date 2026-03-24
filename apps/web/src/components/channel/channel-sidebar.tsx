import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  AppWindow,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  FolderClosed,
  Hash,
  Home,
  ImageIcon,
  Lock,
  Megaphone,
  Menu,
  Plus,
  Save,
  Settings,
  ShoppingBag,
  Trash2,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChannelSort } from '../../hooks/use-channel-sort'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { joinChannel } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { ContextMenu } from '../common/context-menu'
import { useConfirmStore } from '../common/confirm-dialog'
import { ChannelSortButton } from './channel-sort-button'

interface Channel {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  position: number
  isPrivate: boolean
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
  const location = useLocation()
  const queryClient = useQueryClient()
  const { activeChannelId, setActiveChannel } = useChatStore()
  const _currentUser = useAuthStore((s) => s.user)
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

  // Server settings dialog state
  const [bannerUploading, setBannerUploading] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  const [serverEditTab, setServerEditTab] = useState<'basic' | 'advanced'>('basic')

  // Server edit form state - centralized draft state
  const [serverFormDraft, setServerFormDraft] = useState<{
    name: string
    description: string
    slug: string
    isPublic: boolean
    homepageHtml: string
    iconUrl: string | null
    bannerUrl: string | null
  }>({
    name: '',
    description: '',
    slug: '',
    isPublic: false,
    homepageHtml: '',
    iconUrl: null,
    bannerUrl: null,
  })
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    channel: Channel
  } | null>(null)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
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

  // Channel sorting
  const { sortChannels, updateLastAccessed } = useChannelSort(server?.id)
  const channels = sortChannels(rawChannels)

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

  const updateServer = useMutation({
    mutationFn: (data: {
      name?: string
      description?: string | null
      slug?: string
      iconUrl?: string | null
      bannerUrl?: string | null
      homepageHtml?: string | null
      isPublic?: boolean
    }) =>
      fetchApi<Server>(`/api/servers/${serverSlug}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (updatedServer) => {
      // Invalidate queries with both old and new slug to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] })
      if (updatedServer.slug !== serverSlug) {
        queryClient.invalidateQueries({ queryKey: ['server', updatedServer.slug] })
      }
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['discover-servers'] })
      // Redirect to slug-based URL if slug changed
      if (updatedServer.slug !== serverSlug) {
        navigate({ to: '/servers/$serverSlug', params: { serverSlug: updatedServer.slug } })
      }
    },
  })

  const deleteServer = useMutation({
    mutationFn: () => fetchApi(`/api/servers/${serverSlug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      navigate({ to: '/' })
    },
  })

  const openServerEdit = () => {
    // Initialize draft state from current server data
    setServerFormDraft({
      name: server?.name ?? '',
      description: server?.description ?? '',
      slug: server?.slug ?? '',
      isPublic: server?.isPublic ?? false,
      homepageHtml: server?.homepageHtml ?? '',
      iconUrl: server?.iconUrl ?? null,
      bannerUrl: server?.bannerUrl ?? null,
    })
    setServerEditTab('basic')
    setShowServerEdit(true)
  }

  // Update draft field helper
  const updateDraftField = <K extends keyof typeof serverFormDraft>(
    field: K,
    value: (typeof serverFormDraft)[K],
  ) => {
    setServerFormDraft((prev) => ({ ...prev, [field]: value }))
  }

  // Check if draft has changes compared to server data
  const hasDraftChanges = () => {
    if (!server) return false
    return (
      serverFormDraft.name !== server.name ||
      serverFormDraft.description !== (server.description ?? '') ||
      serverFormDraft.slug !== (server.slug ?? '') ||
      serverFormDraft.isPublic !== server.isPublic ||
      serverFormDraft.homepageHtml !== (server.homepageHtml ?? '') ||
      serverFormDraft.iconUrl !== server.iconUrl ||
      serverFormDraft.bannerUrl !== server.bannerUrl
    )
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      // Update draft state only - don't save to server yet
      updateDraftField('bannerUrl', result.url)
    } catch {
      /* upload failed */
    } finally {
      setBannerUploading(false)
    }
  }

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIconUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      // Update draft state only - don't save to server yet
      updateDraftField('iconUrl', result.url)
    } catch {
      /* upload failed */
    } finally {
      setIconUploading(false)
    }
  }

  // Save all draft changes to server
  const saveServerChanges = () => {
    if (!serverFormDraft.name.trim()) return

    updateServer.mutate(
      {
        name: serverFormDraft.name.trim(),
        description: serverFormDraft.description.trim() || null,
        slug: serverFormDraft.slug.trim() || undefined,
        isPublic: serverFormDraft.isPublic,
        homepageHtml: serverFormDraft.homepageHtml.trim() || null,
        iconUrl: serverFormDraft.iconUrl,
        bannerUrl: serverFormDraft.bannerUrl,
      },
      {
        onSuccess: () => {
          setShowServerEdit(false)
        },
      },
    )
  }

  // Discard draft and close dialog
  const discardChanges = () => {
    setShowServerEdit(false)
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

  const copyInviteCode = async () => {
    if (server?.inviteCode) {
      const inviteLink = `${window.location.origin}/app/invite/${server.inviteCode}`
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    }
  }

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
  const isInShop = /\/servers\/[^/]+\/shop(?:\/|$)/.test(location.pathname)
  const isInWorkspace = /\/servers\/[^/]+\/workspace(?:\/|$)/.test(location.pathname)
  const isInApps = /\/servers\/[^/]+\/apps(?:\/|$)/.test(location.pathname)
  const isInChannel = /\/servers\/[^/]+\/channels\//.test(location.pathname)
  const isHomeActive = !isInChannel && !isInShop && !isInWorkspace && !isInApps

  const renderChannelGroup = (label: string, items: Channel[]) => {
    if (items.length === 0) return null
    const isCollapsed = !!collapsedGroups[label]
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between pr-2">
          <button
            onClick={() => toggleGroup(label)}
            className="flex items-center gap-1 px-4 py-1.5 text-[12px] font-bold tracking-wide uppercase text-text-secondary hover:text-text-primary flex-1 transition"
          >
            {isCollapsed ? (
              <ChevronRight size={12} className="shrink-0" />
            ) : (
              <ChevronDown size={12} className="shrink-0" />
            )}
            <span className="truncate">{label}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="text-text-secondary hover:text-text-primary transition p-0.5 rounded hover:bg-bg-modifier-hover"
            title={t('channel.createChannel')}
          >
            <Plus size={14} />
          </button>
        </div>
        {!isCollapsed &&
          items.map((ch) => {
            const Icon = channelIcons[ch.type]
            const isActive = activeChannelId === ch.id
            const isEditing = editingChannel?.id === ch.id
            return isEditing ? (
              <div
                key={ch.id}
                className="flex items-center gap-1.5 px-2 mx-2 py-1 bg-bg-modifier-hover rounded"
              >
                <Icon size={18} className="shrink-0 opacity-80" />
                <input
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
                  className="flex-1 bg-bg-tertiary text-text-primary rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (editChannelName.trim()) {
                      updateChannel.mutate({ channelId: ch.id, name: editChannelName.trim() })
                    }
                  }}
                  className="text-green-400 hover:text-green-300"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingChannel(null)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
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
                className={`group flex items-center gap-1.5 px-2 py-[6px] mx-2 mb-[2px] rounded-md text-[15px] font-medium w-[calc(100%-16px)] text-left transition ${
                  isActive
                    ? 'bg-bg-modifier-active text-text-primary'
                    : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                }`}
              >
                <Icon
                  size={18}
                  className={`shrink-0 ${isActive ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
                />
                <span className="truncate">{ch.name}</span>
                {ch.isPrivate && <Lock size={12} className="text-text-muted shrink-0" />}
                {ch.isMember === false && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary shrink-0">
                    加入
                  </span>
                )}
                {!isActive && (scopedUnread?.channelUnread?.[ch.id] ?? 0) > 0 && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-danger shrink-0" />
                )}
              </button>
            )
          })}
      </div>
    )
  }

  return (
    <div className="w-full md:w-60 bg-bg-secondary flex flex-col shrink-0 h-full">
      {/* Server name header */}
      <div className="h-12 px-4 flex items-center justify-between border-b-2 border-bg-tertiary bg-bg-secondary shadow-sm z-10 transition hover:bg-bg-modifier-hover cursor-pointer">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Mobile menu button to open server sidebar */}
          <button
            onClick={openMobileServerSidebar}
            className="md:hidden text-text-muted hover:text-text-primary transition shrink-0"
          >
            <Menu size={20} />
          </button>
          <h2 className="font-bold text-text-primary truncate">{server?.name ?? '...'}</h2>
          {serverUnreadCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-danger shrink-0" title="该服务器有未读通知" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {server?.id && <ChannelSortButton serverId={server.id} />}
          <button
            onClick={openServerEdit}
            className="text-text-muted hover:text-text-primary transition"
            title={t('channel.serverSettings')}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Channel list */}
      <div
        className="flex-1 overflow-y-auto pt-2"
        onContextMenu={(e) => {
          // Only trigger if clicking on the blank area (not on a channel item)
          if ((e.target as HTMLElement).closest('[data-channel-item]')) return
          e.preventDefault()
          setBlankContextMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {/* Server Home button */}
        <button
          type="button"
          onClick={() => {
            navigate({
              to: '/servers/$serverSlug',
              params: { serverSlug: server?.slug ?? serverSlug },
            })
            requestMarkScopeRead({ serverId: server?.id ?? serverSlug })
            setMobileView('chat')
          }}
          className={`group flex items-center gap-1.5 px-2 py-[6px] mx-2 mb-2 rounded-md text-[15px] font-medium w-[calc(100%-16px)] text-left transition ${
            isHomeActive
              ? 'bg-bg-modifier-active text-text-primary'
              : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
          }`}
        >
          <Home
            size={18}
            className={`shrink-0 ${isHomeActive ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
          />
          <span className="truncate">{t('server.home')}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            navigate({
              to: '/servers/$serverSlug/shop',
              params: { serverSlug: server?.slug ?? serverSlug },
            })
            requestMarkScopeRead({ serverId: server?.id ?? serverSlug })
            setMobileView('chat')
          }}
          className={`group flex items-center gap-1.5 px-2 py-[6px] mx-2 mb-2 rounded-md text-[15px] font-medium w-[calc(100%-16px)] text-left transition ${
            isInShop
              ? 'bg-bg-modifier-active text-text-primary'
              : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
          }`}
        >
          <ShoppingBag
            size={18}
            className={`shrink-0 ${isInShop ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'}`}
          />
          <span className="truncate">{t('serverHome.shop', '店铺')}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            navigate({
              to: '/servers/$serverSlug/workspace',
              params: { serverSlug: server?.slug ?? serverSlug },
            })
            requestMarkScopeRead({ serverId: server?.id ?? serverSlug })
            setMobileView('chat')
          }}
          className={`group flex items-center gap-1.5 px-2 py-[6px] mx-2 mb-2 rounded-md text-[15px] font-medium w-[calc(100%-16px)] text-left transition ${
            isInWorkspace
              ? 'bg-bg-modifier-active text-text-primary'
              : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
          }`}
        >
          <FolderClosed
            size={18}
            className={`shrink-0 ${
              isInWorkspace
                ? 'opacity-80 text-text-primary'
                : 'opacity-60 group-hover:text-text-primary'
            }`}
          />
          <span className="truncate">{t('serverHome.workspace', '工作区')}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            navigate({
              to: '/servers/$serverSlug/apps',
              params: { serverSlug: server?.slug ?? serverSlug },
            })
            requestMarkScopeRead({ serverId: server?.id ?? serverSlug })
            setMobileView('chat')
          }}
          className={`group flex items-center gap-1.5 px-2 py-[6px] mx-2 mb-2 rounded-md text-[15px] font-medium w-[calc(100%-16px)] text-left transition ${
            isInApps
              ? 'bg-bg-modifier-active text-text-primary'
              : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
          }`}
        >
          <AppWindow
            size={18}
            className={`shrink-0 ${
              isInApps ? 'opacity-80 text-text-primary' : 'opacity-60 group-hover:text-text-primary'
            }`}
          />
          <span className="truncate">应用</span>
        </button>
        <div className="h-px bg-divider mx-4 mb-2" />
        {renderChannelGroup(t('channel.announcement'), announcementChannels)}
        {renderChannelGroup(t('channel.text'), textChannels)}
        {renderChannelGroup(t('channel.voice'), voiceChannels)}

        {channels.length === 0 && (
          <p className="text-text-muted text-sm px-4 py-2">{t('channel.noChannels')}</p>
        )}
      </div>

      {/* Add channel button */}
      <div className="p-2 border-t border-border-subtle">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 w-full rounded-md text-sm text-text-muted hover:bg-bg-primary/30 hover:text-text-secondary transition"
        >
          <Plus size={16} />
          {t('channel.createChannel')}
        </button>
      </div>

      {/* Create channel dialog */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false)
          }}
        >
          <div className="bg-bg-secondary rounded-xl p-6 w-96">
            <h2 className="text-xl font-bold text-text-primary mb-4">
              {t('channel.createChannel')}
            </h2>
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
                  createChannel.mutate({
                    name: newName.trim(),
                    type: newType,
                    isPrivate: newIsPrivate,
                  })
                }
              }}
              placeholder={t('channel.channelName')}
              className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary mb-3"
            />
            <div className="flex gap-2 mb-4">
              {(['text', 'voice', 'announcement'] as const).map((chType) => (
                <button
                  key={chType}
                  onClick={() => setNewType(chType)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition ${
                    newType === chType
                      ? 'bg-primary text-white'
                      : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {chType === 'text'
                    ? t('channel.typeText')
                    : chType === 'voice'
                      ? t('channel.typeVoice')
                      : t('channel.typeAnnouncement')}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between mb-4 bg-bg-tertiary rounded-lg px-3 py-2">
              <span className="text-sm text-text-primary">私有频道（仅受邀加入）</span>
              <button
                type="button"
                onClick={() => setNewIsPrivate(!newIsPrivate)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  newIsPrivate ? 'bg-primary' : 'bg-bg-primary'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    newIsPrivate ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </label>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (!newName.trim()) return
                  createChannel.mutate({
                    name: newName.trim(),
                    type: newType,
                    isPrivate: newIsPrivate,
                  })
                }}
                disabled={!newName.trim() || createChannel.isPending}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition disabled:opacity-50"
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server edit dialog */}
      {showServerEdit && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowServerEdit(false)
          }}
        >
          <div className="bg-bg-secondary rounded-xl p-6 w-[520px] max-h-[90vh] overflow-y-auto border border-border-subtle">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-text-primary">{t('channel.serverSettings')}</h2>
              <button
                onClick={discardChanges}
                disabled={updateServer.isPending}
                className="text-text-muted hover:text-text-primary transition disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 mb-6 bg-bg-tertiary rounded-lg p-1">
              <button
                onClick={() => setServerEditTab('basic')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                  serverEditTab === 'basic'
                    ? 'bg-bg-secondary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <ImageIcon size={16} />
                基础设置
              </button>
              <button
                onClick={() => setServerEditTab('advanced')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                  serverEditTab === 'advanced'
                    ? 'bg-bg-secondary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Settings size={16} />
                进阶设置
              </button>
            </div>

            {/* Basic Settings Tab */}
            {serverEditTab === 'basic' && (
              <div className="space-y-5">
                {/* Hero Section - Banner + Icon */}
                <div className="relative">
                  {/* Banner upload - show draft state */}
                  <div className="relative h-32 bg-gradient-to-br from-primary/30 to-primary/5 rounded-xl overflow-hidden group/banner">
                    {serverFormDraft.bannerUrl && (
                      <img
                        src={serverFormDraft.bannerUrl}
                        alt=""
                        className="w-full h-full object-cover absolute inset-0"
                      />
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/banner:opacity-100 transition cursor-pointer">
                      <span className="text-white text-sm font-medium flex items-center gap-2">
                        {bannerUploading ? (
                          <span className="animate-pulse">{t('common.loading')}</span>
                        ) : (
                          <>
                            <ImageIcon size={16} />
                            {serverFormDraft.bannerUrl ? '更换横幅' : '添加横幅'}
                          </>
                        )}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBannerUpload}
                        className="hidden"
                        disabled={bannerUploading}
                      />
                    </label>
                  </div>

                  {/* Server icon upload - positioned to overlap with banner - show draft state */}
                  <div className="absolute -bottom-6 left-6">
                    <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-bg-tertiary border-4 border-bg-secondary shadow-lg group/icon">
                      {serverFormDraft.iconUrl ? (
                        <img
                          src={serverFormDraft.iconUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-text-muted">
                          {serverFormDraft.name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/icon:opacity-100 transition cursor-pointer">
                        <span className="text-white text-xs font-medium">
                          {iconUploading ? '...' : <ImageIcon size={14} />}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleIconUpload}
                          className="hidden"
                          disabled={iconUploading}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Server name - with extra top margin for icon overlap */}
                <div className="mt-8">
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                    {t('channel.editServerName')}
                  </label>
                  <input
                    type="text"
                    value={serverFormDraft.name}
                    onChange={(e) => updateDraftField('name', e.target.value)}
                    placeholder="输入服务器名称"
                    className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Server description */}
                <div>
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                    {t('channel.editServerDescription')}
                  </label>
                  <textarea
                    value={serverFormDraft.description}
                    onChange={(e) => updateDraftField('description', e.target.value)}
                    rows={3}
                    placeholder={t('channel.descriptionPlaceholder')}
                    className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                {/* Public toggle */}
                <div className="bg-bg-tertiary rounded-lg p-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-semibold text-text-primary">
                        {t('channel.publicServer')}
                      </span>
                      <p className="text-xs text-text-muted mt-0.5">
                        {t('channel.publicServerDesc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateDraftField('isPublic', !serverFormDraft.isPublic)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        serverFormDraft.isPublic ? 'bg-primary' : 'bg-bg-primary'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          serverFormDraft.isPublic ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            )}

            {/* Advanced Settings Tab */}
            {serverEditTab === 'advanced' && (
              <div className="space-y-5">
                {/* Server slug */}
                <div>
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                    {t('channel.serverSlug')}
                  </label>
                  <input
                    type="text"
                    value={serverFormDraft.slug}
                    onChange={(e) => updateDraftField('slug', e.target.value)}
                    placeholder={t('channel.slugPlaceholder')}
                    className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                  />
                  <p className="text-xs text-text-muted mt-1">{t('channel.slugDesc')}</p>
                </div>

                {/* Homepage HTML */}
                <div>
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                    {t('channel.homepageHtml')}
                  </label>
                  <textarea
                    value={serverFormDraft.homepageHtml}
                    onChange={(e) => updateDraftField('homepageHtml', e.target.value)}
                    rows={8}
                    placeholder={t('channel.homepageHtmlPlaceholder')}
                    className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary resize-y font-mono text-xs"
                  />
                  <p className="text-xs text-text-muted mt-1">{t('channel.homepageHtmlDesc')}</p>
                </div>

                {/* Invite Link */}
                {server?.inviteCode && (
                  <div className="bg-bg-tertiary rounded-lg p-4">
                    <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                      {t('channel.inviteLink')}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-bg-primary text-text-primary rounded-lg px-4 py-3 font-mono text-xs truncate">
                        {`${window.location.origin}/app/invite/${server.inviteCode}`}
                      </code>
                      <button
                        onClick={copyInviteCode}
                        className="px-3 py-3 bg-bg-primary rounded-lg text-text-muted hover:text-text-primary transition"
                        title={t('channel.copyInviteCode')}
                      >
                        {copiedInvite ? (
                          <Check size={16} className="text-green-400" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Server ID */}
                <div className="bg-bg-tertiary rounded-lg p-4">
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                    服务器 ID
                  </label>
                  <code className="text-text-muted text-xs font-mono">{server?.id}</code>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-border-subtle">
              <div>
                {_currentUser?.id === server?.ownerId && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await useConfirmStore.getState().confirm({
                        title: t('channel.deleteServer'),
                        message: t('channel.deleteServerConfirm'),
                      })
                      if (ok) {
                        deleteServer.mutate()
                      }
                    }}
                    disabled={deleteServer.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 transition rounded-lg disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {t('channel.deleteServer')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Unsaved changes indicator */}
                {hasDraftChanges() && !updateServer.isPending && (
                  <span className="text-xs text-amber-400">有未保存的更改</span>
                )}
                {updateServer.isPending && (
                  <span className="text-xs text-text-muted animate-pulse">保存中...</span>
                )}
                <button
                  onClick={discardChanges}
                  disabled={updateServer.isPending}
                  className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={saveServerChanges}
                  disabled={
                    !serverFormDraft.name.trim() || updateServer.isPending || !hasDraftChanges()
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition disabled:opacity-50 font-bold"
                >
                  <Save size={14} />
                  {updateServer.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    setShowInvitePanel(true)
                  },
                },
                {
                  label: t('channel.addAgent'),
                  onClick: () => setShowAddAgent(true),
                },
              ],
            },
            {
              items: [
                {
                  icon: Volume2,
                  label: (notificationPreference?.mutedChannelIds ?? []).includes(contextMenu.channel.id)
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
                    setShowInvitePanel(true)
                  },
                },
                {
                  label: t('channel.addAgent'),
                  onClick: () => setShowAddAgent(true),
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
          serverInviteCode={server.inviteCode}
          inviteTargetChannel={inviteTargetChannel}
          copiedInvite={copiedInvite}
          onCopyInvite={copyInviteCode}
          onClose={() => {
            setShowInvitePanel(false)
            setInviteTargetChannel(null)
          }}
        />
      )}

      {/* Add Agent dialog */}
      {showAddAgent && (
        <AddAgentDialog
          serverId={serverSlug}
          onClose={() => setShowAddAgent(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['members'] })
            setShowAddAgent(false)
          }}
          t={t}
        />
      )}
    </div>
  )
}

interface BuddyAgent {
  id: string
  ownerId: string
  status: string
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

function InvitePanel({
  serverId,
  serverInviteCode,
  inviteTargetChannel,
  copiedInvite,
  onCopyInvite,
  onClose,
}: {
  serverId: string
  serverInviteCode: string
  inviteTargetChannel: Channel | null
  copiedInvite: boolean
  onCopyInvite: () => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'members' | 'buddies'>('members')

  const { data: serverMembers = [] } = useQuery({
    queryKey: ['server-members', serverId],
    queryFn: () => fetchApi<ServerMember[]>(`/api/servers/${serverId}/members`),
    enabled: !!serverId,
  })

  const { data: myBuddies = [] } = useQuery({
    queryKey: ['my-buddies-for-invite'],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents'),
  })

  const { data: channelMembers = [] } = useQuery({
    queryKey: ['channel-members', inviteTargetChannel?.id],
    queryFn: () =>
      fetchApi<
        Array<{
          user: { id: string }
        }>
      >(`/api/channels/${inviteTargetChannel?.id}/members`),
    enabled: !!inviteTargetChannel?.id,
  })

  const inviteToChannel = useMutation({
    mutationFn: (userId: string) =>
      fetchApi(`/api/channels/${inviteTargetChannel?.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', inviteTargetChannel?.id] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })

  // Add buddy to server mutation
  const addBuddyToServer = useMutation({
    mutationFn: (agentId: string) =>
      fetchApi(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds: [agentId] }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })

  const joinedUserIds = new Set(channelMembers.map((m) => m.user.id))
  const serverMemberUserIds = new Set(serverMembers.map((m) => m.userId))
  const candidates = serverMembers.filter((m) => !!m.user && !m.user.isBot)

  // Filter buddies: not already in server and have botUser
  const availableBuddies = myBuddies.filter(
    (b) => b.botUser && !serverMemberUserIds.has(b.botUser.id),
  )

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-bg-secondary rounded-xl p-6 w-[520px] border border-border-subtle max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">邀请成员</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition">
            <X size={18} />
          </button>
        </div>

        <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
          邀请链接
        </label>
        <div className="flex items-center gap-2 mb-4">
          <code className="flex-1 bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 font-mono text-xs truncate">
            {`${window.location.origin}/app/invite/${serverInviteCode}`}
          </code>
          <button
            onClick={onCopyInvite}
            className="px-3 py-3 bg-bg-tertiary rounded-lg text-text-muted hover:text-text-primary transition"
            title="复制"
          >
            {copiedInvite ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mb-3 bg-bg-tertiary rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'members'
                ? 'bg-bg-secondary text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            服务器成员 ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('buddies')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'buddies'
                ? 'bg-bg-secondary text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            我的 Buddy ({availableBuddies.length})
          </button>
        </div>

        <div className="text-xs text-text-muted mb-2">
          {activeTab === 'members'
            ? inviteTargetChannel
              ? `邀请同服务器成员加入频道 #${inviteTargetChannel.name}（对方会在通知中心收到）`
              : '选择左侧频道后，可一键邀请同服务器成员加入该频道。'
            : '添加 Buddy 到服务器，添加后会自动加入当前频道。'}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {activeTab === 'members' ? (
            candidates.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">
                暂无其他服务器成员可邀请
              </div>
            ) : (
              candidates.map((m) => {
                const u = m.user!
                const inChannel = inviteTargetChannel ? joinedUserIds.has(u.id) : false
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-tertiary/40 border border-border-subtle"
                  >
                    <div className="w-8 h-8 rounded-full bg-bg-tertiary overflow-hidden flex items-center justify-center text-xs text-text-primary font-bold">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (u.displayName || u.username).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">
                        {u.displayName || u.username}
                      </p>
                      <p className="text-xs text-text-muted truncate">@{u.username}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!inviteTargetChannel || inChannel || inviteToChannel.isPending}
                      onClick={() => inviteToChannel.mutate(u.id)}
                      className="px-3 py-1.5 text-xs rounded-md bg-primary hover:bg-primary-hover text-white font-bold disabled:opacity-40"
                    >
                      {inChannel ? '已在频道中' : '邀请'}
                    </button>
                  </div>
                )
              })
            )
          ) : availableBuddies.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              暂无可用 Buddy，
              <a href="/app/buddy" className="text-primary hover:underline">
                去创建
              </a>
            </div>
          ) : (
            availableBuddies.map((buddy) => {
              const u = buddy.botUser!
              return (
                <div
                  key={buddy.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-tertiary/40 border border-border-subtle"
                >
                  <div className="w-8 h-8 rounded-full bg-bg-tertiary overflow-hidden flex items-center justify-center text-xs text-text-primary font-bold">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (u.displayName || u.username).charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-text-primary truncate">
                        {u.displayName || u.username}
                      </p>
                      <img src="/Logo.svg" alt="Buddy" className="w-3.5 h-3.5 opacity-60" />
                    </div>
                    <p className="text-xs text-text-muted truncate">@{u.username}</p>
                  </div>
                  <button
                    type="button"
                    disabled={addBuddyToServer.isPending}
                    onClick={() => addBuddyToServer.mutate(buddy.id)}
                    className="px-3 py-1.5 text-xs rounded-md bg-primary hover:bg-primary-hover text-white font-bold disabled:opacity-40"
                  >
                    {addBuddyToServer.isPending ? '添加中...' : '添加到服务器'}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Add Agent Dialog ──────────────────────────────────── */

interface AgentOption {
  id: string
  userId: string
  status: string
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

function AddAgentDialog({
  serverId,
  onClose,
  onSuccess,
  t,
}: {
  serverId: string
  onClose: () => void
  onSuccess: () => void
  t: (key: string) => string
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<AgentOption[]>('/api/agents'),
  })

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdd = async () => {
    if (selectedIds.size === 0) return
    setAdding(true)
    try {
      await fetchApi(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds: Array.from(selectedIds) }),
      })
      onSuccess()
    } catch {
      /* error handled silently */
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-bg-secondary rounded-xl p-6 w-96 max-h-[60vh] flex flex-col border border-border-subtle">
        <h2 className="text-lg font-bold text-text-primary mb-4">{t('channel.addAgent')}</h2>

        {agents.length === 0 ? (
          <p className="text-text-muted text-sm py-4">{t('channel.noAgentsAvailable')}</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 mb-4">
            {agents.map((agent) => {
              const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'
              const isSelected = selectedIds.has(agent.id)
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition ${
                    isSelected
                      ? 'bg-primary/20 text-text-primary'
                      : 'text-text-secondary hover:bg-bg-primary/30'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      isSelected ? 'border-primary bg-primary' : 'border-border-dim'
                    }`}
                  >
                    {isSelected && <Check size={10} className="text-white" />}
                  </div>
                  <span className="truncate">{name}</span>
                  <span
                    className={`ml-auto w-2 h-2 rounded-full ${
                      agent.status === 'running'
                        ? 'bg-green-400'
                        : agent.status === 'error'
                          ? 'bg-red-400'
                          : 'bg-zinc-500'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-border-subtle">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || adding}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-bold transition disabled:opacity-50"
          >
            <img src="/Logo.svg" alt="Buddy" className="w-4 h-4" />
            {adding ? t('common.loading') : t('channel.addAgentConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
