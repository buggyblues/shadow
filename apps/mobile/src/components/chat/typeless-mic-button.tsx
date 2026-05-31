import { Mic } from 'lucide-react-native'
import { memo, useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { selectionHaptic } from '../../lib/haptics'
import { iconSize, palette, radius, size, spacing, useColors } from '../../theme'

interface TypelessMicButtonProps {
  isRecording: boolean
  isHolding: boolean
  onPressIn: () => void
  onPressOut: () => void
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export const TypelessMicButton = memo(function TypelessMicButton({
  isRecording,
  isHolding,
  onPressIn,
  onPressOut,
}: TypelessMicButtonProps) {
  const colors = useColors()

  // Animation values
  const scale = useSharedValue(1)

  // Update animations based on recording state (must not write shared values in render)
  useEffect(() => {
    if (isHolding) {
      scale.value = withSpring(1.15, { damping: 10, stiffness: 200 })
      return
    }

    scale.value = withSpring(1, { damping: 15, stiffness: 300 })
  }, [isHolding, scale])

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={styles.container}>
      {/* Main button */}
      <AnimatedPressable
        style={[
          styles.button,
          buttonAnimatedStyle,
          {
            backgroundColor: isHolding ? colors.error : colors.inputBackground,
          },
        ]}
        onPressIn={() => {
          selectionHaptic()
          onPressIn()
        }}
        onPressOut={onPressOut}
        delayLongPress={0}
        hitSlop={spacing.md}
      >
        <Mic size={iconSize['2xl']} color={isHolding ? palette.white : colors.textMuted} />
      </AnimatedPressable>

      {isRecording ? (
        <View style={[styles.recordingDot, { backgroundColor: colors.error }]} />
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    width: size.controlLg,
    height: size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: size.controlMd,
    height: size.controlMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  recordingDot: {
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: size.audioBarBase,
    height: size.audioBarBase,
    borderRadius: radius.sm,
    zIndex: 3,
  },
})
