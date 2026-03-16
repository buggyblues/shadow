import { Stack, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { fetchApi } from '../../src/lib/api'
import {
  requestNotificationPermissions,
  setupAndroidChannel,
  setupNotificationResponseListener,
  showMessageNotification,
} from '../../src/lib/notifications'
import { connectSocket, disconnectSocket, getSocket } from '../../src/lib/socket'
import { useAuthStore } from '../../src/stores/auth.store'
import { useChatStore } from '../../src/stores/chat.store'
import { useColors } from '../../src/theme'

export default function MainLayout() {
  const colors = useColors()
  const router = useRouter()
  const { setUser, isAuthenticated, accessToken } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login')
      return
    }

    // Fetch user profile
    fetchApi<{
      id: string
      email: string
      username: string
      displayName: string | null
      avatarUrl: string | null
    }>('/api/auth/me')
      .then((u) => setUser(u))
      .catch(() => {
        // token might be invalid
      })

    // Connect WebSocket
    if (accessToken) {
      connectSocket()
    }

    // Set up notifications
    setupAndroidChannel()
    requestNotificationPermissions()
    const cleanupResponse = setupNotificationResponseListener()

    return () => {
      disconnectSocket()
      cleanupResponse()
    }
  }, [accessToken, isAuthenticated, router, setUser])

  // Listen for new messages via socket and show local notifications
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    const s = getSocket()

    const handleMessageCreated = (msg: {
      id: string
      channelId: string
      content: string
      author?: { displayName?: string; username?: string } | null
      channel?: { name?: string; server?: { slug?: string } } | null
    }) => {
      const activeChannelId = useChatStore.getState().activeChannelId
      // Only show notification if user is not viewing the channel, or app is in background
      if (msg.channelId === activeChannelId && AppState.currentState === 'active') return

      const senderName = msg.author?.displayName || msg.author?.username || 'Someone'
      const content = msg.content?.slice(0, 100) || ''

      showMessageNotification({
        channelId: msg.channelId,
        serverSlug: msg.channel?.server?.slug,
        channelName: msg.channel?.name,
        senderName,
        content,
      })
    }

    s.on('message:new', handleMessageCreated)
    s.on('message:created', handleMessageCreated)
    return () => {
      s.off('message:new', handleMessageCreated)
      s.off('message:created', handleMessageCreated)
    }
  }, [isAuthenticated, accessToken])

  const headerLeft = () => (
    <HeaderButtonGroup>
      <HeaderButton
        icon={ChevronLeft}
        onPress={() => router.back()}
        color={colors.text}
        size={22}
      />
    </HeaderButtonGroup>
  )

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerBackVisible: false,
        headerBackTitle: '',
        headerLeft,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="servers/[serverSlug]" />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="create-server" options={{ headerShown: true, title: '', headerLeft }} />
      <Stack.Screen name="my-rentals" options={{ headerShown: true, title: '', headerLeft }} />
      <Stack.Screen
        name="buddy-management"
        options={{ headerShown: true, title: '', headerLeft }}
      />
      <Stack.Screen
        name="buddy-detail/[listingId]"
        options={{ headerShown: true, title: '', headerLeft }}
      />
      <Stack.Screen
        name="profile/[userId]"
        options={{ headerShown: true, title: '', headerLeft }}
      />
      <Stack.Screen
        name="contract-detail/[contractId]"
        options={{ headerShown: true, title: '', headerLeft }}
      />
      <Stack.Screen
        name="create-listing/[listingId]"
        options={{ headerShown: true, title: '', headerLeft }}
      />
      <Stack.Screen name="media-preview" options={{ headerShown: true, title: '', headerLeft }} />
      <Stack.Screen name="discover" options={{ headerShown: true, title: '', headerLeft }} />
      <Stack.Screen
        name="notifications"
        options={{ headerShown: true, title: '通知', headerLeft }}
      />
    </Stack>
  )
}
