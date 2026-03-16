import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { spacing, useColors } from '../../theme'

interface HeaderButtonProps {
  icon: LucideIcon
  onPress: () => void
  size?: number
  color?: string
  badge?: ReactNode
  disabled?: boolean
}

export function HeaderButton({
  icon: Icon,
  onPress,
  size = 20,
  color,
  badge,
  disabled,
}: HeaderButtonProps) {
  const colors = useColors()
  const iconColor = color ?? colors.textSecondary
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        pressed && { opacity: 0.5 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon size={size} color={iconColor} />
      {badge && <View style={styles.badgeWrap}>{badge}</View>}
    </Pressable>
  )
}

interface HeaderButtonGroupProps {
  children: ReactNode
}

export function HeaderButtonGroup({ children }: HeaderButtonGroupProps) {
  return <View style={styles.group}>{children}</View>
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.xs,
  },
})
