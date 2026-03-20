import { Mic } from 'lucide-react-native'
import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useColors } from '../../theme'

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
  const pulseScale = useSharedValue(1)
  const pulseOpacity = useSharedValue(0)

  // Update animations based on recording state
  if (isHolding) {
    scale.value = withSpring(1.15, { damping: 10, stiffness: 200 })
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 600, easing: Easing.out(Easing.ease) }),
        withTiming(1.5, { duration: 200 }),
      ),
      -1,
      false,
    )
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 600, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 200 }),
      ),
      -1,
      false,
    )
  } else {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 })
    pulseScale.value = 1
    pulseOpacity.value = 0
  }

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }))

  return (
    <View style={styles.container}>
      {/* Pulse ring animation */}
      {isRecording && (
        <Animated.View
          style={[styles.pulseRing, pulseAnimatedStyle, { backgroundColor: colors.error }]}
        />
      )}

      {/* Main button */}
      <AnimatedPressable
        style={[
          styles.button,
          buttonAnimatedStyle,
          {
            backgroundColor: isHolding ? colors.error : colors.inputBackground,
          },
        ]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        delayLongPress={0}
        hitSlop={12}
      >
        <Mic size={22} color={isHolding ? '#fff' : colors.textMuted} />
      </AnimatedPressable>

      {/* Recording indicator dot - removed to avoid duplication with pulse animation */}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pulseRing: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    zIndex: 1,
  },
})
