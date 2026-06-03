import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Bot,
  Check,
  ChevronRight,
  Copy,
  Crown,
  MessageSquare,
  MinusCircle,
  PawPrint,
  Search,
  Shield,
  UserPlus,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Avatar } from '../../../../src/components/common/avatar'
import {
  BuddyListItem,
  type BuddyListItemData,
} from '../../../../src/components/common/buddy-list-item'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi } from '../../../../src/lib/api'
import { useAuthStore } from '../../../../src/stores/auth.store'
import {
  fontSize,
  iconSize,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../src/theme'

type OnlineStatus = 'online' | 'idle' | 'dnd' | 'offline'

interface ChannelMember {
  id: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status?: OnlineStatus | string
    isBot?: boolean
  }
}

interface ServerMember {
  userId: string
  id: string
  role: 'owner' | 'admin' | 'member'
  nickname?: string | null
  uid?: string
  avatar?: string | null
  status?: OnlineStatus | string
  membershipTier?: string | null
  membershipLevel?: number | null
  isMember?: boolean
  totalOnlineSeconds?: number
  buddyTag?: string | null
  creator?: {
    uid?: string
    username?: string
    id?: string
    displayName?: string | null
  } | null
  isBot?: boolean
  user?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status?: OnlineStatus | string
    isBot?: boolean
  } | null
}

interface BuddyAgent {
  id: string
  ownerId: string
  accessRole?: 'owner' | 'tenant'
  userId: string
  status: string
  lastHeartbeat?: string | null
  totalOnlineSeconds?: number
  createdAt?: string
  updatedAt?: string
  botUser?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  config?: {
    description?: string
    buddyTag?: string
    buddyMode?: 'private' | 'shareable'
    allowedServerIds?: string[]
  }
  owner?: {
    userId?: string
    id?: string
    username?: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

type PolicyMode = 'replyAll' | 'mentionOnly' | 'disabled'

type AddAgentsResponse = {
  added?: Array<string | { agentId: string }>
  failed?: Array<{ agentId: string; error: string }>
  results?: Array<{ agentId: string; success: boolean; error?: string }>
}

type AddAgentsParsedResult = {
  added: string[]
  failed: Array<{ agentId: string; error: string }>
}

type InviteMode = 'members' | 'buddies'

type InviteCandidate = BuddyListItemData & {
  key: string
  source: 'member' | 'buddy'
  canAddToChannel: boolean
  canAddToServer: boolean
  agentId?: string
}

const getInviteTime = (value: string | null | undefined) => {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

const getBuddySortTime = (candidate: InviteCandidate) =>
  Math.max(
    getInviteTime(candidate.lastHeartbeat),
    getInviteTime(candidate.updatedAt),
    getInviteTime(candidate.createdAt),
  )

const isInviteBuddyOnline = (candidate: InviteCandidate) => candidate.status !== 'offline'

const sortInviteCandidates = (items: InviteCandidate[]) =>
  [...items].sort((a, b) => {
    const onlineDelta = Number(isInviteBuddyOnline(b)) - Number(isInviteBuddyOnline(a))
    if (onlineDelta !== 0) return onlineDelta

    const timeDelta = getBuddySortTime(b) - getBuddySortTime(a)
    if (timeDelta !== 0) return timeDelta

    return a.nickname.localeCompare(b.nickname)
  })

const canBuddyJoinServer = (agent: BuddyAgent, serverId: string | undefined) => {
  if (!serverId) return false
  if (agent.config?.buddyMode === 'shareable') return true
  return Array.isArray(agent.config?.allowedServerIds)
    ? agent.config.allowedServerIds.includes(serverId)
    : false
}

const normalizeStatus = (value?: string | null): OnlineStatus => {
  if (value === 'online' || value === 'idle' || value === 'dnd' || value === 'offline') {
    return value
  }
  if (value === 'running') return 'online'
  return 'offline'
}

const parseAddAgentsResult = (
  result: AddAgentsResponse | null | undefined,
): AddAgentsParsedResult => {
  if (!result) return { added: [], failed: [] }

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

export default function ChannelMembersScreen() {
  const { serverSlug, channelId, autoInvite } = useLocalSearchParams<{
    serverSlug: string
    channelId: string
    autoInvite?: string
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [policySheet, setPolicySheet] = useState<ChannelMember | null>(null)
  const [showInviteSheet, setShowInviteSheet] = useState(autoInvite === '1')
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteMode, setInviteMode] = useState<InviteMode>('members')
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const [showOfflineBuddies, setShowOfflineBuddies] = useState(false)

  // Channel info
  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () =>
      fetchApi<{ id: string; name: string; serverId: string }>(`/api/channels/${channelId}`),
    enabled: !!channelId,
  })

  // Channel members (the actual page data)
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['channel-members', channelId],
    queryFn: () => fetchApi<ChannelMember[]>(`/api/channels/${channelId}/members`),
    enabled: !!channelId,
  })

