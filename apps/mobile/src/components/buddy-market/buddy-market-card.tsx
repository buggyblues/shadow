import { useRouter } from 'expo-router'
import { Clock, Eye, Users } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fontSize, radius, spacing, useColors } from '../../theme'
import { Avatar } from '../common/avatar'
import { OnlineRank } from '../common/online-rank'
import { PriceCompact } from '../common/price-display'
import { DEVICE_TIER_INFO, OS_LABELS, type Listing } from './types'

function formatOnlineTime(seconds: number) {
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
  const hours = Math.floor(seconds / 3600)
  if (hours < 24) return `${hours}小时`
  const days = Math.floor(hours / 24)
  return `${days}天${hours % 24}小时`
}

export function BuddyMarketCard({ listing }: { listing: Listing }) {
  const colors = useColors()
  const router = useRouter()
  const tierInfo = DEVICE_TIER_INFO[listing.deviceTier] ?? DEVICE_TIER_INFO.mid_range!
  const ownerName = listing.owner?.displayName || listing.owner?.username || '?'

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.surfaceHover : colors.surface,
          borderColor: colors.border,
        },
      ]}
      onPress={() => router.push(`/(main)/buddy-detail/${listing.id}` as never)}
    >
      <View style={styles.cardTopRow}>
        <Avatar
          uri={listing.owner?.avatarUrl}
          name={ownerName}
          size={40}
          userId={listing.owner?.id || listing.ownerId}
        />
        <View style={styles.cardTitleCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {listing.title}
            </Text>
            <View style={[styles.tierBadge, { backgroundColor: `${tierInfo.color}20` }]}>
              <Text style={[styles.tierBadgeText, { color: tierInfo.color }]}>
                {tierInfo.label}
              </Text>
            </View>
          </View>
          <Text style={[styles.ownerName, { color: colors.textMuted }]} numberOfLines={1}>
            {ownerName} · {OS_LABELS[listing.osType] ?? listing.osType}
          </Text>
        </View>
      </View>

      {listing.description && (
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {listing.description}
        </Text>
      )}

      {listing.skills.length > 0 && (
        <View style={styles.skills}>
          {listing.skills.slice(0, 4).map((skill) => (
            <View key={skill} style={[styles.skillTag, { backgroundColor: `${colors.primary}12` }]}>
              <Text style={[styles.skillText, { color: colors.primary }]}>{skill}</Text>
            </View>
          ))}
          {listing.skills.length > 4 && (
            <Text style={[styles.skillMore, { color: colors.textMuted }]}>
              +{listing.skills.length - 4}
            </Text>
          )}
        </View>
      )}

      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <View style={styles.priceRow}>
          <PriceCompact amount={listing.hourlyRate} size={15} />
          <Text style={[styles.priceUnit, { color: colors.textMuted }]}>/小时</Text>
        </View>
        <View style={styles.statsRow}>
          <OnlineRank totalSeconds={listing.totalOnlineSeconds} />
          <Clock size={11} color={colors.textMuted} />
          <Text style={[styles.statText, { color: colors.textMuted }]}>
            {formatOnlineTime(listing.totalOnlineSeconds)}
          </Text>
          <Eye size={11} color={colors.textMuted} />
          <Text style={[styles.statText, { color: colors.textMuted }]}>{listing.viewCount}</Text>
          <Users size={11} color={colors.textMuted} />
          <Text style={[styles.statText, { color: colors.textMuted }]}>{listing.rentalCount}</Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitleCol: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  tierBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ownerName: {
    fontSize: fontSize.xs,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  skills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.sm,
  },
  skillTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  skillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  skillMore: {
    fontSize: 10,
    fontWeight: '700',
    alignSelf: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceUnit: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 10,
    fontWeight: '600',
    marginRight: 4,
  },
})
