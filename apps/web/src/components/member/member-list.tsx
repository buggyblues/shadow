import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, MessageSquare, UserPlus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { UserAvatar } from '../common/avatar'
import { UserProfileCard } from '../common/user-profile-card'

interface MemberUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  isBot: boolean
}

interface Member {
  id: string
  userId: string
  serverId: string
  role: 'owner' | 'admin' | 'member'
  nickname: string | null
  joinedAt: string
  user?: MemberUser
}

interface BuddyAgent {
  id: string
  ownerId: string
  config?: Record<string, unknown>
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
}

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
}

export function MemberList() {
  const { t } = useTranslation()
  const { activeServerId, activeChannelId } = useChatStore()
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const { mobileMemberListOpen, closeMobileMemberList, filePreviewOpen } = useUIStore()
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  // Profile panel state (shown on "View Profile" click)
  const [profileMember, setProfileMember] = useState<Member | null>(null)

  // Hover card state
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [hoveredCard, setHoveredCard] = useState<{
    member: Member
    ownerName?: string
    description?: string
    anchorRect: DOMRect
  } | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    member: Member
  } | null>(null)

  const { data: members = [] } = useQuery({
    queryKey: ['members', activeServerId, activeChannelId],
    queryFn: () => {
      // Prefer channel-specific members when a channel is active
      if (activeChannelId) {
        return fetchApi<Member[]>(`/api/channels/${activeChannelId}/members`)
      }
      return fetchApi<Member[]>(`/api/servers/${activeServerId}/members`)
    },
    enabled: !!activeServerId,
  })

  const { data: server } = useQuery({
    queryKey: ['server', activeServerId],
    queryFn: () => fetchApi<{ id: string; inviteCode: string }>(`/api/servers/${activeServerId}`),
    enabled: !!activeServerId,
  })

  const { data: buddyAgents = [] } = useQuery({
    queryKey: ['members-buddy-agents', activeServerId],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents'),
    enabled: !!activeServerId,
  })

  // Listen for real-time presence changes
  useSocketEvent(
    'presence:change',
    (data: { userId: string; status: 'online' | 'idle' | 'dnd' | 'offline' }) => {
      queryClient.setQueryData<Member[]>(['members', activeServerId, activeChannelId], (old = []) =>
        old.map((m) =>
          m.userId === data.userId && m.user
            ? { ...m, user: { ...m.user, status: data.status } }
            : m,
        ),
      )
    },
  )

  // On socket reconnect, refetch members to sync bot/user statuses
  useSocketEvent('connect', () => {
    queryClient.invalidateQueries({ queryKey: ['members', activeServerId, activeChannelId] })
  })

  // Listen for channel member changes (buddy added/removed from channel)
  useSocketEvent('channel:member-added', (data: { channelId: string }) => {
    if (data.channelId === activeChannelId) {
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId, activeChannelId] })
    }
  })
  useSocketEvent('channel:member-removed', (data: { channelId: string }) => {
    if (data.channelId === activeChannelId) {
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId, activeChannelId] })
    }
  })

  // Kick / remove member mutation
  const kickMember = useMutation({
    mutationFn: ({ serverId, userId }: { serverId: string; userId: string }) =>
      fetchApi(`/api/servers/${serverId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId, activeChannelId] })
      setContextMenu(null)
    },
  })

  // Remove bot from channel mutation
  const removeBotFromChannel = useMutation({
    mutationFn: ({ channelId, userId }: { channelId: string; userId: string }) =>
      fetchApi(`/api/channels/${channelId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId, activeChannelId] })
      setContextMenu(null)
    },
  })

  // Update bot policy mutation
  const updateBotPolicy = useMutation({
    mutationFn: ({
      channelId,
      agentId,
      mentionOnly,
    }: { channelId: string; agentId: string; mentionOnly: boolean }) =>
      fetchApi(`/api/channels/${channelId}/agents/${agentId}/policy`, {
        method: 'PUT',
        body: JSON.stringify({ mentionOnly }),
      }),
    onSuccess: () => {
      setContextMenu(null)
    },
  })

  // Hover card handlers
  const handleMemberMouseEnter = useCallback(
    (
      member: Member,
      anchorEl: HTMLElement,
      buddyMeta?: { ownerName?: string; description?: string },
    ) => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredMemberId(member.id)
        setHoveredCard({
          member,
          ownerName: buddyMeta?.ownerName,
          description: buddyMeta?.description,
          anchorRect: anchorEl.getBoundingClientRect(),
        })
      }, 400)
    },
    [],
  )

  const handleMemberMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMemberId(null)
      setHoveredCard(null)
    }, 200)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, member: Member) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, member })
  }, [])

  // Close context menu on click outside
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // Determine if current user can kick members
  const currentMember = members.find((m) => m.userId === currentUser?.id)
  const canKick = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  const onlineMembers = members.filter((m) => m.user?.status !== 'offline')
  const offlineMembers = members.filter((m) => m.user?.status === 'offline')

  const renderMemberGroup = (label: string, items: Member[], opts?: { flat?: boolean }) => {
    if (items.length === 0) return null
    const isFlat = opts?.flat ?? false
    return (
      <div className="mb-4">
        <h4 className="text-[12px] font-bold uppercase text-text-muted px-4 mb-2 tracking-wide">
          {label} — {items.length}
        </h4>
        {(() => {
          const botOwnerByUserId = new Map<string, string>()
          const buddyMetaByUserId = new Map<string, { ownerName?: string; description?: string }>()
          for (const a of buddyAgents) {
            const botUserId = a.botUser?.id
            if (botUserId) botOwnerByUserId.set(botUserId, a.ownerId)
            if (botUserId) {
              const ownerName = a.owner?.displayName ?? a.owner?.username ?? undefined
              const description =
                typeof a.config?.description === 'string' ? a.config.description : undefined
              buddyMetaByUserId.set(botUserId, { ownerName, description })
            }
          }

          const membersByUserId = new Map(items.map((m) => [m.userId, m]))
          const ownerChildren = new Map<string, Member[]>()
          const orphanBots: Member[] = []

          for (const m of items) {
            if (!m.user?.isBot) continue
            const ownerId = botOwnerByUserId.get(m.userId)
            if (ownerId && membersByUserId.has(ownerId)) {
              ownerChildren.set(ownerId, [...(ownerChildren.get(ownerId) ?? []), m])
            } else {
              orphanBots.push(m)
            }
          }

          const topLevelMembers = items.filter((m) => !m.user?.isBot)

          const renderMemberRow = (member: Member, rowOpts?: { child?: boolean }) => {
            const user = member.user
            if (!user) return null
            const buddyMeta = user.isBot ? buddyMetaByUserId.get(user.id) : undefined
            const badge =
              member.role === 'owner'
                ? { label: t('member.owner'), color: 'text-yellow-400' }
                : member.role === 'admin'
                  ? { label: t('member.admin'), color: 'text-blue-400' }
                  : null
            const isHovered = hoveredMemberId === member.id
            return (
              <div key={member.id} className={`relative ${rowOpts?.child ? 'pl-3' : 'mx-2'}`}>
                {rowOpts?.child && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-px bg-white/20" />
                )}
                <button
                  type="button"
                  className="flex items-center gap-3 px-2 py-1.5 w-full rounded-md hover:bg-white/[0.06] transition group"
                  onMouseEnter={(e) =>
                    handleMemberMouseEnter(member, e.currentTarget, {
                      ownerName: buddyMeta?.ownerName,
                      description: buddyMeta?.description,
                    })
                  }
                  onMouseLeave={handleMemberMouseLeave}
                  onContextMenu={(e) => handleContextMenu(e, member)}
                >
                  {/* Avatar with status dot */}
                  <div className="relative shrink-0">
                    <UserAvatar
                      userId={user.id}
                      avatarUrl={user.avatarUrl}
                      displayName={user.displayName || user.username}
                      size="sm"
                    />
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-bg-secondary ${statusColors[user.status]}`}
                      title={t(`member.${user.status}`)}
                    />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[15px] truncate font-medium ${user.status === 'offline' ? 'text-text-muted' : 'text-[#dbdee1] group-hover:text-white'} transition`}
                      >
                        {member.nickname ?? user.displayName}
                      </span>
                      {user.isBot && (
                        <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded-[3px] font-semibold flex items-center gap-1 shrink-0">
                          <Check size={8} className="text-white" />
                          Buddy
                        </span>
                      )}
                    </div>
                    {badge && <span className={`text-[10px] ${badge.color}`}>{badge.label}</span>}
                  </div>
                </button>

                {isHovered && null}
              </div>
            )
          }

          return (
            <>
              {topLevelMembers.map((member) => {
                const children = isFlat ? [] : (ownerChildren.get(member.userId) ?? [])
                return (
                  <div key={member.id}>
                    {renderMemberRow(member)}
                    {children.length > 0 && (
                      <div className="relative ml-5 border-l border-white/15">
                        {children.map((child) => renderMemberRow(child, { child: true }))}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* In flat mode, render all bots without tree structure */}
              {isFlat
                ? items.filter((m) => m.user?.isBot).map((m) => renderMemberRow(m))
                : orphanBots.map((member) => renderMemberRow(member, { child: true }))}
            </>
          )
        })()}
      </div>
    )
  }

  const memberContent = (
    <>
      {/* Action buttons */}
      <div className="px-2 pb-2 flex gap-1">
        <button
          type="button"
          onClick={() => setShowInvitePanel(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-text-muted hover:text-text-primary hover:bg-bg-primary/30 transition flex-1"
          title={t('channel.inviteMember')}
        >
          <UserPlus size={13} />
          <span className="truncate">{t('channel.inviteMember')}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowAddAgent(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-text-muted hover:text-text-primary hover:bg-bg-primary/30 transition flex-1"
          title={t('channel.addAgent')}
        >
          <img src="/Logo.svg" alt="Buddy" className="w-[13px] h-[13px]" />
          <span className="truncate">{t('channel.addAgent')}</span>
        </button>
      </div>
      {renderMemberGroup(t('member.groupOnline'), onlineMembers)}
      {renderMemberGroup(t('member.groupOffline'), offlineMembers, { flat: true })}
      {members.length === 0 && (
        <p className="text-text-muted text-sm px-4 py-2">{t('member.noMembers')}</p>
      )}
    </>
  )

  return (
    <>
      {/* Desktop member list — hidden when file preview panel is open */}
      {!filePreviewOpen && (
        <div className="w-60 bg-bg-secondary overflow-y-auto shrink-0 pt-4 hidden lg:block h-full">
          {memberContent}
        </div>
      )}

      {/* Mobile member list overlay */}
      {mobileMemberListOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobileMemberList} />
          <div className="ml-auto relative z-10 w-64 bg-bg-secondary h-full overflow-y-auto animate-slide-in-right">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <h3 className="font-bold text-text-primary text-sm">{t('member.groupOnline')}</h3>
              <button
                onClick={closeMobileMemberList}
                className="text-text-muted hover:text-text-primary transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="pt-2">{memberContent}</div>
          </div>
        </div>
      )}

      {/* Invite Panel */}
      {showInvitePanel && server?.inviteCode && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowInvitePanel(false)}
        >
          <div
            className="bg-bg-secondary rounded-xl p-6 w-96 border border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-primary">{t('channel.inviteMember')}</h2>
              <button
                onClick={() => setShowInvitePanel(false)}
                className="text-text-muted hover:text-text-primary transition"
              >
                <X size={18} />
              </button>
            </div>
            <label className="block text-xs font-bold uppercase text-text-secondary mb-2">
              {t('channel.inviteLink')}
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 font-mono text-xs truncate">
                {`${window.location.origin}/invite/${server.inviteCode}`}
              </code>
              <button
                onClick={() => {
                  const inviteLink = `${window.location.origin}/invite/${server.inviteCode}`
                  navigator.clipboard.writeText(inviteLink)
                  setInviteCopied(true)
                  setTimeout(() => setInviteCopied(false), 2000)
                }}
                className="px-3 py-3 bg-bg-tertiary rounded-lg text-text-muted hover:text-text-primary transition"
                title={t('common.copy')}
              >
                {inviteCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Agent dialog */}
      {showAddAgent && activeServerId && (
        <MemberAddAgentDialog
          serverId={activeServerId}
          channelId={activeChannelId ?? undefined}
          onClose={() => setShowAddAgent(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['members'] })
            setShowAddAgent(false)
          }}
          t={t}
        />
      )}

      {/* Context menu */}
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
            className="fixed z-[61] bg-bg-tertiary border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {/* View profile — always visible */}
            <button
              type="button"
              onClick={() => {
                setProfileMember(contextMenu.member)
                setContextMenu(null)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
            >
              {t('member.viewProfile')}
            </button>

            {/* Channel-level buddy actions — only for bots in a channel */}
            {contextMenu.member.user?.isBot && activeChannelId && (
              <>
                <div className="h-px bg-white/5 my-1" />
                {/* Policy toggle */}
                {(() => {
                  const agent = buddyAgents.find(
                    (a) => a.botUser?.id === contextMenu.member.user?.id,
                  )
                  if (!agent) return null
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeChannelId) return
                          updateBotPolicy.mutate({
                            channelId: activeChannelId,
                            agentId: agent.id,
                            mentionOnly: true,
                          })
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                      >
                        <MessageSquare size={14} />
                        {t('member.policyMentionOnly')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeChannelId) return
                          updateBotPolicy.mutate({
                            channelId: activeChannelId,
                            agentId: agent.id,
                            mentionOnly: false,
                          })
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                      >
                        <MessageSquare size={14} />
                        {t('member.policyReplyAll')}
                      </button>
                    </>
                  )
                })()}
                {/* Remove from channel */}
                <button
                  type="button"
                  onClick={() => {
                    if (!activeChannelId) return
                    const name =
                      contextMenu.member.user?.displayName ?? contextMenu.member.user?.username
                    if (confirm(t('member.removeFromChannelConfirm', { name }))) {
                      removeBotFromChannel.mutate({
                        channelId: activeChannelId,
                        userId: contextMenu.member.userId,
                      })
                    }
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-orange-400 hover:bg-orange-500/10 transition"
                >
                  {t('member.removeFromChannel')}
                </button>
              </>
            )}

            {/* Kick / remove — admin+ only, not self, not owner */}
            {canKick &&
              contextMenu.member.userId !== currentUser?.id &&
              contextMenu.member.role !== 'owner' && (
                <>
                  <div className="h-px bg-white/5 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeServerId) return
                      const name =
                        contextMenu.member.user?.displayName ?? contextMenu.member.user?.username
                      const confirmKey = contextMenu.member.user?.isBot
                        ? 'member.removeBotConfirm'
                        : 'member.kickConfirm'
                      if (confirm(t(confirmKey, { name }))) {
                        kickMember.mutate({
                          serverId: activeServerId,
                          userId: contextMenu.member.userId,
                        })
                      }
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
                  >
                    {contextMenu.member.user?.isBot
                      ? t('member.removeBot')
                      : t('member.kickMember')}
                  </button>
                </>
              )}
          </div>
        </>
      )}

      {/* Profile panel modal */}
      {profileMember && profileMember.user && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setProfileMember(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <UserProfileCard
              user={profileMember.user}
              role={profileMember.role}
              ownerName={
                profileMember.user.isBot
                  ? (buddyAgents.find((a) => a.botUser?.id === profileMember.user?.id)?.owner
                      ?.displayName ??
                    buddyAgents.find((a) => a.botUser?.id === profileMember.user?.id)?.owner
                      ?.username ??
                    undefined)
                  : undefined
              }
              description={
                profileMember.user.isBot
                  ? (() => {
                      const cfg = buddyAgents.find(
                        (a) => a.botUser?.id === profileMember.user?.id,
                      )?.config
                      return typeof cfg?.description === 'string' ? cfg.description : undefined
                    })()
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Hover profile card (portal to avoid clipping in scroll containers) */}
      {hoveredCard &&
        hoveredCard.member.user &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{
              left: Math.max(8, hoveredCard.anchorRect.left - 272 - 12),
              top: Math.max(8, Math.min(hoveredCard.anchorRect.top, window.innerHeight - 260)),
            }}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
            }}
            onMouseLeave={handleMemberMouseLeave}
          >
            <UserProfileCard
              user={hoveredCard.member.user}
              role={hoveredCard.member.role}
              ownerName={hoveredCard.ownerName}
              description={hoveredCard.description}
            />
          </div>,
          document.body,
        )}
    </>
  )
}

