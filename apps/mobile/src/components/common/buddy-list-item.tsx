import { Bot, Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
} from '../../theme'
import { Avatar } from './avatar'
import { OnlineRank } from './online-rank'

export type InviteStatus = 'online' | 'idle' | 'dnd' | 'offline'

export interface BuddyListItemData {
  uid: string
  nickname: string
  username: string
  avatar: string | null
  status: InviteStatus
  isBot: boolean
  canAddToChannel: boolean
  canAddToServer: boolean
  membershipTier?: string | null
  membershipLevel?: number | null
  totalOnlineSeconds?: number
  lastHeartbeat?: string | null
  createdAt?: string
  updatedAt?: string
  buddyTag?: string | null
  creator?: {
    uid: string
    nickname: string
  } | null
  agentId?: string
}

interface BuddyListItemProps {
  member: BuddyListItemData
  showCheckbox?: boolean
  selected?: boolean
  onSelect?: (member: BuddyListItemData) => void
  disabled?: boolean
}

export function BuddyListItem({
  member,
  showCheckbox,
  selected,
  onSelect,
  disabled = false,
}: BuddyListItemProps) {
  const { t } = useTranslation()
  const colors = useColors()

  const canSelect = !disabled && onSelect != null && showCheckbox
  const statusText = t(`member.${member.status}`, member.status)
  const membershipInfo =
    !member.isBot && (member.membershipTier || member.membershipLevel != null)
      ? [
          member.membershipTier
            ? t(`settings.membershipTiers.${member.membershipTier}`, member.membershipTier)
            : null,
          member.membershipLevel != null
            ? t('settings.membershipLevelLabel', { level: member.membershipLevel })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''

  const isSelectable = showCheckbox && canSelect

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed ? (colors.surfaceHover ?? colors.border) : colors.surface,
        },
      ]}
      onPress={() => {
        if (isSelectable) {
          onSelect?.(member)
        }
      }}
      disabled={!isSelectable}
    >
      <View style={styles.checkboxWrap}>
        {showCheckbox ? (
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderColor: disabled
                  ? colors.textMuted
                  : selected
                    ? colors.primary
                    : colors.textMuted,
              },
            ]}
          >
            {selected ? <Check size={iconSize.micro} color={palette.white} /> : null}
          </View>
        ) : null}
      </View>

      <Avatar
        uri={member.avatar}
        name={member.nickname}
        size={size.iconButtonMd}
        userId={member.uid}
        status={member.status}
        showStatus
      />

      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.nickname, { color: member.isBot ? colors.primary : colors.text }]}
            numberOfLines={1}
          >
            {member.nickname}
          </Text>
          {member.isBot ? (
            <View style={[styles.badge, { backgroundColor: colors.inputBackground }]}>
              <Bot size={iconSize.micro} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>{t('common.bot')}</Text>
            </View>
          ) : null}
        </View>

        {member.isBot ? (
          member.totalOnlineSeconds && member.totalOnlineSeconds > 0 ? (
            <View style={styles.rankRow}>
              <OnlineRank totalSeconds={member.totalOnlineSeconds} />
            </View>
          ) : (
            <Text style={[styles.rankFallback, { color: colors.primary }]}>⭐</Text>
          )
        ) : (
          <Text style={[styles.subText, { color: colors.textMuted }]}>
            {[`@${member.username}`, statusText, membershipInfo].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.xxs,
  },
  checkboxWrap: {
    width: size.badgeLg,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nickname: {
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.px,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: fontSize.micro,
    fontWeight: '600',
  },
  subText: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
  },
  rankRow: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  rankFallback: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.micro,
  },
  checkbox: {
    width: iconSize.sm,
    height: iconSize.sm,
    borderWidth: border.hairline,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
