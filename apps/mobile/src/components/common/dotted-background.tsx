import type React from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Pattern, Rect } from 'react-native-svg'
import { useColors } from '../../../src/theme'

export function DottedBackground({ children }: { children: React.ReactNode }) {
  const colors = useColors()
  // Generate a dot color based on theme. Fallback to a dim color if necessary.
  const dotColor = `${colors.textMuted}30` // 30 is hex for approx 20% opacity

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <Circle cx="2" cy="2" r="2" fill={dotColor} />
          </Pattern>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#dots)" />
        </Svg>
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
