import { LayoutAnimation, Platform, UIManager } from 'react-native'
import { motion } from '../theme'

let androidLayoutAnimationEnabled = false

export function animateNextLayout() {
  if (Platform.OS === 'android' && !androidLayoutAnimationEnabled) {
    UIManager.setLayoutAnimationEnabledExperimental?.(true)
    androidLayoutAnimationEnabled = true
  }

  LayoutAnimation.configureNext({
    duration: motion.base,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  })
}
