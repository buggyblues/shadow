import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Bot,
  Check,
  ChevronRight,
  Crown,
  MessageSquare,
  Shield,
  UserPlus,
} from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { StatusBadge } from '../../../../src/components/common/status-badge'
import { fetchApi } from '../../../../src/lib/api'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

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
}

interface BuddyAgent {
  id: string
  ownerId: string
  botUser?: { id: string; username: string } | null
}

type PolicyMode = 'replyAll' | 'mentionOnly' | 'disabled'

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
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents'),
  })

  // Find the agent for the selected buddy
  const selectedAgent = policySheet?.user.isBot
    ? buddyAgents.find((a) => a.botUser?.id === policySheet.user.id)
    : null

  // Current policy query
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

  // Update policy mutation
  const updatePolicy = useMutation({
    mutationFn: ({ mode }: { mode: string }) =>
      fetchApi(`/api/channels/${channelId}/agents/${selectedAgent!.id}/policy`, {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['agent-policy', channelId, selectedAgent?.id],
      })
      setPolicySheet(null)
    },
  })

  // Can current user manage buddy policy?
  const canManagePolicy = (member: Member) => {
    if (!channelId || !member.user.isBot) return false
    const agent = buddyAgents.find((a) => a.botUser?.id === member.user.id)
    if (!agent) return false
    // Owner of the buddy or server admin/owner
    return agent.ownerId === currentUser?.id || server?.id != null
  }

  if (isLoading) return <LoadingScreen />

  const members: Member[] = (memberData ?? []).filter((m) => m.user?.id)
  const online = members.filter(
    (m) => m.user.status === 'online' || m.user.status === 'idle' || m.user.status === 'dnd',
  )
  const offline = members.filter((m) => !m.user.status || m.user.status === 'offline')

  const sections = [
    { title: t('members.online'), count: online.length, data: online },
    { title: t('members.offline'), count: offline.length, data: offline },
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
        keyExtractor={(item) => item.user.id}
        ListHeaderComponent={
          <>
            {/* Invite row — card style with right chevron */}
            <Pressable
              onPress={() => router.push(`/(main)/servers/${serverSlug}/invite`)}
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
                {t('members.inviteMembers', '邀请成员')}
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
            onPress={() => router.push(`/(main)/profile/${item.user.id}`)}
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
                  style={[
                    styles.name,
                    {
                      color: item.user.isBot ? colors.primary : colors.text,
                    },
                  ]}
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
          </Pressable>
        )}
      />

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

            {/* Reply All */}
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

            {/* Mention Only */}
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

            {/* Disabled */}
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
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  sheetCancelText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
})
