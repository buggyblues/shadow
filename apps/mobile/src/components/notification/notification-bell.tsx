import { Bell } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useUnreadCount } from '../../hooks/use-unread-count'
import { fontSize, iconSize, palette, radius, size, spacing, useColors } from '../../theme'

interface NotificationBellProps {
  onPress?: () => void
}

export function NotificationBell({ onPress }: NotificationBellProps) {
  const colors = useColors()
  const count = useUnreadCount()

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <Bell size={iconSize['2xl']} color={colors.text} />
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.error }]}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    padding: spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: spacing.none,
    right: spacing.none,
    minWidth: size.badgeSm,
    height: size.badgeSm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  badgeText: {
    color: palette.white,
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
})
