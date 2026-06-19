import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams } from 'expo-router'
import { Check, Copy, Link2, Plus, Send, Share2, Trash2, UserPlus, X } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../../src/components/common/settings-header'
import { ActionButton, BackgroundSurface, TextField } from '../../../../src/components/ui'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import {
  border,
  fontSize,
  iconSize,
  letterSpacing,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../src/theme'

interface FriendUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string | null
}

interface FriendEntry {
  friendshipId: string
  source: 'friend' | 'owned_agent'
  user: FriendUser
  createdAt: string
}

export default function ServerInviteScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const _queryClient = useQueryClient()
  const [codes, setCodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () =>
      fetchApi<{ id: string; name: string; inviteCode: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends'),
  })

  const { data: members = [] } = useQuery({
    queryKey: ['server-members', serverSlug],
    queryFn: () => fetchApi<{ userId: string }[]>(`/api/servers/${serverSlug}/members`),
    enabled: !!serverSlug,
  })

  const memberIds = new Set(members.map((m) => m.userId))
  const invitableFriends = friends.filter((f) => !memberIds.has(f.user.id))

  const inviteMutation = useMutation({
    mutationFn: (userId: string) =>
      fetchApi(`/api/servers/${serverSlug}/invite-member`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (_data, userId) => {
      setInvitedIds((prev) => new Set(prev).add(userId))
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error', 'Error'), err.message)
    },
  })

  const fetchCodes = useCallback(async () => {
    try {
      const data = await fetchApi<any[]>('/api/invite-codes')
      setCodes(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await fetchApi('/api/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ count: 1, note: note || undefined }),
      })
      setNote('')
      setShowForm(false)
      await fetchCodes()
    } catch {}
    setCreating(false)
  }

  const handleCopy = async (code: string, id: string) => {
    await Clipboard.setStringAsync(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleShare = async (code: string) => {
    const serverName = server?.name ?? ''
    const message = t('members.inviteShareText', {
      serverName,
      code,
      defaultValue: `加入 ${serverName}！邀请码: ${code}`,
    })
    try {
      await Share.share(Platform.OS === 'ios' ? { message } : { message, title: serverName })
    } catch {}
  }

  const handleDeactivate = async (id: string) => {
    await fetchApi(`/api/invite-codes/${id}/deactivate`, { method: 'PATCH' }).catch(() => {})
    await fetchCodes()
  }

  const handleDelete = async (id: string) => {
    Alert.alert(
      t('common.confirm', '确认'),
      t('members.inviteDeleteConfirm', '确定删除此邀请码？'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete', '删除'),
          style: 'destructive',
          onPress: async () => {
            await fetchApi(`/api/invite-codes/${id}`, { method: 'DELETE' }).catch(() => {})
            await fetchCodes()
          },
        },
      ],
    )
  }

  return (
    <BackgroundSurface>
      <SettingsHeader title={t('members.inviteMembers')} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Server invite link section */}
        {server && (
          <View
            style={[
              styles.serverInviteCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.serverInviteTitle, { color: colors.text }]}>
              {t('members.serverInviteLink', '服务器邀请链接')}
            </Text>
            <View style={styles.serverInviteLinkRow}>
              <Text
                style={[styles.serverInviteLink, { color: colors.primary }]}
                numberOfLines={1}
                selectable
              >
                https://shadowob.com/app/invite/{server.inviteCode ?? ''}
              </Text>
            </View>
            <View style={styles.serverInviteActions}>
              <Pressable
                style={[styles.serverInviteBtn, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  await Clipboard.setStringAsync(
                    `https://shadowob.com/app/invite/${server.inviteCode ?? ''}`,
                  )
                  setCopiedId('server-link')
                  setTimeout(() => setCopiedId(null), 2000)
                }}
              >
                {copiedId === 'server-link' ? (
                  <Check size={iconSize.sm} color={palette.white} />
                ) : (
                  <Copy size={iconSize.sm} color={palette.white} />
                )}
                <Text style={{ color: palette.white, fontWeight: '700', fontSize: fontSize.sm }}>
                  {copiedId === 'server-link'
                    ? t('common.copied', '已复制')
                    : t('common.copy', '复制')}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.serverInviteBtn,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: border.hairline,
                    borderColor: colors.border,
                  },
                ]}
                onPress={async () => {
                  const inviteLink = `https://shadowob.com/app/invite/${server.inviteCode ?? ''}`
                  await Share.share(
                    Platform.OS === 'ios'
                      ? {
                          message: `${t('members.joinServer', { serverName: server.name, defaultValue: `Join "${server.name}" on Shadow!` })} ${inviteLink}`,
                        }
                      : { message: inviteLink, title: server.name },
                  )
                }}
              >
                <Share2 size={iconSize.sm} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.sm }}>
                  {t('common.share', '分享')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Invite friends / Buddy section */}
        {invitableFriends.length > 0 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              <UserPlus size={iconSize.sm} color={colors.primary} />{' '}
              {t('members.inviteFriendsAndBuddies', '邀请好友 / Buddy')}
            </Text>
            <View
              style={[
                styles.serverInviteCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {invitableFriends.map((f) => {
                const invited = invitedIds.has(f.user.id)
                const isPending = inviteMutation.isPending && inviteMutation.variables === f.user.id
                return (
                  <View key={f.user.id} style={styles.friendRow}>
                    <Avatar
                      uri={f.user.avatarUrl ? getImageUrl(f.user.avatarUrl) : undefined}
                      name={f.user.displayName || f.user.username}
                      size={36}
                    />
                    <Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>
                      {f.user.displayName || f.user.username}
                    </Text>
                    <Pressable
                      style={[
                        styles.inviteBtn,
                        {
                          backgroundColor: invited ? colors.surface : colors.primary,
                          borderWidth: invited ? 1 : 0,
                          borderColor: colors.border,
                        },
                      ]}
                      disabled={invited || isPending}
                      onPress={() => inviteMutation.mutate(f.user.id)}
                    >
                      {isPending ? (
                        <ActivityIndicator size="small" color={palette.foundation} />
                      ) : invited ? (
                        <Check size={iconSize.sm} color={colors.textSecondary} />
                      ) : (
                        <Send size={iconSize.sm} color={palette.foundation} />
                      )}
                      <Text
                        style={{
                          color: invited ? colors.textSecondary : palette.foundation,
                          fontWeight: '600',
                          fontSize: fontSize.sm,
                          marginLeft: spacing.xs,
                        }}
                      >
                        {invited ? t('members.invited', '已邀请') : t('members.invite', '邀请')}
                      </Text>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Personal invite codes section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {t('settings.personalInviteCodes', '个人邀请码')}
        </Text>

        {/* Create invite code */}
        <ActionButton
          label={showForm ? t('common.cancel') : t('members.inviteCreate')}
          icon={showForm ? X : Plus}
          tone="primary"
          size="md"
          fullWidth
          onPress={() => setShowForm(!showForm)}
          containerStyle={styles.createAction}
        />

        {showForm && (
          <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
            <TextField
              value={note}
              onChangeText={setNote}
              placeholder={t('settings.inviteNotePlaceholder')}
            />
            <ActionButton
              label={creating ? t('common.loading') : t('settings.inviteGenerate')}
              tone="primary"
              fullWidth
              loading={creating}
              onPress={handleCreate}
              disabled={creating}
            />
          </View>
        )}

        {/* Code list */}
        {loading ? (
          <LoadingScreen />
        ) : codes.length === 0 ? (
          <View style={styles.emptyState}>
            <Link2 size={iconSize['6xl']} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm }}>
              {t('members.inviteEmpty', '暂无邀请码，点击上方按钮生成')}
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {codes.map((code, idx) => {
              const isUsed = !!code.usedBy
              const isActive = code.isActive && !isUsed
              return (
                <View
                  key={code.id}
                  style={[
                    styles.codeRow,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: isActive ? colors.surface : colors.background,
                    },
                    idx === codes.length - 1 && { borderBottomWidth: border.none },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: '700',
                        color: colors.text,
                        letterSpacing: letterSpacing.none,
                        fontSize: fontSize.sm,
                      }}
                    >
                      {code.code}
                    </Text>
                    {code.note && (
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: fontSize.xs,
                          marginTop: spacing.px,
                        }}
                      >
                        {code.note}
                      </Text>
                    )}
                    {isUsed && code.usedByUser && (
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: fontSize.xs,
                          marginTop: spacing.px,
                        }}
                      >
                        {t('settings.inviteUsedBy', '已使用')}:{' '}
                        {code.usedByUser.displayName || code.usedByUser.username}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.tight }}>
                    {isActive && (
                      <>
                        <Pressable
                          onPress={() => handleCopy(code.code, code.id)}
                          style={styles.iconBtn}
                        >
                          {copiedId === code.id ? (
                            <Check size={iconSize.md} color={palette.emerald} />
                          ) : (
                            <Copy size={iconSize.md} color={colors.textMuted} />
                          )}
                        </Pressable>
                        <Pressable onPress={() => handleShare(code.code)} style={styles.iconBtn}>
                          <Share2 size={iconSize.md} color={colors.textMuted} />
                        </Pressable>
                        <Pressable onPress={() => handleDeactivate(code.id)} style={styles.iconBtn}>
                          <X size={iconSize.md} color={colors.textMuted} />
                        </Pressable>
                      </>
                    )}
                    {!isActive && (
                      <Pressable onPress={() => handleDelete(code.id)} style={styles.iconBtn}>
                        <Trash2 size={iconSize.md} color={colors.error} />
                      </Pressable>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  createAction: {
    marginBottom: spacing.md,
  },
  formCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: border.hairline,
    gap: spacing.sm,
  },
  iconBtn: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverInviteCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: border.hairline,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  serverInviteTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  serverInviteLinkRow: {
    padding: spacing.md,
    borderRadius: radius.md,
  },
  serverInviteLink: {
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  serverInviteActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  serverInviteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
    marginBottom: spacing.sm,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  friendName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
})
