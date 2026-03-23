import { useNavigation } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Animated,
  Dimensions,
  FlatList,
  I18nManager,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bot, MessageCircle, Rocket, Server, Users } from '../../lib/icons'

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
    gradient: ['#667eea', '#764ba2'],
  },
  {
    id: 'chat',
    icon: MessageCircle,
    titleKey: 'splash.chat',
    descKey: 'splash.chatDesc',
    gradient: ['#11998e', '#38ef7d'],
  },
  {
    id: 'buddy',
    icon: Bot,
    titleKey: 'splash.buddy',
    descKey: 'splash.buddyDesc',
    gradient: ['#f093fb', '#f5576c'],
  },
  {
    id: 'community',
    icon: Users,
    titleKey: 'splash.community',
    descKey: 'splash.communityDesc',
    gradient: ['#4facfe', '#00f2fe'],
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
          <LinearGradient
            colors={item.gradient as [string, string]}
            style={styles.iconContainer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <IconComponent size={64} color="#fff" />
          </LinearGradient>
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
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onViewableItemsChanged={onViewableItemsChanged.viewabilityConfig ? onViewableItemsChanged.onChange : undefined}
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
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          })
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [1, 1.5, 1],
            extrapolate: 'clamp',
          })
          return (
            <Animated.View
              key={index}
              style={[
                styles.indicator,
                { opacity, transform: [{ scale }] },
              ]}
            />
          )
        })}
      </View>

      {/* Action button */}
      <TouchableOpacity style={styles.actionButton} onPress={handleNext}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.actionButtonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.actionButtonText}>
            {currentIndex === slides.length - 1
              ? t('splash.getStarted', 'Get Started')
              : t('common.next', 'Next')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    color: '#999',
    fontSize: 16,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 128,
    height: 128,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#667eea',
    marginHorizontal: 4,
  },
  actionButton: {
    marginHorizontal: 40,
    marginBottom: 40,
  },
  actionButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
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