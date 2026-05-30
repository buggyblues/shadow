import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { iconSize, spacing, useColors } from '../../theme'
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
  size = iconSize.xl,
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
      hitSlop={spacing.tight}
      badge={badge}
      variant="ghost"
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
