import { normalizeBuddyRuntimePresenceStatus } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { TFunction } from 'i18next'
import { Calendar, Clock, QrCode, ShoppingBag, UserCheck, UserPlus, X } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../src/components/common/price-display'
import { ProfileCommentSection } from '../../../src/components/profile/ProfileCommentSection'
import {
  BackgroundSurface,
  Button,
  MobileBackButton,
  MobileNavigationBar,
  PageScroll,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import { useAuthStore } from '../../../src/stores/auth.store'
import {
  border,
  fontSize,
  iconSize,
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
    lastHeartbeat: string | null
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
    lastHeartbeat: string | null
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

function formatOnlineDuration(seconds: number, t: TFunction): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []

  if (days > 0) parts.push(t('profile.durationDays', { count: days }))
  if (hours > 0 || days > 0) parts.push(t('profile.durationHours', { count: hours }))
  if (days === 0 && (minutes > 0 || hours === 0)) {
    parts.push(t('profile.durationMinutes', { count: minutes }))
  }

  return parts.join(' ')
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
      showToast(t('friends.requestSent'), 'success')
    },
    onError: (err: Error) => {
      showToast(err.message || t('common.error'), 'error')
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
  const displayName = profile.displayName || profile.username
  const joinedDate = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : null
  const totalOnlineLabel =
    profile.isBot && profile.agent
      ? formatOnlineDuration(profile.agent.totalOnlineSeconds, t)
      : null
  const ownedBuddyCount = profile.ownedAgents?.length ?? 0
  const socialStats = [
    profile.isBot
      ? { value: totalOnlineLabel ?? formatOnlineDuration(0, t), label: t('profile.totalOnline') }
      : { value: String(ownedBuddyCount), label: t('profile.ownedBuddiesShort') },
    profile.isBot && assetProducts.length > 0
      ? { value: String(assetProducts.length), label: t('profile.availableServices') }
      : null,
  ].filter((item): item is { value: string; label: string } => item !== null)
  const ownerName = profile.ownerProfile?.displayName ?? t('member.viewOwnerProfile')
  const ownerUsername = profile.ownerProfile?.username ? `@${profile.ownerProfile.username}` : null

  return (
    <BackgroundSurface style={styles.container}>
      <MobileNavigationBar
        title={profile.displayName || profile.username}
        left={<MobileBackButton onPress={() => router.back()} />}
      />
      <PageScroll edgeToEdge contentContainerStyle={styles.content}>
        <View style={[styles.profileHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.headerBody}>
            <View style={styles.avatarActionRow}>
              <View style={[styles.avatarFrame, { backgroundColor: colors.background }]}>
                <Avatar
                  uri={profile.avatarUrl}
                  name={displayName}
                  size={size.thumbnailMd}
                  userId={profile.id}
                  status={profile.status ?? 'offline'}
                  showStatus
                />
              </View>

              <View style={styles.profileActions}>
                <Button
                  variant="glass"
                  size="icon"
                  icon={QrCode}
                  iconColor={colors.text}
                  onPress={() => setShowQrCard(true)}
                  accessibilityLabel={t('profile.viewBusinessCard')}
                >
                  {t('profile.viewBusinessCard')}
                </Button>

                {!isSelf && !profile.isBot ? (
                  <Button
                    variant={isFriend || isRequestSent ? 'glass' : 'primary'}
                    size="sm"
                    icon={isFriend || isRequestSent ? UserCheck : UserPlus}
                    disabled={addFriendDisabled}
                    loading={sendFriendRequest.isPending}
                    onPress={() => sendFriendRequest.mutate()}
                  >
                    {isFriend
                      ? t('friends.alreadyFriend')
                      : isRequestSent
                        ? t('friends.requestPending')
                        : t('friends.addFriend')}
                  </Button>
                ) : null}
              </View>
            </View>

            <View style={styles.identityBlock}>
              <View style={styles.nameRow}>
                <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={2}>
                  {displayName}
                </Text>
                {profile.isBot ? (
                  <View style={[styles.botBadge, { backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.botBadgeText, { color: colors.primary }]}>
                      {t('common.buddy')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.username, { color: colors.textMuted }]} numberOfLines={1}>
                @{profile.username}
              </Text>

              {profile.bio || profile.agent?.config?.description ? (
                <Text style={[styles.bio, { color: colors.text }]} numberOfLines={4}>
                  {profile.bio || profile.agent?.config?.description}
                </Text>
              ) : null}

              {profile.isBot && currentActivityLabel ? (
                <View style={[styles.activityPill, { backgroundColor: colors.inputBackground }]}>
                  <View style={[styles.activityDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.activityText, { color: colors.primary }]} numberOfLines={1}>
                    {t('member.buddyWorkStatus', {
                      name: displayName,
                      status: currentActivityLabel,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              {joinedDate ? (
                <View style={styles.metaItem}>
                  <Calendar size={iconSize.sm} color={colors.textMuted} />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {t('profile.memberSince')} {joinedDate}
                  </Text>
                </View>
              ) : null}
              {totalOnlineLabel ? (
                <View style={styles.metaItem}>
                  <Clock size={iconSize.sm} color={colors.textMuted} />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {t('profile.totalOnline')} {totalOnlineLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {profile.isBot && profile.agent ? (
              <Pressable
                style={({ pressed }) => [
                  styles.ownerLink,
                  { backgroundColor: pressed ? colors.surfaceHover : colors.background },
                ]}
                onPress={() => router.push(`/(main)/profile/${profile.agent!.ownerId}`)}
              >
                <Avatar
                  uri={profile.ownerProfile?.avatarUrl ?? null}
                  name={ownerName}
                  size={iconSize['5xl']}
                  userId={profile.agent.ownerId}
                />
                <View style={styles.ownerInfo}>
                  <Text style={[styles.ownerLabel, { color: colors.textMuted }]}>
                    {t('profile.owner')}
                  </Text>
                  <Text style={[styles.ownerName, { color: colors.text }]} numberOfLines={1}>
                    {ownerName}
                  </Text>
                  {ownerUsername ? (
                    <Text
                      style={[styles.ownerUsername, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {ownerUsername}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}

            {socialStats.length > 0 ? (
              <View style={styles.statsRow}>
                {socialStats.map((stat) => (
                  <View key={stat.label} style={styles.statItem}>
                    <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {profile.isBot && assetProducts.length > 0 ? (
          <View
            style={[
              styles.timelineSection,
              { borderTopColor: colors.border, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <ShoppingBag size={iconSize.lg} color={colors.textMuted} />
              <View style={styles.sectionHeaderText}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('profile.agentAsset')}
                </Text>
                <Text style={[styles.sectionDescription, { color: colors.textMuted }]}>
                  {t('profile.agentAssetHint')}
                </Text>
              </View>
            </View>
            <View style={styles.serviceList}>
              {assetProducts.slice(0, 3).map((product) => (
                <View
                  key={product.id}
                  style={[styles.serviceRow, { borderTopColor: colors.border }]}
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
                  <PriceCompact
                    amount={product.basePrice ?? product.price ?? 0}
                    size={iconSize.sm}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {!profile.isBot && ownedBuddyCount > 0 ? (
          <View
            style={[
              styles.timelineSection,
              { borderTopColor: colors.border, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <ShoppingBag size={iconSize.lg} color={colors.textMuted} />
              <View style={styles.sectionHeaderText}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('profile.ownedBuddies')} ({ownedBuddyCount})
                </Text>
              </View>
            </View>
            <View style={styles.serviceList}>
              {profile.ownedAgents.map((agent) => {
                const agentName =
                  agent.botUser?.displayName ?? agent.botUser?.username ?? t('common.buddy')
                return (
                  <Pressable
                    key={agent.id}
                    style={({ pressed }) => [
                      styles.agentRow,
                      {
                        backgroundColor: pressed ? colors.surfaceHover : colors.background,
                        borderTopColor: colors.border,
                      },
                    ]}
                    onPress={() => router.push(`/(main)/profile/${agent.userId}`)}
                  >
                    <Avatar
                      uri={agent.botUser?.avatarUrl ?? null}
                      name={agentName}
                      size={iconSize['6xl']}
                      userId={agent.userId}
                      status={normalizeBuddyRuntimePresenceStatus({
                        agentStatus: agent.status,
                        lastHeartbeat: agent.lastHeartbeat,
                      })}
                      showStatus
                    />
                    <View style={styles.agentInfo}>
                      <View style={styles.agentNameRow}>
                        <Text style={[styles.agentName, { color: colors.text }]} numberOfLines={1}>
                          {agentName}
                        </Text>
                        <View
                          style={[
                            styles.botBadgeSmall,
                            { backgroundColor: colors.inputBackground },
                          ]}
                        >
                          <Text style={[styles.botBadgeSmallText, { color: colors.primary }]}>
                            {t('common.buddy')}
                          </Text>
                        </View>
                      </View>
                      {agent.totalOnlineSeconds > 0 ? (
                        <Text style={[styles.agentOnline, { color: colors.textMuted }]}>
                          {t('profile.totalOnline')}{' '}
                          {formatOnlineDuration(agent.totalOnlineSeconds, t)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.timelineSection,
            { borderTopColor: colors.border, borderBottomColor: colors.border },
          ]}
        >
          <ProfileCommentSection profileUserId={profile.id} />
        </View>
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
              name={displayName}
              size={iconSize.hero}
              userId={profile.id}
            />
            <Text style={[styles.qrName, { color: colors.text }]}>{displayName}</Text>
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
              {t('profile.scanToAdd')}
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
    paddingTop: spacing.none,
    paddingBottom: spacing['2xl'],
  },
  profileHeader: {
    borderBottomWidth: border.hairline,
  },
  headerBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  avatarActionRow: {
    minHeight: size.thumbnailMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  avatarFrame: {
    width: size.thumbnailMd + spacing.sm,
    height: size.thumbnailMd + spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  identityBlock: {
    marginTop: spacing.sm,
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
    lineHeight: lineHeight['2xl'],
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
    marginTop: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.xs,
  },
  ownerLink: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  ownerInfo: {
    flex: 1,
    minWidth: 0,
  },
  ownerLabel: {
    fontSize: fontSize.micro,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  ownerName: {
    marginTop: spacing.xxs,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  ownerUsername: {
    marginTop: spacing.px,
    fontSize: fontSize.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  timelineSection: {
    borderTopWidth: border.hairline,
    borderBottomWidth: border.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  sectionDescription: {
    marginTop: spacing.xxs,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  emptyText: {
    marginTop: spacing.lg,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
  serviceList: {
    marginTop: spacing.md,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: border.hairline,
    paddingVertical: spacing.md,
  },
  serviceInfo: {
    flex: 1,
    minWidth: 0,
  },
  serviceName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  serviceSummary: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: border.hairline,
    paddingVertical: spacing.md,
  },
  agentInfo: {
    flex: 1,
    minWidth: 0,
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  agentName: {
    fontSize: fontSize.md,
    fontWeight: '900',
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
