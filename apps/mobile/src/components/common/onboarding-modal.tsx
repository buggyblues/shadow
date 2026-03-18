import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { Bot, ChevronRight, Compass, Plus, Server, X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontSize, radius, spacing, useColors } from '../../theme'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface OnboardingStep {
  id: string
  icon: typeof Bot
  title: string
  description: string
  action?: {
    label: string
    route?: string
    onPress?: () => void
  }
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    icon: Server,
    title: '欢迎来到虾豆',
    description: '虾豆是一个 AI 驱动的社区协作平台。在这里，你可以创建社区、召唤 AI Buddy、开设店铺，让 AI 帮你打工！',
  },
  {
    id: 'buddy',
    icon: Bot,
    title: '什么是 Buddy？',
    description: 'Buddy 是你的 AI 助手。它们可以加入频道参与对话、写代码、审方案、生成内容。每个 Buddy 都有自己的专长领域。',
    action: {
      label: '创建我的第一个 Buddy',
      route: '/(main)/settings/buddy',
    },
  },
  {
    id: 'server',
    icon: Server,
    title: '创建你的社区',
    description: '创建一个服务器，邀请朋友加入，建立属于你们的社区。你可以创建多个频道来组织不同的话题。',
    action: {
      label: '创建服务器',
    },
  },
  {
    id: 'discover',
    icon: Compass,
    title: '探索发现',
    description: '浏览公开服务器，发现感兴趣的社区。加入其他社区，与更多人交流协作。',
    action: {
      label: '去探索',
      route: '/(main)/(tabs)/discover',
    },
  },
]

interface OnboardingModalProps {
  visible: boolean
  onClose: () => void
  onCreateServer?: () => void
}

export function OnboardingModal({ visible, onClose, onCreateServer }: OnboardingModalProps) {
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [currentStep, setCurrentStep] = useState(0)
  const slideAnim = useRef(new Animated.Value(0)).current

  const step = ONBOARDING_STEPS[currentStep]
  const Icon = step.icon
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1
  const isFirstStep = currentStep === 0

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0)
    }
  }, [visible, currentStep])

  const handleNext = () => {
    if (isLastStep) {
      handleComplete()
    } else {
      Animated.timing(slideAnim, {
        toValue: -SCREEN_WIDTH,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        slideAnim.setValue(SCREEN_WIDTH)
        setCurrentStep((prev) => prev + 1)
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start()
      })
    }
  }

  const handlePrev = () => {
    if (!isFirstStep) {
      Animated.timing(slideAnim, {
        toValue: SCREEN_WIDTH,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        slideAnim.setValue(-SCREEN_WIDTH)
        setCurrentStep((prev) => prev - 1)
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start()
      })
    }
  }

  const handleComplete = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true')
    onClose()
  }

  const handleSkip = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true')
    onClose()
  }

  const handleAction = () => {
    if (step.action?.route) {
      handleComplete().then(() => {
        router.push(step.action!.route as never)
      })
    } else if (step.action && step.id === 'server' && onCreateServer) {
      handleComplete().then(() => {
        onCreateServer()
      })
    } else {
      handleNext()
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleSkip}>
      <View style={[styles.overlay, { backgroundColor: `${colors.background}F2` }]}>
        {/* Close button */}
        <Pressable style={[styles.closeBtn, { top: insets.top + spacing.md }]} onPress={handleSkip}>
          <X size={24} color={colors.textMuted} />
        </Pressable>

        {/* Skip button */}
        {currentStep < ONBOARDING_STEPS.length - 1 && (
          <Pressable style={[styles.skipBtn, { top: insets.top + spacing.md }]} onPress={handleSkip}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>跳过</Text>
          </Pressable>
        )}

        {/* Content */}
        <Animated.View style={[styles.content, { transform: [{ translateX: slideAnim }] }]}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
            <Icon size={48} color={colors.primary} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>

          {/* Description */}
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {step.description}
          </Text>

          {/* Action button */}
          {step.action && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleAction}
            >
              <Text style={styles.actionBtnText}>{step.action.label}</Text>
              <ChevronRight size={18} color="#fff" />
            </Pressable>
          )}
        </Animated.View>

        {/* Bottom controls */}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
          {/* Progress dots */}
          <View style={styles.dots}>
            {ONBOARDING_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === currentStep ? colors.primary : `${colors.textMuted}30`,
                  },
                ]}
              />
            ))}
          </View>

          {/* Navigation buttons */}
          <View style={styles.navButtons}>
            {!isFirstStep && (
              <Pressable
                style={[styles.navBtn, styles.prevBtn, { borderColor: colors.border }]}
                onPress={handlePrev}
              >
                <Text style={[styles.navBtnText, { color: colors.text }]}>上一步</Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.navBtn,
                styles.nextBtn,
                { backgroundColor: colors.primary },
                isFirstStep && styles.fullWidthBtn,
              ]}
              onPress={handleNext}
            >
              <Text style={styles.nextBtnText}>
                {isLastStep ? '开始使用' : '下一步'}
              </Text>
              {!isLastStep && <ChevronRight size={18} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.lg,
    padding: spacing.sm,
    zIndex: 10,
  },
  skipBtn: {
    position: 'absolute',
    left: spacing.lg,
    padding: spacing.sm,
    zIndex: 10,
  },
  skipText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  content: {
    width: SCREEN_WIDTH - spacing.xl * 2,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '