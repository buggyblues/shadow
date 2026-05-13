import { Bot, Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fontSize, radius, spacing, useColors } from '../../theme'
import { Avatar } from './avatar'

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

const toReadableSeconds = (seconds?: number) => {
  if (seconds == null) return '--'
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
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
  const membershipInfo = (
    member.membershipTier || member.membershipLevel != null
      ? [
          member.membershipTier
            ? t(`settings.membershipTiers.${member.membershipTier}`, member.membershipTier)
            : null,
          member.membershipLevel != null
            ? t('settings.membershipLevelLabel', { level: member.membershipLevel })
            : null,
        ]
      : []
  )
    .filter(Boolean)
    .join(' · ')

  const isSelectable = showCheckbox && canSelect

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed ? (colors.surfaceHover ?? colors.border) : colors.surface,
          opacity: disabled ? 0.6 : 1,
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
                backgroundColor: selected ? colors.primary : 'transparent',
                borderColor: disabled
                  ? colors.textMuted
                  : selected
                    ? colors.primary
                    : colors.textMuted,
              },
            ]}
          >
            {selected ? <Check size={10} color="#fff" /> : null}
          </View>
        ) : null}
      </View>

      <Avatar
        uri={member.avatar}
        name={member.nickname}
        size={36}
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
            <View style={[styles.badge, { backgroundColor: `${colors.primary}20` }]}>
              <Bot size={10} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>Buddy</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.username, { color: colors.textMuted }]} numberOfLines={1}>
          @{member.username}
        </Text>
        <Text style={[styles.subText, { color: colors.textMuted }]}>
          {t('member.uidLabel', 'UID')}: {member.uid}
        </Text>
        <Text style={[styles.subText, { color: colors.textMuted }]}>
          {statusText}
          {membershipInfo ? ` · ${membershipInfo}` : ''}
        </Text>
        {member.buddyTag ? (
          <Text style={[styles.subText, { color: colors.textMuted }]}>
            {t('member.buddyTagLabel', 'Buddy Tag')}: {member.buddyTag}
          </Text>
        ) : null}
        {member.creator ? (
          <Text style={[styles.subText, { color: colors.textMuted }]}>
            {t('channel.buddyOwner', 'Creator')}: {member.creator.nickname}
          </Text>
        ) : null}
        <Text style={[styles.subText, { color: colors.textMuted }]}>
          {t('member.onlineTime', 'Online Time')}: {toReadableSeconds(member.totalOnlineSeconds)}
        </Text>
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
    marginBottom: 2,
  },
  checkboxWrap: {
    width: 20,
    alignItems: 'center',
  },
  content: {
    flex: 1,
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
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  username: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  subText: {
    marginTop: 2,
    fontSize: 11,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
