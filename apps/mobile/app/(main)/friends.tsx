import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, Search, UserPlus, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeInRight } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../src/components/common/avatar'
import { AppScreen, CardPressable, EmptyState, Indicator, TextField } from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

interface FriendUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string
  isBot: boolean
}

interface FriendEntry {
  friendshipId: string
  source: 'friend' | 'owned_agent'
  user: FriendUser
  agentStatus?: 'available'
  createdAt: string
}

export default function FriendsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [menuTarget, setMenuTarget] = useState<FriendEntry | null>(null)

  const { data: friends = [], refetch: refetchFriends } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends'),
  })

  const { data: pendingReceived = [], refetch: refetchPendingReceived } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/pending'),
  })

  const { data: directChannels = [] } = useQuery({
    queryKey: ['direct-channels'],
    queryFn: () =>
      fetchApi<
        Array<{
          id: string
          userAId: string
          userBId: string
          otherUser?: { id: string }
        }>
      >('/api/channels/dm'),
  })

  const removeFriend = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      showToast(t('friends.removed', '已删除好友'), 'success')
    },
  })

  const startChat = useMutation({
    mutationFn: (userId: string) =>
      fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (data) => {
      router.push(`/(main)/dm/${data.id}` as never)
    },
  })

  const openDirectChannel = async (userId: string) => {
    const existed = directChannels.find(
      (channel) =>
        channel.otherUser?.id === userId ||
        channel.userAId === userId ||
        channel.userBId === userId,
    )
    if (existed) {
      router.push(`/(main)/dm/${existed.id}` as never)
      return
    }

    try {
      await startChat.mutateAsync(userId)
    } catch {
      showToast(t('common.error', '操作失败'), 'error')
    }
  }

  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friends
    const q = searchQuery.toLowerCase()
    return friends.filter(
      (f) =>
        f.user.username.toLowerCase().includes(q) ||
        (f.user.displayName ?? '').toLowerCase().includes(q),
    )
  }, [friends, searchQuery])

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refetchFriends(), refetchPendingReceived()])
    setRefreshing(false)
  }

  return (
    <AppScreen>
      <View
        style={[
          styles.navBar,
          {
            backgroundColor: colors.surface,
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.navTitleWrap}>
          <Text style={[styles.navTitle, { color: colors.text }]}>
            {t('friends.title', '好友')}
          </Text>
        </View>
        <View style={styles.navSpacer} />
      </View>

      <CardPressable
        variant="glassPanel"
        style={styles.utilityRow}
        onPress={() => router.push('/(main)/friends/new-friends' as never)}
      >
        <View style={styles.utilityLeft}>
          <Text style={[styles.utilityTitle, { color: colors.text }]}>
            {t('friends.newFriends', '新的朋友')}
          </Text>
          <Text style={[styles.utilityDesc, { color: colors.textMuted }]}>
            {t('friends.pendingHint', '处理好友申请与添加好友')}
          </Text>
        </View>
        <View style={styles.utilityRight}>
          {pendingReceived.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingReceived.length}</Text>
            </View>
          )}
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      </CardPressable>

      <View style={styles.searchWrap}>
        <TextField
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('friends.searchPlaceholder', '搜索好友...')}
          left={<Search size={16} color={colors.textMuted} />}
          right={
            searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <X size={16} color={colors.textMuted} />
              </Pressable>
            ) : null
          }
          style={styles.searchBox}
        />
      </View>

      <FlatList
        data={filteredFriends}
        keyExtractor={(item) => item.friendshipId}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <Reanimated.View entering={FadeInRight.delay(index * 20).springify()}>
            <CardPressable
              variant="surface"
              style={styles.rowCard}
              onPress={() => openDirectChannel(item.user.id)}
              onLongPress={() => {
                setMenuTarget(item)
              }}
            >
              <View style={styles.avatarWrap}>
                <Avatar
                  uri={item.user.avatarUrl}
                  name={item.user.displayName || item.user.username}
                  size={46}
                  userId={item.user.id}
                />
                <Indicator
                  status={item.user.status}
                  size="md"
                  style={[styles.statusDot, { borderColor: colors.surface }]}
                />
              </View>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                  {item.user.displayName ?? item.user.username}
                </Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
                  @{item.user.username}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </CardPressable>
          </Reanimated.View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={UserPlus}
            title={t('friends.noFriends', '还没有好友')}
            description={t('friends.noFriendsHint', '先去“新的朋友”添加好友')}
          />
        }
      />

      <Modal
        visible={!!menuTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuTarget(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setMenuTarget(null)}>
          <View
            style={[
              styles.sheetPanel,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
              {menuTarget?.user.displayName ?? menuTarget?.user.username}
            </Text>

            <Pressable
              style={[styles.sheetAction, { borderBottomColor: colors.border }]}
              onPress={() => {
                const target = menuTarget
                setMenuTarget(null)
                if (target) void openDirectChannel(target.user.id)
              }}
            >
              <Text style={[styles.sheetActionText, { color: colors.text }]}>
                {t('friends.startDm', '发起私信')}
              </Text>
            </Pressable>

            {menuTarget?.source === 'friend' && (
              <Pressable
                style={[styles.sheetAction, { borderBottomColor: colors.border }]}
                onPress={() => {
                  const target = menuTarget
                  setMenuTarget(null)
                  if (target) removeFriend.mutate(target.friendshipId)
                }}
              >
                <Text style={[styles.sheetActionText, { color: '#ef4444' }]}>
                  {t('common.delete', '删除')}
                </Text>
              </Pressable>
            )}

            <Pressable style={styles.sheetAction} onPress={() => setMenuTarget(null)}>
              <Text style={[styles.sheetActionText, { color: colors.textMuted }]}>
                {t('common.cancel', '取消')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navTitleWrap: { flexDirection: 'row', alignItems: 'center' },
  navTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  navSpacer: { width: 32, height: 32 },
  utilityRow: {
    margin: spacing.md,
    marginBottom: 0,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  utilityLeft: { gap: 3 },
  utilityTitle: { fontSize: fontSize.md, fontWeight: '700' },
  utilityDesc: { fontSize: fontSize.xs },
  utilityRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tabBadge: {
    backgroundColor: '#ed4245',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  searchWrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  searchBox: {},
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 120, gap: spacing.sm },
  rowCard: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrap: { position: 'relative' },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: fontSize.md, fontWeight: '700' },
  rowSub: { fontSize: fontSize.xs },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: spacing.lg,
  },
  sheetTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sheetAction: {
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
})
