import { Badge, Button, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, PawPrint, Search, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { UserAvatar } from '../avatar'
import { OnlineRank } from '../online-rank'

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
  totalOnlineSeconds?: number
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
  }
}

type InviteStatus = 'online' | 'idle' | 'dnd' | 'offline'

type AddAgentsResponse = {
  added?: string[]
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
  buddyTag?: string | null
  creator?: {
    uid: string
    nickname: string
  } | null
  source: 'member' | 'buddy'
  canAddToServer: boolean
  canAddToChannel: boolean
  agentId?: string
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
      added: result.added,
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

const statusColors: Record<InviteStatus, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
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
  const totalOnlineSeconds = member.totalOnlineSeconds ?? 0

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2 rounded-lg border border-border-subtle bg-bg-tertiary/50 transition ${
        canClick ? 'cursor-pointer hover:bg-bg-modifier-hover' : ''
      } ${disabled ? 'opacity-60' : ''}`}
      onClick={() => {
        if (canClick && onSelect) onSelect(member.key)
      }}
      role={canClick ? 'button' : undefined}
    >
      {showCheckbox && (
        <div
          className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
            selected ? 'border-accent bg-accent/20' : 'border-border-subtle bg-transparent'
          }`}
        >
          {selected && <Check size={12} className="text-accent" />}
        </div>
      )}

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
          <p className="text-sm text-text-primary truncate">{member.nickname}</p>
          {member.isBot && (
            <span className="text-[11px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-[3px] font-black flex items-center gap-0.5 shrink-0">
              <Check size={8} className="text-white" />
              Buddy
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-muted truncate">@{member.username}</p>
        <div className="text-[11px] text-text-muted flex items-center gap-1.5 flex-wrap">
          {totalOnlineSeconds > 0 ? <OnlineRank totalSeconds={totalOnlineSeconds} /> : null}
        </div>

        {member.buddyTag ? (
          <div className="mt-0.5">
            <Badge
              variant="neutral"
              size="xs"
              className="inline-flex normal-case tracking-normal border-border-subtle"
            >
              {t('member.buddyTagLabel')}: {member.buddyTag}
            </Badge>
          </div>
        ) : null}
        {member.creator ? (
          <p className="text-[11px] text-text-muted mt-0.5">
            {t('channel.buddyOwner')} {member.creator.nickname}
          </p>
        ) : null}
      </div>
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'members' | 'buddies'>(initialTab)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
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

  useEffect(() => {
    if (activeTab === 'buddies') {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
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

  const memberCandidates = useMemo(() => {
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

  const buddyCandidatesOnServer = useMemo(() => {
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
          buddyTag: agent?.config?.buddyTag ?? null,
          creator: agent?.owner
            ? {
                uid: agent.owner.userId || agent.owner.id,
                nickname: agent.owner.displayName || agent.owner.username,
              }
            : null,
          source: 'buddy' as const,
          canAddToServer: false,
          canAddToChannel: true,
          agentId: agent?.id,
        } as InvitePanelMember
      })
      .filter((candidate) => candidate.agentId)
  }, [serverMembers, searchKeyword, joinedUserIds, myBuddiesByBotId, channelId])

  const buddyCandidatesNew = useMemo(() => {
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
      .map((agent) => ({
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
        buddyTag: agent.config?.buddyTag ?? null,
        creator: agent.owner
          ? {
              uid: agent.owner.userId || agent.owner.id,
              nickname: agent.owner.displayName || agent.owner.username,
            }
          : null,
        source: 'buddy' as const,
        canAddToServer: true,
        canAddToChannel: !!channelId,
        agentId: agent.id,
      }))
  }, [myBuddies, serverMemberUserIds, searchKeyword, channelId])

  const buddyCandidates = useMemo(
    () => [...buddyCandidatesOnServer, ...buddyCandidatesNew],
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
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
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
    } catch {
      // handled with in-flight disable + modal controls
    } finally {
      setAdding(false)
    }
  }

  const handleGoToBuddySettings = () => {
    navigate({ to: '/settings/buddy' })
    onClose()
  }

  return createPortal(
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
                {copiedInvite ? <Check size={16} className="text-success" /> : <Copy size={16} />}
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

        <div className="text-xs text-text-muted mb-2">
          {activeTab === 'members'
            ? channelId
              ? t('member.inviteToChannelDesc', { channel: channelName ?? '' })
              : t('member.inviteSelectChannelDesc')
            : channelId
              ? t('member.addBuddyToChannelDesc', { channel: channelName ?? '' })
              : t('member.addBuddyToServerDesc')}
        </div>

        <div className="mb-3">
          <Input
            type="text"
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === 'members' ? t('common.search') : t('channel.searchBuddy')}
            icon={Search}
            className="text-xs py-2"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {activeCandidates.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              {activeTab === 'members' ? (
                t('member.noInvitable')
              ) : myBuddies.length === 0 ? (
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
  )
}
