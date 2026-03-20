import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Reanimated, { FadeInRight } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../src/components/common/avatar'
import { EmptyState } from '../../src/components/common/empty-state'
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
  source: 'friend' | 'owned_claw' | 'rented_claw'
  user: FriendUser
  clawStatus?: 'available' | 'listed' | 'rented_out'
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

  const { data: dmChannels = [] } = useQuery({
    queryKey: ['dm-channels'],
    queryFn: () =>
      fetchApi<
        Array<{
          id: string
          userAId: string
          userBId: string
          otherUser?: { id: string }
        }>
      >('/api/dm/channels'),
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
      fetchApi<{ id: string }>('/api/dm/channels', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (data) => {
      router.push(`/(main)/dm/${data.id}` as never)
    },
  })

  const openDm = async (userId: string) => {
    const existed = dmChannels.find(
      (dm) => dm.otherUser?.id === userId || dm.userAId === userId || dm.userBId === userId,
    )
    if (existed) {
      showToast(t('friends.dmUnavailable', '私信页面正在升级中，请稍后再试'), 'info')
      return
    }

    try {
      const data = await startChat.mutateAsync(userId)
      if (data?.id) {
        showToast(t('friends.dmUnavailable', '私信页面正在升级中，请稍后再试'), 'info')
      }
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

  const statusColors: Record<string, string> = {
    online: '#23a559',
    idle: '#f59e0b',
    dnd: '#ed4245',
    offline: '#747f8d',
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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

      <Pressable
        style={[
          styles.utilityRow,
          { borderBottomColor: colors.border, backgroundColor: colors.surface },
        ]}
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
      </Pressable>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('friends.searchPlaceholder', '搜索好友...')}
            placeholderTextColor={colors.textMuted}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
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
            <Pressable
              style={({ pressed }) => [
                styles.rowCard,
                {
                  borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceHover : colors.surface,
                },
              ]}
              onPress={() => openDm(item.user.id)}
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
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: statusColors[item.user.status] ?? statusColors.offline,
                      borderColor: colors.surface,
                    },
                  ]}
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
            </Pressable>
          </Reanimated.View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="👋"
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
                if (target) void openDm(target.user.id)
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
    </View>
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
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
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
  searchBox: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, paddingVertical: 0 },
  listContent: { paddingBottom: 120 },
  rowCard: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: 1,
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
