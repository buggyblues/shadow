import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { Tabs } from 'expo-router'
import { Bell } from 'lucide-react-native'
import { useEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { TabBuddySvg, TabHomeSvg, TabMeSvg } from '../../../src/components/common/cat-svg'
import { getImageUrl } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { useUIStore } from '../../../src/stores/ui.store'
import { useColors } from '../../../src/theme'

function AnimatedTabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(1)
  const translateY = useSharedValue(0)
  const rotate = useSharedValue(0)

  useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.15, { damping: 10, stiffness: 250 })
      translateY.value = withSpring(-4, { damping: 10, stiffness: 250 })
      rotate.value = withSequence(
        withTiming(-0.15, { duration: 80, easing: Easing.out(Easing.ease) }),
        withTiming(0.15, { duration: 120, easing: Easing.linear }),
        withTiming(0, { duration: 80, easing: Easing.in(Easing.ease) }),
      )
    } else {
      scale.value = withSpring(1, { damping: 12, stiffness: 200 })
      translateY.value = withSpring(0, { damping: 12, stiffness: 200 })
      rotate.value = withTiming(0)
    }
  }, [focused, scale, translateY, rotate])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}rad` },
    ],
  }))

  return <Animated.View style={animatedStyle}>{children}</Animated.View>
}

function TabIconShell({
  focused,
  children,
  activeColor,
}: {
  focused: boolean
  children: React.ReactNode
  activeColor: string
}) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? `${activeColor}20` : 'transparent',
      }}
    >
      {children}
    </View>
  )
}

export default function TabsLayout() {
  const colors = useColors()
  const currentUser = useAuthStore((s) => s.user)
  const theme = useUIStore((s) => s.effectiveTheme)

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: -4,
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 28 : 20,
          left: 20,
          right: 20,
          height: 72,
          backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.7)' : `${colors.surface}DD`,
          borderTopWidth: 2,
          borderWidth: 2,
          borderColor: colors.border,
          borderRadius: 36,
          elevation: 0,
          shadowColor: theme === 'light' ? colors.border : colors.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: theme === 'light' ? 0.3 : 0.15,
          shadowRadius: 16,
          paddingBottom: 0,
          paddingHorizontal: 12,
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 36 }]}>
            <BlurView
              tint={theme === 'light' ? 'light' : 'dark'}
              intensity={80}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ),
        tabBarItemStyle: {
          paddingVertical: 8,
          borderRadius: 22,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          title: '主页',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <TabIconShell focused={focused} activeColor={colors.primary}>
                <TabHomeSvg size={24} color={color} />
              </TabIconShell>
            </AnimatedTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="buddies"
        options={{
          title: 'Buddy 市集',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <TabIconShell focused={focused} activeColor={colors.primary}>
                <TabBuddySvg size={24} color={color} />
              </TabIconShell>
            </AnimatedTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: '通知',
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused}>
              <TabIconShell focused={focused} activeColor={colors.primary}>
                <Bell size={22} color={color} strokeWidth={focused ? 2.4 : 2.1} />
              </TabIconShell>
            </AnimatedTabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '我',
          tabBarIcon: ({ color, focused }) => {
            const icon = currentUser?.avatarUrl
              ? (() => {
                  const uri = getImageUrl(currentUser.avatarUrl)
                  if (uri) {
                    return (
                      <Image
                        source={{ uri }}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: color,
                        }}
                        contentFit="cover"
                      />
                    )
                  }
                  return null
                })()
              : null
            return (
              <AnimatedTabIcon focused={focused}>
                <TabIconShell focused={focused} activeColor={colors.primary}>
                  {icon ?? <TabMeSvg size={24} color={color} />}
                </TabIconShell>
              </AnimatedTabIcon>
            )
          },
        }}
      />
    </Tabs>
  )
}
