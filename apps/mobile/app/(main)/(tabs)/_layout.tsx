import { Tabs, useRouter } from 'expo-router'
import { Bot, Compass, MessageSquare, Plus, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { HeaderButton, HeaderButtonGroup } from '../../../src/components/common/header-button'
import { NotificationBell } from '../../../src/components/notification/notification-bell'
import { useColors } from '../../../src/theme'

export default function TabsLayout() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerBackVisible: false,
        headerBackTitle: '',
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.community', '社区'),
          tabBarIcon: ({ color }) => <MessageSquare size={24} color={color} />,
          headerLeft: () => (
            <HeaderButtonGroup>
              <NotificationBell onPress={() => router.push('/(main)/notifications' as never)} />
            </HeaderButtonGroup>
          ),
          headerRight: () => (
            <HeaderButtonGroup>
              <HeaderButton icon={Plus} onPress={() => router.push('/(main)/create-server')} />
            </HeaderButtonGroup>
          ),
        }}
      />
      <Tabs.Screen
        name="buddies"
        options={{
          title: 'Buddy',
          tabBarIcon: ({ color }) => <Bot size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t('discover.title', '发现'),
          tabBarIcon: ({ color }) => <Compass size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('nav.me', '我'),
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
    </Tabs>
  )
}