  // Server members for invite
  const { data: serverMembers = [] } = useQuery({
    queryKey: ['server-members-for-invite', channel?.serverId],
    queryFn: () => fetchApi<ServerMember[]>(`/api/servers/${channel!.serverId}/members`),
    enabled: !!channel?.serverId && showInviteSheet,
  })

  // User's buddy agents for invite
  const { data: myAgents = [] } = useQuery({
    queryKey: ['my-agents-for-invite'],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents'),
    enabled: showInviteSheet,
  })

  // Server info for permissions
  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () =>
      fetchApi<{ id: string; name: string; inviteCode?: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const channelUserIds = useMemo(() => new Set(members.map((m) => m.userId)), [members])
  const searchKeyword = useMemo(() => inviteSearch.trim().toLowerCase(), [inviteSearch])
  const serverBotUserIds = useMemo(() => {
    const ids = new Set<string>()
    for (const member of serverMembers) {
      if (member.user?.isBot) {
        ids.add(member.user.id)
      }
    }
    return ids
  }, [serverMembers])
  const myAgentByBotUserId = useMemo(() => {
    const map = new Map<string, BuddyAgent>()
    for (const agent of myAgents) {
      if (agent.botUser?.id) {
        map.set(agent.botUser.id, agent)
      }
    }
    return map
  }, [myAgents])

  const memberCandidates = useMemo<InviteCandidate[]>(() => {
    return serverMembers
      .filter((m) => m.user && !m.user.isBot)
      .filter((m) => !channelUserIds.has(m.userId))
      .filter((m) => {
        if (!searchKeyword) return true
        const displayName = m.nickname || m.user!.displayName || m.user!.username
        return (
          displayName.toLowerCase().includes(searchKeyword) ||
          m.user!.username.toLowerCase().includes(searchKeyword)
        )
      })
      .map((m) => {
        const user = m.user!
        return {
          key: `member:${user.id}`,
          uid: user.id,
          nickname: m.nickname || user.displayName || user.username,
          username: user.username,
          avatar: user.avatarUrl,
          status: normalizeStatus(user.status),
          isBot: false,
          canAddToServer: false,
          canAddToChannel: !channelUserIds.has(user.id),
          membershipTier: m.membershipTier,
          membershipLevel: m.membershipLevel,
          totalOnlineSeconds: m.totalOnlineSeconds,
          buddyTag: null,
          creator: null,
          source: 'member' as const,
          agentId: undefined,
        } satisfies InviteCandidate
      })
  }, [serverMembers, channelUserIds, searchKeyword])

  const buddyCandidatesOnServer = useMemo<InviteCandidate[]>(() => {
    return serverMembers.flatMap((m) => {
      const user = m.user
      if (!user?.isBot || channelUserIds.has(user.id)) return []

      const agent = myAgentByBotUserId.get(user.id)
      if (!agent) return []

      if (searchKeyword) {
        const displayName = user.displayName || user.username
        if (!displayName.toLowerCase().includes(searchKeyword)) return []
      }

      return [
        {
          key: `buddy:${agent.id}`,
          uid: user.id,
          nickname: m.nickname || user.displayName || user.username,
          username: user.username,
          avatar: user.avatarUrl,
          status: normalizeStatus(user.status),
          isBot: true,
          canAddToServer: false,
          canAddToChannel: canBuddyJoinServer(agent, channel?.serverId),
          membershipTier: m.membershipTier,
          membershipLevel: m.membershipLevel,
          totalOnlineSeconds: m.totalOnlineSeconds,
          lastHeartbeat: agent.lastHeartbeat ?? null,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          buddyTag: agent.config?.buddyTag ?? null,
          creator: {
            uid: agent.owner?.userId || agent.owner?.id || '',
            nickname: agent.owner?.displayName || agent.owner?.username || '',
          },
          source: 'buddy' as const,
          agentId: agent.id,
        } satisfies InviteCandidate,
      ]
    })
  }, [serverMembers, searchKeyword, channelUserIds, myAgentByBotUserId, channel?.serverId])

  const buddyCandidatesNew = useMemo<InviteCandidate[]>(() => {
    return myAgents.flatMap((agent) => {
      const botUser = agent.botUser
      if (!botUser || serverBotUserIds.has(botUser.id)) return []
      if (!canBuddyJoinServer(agent, channel?.serverId)) return []

      if (searchKeyword) {
        const name = (botUser.displayName || botUser.username || '').toLowerCase()
        if (!name.includes(searchKeyword)) return []
      }

      return [
        {
          key: `buddy-new:${agent.id}`,
          uid: botUser.id,
          nickname: botUser.displayName || botUser.username,
          username: botUser.username,
          avatar: botUser.avatarUrl ?? null,
          status: normalizeStatus(agent.status),
          isBot: true,
          canAddToServer: true,
          canAddToChannel: !!channelId,
          membershipTier: null,
          membershipLevel: null,
          totalOnlineSeconds: agent.totalOnlineSeconds,
          lastHeartbeat: agent.lastHeartbeat ?? null,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          buddyTag: agent.config?.buddyTag ?? null,
          creator: agent.owner
            ? {
                uid: agent.owner.userId || agent.owner.id || '',
                nickname: agent.owner.displayName || agent.owner.username || '',
              }
            : null,
          source: 'buddy' as const,
          agentId: agent.id,
        } satisfies InviteCandidate,
      ]
    })
  }, [myAgents, serverBotUserIds, searchKeyword, channelId, channel?.serverId])

  const buddyCandidates = useMemo(
    () => sortInviteCandidates([...buddyCandidatesOnServer, ...buddyCandidatesNew]),
    [buddyCandidatesOnServer, buddyCandidatesNew],
  )

  const activeCandidates = useMemo(
    () => (inviteMode === 'members' ? memberCandidates : buddyCandidates),
    [inviteMode, memberCandidates, buddyCandidates],
  )

  const selectedCandidates = useMemo(
    () => activeCandidates.filter((candidate) => selectedCandidateKeys.has(candidate.key)),
    [activeCandidates, selectedCandidateKeys],
  )

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
      inviteMode === 'buddies'
        ? [...onlineBuddyCandidates, ...(shouldShowOfflineBuddies ? offlineBuddyCandidates : [])]
        : activeCandidates,
    [
      activeCandidates,
      inviteMode,
      offlineBuddyCandidates,
      onlineBuddyCandidates,
      shouldShowOfflineBuddies,
    ],
  )

