import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Clock, QrCode, User, X } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { StatusBadge } from '../../../src/components/common/status-badge'
import { ProfileCommentSection } from '../../../src/components/profile/ProfileCommentSection'
import { fetchApi } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

interface UserProfile {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  isBot: boolean
  status?: string
  bio?: string | null
  createdAt?: string
  agent?: {
    id: string
    ownerId: string
    status: string
    totalOnlineSeconds: number
    config: { description?: string }
  }
  ownerProfile?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  } | null
  ownedAgents: Array<{
    id: string
    userId: string
    status: string
    totalOnlineSeconds: number
    botUser?: { id: string; username: string; displayName: string; avatarUrl: string | null }
  }>
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchApi<UserProfile>(`/api/auth/users/${userId}`),
    enabled: !!userId,
  })

  const { data: myFriends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<Array<{ user: { id: string } }>>('/api/friends'),
    enabled: !!currentUser,
  })

  const { data: sentRequests = [] } = useQuery({
    queryKey: ['friends-sent'],
    queryFn: () => fetchApi<Array<{ user: { id: string } }>>('/api/friends/sent'),
    enabled: !!currentUser,
  })

  const sendFriendRequest = useMutation({
    mutationFn: () =>
      fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username: profile?.username }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
      showToast(t('friends.requestSent', '好友请求已发送'), 'success')
    },
    onError: (err: Error) => {
      showToast(err.message || t('common.error', '操作失败'), 'error')
    },
  })

  const [showQrCard, setShowQrCard] = useState(false)

  if (isLoading || !profile) return <LoadingScreen />

  const isSelf = Boolean(currentUser?.id && profile.id === currentUser.id)
  const isFriend = myFriends.some((item) => item.user.id === profile.id)
  const isRequestSent = sentRequests.some((item) => item.user.id === profile.id)
  const addFriendDisabled = sendFriendRequest.isPending || isFriend || isRequestSent

  const statusColors: Record<string, string> = {
    online: '#22c55e',
    idle: '#eab308',
    dnd: '#ef4444',
    offline: '#6b7280',
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {/* Header area */}
        <View style={[styles.header, { backgroundColor: `${colors.primary}15` }]}>
          <View style={styles.avatarWrap}>
            <Avatar
              uri={profile.avatarUrl}
              name={profile.displayName || profile.username}
              size={80}
              userId={profile.id}
            />
            <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
              <StatusBadge status={profile.status ?? 'offline'} size={16} />
            </View>
          </View>
        </View>

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.text }]}>
              {profile.displayName || profile.username}
            </Text>
            {profile.isBot && (
              <View style={[styles.botBadge, { backgroundColor: `${colors.primary}20` }]}>
                <Text style={[styles.botBadgeText, { color: colors.primary }]}>Buddy</Text>
              </View>
            )}
          </View>
          <Text style={[styles.username, { color: colors.textMuted }]}>@{profile.username}</Text>

          {/* Business Card Button - Show for both users and bots */}
          <Pressable
            style={({ pressed }) => [
              styles.businessCardBtn,
              {
                backgroundColor: pressed ? `${colors.primary}DD` : colors.primary,
              },
            ]}
            onPress={() => setShowQrCard(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <QrCode size={16} color="#fff" />
              <Text style={styles.businessCardText}>
                {t('profile.viewBusinessCard', '查看名片')}
              </Text>
            </View>
          </Pressable>

          {!isSelf && !profile.isBot && (
            <Pressable
              style={({ pressed }) => [
                styles.addFriendBtn,
                {
                  backgroundColor:
                    isFriend || isRequestSent
                      ? colors.inputBackground
                      : pressed
                        ? `${colors.primary}DD`
                        : colors.primary,
                },
                (isFriend || isRequestSent) && { borderWidth: 1, borderColor: colors.border },
              ]}
              disabled={addFriendDisabled}
              onPress={() => sendFriendRequest.mutate()}
            >
              <Text
                style={[
                  styles.addFriendText,
                  (isFriend || isRequestSent) && { color: colors.textSecondary },
                ]}
              >
                {sendFriendRequest.isPending
                  ? t('common.saving', '处理中...')
                  : isFriend
                    ? t('friends.alreadyFriend', '已是好友')
                    : isRequestSent
                      ? t('friends.requestPending', '等待对方接受')
                      : t('friends.addFriend', '添加好友')}
              </Text>
            </Pressable>
          )}

          {/* Status */}
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statusColors[profile.status ?? 'offline'] },
              ]}
            />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {t(`member.${profile.status ?? 'offline'}`, profile.status ?? 'offline')}
            </Text>
          </View>

          {profile.bio && (
            <Text style={[styles.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
          )}

          {/* Bot-specific: online duration */}
          {profile.isBot && profile.agent && profile.agent.totalOnlineSeconds > 0 && (
            <View style={[styles.sectionDivider, { borderTopColor: `${colors.border}60` }]}>
              <View style={styles.infoRow}>
                <Clock size={14} color={colors.textMuted} />
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                  {t('profile.totalOnline', '累计在线')}{' '}
                  {formatDuration(profile.agent.totalOnlineSeconds)}
                </Text>
              </View>
            </View>
          )}

          {/* Bot-specific: description */}
          {profile.isBot && profile.agent?.config?.description && (
            <View style={[styles.sectionDivider, { borderTopColor: `${colors.border}60` }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('profile.description', '描述')}
              </Text>
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                {profile.agent.config.description}
              </Text>
            </View>
          )}

          {/* Bot-specific: owner link */}
          {profile.isBot && profile.agent && (
            <View style={[styles.sectionDivider, { borderTopColor: `${colors.border}60` }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('profile.owner', '主人')}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.ownerCard,
                  { backgroundColor: pressed ? colors.surfaceHover : colors.inputBackground },
                ]}
                onPress={() => router.push(`/(main)/profile/${profile.agent!.ownerId}`)}
              >
                <Avatar
                  uri={profile.ownerProfile?.avatarUrl ?? null}
                  name={profile.ownerProfile?.displayName ?? 'Owner'}
                  size={36}
                  userId={profile.agent.ownerId}
                />
                <View style={styles.ownerInfo}>
                  <Text style={[styles.ownerName, { color: colors.primary }]}>
                    {profile.ownerProfile?.displayName ??
                      t('member.viewOwnerProfile', '查看主人主页')}
                  </Text>
                  {profile.ownerProfile?.username && (
                    <Text style={[styles.ownerUsername, { color: colors.textMuted }]}>
                      @{profile.ownerProfile.username}
                    </Text>
                  )}
                </View>
              </Pressable>
            </View>
          )}

          {/* Regular user: owned agents */}
          {!profile.isBot && profile.ownedAgents?.length > 0 && (
            <View style={[styles.sectionDivider, { borderTopColor: `${colors.border}60` }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('profile.ownedBuddies', '拥有的 Buddy')} ({profile.ownedAgents.length})
              </Text>
              {profile.ownedAgents.map((agent) => (
                <Pressable
                  key={agent.id}
                  style={({ pressed }) => [
                    styles.agentCard,
                    { backgroundColor: pressed ? colors.surfaceHover : colors.inputBackground },
                  ]}
                  onPress={() => router.push(`/(main)/profile/${agent.userId}`)}
                >
                  <View style={styles.agentAvatarWrap}>
                    <Avatar
                      uri={agent.botUser?.avatarUrl ?? null}
                      name={agent.botUser?.displayName ?? 'Buddy'}
                      size={36}
                      userId={agent.userId}
                    />
                    <View
                      style={[
                        styles.agentStatusDot,
                        {
                          backgroundColor: agent.status === 'running' ? '#22c55e' : '#6b7280',
                          borderColor: colors.inputBackground,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.agentInfo}>
                    <View style={styles.agentNameRow}>
                      <Text style={[styles.agentName, { color: colors.text }]} numberOfLines={1}>
                        {agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'}
                      </Text>
                      <View
                        style={[styles.botBadgeSmall, { backgroundColor: `${colors.primary}20` }]}
                      >
                        <Text style={[styles.botBadgeSmallText, { color: colors.primary }]}>
                          Buddy
                        </Text>
                      </View>
                    </View>
                    {agent.totalOnlineSeconds > 0 && (
                      <Text style={[styles.agentOnline, { color: colors.textMuted }]}>
                        {t('profile.online', '在线')} {formatDuration(agent.totalOnlineSeconds)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {profile.createdAt && (
            <View style={[styles.sectionDivider, { borderTopColor: `${colors.border}60` }]}>
              <View style={styles.infoRow}>
                <User size={14} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {t('profile.memberSince')}: {new Date(profile.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}

          {/* Comment Section */}
          <View style={[styles.sectionDivider, { borderTopColor: `${colors.border}60` }]}>
            <ProfileCommentSection profileUserId={profile.id} />
          </View>
        </View>
      </ScrollView>

      {/* QR Code Business Card Modal */}
      <Modal
        visible={showQrCard}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQrCard(false)}
      >
        <Pressable style={styles.qrOverlay} onPress={() => setShowQrCard(false)}>
          <Pressable
            style={[styles.qrCard, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Pressable style={styles.qrClose} onPress={() => setShowQrCard(false)}>
              <X size={20} color={colors.textMuted} />
            </Pressable>

            <Avatar
              uri={profile.avatarUrl}
              name={profile.displayName || profile.username}
              size={64}
              userId={profile.id}
            />
            <Text style={[styles.qrName, { color: colors.text }]}>
              {profile.displayName || profile.username}
            </Text>
            <Text style={[styles.qrUsername, { color: colors.textMuted }]}>
              @{profile.username}
            </Text>

            <View style={[styles.qrCodeWrap, { backgroundColor: '#fff' }]}>
              <QRCode
                value={`shadow://user/${profile.username}`}
                size={180}
                backgroundColor="#fff"
                color="#000"
              />
            </View>

            <Text style={[styles.qrHint, { color: colors.textMuted }]}>
              {t('profile.scanToAdd', '扫一扫，加好友')}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing['2xl'] },
  header: {
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 0,
  },
  avatarWrap: {
    marginBottom: -40,
  },
  infoCard: {
    marginTop: 48,
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  botBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  botBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  username: {
    fontSize: fontSize.md,
    marginTop: 4,
  },
  businessCardBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 38,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessCardText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  addFriendBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 38,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: fontSize.sm,
  },
  bio: {
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  sectionDivider: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoLabel: {
    fontSize: fontSize.sm,
  },
  descriptionText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  ownerUsername: {
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  agentAvatarWrap: {
    position: 'relative',
  },
  agentStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  agentInfo: {
    flex: 1,
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  agentName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  botBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  botBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
  },
  agentOnline: {
    fontSize: 11,
    marginTop: 2,
  },
  qrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCard: {
    width: 300,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  qrClose: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
  },
  qrName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  qrUsername: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  qrCodeWrap: {
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
  },
  qrHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.md,
  },
})
