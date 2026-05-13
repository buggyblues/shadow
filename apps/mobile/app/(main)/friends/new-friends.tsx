import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Check, ChevronLeft, Inbox, UserPlus, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Reanimated, { FadeInRight } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { fetchApi } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

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

export default function NewFriendsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [addUsername, setAddUsername] = useState('')

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/pending'),
  })

  const { data: pendingSent = [] } = useQuery({
    queryKey: ['friends-sent'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/sent'),
  })

  const sendRequest = useMutation({
    mutationFn: (username: string) =>
      fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    onSuccess: () => {
      showToast(t('friends.requestSent', '好友请求已发送'), 'success')
      setAddUsername('')
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const acceptRequest = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}/accept`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
      showToast(t('friends.accepted', '已接受好友请求'), 'success')
    },
  })

  const rejectRequest = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
    },
  })

  const pendingItems = useMemo(
    () => [
      ...pendingReceived.map((item) => ({ ...item, kind: 'received' as const })),
      ...pendingSent.map((item) => ({ ...item, kind: 'sent' as const })),
    ],
    [pendingReceived, pendingSent],
  )

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
            {t('friends.newFriends', '新的朋友')}
          </Text>
        </View>
        <View style={styles.navSpacer} />
      </View>

      <View style={[styles.addContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.addTitle, { color: colors.text }]}>
          {t('friends.addFriend', '添加好友')}
        </Text>
        <Text style={[styles.addDesc, { color: colors.textMuted }]}>
          {t('friends.addFriendDesc', '输入用户名来发送好友请求')}
        </Text>
        <View
          style={[
            styles.addInputRow,
            { backgroundColor: colors.inputBackground, borderColor: colors.border },
          ]}
        >
          <UserPlus size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.addInput, { color: colors.text }]}
            value={addUsername}
            onChangeText={setAddUsername}
            placeholder={t('friends.usernamePlaceholder', '输入用户名')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            hitSlop={10}
            style={[
              styles.addBtn,
              { backgroundColor: addUsername.trim() ? colors.primary : `${colors.primary}40` },
            ]}
            disabled={!addUsername.trim() || sendRequest.isPending}
            onPress={() => addUsername.trim() && sendRequest.mutate(addUsername.trim())}
          >
            <Text style={styles.addBtnText}>{t('friends.sendRequest', '发送')}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
        {t('friends.tabPending', '待处理')}
      </Text>

      <FlatList
        data={pendingItems}
        keyExtractor={(item) => item.friendshipId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <Reanimated.View entering={FadeInRight.delay(index * 20).springify()}>
            <View
              style={[
                styles.rowCard,
                { backgroundColor: colors.surface, borderBottomColor: colors.border },
              ]}
            >
              <Avatar
                uri={item.user.avatarUrl}
                name={item.user.displayName || item.user.username}
                size={46}
                userId={item.user.id}
              />
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                  {item.user.displayName ?? item.user.username}
                </Text>
                <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                  {item.kind === 'received'
                    ? t('friends.wantsToBeYourFriend', '请求添加你为好友')
                    : t('friends.requestPending', '等待对方接受')}
                </Text>
              </View>
              {item.kind === 'received' && (
                <View style={styles.rowActions}>
                  <Pressable
                    style={[styles.iconBtn, { backgroundColor: '#23a55915' }]}
                    onPress={() => acceptRequest.mutate(item.friendshipId)}
                  >
                    <Check size={16} color="#23a559" />
                  </Pressable>
                  <Pressable
                    style={[styles.iconBtn, { backgroundColor: '#ef444415' }]}
                    onPress={() => rejectRequest.mutate(item.friendshipId)}
                  >
                    <X size={16} color="#ef4444" />
                  </Pressable>
                </View>
              )}
            </View>
          </Reanimated.View>
        )}
        ListEmptyComponent={
          <EmptyState icon={Inbox} title={t('friends.noPending', '暂无待处理请求')} />
        }
      />
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
  addContainer: { padding: spacing.lg, gap: spacing.md },
  addTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  addDesc: { fontSize: fontSize.sm },
  addInputRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  addInput: { flex: 1, fontSize: fontSize.md, paddingVertical: 12 },
  addBtn: {
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
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
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: fontSize.md, fontWeight: '700' },
  rowSub: { fontSize: fontSize.xs },
  rowActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