  useEffect(() => {
    setShowOfflineBuddies(false)
  }, [channelId, inviteMode])

  const addToChannelCandidate = useMutation({
    mutationFn: (userId: string) =>
      fetchApi(`/api/channels/${channelId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
  })

  const addAgentsToServer = useMutation({
    mutationFn: (agentIds: string[]) =>
      fetchApi<AddAgentsResponse>(`/api/servers/${channel!.serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds }),
      }),
  })

  // Remove member from channel
  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      fetchApi(`/api/channels/${channelId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
    },
  })

  // Buddy policy
  const { data: buddyAgents = [] } = useQuery({
    queryKey: ['channel-buddy-agents'],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents?includeRentals=true'),
  })

  const selectedAgent = policySheet?.user.isBot
    ? buddyAgents.find((a) => a.botUser?.id === policySheet.user.id)
    : null

  const { data: currentPolicy } = useQuery({
    queryKey: ['agent-policy', channelId, selectedAgent?.id],
    queryFn: () =>
      fetchApi<{ mentionOnly: boolean; reply: boolean; config: Record<string, unknown> }>(
        `/api/channels/${channelId}/agents/${selectedAgent!.id}/policy`,
      ),
    enabled: !!channelId && !!selectedAgent,
  })

  const currentMode: PolicyMode = (() => {
    if (!currentPolicy) return 'replyAll'
    if (!currentPolicy.reply) return 'disabled'
    if (currentPolicy.mentionOnly) return 'mentionOnly'
    return 'replyAll'
  })()

  const updatePolicy = useMutation({
    mutationFn: ({ mode }: { mode: PolicyMode }) =>
      fetchApi(`/api/channels/${channelId}/agents/${selectedAgent!.id}/policy`, {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-policy', channelId, selectedAgent?.id] })
      setPolicySheet(null)
    },
  })

  const canManagePolicy = (member: ChannelMember) => {
    if (!member.user.isBot) return false
    const agent = buddyAgents.find((a) => a.botUser?.id === member.user.id)
    if (!agent) return false
    return (
      agent.ownerId === currentUser?.id ||
      agent.accessRole === 'owner' ||
      agent.accessRole === 'tenant'
    )
  }

  useEffect(() => {
    if (!showInviteSheet) {
      setInviteSearch('')
      setInviteMode('members')
      setSelectedCandidateKeys(new Set())
    }
  }, [showInviteSheet])

  const inviteLink = server?.inviteCode
    ? `https://shadowob.com/app/invite/${server.inviteCode}`
    : ''

  const isBottomActionDisabled = (() => {
    if (isSubmitting) return true
    if (selectedCandidates.length === 0) return true
    if (inviteMode === 'members' && !channelId) return true
    return selectedCandidates.every(
      (candidate) => !(candidate.canAddToChannel || candidate.canAddToServer),
    )
  })()

  const selectedCount = selectedCandidates.length
  const noSelectedCountMessage = t('member.selectedCount', { count: selectedCount })
  const inviteToChannelDescription =
    inviteMode === 'members'
      ? channelId
        ? t('member.inviteToChannelDesc', { channel: channel?.name ?? '' })
        : t('member.inviteSelectChannelDesc')
      : null

  const copyInviteCode = async () => {
    if (!inviteLink) return
    await Clipboard.setStringAsync(inviteLink)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 1500)
  }

  const closeInvitePanel = () => {
    setShowInviteSheet(false)
    setInviteSearch('')
    setInviteMode('members')
    setSelectedCandidateKeys(new Set())
  }

  const toggleCandidateSelection = (key: string) => {
    setSelectedCandidateKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleInviteSubmit = async () => {
    if (isBottomActionDisabled) return
    setIsSubmitting(true)
    try {
      const success = new Set<string>()
      if (inviteMode === 'members') {
        const results = await Promise.allSettled(
          selectedCandidates.map((candidate) => addToChannelCandidate.mutateAsync(candidate.uid)),
        )
        results.forEach((result, index) => {
          const candidate = selectedCandidates[index]
          if (result.status === 'fulfilled' && candidate) {
            success.add(candidate.key)
          }
        })
      } else {
        const addToServerAgentIds = Array.from(
          new Set(
            selectedCandidates
              .filter((candidate) => candidate.canAddToServer && candidate.agentId)
              .map((candidate) => candidate.agentId),
          ),
        ).filter(Boolean) as string[]

        const serverAddedAgentIds = new Set<string>()
        if (addToServerAgentIds.length > 0) {
          const addServerResult = await addAgentsToServer.mutateAsync(addToServerAgentIds)
          const parsed = parseAddAgentsResult(addServerResult)
          parsed.added.forEach((agentId) => serverAddedAgentIds.add(agentId))
        }

        const needChannelCandidates = selectedCandidates.filter(
          (candidate) =>
            candidate.canAddToChannel &&
            (!candidate.canAddToServer ||
              (candidate.agentId && serverAddedAgentIds.has(candidate.agentId))),
        )

        const channelResults = await Promise.allSettled(
          needChannelCandidates.map((candidate) =>
            addToChannelCandidate.mutateAsync(candidate.uid),
          ),
        )
        channelResults.forEach((result, index) => {
          const candidate = needChannelCandidates[index]
          if (result.status === 'fulfilled' && candidate) {
            success.add(candidate.key)
          }
        })

        selectedCandidates.forEach((candidate) => {
          if (!candidate.canAddToChannel && candidate.canAddToServer && candidate.agentId) {
            if (serverAddedAgentIds.has(candidate.agentId)) {
              success.add(candidate.key)
            }
          }
        })
      }

      setSelectedCandidateKeys((prev) => {
        const next = new Set(prev)
        success.forEach((key) => next.delete(key))
        return next
      })

      queryClient.invalidateQueries({ queryKey: ['server-members-for-invite', channel?.serverId] })
      queryClient.invalidateQueries({ queryKey: ['server-members', channel?.serverId] })
      queryClient.invalidateQueries({ queryKey: ['channel-members', channelId] })
      queryClient.invalidateQueries({ queryKey: ['my-agents-for-invite'] })

      if (success.size > 0 && selectedCandidates.every((candidate) => success.has(candidate.key))) {
        closeInvitePanel()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <LoadingScreen />

  const online = members.filter(
    (m) => m.user.status === 'online' || m.user.status === 'idle' || m.user.status === 'dnd',
  )
  const offline = members.filter((m) => !m.user.status || m.user.status === 'offline')

  const sections = [
    { title: t('members.online', '在线'), count: online.length, data: online },
    { title: t('members.offline', '离线'), count: offline.length, data: offline },
  ].filter((s) => s.data.length > 0)

  const roleBadge = (role: string) => {
    if (role === 'owner')
      return <Crown size={iconSize.xs} color={colors.primary} style={styles.roleIcon} />
    if (role === 'admin')
      return <Shield size={iconSize.xs} color={colors.primary} style={styles.roleIcon} />
    return null
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={
          <>
            {/* Add member card */}
            <Pressable
              onPress={() => {
                setShowInviteSheet(true)
                setInviteSearch('')
              }}
              style={({ pressed }) => [
                styles.inviteCard,
                {
                  backgroundColor: pressed
                    ? (colors.surfaceHover ?? colors.border)
                    : colors.surface,
                },
              ]}
            >
              <View style={[styles.inviteIcon, { backgroundColor: colors.primary }]}>
                <UserPlus size={iconSize.lg} color={palette.foundation} />
              </View>
              <Text style={[styles.inviteLabel, { color: colors.text }]}>
                {t('members.addToChannel', '添加成员到频道')}
              </Text>
              <ChevronRight size={iconSize.lg} color={colors.textMuted} />
            </Pressable>
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              styles.sectionHeader,
              { color: colors.textMuted, backgroundColor: colors.background },
            ]}
          >
            {section.title} — {section.count}
          </Text>
        )}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.memberRow,
              {
                backgroundColor: pressed ? (colors.surfaceHover ?? colors.border) : colors.surface,
              },
            ]}
            onPress={() => router.push(`/(main)/profile/${item.user.id}` as never)}
            onLongPress={() => {
              if (canManagePolicy(item)) setPolicySheet(item)
            }}
          >
            <Avatar
              uri={item.user.avatarUrl}
              name={item.user.displayName || item.user.username}
              size={iconSize['6xl']}
              userId={item.user.id}
              status={item.user.status ?? 'offline'}
              showStatus
            />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text
                  style={[styles.name, { color: item.user.isBot ? colors.primary : colors.text }]}
                  numberOfLines={1}
                >
                  {item.user.displayName || item.user.username}
                </Text>
                {roleBadge(item.role)}
                {item.user.isBot && (
                  <View style={[styles.botBadge, { backgroundColor: colors.inputBackground }]}>
                    <Bot size={iconSize.micro} color={colors.primary} />
                    <Text style={[styles.botBadgeText, { color: colors.primary }]}>
                      {t('common.bot')}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.usernameText, { color: colors.textMuted }]} numberOfLines={1}>
                {item.user.username}
              </Text>
            </View>
            {/* Remove button for non-self members */}
            {item.userId !== currentUser?.id && (
              <Pressable
                onPress={() => removeMember.mutate(item.userId)}
                hitSlop={spacing.sm}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.surface,
                })}
              >
                <MinusCircle size={iconSize.lg} color={colors.textMuted} />
              </Pressable>
            )}
          </Pressable>
        )}
      />

      {/* Invite Sheet */}
      <Modal
        visible={showInviteSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteSheet(false)}
      >
        <View style={[styles.invitePanel, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View
            style={[
              styles.inviteHeader,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.inviteTitle, { color: colors.text }]}>
              {inviteMode === 'members'
                ? t('channel.inviteMember', '邀请成员')
                : t('channel.addAgent', '添加 Buddy')}
            </Text>
            <Pressable
              onPress={() => setShowInviteSheet(false)}
              hitSlop={spacing.sm}
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.surfaceHover : colors.surface,
              })}
            >
              <X size={iconSize['2xl']} color={colors.textMuted} />
            </Pressable>
          </View>

          {inviteMode === 'members' ? (
            <>
              <Text style={[styles.inviteSectionTitle, { color: colors.textMuted }]}>
                {t('channel.inviteLink', '邀请链接')}
              </Text>
              <View style={styles.inviteLinkRow}>
                <Text style={[styles.inviteLink, { color: colors.textMuted }]} numberOfLines={1}>
                  {inviteLink || '...'}
                </Text>
                <Pressable
                  onPress={copyInviteCode}
                  disabled={!inviteLink}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.surfaceHover : colors.surface,
                  })}
                >
                  <Copy size={iconSize.md} color={inviteLink ? colors.primary : colors.textMuted} />
                </Pressable>
              </View>
            </>
          ) : null}

          {/* Search */}
          <View style={styles.inviteTabRow}>
            <Pressable
              onPress={() => setInviteMode('members')}
              style={({ pressed }) => [
                styles.inviteTab,
                {
                  backgroundColor:
                    inviteMode === 'members'
                      ? colors.surfaceHover
                      : pressed
                        ? colors.surfaceHover
                        : colors.surface,
                },
              ]}
            >
              <UserPlus
                size={iconSize.sm}
                color={inviteMode === 'members' ? colors.primary : colors.textMuted}
              />
              <Text
                style={{
                  color: inviteMode === 'members' ? colors.text : colors.textMuted,
                  marginLeft: spacing.xs,
                  fontSize: fontSize.xs,
                }}
              >
                {t('member.title', '成员')} ({memberCandidates.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setInviteMode('buddies')}
              style={({ pressed }) => [
                styles.inviteTab,
                {
                  backgroundColor:
                    inviteMode === 'buddies'
                      ? colors.surfaceHover
                      : pressed
                        ? colors.surfaceHover
                        : colors.surface,
                },
              ]}
            >
              <PawPrint
                size={iconSize.sm}
                color={inviteMode === 'buddies' ? colors.primary : colors.textMuted}
              />
              <Text
                style={{
                  color: inviteMode === 'buddies' ? colors.text : colors.textMuted,
                  marginLeft: spacing.xs,
                  fontSize: fontSize.xs,
                }}
              >
                {t('common.bot')} ({buddyCandidates.length})
              </Text>
            </Pressable>
          </View>

          {inviteToChannelDescription ? (
            <Text style={[styles.inviteDesc, { color: colors.textMuted }]}>
              {inviteToChannelDescription}
            </Text>
          ) : null}

          <View style={[styles.inviteSearchRow, { backgroundColor: colors.inputBackground }]}>
            <Search size={iconSize.md} color={colors.textMuted} />
            <TextInput
              style={[styles.inviteSearchInput, { color: colors.text }]}
              value={inviteSearch}
              onChangeText={setInviteSearch}
              placeholder={
                inviteMode === 'members'
                  ? t('common.search', '搜索...')
                  : t('channel.searchBuddy', '搜索 Buddy...')
              }
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {inviteSearch.length > 0 && (
              <Pressable onPress={() => setInviteSearch('')} hitSlop={spacing.sm}>
                <X size={iconSize.sm} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={visibleCandidates}
            contentContainerStyle={styles.inviteList}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => {
              const isSelectable = item.canAddToChannel || item.canAddToServer
              return (
                <BuddyListItem
                  member={item}
                  showCheckbox
                  selected={selectedCandidateKeys.has(item.key)}
                  disabled={!isSelectable}
                  onSelect={() => toggleCandidateSelection(item.key)}
                />
              )
            }}
            ListEmptyComponent={
              inviteMode === 'buddies' && activeCandidates.length > 0 ? null : (
                <View style={styles.inviteEmpty}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      textAlign: 'center',
                      marginBottom: spacing.md,
                    }}
                  >
                    {inviteMode === 'members'
                      ? t('member.noInvitable', '暂无可邀请成员')
                      : myAgents.length === 0
                        ? t('member.noBuddies', '暂无可用 Buddy')
                        : t('member.noInvitable', '暂无可邀请成员')}
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              inviteMode === 'buddies' && offlineBuddyCandidates.length > 0 && !searchKeyword ? (
                <Pressable
                  onPress={() => setShowOfflineBuddies((value) => !value)}
                  style={({ pressed }) => [
                    styles.offlineToggle,
                    {
                      backgroundColor: pressed ? colors.surfaceHover : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.offlineToggleText, { color: colors.textMuted }]}>
                    {t('member.offlineBuddiesToggle', {
                      count: offlineBuddyCandidates.length,
                    })}
                  </Text>
                  <ChevronRight
                    size={iconSize.md}
                    color={colors.textMuted}
                    style={{ transform: [{ rotate: showOfflineBuddies ? '-90deg' : '90deg' }] }}
                  />
                </Pressable>
              ) : null
            }
          />

          <View style={styles.inviteBottomBar}>
            <Text style={[styles.inviteSelectedText, { color: colors.textMuted }]}>
              {noSelectedCountMessage}
            </Text>
            <View style={styles.inviteBottomAction}>
              <Pressable style={[styles.inviteCancelButton]} onPress={closeInvitePanel}>
                <Text style={[styles.inviteCancelText, { color: colors.text }]}>
                  {t('common.cancel', '取消')}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.inviteSubmitButton,
                  {
                    backgroundColor: pressed ? colors.primaryDark : colors.primary,
                  },
                ]}
                disabled={isBottomActionDisabled || isSubmitting}
                onPress={handleInviteSubmit}
              >
                <Text style={styles.inviteSubmitText}>
                  {inviteMode === 'members'
                    ? t('member.addToChannel', '添加到频道')
                    : t('member.addToServer', '添加到服务器')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Buddy Reply Policy Sheet */}
      <Modal
        visible={!!policySheet}
        transparent
        animationType="slide"
        onRequestClose={() => setPolicySheet(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setPolicySheet(null)}>
          <Pressable
            style={[styles.sheetContent, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              <MessageSquare size={iconSize.md} color={colors.primary} />{' '}
              {t('member.replyPolicy', '回复策略')}
            </Text>
            <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
              {policySheet?.user.displayName || policySheet?.user.username}
            </Text>

            <Pressable
              style={[styles.policyOption, { borderBottomColor: colors.border }]}
              onPress={() => updatePolicy.mutate({ mode: 'replyAll' })}
            >
              <View style={styles.policyOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.text }]}>
                  {t('member.policyReplyAll', '回复所有消息')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policyReplyAllDesc', 'Buddy 会回复频道中的所有消息')}
                </Text>
              </View>
              {currentMode === 'replyAll' && <Check size={iconSize.lg} color={palette.emerald} />}
            </Pressable>

            <Pressable
              style={[styles.policyOption, { borderBottomColor: colors.border }]}
              onPress={() => updatePolicy.mutate({ mode: 'mentionOnly' })}
            >
              <View style={styles.policyOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.text }]}>
                  {t('member.policyMentionOnly', '仅回复 @提及')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policyMentionOnlyDesc', '仅在被 @ 时回复')}
                </Text>
              </View>
              {currentMode === 'mentionOnly' && (
                <Check size={iconSize.lg} color={palette.emerald} />
              )}
            </Pressable>

            <Pressable
              style={[styles.policyOption, { borderBottomColor: colors.border }]}
              onPress={() => updatePolicy.mutate({ mode: 'disabled' })}
            >
              <View style={styles.policyOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.error }]}>
                  {t('member.policyDisabled', '静默（不回复）')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policyDisabledDesc', 'Buddy 将不会在此频道回复任何消息')}
                </Text>
              </View>
              {currentMode === 'disabled' && <Check size={iconSize.lg} color={colors.error} />}
            </Pressable>

            <Pressable
              style={[styles.sheetCancel, { backgroundColor: colors.background }]}
              onPress={() => setPolicySheet(null)}
            >
              <Text style={[styles.sheetCancelText, { color: colors.text }]}>
                {t('common.cancel', '取消')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  inviteIcon: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  list: { paddingBottom: spacing.xl },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.xxs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleIcon: {
    marginLeft: spacing.xs,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
  },
  usernameText: {
    fontSize: fontSize.xs,
  },
  botBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginLeft: spacing.tight,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.px,
    borderRadius: radius.sm,
  },
  botBadgeText: {
    fontSize: fontSize.micro,
    fontWeight: '600',
  },
  // Invite panel
  invitePanel: { flex: 1 },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inviteTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  inviteSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.md,
  },
  inviteSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    height: size.iconButtonLg,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  inviteSearchInput: {
    flex: 1,
    fontSize: fontSize.md,
    height: size.iconButtonLg,
  },
  inviteLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.lineLight,
  },
  inviteLink: {
    flex: 1,
    fontSize: fontSize.xs,
  },
  inviteTabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: palette.neutral100,
    gap: spacing.xs,
  },
  inviteTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  inviteDesc: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    fontSize: fontSize.xs,
  },
  inviteList: {
    paddingBottom: spacing.md + spacing.sm,
  },
  offlineToggle: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offlineToggleText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  inviteEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  inviteBottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: palette.lineLight,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  inviteSelectedText: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  inviteBottomAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inviteCancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  inviteCancelText: {
    fontSize: fontSize.sm,
  },
  inviteSubmitButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  inviteSubmitText: {
    color: palette.foundation,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  // Policy sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: palette.blackOverlay,
  },
  sheetContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  sheetHandle: {
    width: size.iconButtonMd,
    height: size.dotXs,
    borderRadius: radius.xs,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sheetSubtitle: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  policyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  policyOptionContent: {
    flex: 1,
  },
  policyLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  policyDesc: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  sheetCancel: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
})
