import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  Bot,
  Check,
  ChevronLeft,
  CircleAlert,
  Hash,
  Layers3,
  Lock,
  Megaphone,
  Search,
  Sparkles,
  Users,
  Volume2,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import {
  Button,
  CardPressable,
  ChipButton,
  IconButton,
  TextField,
} from '../../../../src/components/ui'
import { fetchApi } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { radius, spacing, useColors } from '../../../../src/theme'

interface Category {
  id: string
  name: string
  position: number
}

interface Server {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
  ownerId: string
}

interface Member {
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot?: boolean
  }
  role: string
}

interface BuddyAgent {
  id: string
  ownerId: string
  userId: string
  config?: {
    buddyMode?: 'private' | 'shareable'
    allowedServerIds?: string[]
  }
  botUser?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

const canBuddyJoinServer = (agent: BuddyAgent, serverId: string | undefined) => {
  if (!serverId) return false
  if (agent.config?.buddyMode === 'shareable') return true
  return Array.isArray(agent.config?.allowedServerIds)
    ? agent.config.allowedServerIds.includes(serverId)
    : false
}

type ChannelType = 'text' | 'voice' | 'announcement'
type ActiveTab = 'bots' | 'members' | 'myAgents'

export default function CreateChannelScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  useEffect(() => {
    navigation.setOptions({ headerShown: false })
  }, [navigation])

