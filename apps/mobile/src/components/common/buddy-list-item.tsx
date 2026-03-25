import { useRouter } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fontSize, radius, spacing, useColors } from '../../theme'
import { Avatar } from './avatar'
import { OnlineRank } from './online-rank'
import { StatusBadge } from './status-badge'

export interface BuddyListItemData {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  isBot: boolean
  role?: 'owner' | 'admin' | 'member'
  nickname?: string | null
  // Buddy-specific fields
  ownerId?: string
  ownerName?: string
  ownerAvatarUrl?: string | null
  description?: string
  totalOnlineSeconds?: number
}

interface BuddyListItemProps {
  buddy: BuddyListItemData
  /** Whether the item is clickable to navigate to profile */
  clickable?: boolean
  /** Callback when item is clicked */
  onClick?: (buddy: BuddyListItemData) => void
  /** Whether to show the Buddy badge */
  showBotBadge?: boolean
  /** Whether to show the role badge */
  showRoleBadge?: boolean
  /** Whether to show online rank for bots */
  showOnlineRank?: boolean
  /** Right element to render (e.g., select button) */
  rightElement?: React.ReactNode
  /** Additional styles */
  style?: object
}

/**
 * Unified Buddy List Item Component (Mobile)
 *
 * Displays avatar, nickname/username, slug, online status, and level.
 * - Mobile: Click to navigate to profile (unless in select mode)
 * - Supports custom rightElement for actions (select buttons, etc.)
 */
export function BuddyListItem({
  buddy,
  clickable = true,
  onClick,
  showBotBadge = true,
  showRoleBadge = true,
  showOnlineRank = true,
  rightElement,
  style,
}: BuddyListItemProps) {
  const colors = useColors()
  const router = useRouter()

  const displayName = buddy.nickname ?? buddy.displayName

  const handlePress = useCallback(() => {
    if (onClick) {
      onClick(buddy)
    } else if (clickable) {
      router.push(`/(main)/profile/${buddy.userId}` as never)
    }
  }, [buddy, clickable, onClick, router])

  const roleLabel =
    showRoleBadge && buddy.role && buddy.role !== 'member'
      ? buddy.role === 'owner'
        ? '房主'
        : buddy.role === 'admin'
          ? '管理员'
          : null
      : null

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed ? colors.surfaceHover : 'transparent',
        },
        style,
      ]}
    >
      {/* Avatar with status */}
      <View style={styles.avatarWrapper}>
        <Avatar uri={buddy.avatarUrl} name={displayName} size={40} userId={buddy.userId} />
        <View style={styles.statusBadge}>
          <StatusBadge status={buddy.status} size={12} />
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoContainer}>
        {/* Name row */}
        <View style={styles.nameRow}>
          <Text
            style={[
              styles.displayName,
              { color: buddy.status === 'offline' ? colors.textMuted : colors.text },
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {buddy.isBot && showBotBadge && (
            <View style={[styles.botBadge, { backgroundColor: '#5865F2' }]}>
              <Check size={10} color="#fff" />
              <Text style={styles.botBadgeText}>Buddy</Text>
            </View>
          )}
        </View>

        {/* Username and role row */}
        <View style={styles.metaRow}>
          <Text style={[styles.username, { color: colors.textMuted }]} numberOfLines={1}>
            @{buddy.username}
          </Text>
          {roleLabel && (
            <Text
              style={[
                styles.roleBadge,
                {
                  color:
                    buddy.role === 'owner'
                      ? '#F59E0B'
                      : buddy.role === 'admin'
                        ? '#3B82F6'
                        : colors.textMuted,
                },
              ]}
            >
              · {roleLabel}
            </Text>
          )}
        </View>

        {/* Online rank for bots */}
        {buddy.isBot &&
          showOnlineRank &&
          buddy.totalOnlineSeconds != null &&
          buddy.totalOnlineSeconds > 0 && (
            <View style={styles.rankRow}>
              <OnlineRank totalSeconds={buddy.totalOnlineSeconds} />
            </View>
          )}
      </View>

      {/* Right element */}
      {rightElement && <View style={styles.rightContainer}>{rightElement}</View>}
    </Pressable>
  )
}

/**
 * Buddy List Item Skeleton for loading states
 */
export function BuddyListItemSkeleton() {
  const colors = useColors()

  return (
    <View style={styles.container}>
      {/* Avatar skeleton */}
      <View style={styles.avatarWrapper}>
        <View style={[styles.avatarSkeleton, { backgroundColor: colors.inputBackground }]} />
      </View>

      {/* Text skeleton */}
      <View style={styles.infoContainer}>
        <View
          style={[styles.textSkeleton, { backgroundColor: colors.inputBackground, width: 100 }]}
        />
        <View
          style={[
            styles.textSkeleton,
            { backgroundColor: colors.inputBackground, width: 60, marginTop: 4 },
          ]}
        />
      </View>
    </View>
  )
}

/**
 * Convert Member data to BuddyListItemData
 */
export function memberToBuddyItem(
  member: {
    id: string
    userId: string
    role?: 'owner' | 'admin' | 'member'
    nickname?: string | null
    user?: {
      id: string
      username: string
      displayName: string
      avatarUrl: string | null
      status: 'online' | 'idle' | 'dnd' | 'offline'
      isBot: boolean
    } | null
  },
  buddyMeta?: {
    ownerId?: string
    ownerName?: string
    ownerAvatarUrl?: string | null
    description?: string
    totalOnlineSeconds?: number
  },
): BuddyListItemData | null {
  if (!member.user) return null

  return {
    id: member.id,
    userId: member.userId,
    username: member.user.username,
    displayName: member.user.displayName,
    avatarUrl: member.user.avatarUrl,
    status: member.user.status,
    isBot: member.user.isBot,
    role: member.role,
    nickname: member.nickname,
    ownerId: buddyMeta?.ownerId,
    ownerName: buddyMeta?.ownerName,
    ownerAvatarUrl: buddyMeta?.ownerAvatarUrl,
    description: buddyMeta?.description,
    totalOnlineSeconds: buddyMeta?.totalOnlineSeconds,
  }
}

/**
 * Convert Agent data to BuddyListItemData
 */
export function agentToBuddyItem(agent: {
  id: string
  userId: string
  status: string
  totalOnlineSeconds?: number
  config?: { description?: string }
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  owner?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}): BuddyListItemData | null {
  if (!agent.botUser) return null

  return {
    id: agent.id,
    userId: agent.userId,
    username: agent.botUser.username,
    displayName: agent.botUser.displayName || agent.botUser.username,
    avatarUrl: agent.botUser.avatarUrl,
    status: agent.status === 'running' ? 'online' : 'offline',
    isBot: true,
    role: 'member',
    ownerId: agent.owner?.id,
    ownerName: agent.owner?.displayName || agent.owner?.username,
    ownerAvatarUrl: agent.owner?.avatarUrl,
    description: agent.config?.description,
    totalOnlineSeconds: agent.totalOnlineSeconds,
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  avatarWrapper: {
    position: 'relative',
  },
  statusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
  },
  infoContainer: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  displayName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  botBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  botBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  username: {
    fontSize: fontSize.xs,
  },
  roleBadge: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  rankRow: {
    marginTop: 4,
  },
  rightContainer: {
    marginLeft: spacing.sm,
  },
  avatarSkeleton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  textSkeleton: {
    height: 14,
    borderRadius: radius.sm,
  },
})
