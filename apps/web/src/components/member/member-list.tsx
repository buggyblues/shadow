import { GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import {
  Check,
  Copy,
  LogOut,
  MessageSquare,
  PawPrint,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { UserAvatar } from '../common/avatar'
import { BuddyListItem, BuddyListItemData, memberToBuddyItem } from '../common/buddy-list-item'
import { useConfirmStore } from '../common/confirm-dialog'
import { useContextMenuPosition } from '../common/context-menu'
import { InvitePanel } from '../common/invite-panel'
import { normalizeBuddyAgentPresenceStatus } from '../common/presence-avatar'
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
  totalOnlineSeconds?: number
  agent?: {
    ownerId?: string | null
    status?: string | null
    lastHeartbeat?: string | null
    totalOnlineSeconds?: number | null
    config?: Record<string, unknown> | null
  } | null
  creator?: {
    uid: string
    nickname?: string | null
    username?: string | null
    avatarUrl?: string | null
  } | null
  user?: MemberUser
}

export type MemberListInitialMember = Member

type PresenceStatus = MemberUser['status']

type BuddyPolicyConfig = {
  replyToUsers?: string[]
  keywords?: string[]
  mentionOnly?: boolean
  replyToBuddy?: boolean
  maxBuddyTurns?: number
  smartReply?: boolean
}

type ReplyTriggerMode = 'replyAll' | 'mentionOnly' | 'disabled'

type PresenceChangePayload = {
  userId: string
  status: PresenceStatus
  agentId?: string | null
  agentStatus?: string | null
  lastHeartbeat?: string | null
}

function memberPresenceStatus(member: Member) {
  if (!member.user) return 'offline'
  if (!member.user.isBot) return member.user.status
  return normalizeBuddyAgentPresenceStatus({
    userStatus: member.user.status,
    agentStatus: member.agent?.status,
    lastHeartbeat: member.agent?.lastHeartbeat,
  })
}

function applyPresenceToMember(member: Member, update: PresenceChangePayload, observedAt: string) {
  if (!member.user || member.user.id !== update.userId) return member
  const nextUser = { ...member.user, status: update.status }
  if (!member.user.isBot) {
    return member.user.status === update.status ? member : { ...member, user: nextUser }
  }
  const nextAgent = member.agent
    ? {
        ...member.agent,
        ...(update.agentStatus ? { status: update.agentStatus } : {}),
      }
    : member.agent
  if (nextAgent) {
    if (update.lastHeartbeat !== undefined) {
      nextAgent.lastHeartbeat = update.lastHeartbeat
    } else if (update.status === 'online') {
      nextAgent.lastHeartbeat = observedAt
      nextAgent.status = nextAgent.status || 'running'
    } else if (update.status === 'offline') {
      nextAgent.lastHeartbeat = null
    }
  }
  return { ...member, user: nextUser, agent: nextAgent }
}

interface BuddyAgent {
  id: string
  ownerId: string
  accessRole?: 'owner' | 'tenant'
  totalOnlineSeconds?: number
  config?: Record<string, unknown>
  owner?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

export const MemberList = memo(function MemberList({
  channelId: channelIdProp,
  serverId: serverIdProp,
  initialMembers,
}: {
  channelId?: string | null
  serverId?: string | null
  initialMembers?: MemberListInitialMember[] | null
} = {}) {
  const { t } = useTranslation()
  const { channelId: routeChannelId } = useParams({ strict: false }) as { channelId?: string }
  const activeServerId = useChatStore((state) => state.activeServerId)
  const activeChannelId = useChatStore((state) => state.activeChannelId)
  const currentServerId = serverIdProp ?? activeServerId
  const currentChannelId = channelIdProp ?? routeChannelId ?? activeChannelId ?? null
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const mobileMemberListOpen = useUIStore((state) => state.mobileMemberListOpen)
  const closeMobileMemberList = useUIStore((state) => state.closeMobileMemberList)
  const rightPanelOpen = useUIStore((state) => state.rightPanelOpen)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteInitialTab, setInviteInitialTab] = useState<'members' | 'buddies'>('members')
  const [inviteCopied, setInviteCopied] = useState(false)
  const hasSeenSocketConnectRef = useRef(false)

  // Profile panel state (shown on "View Profile" click)
  const [profileMember, setProfileMember] = useState<Member | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    member: Member
  } | null>(null)
  const initialMembersUpdatedAt = useMemo(
    () => (initialMembers ? Date.now() : undefined),
    [initialMembers],
  )
  const { data: members = [] } = useQuery({
    queryKey: ['members', currentServerId, currentChannelId],
    queryFn: () => {
      // Prefer channel-specific members when a channel is active
      if (currentChannelId) {
        return fetchApi<Member[]>(`/api/channels/${currentChannelId}/members`)
      }
      return fetchApi<Member[]>(`/api/servers/${currentServerId}/members`)
    },
    enabled: Boolean(currentServerId),
    initialData: initialMembers ?? undefined,
    initialDataUpdatedAt: initialMembersUpdatedAt,
    staleTime: 30_000,
    refetchOnMount: false,
  })

  const { data: channel } = useQuery({
    queryKey: ['channel', currentChannelId],
    queryFn: () =>
      fetchApi<{ id: string; isArchived?: boolean }>(`/api/channels/${currentChannelId}`),
    enabled: !!currentChannelId,
    staleTime: 30_000,
    refetchOnMount: false,
  })

  const { data: buddyAgents = [] } = useQuery({
    queryKey: ['members-buddy-agents', currentServerId],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents?includeRentals=true'),
    enabled:
      !!currentServerId && (showInvitePanel || Boolean(profileMember) || Boolean(contextMenu)),
    staleTime: 60_000,
  })

  const invalidateCurrentMemberState = useCallback(() => {
    if (!currentServerId) return
    queryClient.invalidateQueries({ queryKey: ['members', currentServerId, currentChannelId] })
    queryClient.invalidateQueries({ queryKey: ['members', currentServerId] })
    queryClient.invalidateQueries({ queryKey: ['members-buddy-agents', currentServerId] })
    queryClient.invalidateQueries({ queryKey: ['server-members', currentServerId] })
    if (currentChannelId) {
      queryClient.invalidateQueries({ queryKey: ['channel-members', currentChannelId] })
    }
  }, [currentChannelId, currentServerId, queryClient])

  const mergeMemberPresence = useCallback(
    (updates: Map<string, PresenceChangePayload>) => {
      if (updates.size === 0) return
      const observedAt = new Date().toISOString()
      queryClient.setQueriesData<Member[]>({ queryKey: ['members'] }, (old) => {
        if (!old) return old

        let changed = false
        const next = old.map((member) => {
          const update = updates.get(member.userId) ?? updates.get(member.user?.id ?? '')
          if (!update || !member.user) return member
          const patched = applyPresenceToMember(member, update, observedAt)
          if (patched === member) return member
          changed = true
          return patched
        })
        return changed ? next : old
      })
    },
    [queryClient],
  )

  // Listen for real-time presence changes
  useSocketEvent('presence:change', (data: PresenceChangePayload) => {
    mergeMemberPresence(new Map([[data.userId, data]]))
  })

  useSocketEvent(
    'presence:snapshot',
    (data: { channelId: string; members: { userId: string; status: PresenceStatus }[] }) => {
      if (currentChannelId && data.channelId !== currentChannelId) return
      mergeMemberPresence(
        new Map(
          data.members.map((member) => [
            member.userId,
            {
              userId: member.userId,
              status: member.status,
            },
          ]),
        ),
      )
    },
  )

  // On socket reconnect, refetch members to sync Buddy/user statuses.
  useSocketEvent('connect', () => {
    if (!hasSeenSocketConnectRef.current) {
      hasSeenSocketConnectRef.current = true
      return
    }
    invalidateCurrentMemberState()
  })

  // Listen for channel member changes (buddy added/removed from channel)
  useSocketEvent('channel:member-added', (data: { channelId: string }) => {
    if (data.channelId === currentChannelId) {
      invalidateCurrentMemberState()
    }
  })
  useSocketEvent('member:joined', (data: { serverId?: string; channelId?: string }) => {
    if (
      (currentChannelId && data.channelId === currentChannelId) ||
      (currentChannelId && data.serverId === currentServerId) ||
      (!currentChannelId && data.serverId === currentServerId)
    ) {
      invalidateCurrentMemberState()
    }
  })
  useSocketEvent('channel:member-removed', (data: { channelId: string }) => {
    if (data.channelId === currentChannelId) {
      invalidateCurrentMemberState()
    }
  })

  // Kick / remove member mutation
  const kickMember = useMutation({
    mutationFn: ({ serverId, userId }: { serverId: string; userId: string }) =>
      fetchApi(`/api/servers/${serverId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', currentServerId, currentChannelId] })
      setContextMenu(null)
    },
  })

  // Remove Buddy from channel mutation.
  const removeBuddyFromChannel = useMutation({
    mutationFn: ({ channelId, userId }: { channelId: string; userId: string }) =>
      fetchApi(`/api/channels/${channelId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', currentServerId, currentChannelId] })
      setContextMenu(null)
    },
  })

  // Update Buddy policy mutation.
  const updateBuddyPolicy = useMutation({
    mutationFn: ({
      channelId,
      agentId,
      mode,
      config,
    }: {
      channelId: string
      agentId: string
      mode: string
      config?: {
        replyToUsers?: string[]
        keywords?: string[]
        mentionOnly?: boolean
        replyToBuddy?: boolean
        maxBuddyTurns?: number
        smartReply?: boolean
      }
    }) =>
      fetchApi(`/api/channels/${channelId}/agents/${agentId}/policy`, {
        method: 'PUT',
        body: JSON.stringify({ mode, config }),
      }),
  })

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, member: Member) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, member })
  }, [])

  // Close context menu on click outside
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // Determine if current user can kick members
  const currentMember = useMemo(
    () => members.find((member) => member.userId === currentUser?.id),
    [currentUser?.id, members],
  )
  const canKick = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  const onlineMembers = useMemo(
    () => members.filter((member) => memberPresenceStatus(member) !== 'offline'),
    [members],
  )
  const offlineMembers = useMemo(
    () => members.filter((member) => memberPresenceStatus(member) === 'offline'),
    [members],
  )

  const memberContent = useMemo(() => {
    const renderMemberGroup = (label: string, items: Member[], opts?: { flat?: boolean }) => {
      if (items.length === 0) return null
      const isFlat = opts?.flat ?? false
      return (
        <div className="mb-4">
          <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted px-4 mb-2">
            {label} — {items.length}
          </h4>
          {(() => {
            const buddyOwnerByUserId = new Map<string, string>()
            const buddyMetaByUserId = new Map<
              string,
              {
                ownerName?: string
                ownerId?: string
                ownerAvatarUrl?: string | null
                description?: string
                totalOnlineSeconds?: number
              }
            >()
            for (const member of items) {
              if (!member.user?.isBot) continue
              const buddyUserId = member.userId
              const ownerId = member.agent?.ownerId ?? member.creator?.uid
              const totalOnlineSeconds =
                typeof member.totalOnlineSeconds === 'number'
                  ? member.totalOnlineSeconds
                  : typeof member.agent?.totalOnlineSeconds === 'number'
                    ? member.agent.totalOnlineSeconds
                    : undefined
              if (ownerId) buddyOwnerByUserId.set(buddyUserId, ownerId)
              buddyMetaByUserId.set(buddyUserId, {
                ownerName: member.creator?.nickname ?? member.creator?.username ?? undefined,
                ownerId: ownerId ?? undefined,
                ownerAvatarUrl: member.creator?.avatarUrl ?? null,
                description:
                  typeof member.agent?.config?.description === 'string'
                    ? member.agent.config.description
                    : undefined,
                totalOnlineSeconds,
              })
            }
            for (const a of buddyAgents) {
              const buddyUserId = a.botUser?.id
              if (buddyUserId) buddyOwnerByUserId.set(buddyUserId, a.ownerId)
              if (buddyUserId) {
                const ownerName = a.owner?.displayName ?? a.owner?.username ?? undefined
                const description =
                  typeof a.config?.description === 'string' ? a.config.description : undefined
                const existing = buddyMetaByUserId.get(buddyUserId)
                buddyMetaByUserId.set(buddyUserId, {
                  ownerName: ownerName ?? existing?.ownerName,
                  ownerId: a.ownerId ?? existing?.ownerId,
                  ownerAvatarUrl: a.owner?.avatarUrl ?? existing?.ownerAvatarUrl ?? null,
                  description: description ?? existing?.description,
                  totalOnlineSeconds: a.totalOnlineSeconds ?? existing?.totalOnlineSeconds,
                })
              }
            }

            const membersByUserId = new Map(items.map((m) => [m.userId, m]))
            const ownerChildren = new Map<string, Member[]>()
            const orphanBuddies: Member[] = []

            for (const m of items) {
              if (!m.user?.isBot) continue
              const ownerId = buddyOwnerByUserId.get(m.userId)
              if (ownerId && membersByUserId.has(ownerId)) {
                ownerChildren.set(ownerId, [...(ownerChildren.get(ownerId) ?? []), m])
              } else {
                orphanBuddies.push(m)
              }
            }

            const topLevelMembers = items.filter((m) => !m.user?.isBot)

            const renderMemberRow = (member: Member, rowOpts?: { child?: boolean }) => {
              const buddyMeta = member.user?.isBot
                ? buddyMetaByUserId.get(member.user.id)
                : undefined
              const buddyItem = memberToBuddyItem(member, buddyMeta)
              if (!buddyItem) return null

              return (
                <div key={member.id} className={`relative ${rowOpts?.child ? 'pl-4' : 'mx-2'}`}>
                  {rowOpts?.child && (
                    <div className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 rounded-full bg-border-subtle/70" />
                  )}
                  <div onContextMenu={(e) => handleContextMenu(e, member)}>
                    <BuddyListItem
                      buddy={buddyItem}
                      showHoverCard={true}
                      clickable={true}
                      showBotBadge={true}
                      showRoleBadge={true}
                      showOnlineRank={true}
                      onlineRankCompact={true}
                    />
                  </div>
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
                        <div className="relative ml-8 mt-1 space-y-1 pl-1 before:absolute before:left-0 before:top-0 before:bottom-3 before:w-px before:rounded-full before:bg-border-subtle/50">
                          {children.map((child) => renderMemberRow(child, { child: true }))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {/* In flat mode, render all Buddies without tree structure */}
                {isFlat
                  ? items.filter((m) => m.user?.isBot).map((m) => renderMemberRow(m))
                  : orphanBuddies.map((member) => renderMemberRow(member, { child: true }))}
              </>
            )
          })()}
        </div>
      )
    }

    return (
      <>
        {/* Action buttons - hidden when channel is archived */}
        {!channel?.isArchived && (
          <div className="px-4 pb-4 pt-2 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setInviteInitialTab('buddies')
                setShowInvitePanel(true)
              }}
              className="flex items-center justify-center gap-2 px-4 py-[14px] rounded-full text-[13px] font-black text-[#050508] uppercase tracking-[0.05em] transition-all duration-500 w-full bouncy"
              style={{
                background: 'linear-gradient(135deg, #F8E71C, #ffb300)',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow:
                  '0 10px 25px rgba(248, 231, 28, 0.35), inset 0 2px 4px rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(12px)',
              }}
              title={t('channel.addAgent')}
            >
              <PawPrint size={14} className="text-[#050508]" />
              <span className="truncate uppercase tracking-widest">{t('channel.addAgent')}</span>
            </button>
          </div>
        )}
        {renderMemberGroup(t('member.groupOnline'), onlineMembers)}
        {renderMemberGroup(t('member.groupOffline'), offlineMembers, { flat: true })}
        {members.length === 0 && (
          <p className="text-text-muted text-sm px-4 py-2">{t('member.noMembers')}</p>
        )}
      </>
    )
  }, [
    buddyAgents,
    channel?.isArchived,
    handleContextMenu,
    members.length,
    offlineMembers,
    onlineMembers,
    t,
  ])

  return (
    <>
      {/* Desktop member list — hidden when a right-side auxiliary panel is open */}
      {!rightPanelOpen && (
        <GlassPanel className="w-[240px] overflow-hidden overflow-y-auto shrink-0 pt-4 hidden lg:block h-full scrollbar-hidden">
          {memberContent}
        </GlassPanel>
      )}

      {/* Mobile member list overlay */}
      {mobileMemberListOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-bg-deep/60 backdrop-blur-sm"
            onClick={closeMobileMemberList}
          />
          <GlassPanel className="ml-auto relative z-10 w-64 h-full overflow-y-auto animate-slide-in-right scrollbar-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle backdrop-blur-xl">
              <h3 className="font-bold text-text-primary text-sm">{t('member.groupOnline')}</h3>
              <button
                onClick={closeMobileMemberList}
                className="text-text-muted hover:text-text-primary transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="pt-2">{memberContent}</div>
          </GlassPanel>
        </div>
      )}

      {/* Invite Panel */}
      {showInvitePanel && currentServerId && (
        <InvitePanel
          serverId={currentServerId}
          channelId={currentChannelId}
          initialTab={inviteInitialTab}
          onClose={() => setShowInvitePanel(false)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <BuddyContextMenu
          contextMenu={contextMenu}
          closeContextMenu={closeContextMenu}
          setProfileMember={setProfileMember}
          setContextMenu={setContextMenu}
          activeChannelId={currentChannelId}
          activeServerId={currentServerId}
          buddyAgents={buddyAgents}
          members={members}
          updateBuddyPolicy={updateBuddyPolicy}
          removeBuddyFromChannel={removeBuddyFromChannel}
          kickMember={kickMember}
          canKick={canKick}
          currentUser={currentUser}
          t={t}
        />
      )}

      {/* Profile panel modal */}
      {profileMember?.user && (
        <div
          className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
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
              ownerId={
                profileMember.user.isBot
                  ? buddyAgents.find((a) => a.botUser?.id === profileMember.user?.id)?.ownerId
                  : undefined
              }
              ownerAvatarUrl={
                profileMember.user.isBot
                  ? (buddyAgents.find((a) => a.botUser?.id === profileMember.user?.id)?.owner
                      ?.avatarUrl ?? null)
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
              totalOnlineSeconds={
                profileMember.user.isBot
                  ? buddyAgents.find((a) => a.botUser?.id === profileMember.user?.id)
                      ?.totalOnlineSeconds
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </>
  )
})

/* ── Buddy Context Menu ──────────────────── */

function BuddyContextMenu({
  contextMenu,
  closeContextMenu,
  setProfileMember,
  setContextMenu,
  activeChannelId,
  activeServerId,
  buddyAgents,
  members,
  updateBuddyPolicy,
  removeBuddyFromChannel,
  kickMember,
  canKick,
  currentUser,
  t,
}: {
  contextMenu: { x: number; y: number; member: Member }
  closeContextMenu: () => void
  setProfileMember: (m: Member | null) => void
  setContextMenu: (m: null) => void
  activeChannelId: string | null
  activeServerId: string | null
  buddyAgents: BuddyAgent[]
  members: Member[]
  updateBuddyPolicy: ReturnType<
    typeof useMutation<
      unknown,
      Error,
      {
        channelId: string
        agentId: string
        mode: string
        config?: {
          replyToUsers?: string[]
          keywords?: string[]
          mentionOnly?: boolean
          replyToBuddy?: boolean
          maxBuddyTurns?: number
          smartReply?: boolean
        }
      }
    >
  >
  removeBuddyFromChannel: ReturnType<
    typeof useMutation<unknown, Error, { channelId: string; userId: string }>
  >
  kickMember: ReturnType<typeof useMutation<unknown, Error, { serverId: string; userId: string }>>
  canKick: boolean
  currentUser: { id: string } | null
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const [policyOpen, setPolicyOpen] = useState(false)
  const [customPolicyOpen, setCustomPolicyOpen] = useState(false)
  const [customReplyToUsers, setCustomReplyToUsers] = useState<string[]>([])
  const [customKeywords, setCustomKeywords] = useState('')
  const [customMentionOnly, setCustomMentionOnly] = useState(false)
  // Buddy interaction settings
  const [customReplyToBuddy, setCustomReplyToBuddy] = useState(false)
  const [customMaxBuddyTurns, setCustomMaxBuddyTurns] = useState(3)
  const [customSmartReply, setCustomSmartReply] = useState(true)
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const [userPickerSearch, setUserPickerSearch] = useState('')
  const queryClient = useQueryClient()
  const menuRef = useRef<HTMLDivElement>(null)
  const policyRowRef = useRef<HTMLDivElement>(null)
  const policyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isBuddy = contextMenu.member.user?.isBot
  const agent = isBuddy
    ? buddyAgents.find((a) => a.botUser?.id === contextMenu.member.user?.id)
    : null

  // Use the hook for accurate position calculation
  const position = useContextMenuPosition(contextMenu.x, contextMenu.y, menuRef, 180)

  // Fetch current policy for the Buddy in this channel.
  const { data: currentPolicy } = useQuery({
    queryKey: ['agent-policy', activeChannelId, agent?.id],
    queryFn: () =>
      fetchApi<{
        mentionOnly: boolean
        listen: boolean
        reply: boolean
        config: Record<string, unknown>
      }>(`/api/channels/${activeChannelId}/agents/${agent!.id}/policy`),
    enabled: !!isBuddy && !!activeChannelId && !!agent,
  })

  const policyConfig = (currentPolicy?.config ?? {}) as BuddyPolicyConfig
  const collaborationEnabled = policyConfig.replyToBuddy === true
  const hasCustomRules = Boolean(
    policyConfig.replyToUsers?.length ||
      policyConfig.keywords?.length ||
      policyConfig.smartReply === false,
  )

  const currentTriggerMode: ReplyTriggerMode = (() => {
    if (!currentPolicy) return 'replyAll'
    if (!currentPolicy.reply) return 'disabled'
    if (currentPolicy.mentionOnly) return 'mentionOnly'
    return 'replyAll'
  })()

  const updateTriggerMode = (triggerMode: ReplyTriggerMode) => {
    if (!activeChannelId || !agent) return
    const mode =
      collaborationEnabled || hasCustomRules
        ? 'custom'
        : triggerMode === 'disabled'
          ? 'disabled'
          : triggerMode
    const config =
      mode === 'custom'
        ? {
            ...(hasCustomRules && policyConfig.replyToUsers?.length
              ? { replyToUsers: policyConfig.replyToUsers }
              : {}),
            ...(hasCustomRules && policyConfig.keywords?.length
              ? { keywords: policyConfig.keywords }
              : {}),
            mentionOnly: triggerMode === 'mentionOnly',
            ...(collaborationEnabled
              ? {
                  replyToBuddy: true,
                  maxBuddyTurns: policyConfig.maxBuddyTurns ?? 3,
                }
              : {}),
            ...(policyConfig.smartReply === false ? { smartReply: false } : {}),
          }
        : undefined
    updateBuddyPolicy.mutate(
      { channelId: activeChannelId, agentId: agent.id, mode, config },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ['agent-policy', activeChannelId, agent.id],
          })
          setContextMenu(null)
        },
      },
    )
  }

  const toggleCollaboration = () => {
    if (!activeChannelId || !agent) return
    const nextEnabled = !collaborationEnabled
    const triggerMode =
      currentTriggerMode === 'disabled' && nextEnabled ? 'mentionOnly' : currentTriggerMode
    const nextHasCustomRules = Boolean(
      policyConfig.replyToUsers?.length ||
        policyConfig.keywords?.length ||
        policyConfig.smartReply === false,
    )
    const mode =
      triggerMode === 'disabled' && !nextEnabled
        ? 'disabled'
        : nextEnabled || nextHasCustomRules
          ? 'custom'
          : triggerMode
    const config =
      mode === 'custom'
        ? {
            ...(policyConfig.replyToUsers?.length
              ? { replyToUsers: policyConfig.replyToUsers }
              : {}),
            ...(policyConfig.keywords?.length ? { keywords: policyConfig.keywords } : {}),
            mentionOnly: triggerMode === 'mentionOnly',
            ...(nextEnabled
              ? {
                  replyToBuddy: true,
                  maxBuddyTurns: policyConfig.maxBuddyTurns ?? 3,
                }
              : {}),
            ...(policyConfig.smartReply === false ? { smartReply: false } : {}),
          }
        : undefined
    updateBuddyPolicy.mutate(
      { channelId: activeChannelId, agentId: agent.id, mode, config },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ['agent-policy', activeChannelId, agent.id],
          })
          setContextMenu(null)
        },
      },
    )
  }

  // Hover handlers for policy submenu
  const handlePolicyEnter = useCallback(() => {
    if (policyTimeoutRef.current) clearTimeout(policyTimeoutRef.current)
    setPolicyOpen(true)
  }, [])
  const handlePolicyLeave = useCallback(() => {
    policyTimeoutRef.current = setTimeout(() => setPolicyOpen(false), 150)
  }, [])

  useEffect(() => {
    return () => {
      if (policyTimeoutRef.current) clearTimeout(policyTimeoutRef.current)
    }
  }, [])

  // Calculate submenu position to avoid window overflow
  const getSubmenuStyle = (): React.CSSProperties => {
    if (!policyRowRef.current) return { left: '100%', top: 0 }
    const rect = policyRowRef.current.getBoundingClientRect()
    const submenuWidth = 180
    const submenuHeight = 260
    const spaceRight = window.innerWidth - rect.right
    const spaceBelow = window.innerHeight - rect.top
    return {
      ...(spaceRight >= submenuWidth ? { left: '100%' } : { right: '100%' }),
      ...(spaceBelow < submenuHeight ? { bottom: 0 } : { top: 0 }),
    }
  }

  // Determine which actions to show
  const isSelf = contextMenu.member.userId === currentUser?.id
  const isOwner = contextMenu.member.role === 'owner'
  // Check if current user is the Buddy's owner
  const isBuddyOwner = isBuddy && agent && currentUser?.id === agent.ownerId
  const isBuddyPolicyManager = Boolean(
    isBuddy &&
      agent &&
      currentUser &&
      (agent.ownerId === currentUser.id ||
        agent.accessRole === 'owner' ||
        agent.accessRole === 'tenant'),
  )
  const showPolicySubmenu = Boolean(isBuddy && activeChannelId && agent && isBuddyPolicyManager)
  // Only Buddy owner, server owner, or admin can remove a Buddy from a channel.
  const showRemoveFromChannel =
    isBuddy && activeChannelId && !isSelf && !isOwner && (canKick || isBuddyOwner)
  const showKickFromServer =
    !isSelf &&
    !isOwner &&
    ((isBuddy && !activeChannelId && (canKick || isBuddyOwner)) || (!isBuddy && canKick))
  const hasDestructiveAction = showRemoveFromChannel || showKickFromServer

  return (
    <>
      <div
        className="fixed inset-0 z-[80]"
        onClick={closeContextMenu}
        onContextMenu={(e) => {
          e.preventDefault()
          closeContextMenu()
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[81] bg-bg-primary/95 backdrop-blur-xl border border-border-subtle rounded-[24px] shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 min-w-[180px]"
        style={{ left: position.x, top: position.y }}
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
          <User size={14} />
          {t('member.viewProfile')}
        </button>

        {/* Policy submenu — only for Buddies in a channel */}
        {showPolicySubmenu && (
          <>
            <div className="h-px bg-border-subtle my-1" />
            <div
              ref={policyRowRef}
              className="relative"
              onMouseEnter={handlePolicyEnter}
              onMouseLeave={handlePolicyLeave}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={policyOpen}
                onClick={() => setPolicyOpen((open) => !open)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
              >
                <MessageSquare size={14} />
                <span className="flex-1 text-left">{t('member.replyPolicy')}</span>
                <span className="text-[11px] text-text-muted ml-1">▸</span>
              </button>
              {policyOpen && (
                <div
                  className="absolute ml-1 bg-bg-primary/95 backdrop-blur-xl border border-border-subtle rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 min-w-[180px] z-[82]"
                  style={getSubmenuStyle()}
                >
                  <div className="px-3 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {t('member.policyTriggerGroup')}
                  </div>
                  {/* Reply All */}
                  <button
                    type="button"
                    onClick={() => updateTriggerMode('replyAll')}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                  >
                    {currentTriggerMode === 'replyAll' ? (
                      <Check size={14} className="text-success" />
                    ) : (
                      <span className="w-[14px]" />
                    )}
                    {t('member.policyReplyAll')}
                  </button>
                  {/* Mention Only */}
                  <button
                    type="button"
                    onClick={() => updateTriggerMode('mentionOnly')}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                  >
                    {currentTriggerMode === 'mentionOnly' ? (
                      <Check size={14} className="text-success" />
                    ) : (
                      <span className="w-[14px]" />
                    )}
                    {t('member.policyMentionOnly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateTriggerMode('disabled')}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                  >
                    {currentTriggerMode === 'disabled' ? (
                      <Check size={14} className="text-danger" />
                    ) : (
                      <span className="w-[14px]" />
                    )}
                    <span className={currentTriggerMode === 'disabled' ? 'text-danger' : ''}>
                      {t('member.policyDisabled')}
                    </span>
                  </button>
                  <div className="h-px bg-border-subtle my-1" />
                  <div className="px-3 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {t('member.policyCollaborationGroup')}
                  </div>
                  {/* Collaboration */}
                  <button
                    type="button"
                    onClick={toggleCollaboration}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                  >
                    {collaborationEnabled ? (
                      <Check size={14} className="text-success" />
                    ) : (
                      <span className="w-[14px]" />
                    )}
                    {t('member.policyCollaboration')}
                  </button>
                  <div className="h-px bg-border-subtle my-1" />
                  {/* Custom Rules */}
                  <button
                    type="button"
                    onClick={() => {
                      // Pre-fill with current config (persisted values)
                      const cfg = currentPolicy?.config as
                        | {
                            replyToUsers?: string[]
                            keywords?: string[]
                            mentionOnly?: boolean
                            replyToBuddy?: boolean
                            maxBuddyTurns?: number
                            smartReply?: boolean
                          }
                        | undefined
                      setCustomReplyToUsers(cfg?.replyToUsers ?? [])
                      setCustomKeywords(cfg?.keywords?.join('\n') ?? '')
                      setCustomMentionOnly(cfg?.mentionOnly ?? false)
                      setCustomReplyToBuddy(cfg?.replyToBuddy ?? false)
                      setCustomMaxBuddyTurns(cfg?.maxBuddyTurns ?? 3)
                      setCustomSmartReply(cfg?.smartReply ?? true)
                      setCustomPolicyOpen(true)
                      setPolicyOpen(false)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                  >
                    {hasCustomRules ? (
                      <Check size={14} className="text-success" />
                    ) : (
                      <span className="w-[14px]" />
                    )}
                    {t('member.policyCustom')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Remove / kick actions */}
        {hasDestructiveAction && (
          <>
            <div className="h-px bg-border-subtle my-1" />
            {/* For Buddies in a channel: show "Remove from Channel" */}
            {showRemoveFromChannel && (
              <button
                type="button"
                onClick={async () => {
                  const name =
                    contextMenu.member.user?.displayName ?? contextMenu.member.user?.username
                  const ok = await useConfirmStore.getState().confirm({
                    title: t('member.removeFromChannel'),
                    message: t('member.removeFromChannelConfirm', { name }),
                  })
                  if (ok) {
                    removeBuddyFromChannel.mutate({
                      channelId: activeChannelId!,
                      userId: contextMenu.member.userId,
                    })
                  }
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-danger/10 transition"
              >
                <Trash2 size={14} />
                {t('member.removeFromChannel')}
              </button>
            )}
            {/* Kick from server — admin+ only */}
            {showKickFromServer && (
              <button
                type="button"
                onClick={async () => {
                  if (!activeServerId) return
                  const name =
                    contextMenu.member.user?.displayName ?? contextMenu.member.user?.username
                  const ok = await useConfirmStore.getState().confirm({
                    title: isBuddy ? t('member.removeBuddy') : t('member.kickMember'),
                    message: isBuddy
                      ? t('member.removeBuddyConfirm', { name })
                      : t('member.kickConfirm', { name }),
                  })
                  if (ok) {
                    kickMember.mutate({
                      serverId: activeServerId,
                      userId: contextMenu.member.userId,
                    })
                  }
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-danger/10 transition"
              >
                <LogOut size={14} />
                {isBuddy ? t('member.removeBuddy') : t('member.kickMember')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Custom policy modal */}
      {customPolicyOpen &&
        activeChannelId &&
        agent &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-[90]"
            onClick={() => setCustomPolicyOpen(false)}
          >
            <div
              className="bg-bg-primary/95 backdrop-blur-xl rounded-[40px] p-5 w-[420px] max-w-[90vw] border border-border-subtle shadow-[0_32px_120px_rgba(0,0,0,0.5)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-text-primary">
                  {t('member.policyCustomTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomPolicyOpen(false)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              {/* @mention only toggle */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customMentionOnly}
                    onChange={(e) => setCustomMentionOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-border-subtle bg-bg-primary text-primary focus:ring-primary/50"
                  />
                  <span className="text-xs font-black text-text-secondary">
                    {t('member.policyMentionOnly')}
                  </span>
                </label>
                <p className="text-[11px] text-text-muted mt-1 ml-6">
                  {t('member.policyMentionOnlyDesc')}
                </p>
              </div>

              {/* Reply to specific users — multi-select */}
              <div className="mb-4">
                <label className="block text-xs font-black text-text-secondary mb-1.5">
                  {t('member.policyReplyToUsers')}
                </label>
                <p className="text-[11px] text-text-muted mb-1.5">
                  {t('member.policyReplyToUsersDesc')}
                </p>
                {/* Selected user chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {customReplyToUsers.map((username) => {
                    const member = members.find((m) => m.user?.username === username)
                    return (
                      <span
                        key={username}
                        className="inline-flex items-center gap-1 bg-primary/20 text-primary text-xs px-2 py-1 rounded-full"
                      >
                        {member?.user?.avatarUrl && (
                          <img
                            src={member.user.avatarUrl}
                            alt=""
                            className="w-3.5 h-3.5 rounded-full"
                          />
                        )}
                        {member?.user?.displayName ?? username}
                        <button
                          type="button"
                          onClick={() =>
                            setCustomReplyToUsers((prev) => prev.filter((u) => u !== username))
                          }
                          className="ml-0.5 hover:text-danger transition"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    )
                  })}
                </div>
                {/* User picker dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserPickerOpen(!userPickerOpen)}
                    className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-muted hover:border-primary/50 transition text-left"
                  >
                    {t('member.policySelectUsers')}
                  </button>
                  {userPickerOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-tertiary border border-border-subtle rounded-lg shadow-xl z-10 max-h-[200px] overflow-y-auto">
                      <div className="sticky top-0 bg-bg-tertiary p-1.5 border-b border-border-subtle">
                        <input
                          type="text"
                          value={userPickerSearch}
                          onChange={(e) => setUserPickerSearch(e.target.value)}
                          placeholder={t('member.policySearchUsers')}
                          className="w-full bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
                        />
                      </div>
                      {members
                        .filter((m) => !m.user?.isBot && m.user?.username)
                        .filter((m) => {
                          if (!userPickerSearch) return true
                          const q = userPickerSearch.toLowerCase()
                          return (
                            m.user!.username.toLowerCase().includes(q) ||
                            m.user!.displayName?.toLowerCase().includes(q)
                          )
                        })
                        .map((m) => {
                          const selected = customReplyToUsers.includes(m.user!.username)
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              onClick={() => {
                                setCustomReplyToUsers((prev) =>
                                  selected
                                    ? prev.filter((u) => u !== m.user!.username)
                                    : [...prev, m.user!.username],
                                )
                              }}
                              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-bg-primary/50 transition"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                  selected ? 'bg-primary border-primary' : 'border-border-subtle'
                                }`}
                              >
                                {selected && <Check size={10} className="text-white" />}
                              </div>
                              {m.user?.avatarUrl && (
                                <img
                                  src={m.user.avatarUrl}
                                  alt=""
                                  className="w-5 h-5 rounded-full flex-shrink-0"
                                />
                              )}
                              <span className="text-text-primary truncate">
                                {m.user?.displayName ?? m.user?.username}
                              </span>
                              <span className="text-text-muted text-xs ml-auto">
                                @{m.user?.username}
                              </span>
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>
              </div>

              {/* Keyword triggers */}
              <div className="mb-5">
                <label className="block text-xs font-black text-text-secondary mb-1.5">
                  {t('member.policyKeywords')}
                </label>
                <p className="text-[11px] text-text-muted mb-1.5">
                  {t('member.policyKeywordsDesc')}
                </p>
                <textarea
                  value={customKeywords}
                  onChange={(e) => setCustomKeywords(e.target.value)}
                  placeholder={t('member.policyKeywordsPlaceholder')}
                  className="w-full bg-bg-primary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/50 resize-none"
                  rows={3}
                />
              </div>

              {/* Buddy Interaction Settings */}
              <div className="mb-5 pt-3 border-t border-border-subtle">
                <h4 className="text-xs font-bold text-text-secondary mb-3">
                  {t('member.policyBuddyInteraction')}
                </h4>

                {/* Smart Reply - skip if targeting others */}
                <div className="mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customSmartReply}
                      onChange={(e) => setCustomSmartReply(e.target.checked)}
                      className="w-4 h-4 rounded border-border-subtle bg-bg-primary text-primary focus:ring-primary/50"
                    />
                    <span className="text-xs font-black text-text-secondary">
                      {t('member.policySmartReply')}
                    </span>
                  </label>
                  <p className="text-[11px] text-text-muted mt-1 ml-6">
                    {t('member.policySmartReplyDesc')}
                  </p>
                </div>

                {/* Reply to other Buddies */}
                <div className="mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customReplyToBuddy}
                      onChange={(e) => setCustomReplyToBuddy(e.target.checked)}
                      className="w-4 h-4 rounded border-border-subtle bg-bg-primary text-primary focus:ring-primary/50"
                    />
                    <span className="text-xs font-black text-text-secondary">
                      {t('member.policyReplyToBuddy')}
                    </span>
                  </label>
                  <p className="text-[11px] text-text-muted mt-1 ml-6">
                    {t('member.policyReplyToBuddyDesc')}
                  </p>
                </div>

                {/* Max Buddy turns */}
                {customReplyToBuddy && (
                  <div className="ml-6">
                    <label className="block text-xs font-black text-text-secondary mb-1">
                      {t('member.policyMaxBuddyTurns')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={8}
                        value={customMaxBuddyTurns}
                        onChange={(e) => setCustomMaxBuddyTurns(parseInt(e.target.value, 10))}
                        className="flex-1 h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-xs text-text-primary font-mono w-6 text-center">
                        {customMaxBuddyTurns}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">
                      {t('member.policyMaxBuddyTurnsDesc')}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const replyToUsers = customReplyToUsers
                  const keywords = customKeywords
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                  updateBuddyPolicy.mutate(
                    {
                      channelId: activeChannelId,
                      agentId: agent.id,
                      mode: 'custom',
                      config: {
                        ...(replyToUsers.length ? { replyToUsers } : {}),
                        ...(keywords.length ? { keywords } : {}),
                        ...(customMentionOnly ? { mentionOnly: true } : {}),
                        ...(customReplyToBuddy
                          ? { replyToBuddy: true, maxBuddyTurns: customMaxBuddyTurns }
                          : {}),
                        ...(customSmartReply !== true ? { smartReply: false } : {}),
                      },
                    },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: ['agent-policy', activeChannelId, agent.id],
                        })
                        setCustomPolicyOpen(false)
                        setContextMenu(null)
                      },
                    },
                  )
                }}
                disabled={updateBuddyPolicy.isPending}
                className="w-full px-4 py-2.5 bg-primary hover:bg-primary/80 text-white rounded-lg transition font-black text-sm disabled:opacity-50"
              >
                {t('member.policySave')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
