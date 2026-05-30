import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Check, Inbox, UserPlus, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Reanimated, { FadeInRight } from 'react-native-reanimated'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { MobileBackButton, MobileNavigationBar } from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import {
  border,
  fontSize,
  iconSize,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../src/theme'

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
      <MobileNavigationBar
        title={t('friends.newFriends', '新的朋友')}
        left={<MobileBackButton onPress={() => router.back()} />}
      />

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
          <UserPlus size={iconSize.lg} color={colors.textMuted} />
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
              { backgroundColor: addUsername.trim() ? colors.primary : colors.inputBackground },
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
                    style={[styles.iconBtn, { backgroundColor: palette.successSurface }]}
                    onPress={() => acceptRequest.mutate(item.friendshipId)}
                  >
                    <Check size={iconSize.md} color={palette.emerald} />
                  </Pressable>
                  <Pressable
                    style={[styles.iconBtn, { backgroundColor: palette.dangerSurface }]}
                    onPress={() => rejectRequest.mutate(item.friendshipId)}
                  >
                    <X size={iconSize.md} color={palette.crimson} />
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
  addContainer: { padding: spacing.lg, gap: spacing.md },
  addTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  addDesc: { fontSize: fontSize.sm },
  addInputRow: {
    minHeight: size.controlLg + spacing.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  addInput: { flex: 1, fontSize: fontSize.md, paddingVertical: spacing.md },
  addBtn: {
    minWidth: size.listItemLg + spacing.xxs,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
  },
  addBtnText: { color: palette.white, fontWeight: '700', fontSize: fontSize.sm },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  listContent: { paddingBottom: size.tabBar + spacing['6xl'] },
  rowCard: {
    minHeight: size.listItemLg - spacing.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: border.hairline,
  },
  rowInfo: { flex: 1, gap: spacing.xxs },
  rowName: { fontSize: fontSize.md, fontWeight: '700' },
  rowSub: { fontSize: fontSize.xs },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
