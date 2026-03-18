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
  WorkCatSvg,
} from '../../../src/components/common/cat-svg'
import { DottedBackground } from '../../../src/components/common/dotted-background'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { OnboardingModal } from '../../../src/components/common/onboarding-modal'
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
  const [tutorialPageIndex, setTutorialPageIndex] = useState(0)
  
  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem('hideHomeHelpIcon').then((val) => {
      if (val === 'true') {
        setHideHelpIcon(true)
      }
    })
    
    // Check if user has seen onboarding
    AsyncStorage.getItem('hasSeenOnboarding').then((value) => {
      if (!value) {
        setShowOnboarding(true)
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
  const tutorialInnerWidth = tutorialWidth - spacing.xl * 2
  const tutorialPages = [
    {
      key: 'positioning',
      title: '超萌可爱的界面下',
      desc: '隐藏着硬核的生产力工具！你可以在这里拥有自己的 AI 社区、店铺和工作区。',
      tags: ['产品定位', '超级社区', '协作空间'],
      renderIcon: () => <HelpProductSvg size={88} color={colors.primary} />,
    },
    {
      key: 'server',
      title: '什么是服务器？',
      desc: '服务器是你的社区“主空间”，承载成员、频道、规则和资源。可公开，也可私密。',
      tags: ['成员管理', '公开/私密', '社区中枢'],
      renderIcon: () => <WorkCatSvg width={88} height={88} />,
    },
    {
      key: 'channel',
      title: '什么是频道？',
      desc: '频道是服务器里的话题房间。你可以按讨论主题拆分，让信息更清晰不混乱。',
      tags: ['话题分区', '信息沉淀', '高效沟通'],
      renderIcon: () => <ChannelCatSvg width={88} height={88} />,
    },
    {
      key: 'buddy',
      title: '什么是 Buddy？',
      desc: 'Buddy 是黑猫打工仔：能写代码、审方案、查资料，24 小时在线协作。',
      tags: ['多 Agent', '自动协作', '持续产出'],
      renderIcon: () => <HelpBuddySvg size={88} color="#f59e0b" />,
    },
    {
      key: 'start',
      title: '开始奇妙之旅',
      desc: '点击右上角 + 创建服务器，接着建频道、邀请成员，再召唤 Buddy 开始协作。',
      tags: ['创建服务器', '搭建频道', '召唤 Buddy'],
      renderIcon: () => <HelpStartSvg size={88} color="#3b82f6" />,
    },
  ]

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
          title={search ? '没有找到匹配的服务器' : '还没有服务器'}
          description={search ? undefined : '创建你的第一个服务器，或者探索公开社区'}
          actions={
            search
              ? undefined
              : [
                  {
                    icon: Plus,
                    label: '创建服务器',
                    onPress: () => setShowCreateServer(true),
                    primary: true,
                  },
                  {
                    icon: Compass,
                    label: '探索社区',
                    onPress: () => router.push('/(main)/(tabs)/discover'),
                  },
                ]
          }
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
              onMomentumScrollEnd={(event) => {
                const next = Math.round(event.nativeEvent.contentOffset.x / tutorialInnerWidth)
                setTutorialPageIndex(Math.max(0, Math.min(next, tutorialPages.length - 1)))
              }}
              style={{
                width: tutorialInnerWidth,
                height: tutorialInnerWidth,
                maxHeight: 280,
                borderRadius: 24,
                backgroundColor: colors.background,
              }}
            >
              {tutorialPages.map((page) => (
                <View key={page.key} style={[styles.tutorialPage, { width: tutorialInnerWidth }]}>
                  {page.renderIcon()}
                  <Text style={[styles.tutorialPageTitle, { color: colors.text }]}>
                    {page.title}
                  </Text>
                  <Text style={[styles.tutorialPageDesc, { color: colors.textMuted }]}>
                    {page.desc}
                  </Text>
                  <View style={styles.tutorialTagRow}>
                    {page.tags.map((tag) => (
                      <View
                        key={`${page.key}-${tag}`}
                        style={[styles.tutorialTag, { backgroundColor: `${colors.primary}14` }]}
                      >
                        <Text style={[styles.tutorialTagText, { color: colors.primary }]}>
                          {tag}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.tutorialIndicatorRow}>
              {tutorialPages.map((page, idx) => (
                <View
                  key={`dot-${page.key}`}
                  style={[
                    styles.tutorialIndicatorDot,
                    {
                      backgroundColor:
                        idx === tutorialPageIndex ? colors.primary : `${colors.textMuted}40`,
                      width: idx === tutorialPageIndex ? 16 : 7,
                    },
                  ]}
                />
              ))}
            </View>

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
  tutorialTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tutorialTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  tutorialTagText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  tutorialIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  tutorialIndicatorDot: {
    height: 7,
    borderRadius: 99,
  },
})

// Onboarding Modal Component
function OnboardingModal({
  visible,
  onClose,
  onCreateServer,
}: {
  visible: boolean
  onClose: () => void
  onCreateServer?: () => void
}) {
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [currentStep, setCurrentStep] = useState(0)
  const slideAnim = useRef(new Animated.Value(0)).current

  const steps = [
    {
      id: 'welcome',
      icon: Server,
      title: '欢迎来到虾豆',
      description: '虾豆是一个 AI 驱动的社区协作平台。在这里，你可以创建社区、召唤 AI Buddy、开设店铺，让 AI 帮你打工！',
    },
    {
      id: 'buddy',
      icon: Bot,
      title: '什么是 Buddy？',
      description: 'Buddy 是你的 AI 助手。它们可以加入频道参与对话、写代码、审方案、生成内容。每个 Buddy 都有自己的专长领域。',
      action: {
        label: '创建我的第一个 Buddy',
        route: '/(main)/settings/buddy',
      },
    },
    {
      id: 'server',
      icon: Server,
      title: '创建你的社区',
      description: '创建一个服务器，邀请朋友加入，建立属于你们的社区。你可以创建多个频道来组织不同的话题。',
      action: {
        label: '创建服务器',
      },
    },
    {
      id: 'discover',
      icon: Compass,
      title: '探索发现',
      description: '浏览公开服务器，发现感兴趣的社区。加入其他社区，与更多人交流协作。',
      action: {
        label: '去探索',
        route: '/(main)/(tabs)/discover',
      },
    },
  ]

  const step = steps[currentStep]
  const Icon = step.icon
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0)
    }
  }, [visible, currentStep])

  const handleNext = () => {
    if (isLastStep) {
      handleComplete()
    } else {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const handleComplete = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true')
    onClose()
  }

  const handleSkip = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true')
    onClose()
  }

  const handleAction = () => {
    if (step.action?.route) {
      handleComplete().then(() => {
        router.push(step.action!.route as never)
      })
    } else if (step.action && step.id === 'server' && onCreateServer) {
      handleComplete().then(() => {
        onCreateServer()
      })
    } else {
      handleNext()
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleSkip}>
      <View style={[styles.overlay, { backgroundColor: `${colors.background}F2` }]}>
        <Pressable style={[styles.closeBtn, { top: insets.top + spacing.md }]} onPress={handleSkip}>
          <X size={24} color={colors.textMuted} />
        </Pressable>

        {currentStep < steps.length - 1 && (
          <Pressable style={[styles.skipBtn, { top: insets.top + spacing.md }]} onPress={handleSkip}>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>跳过</Text>
          </Pressable>
        )}

        <Animated.View style={{ alignItems: 'center', paddingHorizontal: spacing.lg }}>
          <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
            <Icon size={48} color={colors.primary} />
          </View>

          <Text style={{ color: colors.text, fontSize: fontSize['2xl'], fontWeight: '800', marginBottom: spacing.md }}>
            {step.title}
          </Text>

          <Text style={{ color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.lg }}>
            {step.description}
          </Text>

          {step.action && (
            <Pressable
              style={{ backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.xl, gap: spacing.xs }}
              onPress={handleAction}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{step.action.label}</Text>
              <ChevronRight size={18} color="#fff" />
            </Pressable>
          )}
        </Animated.View>

        <View style={{ position: 'absolute', bottom: insets.bottom + spacing.xl, left: 0, right: 0, paddingHorizontal: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing.lg }}>
            {steps.map((_, index) => (
              <View
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: index === currentStep ? colors.primary : `${colors.textMuted}30`,
                }}
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {!isFirstStep && (
              <Pressable
                style={{ flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: radius.xl, paddingVertical: spacing.md, alignItems: 'center' }}
                onPress={() => setCurrentStep((prev) => prev - 1)}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>上一步</Text>
              </Pressable>
            )}

            <Pressable
              style={{ flex: isFirstStep ? 1 : 1, backgroundColor: colors.primary, borderRadius: radius.xl, paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}
              onPress={handleNext}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{isLastStep ? '开始使用' : '下一步'}</Text>
              {!isLastStep && <ChevronRight size={18} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
