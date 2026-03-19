import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Hash,
  Megaphone,
  Search,
  Volume2,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { fontSize, spacing, useColors } from '../../../../src/theme'

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
  botUser?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

export default function CreateChannelScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const _currentUser = useAuthStore((s) => s.user)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    navigation.setOptions({ headerShown: false })
  }, [navigation])

  const [channelName, setChannelName] = useState('')
  const [channelType, setChannelType] = useState<'text' | 'voice' | 'announcement'>('text')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'bots' | 'members' | 'myAgents'>('bots')
  const [showTypeSelector, setShowTypeSelector] = useState(false)

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
        const name = (m.user.displayName || m.user.username).toLowerCase()
        return name.includes(q) || m.user.username.toLowerCase().includes(q)
      })
  }, [members, memberSearch])

  const selectableBots = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return members
      .filter((m) => m.user.isBot)
      .filter((m) => {
        if (!q) return true
        const name = (m.user.displayName || m.user.username).toLowerCase()
        return name.includes(q)
      })
  }, [members, memberSearch])

  const serverBotUserIds = useMemo(
    () => new Set(members.filter((m) => m.user.isBot).map((m) => m.user.id)),
    [members],
  )

  const selectableMyAgents = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return myAgents
      .filter((a) => a.botUser && !serverBotUserIds.has(a.botUser.id))
      .filter((a) => {
        if (!q) return true
        const name = (a.botUser?.displayName || a.botUser?.username || '').toLowerCase()
        return name.includes(q)
      })
  }, [myAgents, serverBotUserIds, memberSearch])

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

  const channelTypeLabel = (type: 'text' | 'voice' | 'announcement') => {
    switch (type) {
      case 'voice':
        return t('channel.typeVoice')
      case 'announcement':
        return t('channel.typeAnnouncement')
      default:
        return t('channel.typeText')
    }
  }

  const channelIcon = (type: string, color: string, size = 18) => {
    switch (type) {
      case 'voice':
        return <Volume2 size={size} color={color} strokeWidth={2.5} />
      case 'announcement':
        return <Megaphone size={size} color={color} strokeWidth={2.5} />
      default:
        return <Hash size={size} color={color} strokeWidth={2.5} />
    }
  }

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!server?.id) throw new Error('Server not found')
      const finalName = channelName.trim() || generateChannelName()
      const channel = await fetchApi<{ id: string }>(`/api/servers/${server.id}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name: finalName, type: channelType, categoryId }),
      })
      const memberPromises = Array.from(selectedMembers).map((userId) =>
        fetchApi(`/api/channels/${channel.id}/members`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
        }),
      )
      const agentPromises = Array.from(selectedAgents).map(async (agentId) => {
        const agent = myAgents.find((a) => a.id === agentId)
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
    onError: (err: Error) => showToast(err?.message || t('common.error'), 'error'),
  })

  const generateChannelName = () => {
    const names: string[] = []
    selectedMembers.forEach((userId) => {
      const member = members.find((m) => m.user.id === userId)
      if (member) names.push(member.user.displayName || member.user.username)
    })
    selectedAgents.forEach((agentId) => {
      const agent = myAgents.find((a) => a.id === agentId)
      if (agent?.botUser) names.push(agent.botUser.displayName || agent.botUser.username || 'Buddy')
    })
    if (names.length === 0) return t('server.newChannel', '新频道')
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]}、${names[1]}`
    return `${names[0]}、${names[1]}等`
  }

  const handleCreate = () => {
    const finalName = channelName.trim() || generateChannelName()
    setChannelName(finalName || '')
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
    } else {
      router.back()
    }
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
        <Pressable onPress={handleBack} hitSlop={8} style={styles.headerBtn}>
          <ChevronLeft size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('server.createChannel')}
        </Text>
        <Pressable
          onPress={handleCreate}
          disabled={createChannelMutation.isPending}
          style={[
            styles.createBtn,
            {
              opacity: createChannelMutation.isPending ? 0.5 : 1,
              backgroundColor: colors.primary,
              borderRadius: 8,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
        >
          <Text style={[styles.createBtnText, { color: '#fff' }]}>
            {createChannelMutation.isPending
              ? t('common.creating', '创建中...')
              : selectedMembers.size > 0 || selectedAgents.size > 0
                ? t('common.createWithCount', '创建({{count}})', {
                    count: selectedMembers.size + selectedAgents.size,
                  })
                : t('common.create')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
      >
        {/* Channel Name & Type in one row - no labels */}
        <View style={styles.section}>
          <View style={styles.nameTypeRow}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                  flex: 1,
                },
              ]}
              value={channelName}
              onChangeText={setChannelName}
              placeholder={t('server.channelNamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <Pressable style={styles.typeSelector} onPress={() => setShowTypeSelector(true)}>
              <View style={[styles.typeIconContainer, { backgroundColor: colors.inputBackground }]}>
                {channelIcon(channelType, colors.primary, 24)}
              </View>
              <ChevronRight
                size={16}
                color={colors.textMuted}
                style={{ transform: [{ rotate: '90deg' }] }}
              />
            </Pressable>
          </View>
        </View>

        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t('server.channelCategory')}
            </Text>
            <View style={styles.categoryRow}>
              <Pressable
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: !categoryId ? '#ff7da520' : colors.inputBackground,
                    borderColor: !categoryId ? '#ff7da5' : colors.border,
                  },
                ]}
                onPress={() => setCategoryId(null)}
              >
                <Text style={{ color: !categoryId ? '#e85b85' : colors.text }}>
                  {t('server.noCategory')}
                </Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: categoryId === cat.id ? '#f8e71c20' : colors.inputBackground,
                      borderColor: categoryId === cat.id ? '#f8e71c' : colors.border,
                    },
                  ]}
                  onPress={() => setCategoryId(cat.id)}
                >
                  <Text style={{ color: categoryId === cat.id ? '#b3a100' : colors.text }}>
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={[styles.searchRow, { backgroundColor: colors.inputBackground }]}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder={t('members.searchMembers', '搜索成员')}
              placeholderTextColor={colors.textMuted}
            />
            {memberSearch.length > 0 && (
              <Pressable onPress={() => setMemberSearch('')} hitSlop={8}>
                <X size={14} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabRow}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            <Pressable
              style={[
                styles.tab,
                activeTab === 'bots' && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
              onPress={() => setActiveTab('bots')}
            >
              <Text style={{ color: activeTab === 'bots' ? colors.primary : colors.textMuted }}>
                {t('members.serverBuddies', '服务器 Buddy')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.tab,
                activeTab === 'members' && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveTab('members')}
            >
              <Text style={{ color: activeTab === 'members' ? colors.primary : colors.textMuted }}>
                {t('members.serverMembers', '服务器成员')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.tab,
                activeTab === 'myAgents' && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveTab('myAgents')}
            >
              <Text style={{ color: activeTab === 'myAgents' ? colors.primary : colors.textMuted }}>
                {t('members.myBuddies', '我的 Buddy')}
              </Text>
            </Pressable>
          </ScrollView>

          {activeTab === 'bots' &&
            selectableBots.length > 0 &&
            selectableBots.map((m) => (
              <Pressable
                key={m.user.id}
                style={styles.memberRow}
                onPress={() => toggleMemberSelection(m.user.id)}
              >
                <Avatar
                  uri={m.user.avatarUrl}
                  name={m.user.displayName || m.user.username}
                  size={40}
                  userId={m.user.id}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.primary }]} numberOfLines={1}>
                    {m.user.displayName || m.user.username}
                  </Text>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: selectedMembers.has(m.user.id)
                        ? colors.primary
                        : 'transparent',
                      borderColor: selectedMembers.has(m.user.id) ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {selectedMembers.has(m.user.id) && <Check size={14} color="#fff" />}
                </View>
              </Pressable>
            ))}
          {activeTab === 'bots' && selectableBots.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {t('members.noServerBuddies', '暂无服务器 Buddy')}
            </Text>
          )}

          {activeTab === 'members' &&
            selectableMembers.length > 0 &&
            selectableMembers.map((m) => (
              <Pressable
                key={m.user.id}
                style={styles.memberRow}
                onPress={() => toggleMemberSelection(m.user.id)}
              >
                <Avatar
                  uri={m.user.avatarUrl}
                  name={m.user.displayName || m.user.username}
                  size={40}
                  userId={m.user.id}
                />
                <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                  {m.user.displayName || m.user.username}
                </Text>
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: selectedMembers.has(m.user.id)
                        ? colors.primary
                        : 'transparent',
                      borderColor: selectedMembers.has(m.user.id) ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {selectedMembers.has(m.user.id) && <Check size={14} color="#fff" />}
                </View>
              </Pressable>
            ))}
          {activeTab === 'members' && selectableMembers.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {t('members.noServerMembers', '暂无服务器成员')}
            </Text>
          )}

          {activeTab === 'myAgents' &&
            selectableMyAgents.length > 0 &&
            selectableMyAgents.map((a) => (
              <Pressable
                key={a.id}
                style={styles.memberRow}
                onPress={() => toggleAgentSelection(a.id)}
              >
                <Avatar
                  uri={a.botUser?.avatarUrl ?? null}
                  name={a.botUser?.displayName || a.botUser?.username || '?'}
                  size={40}
                  userId={a.botUser?.id}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.primary }]} numberOfLines={1}>
                    {a.botUser?.displayName || a.botUser?.username || '?'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                    {t('members.notOnServer', '未加入服务器')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: selectedAgents.has(a.id) ? colors.primary : 'transparent',
                      borderColor: selectedAgents.has(a.id) ? colors.primary : colors.border,
                    },
                  ]}
                >
                  {selectedAgents.has(a.id) && <Check size={14} color="#fff" />}
                </View>
              </Pressable>
            ))}
          {activeTab === 'myAgents' && selectableMyAgents.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {t('members.noMyBuddies', '暂无我的 Buddy')}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Type Selector Modal */}
      <Modal
        visible={showTypeSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypeSelector(false)}
      >
        <Pressable style={styles.typeModalOverlay} onPress={() => setShowTypeSelector(false)}>
          <View style={[styles.typeModalContent, { backgroundColor: colors.surface }]}>
            {(['text', 'voice', 'announcement'] as const).map((type, index) => (
              <Pressable
                key={type}
                style={[
                  styles.typeModalItem,
                  index < 2 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
                onPress={() => {
                  setChannelType(type)
                  setShowTypeSelector(false)
                }}
              >
                <View style={styles.typeModalItemContent}>
                  {channelIcon(type, channelType === type ? colors.primary : colors.text, 24)}
                  <Text
                    style={[
                      styles.typeModalItemText,
                      { color: channelType === type ? colors.primary : colors.text },
                    ]}
                  >
                    {channelTypeLabel(type)}
                  </Text>
                  {channelType === type && (
                    <View style={styles.checkmark}>
                      <Check size={20} color={colors.primary} />
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
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
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  createBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  createBtnText: { fontSize: 16, fontWeight: '600' },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  label: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  input: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontWeight: '500',
    borderWidth: 0,
  },
  nameTypeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameContainer: { flex: 1 },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  typeIconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 20,
    borderWidth: 2,
    gap: 8,
  },
  typeBtnText: { fontSize: 14, fontWeight: '800' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: 24,
    gap: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  searchInput: { flex: 1, fontSize: fontSize.md, height: 48 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 0,
    marginBottom: spacing.md,
  },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.lg },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    marginBottom: spacing.xs,
  },
  memberName: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBadge: {
    position: 'absolute',
    bottom: 100,
    right: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingBadgeText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  typeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  typeModalContent: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '80%',
    maxWidth: 300,
  },
  typeModalItem: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  typeModalItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  typeModalItemText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  checkmark: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
