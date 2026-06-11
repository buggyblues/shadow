import { Button, Search as SearchInput } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, X } from 'lucide-react'
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
import { BuddyInfo, type BuddyListItemData } from '../buddy-list-item'
import { useConfirmStore } from '../confirm-dialog'
import {
  normalizeBuddyAgentPresenceStatus,
  PresenceAvatar,
  type PresenceAvatarStatus,
} from '../presence-avatar'

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

type InviteStatus = PresenceAvatarStatus

type AddAgentsResponse = {
  added?: Array<string | { agentId: string }>
  failed?: Array<{ agentId: string; error: string }>
  results?: Array<{ agentId: string; success: boolean; error?: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value: string | null | undefined): value is string =>
  typeof value === 'string' && UUID_RE.test(value)

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
  const canClick = Boolean(showCheckbox && !disabled && onSelect)
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
  const rowClassName = `group flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition ${
    selected ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-bg-modifier-hover'
  } ${canClick ? 'cursor-pointer' : 'cursor-not-allowed'} ${disabled ? 'opacity-55' : ''}`

  return (
    <button
      type="button"
      className={rowClassName}
      onClick={() => {
        if (canClick && onSelect) onSelect(member.key)
      }}
      disabled={!canClick}
    >
      {showCheckbox && (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
            selected
              ? 'border-primary bg-primary text-bg-primary shadow-[0_0_0_3px_rgba(0,224,255,0.16)]'
              : 'border-text-muted/45 bg-bg-tertiary/40 group-hover:border-text-secondary/70'
          }`}
          aria-hidden="true"
        >
          {selected && <Check size={13} strokeWidth={3} />}
        </span>
      )}

      {buddyItem ? (
        <BuddyInfo
          buddy={buddyItem}
          showBotBadge={false}
          showRoleBadge={false}
          showOnlineRank={false}
          className="min-w-0"
        />
      ) : (
        <>
          <PresenceAvatar
            userId={member.uid}
            avatarUrl={member.avatar || undefined}
            displayName={member.nickname}
            status={member.status}
            size="sm"
            className="shrink-0"
          />

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
    </button>
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
  const [showCreateBuddy, setShowCreateBuddy] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Queries
  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () =>
      fetchApi<{ id: string; inviteCode: string; slug: string }>(`/api/servers/${serverId}`),
    enabled: !!serverId,
  })

  const resolveServerUuid = async () => {
    if (isUuid(server?.id)) return server.id
    if (isUuid(serverId)) return serverId
    const resolved = await fetchApi<{ id: string }>(`/api/servers/${serverId}`)
    return resolved.id
  }
  const policyServerId = server?.id ?? serverId

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
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [activeTab])

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
        const allowedInServer = agent ? canBuddyJoinServer(agent, policyServerId) : false
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
  }, [serverMembers, searchKeyword, joinedUserIds, myBuddiesByBotId, channelId, policyServerId])

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
        const allowedInServer = canBuddyJoinServer(agent, policyServerId)
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
          status: normalizeBuddyAgentPresenceStatus({
            agentStatus: agent.status,
            lastHeartbeat: agent.lastHeartbeat,
          }),
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
  }, [myBuddies, serverMemberUserIds, searchKeyword, channelId, policyServerId])

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

  const selectTab = (tab: 'members' | 'buddies') => {
    if (tab === activeTab) return
    setActiveTab(tab)
    setSelectedCandidateIds(new Set())
    setSearch('')
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
          const serverUuid = await resolveServerUuid()
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
                    new Set([...getBuddyAllowedServerIds(agent).filter(isUuid), serverUuid]),
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
      queryClient.invalidateQueries({ queryKey: ['members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members', serverId, channelId] })
      queryClient.invalidateQueries({ queryKey: ['members-buddy-agents', serverId] })
      queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', serverId] })
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
    const buddyUserId = agent.botUser?.id ?? agent.userId
    setAdding(true)
    try {
      if (getAgentBuddyMode(agent) === 'private') {
        const serverUuid = await resolveServerUuid()
        const allowedServerIds = new Set(getAgentAllowedServerIds(agent).filter(isUuid))
        if (!allowedServerIds.has(serverUuid)) {
          allowedServerIds.add(serverUuid)
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
          body: JSON.stringify({ userId: buddyUserId }),
        })
      }

      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members', serverId, channelId] })
      queryClient.invalidateQueries({ queryKey: ['members-buddy-agents', serverId] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', serverId] })
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
          <div className="flex max-h-[80vh] w-[520px] flex-col overflow-hidden rounded-3xl border border-border-subtle bg-bg-primary/95 p-5 shadow-[0_32px_120px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">
                {activeTab === 'members' ? t('channel.inviteMember') : t('channel.addAgent')}
              </h2>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X size={18} />
              </Button>
            </div>

            <div className="mb-3 inline-flex w-fit items-center rounded-xl bg-bg-tertiary/40 p-0.5">
              <button
                type="button"
                onClick={() => selectTab('buddies')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'buddies'
                    ? 'bg-bg-primary text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('common.buddy')}
              </button>
              <button
                type="button"
                onClick={() => selectTab('members')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === 'members'
                    ? 'bg-bg-primary text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('member.members')}
              </button>
            </div>

            {activeTab === 'members' && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-bg-tertiary/30 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
                  {server?.inviteCode
                    ? `${window.location.origin}/app/invite/${server.inviteCode}`
                    : '...'}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyInviteCode}
                  disabled={!server?.inviteCode}
                  title={t('common.copy')}
                >
                  {copiedInvite ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </Button>
              </div>
            )}

            <div className="mb-3">
              <SearchInput
                ref={searchInputRef}
                value={search}
                onChange={setSearch}
                placeholder={t('common.search')}
                className="h-11 border-border-subtle/80 bg-bg-tertiary/45 font-semibold placeholder:text-text-muted/60 focus:border-primary/45 focus:bg-bg-primary/70 focus:ring-2 focus:ring-primary/10"
              />
            </div>

            <div className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1 pr-2">
              {activeCandidates.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-muted">
                  <p>
                    {activeTab === 'members'
                      ? t('member.noInvitable')
                      : myBuddies.length === 0
                        ? t('member.noBuddies')
                        : t('channel.noSearchResults')}
                  </p>
                  {activeTab === 'buddies' && myBuddies.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCreateBuddy(true)}
                      className="mt-3 text-xs font-semibold text-primary transition hover:text-text-primary"
                    >
                      {t('member.createBuddy')}
                    </button>
                  )}
                </div>
              ) : (
                activeCandidates.map((candidate) => {
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
                })
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
