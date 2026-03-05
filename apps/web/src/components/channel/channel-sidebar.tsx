import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Hash,
  Megaphone,
  Menu,
  Plus,
  Save,
  Settings,
  Trash2,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { joinChannel, leaveChannel } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'

interface Channel {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  topic: string | null
  position: number
}

interface Server {
  id: string
  name: string
  description: string | null
  slug: string | null
  iconUrl: string | null
  bannerUrl: string | null
  isPublic: boolean
  inviteCode: string
  ownerId: string
}

const channelIcons = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
}

export function ChannelSidebar({ serverId }: { serverId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeChannelId, setActiveChannel } = useChatStore()
  const _currentUser = useAuthStore((s) => s.user)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [showServerEdit, setShowServerEdit] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'text' | 'voice' | 'announcement'>('text')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    channel: Channel
  } | null>(null)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [editChannelName, setEditChannelName] = useState('')
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverId}`),
  })

  // Auto-redirect to slug URL if server has a slug and URL uses UUID
  useEffect(() => {
    if (server?.slug && serverId !== server.slug) {
      navigate({ to: '/app/servers/$serverId', params: { serverId: server.slug }, replace: true })
    }
  }, [server?.slug, serverId, navigate])

  const { data: channels = [] } = useQuery({
    queryKey: ['channels', serverId],
    queryFn: () => fetchApi<Channel[]>(`/api/servers/${serverId}/channels`),
  })

  const createChannel = useMutation({
    mutationFn: (data: { name: string; type: string }) =>
      fetchApi(`/api/servers/${serverId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] })
      setShowCreate(false)
      setNewName('')
    },
  })

  const updateServer = useMutation({
    mutationFn: (data: {
      name: string
      description?: string | null
      slug?: string | null
      bannerUrl?: string | null
      isPublic?: boolean
    }) =>
      fetchApi<Server>(`/api/servers/${serverId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (updatedServer) => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['discover-servers'] })
      setShowServerEdit(false)
      // Redirect to slug-based URL if slug was set/changed
      if (updatedServer.slug && updatedServer.slug !== serverId) {
        navigate({ to: '/app/servers/$serverId', params: { serverId: updatedServer.slug } })
      }
    },
  })

  const openServerEdit = () => {
    setEditName(server?.name ?? '')
    setEditDescription(server?.description ?? '')
    setEditSlug(server?.slug ?? '')
    setEditIsPublic(server?.isPublic ?? false)
    setShowServerEdit(true)
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
      // Update server banner immediately
      await fetchApi(`/api/servers/${serverId}`, {
        method: 'PATCH',
        body: JSON.stringify({ bannerUrl: result.url }),
      })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
      queryClient.invalidateQueries({ queryKey: ['discover-servers'] })
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
      await fetchApi(`/api/servers/${serverId}`, {
        method: 'PATCH',
        body: JSON.stringify({ iconUrl: result.url }),
      })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['discover-servers'] })
    } catch {
      /* upload failed */
    } finally {
      setIconUploading(false)
    }
  }

  const deleteChannel = useMutation({
    mutationFn: (channelId: string) =>
      fetchApi(`/api/channels/${channelId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] })
    },
  })

  const updateChannel = useMutation({
    mutationFn: (data: { channelId: string; name: string }) =>
      fetchApi(`/api/channels/${data.channelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: data.name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] })
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
      const inviteLink = `${window.location.origin}/invite/${server.inviteCode}`
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    }
  }

  const { setMobileView, openMobileServerSidebar } = useUIStore()

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      if (activeChannelId) {
        leaveChannel(activeChannelId)
      }
      setActiveChannel(channelId)
      joinChannel(channelId)
      setMobileView('chat')
    },
    [activeChannelId, setActiveChannel, setMobileView],
  )

  // Auto-select first channel (in useEffect, not render body)
  useEffect(() => {
    if (channels.length > 0 && !activeChannelId) {
      const first = channels[0]!
      setActiveChannel(first.id)
      joinChannel(first.id)
    }
  }, [channels, activeChannelId, setActiveChannel])

  // Cleanup: leave channel on unmount
  useEffect(() => {
    return () => {
      const currentChannel = useChatStore.getState().activeChannelId
      if (currentChannel) {
        leaveChannel(currentChannel)
      }
    }
  }, [])

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
      <div className="mb-4">
        <button
          onClick={() => toggleGroup(label)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-semibold uppercase text-text-muted hover:text-text-secondary w-full"
        >
          {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          {label}
        </button>
        {!isCollapsed &&
          items.map((ch) => {
            const Icon = channelIcons[ch.type]
            const isActive = activeChannelId === ch.id
            const isEditing = editingChannel?.id === ch.id
            return isEditing ? (
              <div key={ch.id} className="flex items-center gap-1 px-2 mx-2 py-1">
                <Icon size={18} className="shrink-0 opacity-60" />
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
                onClick={() => handleSelectChannel(ch.id)}
                onContextMenu={(e) => handleContextMenu(e, ch)}
                className={`flex items-center gap-2 px-2 py-1.5 mx-2 rounded-md text-sm w-[calc(100%-16px)] text-left transition ${
                  isActive
                    ? 'bg-bg-primary/50 text-text-primary'
                    : 'text-text-muted hover:bg-bg-primary/30 hover:text-text-secondary'
                }`}
              >
                <Icon size={18} className="shrink-0 opacity-60" />
                <span className="truncate">{ch.name}</span>
              </button>
            )
          })}
      </div>
    )
  }

  return (
    <div className="w-full md:w-60 bg-bg-secondary flex flex-col shrink-0 h-full">
      {/* Server name header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile menu button to open server sidebar */}
          <button
            onClick={openMobileServerSidebar}
            className="md:hidden text-text-muted hover:text-text-primary transition shrink-0"
          >
            <Menu size={20} />
          </button>
          <h2 className="font-bold text-text-primary truncate">{server?.name ?? '...'}</h2>
        </div>
        <button
          onClick={openServerEdit}
          className="text-text-muted hover:text-text-primary transition"
          title={t('channel.serverSettings')}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto pt-4">
        {renderChannelGroup(t('channel.announcement'), announcementChannels)}
        {renderChannelGroup(t('channel.text'), textChannels)}
        {renderChannelGroup(t('channel.voice'), voiceChannels)}

        {channels.length === 0 && (
          <p className="text-text-muted text-sm px-4 py-2">{t('channel.noChannels')}</p>
        )}
      </div>

      {/* Add channel button */}
      <div className="p-2 border-t border-white/5">
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
          onClick={() => setShowCreate(false)}
        >
          <div className="bg-bg-secondary rounded-xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-text-primary mb-4">
              {t('channel.createChannel')}
            </h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
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
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() =>
                  newName.trim() && createChannel.mutate({ name: newName.trim(), type: newType })
                }
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
          onClick={() => setShowServerEdit(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-[460px] max-h-[85vh] overflow-y-auto border border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-text-primary">{t('channel.serverSettings')}</h2>
              <button
                onClick={() => setShowServerEdit(false)}
                className="text-text-muted hover:text-text-primary transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Server icon upload */}
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                {t('channel.serverIcon')}
              </label>
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-bg-tertiary group/icon flex-shrink-0">
                  {server?.iconUrl ? (
                    <img src={server.iconUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-text-muted">
                      {server?.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/icon:opacity-100 transition cursor-pointer">
                    <span className="text-white text-xs font-medium">
                      {iconUploading ? '...' : t('channel.uploadIcon')}
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
                <p className="text-xs text-text-muted">{t('channel.iconDesc')}</p>
              </div>
            </div>

            {/* Banner upload */}
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                {t('channel.serverBanner')}
              </label>
              <div className="relative h-28 bg-gradient-to-br from-primary/30 to-primary/5 rounded-lg overflow-hidden group/banner">
                {server?.bannerUrl && (
                  <img
                    src={server.bannerUrl}
                    alt=""
                    className="w-full h-full object-cover absolute inset-0"
                  />
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/banner:opacity-100 transition cursor-pointer">
                  <span className="text-white text-sm font-medium">
                    {bannerUploading ? t('common.loading') : t('channel.uploadBanner')}
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
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                {t('channel.editServerName')}
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                {t('channel.serverSlug')}
              </label>
              <input
                type="text"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                placeholder={t('channel.slugPlaceholder')}
                className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
              />
              <p className="text-xs text-text-muted mt-1">{t('channel.slugDesc')}</p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                {t('channel.editServerDescription')}
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                placeholder={t('channel.descriptionPlaceholder')}
                className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <div className="mb-4">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold uppercase text-text-secondary">
                  {t('channel.publicServer')}
                </span>
                <button
                  type="button"
                  onClick={() => setEditIsPublic(!editIsPublic)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    editIsPublic ? 'bg-primary' : 'bg-bg-tertiary'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      editIsPublic ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </label>
              <p className="text-xs text-text-muted mt-1">{t('channel.publicServerDesc')}</p>
            </div>

            {server?.inviteCode && (
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
                  {t('channel.inviteLink')}
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 font-mono text-xs truncate">
                    {`${window.location.origin}/invite/${server.inviteCode}`}
                  </code>
                  <button
                    onClick={copyInviteCode}
                    className="px-3 py-3 bg-bg-tertiary rounded-lg text-text-muted hover:text-text-primary transition"
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

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowServerEdit(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() =>
                  editName.trim() &&
                  updateServer.mutate({
                    name: editName.trim(),
                    description: editDescription.trim() || null,
                    slug: editSlug.trim() || null,
                    isPublic: editIsPublic,
                  })
                }
                disabled={!editName.trim() || updateServer.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition disabled:opacity-50 font-bold"
              >
                <Save size={14} />
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channel context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-bg-tertiary border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            onClick={() => {
              setEditingChannel(contextMenu.channel)
              setEditChannelName(contextMenu.channel.name)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
          >
            <Edit3 size={14} />
            {t('channel.editChannel')}
          </button>
          <button
            type="button"
            onClick={() => {
              const channelLink = `${window.location.origin}/app/servers/${serverId}?channel=${contextMenu.channel.id}`
              navigator.clipboard.writeText(channelLink)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
          >
            <Copy size={14} />
            {t('channel.copyChannelLink')}
          </button>
          <div className="h-px bg-white/5 my-1" />
          <button
            type="button"
            onClick={() => {
              if (confirm(t('channel.deleteChannelConfirm'))) {
                deleteChannel.mutate(contextMenu.channel.id)
              }
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 size={14} />
            {t('channel.deleteChannel')}
          </button>
        </div>
      )}
    </div>
  )
}