  const [channelName, setChannelName] = useState('')
  const [channelType, setChannelType] = useState<ChannelType>('text')
  const [isPrivate, setIsPrivate] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<ActiveTab>('bots')

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', server?.id],
    queryFn: () => fetchApi<Category[]>(`/api/servers/${server!.id}/categories`),
    enabled: !!server?.id,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members', server?.id],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${server!.id}/members`),
    enabled: !!server?.id,
  })

  const { data: myAgents = [] } = useQuery({
    queryKey: ['my-agents-for-channel-create'],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents'),
  })

  const selectableMembers = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return members
      .filter((m) => !m.user.isBot)
      .filter((m) => {
        if (!q) return true
        const displayName = (m.user.displayName || m.user.username).toLowerCase()
        return displayName.includes(q) || m.user.username.toLowerCase().includes(q)
      })
  }, [members, memberSearch])

  const selectableBots = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return members
      .filter((m) => m.user.isBot)
      .filter((m) => {
        if (!q) return true
        const displayName = (m.user.displayName || m.user.username).toLowerCase()
        return displayName.includes(q) || m.user.username.toLowerCase().includes(q)
      })
  }, [members, memberSearch])

  const serverBotUserIds = useMemo(
    () => new Set(members.filter((m) => m.user.isBot).map((m) => m.user.id)),
    [members],
  )

  const selectableMyAgents = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return myAgents
      .filter((agent) => agent.botUser && !serverBotUserIds.has(agent.botUser.id))
      .filter((agent) => canBuddyJoinServer(agent, server?.id))
      .filter((agent) => {
        if (!q) return true
        const displayName = (
          agent.botUser?.displayName ||
          agent.botUser?.username ||
          ''
        ).toLowerCase()
        return displayName.includes(q)
      })
  }, [memberSearch, myAgents, serverBotUserIds, server?.id])

  const selectionCount = selectedMembers.size + selectedAgents.size

  const channelTypeLabel = (type: ChannelType) => {
    switch (type) {
      case 'voice':
        return t('channel.typeVoice')
      case 'announcement':
        return t('channel.typeAnnouncement')
      default:
        return t('channel.typeText')
    }
  }

  const channelIcon = (type: ChannelType, color: string, size = 18) => {
    switch (type) {
      case 'voice':
        return <Volume2 size={size} color={color} strokeWidth={2.5} />
      case 'announcement':
        return <Megaphone size={size} color={color} strokeWidth={2.5} />
      default:
        return <Hash size={size} color={color} strokeWidth={2.5} />
    }
  }

  const channelIconComponent = (type: ChannelType) => {
    switch (type) {
      case 'voice':
        return Volume2
      case 'announcement':
        return Megaphone
      default:
        return Hash
    }
  }

  const generateChannelName = () => {
    const names: string[] = []

    selectedMembers.forEach((userId) => {
      const member = members.find((item) => item.user.id === userId)
      if (member) names.push(member.user.displayName || member.user.username)
    })

    selectedAgents.forEach((agentId) => {
      const agent = myAgents.find((item) => item.id === agentId)
      if (agent?.botUser) {
        names.push(agent.botUser.displayName || agent.botUser.username || 'Buddy')
      }
    })

    if (names.length === 0) return t('server.newChannel', '新频道')
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]}、${names[1]}`
    return `${names[0]}、${names[1]}等`
  }

  const tabConfig = {
    bots: {
      label: t('members.serverBuddies', '服务器 Buddy'),
      icon: Bot,
      count: selectableBots.length,
    },
    members: {
      label: t('members.serverMembers', '服务器成员'),
      icon: Users,
      count: selectableMembers.length,
    },
    myAgents: {
      label: t('members.myBuddies', '我的 Buddy'),
      icon: Sparkles,
      count: selectableMyAgents.length,
    },
  } as const

  const selectedPreview = useMemo(() => {
    const items: { id: string; name: string; avatarUrl: string | null; userId?: string }[] = []

    selectedMembers.forEach((userId) => {
      const member = members.find((item) => item.user.id === userId)
      if (member) {
        items.push({
          id: member.user.id,
          name: member.user.displayName || member.user.username,
          avatarUrl: member.user.avatarUrl,
          userId: member.user.id,
        })
      }
    })

    selectedAgents.forEach((agentId) => {
      const agent = myAgents.find((item) => item.id === agentId)
      if (agent?.botUser) {
        items.push({
          id: agent.id,
          name: agent.botUser.displayName || agent.botUser.username || 'Buddy',
          avatarUrl: agent.botUser.avatarUrl ?? null,
          userId: agent.botUser.id,
        })
      }
    })

    return items.slice(0, 6)
  }, [members, myAgents, selectedAgents, selectedMembers])

  const toggleMemberSelection = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  const removeSelection = (id: string) => {
    if (selectedMembers.has(id)) {
      toggleMemberSelection(id)
      return
    }

    if (selectedAgents.has(id)) {
      toggleAgentSelection(id)
    }
  }

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!server?.id) throw new Error('Server not found')

      const finalName = channelName.trim() || generateChannelName()
      const channel = await fetchApi<{ id: string }>(`/api/servers/${server.id}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name: finalName, type: channelType, categoryId, isPrivate }),
      })

      const memberPromises = Array.from(selectedMembers).map((userId) =>
        fetchApi(`/api/channels/${channel.id}/members`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
        }),
      )

      const agentPromises = Array.from(selectedAgents).map(async (agentId) => {
        const agent = myAgents.find((item) => item.id === agentId)
        if (!agent) return

        await fetchApi(`/api/servers/${server.id}/agents`, {
          method: 'POST',
          body: JSON.stringify({ agentIds: [agent.id] }),
        })

        if (agent.botUser?.id) {
          await fetchApi(`/api/channels/${channel.id}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: agent.botUser.id }),
          })
        }
      })

      await Promise.all([...memberPromises, ...agentPromises])
      return channel
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['channels', server?.id] })
      router.replace(`/(main)/servers/${serverSlug}/channels/${data.id}` as never)
    },
    onError: (err: Error) => showToast(err.message || t('common.error'), 'error'),
  })

  const createButtonLabel = createChannelMutation.isPending
    ? t('common.creating', '创建中...')
    : selectionCount > 0
      ? `${t('common.create', '创建')} (${selectionCount})`
      : t('common.create', '创建')

  const handleCreate = () => {
    setChannelName(channelName.trim() || generateChannelName() || '')
    createChannelMutation.mutate()
  }

  const handleBack = () => {
    if (channelName.trim() || selectedMembers.size > 0 || selectedAgents.size > 0) {
      Alert.alert(
        t('common.discardChanges', '放弃更改'),
        t('common.discardChangesConfirm', '确定要放弃当前的更改吗？'),
        [
          { text: t('common.cancel', '取消'), style: 'cancel' },
          { text: t('common.discard', '放弃'), style: 'destructive', onPress: () => router.back() },
        ],
      )
      return
    }

    router.back()
  }

  if (isServerLoading || !server) return <LoadingScreen />

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, paddingTop: insets.top + spacing.md },
        ]}
      >
        <IconButton
          icon={ChevronLeft}
          variant="ghost"
          iconColor={colors.text}
          iconSize={26}
          style={styles.headerBtn}
          onPress={handleBack}
        />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: spacing['4xl'],
          }}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('server.createChannel')}
          </Text>
        </View>
        <Button
          onPress={handleCreate}
          disabled={createChannelMutation.isPending}
          loading={createChannelMutation.isPending}
          variant="primary"
          size="sm"
          style={styles.headerCreateBtn}
        >
          {createButtonLabel}
        </Button>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
      >
        <TextField
          value={channelName}
          onChangeText={setChannelName}
          placeholder={t('server.channelNamePlaceholder')}
          autoFocus
          left={channelIcon(channelType, colors.textMuted, 18)}
          containerStyle={styles.nameField}
          style={styles.inputFrame}
          inputStyle={styles.inputText}
        />
        <View style={styles.section}>
          <View style={styles.typeAndPrivacyRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeChipsRow}
            >
              {(['text', 'voice', 'announcement'] as ChannelType[]).map((item) => {
                const selected = channelType === item
                return (
                  <ChipButton
                    key={item}
                    label={channelTypeLabel(item)}
                    icon={channelIconComponent(item)}
                    active={selected}
                    style={styles.typeChip}
                    onPress={() => setChannelType(item)}
                  />
                )
              })}
            </ScrollView>
            <ChipButton
              label={t('channel.private', '私密')}
              icon={Lock}
              active={isPrivate}
              style={styles.privateToggleCompact}
              onPress={() => setIsPrivate(!isPrivate)}
            />
          </View>
        </View>

        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t('server.channelCategory')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              <ChipButton
                label={t('server.noCategory')}
                icon={Layers3}
                active={!categoryId}
                style={styles.categoryChip}
                onPress={() => setCategoryId(null)}
              />

              {categories.map((cat) => (
                <ChipButton
                  key={cat.id}
                  label={cat.name}
                  active={categoryId === cat.id}
                  style={styles.categoryChip}
                  onPress={() => setCategoryId(cat.id)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          {selectionCount > 0 && (
            <View style={styles.selectedSection}>
              <Text style={[styles.selectedLabel, { color: colors.textSecondary }]}>已选择</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedRow}
              >
                {selectedPreview.map((item) => (
                  <CardPressable
                    key={item.id}
                    onPress={() => removeSelection(item.id)}
                    variant="glass"
                    padded={false}
                    style={styles.selectedChip}
                  >
                    <Avatar uri={item.avatarUrl} name={item.name} size={24} userId={item.userId} />
                    <Text
                      style={[styles.selectedChipText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <X size={12} color={colors.textMuted} />
                  </CardPressable>
                ))}
              </ScrollView>
            </View>
          )}
          <View
            style={[
              styles.selectionSection,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <TextField
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder={t('members.searchMembers', '搜索成员')}
              left={<Search size={16} color={colors.textMuted} />}
              right={
                memberSearch.length > 0 ? (
                  <IconButton
                    icon={X}
                    variant="ghost"
                    iconColor={colors.textMuted}
                    iconSize={14}
                    style={styles.clearButton}
                    onPress={() => setMemberSearch('')}
                  />
                ) : null
              }
              containerStyle={styles.memberSearchField}
              style={styles.searchFrame}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabRow}
            >
              {(Object.keys(tabConfig) as ActiveTab[]).map((key) => {
                const tab = tabConfig[key]
                const Icon = tab.icon
                const selected = activeTab === key

                return (
                  <ChipButton
                    key={key}
                    label={`${tab.label} ${tab.count}`}
                    icon={Icon}
                    active={selected}
                    style={styles.tab}
                    onPress={() => setActiveTab(key)}
                  />
                )
              })}
            </ScrollView>

            <View style={styles.listSection}>
              {activeTab === 'bots' &&
                selectableBots.map((member) => {
                  const selected = selectedMembers.has(member.user.id)
                  return (
                    <SelectableRow
                      key={member.user.id}
                      colors={colors}
                      selected={selected}
                      name={member.user.displayName || member.user.username}
                      meta="Server Buddy"
                      avatarUrl={member.user.avatarUrl}
                      userId={member.user.id}
                      onPress={() => toggleMemberSelection(member.user.id)}
                    />
                  )
                })}

              {activeTab === 'members' &&
                selectableMembers.map((member) => {
                  const selected = selectedMembers.has(member.user.id)
                  return (
                    <SelectableRow
                      key={member.user.id}
                      colors={colors}
                      selected={selected}
                      name={member.user.displayName || member.user.username}
                      meta={`@${member.user.username}`}
                      avatarUrl={member.user.avatarUrl}
                      userId={member.user.id}
                      onPress={() => toggleMemberSelection(member.user.id)}
                    />
                  )
                })}

              {activeTab === 'myAgents' &&
                selectableMyAgents.map((agent) => {
                  const selected = selectedAgents.has(agent.id)
                  return (
                    <SelectableRow
                      key={agent.id}
                      colors={colors}
                      selected={selected}
                      name={agent.botUser?.displayName || agent.botUser?.username || '?'}
                      meta={t('members.notOnServer', '未加入服务器')}
                      avatarUrl={agent.botUser?.avatarUrl ?? null}
                      userId={agent.botUser?.id}
                      highlight
                      onPress={() => toggleAgentSelection(agent.id)}
                    />
                  )
                })}

              {((activeTab === 'bots' && selectableBots.length === 0) ||
                (activeTab === 'members' && selectableMembers.length === 0) ||
                (activeTab === 'myAgents' && selectableMyAgents.length === 0)) && (
                <View style={styles.emptyStateWrap}>
                  <CircleAlert size={18} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    {activeTab === 'bots'
                      ? t('members.noServerBuddies', '暂无服务器 Buddy')
                      : activeTab === 'members'
                        ? t('members.noServerMembers', '暂无服务器成员')
                        : t('members.noMyBuddies', '暂无我的 Buddy')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function SelectableRow({
  colors,
  selected,
  name,
  meta,
  avatarUrl,
  userId,
  highlight = false,
  onPress,
}: {
  colors: ReturnType<typeof useColors>
  selected: boolean
  name: string
  meta: string
  avatarUrl: string | null
  userId?: string
  highlight?: boolean
  onPress: () => void
}) {
  return (
    <CardPressable
      variant="glassCard"
      active={selected}
      padded={false}
      style={[
        styles.memberRow,
        {
          backgroundColor: selected ? `${colors.primary}0D` : colors.glassSoft,
        },
      ]}
      onPress={onPress}
    >
      <Avatar uri={avatarUrl} name={name} size={44} userId={userId} />
      <View style={styles.memberInfo}>
        <Text
          style={[styles.memberName, { color: highlight ? colors.primary : colors.text }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[styles.memberMeta, { color: colors.textMuted }]}>{meta}</Text>
      </View>
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: selected ? colors.primary : 'transparent',
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        {selected && <Check size={14} color="#fff" />}
      </View>
    </CardPressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerBtn: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerCreateBtn: {
    minWidth: 84,
    height: 38,
  },
  nameField: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  inputFrame: {
    minHeight: 52,
    borderRadius: 18,
  },
  inputText: {
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  typeAndPrivacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typeChipsRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  typeChip: {
    minHeight: 36,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  categoryChip: {
    paddingHorizontal: 16,
  },
  privateToggleCompact: {
    flexShrink: 0,
  },
  selectionSection: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  memberSearchField: {
    marginBottom: spacing.md,
  },
  searchFrame: {
    minHeight: 48,
    borderRadius: 16,
  },
  clearButton: {
    width: 28,
    height: 28,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
    marginBottom: spacing.md,
  },
  tab: {
    minHeight: 36,
  },
  selectedSection: {
    marginBottom: spacing.md,
    marginHorizontal: -spacing.md,
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  selectedRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    maxWidth: 160,
  },
  selectedChipText: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  listSection: {
    gap: spacing.sm,
  },
  emptyStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
  },
  memberMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
