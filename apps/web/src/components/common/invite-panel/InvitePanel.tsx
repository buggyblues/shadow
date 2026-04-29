import { Button, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, PawPrint, Search, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { UserAvatar } from '../avatar'

// Types
type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline'

interface ServerMember {
  userId: string
  role: string
  user?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot: boolean
    status?: PresenceStatus | null
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

// Props
export interface InvitePanelProps {
  serverId: string
  channelId?: string | null
  channelName?: string
  initialTab?: 'members' | 'buddies'
  onClose: () => void
}

function normalizeStatus(status?: string | null): PresenceStatus {
  if (status === 'online' || status === 'idle' || status === 'dnd') return status
  return 'offline'
}

function normalizeBuddyStatus(status?: string | null): PresenceStatus {
  if (status === 'running') return 'online'
  if (status === 'error') return 'dnd'
  return normalizeStatus(status)
}

function StatusPill({ status }: { status: PresenceStatus }) {
  const { t } = useTranslation()
  const statusClasses: Record<PresenceStatus, string> = {
    online: 'bg-success/15 text-success border-success/25',
    idle: 'bg-warning/15 text-warning border-warning/25',
    dnd: 'bg-danger/15 text-danger border-danger/25',
    offline: 'bg-text-muted/10 text-text-muted border-border-subtle',
  }
  const dotClasses: Record<PresenceStatus, string> = {
    online: 'bg-success',
    idle: 'bg-warning',
    dnd: 'bg-danger',
    offline: 'bg-text-muted',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[status]}`} />
      {t(`member.${status}`)}
    </span>
  )
}

function BuddyBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-black text-primary">
      <Check size={10} />
      {t('member.buddy')}
    </span>
  )
}

function BuddyInviteRow({
  user,
  description,
  ownerName,
  status,
  selected,
  selectable,
  action,
  onSelect,
}: {
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
  description?: string | null
  ownerName?: string | null
  status: PresenceStatus
  selected?: boolean
  selectable?: boolean
  action?: {
    label: string
    disabled?: boolean
    loading?: boolean
    onClick: () => void
  }
  onSelect?: () => void
}) {
  const { t } = useTranslation()
  const name = user.displayName || user.username
  const content = (
    <>
      {selectable && (
        <div
          className={`mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
            selected
              ? 'border-accent bg-accent text-white'
              : 'border-border-subtle text-transparent'
          }`}
        >
          <Check size={13} />
        </div>
      )}
      <UserAvatar userId={user.id} avatarUrl={user.avatarUrl} displayName={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
          <BuddyBadge />
          <StatusPill status={status} />
        </div>
        <p className="truncate text-xs text-text-muted">@{user.username}</p>
        {description && (
          <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{description}</p>
        )}
        {ownerName && (
          <p className="mt-1 text-[11px] text-text-muted/80">
            {t('channel.buddyOwner')} {ownerName}
          </p>
        )}
      </div>
      {action && (
        <Button
          variant="accent"
          size="xs"
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
          className="shrink-0"
        >
          {action.label}
        </Button>
      )}
    </>
  )

  if (selectable) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`mb-1 flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${
          selected
            ? 'border-accent/40 bg-accent/15'
            : 'border-border-subtle bg-bg-tertiary/45 hover:bg-bg-modifier-hover'
        }`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="mb-1 flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-tertiary/45 px-3 py-2">
      {content}
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
      fetchApi<Array<{ user: { id: string; isBot?: boolean } }>>(
        `/api/channels/${channelId}/members`,
      ),
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
    const desc = typeof b.config?.description === 'string' ? b.config.description.toLowerCase() : ''
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
      className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-bg-primary/95 backdrop-blur-xl rounded-[40px] border border-border-subtle shadow-[0_32px_120px_rgba(0,0,0,0.5)] p-6 w-[520px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary">
            {activeTab === 'members' ? t('channel.inviteMember') : t('channel.addAgent')}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Invite Link */}
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-secondary mb-2">
          {t('channel.inviteLink')}
        </label>
        <div className="flex items-center gap-2 mb-4">
          <code className="flex-1 bg-bg-tertiary/50 text-text-primary rounded-xl px-4 py-3 font-mono text-xs truncate">
            {server?.inviteCode
              ? `${window.location.origin}/app/invite/${server.inviteCode}`
              : '...'}
          </code>
          <Button
            variant="glass"
            size="sm"
            onClick={copyInviteCode}
            disabled={!server?.inviteCode}
            title={t('common.copy')}
          >
            {copiedInvite ? <Check size={16} className="text-success" /> : <Copy size={16} />}
          </Button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 mb-3 bg-bg-tertiary/50 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition ${
              activeTab === 'members'
                ? 'bg-bg-modifier-hover text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <UserPlus size={14} />
            {t('member.members')} ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('buddies')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition ${
              activeTab === 'buddies'
                ? 'bg-bg-modifier-hover text-accent shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <PawPrint size={14} />
            {t('member.buddies')} ({buddyCount})
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
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('channel.searchBuddy')}
              icon={Search}
              className="text-xs py-2"
            />
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
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-tertiary/50 border border-border-subtle"
                  >
                    <UserAvatar
                      userId={u.id}
                      avatarUrl={u.avatarUrl}
                      displayName={u.displayName || u.username}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">
                        {u.displayName || u.username}
                      </p>
                      <p className="text-xs text-text-muted truncate">@{u.username}</p>
                    </div>
                    <Button
                      variant="accent"
                      size="xs"
                      disabled={!channelId || inChannel || inviteToChannel.isPending}
                      onClick={() => inviteToChannel.mutate(u.id)}
                    >
                      {inChannel ? t('member.inChannel') : t('members.invite')}
                    </Button>
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
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1 px-1">
                    {t('member.buddiesOnServer')}
                  </p>
                  {filteredServerBots.map((m) => {
                    const u = m.user!
                    const agent = myBuddies.find((a) => a.botUser?.id === u.id)
                    const description = agent?.config?.description
                    const isAdding = addingSingleId === u.id

                    return (
                      <BuddyInviteRow
                        key={u.id}
                        user={u}
                        description={description ?? t('member.notInChannel')}
                        status={
                          agent ? normalizeBuddyStatus(agent.status) : normalizeStatus(u.status)
                        }
                        action={{
                          label: isAdding ? t('common.loading') : t('member.addToChannel'),
                          disabled: isAdding,
                          loading: isAdding,
                          onClick: () => handleAddServerBotToChannel(u.id),
                        }}
                      />
                    )
                  })}
                </div>
              )}

              {/* My buddies not on server */}
              {filteredMyBuddies.length > 0 && (
                <div>
                  {filteredServerBots.length > 0 && (
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1 px-1">
                      {t('member.myBuddies')}
                    </p>
                  )}
                  {filteredMyBuddies.map((buddy) => {
                    const u = buddy.botUser!
                    const description =
                      typeof buddy.config?.description === 'string'
                        ? buddy.config.description
                        : null
                    const ownerName = buddy.owner?.displayName ?? buddy.owner?.username ?? null
                    const isSelected = selectedBuddyIds.has(buddy.id)

                    return (
                      <BuddyInviteRow
                        key={buddy.id}
                        user={u}
                        description={description}
                        ownerName={ownerName}
                        status={normalizeBuddyStatus(buddy.status)}
                        selected={isSelected}
                        selectable
                        onSelect={() => toggleBuddy(buddy.id)}
                      />
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
                        className="text-accent hover:underline ml-1"
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
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddBuddiesToServer}
                disabled={selectedBuddyIds.size === 0 || addingBuddies}
                icon={PawPrint}
                loading={addingBuddies}
              >
                {t('member.addToServer')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
