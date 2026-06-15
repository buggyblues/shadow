import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { Tabs } from 'expo-router'
import { Rss, Search } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabBellSvg, TabHomeSvg, TabMeSvg } from '../../../src/components/common/cat-svg'
import { useUnreadCount } from '../../../src/hooks/use-unread-count'
import { getImageUrl } from '../../../src/lib/api'
import { selectionHaptic } from '../../../src/lib/haptics'
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
        tabBarIconStyle: {
          marginTop: -spacing.xxs,
        },
        tabBarItemStyle: {
          paddingVertical: spacing.xxs,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
      tabBar={(props) => (
        <FloatingGlassTabBar {...props} theme={theme} searchLabel={t('common.search')} />
      )}
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
                      borderColor: colors.frostedPanelStrong,
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
                    borderColor: focused ? colors.primary : color,
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

function FloatingGlassTabBar({
  state,
  descriptors,
  navigation,
  theme,
  searchLabel,
}: BottomTabBarProps & { theme: 'dark' | 'light'; searchLabel: string }) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const requestHomeCommandPalette = useUIStore((s) => s.requestHomeCommandPalette)
  const isHomeRoute = state.routes[state.index]?.name === 'index'
  const glassTint = isHomeRoute || colors.mode === 'dark' ? 'dark' : 'light'
  const glassIntensity = isHomeRoute ? 42 : colors.mode === 'dark' ? 42 : 58
  const searchGlassIntensity = isHomeRoute ? 46 : colors.mode === 'dark' ? 46 : 62
  const glassBackgroundColor = isHomeRoute ? colors.frostedPanelMuted : colors.frostedPanel
  const glassBorderColor = isHomeRoute
    ? palette.lineDark
    : colors.mode === 'dark'
      ? colors.frostedBorder
      : colors.frostedPanelStrong
  const glassStrokeColor = isHomeRoute ? palette.lineDark : colors.frostedBorder
  const glassSheenColor = isHomeRoute ? colors.frostedPanel : colors.frostedPanelMuted
  const activeTabColor = isHomeRoute ? palette.cyan : colors.primary
  const inactiveTabColor = isHomeRoute ? palette.neutral400 : colors.textMuted

  return (
    <View
      pointerEvents="box-none"
      style={[styles.floatingTabRoot, { bottom: Math.max(insets.bottom, spacing.md) }]}
    >
      <View
        style={[
          styles.floatingTabPill,
          {
            borderColor: glassBorderColor,
            shadowColor: colors.shadowStrong,
            shadowOpacity: isHomeRoute ? 0.48 : theme === 'light' ? 0.16 : 0.48,
          },
        ]}
      >
        <BlurView
          pointerEvents="none"
          intensity={glassIntensity}
          tint={glassTint}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: glassBackgroundColor }]}
        />
        <View
          pointerEvents="none"
          style={[styles.floatingGlassSheen, { backgroundColor: glassSheenColor }]}
        />
        <View
          pointerEvents="none"
          style={[styles.floatingGlassInnerStroke, { borderColor: glassStrokeColor }]}
        />
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options ?? {}
          const focused = state.index === index
          const color = focused ? activeTabColor : inactiveTabColor
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name)
          const accessibilityLabel =
            options.tabBarAccessibilityLabel ?? (typeof label === 'string' ? label : route.name)

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                selectionHaptic()
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params)
                }
              }}
              onLongPress={() => {
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                })
              }}
              style={({ pressed }) => [
                styles.floatingTabItem,
                pressed ? styles.floatingPressed : null,
              ]}
            >
              <View style={styles.floatingTabIcon}>
                {options.tabBarIcon?.({ focused, color, size: iconSize['4xl'] })}
              </View>
              <Text style={[styles.floatingTabLabel, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.floatingSearchSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searchLabel}
          hitSlop={spacing.sm}
          onPress={() => {
            selectionHaptic()
            requestHomeCommandPalette()
            if (state.routes[state.index]?.name !== 'index') {
              navigation.navigate('index')
            }
          }}
          style={({ pressed }) => [
            styles.floatingSearchButton,
            {
              borderColor: glassBorderColor,
              shadowColor: colors.shadowStrong,
              shadowOpacity: isHomeRoute ? 0.5 : theme === 'light' ? 0.18 : 0.5,
            },
            pressed ? styles.floatingPressed : null,
          ]}
        >
          <BlurView
            pointerEvents="none"
            intensity={searchGlassIntensity}
            tint={glassTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: glassBackgroundColor }]}
          />
          <View
            pointerEvents="none"
            style={[styles.floatingGlassSheen, { backgroundColor: glassSheenColor }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.floatingGlassInnerStroke,
              styles.floatingGlassOrbStroke,
              { borderColor: glassStrokeColor },
            ]}
          />
          <Search size={iconSize['4xl']} color={activeTabColor} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  floatingTabRoot: {
    position: 'absolute',
    left: spacing.none,
    right: spacing.none,
    width: '100%',
    paddingHorizontal: spacing.md,
    zIndex: 80,
    elevation: 80,
    minHeight: size.plusPanelIconLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  floatingTabPill: {
    flex: 1,
    height: size.plusPanelIconLg,
    borderRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.sm },
    elevation: 12,
  },
  floatingGlassSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingGlassInnerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
  },
  floatingGlassOrbStroke: {
    borderRadius: radius.full,
  },
  floatingTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  floatingPressed: {
    transform: [{ scale: 0.96 }],
  },
  floatingTabIcon: {
    height: size.controlXs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingTabLabel: {
    fontSize: fontSize.micro,
    fontWeight: '800',
  },
  floatingSearchSlot: {
    width: size.plusPanelIconLg,
    height: size.plusPanelIconLg,
  },
  floatingSearchButton: {
    zIndex: 21,
    width: size.plusPanelIconLg,
    height: size.plusPanelIconLg,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.sm },
    elevation: 12,
  },
})
