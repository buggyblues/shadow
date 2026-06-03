import { Button, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Copy, PawPrint, Search, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { copyToClipboard } from '../../../lib/clipboard'
import { showToast } from '../../../lib/toast'
import { QuickCreateBuddyModal } from '../../buddy-management/quick-create-buddy-modal'
import {
  type Agent,
  getAgentAllowedServerIds,
  getAgentBuddyMode,
} from '../../buddy-management/types'
import { UserAvatar } from '../avatar'
import { BuddyInfo, type BuddyListItemData } from '../buddy-list-item'
import { useConfirmStore } from '../confirm-dialog'

// Types
interface ServerMember {
  userId: string
  id: string
  role: 'owner' | 'admin' | 'member'
  nickname?: string | null
  user?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot: boolean
    status: 'online' | 'idle' | 'dnd' | 'offline'
  } | null
  membershipTier?: string | null
  membershipLevel?: number | null
  isMember?: boolean
  totalOnlineSeconds?: number
}

interface BuddyAgent {
  id: string
  userId: string
  ownerId: string
  status: string
  lastHeartbeat?: string | null
  totalOnlineSeconds?: number
  createdAt?: string
  updatedAt?: string
  owner?: {
    id: string
    userId: string
    username: string
    displayName: string | null
    avatarUrl?: string | null
  } | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  config?: {
    description?: string
    buddyTag?: string
    buddyMode?: 'private' | 'shareable'
    allowedServerIds?: string[]
  }
  accessRole?: 'owner' | 'tenant'
}

type InviteStatus = 'online' | 'idle' | 'dnd' | 'offline'

type AddAgentsResponse = {
  added?: Array<string | { agentId: string }>
  failed?: Array<{ agentId: string; error: string }>
  results?: Array<{ agentId: string; success: boolean; error?: string }>
}

interface InvitePanelMember {
  key: string
  uid: string
  nickname: string
  username: string
  avatar: string | null
  status: InviteStatus
  isBot: boolean
  inServer: boolean
  inChannel: boolean
  membershipTier?: string | null
  membershipLevel?: number | null
  totalOnlineSeconds?: number
  lastHeartbeat?: string | null
  createdAt?: string
  updatedAt?: string
  buddyTag?: string | null
  creator?: {
    uid: string
    nickname: string
  } | null
  source: 'member' | 'buddy'
  canAddToServer: boolean
  canAddToChannel: boolean
  agentId?: string
  accessRole?: 'owner' | 'tenant'
  buddyMode?: 'private' | 'shareable'
  requiresServerAllowlist?: boolean
}

const normalizeStatus = (value: string | undefined): InviteStatus => {
  if (value === 'online' || value === 'idle' || value === 'dnd' || value === 'offline') {
    return value
  }
  if (value === 'running') return 'online'
  return 'offline'
}

const parseAddAgentsResult = (result: AddAgentsResponse | undefined | null) => {
  if (!result) {
    return { added: [] as string[], failed: [] as Array<{ agentId: string; error: string }> }
  }

  if (Array.isArray(result.added) && Array.isArray(result.failed)) {
    return {
      added: result.added
        .map((item) => (typeof item === 'string' ? item : item.agentId))
        .filter(Boolean),
      failed: result.failed,
    }
  }

  const results = Array.isArray(result.results) ? result.results : []
  return {
    added: results.filter((item) => item.success).map((item) => item.agentId),
    failed: results
      .filter((item) => !item.success)
      .map((item) => ({ agentId: item.agentId, error: item.error || 'Failed' })),
  }
}

const getBuddyMode = (agent: BuddyAgent): 'private' | 'shareable' =>
  agent.config?.buddyMode === 'shareable' ? 'shareable' : 'private'

const getBuddyAllowedServerIds = (agent: BuddyAgent): string[] =>
  Array.isArray(agent.config?.allowedServerIds)
    ? agent.config.allowedServerIds.filter((id): id is string => typeof id === 'string')
    : []

