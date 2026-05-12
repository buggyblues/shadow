import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { Tabs } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabBellSvg, TabHomeSvg, TabMeSvg } from '../../../src/components/common/cat-svg'
import { useUnreadCount } from '../../../src/hooks/use-unread-count'
import { getImageUrl } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { useUIStore } from '../../../src/stores/ui.store'
import { useColors } from '../../../src/theme'

export default function TabsLayout() {
  const colors = useColors()
  const currentUser = useAuthStore((s) => s.user)
  const theme = useUIStore((s) => s.effectiveTheme)
  const unreadCount = useUnreadCount()
  const insets = useSafeAreaInsets()

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
          marginBottom: 2,
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 58 + insets.bottom,
          backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.85)' : `${colors.surface}EE`,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderWidth: 0,
          borderColor: colors.border,
          elevation: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: theme === 'light' ? 0.08 : 0.16,
          shadowRadius: 10,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 4,
          paddingHorizontal: 0,
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <BlurView
              tint={theme === 'light' ? 'light' : 'dark'}
              intensity={80}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ),
        tabBarIconStyle: {
          marginTop: -2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
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
            <TabHomeSvg size={26} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: '通知',
          tabBarIcon: ({ color, focused }) => {
            const hasUnread = unreadCount > 0
            return (
              <View
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <TabBellSvg size={26} color={color} focused={focused} />
                {hasUnread && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      paddingHorizontal: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#ef4444',
                      borderWidth: 1,
                      borderColor: theme === 'light' ? '#fff' : colors.surface,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            )
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '我',
          tabBarIcon: ({ color, focused }) => {
            const uri = currentUser?.avatarUrl ? getImageUrl(currentUser.avatarUrl) : null
            if (uri) {
              return (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: 1.5,
                    borderColor: focused ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: 24, height: 24, borderRadius: 12 }}
                    contentFit="cover"
                  />
                </View>
              )
            }
            return <TabMeSvg size={26} color={color} focused={focused} />
          },
        }}
      />
    </Tabs>
  )
}