/* ── Add Agent Dialog (member list) ──────────────────── */

interface AgentDialogOption {
  id: string
  userId: string
  status: string
  config?: Record<string, unknown>
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
}

function MemberAddAgentDialog({
  serverId,
  channelId,
  onClose,
  onSuccess,
  t,
}: {
  serverId: string
  channelId?: string
  onClose: () => void
  onSuccess: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const [search, setSearch] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<AgentDialogOption[]>('/api/agents'),
  })

  // Server-level members (to find bots on the server)
  const { data: serverMembers = [] } = useQuery({
    queryKey: ['members', serverId, null],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${serverId}/members`),
    enabled: !!channelId,
  })

  // Channel-level members (to find bots already in the channel)
  const channelMembers =
    queryClient.getQueryData<Member[]>(['members', serverId, channelId]) ?? []
  const channelBotUserIds = new Set(
    channelMembers.filter((m) => m.user?.isBot).map((m) => m.userId),
  )

  // Server-level bot user IDs
  const serverBotUserIds = new Set(
    serverMembers.filter((m) => m.user?.isBot).map((m) => m.userId),
  )

  // When a channel is active, show server bots not in this channel
  // When no channel, show user's agents not yet on the server
  const serverOnlyBotMembers = channelId
    ? serverMembers.filter((m) => m.user?.isBot && !channelBotUserIds.has(m.userId))
    : []

  const filtered = agents.filter((a) => {
    if (!search.trim()) return true
    const name = (a.botUser?.displayName ?? a.botUser?.username ?? '').toLowerCase()
    const desc = typeof a.config?.description === 'string' ? a.config.description.toLowerCase() : ''
    const q = search.trim().toLowerCase()
    return name.includes(q) || desc.includes(q)
  })

  // Filter to only agents not yet on the server
  const agentsNotOnServer = filtered.filter((a) => !serverBotUserIds.has(a.userId))

  const handleAddToServer = async (agentId: string) => {
    setAddingId(agentId)
    try {
      await fetchApi(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds: [agentId] }),
      })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      onSuccess()
    } catch {
      /* silently handle */
    } finally {
      setAddingId(null)
    }
  }

  const handleAddToChannel = async (botUserId: string) => {
    if (!channelId) return
    setAddingId(botUserId)
    try {
      await fetchApi(`/api/channels/${channelId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: botUserId }),
      })
      queryClient.invalidateQueries({ queryKey: ['members', serverId, channelId] })
      onSuccess()
    } catch {
      /* silently handle */
    } finally {
      setAddingId(null)
    }
  }

  const dialogTitle = channelId ? t('member.addBuddyToChannel') : t('channel.addAgent')

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary rounded-xl w-[440px] max-h-[70vh] flex flex-col border border-white/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-text-primary">{dialogTitle}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('channel.searchBuddy')}
            className="w-full bg-bg-tertiary text-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary placeholder:text-text-muted"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {/* Section: Server bots not in channel (when channel is active) */}
          {channelId && serverOnlyBotMembers.length > 0 && (
            <>
              {serverOnlyBotMembers.map((member) => {
                const user = member.user
                if (!user) return null
                const name = user.displayName || user.username
                const agent = agents.find((a) => a.botUser?.id === user.id)
                const description = agent?.config?.description
                const isAdding = addingId === user.id

                return (
                  <div
                    key={member.id}
                    className="flex items-start gap-3 px-3 py-3 rounded-lg border transition border-white/5 bg-bg-tertiary/50 hover:bg-bg-tertiary hover:border-white/10"
                  >
                    <div className="shrink-0 mt-0.5">
                      <UserAvatar
                        userId={user.id}
                        avatarUrl={user.avatarUrl}
                        displayName={name}
                        size="md"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-text-primary truncate">
                          {name}
                        </span>
                        <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded-[3px] font-semibold flex items-center gap-0.5 shrink-0">
                          <Check size={8} className="text-white" />
                          Buddy
                        </span>
                      </div>
                      {typeof description === 'string' && (
                        <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{description}</p>
                      )}
                      <p className="text-[11px] text-text-muted/70 mt-0.5">
                        {t('member.notInChannel')}
                      </p>
                    </div>
                    <div className="shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={() => handleAddToChannel(user.id)}
                        disabled={isAdding}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary hover:bg-primary-hover text-white transition disabled:opacity-50"
                      >
                        {isAdding ? t('common.loading') : t('member.addToChannel')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* Section: Agents not on server */}
          {agentsNotOnServer.length > 0 &&
            agentsNotOnServer.map((agent) => {
              const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'
              const description =
                typeof agent.config?.description === 'string' ? agent.config.description : null
              const ownerName = agent.owner?.displayName ?? agent.owner?.username ?? null
              const isAdding = addingId === agent.id

              return (
                <div
                  key={agent.id}
                  className="flex items-start gap-3 px-3 py-3 rounded-lg border transition border-white/5 bg-bg-tertiary/50 hover:bg-bg-tertiary hover:border-white/10"
                >
                  <div className="shrink-0 mt-0.5">
                    <UserAvatar
                      userId={agent.botUser?.id}
                      avatarUrl={agent.botUser?.avatarUrl}
                      displayName={name}
                      size="md"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-text-primary truncate">
                        {name}
                      </span>
                      <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded-[3px] font-semibold flex items-center gap-0.5 shrink-0">
                        <Check size={8} className="text-white" />
                        Buddy
                      </span>
                      <span
                        className={`ml-1 w-2 h-2 rounded-full shrink-0 ${
                          agent.status === 'running'
                            ? 'bg-green-400'
                            : agent.status === 'error'
                              ? 'bg-red-400'
                              : 'bg-zinc-500'
                        }`}
                        title={agent.status}
                      />
                    </div>
                    {description && (
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{description}</p>
                    )}
                    {ownerName && (
                      <p className="text-[11px] text-text-muted/70 mt-0.5">
                        {t('channel.buddyOwner')} {ownerName}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 mt-0.5">
                    <button
                      type="button"
                      onClick={() => handleAddToServer(agent.id)}
                      disabled={isAdding}
                      className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary hover:bg-primary-hover text-white transition disabled:opacity-50"
                    >
                      {isAdding ? t('common.loading') : t('channel.addAgentConfirm')}
                    </button>
                  </div>
                </div>
              )
            })}

          {/* Empty state */}
          {serverOnlyBotMembers.length === 0 && agentsNotOnServer.length === 0 && (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              {agents.length === 0
                ? t('channel.noAgentsAvailable')
                : t('channel.noSearchResults')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
