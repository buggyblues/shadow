import { MotiView } from 'moti'
import { type ReactNode, useState } from 'react'
import {
  type AccessibilityRole,
  type GestureResponderEvent,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { motion, spacing } from '../../theme'

export function MotionPressable({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  contentStyle,
  hitSlop,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  children: ReactNode
  onPress?: (event: GestureResponderEvent) => void
  onLongPress?: (event: GestureResponderEvent) => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
  hitSlop?: number
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
}) {
  const reduceMotion = useReducedMotion()
  const [pressed, setPressed] = useState(false)
  const scale = !disabled && pressed && !reduceMotion ? motion.pressScale : 1
  const opacity = !disabled && pressed ? 0.72 : 1

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      hitSlop={hitSlop}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={style}
    >
      <MotiView
        animate={{ opacity, scale }}
        transition={{
          type: 'spring',
          damping: motion.springDamping,
          stiffness: motion.springStiffness,
          mass: motion.springMass,
        }}
        style={contentStyle}
      >
        {children}
      </MotiView>
    </Pressable>
  )
}

export function PresenceView({
  children,
  delay = motion.instant,
  style,
}: {
  children: ReactNode
  delay?: number
  style?: StyleProp<ViewStyle>
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return <>{children}</>

  return (
    <MotiView
      from={{ opacity: 0, translateY: spacing.sm }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: motion.presence, delay }}
      style={style}
    >
      {children}
    </MotiView>
  )
}
