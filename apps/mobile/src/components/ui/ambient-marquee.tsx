import { Marquee } from '@animatereactnative/marquee'
import { type ReactNode } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { motion, spacing } from '../../theme'

export function AmbientMarquee({
  children,
  enabled = true,
  reverse = false,
  speed = motion.marqueeSpeed,
  style,
}: {
  children: ReactNode
  enabled?: boolean
  reverse?: boolean
  speed?: number
  style?: StyleProp<ViewStyle>
}) {
  const reduceMotion = useReducedMotion()

  if (!enabled || reduceMotion) {
    return <View style={[styles.static, style]}>{children}</View>
  }

  return (
    <Marquee
      reverse={reverse}
      speed={speed}
      spacing={spacing['3xl']}
      style={StyleSheet.flatten(style)}
    >
      {children}
    </Marquee>
  )
}

const styles = StyleSheet.create({
  static: {
    overflow: 'hidden',
  },
})