const canBuddyJoinServer = (agent: BuddyAgent, serverId: string) => {
  if (getBuddyMode(agent) === 'shareable') return true
  return getBuddyAllowedServerIds(agent).includes(serverId)
}

const statusColors: Record<InviteStatus, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
}

const getInviteTime = (value: string | null | undefined) => {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

const getBuddySortTime = (member: InvitePanelMember) =>
  Math.max(
    getInviteTime(member.lastHeartbeat),
    getInviteTime(member.updatedAt),
    getInviteTime(member.createdAt),
  )

const isInviteBuddyOnline = (member: InvitePanelMember) => member.status !== 'offline'

const sortInviteCandidates = (items: InvitePanelMember[]) =>
  [...items].sort((a, b) => {
    const onlineDelta = Number(isInviteBuddyOnline(b)) - Number(isInviteBuddyOnline(a))
    if (onlineDelta !== 0) return onlineDelta

    const timeDelta = getBuddySortTime(b) - getBuddySortTime(a)
    if (timeDelta !== 0) return timeDelta

    return a.nickname.localeCompare(b.nickname)
  })

function inviteMemberToBuddyItem(member: InvitePanelMember): BuddyListItemData {
  return {
    id: member.agentId ?? member.key,
    userId: member.uid,
    username: member.username,
    displayName: member.nickname,
    avatarUrl: member.avatar,
    status: member.status,
    isBot: true,
    role: 'member',
    ownerId: member.creator?.uid,
    ownerName: member.creator?.nickname,
    totalOnlineSeconds: member.totalOnlineSeconds,
  }
}

function InviteMemberCard({
  member,
  showCheckbox,
  selected,
  onSelect,
  disabled = false,
}: {
  member: InvitePanelMember
  showCheckbox?: boolean
  selected?: boolean
  onSelect?: (memberKey: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const canClick = showCheckbox && !disabled && onSelect
  const statusText = t(`member.${member.status}`)
  const membershipInfo =
    !member.isBot && (member.membershipTier || member.membershipLevel != null)
      ? [
          member.membershipTier
            ? t(`settings.membershipTiers.${member.membershipTier}`, member.membershipTier)
            : null,
          member.membershipLevel != null
            ? t('settings.membershipLevelLabel', { level: member.membershipLevel })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
  const buddyItem = member.isBot ? inviteMemberToBuddyItem(member) : null
  const rowClassName = buddyItem
    ? `flex items-center gap-3 px-2 py-2.5 rounded-xl transition ${
        selected ? 'bg-primary/10' : ''
      } ${canClick ? 'cursor-pointer hover:bg-bg-modifier-hover' : ''} ${
        disabled ? 'opacity-55' : ''
      }`
    : `flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition ${
        selected
          ? 'border-primary/45 bg-primary/10 shadow-[0_0_0_1px_rgba(0,224,255,0.08)_inset]'
          : 'border-border-subtle bg-bg-tertiary/40'
      } ${canClick ? 'cursor-pointer hover:border-primary/30 hover:bg-bg-modifier-hover' : ''} ${
        disabled ? 'opacity-55' : ''
      }`

  return (
    <div
      className={rowClassName}
      onClick={() => {
        if (canClick && onSelect) onSelect(member.key)
      }}
      role={canClick ? 'button' : undefined}
    >
      {showCheckbox && (
        <div
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
            selected
              ? 'border-primary bg-primary text-bg-primary'
              : 'border-border-subtle bg-bg-primary/30'
          }`}
        >
          {selected && <Check size={13} strokeWidth={3} />}
        </div>
      )}

      {buddyItem ? (
        <BuddyInfo
          buddy={buddyItem}
          showBotBadge
          showRoleBadge={false}
          showOnlineRank
          className="min-w-0"
        />
      ) : (
        <>
          <div className="relative shrink-0">
            <UserAvatar
              userId={member.uid}
              avatarUrl={member.avatar || undefined}
              displayName={member.nickname}
              size="sm"
              className="shrink-0"
            />
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-bg-secondary ${statusColors[member.status]}`}
              title={t(`member.${member.status}`)}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-text-primary">{member.nickname}</p>
            </div>
            <p className="mt-1 truncate text-[12px] text-text-muted">
              {[`@${member.username}`, statusText, membershipInfo].filter(Boolean).join(' · ')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// Props
export interface InvitePanelProps {
  serverId: string
  channelId?: string | null
  channelName?: string
  initialTab?: 'members' | 'buddies'
  onClose: () => void
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
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'members' | 'buddies'>(initialTab)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [showOfflineBuddies, setShowOfflineBuddies] = useState(false)
  const [showCreateBuddy, setShowCreateBuddy] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
    queryKey: ['my-buddies-for-invite', 'include-rentals'],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents?includeRentals=true'),
  })

  const { data: channelMembers = [] } = useQuery({
    queryKey: ['channel-members', channelId],
    queryFn: () =>
      fetchApi<Array<{ user: { id: string; isBot?: boolean } }>>(
        `/api/channels/${channelId}/members`,
      ),
    enabled: !!channelId,
  })

  useEffect(() => {
    setActiveTab(initialTab)
    setSelectedCandidateIds(new Set())
    setSearch('')
  }, [initialTab, channelId])

  useEffect(() => {
    if (activeTab === 'members') {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    } else {
      setSearch('')
    }
  }, [activeTab])

  useEffect(() => {
    setShowOfflineBuddies(false)
  }, [activeTab, serverId, channelId])

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

  const searchKeyword = useMemo(() => search.trim().toLowerCase(), [search])
  const joinedUserIds = useMemo(
    () => new Set(channelMembers.map((m) => m.user.id)),
    [channelMembers],
  )
  const serverMemberUserIds = useMemo(
    () => new Set(serverMembers.map((m) => m.userId)),
    [serverMembers],
  )
  const myBuddiesByBotId = useMemo(() => {
    const map = new Map<string, BuddyAgent>()
    for (const agent of myBuddies) {
      if (agent.botUser?.id) {
        map.set(agent.botUser.id, agent)
      }
    }
    return map
  }, [myBuddies])

  const memberCandidates = useMemo<InvitePanelMember[]>(() => {
    return serverMembers
      .filter((m) => !!m.user && !m.user.isBot)
      .filter((m) => {
        if (!searchKeyword) return true
        const displayName = m.nickname || m.user!.displayName || m.user!.username
        return (
          displayName.toLowerCase().includes(searchKeyword) ||
          m.user!.username.toLowerCase().includes(searchKeyword)
        )
      })
      .filter((m) => {
        if (!channelId) return true
        return !joinedUserIds.has(m.user!.id)
      })
      .map((m) => ({
        key: `member:${m.user!.id}`,
        uid: m.userId || m.user!.id,
        nickname: m.nickname || m.user!.displayName || m.user!.username,
        username: m.user!.username,
        avatar: m.user!.avatarUrl,
        status: normalizeStatus(m.user!.status),
        isBot: false,
        inServer: true,
        inChannel: channelId ? joinedUserIds.has(m.user!.id) : false,
        membershipTier: m.membershipTier ?? null,
        membershipLevel: m.membershipLevel ?? null,
        totalOnlineSeconds: m.totalOnlineSeconds,
        buddyTag: null,
        creator: null,
        source: 'member' as const,
        canAddToServer: false,
        canAddToChannel: !!channelId && !joinedUserIds.has(m.user!.id),
        agentId: undefined,
      }))
  }, [serverMembers, searchKeyword, channelId, joinedUserIds])

  const buddyCandidatesOnServer = useMemo<InvitePanelMember[]>(() => {
    if (!channelId) return []
    return serverMembers
      .filter((m) => !!m.user?.isBot && !joinedUserIds.has(m.userId))
      .filter((m) => myBuddiesByBotId.has(m.user!.id))
      .filter((m) => {
        if (!searchKeyword) return true
        const name = (m.user!.displayName || m.user!.username).toLowerCase()
        const desc = (myBuddiesByBotId.get(m.user!.id)?.config?.description ?? '').toLowerCase()
        return name.includes(searchKeyword) || desc.includes(searchKeyword)
      })
      .map((m) => {
        const agent = myBuddiesByBotId.get(m.user!.id)
        const allowedInServer = agent ? canBuddyJoinServer(agent, serverId) : false
        const buddyMode = agent ? getBuddyMode(agent) : undefined
        const requiresServerAllowlist = Boolean(
          agent && buddyMode === 'private' && !allowedInServer && agent.accessRole !== 'tenant',
        )
        return {
          key: `buddy:${agent?.id ?? m.user!.id}`,
          uid: m.userId || m.user!.id,
          nickname: m.user!.displayName || m.user!.username,
          username: m.user!.username,
          avatar: m.user!.avatarUrl,
          status: normalizeStatus(m.user!.status),
          isBot: true,
          inServer: true,
          inChannel: false,
          membershipTier: m.membershipTier ?? null,
          membershipLevel: m.membershipLevel ?? null,
          totalOnlineSeconds: m.totalOnlineSeconds,
          lastHeartbeat: agent?.lastHeartbeat ?? null,
          createdAt: agent?.createdAt,
          updatedAt: agent?.updatedAt,
          buddyTag: agent?.config?.buddyTag ?? null,
          creator: agent?.owner
            ? {
                uid: agent.owner.userId || agent.owner.id,
                nickname: agent.owner.displayName || agent.owner.username,
              }
            : null,
          source: 'buddy' as const,
          canAddToServer: false,
          canAddToChannel: allowedInServer || requiresServerAllowlist,
          agentId: agent?.id,
          accessRole: agent?.accessRole,
          buddyMode,
          requiresServerAllowlist,
        } as InvitePanelMember
      })
      .filter((candidate) => candidate.agentId)
  }, [serverMembers, searchKeyword, joinedUserIds, myBuddiesByBotId, channelId, serverId])

  const buddyCandidatesNew = useMemo<InvitePanelMember[]>(() => {
    return myBuddies
      .filter((agent) => agent.botUser && !serverMemberUserIds.has(agent.botUser.id))
      .filter((agent) => {
        if (!searchKeyword) return true
        const name = (agent.botUser!.displayName || agent.botUser!.username).toLowerCase()
        const desc =
          typeof agent.config?.description === 'string'
            ? agent.config.description.toLowerCase()
            : ''
        return name.includes(searchKeyword) || desc.includes(searchKeyword)
      })
      .map((agent) => {
        const allowedInServer = canBuddyJoinServer(agent, serverId)
        const buddyMode = getBuddyMode(agent)
        const requiresServerAllowlist =
          buddyMode === 'private' && !allowedInServer && agent.accessRole !== 'tenant'
        const canAddAfterAllowlist = allowedInServer || requiresServerAllowlist
        return {
          key: `buddy:${agent.id}`,
          uid: agent.botUser!.id,
          nickname: agent.botUser!.displayName || agent.botUser!.username,
          username: agent.botUser!.username,
          avatar: agent.botUser!.avatarUrl,
          status: normalizeStatus(agent.status),
          isBot: true,
          inServer: false,
          inChannel: false,
          membershipTier: null,
          membershipLevel: null,
          totalOnlineSeconds: agent.totalOnlineSeconds,
          lastHeartbeat: agent.lastHeartbeat ?? null,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          buddyTag: agent.config?.buddyTag ?? null,
          creator: agent.owner
            ? {
                uid: agent.owner.userId || agent.owner.id,
                nickname: agent.owner.displayName || agent.owner.username,
              }
            : null,
          source: 'buddy' as const,
          canAddToServer: canAddAfterAllowlist,
          canAddToChannel: !!channelId && canAddAfterAllowlist,
          agentId: agent.id,
          accessRole: agent.accessRole,
          buddyMode,
          requiresServerAllowlist,
        }
      })
  }, [myBuddies, serverMemberUserIds, searchKeyword, channelId, serverId])

  const buddyCandidates = useMemo(
    () => sortInviteCandidates([...buddyCandidatesOnServer, ...buddyCandidatesNew]),
    [buddyCandidatesOnServer, buddyCandidatesNew],
  )

  const activeCandidates = useMemo(
    () => (activeTab === 'members' ? memberCandidates : buddyCandidates),
    [activeTab, memberCandidates, buddyCandidates],
  )
  const selectedCandidates = useMemo(
    () => activeCandidates.filter((item) => selectedCandidateIds.has(item.key)),
    [activeCandidates, selectedCandidateIds],
  )
  const selectedCount = selectedCandidates.length
  const onlineBuddyCandidates = useMemo(
    () => buddyCandidates.filter(isInviteBuddyOnline),
    [buddyCandidates],
  )
  const offlineBuddyCandidates = useMemo(
    () => buddyCandidates.filter((candidate) => !isInviteBuddyOnline(candidate)),
    [buddyCandidates],
  )
  const shouldShowOfflineBuddies = showOfflineBuddies || Boolean(searchKeyword)
  const visibleCandidates = useMemo(
    () =>
      activeTab === 'buddies'
        ? [...onlineBuddyCandidates, ...(shouldShowOfflineBuddies ? offlineBuddyCandidates : [])]
        : activeCandidates,
    [
      activeCandidates,
      activeTab,
      offlineBuddyCandidates,
      onlineBuddyCandidates,
      shouldShowOfflineBuddies,
    ],
  )

  const isBottomActionDisabled =
    adding ||
    selectedCount === 0 ||
    selectedCandidates.every((item) => !(item.canAddToChannel || item.canAddToServer)) ||
    (activeTab === 'members' && !channelId)

  const copyInviteCode = async () => {
    if (server?.inviteCode) {
      const inviteLink = `${window.location.origin}/app/invite/${server.inviteCode}`
      const didCopy = await copyToClipboard(inviteLink, {
        successMessage: t('common.copied'),
        errorMessage: t('chat.copyFailed'),
      })
      if (didCopy) {
        setCopiedInvite(true)
        setTimeout(() => setCopiedInvite(false), 2000)
      }
    }
  }

  const toggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const removeSelected = (ids: string[]) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  const handleSubmit = async () => {
    if (isBottomActionDisabled) return
    setAdding(true)
    try {
      const successCandidateIds = new Set<string>()

      if (activeTab === 'members') {
        const results = await Promise.allSettled(
          selectedCandidates.map((candidate) => inviteToChannel.mutateAsync(candidate.uid)),
        )
        results.forEach((result, index) => {
          const candidate = selectedCandidates[index]
          if (result.status === 'fulfilled') {
            if (candidate) successCandidateIds.add(candidate.key)
          }
        })
      } else {
        const serverAdded = new Set<string>()
        const allowlistCandidates = selectedCandidates.filter(
          (candidate) => candidate.requiresServerAllowlist && candidate.agentId,
        )

        if (allowlistCandidates.length > 0) {
          const names = allowlistCandidates.map((candidate) => candidate.nickname).join(', ')
          const ok = await useConfirmStore.getState().confirm({
            title: t('member.allowlistPrivateBuddyTitle'),
            message: t('member.allowlistPrivateBuddyMessage', { names }),
            confirmLabel: t('member.allowlistPrivateBuddyConfirm'),
            cancelLabel: t('common.cancel'),
            danger: false,
          })
          if (!ok) return

          await Promise.all(
            allowlistCandidates.map((candidate) => {
              const agent = myBuddies.find((item) => item.id === candidate.agentId)
              if (!agent || !candidate.agentId) return Promise.resolve(null)
              return fetchApi<BuddyAgent>(`/api/agents/${candidate.agentId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  buddyMode: 'private',
                  allowedServerIds: Array.from(
                    new Set([...getBuddyAllowedServerIds(agent), serverId]),
                  ),
                }),
              })
            }),
          )
          showToast(t('member.allowlistPrivateBuddyAdded'), 'success')
        }

        const serverAgentIds = Array.from(
          new Set(
            selectedCandidates
              .filter((candidate) => candidate.canAddToServer && candidate.agentId)
              .map((candidate) => candidate.agentId),
          ),
        ).filter(Boolean) as string[]

        if (serverAgentIds.length > 0) {
          const serverAddResult = await fetchApi<AddAgentsResponse>(
            `/api/servers/${serverId}/agents`,
            {
              method: 'POST',
              body: JSON.stringify({ agentIds: serverAgentIds }),
            },
          )
          const parsed = parseAddAgentsResult(serverAddResult)
          parsed.added.forEach((id) => serverAdded.add(id))
        }

        const needsChannel = selectedCandidates.filter(
          (candidate) =>
            candidate.canAddToChannel &&
            (!candidate.canAddToServer ||
              (candidate.agentId && serverAdded.has(candidate.agentId))),
        )

        const channelResults = needsChannel.length
          ? await Promise.allSettled(
              needsChannel.map((candidate) => inviteToChannel.mutateAsync(candidate.uid)),
            )
          : []

        const channelSuccess = new Set<string>()
        channelResults.forEach((result, index) => {
          const candidate = needsChannel[index]
          if (result.status === 'fulfilled' && candidate) {
            channelSuccess.add(candidate.key)
          }
        })

        selectedCandidates.forEach((candidate) => {
          if (candidate.canAddToServer && candidate.agentId && serverAdded.has(candidate.agentId)) {
            if (!candidate.canAddToChannel || channelSuccess.has(candidate.key)) {
              successCandidateIds.add(candidate.key)
            }
          } else if (candidate.canAddToChannel && channelSuccess.has(candidate.key)) {
            successCandidateIds.add(candidate.key)
          }
        })
      }

      removeSelected(Array.from(successCandidateIds))

      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      if (channelId) {
        queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
      }
      if (activeTab === 'buddies') {
        queryClient.invalidateQueries({ queryKey: ['my-buddies-for-invite'] })
      }

      if (
        successCandidateIds.size > 0 &&
        selectedCandidates.every((candidate) => successCandidateIds.has(candidate.key))
      ) {
        onClose()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleCreatedBuddy = async (agent: Agent) => {
    const botUserId = agent.botUser?.id ?? agent.userId
    setAdding(true)
    try {
      if (getAgentBuddyMode(agent) === 'private') {
        const allowedServerIds = new Set(getAgentAllowedServerIds(agent))
        if (!allowedServerIds.has(serverId)) {
          allowedServerIds.add(serverId)
          await fetchApi<Agent>(`/api/agents/${agent.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              buddyMode: 'private',
              allowedServerIds: Array.from(allowedServerIds),
            }),
          })
        }
      }

      const serverAddResult = await fetchApi<AddAgentsResponse>(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds: [agent.id] }),
      })
      const parsed = parseAddAgentsResult(serverAddResult)
      if (parsed.failed.length > 0 && !parsed.added.includes(agent.id)) {
        throw new Error(parsed.failed[0]?.error || t('common.error'))
      }

      if (channelId) {
        await fetchApi(`/api/channels/${channelId}/members`, {
          method: 'POST',
          body: JSON.stringify({ userId: botUserId }),
        })
      }

      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['my-buddies-for-invite'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      if (channelId) {
        queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
      }
      setShowCreateBuddy(false)
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error'), 'error')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <div className="bg-bg-primary/95 backdrop-blur-xl rounded-[40px] border border-border-subtle shadow-[0_32px_120px_rgba(0,0,0,0.5)] p-6 w-[520px] max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-primary">
                {activeTab === 'members' ? t('channel.inviteMember') : t('channel.addAgent')}
              </h2>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X size={18} />
              </Button>
            </div>

            {activeTab === 'members' && (
              <>
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
                    {copiedInvite ? (
                      <Check size={16} className="text-success" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </Button>
                </div>
              </>
            )}

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
                {t('member.members')} ({memberCandidates.length})
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
                Buddy ({buddyCandidates.length})
              </button>
            </div>

            {activeTab === 'members' && (
              <div className="text-xs text-text-muted mb-2">
                {channelId
                  ? t('member.inviteToChannelDesc', { channel: channelName ?? '' })
                  : t('member.inviteSelectChannelDesc')}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="mb-3">
                <Input
                  type="text"
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('common.search')}
                  icon={Search}
                  className="text-xs py-2"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {activeCandidates.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm">
                  {activeTab === 'members'
                    ? t('member.noInvitable')
                    : myBuddies.length === 0
                      ? t('member.noBuddies')
                      : t('channel.noSearchResults')}
                </div>
              ) : (
                <>
                  {activeTab === 'buddies' && onlineBuddyCandidates.length > 0 && (
                    <p className="px-1 pt-1 pb-1 text-xs font-black text-text-muted">
                      {t('member.groupOnline')} — {onlineBuddyCandidates.length}
                    </p>
                  )}
                  {(activeTab === 'buddies' ? onlineBuddyCandidates : visibleCandidates).map(
                    (candidate) => {
                      const isSelectable = candidate.canAddToChannel || candidate.canAddToServer
                      return (
                        <InviteMemberCard
                          key={candidate.key}
                          member={candidate}
                          showCheckbox
                          selected={selectedCandidateIds.has(candidate.key)}
                          onSelect={isSelectable ? toggleCandidate : undefined}
                          disabled={!isSelectable || adding}
                        />
                      )
                    },
                  )}
                  {activeTab === 'buddies' && offlineBuddyCandidates.length > 0 ? (
                    <>
                      {!searchKeyword && (
                        <button
                          type="button"
                          onClick={() => setShowOfflineBuddies((value) => !value)}
                          className="flex w-full items-center justify-between rounded-2xl border border-border-subtle bg-bg-tertiary/30 px-3.5 py-2.5 text-left text-xs font-semibold text-text-muted transition hover:border-primary/25 hover:bg-bg-modifier-hover hover:text-text-secondary"
                        >
                          <span>
                            {t('member.groupOffline')} — {offlineBuddyCandidates.length}
                          </span>
                          <ChevronDown
                            size={15}
                            className={`transition-transform ${showOfflineBuddies ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                      {shouldShowOfflineBuddies &&
                        offlineBuddyCandidates.map((candidate) => {
                          const isSelectable = candidate.canAddToChannel || candidate.canAddToServer
                          return (
                            <InviteMemberCard
                              key={candidate.key}
                              member={candidate}
                              showCheckbox
                              selected={selectedCandidateIds.has(candidate.key)}
                              onSelect={isSelectable ? toggleCandidate : undefined}
                              disabled={!isSelectable || adding}
                            />
                          )
                        })}
                    </>
                  ) : null}
                </>
              )}
              {activeTab === 'buddies' && (
                <button
                  type="button"
                  onClick={() => setShowCreateBuddy(true)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-4 py-3 text-sm font-black text-bg-deep shadow-[0_10px_32px_rgba(250,204,21,0.24)] transition hover:brightness-105"
                >
                  <PawPrint size={16} strokeWidth={2.8} />
                  {t('member.createBuddy')}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border-subtle">
              <span className="text-xs text-text-muted">
                {t('member.selectedCount', { count: selectedCount })}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isBottomActionDisabled}
                  icon={activeTab === 'buddies' ? PawPrint : UserPlus}
                  loading={adding}
                >
                  {activeTab === 'members' ? t('member.addToChannel') : t('member.addToServer')}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <QuickCreateBuddyModal
        open={showCreateBuddy}
        onClose={() => setShowCreateBuddy(false)}
        onSuccess={handleCreatedBuddy}
      />
    </>
  )
}
