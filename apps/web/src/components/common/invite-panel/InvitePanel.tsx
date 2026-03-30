import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, PawPrint, Search, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'

// Types
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

interface BuddyAgent {
  id: string
  userId: string
  ownerId: string
  status: string
  owner?: {
    id: string
    username: string
    displayName: string | null
  } | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  config?: {
    description?: string
  }
}

interface Member {
  id: string
  userId: string
  user?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot: boolean
  } | null
}

// Props
export interface InvitePanelProps {
  serverId: string
  channelId?: string | null
  channelName?: string
  initialTab?: 'members' | 'buddies'
  onClose: () => void
}

// User Avatar Component
function UserAvatar({
  avatarUrl,
  name,
  size = 'md',
}: {
  avatarUrl: string | null
  name: string
  size?: 'sm' | 'md'
}) {
  const sizeClasses = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div
      className={`${sizeClasses} rounded-full bg-bg-tertiary overflow-hidden flex items-center justify-center text-text-primary font-bold shrink-0`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  )
}

// Main Component
export function InvitePanel({
  serverId,
  channelId,
  channelName,
  initialTab = 'members',
  onClose,
}: InvitePanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // State
  const [activeTab, setActiveTab] = useState<'members' | 'buddies'>(initialTab)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedBuddyIds, setSelectedBuddyIds] = useState<Set<string>>(new Set())
  const [addingBuddies, setAddingBuddies] = useState(false)
  const [addingSingleId, setAddingSingleId] = useState<string | null>(null)

  // Queries
  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () =>
      fetchApi<{ id: string; inviteCode: string; slug: string }>(`/api/servers/${serverId}`),
    enabled: !!serverId,
  })

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
    queryKey: ['channel-members', channelId],
    queryFn: () =>
      fetchApi<Array<{ user: { id: string } }>>(`/api/channels/${channelId}/members`),
    enabled: !!channelId,
  })

  // Mutations
  const inviteToChannel = useMutation({
    mutationFn: (userId: string) =>
      fetchApi(`/api/channels/${channelId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })

  // Derived data
  const joinedUserIds = new Set(channelMembers.map((m) => m.user.id))
  const serverMemberUserIds = new Set(serverMembers.map((m) => m.userId))
  const serverBotMembers = serverMembers.filter((m) => m.user?.isBot)
  const channelBotUserIds = new Set(
    channelMembers.filter((m) => m.user?.isBot).map((m) => m.user.id),
  )
  const candidates = serverMembers.filter((m) => !!m.user && !m.user.isBot)

  // My buddies (owned + rented) not on server
  const myBuddiesNotOnServer = myBuddies.filter(
    (b) => b.botUser && !serverMemberUserIds.has(b.botUser.id),
  )

  // Server bots not in current channel
  const serverBotsNotInChannel = channelId
    ? serverBotMembers.filter((m) => m.user && !channelBotUserIds.has(m.userId))
    : []

  // Filter by search
  const filteredMyBuddies = myBuddiesNotOnServer.filter((b) => {
    if (!search.trim()) return true
    const name = (b.botUser?.displayName ?? b.botUser?.username ?? '').toLowerCase()
    const desc =
      typeof b.config?.description === 'string' ? b.config.description.toLowerCase() : ''
    const q = search.trim().toLowerCase()
    return name.includes(q) || desc.includes(q)
  })

  const filteredServerBots = serverBotsNotInChannel.filter((m) => {
    if (!m.user) return false
    if (!search.trim()) return true
    const name = (m.user.displayName ?? m.user.username).toLowerCase()
    return name.includes(search.trim().toLowerCase())
  })

  // Handlers
  const copyInviteCode = async () => {
    if (server?.inviteCode) {
      const inviteLink = `${window.location.origin}/app/invite/${server.inviteCode}`
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    }
  }

  const toggleBuddy = (id: string) => {
    setSelectedBuddyIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAddBuddiesToServer = async () => {
    if (selectedBuddyIds.size === 0) return
    setAddingBuddies(true)
    try {
      // Add to server
      await fetchApi(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds: Array.from(selectedBuddyIds) }),
      })
      // Add to channel if active
      if (channelId) {
        const buddyBotUserIds = myBuddies
          .filter((b) => selectedBuddyIds.has(b.id) && b.botUser)
          .map((b) => b.botUser!.id)
        for (const userId of buddyBotUserIds) {
          await fetchApi(`/api/channels/${channelId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId }),
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      if (channelId) {
        queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
      }
      setSelectedBuddyIds(new Set())
      onClose()
    } catch {
      /* error handled silently */
    } finally {
      setAddingBuddies(false)
    }
  }

  const handleAddSingleBuddy = async (agentId: string) => {
    setAddingSingleId(agentId)
    try {
      await fetchApi(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds: [agentId] }),
      })
      if (channelId) {
        const agent = myBuddies.find((a) => a.id === agentId)
        if (agent?.botUser?.id) {
          await fetchApi(`/api/channels/${channelId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: agent.botUser.id }),
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      if (channelId) {
        queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
      }
      onClose()
    } catch {
      /* error handled silently */
    } finally {
      setAddingSingleId(null)
    }
  }

  const handleAddServerBotToChannel = async (botUserId: string) => {
    if (!channelId) return
    setAddingSingleId(botUserId)
    try {
      await fetchApi(`/api/channels/${channelId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: botUserId }),
      })
      queryClient.invalidateQueries({ queryKey: ['members', serverId, channelId] })
      queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
      onClose()
    } catch {
      /* error handled silently */
    } finally {
      setAddingSingleId(null)
    }
  }

  const handleGoToBuddySettings = () => {
    navigate({ to: '/settings', search: { tab: 'buddy' } })
    onClose()
  }

  const buddyCount = filteredMyBuddies.length + filteredServerBots.length

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-bg-secondary rounded-xl p-6 w-[520px] border border-border-subtle max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">
            {activeTab === 'members' ? t('channel.inviteMember') : t('channel.addAgent')}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition">
            <X size={18} />
          </button>
        </div>

        {/* Invite Link */}
        <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
          {t('channel.inviteLink')}
        </label>
        <div className="flex items-center gap-2 mb-4">
          <code className="flex-1 bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 font-mono text-xs truncate">
            {server?.inviteCode
              ? `${window.location.origin}/app/invite/${server.inviteCode}`
              : '...'}
          </code>
          <button
            onClick={copyInviteCode}
            disabled={!server?.inviteCode}
            className="px-3 py-3 bg-bg-tertiary rounded-lg text-text-muted hover:text-text-primary transition disabled:opacity-50"
            title={t('common.copy')}
          >
            {copiedInvite ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 mb-3 bg-bg-tertiary rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'members'
                ? 'bg-bg-secondary text-[#5865F2] shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <UserPlus size={14} />
            {t('member.members')} ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('buddies')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'buddies'
                ? 'bg-bg-secondary text-[#FF6B9D] shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <PawPrint size={14} />
            Buddy ({buddyCount})
          </button>
        </div>

        {/* Description */}
        <div className="text-xs text-text-muted mb-2">
          {activeTab === 'members'
            ? channelId
              ? t('member.inviteToChannelDesc', { channel: channelName ?? '' })
              : t('member.inviteSelectChannelDesc')
            : channelId
              ? t('member.addBuddyToChannelDesc', { channel: channelName ?? '' })
              : t('member.addBuddyToServerDesc')}
        </div>

        {/* Search (only for buddies tab) */}
        {activeTab === 'buddies' && (
          <div className="mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('channel.searchBuddy')}
                className="w-full bg-bg-tertiary text-text-primary rounded-lg pl-9 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary placeholder:text-text-muted"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {activeTab === 'members' ? (
            // Members Tab
            candidates.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">
                {t('member.noInvitable')}
              </div>
            ) : (
              candidates.map((m) => {
                const u = m.user!
                const inChannel = channelId ? joinedUserIds.has(u.id) : false
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-tertiary/40 border border-border-subtle"
                  >
                    <UserAvatar avatarUrl={u.avatarUrl} name={u.displayName || u.username} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">
                        {u.displayName || u.username}
                      </p>
                      <p className="text-xs text-text-muted truncate">@{u.username}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!channelId || inChannel || inviteToChannel.isPending}
                      onClick={() => inviteToChannel.mutate(u.id)}
                      className="px-3 py-1.5 text-xs rounded-md bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold disabled:opacity-40 transition"
                    >
                      {inChannel ? t('member.inChannel') : t('members.invite')}
                    </button>
                  </div>
                )
              })
            )
          ) : (
            // Buddies Tab
            <>
              {/* Server bots not in channel */}
              {filteredServerBots.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-bold uppercase text-text-muted mb-1 px-1">
                    {t('member.buddiesOnServer')}
                  </p>
                  {filteredServerBots.map((m) => {
                    const u = m.user!
                    const name = u.displayName || u.username
                    const agent = myBuddies.find((a) => a.botUser?.id === u.id)
                    const description = agent?.config?.description
                    const isAdding = addingSingleId === u.id

                    return (
                      <div
                        key={u.id}
                        className="flex items-start gap-3 px-3 py-2 rounded-lg bg-bg-tertiary/40 border border-border-subtle mb-1"
                      >
                        <UserAvatar avatarUrl={u.avatarUrl} name={name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-text-primary truncate">{name}</p>
                            <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded-[3px] font-semibold flex items-center gap-0.5 shrink-0">
                              <Check size={8} className="text-white" />
                              Buddy
                            </span>
                          </div>
                          {description && (
                            <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{description}</p>
                          )}
                          <p className="text-[11px] text-text-muted/70">{t('member.notInChannel')}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddServerBotToChannel(u.id)}
                          disabled={isAdding}
                          className="shrink-0 mt-0.5 px-3 py-1.5 text-xs rounded-md bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold disabled:opacity-50 transition"
                        >
                          {isAdding ? t('common.loading') : t('member.addToChannel')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* My buddies not on server */}
              {filteredMyBuddies.length > 0 && (
                <div>
                  {filteredServerBots.length > 0 && (
                    <p className="text-[10px] font-bold uppercase text-text-muted mb-1 px-1">
                      {t('member.myBuddies')}
                    </p>
                  )}
                  {filteredMyBuddies.map((buddy) => {
                    const u = buddy.botUser!
                    const name = u.displayName || u.username
                    const description =
                      typeof buddy.config?.description === 'string' ? buddy.config.description : null
                    const ownerName = buddy.owner?.displayName ?? buddy.owner?.username ?? null
                    const isSelected = selectedBuddyIds.has(buddy.id)
                    const isAdding = addingSingleId === buddy.id

                    return (
                      <button
                        key={buddy.id}
                        type="button"
                        onClick={() => toggleBuddy(buddy.id)}
                        className={`flex items-start gap-3 w-full px-3 py-2 rounded-lg text-left transition mb-1 ${
                          isSelected
                            ? 'bg-[#FF6B9D]/15 border border-[#FF6B9D]/30'
                            : 'bg-bg-tertiary/40 border border-border-subtle hover:bg-bg-tertiary/60'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'border-[#FF6B9D] bg-[#FF6B9D]'
                              : 'border-border-dim bg-transparent'
                          }`}
                        >
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        {/* Avatar */}
                        <UserAvatar avatarUrl={u.avatarUrl} name={name} />
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-text-primary truncate">{name}</p>
                            <PawPrint size={12} className="text-[#FF6B9D] shrink-0" />
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                buddy.status === 'running'
                                  ? 'bg-green-400'
                                  : buddy.status === 'error'
                                    ? 'bg-red-400'
                                    : 'bg-zinc-500'
                              }`}
                            />
                          </div>
                          {description && (
                            <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{description}</p>
                          )}
                          {ownerName && (
                            <p className="text-[11px] text-text-muted/70">
                              {t('channel.buddyOwner')} {ownerName}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Empty state */}
              {filteredServerBots.length === 0 && filteredMyBuddies.length === 0 && (
                <div className="text-center py-8 text-text-muted text-sm">
                  {myBuddies.length === 0 ? (
                    <>
                      {t('member.noBuddies')},
                      <button
                        type="button"
                        onClick={handleGoToBuddySettings}
                        className="text-[#FF6B9D] hover:underline ml-1"
                      >
                        {t('member.goCreate')}
                      </button>
                    </>
                  ) : (
                    t('channel.noSearchResults')
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom action bar for buddies tab */}
        {activeTab === 'buddies' && filteredMyBuddies.length > 0 && (
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-border-subtle">
            <span className="text-xs text-text-muted">
              {t('member.selectedBuddies', { count: selectedBuddyIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg text-xs"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleAddBuddiesToServer}
                disabled={selectedBuddyIds.size === 0 || addingBuddies}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#FF6B9D] hover:bg-[#FF4081] text-white rounded-lg font-bold text-xs transition disabled:opacity-50"
              >
                <PawPrint size={14} />
                {addingBuddies ? t('common.loading') : t('member.addToServer')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}