import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Check, Copy, UserPlus, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { useChatStore } from '../../stores/chat.store'
import { useAuthStore } from '../../stores/auth.store'
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

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
}

export function MemberList() {
  const { t } = useTranslation()
  const { activeServerId } = useChatStore()
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const { mobileMemberListOpen, closeMobileMemberList } = useUIStore()
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  // Profile panel state (shown on "View Profile" click)
  const [profileMember, setProfileMember] = useState<Member | null>(null)

  // Hover card state
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    member: Member
  } | null>(null)

  const { data: members = [] } = useQuery({
    queryKey: ['members', activeServerId],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${activeServerId}/members`),
    enabled: !!activeServerId,
  })

  const { data: server } = useQuery({
    queryKey: ['server', activeServerId],
    queryFn: () =>
      fetchApi<{ id: string; inviteCode: string }>(`/api/servers/${activeServerId}`),
    enabled: !!activeServerId,
  })

  // Listen for real-time presence changes
  useSocketEvent(
    'presence:change',
    (data: { userId: string; status: 'online' | 'idle' | 'dnd' | 'offline' }) => {
      queryClient.setQueryData<Member[]>(['members', activeServerId], (old = []) =>
        old.map((m) =>
          m.userId === data.userId && m.user
            ? { ...m, user: { ...m.user, status: data.status } }
            : m,
        ),
      )
    },
  )

  // Kick / remove member mutation
  const kickMember = useMutation({
    mutationFn: ({ serverId, userId }: { serverId: string; userId: string }) =>
      fetchApi(`/api/servers/${serverId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId] })
      setContextMenu(null)
    },
  })

  // Hover card handlers
  const handleMemberMouseEnter = useCallback((memberId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setHoveredMemberId(memberId), 400)
  }, [])

  const handleMemberMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => setHoveredMemberId(null), 200)
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

  const renderMemberGroup = (label: string, items: Member[]) => {
    if (items.length === 0) return null
    return (
      <div className="mb-4">
        <h4 className="text-[12px] font-bold uppercase text-text-muted px-4 mb-2 tracking-wide">
          {label} — {items.length}
        </h4>
        {items.map((member) => {
          const user = member.user
          if (!user) return null
          const badge =
            member.role === 'owner'
              ? { label: t('member.owner'), color: 'text-yellow-400' }
              : member.role === 'admin'
                ? { label: t('member.admin'), color: 'text-blue-400' }
                : null
          const isHovered = hoveredMemberId === member.id
          return (
            <div key={member.id} className="relative mx-2">
              <button
                type="button"
                className="flex items-center gap-3 px-2 py-1.5 w-full rounded-md hover:bg-white/[0.06] transition group"
                onMouseEnter={() => handleMemberMouseEnter(member.id)}
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
                        BOT
                      </span>
                    )}
                  </div>
                  {badge && <span className={`text-[10px] ${badge.color}`}>{badge.label}</span>}
                </div>
              </button>

              {/* Hover card */}
              {isHovered && (
                <div
                  className="absolute right-full top-0 mr-2 z-50"
                  onMouseEnter={() => {
                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
                  }}
                  onMouseLeave={handleMemberMouseLeave}
                >
                  <UserProfileCard user={user} role={member.role} />
                </div>
              )}
            </div>
          )
        })}
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
          <Bot size={13} />
          <span className="truncate">{t('channel.addAgent')}</span>
        </button>
      </div>
      {renderMemberGroup(t('member.groupOnline'), onlineMembers)}
      {renderMemberGroup(t('member.groupOffline'), offlineMembers)}
      {members.length === 0 && (
        <p className="text-text-muted text-sm px-4 py-2">{t('member.noMembers')}</p>
      )}
    </>
  )

  return (
    <>
      {/* Desktop member list */}
      <div className="w-60 bg-bg-secondary overflow-y-auto shrink-0 pt-4 hidden lg:block h-full">
        {memberContent}
      </div>

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
                {inviteCopied ? (
                  <Check size={16} className="text-green-400" />
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Agent dialog */}
      {showAddAgent && activeServerId && (
        <MemberAddAgentDialog
          serverId={activeServerId}
          onClose={() => setShowAddAgent(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['members', activeServerId] })
            setShowAddAgent(false)
          }}
          t={t}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu() }} />
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
                      const name = contextMenu.member.user?.displayName ?? contextMenu.member.user?.username
                      const confirmKey = contextMenu.member.user?.isBot ? 'member.removeBotConfirm' : 'member.kickConfirm'
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
            <UserProfileCard user={profileMember.user} role={profileMember.role} />
          </div>
        </div>
      )}
    </>
  )
}

/* ── Add Agent Dialog (member list) ──────────────────── */

interface AgentDialogOption {
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

function MemberAddAgentDialog({
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
    queryFn: () => fetchApi<AgentDialogOption[]>('/api/agents'),
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
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary rounded-xl p-6 w-96 max-h-[60vh] flex flex-col border border-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-text-primary mb-4">{t('channel.addAgent')}</h2>

        {agents.length === 0 ? (
          <p className="text-text-muted text-sm py-4">{t('channel.noAgentsAvailable')}</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 mb-4">
            {agents.map((agent) => {
              const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Agent'
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
                      isSelected ? 'border-primary bg-primary' : 'border-white/20'
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

        <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
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
            <Bot size={14} />
            {adding ? t('common.loading') : t('channel.addAgentConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
