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
import { StatusBadge } from '../../../../src/components/common/status-badge'
import { fetchApi } from '../../../../src/lib/api'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

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
  userId: string
  status: string
  totalOnlineSeconds?: number
  botUser?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  config?: {
    description?: string
    buddyTag?: string
  }
  owner?: {
    userId?: string
    id?: string
    username?: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

type AddAgentsResponse = {
  added?: string[]
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

type PolicyMode = 'replyAll' | 'mentionOnly' | 'disabled'

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
    return { added: result.added, failed: result.failed }
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
  const serverBotUserIds = useMemo(
    () => new Set(serverMembers.filter((m) => m.user?.isBot).map((m) => m.user.id)),
    [serverMembers],
  )
  const myAgentByBotUserId = useMemo(() => {
    const map = new Map<string, BuddyAgent>()
    for (const agent of myAgents) {
      if (agent.botUser?.id) {
        map.set(agent.botUser.id, agent)
      }
    }
    return map
  }, [myAgents])

  const memberCandidates = useMemo(() => {
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
        }
      })
  }, [serverMembers, channelUserIds, searchKeyword])

  const buddyCandidatesOnServer = useMemo(() => {
    return serverMembers
      .filter((m) => m.user?.isBot && !channelUserIds.has(m.user!.id))
      .filter((m) => myAgentByBotUserId.has(m.user!.id))
      .filter((m) => {
        if (!searchKeyword) return true
        const displayName = m.user!.displayName || m.user!.username
        return displayName.toLowerCase().includes(searchKeyword)
      })
      .map((m) => {
        const user = m.user!
        const agent = myAgentByBotUserId.get(user.id)
        if (!agent) return null
        return {
          key: `buddy:${agent.id}`,
          uid: user.id,
          nickname: m.nickname || user.displayName || user.username,
          username: user.username,
          avatar: user.avatarUrl,
          status: normalizeStatus(user.status),
          isBot: true,
          canAddToServer: false,
          canAddToChannel: true,
          membershipTier: m.membershipTier,
          membershipLevel: m.membershipLevel,
          totalOnlineSeconds: m.totalOnlineSeconds,
          buddyTag: agent.config?.buddyTag ?? null,
          creator: {
            uid: agent.owner?.userId || agent.owner?.id || '',
            nickname: agent.owner?.displayName || agent.owner?.username || '',
          },
          source: 'buddy' as const,
          agentId: agent.id,
        }
      })
      .filter((candidate): candidate is InviteCandidate => !!candidate)
  }, [serverMembers, searchKeyword, channelUserIds, myAgentByBotUserId])

  const buddyCandidatesNew = useMemo(() => {
    return myAgents
      .filter((agent) => agent.botUser && !serverBotUserIds.has(agent.botUser.id))
      .filter((agent) => {
        if (!searchKeyword) return true
        const name = (agent.botUser?.displayName || agent.botUser?.username || '').toLowerCase()
        return name.includes(searchKeyword)
      })
      .map((agent) => ({
        key: `buddy-new:${agent.id}`,
        uid: agent.botUser!.id,
        nickname: agent.botUser!.displayName || agent.botUser!.username,
        username: agent.botUser!.username,
        avatar: agent.botUser!.avatarUrl ?? null,
        status: normalizeStatus(agent.status),
        isBot: true,
        canAddToServer: true,
        canAddToChannel: !!channelId,
        membershipTier: null,
        membershipLevel: null,
        totalOnlineSeconds: agent.totalOnlineSeconds,
        buddyTag: agent.config?.buddyTag ?? null,
        creator: agent.owner
          ? {
              uid: agent.owner.userId || agent.owner.id || '',
              nickname: agent.owner.displayName || agent.owner.username || '',
            }
          : null,
        source: 'buddy' as const,
        agentId: agent.id,
      }))
  }, [myAgents, serverBotUserIds, searchKeyword, channelId])

  const buddyCandidates = useMemo(
    () => [...buddyCandidatesOnServer, ...buddyCandidatesNew],
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
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents'),
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
    mutationFn: ({ mode }: { mode: string }) =>
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
    return agent.ownerId === currentUser?.id || server?.id != null
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
      : channelId
        ? t('member.addBuddyToChannelDesc', { channel: channel?.name ?? '' })
        : t('member.addBuddyToServerDesc')

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
          if (result.status === 'fulfilled') {
            success.add(selectedCandidates[index].key)
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
          if (result.status === 'fulfilled') {
            success.add(needChannelCandidates[index].key)
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
    if (role === 'owner') return <Crown size={12} color="#eab308" style={{ marginLeft: 4 }} />
    if (role === 'admin') return <Shield size={12} color="#3b82f6" style={{ marginLeft: 4 }} />
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
                <UserPlus size={18} color="#fff" />
              </View>
              <Text style={[styles.inviteLabel, { color: colors.text }]}>
                {t('members.addToChannel', '添加成员到频道')}
              </Text>
              <ChevronRight size={18} color={colors.textMuted} />
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
            <View style={{ position: 'relative' }}>
              <Avatar
                uri={item.user.avatarUrl}
                name={item.user.displayName || item.user.username}
                size={40}
                userId={item.user.id}
              />
              <View style={{ position: 'absolute', bottom: -1, right: -1 }}>
                <StatusBadge status={item.user.status ?? 'offline'} size={12} />
              </View>
            </View>
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
                  <View style={[styles.botBadge, { backgroundColor: `${colors.primary}20` }]}>
                    <Bot size={10} color={colors.primary} />
                    <Text style={[styles.botBadgeText, { color: colors.primary }]}>Buddy</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }} numberOfLines={1}>
                {item.user.username}
              </Text>
            </View>
            {/* Remove button for non-self members */}
            {item.userId !== currentUser?.id && (
              <Pressable
                onPress={() => removeMember.mutate(item.userId)}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <MinusCircle size={18} color={colors.textMuted} />
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
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <X size={22} color={colors.textMuted} />
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
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Copy size={16} color={inviteLink ? colors.primary : colors.textMuted} />
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
                size={14}
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
                      ? `${colors.primary}12`
                      : pressed
                        ? colors.surfaceHover
                        : colors.surface,
                },
              ]}
            >
              <PawPrint
                size={14}
                color={inviteMode === 'buddies' ? colors.primary : colors.textMuted}
              />
              <Text
                style={{
                  color: inviteMode === 'buddies' ? colors.text : colors.textMuted,
                  marginLeft: spacing.xs,
                  fontSize: fontSize.xs,
                }}
              >
                Buddy ({buddyCandidates.length})
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.inviteDesc, { color: colors.textMuted }]}>
            {inviteToChannelDescription}
          </Text>

          <View style={[styles.inviteSearchRow, { backgroundColor: colors.inputBackground }]}>
            <Search size={16} color={colors.textMuted} />
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
              <Pressable onPress={() => setInviteSearch('')} hitSlop={8}>
                <X size={14} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={activeCandidates}
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
              <View style={styles.inviteEmpty}>
                <Text
                  style={{ color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md }}
                >
                  {inviteMode === 'members'
                    ? t('member.noInvitable', '暂无可邀请成员')
                    : myAgents.length === 0
                      ? t('member.noBuddies', '暂无可用 Buddy')
                      : t('member.noInvitable', '暂无可邀请成员')}
                </Text>
              </View>
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
                    backgroundColor: colors.primary,
                    opacity: isBottomActionDisabled || isSubmitting ? 0.5 : 1,
                  },
                  { opacity: pressed ? 0.8 : 1 },
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
              <MessageSquare size={16} color={colors.primary} />{' '}
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
              {currentMode === 'replyAll' && <Check size={18} color="#23a559" />}
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
              {currentMode === 'mentionOnly' && <Check size={18} color="#23a559" />}
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
              {currentMode === 'disabled' && <Check size={18} color={colors.error} />}
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
    marginBottom: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
  },
  botBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  botBadgeText: {
    fontSize: 10,
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
  inviteSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  inviteSearchInput: {
    flex: 1,
    fontSize: fontSize.md,
    height: 40,
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
    borderColor: `${'#000'}20`,
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
    backgroundColor: `${'#000'}10`,
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
  inviteBottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: `${'#000'}20`,
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
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  // Policy sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
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
    marginTop: 2,
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
