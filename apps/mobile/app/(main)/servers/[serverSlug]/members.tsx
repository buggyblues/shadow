import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  MessageSquare,
  PawPrint,
  Settings,
  Shield,
  UserPlus,
} from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { OnlineRank } from '../../../../src/components/common/online-rank'
import { AppSwitch, MobileBackButton, MobileNavigationBar } from '../../../../src/components/ui'
import { fetchApi } from '../../../../src/lib/api'
import { selectionHaptic } from '../../../../src/lib/haptics'
import { animateNextLayout } from '../../../../src/lib/layout-animation'
import { useAuthStore } from '../../../../src/stores/auth.store'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../src/theme'

interface Member {
  id?: string
  userId?: string
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status?: string
    isBot?: boolean
  }
  role: string
  joinedAt: string
  nickname?: string | null
  totalOnlineSeconds?: number | null
  agent?: {
    ownerId?: string | null
    totalOnlineSeconds?: number | null
    config?: Record<string, unknown> | null
  } | null
  creator?: {
    uid: string
    nickname?: string | null
    username?: string | null
    avatarUrl?: string | null
  } | null
}

interface BuddyAgent {
  id: string
  ownerId: string
  accessRole?: 'owner' | 'tenant'
  totalOnlineSeconds?: number | null
  config?: Record<string, unknown> | null
  owner?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  botUser?: { id: string; username: string } | null
}

interface RenderMemberEntry {
  member: Member
  depth: 0 | 1
  childCount: number
}

type PolicyMode = 'replyAll' | 'mentionOnly' | 'custom' | 'disabled'

interface PolicyConfig {
  replyToUsers?: string[]
  keywords?: string[]
  mentionOnly?: boolean
  replyToBuddy?: boolean
  maxBuddyChainDepth?: number
  smartReply?: boolean
}

