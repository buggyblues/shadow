import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Plus, Search, X } from 'lucide-react-native'
import { useMemo, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import Reanimated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { NotificationBell } from '../../../src/components/notification/notification-bell'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

// biome-ignore lint/suspicious/noExplicitAny: style prop
function SquishyRow({
  children,
  onPress,
  style: rowStyle,
}: {
  children: React.ReactNode
  onPress: () => void
  style?: any
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Navigation bar */}
      <Reanimated.View
        entering={FadeIn.duration(400)}
        style={[styles.navBar, { paddingTop: insets.top + 8, backgroundColor: colors.surface }]}
      >
        <Pressable
          onPress={() => {
            // biome-ignore lint/suspicious/noExplicitAny: Expo Router route typing
            router.push('/(main)/dashboard' as any)
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
          <NotificationBell onPress={() => router.push('/(main)/notifications' as any)} />
          <Pressable
            onPress={() => setShowCreateServer(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
          >
            <Plus size={20} color={colors.text} />
          </Pressable>
        </View>
      </Reanimated.View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surface }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="搜索服务器..."
            placeholderTextColor={colors.textMuted}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <X size={14} color={colors.textMuted} />
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
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {section.title}
              </Text>
              <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                {section.data.length}
              </Text>
            </View>
          )}
          renderItem={({ item, index }) => {
            const isPublicResult = item.member.role === '_public'
            const desc = isPublicResult
              ? item.server.description || '公开服务器'
              : item.server.description || getRoleLabel(item.member.role)
            return (
              <Reanimated.View entering={FadeInRight.delay(index * 40).springify()}>
                <SquishyRow
                  style={[styles.serverRow, { backgroundColor: colors.background }]}
                  onPress={() => {
                    if (isPublicResult) {
                      // biome-ignore lint/suspicious/noExplicitAny: route typing
                      router.push('/(main)/(tabs)/discover' as any)
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
                    <Text
                      style={[styles.serverDesc, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {desc}
                    </Text>
                    {!isPublicResult &&
                      (item.server.memberCount != null || item.server.channelCount != null) && (
                        <Text style={[styles.serverMeta, { color: colors.textMuted }]}>
                          {item.server.memberCount ?? 0}成员 · {item.server.channelCount ?? 0}频道
                        </Text>
                      )}
                  </View>
                </SquishyRow>
              </Reanimated.View>
            )
          }}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
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
    </View>
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
    borderRadius: radius.lg,
    height: 36,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: 0,
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
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
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
  serverMeta: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48 + spacing.lg + spacing.md,
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
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
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
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
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
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
})
