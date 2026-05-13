import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { spacing, useColors } from '../../theme'
import { ToolbarButton } from '../ui'

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
    <ToolbarButton
      icon={Icon}
      iconColor={iconColor}
      iconSize={size}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      badge={badge}
      variant="ghost"
      style={disabled ? { opacity: 0.4 } : undefined}
    />
  )
}

interface HeaderButtonGroupProps {
  children: ReactNode
}

export function HeaderButtonGroup({ children }: HeaderButtonGroupProps) {
  return <View style={styles.group}>{children}</View>
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.xs,
  },
})
