import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Hash,
  Megaphone,
  Plus,
  Save,
  Settings,
  Volume2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { joinChannel, leaveChannel } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'

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
  iconUrl: string | null
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
  const queryClient = useQueryClient()
  const { activeChannelId, setActiveChannel } = useChatStore()
  const _currentUser = useAuthStore((s) => s.user)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [showServerEdit, setShowServerEdit] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<'text' | 'voice' | 'announcement'>('text')
  const [editName, setEditName] = useState('')
  const [copiedInvite, setCopiedInvite] = useState(false)

  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverId}`),
  })

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
    mutationFn: (data: { name: string }) =>
      fetchApi(`/api/servers/${serverId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowServerEdit(false)
    },
  })

  const openServerEdit = () => {
    setEditName(server?.name ?? '')
    setShowServerEdit(true)
  }

  const copyInviteCode = async () => {
    if (server?.inviteCode) {
      const inviteLink = `${window.location.origin}/invite/${server.inviteCode}`
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    }
  }

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      if (activeChannelId) {
        leaveChannel(activeChannelId)
      }
      setActiveChannel(channelId)
      joinChannel(channelId)
    },
    [activeChannelId, setActiveChannel],
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
            return (
              <button
                key={ch.id}
                onClick={() => handleSelectChannel(ch.id)}
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
    <div className="w-60 bg-bg-secondary flex flex-col shrink-0">
      {/* Server name header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 shadow-sm">
        <h2 className="font-bold text-text-primary truncate">{server?.name ?? '...'}</h2>
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
            className="bg-bg-secondary rounded-xl p-6 w-[420px] border border-white/5"
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
                onClick={() => editName.trim() && updateServer.mutate({ name: editName.trim() })}
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
    </div>
  )
}
