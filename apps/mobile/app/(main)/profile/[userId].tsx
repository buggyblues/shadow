import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Clock, Package, QrCode, ShoppingBag, Star, User, X } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../src/components/common/price-display'
import { StatusBadge } from '../../../src/components/common/status-badge'
import { ProfileCommentSection } from '../../../src/components/profile/ProfileCommentSection'
import { AppText, BackgroundSurface, Button, GlassPanel } from '../../../src/components/ui'
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
    currentActivity?: string | null
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
    currentActivity?: string | null
    botUser?: { id: string; username: string; displayName: string; avatarUrl: string | null }
  }>
}

interface Shop {
  id: string
  name: string
}

interface Product {
  id: string
  name: string
  summary?: string | null
  status: string
  basePrice?: number
  price?: number
  salesCount?: number
  avgRating?: number
  ratingCount?: number
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

  const { data: assetShop } = useQuery({
    queryKey: ['profile-asset-shop', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null
      try {
        return await fetchApi<Shop>(`/api/users/${profile.id}/shop`)
      } catch {
        return null
      }
    },
    enabled: profile?.isBot === true && !!profile.id,
  })

  const { data: assetProductsData } = useQuery({
    queryKey: ['profile-asset-shop-products', assetShop?.id],
    queryFn: () => fetchApi<{ products: Product[] }>(`/api/shops/${assetShop!.id}/products`),
    enabled: Boolean(assetShop?.id),
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
  const assetProducts = (assetProductsData?.products ?? []).filter(
    (product) => product.status === 'active',
  )
  const assetSales = assetProducts.reduce((sum, product) => sum + (product.salesCount ?? 0), 0)
  const ratedProducts = assetProducts.filter((product) => (product.ratingCount ?? 0) > 0)
  const assetRating =
    ratedProducts.length > 0
      ? ratedProducts.reduce((sum, product) => sum + (product.avgRating ?? 0), 0) /
        ratedProducts.length
      : 0
  const currentActivity = profile.agent?.currentActivity
  const currentActivityLabel =
    currentActivity === 'thinking'
      ? t('member.activityThinking')
      : currentActivity === 'working'
        ? t('member.activityWorking')
        : currentActivity === 'ready'
          ? t('member.activityReady')
          : currentActivity === 'preparing'
            ? t('member.activityPreparing')
            : currentActivity

  const statusColors: Record<string, string> = {
    online: colors.statusOnline,
    idle: colors.statusIdle,
    dnd: colors.statusDnd,
    offline: colors.statusOffline,
  }

  return (
    <BackgroundSurface style={styles.container}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
        <GlassPanel style={styles.infoCard}>
          <View style={styles.nameRow}>
            <AppText variant="headline" style={styles.displayName}>
              {profile.displayName || profile.username}
            </AppText>
            {profile.isBot && (
              <View style={[styles.botBadge, { backgroundColor: `${colors.primary}20` }]}>
                <Text style={[styles.botBadgeText, { color: colors.primary }]}>Buddy</Text>
              </View>
            )}
          </View>
          <AppText variant="label" tone="secondary" style={styles.username}>
            @{profile.username}
          </AppText>

          {/* Business Card Button - Show for both users and bots */}
          <Button variant="primary" size="md" icon={QrCode} onPress={() => setShowQrCard(true)}>
            {t('profile.viewBusinessCard', '查看名片')}
          </Button>

          {!isSelf && !profile.isBot && (
            <Button
              variant={isFriend || isRequestSent ? 'glass' : 'primary'}
              size="md"
              disabled={addFriendDisabled}
              loading={sendFriendRequest.isPending}
              onPress={() => sendFriendRequest.mutate()}
            >
              {isFriend
                ? t('friends.alreadyFriend', '已是好友')
                : isRequestSent
                  ? t('friends.requestPending', '等待对方接受')
                  : t('friends.addFriend', '添加好友')}
            </Button>
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

          {profile.isBot && currentActivityLabel ? (
            <View style={[styles.activityPill, { backgroundColor: `${colors.primary}18` }]}>
              <View style={[styles.activityDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.activityText, { color: colors.primary }]}>
                {t('member.buddyWorkStatus', {
                  name: profile.displayName || profile.username,
                  status: currentActivityLabel,
                })}
              </Text>
            </View>
          ) : null}

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

          {profile.isBot && (
            <View style={[styles.sectionDivider, { borderTopColor: `${colors.border}60` }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('profile.agentAsset')}
              </Text>
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                {t('profile.agentAssetHint')}
              </Text>
              <View style={styles.assetStatsGrid}>
                <View style={[styles.assetStat, { backgroundColor: colors.inputBackground }]}>
                  <ShoppingBag size={15} color={colors.primary} />
                  <Text style={[styles.assetStatValue, { color: colors.text }]}>
                    {assetProducts.length}
                  </Text>
                  <Text style={[styles.assetStatLabel, { color: colors.textMuted }]}>
                    {t('profile.availableServices')}
                  </Text>
                </View>
                <View style={[styles.assetStat, { backgroundColor: colors.inputBackground }]}>
                  <Package size={15} color={colors.primary} />
                  <Text style={[styles.assetStatValue, { color: colors.text }]}>{assetSales}</Text>
                  <Text style={[styles.assetStatLabel, { color: colors.textMuted }]}>
                    {t('profile.deliveryRecords')}
                  </Text>
                </View>
                <View style={[styles.assetStat, { backgroundColor: colors.inputBackground }]}>
                  <Star size={15} color={colors.primary} />
                  <Text style={[styles.assetStatValue, { color: colors.text }]}>
                    {ratedProducts.length > 0 ? assetRating.toFixed(1) : '-'}
                  </Text>
                  <Text style={[styles.assetStatLabel, { color: colors.textMuted }]}>
                    {t('profile.creditRating')}
                  </Text>
                </View>
              </View>
              {assetProducts.length === 0 ? (
                <Text style={[styles.emptyServices, { color: colors.textMuted }]}>
                  {t('profile.noAssetServices')}
                </Text>
              ) : (
                <View style={styles.serviceList}>
                  {assetProducts.slice(0, 3).map((product) => (
                    <View
                      key={product.id}
                      style={[styles.serviceCard, { backgroundColor: colors.inputBackground }]}
                    >
                      <View style={styles.serviceInfo}>
                        <Text style={[styles.serviceName, { color: colors.text }]} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text
                          style={[styles.serviceSummary, { color: colors.textMuted }]}
                          numberOfLines={2}
                        >
                          {product.summary || t('profile.serviceShelfFallback')}
                        </Text>
                      </View>
                      <View style={styles.servicePrice}>
                        <PriceCompact amount={product.basePrice ?? product.price ?? 0} size={13} />
                      </View>
                    </View>
                  ))}
                </View>
              )}
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
        </GlassPanel>
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
    </BackgroundSurface>
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
  activityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  activityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  activityText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
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
  assetStatsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  assetStat: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
  },
  assetStatValue: {
    marginTop: spacing.xs,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  assetStatLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyServices: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  serviceList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  serviceSummary: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
  },
  servicePrice: {
    alignItems: 'flex-end',
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
