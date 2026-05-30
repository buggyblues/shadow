import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Animated,
  Dimensions,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bot, MessageCircle, Rocket, Users } from '../../lib/icons'
import { fontSize, iconSize, lineHeight, palette, radius, size, spacing } from '../../theme'

interface SplashScreenProps {
  onComplete: () => void
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const slides = [
  {
    id: 'welcome',
    icon: Rocket,
    titleKey: 'splash.welcome',
    descKey: 'splash.welcomeDesc',
    color: palette.indigo,
  },
  {
    id: 'chat',
    icon: MessageCircle,
    titleKey: 'splash.chat',
    descKey: 'splash.chatDesc',
    color: palette.emerald,
  },
  {
    id: 'buddy',
    icon: Bot,
    titleKey: 'splash.buddy',
    descKey: 'splash.buddyDesc',
    color: palette.crimson,
  },
  {
    id: 'community',
    icon: Users,
    titleKey: 'splash.community',
    descKey: 'splash.communityDesc',
    color: palette.cyan,
  },
]

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef<FlatList>(null)
  const scrollX = useRef(new Animated.Value(0)).current

  const handleNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      })
      setCurrentIndex(currentIndex + 1)
    } else {
      onComplete()
    }
  }, [currentIndex, onComplete])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  const renderItem = useCallback(
    ({ item, index }: { item: (typeof slides)[0]; index: number }) => {
      const IconComponent = item.icon
      return (
        <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
          <View style={[styles.iconContainer, { backgroundColor: item.color }]}>
            <IconComponent size={iconSize.hero} color={palette.white} />
          </View>
          <Text style={styles.title}>{t(item.titleKey)}</Text>
          <Text style={styles.description}>{t(item.descKey)}</Text>
        </View>
      )
    },
    [t],
  )

  const keyExtractor = useCallback((item: (typeof slides)[0]) => item.id, [])

  const onViewableItemsChanged = useRef({
    viewabilityConfig: {
      itemVisiblePercentThreshold: 50,
    },
    onChange: ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems[0]?.index !== null && viewableItems[0]?.index !== undefined) {
        setCurrentIndex(viewableItems[0].index)
      }
    },
  }).current

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" />

      {/* Skip button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>{t('common.skip', 'Skip')}</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        onViewableItemsChanged={
          onViewableItemsChanged.viewabilityConfig ? onViewableItemsChanged.onChange : undefined
        }
        viewabilityConfig={onViewableItemsChanged.viewabilityConfig}
      />

      {/* Indicators */}
      <View style={styles.indicatorContainer}>
        {slides.map((_, index) => {
          const inputRange = [
            (index - 1) * SCREEN_WIDTH,
            index * SCREEN_WIDTH,
            (index + 1) * SCREEN_WIDTH,
          ]
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [1, 1.5, 1],
            extrapolate: 'clamp',
          })
          return (
            <Animated.View key={index} style={[styles.indicator, { transform: [{ scale }] }]} />
          )
        })}
      </View>

      {/* Action button */}
      <TouchableOpacity style={styles.actionButton} onPress={handleNext}>
        <Text style={styles.actionButtonText}>
          {currentIndex === slides.length - 1
            ? t('splash.getStarted', 'Get Started')
            : t('common.next', 'Next')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.foundation,
  },
  skipButton: {
    position: 'absolute',
    top: size.tabBar + spacing.xxs,
    right: spacing.xl,
    zIndex: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  skipText: {
    color: palette.neutral400,
    fontSize: fontSize.md,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['4xl'],
  },
  iconContainer: {
    width: size.avatarXl * 2,
    height: size.avatarXl * 2,
    borderRadius: radius['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['4xl'],
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: palette.white,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  description: {
    fontSize: fontSize.md,
    color: palette.neutral400,
    textAlign: 'center',
    lineHeight: lineHeight.md,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing['4xl'],
  },
  indicator: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.sm,
    backgroundColor: palette.indigo,
    marginHorizontal: spacing.xs,
  },
  actionButton: {
    marginHorizontal: spacing['4xl'],
    marginBottom: spacing['4xl'],
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['3xl'],
    borderRadius: radius['2lg'],
    alignItems: 'center',
    backgroundColor: palette.indigo,
  },
  actionButtonText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
})

// Hook to check if splash should be shown
export function useSplashScreen() {
  const shouldShow = () => {
    // Check if user has seen the splash screen
    return !localStorage.getItem('shadow_splash_completed')
  }

  const markCompleted = () => {
    localStorage.setItem('shadow_splash_completed', 'true')
  }

  return { shouldShow, markCompleted }
}
