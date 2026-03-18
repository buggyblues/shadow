import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import {
  ChevronRight,
  Compass,
  Hash,
  HelpCircle,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'
import Reanimated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/components/common/avatar'
import {
  AgentCatSvg,
  ChannelCatSvg,
  HelpBuddySvg,
  HelpProductSvg,
  HelpStartSvg,
  TabHomeSvg,
  WorkCatSvg,
} from '../../../src/components/common/cat-svg'
import { DottedBackground } from '../../../src/components/common/dotted-background'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

function SquishyRow({
  children,
  onPress,
  style: rowStyle,
}: {
  children: React.ReactNode
  onPress: () => void
  style?: StyleProp<ViewStyle>
}) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
    >
      <Animated.View style={[rowStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

interface ServerEntry {
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
    description?: string | null
    memberCount?: number
    channelCount?: number
  }
  member: {
    role: string
  }
}

interface DiscoverServer {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  isPublic: boolean
  inviteCode: string
  memberCount: number
}

export default function ServersScreen() {
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')

  const [showHelpTutorial, setShowHelpTutorial] = useState(false)
  const [hideHelpIcon, setHideHelpIcon] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem('hideHomeHelpIcon').then((val) => {
      if (val === 'true') {
        setHideHelpIcon(true)
      }
    })
  }, [])

  const handleCloseTutorial = async () => {
    if (dontShowAgain) {
      await AsyncStorage.setItem('hideHomeHelpIcon', 'true')
      setHideHelpIcon(true)
    }
    setShowHelpTutorial(false)
  }

  const {
    data: servers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  // Fetch public servers for federated search
  const { data: discoverServers = [] } = useQuery({
    queryKey: ['discover-servers'],
    queryFn: () => fetchApi<DiscoverServer[]>('/api/servers/discover'),
  })

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<Array<{ friendshipId: string }>>('/api/friends/pending'),
  })

  const [refreshing, setRefreshing] = useState(false)

  const queryClient = useQueryClient()
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [createName, setCreateName] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name: createName, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreateServer(false)
      setCreateName('')
      router.push(`/(main)/servers/${data.slug ?? data.id}`)
    },
  })

  // Merge local + discover servers when searching
  const myServerIds = useMemo(() => new Set(servers.map((s) => s.server.id)), [servers])

  const filtered = useMemo(() => {
    if (!search.trim()) return servers
    const q = search.toLowerCase()
    return servers.filter(
      (s) =>
        s.server.name.toLowerCase().includes(q) || s.server.description?.toLowerCase().includes(q),
    )
  }, [servers, search])

  // Public servers matching search but not already joined
  const matchedPublicServers = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return discoverServers.filter(
      (s) =>
        !myServerIds.has(s.id) &&
        (s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)),
    )
  }, [discoverServers, search, myServerIds])

  // Group servers by role
  const sections = useMemo(() => {
    const owned = filtered.filter((s) => s.member.role === 'owner')
    const others = filtered.filter((s) => s.member.role !== 'owner')
    const result: { title: string; data: ServerEntry[] }[] = []
    if (owned.length > 0) result.push({ title: '我创建的', data: owned })
    if (others.length > 0) result.push({ title: '已加入', data: others })
    if (result.length === 0 && filtered.length > 0) result.push({ title: '全部', data: filtered })
    return result
  }, [filtered])

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return '创建者'
      case 'admin':
        return '管理员'
      default:
        return '成员'
    }
  }

  if (isLoading) return <LoadingScreen />

  const { width: screenWidth } = Dimensions.get('window')
  const tutorialWidth = screenWidth * 0.85

  return (
    <DottedBackground>
      {/* Navigation bar */}
      <Reanimated.View
        entering={FadeIn.duration(400)}
        style={[styles.navBar, { paddingTop: insets.top + 8, backgroundColor: 'transparent' }]}
      >
        <Pressable
          onPress={() => {
            router.push('/(main)/dashboard' as never)
          }}
          hitSlop={8}
        >
          <Avatar
            uri={user?.avatarUrl}
            name={user?.displayName || user?.username || ''}
            size={32}
            userId={user?.id || ''}
          />
        </Pressable>
        <View style={styles.navActions}>
          {!hideHelpIcon && (
            <Pressable
              onPress={() => setShowHelpTutorial(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
            >
              <HelpCircle size={22} color={colors.text} strokeWidth={2} />
            </Pressable>
          )}
          <SquishyRow onPress={() => setShowCreateServer(true)}>
            <View
              style={[styles.navPlusBubble, { backgroundColor: '#00f3ff', borderColor: '#00c3cc' }]}
            >
              <Plus size={20} color="#1a1a1c" strokeWidth={3} />
            </View>
          </SquishyRow>
        </View>
      </Reanimated.View>

      {/* Search bar */}
      <View style={[styles.searchWrap]}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Search size={18} color={colors.textMuted} strokeWidth={2.5} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="搜索服务器..."
            placeholderTextColor={colors.textMuted}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <X size={16} color={colors.textMuted} strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      </View>

      {filtered.length === 0 && matchedPublicServers.length === 0 ? (
        <EmptyState
          icon="💬"
          title={search ? '没有找到匹配的服务器' : '暂无服务器'}
          description={search ? undefined : '点击右上角 + 创建或加入一个服务器'}
        />
      ) : (
        <SectionList
          sections={[
            ...sections,
            ...(matchedPublicServers.length > 0
              ? [
                  {
                    title: '🌐 公开服务器',
                    data: matchedPublicServers.map((s) => ({
                      server: {
                        id: s.id,
                        name: s.name,
                        slug: s.slug,
                        iconUrl: s.iconUrl,
                        description: s.description,
                      },
                      member: { role: '_public' },
                    })),
                  },
                ]
              : []),
          ]}
          keyExtractor={(item) => item.server.id}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true)
                await refetch()
                setRefreshing(false)
              }}
              tintColor={colors.textMuted}
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={
            <View style={styles.quickEntryWrapper}>
              <SquishyRow
                style={[
                  styles.quickEntryCard,
                  { backgroundColor: `${colors.surface}E6`, borderColor: colors.border },
                ]}
                onPress={() => router.push('/(main)/friends' as never)}
              >
                <LinearGradient colors={['#EF4444', '#F87171']} style={styles.actionBubbleGlow}>
                  <AgentCatSvg width={36} height={36} />
                </LinearGradient>
                <View style={styles.quickEntryInfo}>
                  <Text style={[styles.quickEntryTitle, { color: colors.text }]}>好友与私信</Text>
                  <Text style={[styles.quickEntryDesc, { color: colors.textMuted }]}>
                    查看好友、请求与私信会话
                  </Text>
                </View>
                {pendingReceived.length > 0 && (
                  <View style={styles.quickEntryBadge}>
                    <Text style={styles.quickEntryBadgeText}>{pendingReceived.length}</Text>
                  </View>
                )}
                <ChevronRight size={16} color={colors.textMuted} />
              </SquishyRow>

              <SquishyRow
                style={[
                  styles.quickEntryCard,
                  { backgroundColor: `${colors.surface}E6`, borderColor: colors.border },
                ]}
                onPress={() => router.push('/(main)/discover' as never)}
              >
                <LinearGradient colors={['#3B82F6', '#60A5FA']} style={styles.actionBubbleGlow}>
                  <WorkCatSvg width={36} height={36} />
                </LinearGradient>
                <View style={styles.quickEntryInfo}>
                  <Text style={[styles.quickEntryTitle, { color: colors.text }]}>探索服务器</Text>
                  <Text style={[styles.quickEntryDesc, { color: colors.textMuted }]}>
                    发现公开服务器并快速加入
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </SquishyRow>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {section.title}
              </Text>
              <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                {section.data.length}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isPublicResult = item.member.role === '_public'
            const desc = isPublicResult
              ? item.server.description || '公开服务器'
              : item.server.description || getRoleLabel(item.member.role)
            return (
              <Reanimated.View entering={FadeInRight.delay(index * 40).springify()}>
                <SquishyRow
                  style={[
                    styles.serverCard,
                    {
                      backgroundColor: `${colors.surface}E6`,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    if (isPublicResult) {
                      router.push('/(main)/discover' as never)
                    } else {
                      router.push(`/(main)/servers/${item.server.slug ?? item.server.id}`)
                    }
                  }}
                >
                  <Avatar
                    uri={item.server.iconUrl}
                    name={item.server.name}
                    size={48}
                    userId={item.server.id}
                  />
                  <View style={styles.serverInfo}>
                    <View style={styles.serverTopRow}>
                      <Text style={[styles.serverName, { color: colors.text }]} numberOfLines={1}>
                        {item.server.name}
                      </Text>
                      {!isPublicResult && (
                        <View
                          style={[
                            styles.roleBadge,
                            {
                              backgroundColor:
                                item.member.role === 'owner'
                                  ? `${colors.primary}15`
                                  : `${colors.textMuted}15`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleText,
                              {
                                color:
                                  item.member.role === 'owner' ? colors.primary : colors.textMuted,
                              },
                            ]}
                          >
                            {getRoleLabel(item.member.role)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!isPublicResult && (
                      <View style={styles.serverMetaRow}>
                        <Users size={12} color={colors.textMuted} />
                        <Text style={[styles.serverMeta, { color: colors.textMuted }]}>
                          {item.server.memberCount ?? 0}
                        </Text>
                        <Hash size={12} color={colors.textMuted} style={{ marginLeft: 6 }} />
                        <Text style={[styles.serverMeta, { color: colors.textMuted }]}>
                          {item.server.channelCount ?? 0}
                        </Text>
                      </View>
                    )}
                    {isPublicResult && (
                      <Text
                        style={[styles.serverDesc, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {desc}
                      </Text>
                    )}
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
                </SquishyRow>
              </Reanimated.View>
            )
          }}
          SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        />
      )}

      {/* Create Server Modal — Compact like channel creation */}
      <Modal
        visible={showCreateServer}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateServer(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Pressable style={styles.modalDismiss} onPress={() => setShowCreateServer(false)} />
          <Reanimated.View
            entering={FadeInDown.duration(250)}
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>创建服务器</Text>
              <Pressable onPress={() => setShowCreateServer(false)} hitSlop={8}>
                <X size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Name input */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>服务器名称</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={createName}
              onChangeText={setCreateName}
              placeholder="输入服务器名称"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            {/* Public toggle inline */}
            <Pressable style={styles.switchRow} onPress={() => setIsPublic(!isPublic)}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>公开</Text>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </Pressable>

            {/* Create button */}
            <Pressable
              style={[
                styles.createBtn,
                { backgroundColor: colors.primary },
                (!createName.trim() || createMutation.isPending) && { opacity: 0.5 },
              ]}
              onPress={() => createMutation.mutate()}
              disabled={!createName.trim() || createMutation.isPending}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.md }}>
                {createMutation.isPending ? '创建中...' : '创建'}
              </Text>
            </Pressable>
          </Reanimated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Product Tutorial Modal */}
      <Modal
        visible={showHelpTutorial}
        animationType="fade"
        transparent
        onRequestClose={handleCloseTutorial}
      >
        <View style={styles.modalOverlay}>
          <Reanimated.View
            entering={FadeInDown.duration(250)}
            style={[
              styles.tutorialContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.tutorialHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>新手帮助指南</Text>
              <Pressable onPress={handleCloseTutorial} hitSlop={8}>
                <X size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{
                width: tutorialWidth - spacing.xl * 2,
                height: tutorialWidth - spacing.xl * 2,
                maxHeight: 280,
                borderRadius: 24,
                backgroundColor: colors.background,
              }}
            >
              <View style={[styles.tutorialPage, { width: tutorialWidth - spacing.xl * 2 }]}>
                <HelpProductSvg size={88} color={colors.primary} />
                <Text style={[styles.tutorialPageTitle, { color: colors.text }]}>
                  超萌可爱的界面下
                </Text>
                <Text style={[styles.tutorialPageDesc, { color: colors.textMuted }]}>
                  隐藏着硬核的生产力工具！在这里你可以拥有自己的 AI 社区、店铺和工作区。
                </Text>
              </View>
              <View style={[styles.tutorialPage, { width: tutorialWidth - spacing.xl * 2 }]}>
                <HelpBuddySvg size={88} color="#f59e0b" />
                <Text style={[styles.tutorialPageTitle, { color: colors.text }]}>
                  黑猫打工仔 Buddy
                </Text>
                <Text style={[styles.tutorialPageDesc, { color: colors.textMuted }]}>
                  多 Agent 小助手 24 小时在线协作，写代码、审方案、查资料，持续输出生产力。
                </Text>
              </View>
              <View style={[styles.tutorialPage, { width: tutorialWidth - spacing.xl * 2 }]}>
                <HelpStartSvg size={88} color="#3b82f6" />
                <Text style={[styles.tutorialPageTitle, { color: colors.text }]}>
                  超级个体就玩超级社区
                </Text>
                <Text style={[styles.tutorialPageDesc, { color: colors.textMuted }]}>
                  点击右上角 + 创建服务器，开始搭建你的频道、工作流与社群协作空间。
                </Text>
              </View>
            </ScrollView>

            <Pressable style={styles.switchRow} onPress={() => setDontShowAgain(!dontShowAgain)}>
              <Text style={[styles.switchLabel, { color: colors.text, fontSize: fontSize.sm }]}>
                不再显示
              </Text>
              <Switch
                value={dontShowAgain}
                onValueChange={setDontShowAgain}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </Pressable>

            <Pressable
              style={[styles.createBtn, { backgroundColor: colors.primary }]}
              onPress={handleCloseTutorial}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.md }}>
                我明白啦
              </Text>
            </Pressable>
          </Reanimated.View>
        </View>
      </Modal>
    </DottedBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  navPlusBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  navBtn: {
    padding: 4,
  },

  // Search
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 24, // Make it rounder
    height: 48, // Taller search bar
    gap: spacing.sm,
    borderWidth: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    paddingVertical: 0,
  },

  quickEntryWrapper: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  quickEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: 24,
    borderWidth: 2,
  },
  actionBubbleGlow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  quickEntryInfo: {
    flex: 1,
  },
  quickEntryTitle: {
    fontSize: fontSize.md,
    fontWeight: '800', // Making it bolder
  },
  quickEntryDesc: {
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  quickEntryBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ed4245',
    marginRight: 2,
  },
  quickEntryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Server list item
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
    borderRadius: 24,
    borderWidth: 2,
  },
  serverInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  serverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serverName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '700',
  },
  serverDesc: {
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  serverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  serverMeta: {
    fontSize: fontSize.xs,
  },
  groupGap: {
    height: spacing.md,
  },

  // Modal — compact
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '85%',
    borderRadius: 32, // Bubbly modal
    padding: spacing.xl,
    borderWidth: 2,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  input: {
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  createBtn: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  tutorialContent: {
    width: '85%',
    borderRadius: 32,
    padding: spacing.xl,
    paddingBottom: spacing.lg,
    borderWidth: 2,
    gap: spacing.sm,
  },
  tutorialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  tutorialPage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  tutorialPageTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  tutorialPageDesc: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
})
