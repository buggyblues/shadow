import { Image } from 'expo-image'
import { Tabs } from 'expo-router'
import { Rss } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabBellSvg, TabHomeSvg, TabMeSvg } from '../../../src/components/common/cat-svg'
import { useUnreadCount } from '../../../src/hooks/use-unread-count'
import { getImageUrl } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
import { useUIStore } from '../../../src/stores/ui.store'
import {
  border,
  fontSize,
  iconSize,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../src/theme'

export default function TabsLayout() {
  const { t } = useTranslation()
  const colors = useColors()
  const currentUser = useAuthStore((s) => s.user)
  const theme = useUIStore((s) => s.effectiveTheme)
  const unreadCount = useUnreadCount()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: fontSize.micro,
          fontWeight: '700',
          marginBottom: spacing.xxs,
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: spacing.none,
          left: spacing.none,
          right: spacing.none,
          height: size.tabBar + insets.bottom,
          backgroundColor: theme === 'light' ? palette.white : colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderWidth: border.none,
          borderColor: colors.border,
          paddingBottom: Math.max(insets.bottom, spacing.tight),
          paddingTop: spacing.xs,
          paddingHorizontal: spacing.none,
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: theme === 'light' ? palette.white : colors.surface,
              },
            ]}
          />
        ),
        tabBarIconStyle: {
          marginTop: -spacing.xxs,
        },
        tabBarItemStyle: {
          paddingVertical: spacing.xxs,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          title: t('nav.home'),
          tabBarIcon: ({ color, focused }) => (
            <TabHomeSvg size={iconSize['4xl']} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('nav.notifications'),
          tabBarIcon: ({ color, focused }) => {
            const hasUnread = unreadCount > 0
            return (
              <View
                style={{
                  width: size.controlXs,
                  height: size.controlXs,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TabBellSvg size={iconSize['4xl']} color={color} focused={focused} />
                {hasUnread && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -spacing.xs,
                      right: -spacing.sm,
                      minWidth: size.badgeSm,
                      height: size.badgeSm,
                      borderRadius: radius.md,
                      paddingHorizontal: spacing.xs,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: palette.crimson,
                      borderWidth: border.hairline,
                      borderColor: theme === 'light' ? palette.white : colors.surface,
                    }}
                  >
                    <Text
                      style={{ color: palette.white, fontSize: fontSize.micro, fontWeight: '800' }}
                    >
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
        name="subscriptions"
        options={{
          title: t('nav.subscriptions'),
          tabBarIcon: ({ color }) => (
            <View
              style={{
                width: size.controlXs,
                height: size.controlXs,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Rss size={iconSize['2xl']} color={color} strokeWidth={2.5} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('nav.me'),
          tabBarIcon: ({ color, focused }) => {
            const uri = currentUser?.avatarUrl ? getImageUrl(currentUser.avatarUrl) : null
            if (uri) {
              return (
                <View
                  style={{
                    width: size.controlXs,
                    height: size.controlXs,
                    borderRadius: radius.full,
                    borderWidth: border.active,
                    borderColor: focused ? colors.primary : colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: size.avatarXs, height: size.avatarXs, borderRadius: radius.lg }}
                    contentFit="cover"
                  />
                </View>
              )
            }
            return <TabMeSvg size={iconSize['4xl']} color={color} focused={focused} />
          },
        }}
      />
    </Tabs>
  )
}