export default function MembersScreen() {
  const { serverSlug, channelId } = useLocalSearchParams<{
    serverSlug: string
    channelId?: string
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [policySheet, setPolicySheet] = useState<Member | null>(null)
  const [showCustomPolicy, setShowCustomPolicy] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [collapsedOwners, setCollapsedOwners] = useState<Set<string>>(new Set())

  // Custom policy state
  const [customReplyToBuddy, setCustomReplyToBuddy] = useState(false)
  const [customMaxBuddyChainDepth, setCustomMaxBuddyChainDepth] = useState(3)
  const [customSmartReply, setCustomSmartReply] = useState(true)

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () =>
      fetchApi<{ id: string; name: string; memberCount?: number }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const {
    data: memberData,
    isLoading: isMembersLoading,
    error: membersError,
  } = useQuery({
    queryKey: ['members', serverSlug],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${serverSlug}/members`),
    enabled: !!serverSlug,
  })

  const isLoading =
    (isServerLoading && !server) || (!!serverSlug && isMembersLoading && !membersError)

  // Buddy agents for reply policy
  const { data: buddyAgents = [] } = useQuery({
    queryKey: ['members-buddy-agents'],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents?includeRentals=true'),
  })

  // Find the agent for the selected buddy
  const selectedAgent = policySheet?.user.isBot
    ? buddyAgents.find((a) => a.botUser?.id === policySheet.user.id)
    : null

  // Current policy query
  const { data: currentPolicy } = useQuery({
    queryKey: ['agent-policy', channelId, selectedAgent?.id],
    queryFn: () =>
      fetchApi<{ mentionOnly: boolean; reply: boolean; config: PolicyConfig }>(
        `/api/channels/${channelId}/agents/${selectedAgent!.id}/policy`,
      ),
    enabled: !!channelId && !!selectedAgent,
  })

  const currentMode: PolicyMode = (() => {
    if (!currentPolicy) return 'replyAll'
    if (!currentPolicy.reply) return 'disabled'
    if (currentPolicy.mentionOnly) return 'mentionOnly'
    const config = currentPolicy.config as PolicyConfig | undefined
    if (
      config?.replyToUsers?.length ||
      config?.keywords?.length ||
      config?.replyToBuddy ||
      config?.smartReply === false
    ) {
      return 'custom'
    }
    return 'replyAll'
  })()

  // Update policy mutation
  const updatePolicy = useMutation({
    mutationFn: ({ mode, config }: { mode: string; config?: PolicyConfig }) =>
      fetchApi(`/api/channels/${channelId}/agents/${selectedAgent!.id}/policy`, {
        method: 'PUT',
        body: JSON.stringify({ mode, config }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['agent-policy', channelId, selectedAgent?.id],
      })
    },
  })

  // Can current user manage buddy policy?
  const canManagePolicy = (member: Member) => {
    if (!channelId || !member.user.isBot) return false
    const agent = buddyAgents.find((a) => a.botUser?.id === member.user.id)
    if (!agent) return false
    return (
      agent.ownerId === currentUser?.id ||
      agent.accessRole === 'owner' ||
      agent.accessRole === 'tenant'
    )
  }

  // Open custom policy sheet with current values
  const openCustomPolicy = () => {
    selectionHaptic()
    const config = currentPolicy?.config as PolicyConfig | undefined
    setCustomReplyToBuddy(config?.replyToBuddy ?? false)
    setCustomMaxBuddyChainDepth(config?.maxBuddyChainDepth ?? 3)
    setCustomSmartReply(config?.smartReply ?? true)
    setShowCustomPolicy(true)
  }

  // Save custom policy
  const saveCustomPolicy = () => {
    selectionHaptic()
    updatePolicy.mutate({
      mode: 'custom',
      config: {
        replyToBuddy: customReplyToBuddy,
        maxBuddyChainDepth: customReplyToBuddy ? customMaxBuddyChainDepth : undefined,
        ...(customSmartReply !== true ? { smartReply: false } : {}),
      },
    })
    setShowCustomPolicy(false)
    setPolicySheet(null)
  }

  const members: Member[] = (memberData ?? []).filter((m) => m.user?.id)

  const agentByBotUserId = useMemo(() => {
    const map = new Map<string, BuddyAgent>()
    for (const agent of buddyAgents) {
      if (agent.botUser?.id) map.set(agent.botUser.id, agent)
    }
    return map
  }, [buddyAgents])

  const toggleSection = (key: string) => {
    selectionHaptic()
    animateNextLayout()
    setCollapsedSections((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleOwner = (userId: string) => {
    selectionHaptic()
    animateNextLayout()
    setCollapsedOwners((current) => {
      const next = new Set(current)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const memberName = (member: Member) =>
    member.nickname || member.user.displayName || member.user.username

  const getBuddyMeta = (member: Member) => {
    const agent = agentByBotUserId.get(member.user.id)
    const ownerId = member.agent?.ownerId ?? member.creator?.uid ?? agent?.ownerId ?? null
    const ownerName =
      member.creator?.nickname ??
      member.creator?.username ??
      agent?.owner?.displayName ??
      agent?.owner?.username ??
      null
    const totalOnlineSeconds =
      member.totalOnlineSeconds ?? member.agent?.totalOnlineSeconds ?? agent?.totalOnlineSeconds
    const description =
      typeof member.agent?.config?.description === 'string'
        ? member.agent.config.description
        : typeof agent?.config?.description === 'string'
          ? agent.config.description
          : null
    return { ownerId, ownerName, totalOnlineSeconds, description }
  }

  const statusRank = (status?: string | null) => {
    if (status === 'online') return 0
    if (status === 'idle') return 1
    if (status === 'dnd') return 2
    return 3
  }

  const sortMemberList = (items: Member[]) =>
    [...items].sort((a, b) => {
      if (a.user.isBot !== b.user.isBot) return a.user.isBot ? -1 : 1
      const statusDelta = statusRank(a.user.status) - statusRank(b.user.status)
      if (statusDelta !== 0) return statusDelta
      if (a.role !== b.role) {
        const roleRank = { owner: 0, admin: 1, member: 2 } as Record<string, number>
        return (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3)
      }
      return memberName(a).localeCompare(memberName(b))
    })

  const buildEntries = (items: Member[], flat = false): RenderMemberEntry[] => {
    if (flat) return sortMemberList(items).map((member) => ({ member, depth: 0, childCount: 0 }))

    const membersByUserId = new Map(items.map((member) => [member.user.id, member]))
    const childrenByOwnerId = new Map<string, Member[]>()
    const orphanBuddies: Member[] = []

    for (const member of items) {
      if (!member.user.isBot) continue
      const ownerId = getBuddyMeta(member).ownerId
      if (ownerId && membersByUserId.has(ownerId)) {
        childrenByOwnerId.set(ownerId, [...(childrenByOwnerId.get(ownerId) ?? []), member])
      } else {
        orphanBuddies.push(member)
      }
    }

    const entries: RenderMemberEntry[] = []
    for (const buddy of sortMemberList(orphanBuddies)) {
      entries.push({ member: buddy, depth: 0, childCount: 0 })
    }
    for (const member of sortMemberList(items.filter((item) => !item.user.isBot))) {
      const children = sortMemberList(childrenByOwnerId.get(member.user.id) ?? [])
      entries.push({ member, depth: 0, childCount: children.length })
      if (children.length > 0 && !collapsedOwners.has(member.user.id)) {
        for (const child of children) {
          entries.push({ member: child, depth: 1, childCount: 0 })
        }
      }
    }
    return entries
  }

  const online = members.filter(
    (m) => m.user.status === 'online' || m.user.status === 'idle' || m.user.status === 'dnd',
  )
  const offline = members.filter((m) => !m.user.status || m.user.status === 'offline')

  const sections = [
    {
      key: 'online',
      title: t('members.online'),
      count: online.length,
      data: collapsedSections.has('online') ? [] : buildEntries(online),
    },
    {
      key: 'offline',
      title: t('members.offline'),
      count: offline.length,
      data: collapsedSections.has('offline') ? [] : buildEntries(offline, true),
    },
  ].filter((s) => s.count > 0)

  const roleBadge = (role: string) => {
    if (role === 'owner')
      return <Crown size={iconSize.xs} color={colors.primary} style={{ marginLeft: spacing.xs }} />
    if (role === 'admin')
      return <Shield size={iconSize.xs} color={colors.primary} style={{ marginLeft: spacing.xs }} />
    return null
  }

  if (isLoading) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MobileNavigationBar
        title={t('member.title', '成员')}
        left={<MobileBackButton onPress={() => router.back()} />}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.member.user.id}-${item.depth}`}
        ListHeaderComponent={
          <Pressable
            onPress={() => {
              selectionHaptic()
              router.push(`/(main)/servers/${serverSlug}/invite`)
            }}
            style={({ pressed }) => [
              styles.inviteCard,
              {
                backgroundColor: pressed ? (colors.surfaceHover ?? colors.border) : colors.surface,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={[styles.inviteIcon, { backgroundColor: colors.primary }]}>
              <UserPlus size={iconSize.lg} color={palette.foundation} />
            </View>
            <Text style={[styles.inviteLabel, { color: colors.text }]}>
              {t('members.inviteMembers', '邀请成员')}
            </Text>
            <ChevronRight size={iconSize.lg} color={colors.textMuted} />
          </Pressable>
        }
        renderSectionHeader={({ section }) => (
          <Pressable
            style={[styles.sectionHeaderRow, { backgroundColor: colors.background }]}
            onPress={() => toggleSection(section.key)}
          >
            <ChevronDown
              size={iconSize.sm}
              color={colors.textMuted}
              strokeWidth={2.8}
              style={{
                transform: [{ rotate: collapsedSections.has(section.key) ? '-90deg' : '0deg' }],
              }}
            />
            <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
              {section.title} — {section.count}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const member = item.member
          const meta = member.user.isBot ? getBuddyMeta(member) : null
          const displayName = memberName(member)
          const ownerCollapsed = collapsedOwners.has(member.user.id)
          return (
            <View style={item.depth === 1 ? styles.childRowWrap : undefined}>
              {item.depth === 1 ? (
                <View style={[styles.childBranch, { backgroundColor: colors.border }]} />
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.memberRow,
                  item.depth === 1 && styles.memberRowChild,
                  member.user.isBot && styles.buddyRow,
                  {
                    backgroundColor: pressed
                      ? (colors.surfaceHover ?? colors.border)
                      : member.user.isBot
                        ? colors.tonePrimarySurface
                        : colors.surface,
                    borderBottomColor: colors.border,
                    borderLeftColor: member.user.isBot ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  selectionHaptic()
                  router.push(`/(main)/profile/${member.user.id}`)
                }}
                onLongPress={() => {
                  if (canManagePolicy(member)) {
                    selectionHaptic()
                    setPolicySheet(member)
                  }
                }}
              >
                <Avatar
                  uri={member.user.avatarUrl}
                  name={displayName}
                  size={iconSize['6xl']}
                  userId={member.user.id}
                  status={member.user.status ?? 'offline'}
                  showStatus
                />
                <View style={styles.memberContent}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[
                        styles.name,
                        {
                          color: member.user.isBot ? colors.primary : colors.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                    {roleBadge(member.role)}
                    {member.user.isBot && (
                      <View style={[styles.botBadge, { backgroundColor: colors.surface }]}>
                        <Bot size={iconSize.micro} color={colors.primary} />
                        <Text style={[styles.botBadgeText, { color: colors.primary }]}>Buddy</Text>
                      </View>
                    )}
                  </View>
                  {member.user.isBot ? (
                    <View style={styles.buddyMeta}>
                      {typeof meta?.totalOnlineSeconds === 'number' &&
                      meta.totalOnlineSeconds > 0 ? (
                        <OnlineRank totalSeconds={meta.totalOnlineSeconds} />
                      ) : (
                        <Text style={[styles.memberSubText, { color: colors.textMuted }]}>
                          {meta?.ownerName
                            ? t('member.buddyOwner', { name: meta.ownerName })
                            : `@${member.user.username}`}
                        </Text>
                      )}
                      {meta?.description ? (
                        <Text
                          style={[styles.memberSubText, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {meta.description}
                        </Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text
                      style={[styles.memberSubText, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      @{member.user.username}
                    </Text>
                  )}
                </View>
                {item.childCount > 0 ? (
                  <Pressable
                    hitSlop={spacing.md}
                    style={styles.collapseButton}
                    onPress={() => toggleOwner(member.user.id)}
                  >
                    <Text style={[styles.childCount, { color: colors.textMuted }]}>
                      {item.childCount}
                    </Text>
                    <ChevronDown
                      size={iconSize.sm}
                      color={colors.textMuted}
                      strokeWidth={2.8}
                      style={{
                        transform: [{ rotate: ownerCollapsed ? '-90deg' : '0deg' }],
                      }}
                    />
                  </Pressable>
                ) : canManagePolicy(member) ? (
                  <PawPrint size={iconSize.md} color={colors.primary} />
                ) : null}
              </Pressable>
            </View>
          )
        }}
      />

      {/* Buddy Reply Policy Sheet */}
      <Modal
        visible={!!policySheet && !showCustomPolicy}
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

            {/* Reply All */}
            <Pressable
              style={[styles.policyOption, { borderBottomColor: colors.border }]}
              onPress={() => {
                selectionHaptic()
                updatePolicy.mutate({ mode: 'replyAll' })
                setPolicySheet(null)
              }}
            >
              <View style={styles.policyOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.text }]}>
                  {t('member.policyReplyAll', '回复所有消息')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policyReplyAllDesc', 'Buddy 会回复频道中的所有消息')}
                </Text>
              </View>
              {currentMode === 'replyAll' && <Check size={iconSize.lg} color={colors.primary} />}
            </Pressable>

            {/* Mention Only */}
            <Pressable
              style={[styles.policyOption, { borderBottomColor: colors.border }]}
              onPress={() => {
                selectionHaptic()
                updatePolicy.mutate({ mode: 'mentionOnly' })
                setPolicySheet(null)
              }}
            >
              <View style={styles.policyOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.text }]}>
                  {t('member.policyMentionOnly', '仅回复 @提及')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policyMentionOnlyDesc', '仅在被 @ 时回复')}
                </Text>
              </View>
              {currentMode === 'mentionOnly' && <Check size={iconSize.lg} color={colors.primary} />}
            </Pressable>

            {/* Custom */}
            <Pressable
              style={[styles.policyOption, { borderBottomColor: colors.border }]}
              onPress={openCustomPolicy}
            >
              <View style={styles.policyOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.text }]}>
                  <Settings size={iconSize.sm} color={colors.primary} />{' '}
                  {t('member.policyCustom', '自定义策略')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policyCustomDesc', '配置 Buddy 互动、智能回复等高级选项')}
                </Text>
              </View>
              {currentMode === 'custom' && <Check size={iconSize.lg} color={colors.primary} />}
            </Pressable>

            {/* Disabled */}
            <Pressable
              style={[styles.policyOption, { borderBottomColor: colors.border }]}
              onPress={() => {
                selectionHaptic()
                updatePolicy.mutate({ mode: 'disabled' })
                setPolicySheet(null)
              }}
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
              onPress={() => {
                selectionHaptic()
                setPolicySheet(null)
              }}
            >
              <Text style={[styles.sheetCancelText, { color: colors.text }]}>
                {t('common.cancel', '取消')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Custom Policy Sheet */}
      <Modal
        visible={showCustomPolicy}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomPolicy(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowCustomPolicy(false)}>
          <Pressable
            style={[styles.sheetContent, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.textMuted }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              <Settings size={iconSize.md} color={colors.primary} />{' '}
              {t('member.policyCustomTitle', '自定义回复策略')}
            </Text>
            <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
              {policySheet?.user.displayName || policySheet?.user.username}
            </Text>

            {/* Smart Reply */}
            <View style={[styles.customOption, { borderBottomColor: colors.border }]}>
              <View style={styles.customOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.text }]}>
                  {t('member.policySmartReply', '智能回复')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policySmartReplyDesc', '跳过明显针对其他人的消息')}
                </Text>
              </View>
              <AppSwitch value={customSmartReply} onValueChange={setCustomSmartReply} />
            </View>

            {/* Reply to Buddy */}
            <View style={[styles.customOption, { borderBottomColor: colors.border }]}>
              <View style={styles.customOptionContent}>
                <Text style={[styles.policyLabel, { color: colors.text }]}>
                  {t('member.policyReplyToBuddy', '回复其他 Buddy 的消息')}
                </Text>
                <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                  {t('member.policyReplyToBuddyDesc', '允许回复其他 Buddy 发送的消息')}
                </Text>
              </View>
              <AppSwitch value={customReplyToBuddy} onValueChange={setCustomReplyToBuddy} />
            </View>

            {/* Max Buddy Chain Depth */}
            {customReplyToBuddy && (
              <View style={[styles.customOption, { borderBottomColor: colors.border }]}>
                <View style={styles.customOptionContent}>
                  <Text style={[styles.policyLabel, { color: colors.text }]}>
                    {t('member.policyMaxBuddyChainDepth', '最大对话链深度')}:{' '}
                    {customMaxBuddyChainDepth}
                  </Text>
                  <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
                    {t('member.policyMaxBuddyChainDepthDesc', '防止 Buddy 之间无限循环对话')}
                  </Text>
                  {/* Simple +/- controls instead of slider */}
                  <View style={styles.stepperRow}>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.background }]}
                      onPress={() => {
                        selectionHaptic()
                        setCustomMaxBuddyChainDepth(Math.max(1, customMaxBuddyChainDepth - 1))
                      }}
                    >
                      <Text style={[styles.stepperText, { color: colors.text }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.stepperValue, { color: colors.text }]}>
                      {customMaxBuddyChainDepth}
                    </Text>
                    <Pressable
                      style={[styles.stepperBtn, { backgroundColor: colors.background }]}
                      onPress={() => {
                        selectionHaptic()
                        setCustomMaxBuddyChainDepth(Math.min(10, customMaxBuddyChainDepth + 1))
                      }}
                    >
                      <Text style={[styles.stepperText, { color: colors.text }]}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            <Pressable
              style={[styles.sheetSave, { backgroundColor: colors.primary }]}
              onPress={saveCustomPolicy}
            >
              <Text style={[styles.sheetSaveText, { color: palette.foundation }]}>
                {t('member.policySave', '保存策略')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.sheetCancel, { backgroundColor: colors.background }]}
              onPress={() => {
                selectionHaptic()
                setShowCustomPolicy(false)
              }}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sectionHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  childRowWrap: {
    position: 'relative',
  },
  childBranch: {
    position: 'absolute',
    left: -spacing.md,
    top: spacing.none,
    bottom: spacing.md,
    width: StyleSheet.hairlineWidth,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberRowChild: {
    paddingVertical: spacing.sm,
    paddingLeft: spacing['5xl'],
  },
  buddyRow: {
    borderLeftWidth: border.active,
  },
  memberContent: {
    flex: 1,
    minWidth: 0,
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
  buddyMeta: {
    marginTop: spacing.xs,
    gap: spacing.xxs,
    alignItems: 'flex-start',
  },
  memberSubText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  collapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    padding: spacing.xs,
  },
  childCount: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  // Policy sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: palette.black,
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
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  sheetCancelText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  // Custom policy
  customOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  customOptionContent: {
    flex: 1,
  },
  sheetSave: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
  },
  sheetSaveText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  // Stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  stepperBtn: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  stepperValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    minWidth: size.avatarXs,
    textAlign: 'center',
  },
})
