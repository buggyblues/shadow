import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Clock, Package, QrCode, ShoppingBag, Star, User, X } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../src/components/common/price-display'
import { ProfileCommentSection } from '../../../src/components/profile/ProfileCommentSection'
import {
  AppText,
  BackgroundSurface,
  Button,
  GlassPanel,
  PageScroll,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import { useAuthStore } from '../../../src/stores/auth.store'
import {
  border,
  fontSize,
  iconSize,
  letterSpacing,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../src/theme'

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
            : currentActivity === 'approval' || currentActivity === 'waiting_for_approval'
              ? t('member.activityApproval')
              : currentActivity === 'tool_call'
                ? t('member.activityWorking')
                : currentActivity

  return (
    <BackgroundSurface style={styles.container}>
      <PageScroll contentContainerStyle={styles.content}>
        <GlassPanel style={styles.profileCard}>
          <View style={styles.profileHero}>
            <Avatar
              uri={profile.avatarUrl}
              name={profile.displayName || profile.username}
              size={86}
              userId={profile.id}
              status={profile.status ?? 'offline'}
              showStatus
            />
            <View style={styles.profileIdentity}>
              <View style={styles.nameRow}>
                <AppText variant="headline" style={styles.displayName} numberOfLines={2}>
                  {profile.displayName || profile.username}
                </AppText>
                {profile.isBot && (
                  <View style={[styles.botBadge, { backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.botBadgeText, { color: colors.primary }]}>Buddy</Text>
                  </View>
                )}
              </View>
              <AppText variant="label" tone="secondary" style={styles.username}>
                @{profile.username}
              </AppText>
              {profile.bio ? (
                <Text style={[styles.bio, { color: colors.textSecondary }]} numberOfLines={3}>
                  {profile.bio}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actionRow}>
            <Button
              variant="primary"
              size="md"
              icon={QrCode}
              style={styles.profileAction}
              onPress={() => setShowQrCard(true)}
            >
              {t('profile.viewBusinessCard', '查看名片')}
            </Button>

            {!isSelf && !profile.isBot && (
              <Button
                variant={isFriend || isRequestSent ? 'glass' : 'primary'}
                size="md"
                style={styles.profileAction}
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
          </View>

          {profile.isBot && currentActivityLabel ? (
            <View style={[styles.activityPill, { backgroundColor: colors.inputBackground }]}>
              <View style={[styles.activityDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.activityText, { color: colors.primary }]}>
                {t('member.buddyWorkStatus', {
                  name: profile.displayName || profile.username,
                  status: currentActivityLabel,
                })}
              </Text>
            </View>
          ) : null}

          {profile.isBot && profile.agent ? (
            <View style={[styles.profileMetaGroup, { borderTopColor: colors.border }]}>
              {profile.agent.totalOnlineSeconds > 0 ? (
                <View style={styles.infoRow}>
                  <Clock size={iconSize.sm} color={colors.textMuted} />
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                    {t('profile.totalOnline', '累计在线')}{' '}
                    {formatDuration(profile.agent.totalOnlineSeconds)}
                  </Text>
                </View>
              ) : null}

              {profile.agent.config?.description ? (
                <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                  {profile.agent.config.description}
                </Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.ownerCard,
                  {
                    backgroundColor: pressed ? colors.surfaceHover : colors.inputBackground,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => router.push(`/(main)/profile/${profile.agent!.ownerId}`)}
              >
                <Avatar
                  uri={profile.ownerProfile?.avatarUrl ?? null}
                  name={profile.ownerProfile?.displayName ?? 'Owner'}
                  size={38}
                  userId={profile.agent.ownerId}
                />
                <View style={styles.ownerInfo}>
                  <Text style={[styles.ownerLabel, { color: colors.textMuted }]}>
                    {t('profile.owner', '主人')}
                  </Text>
                  <Text style={[styles.ownerName, { color: colors.text }]} numberOfLines={1}>
                    {profile.ownerProfile?.displayName ??
                      t('member.viewOwnerProfile', '查看主人主页')}
                  </Text>
                  {profile.ownerProfile?.username ? (
                    <Text style={[styles.ownerUsername, { color: colors.textMuted }]}>
                      @{profile.ownerProfile.username}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            </View>
          ) : null}
        </GlassPanel>

        {profile.isBot && (
          <GlassPanel style={styles.assetPanel}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('profile.agentAsset')}
              </Text>
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                {t('profile.agentAssetHint')}
              </Text>
            </View>
            <View style={styles.assetStatsGrid}>
              <View
                style={[
                  styles.assetStat,
                  { backgroundColor: colors.inputBackground, borderColor: colors.border },
                ]}
              >
                <ShoppingBag size={15} color={colors.primary} />
                <Text style={[styles.assetStatValue, { color: colors.text }]}>
                  {assetProducts.length}
                </Text>
                <Text style={[styles.assetStatLabel, { color: colors.textMuted }]}>
                  {t('profile.availableServices')}
                </Text>
              </View>
              <View
                style={[
                  styles.assetStat,
                  { backgroundColor: colors.inputBackground, borderColor: colors.border },
                ]}
              >
                <Package size={15} color={colors.primary} />
                <Text style={[styles.assetStatValue, { color: colors.text }]}>{assetSales}</Text>
                <Text style={[styles.assetStatLabel, { color: colors.textMuted }]}>
                  {t('profile.deliveryRecords')}
                </Text>
              </View>
              <View
                style={[
                  styles.assetStat,
                  { backgroundColor: colors.inputBackground, borderColor: colors.border },
                ]}
              >
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
                    style={[
                      styles.serviceCard,
                      { backgroundColor: colors.inputBackground, borderColor: colors.border },
                    ]}
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
                      <PriceCompact
                        amount={product.basePrice ?? product.price ?? 0}
                        size={iconSize.sm}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </GlassPanel>
        )}

        {!profile.isBot && profile.ownedAgents?.length > 0 && (
          <GlassPanel style={styles.assetPanel}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('profile.ownedBuddies', '拥有的 Buddy')} ({profile.ownedAgents.length})
              </Text>
            </View>
            <View style={styles.serviceList}>
              {profile.ownedAgents.map((agent) => (
                <Pressable
                  key={agent.id}
                  style={({ pressed }) => [
                    styles.agentCard,
                    {
                      backgroundColor: pressed ? colors.surfaceHover : colors.inputBackground,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => router.push(`/(main)/profile/${agent.userId}`)}
                >
                  <Avatar
                    uri={agent.botUser?.avatarUrl ?? null}
                    name={agent.botUser?.displayName ?? 'Buddy'}
                    size={38}
                    userId={agent.userId}
                    status={agent.status === 'running' ? 'online' : 'offline'}
                    showStatus
                  />
                  <View style={styles.agentInfo}>
                    <View style={styles.agentNameRow}>
                      <Text style={[styles.agentName, { color: colors.text }]} numberOfLines={1}>
                        {agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy'}
                      </Text>
                      <View
                        style={[styles.botBadgeSmall, { backgroundColor: colors.inputBackground }]}
                      >
                        <Text style={[styles.botBadgeSmallText, { color: colors.primary }]}>
                          Buddy
                        </Text>
                      </View>
                    </View>
                    {agent.totalOnlineSeconds > 0 ? (
                      <Text style={[styles.agentOnline, { color: colors.textMuted }]}>
                        {t('profile.online', '在线')} {formatDuration(agent.totalOnlineSeconds)}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </GlassPanel>
        )}

        {profile.createdAt ? (
          <GlassPanel style={styles.metaPanel}>
            <View style={styles.infoRow}>
              <User size={iconSize.sm} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                {t('profile.memberSince')}: {new Date(profile.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </GlassPanel>
        ) : null}

        <GlassPanel style={styles.commentsCard}>
          <ProfileCommentSection profileUserId={profile.id} />
        </GlassPanel>
      </PageScroll>

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
              <X size={iconSize.xl} color={colors.textMuted} />
            </Pressable>

            <Avatar
              uri={profile.avatarUrl}
              name={profile.displayName || profile.username}
              size={iconSize.hero}
              userId={profile.id}
            />
            <Text style={[styles.qrName, { color: colors.text }]}>
              {profile.displayName || profile.username}
            </Text>
            <Text style={[styles.qrUsername, { color: colors.textMuted }]}>
              @{profile.username}
            </Text>

            <View style={[styles.qrCodeWrap, { backgroundColor: palette.white }]}>
              <QRCode
                value={`shadow://user/${profile.id}`}
                size={180}
                backgroundColor={palette.white}
                color={palette.black}
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
  content: {
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  profileCard: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileIdentity: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  displayName: {
    flexShrink: 1,
    fontSize: fontSize['2xl'],
    fontWeight: '900',
    lineHeight: lineHeight.lg,
  },
  botBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  botBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  username: {
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  profileAction: {
    flexGrow: 1,
    minWidth: size.profileHeroMinHeight - size.thumbnailMd,
  },
  activityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  activityDot: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.sm,
  },
  activityText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  bio: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginTop: spacing.sm,
  },
  profileMetaGroup: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: border.hairline,
  },
  assetPanel: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  metaPanel: {
    padding: spacing.md,
  },
  commentsCard: {
    padding: spacing.lg,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.micro,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
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
    lineHeight: lineHeight.sm,
  },
  assetStatsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  assetStat: {
    flex: 1,
    minHeight: size.navSide - spacing.xs,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetStatValue: {
    marginTop: spacing.xs,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  assetStatLabel: {
    marginTop: spacing.xxs,
    fontSize: fontSize.micro,
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
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  serviceSummary: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  servicePrice: {
    alignItems: 'flex-end',
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    gap: spacing.md,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerLabel: {
    fontSize: fontSize.micro,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
  ownerName: {
    marginTop: spacing.xxs,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  ownerUsername: {
    fontSize: fontSize.xs,
    marginTop: spacing.px,
  },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    gap: spacing.md,
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
    paddingHorizontal: spacing.tight,
    paddingVertical: spacing.px,
    borderRadius: radius.xs,
  },
  botBadgeSmallText: {
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  agentOnline: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  qrOverlay: {
    flex: 1,
    backgroundColor: palette.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrCard: {
    width: size.previewImageHeight,
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
    marginTop: spacing.xxs,
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
