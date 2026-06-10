import { Stack, useRootNavigationState, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AppState } from 'react-native'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { VoiceSessionProvider } from '../../src/components/voice/voice-session-provider'
import { fetchApi } from '../../src/lib/api'
import {
  registerRemotePushToken,
  setupAndroidChannel,
  setupNotificationResponseListener,
  showMessageNotification,
} from '../../src/lib/notifications'
import { connectSocket, disconnectSocket, getSocket } from '../../src/lib/socket'
import { useAuthStore } from '../../src/stores/auth.store'
import { useChatStore } from '../../src/stores/chat.store'
import { iconSize, useColors } from '../../src/theme'

export default function MainLayout() {
  const colors = useColors()
  const { t } = useTranslation()
  const router = useRouter()
  const rootNavigationState = useRootNavigationState()
  const { setUser, isAuthenticated, accessToken, logout, isLoading } = useAuthStore()
  const navigationReady = !!rootNavigationState?.key

  useEffect(() => {
    if (isLoading || !navigationReady) return

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
    const socket = getSocket()
    const handleSessionRevoked = () => {
      Alert.alert(t('settings.sessionRevokedTitle'), t('settings.sessionRevokedNotice'), [
        {
          text: t('common.ok'),
          onPress: () => {
            disconnectSocket()
            logout()
            router.replace('/(auth)/login')
          },
        },
      ])
    }
    socket.on('auth:session-revoked', handleSessionRevoked)

    // Set up notifications
    setupAndroidChannel()
    registerRemotePushToken().catch(() => null)
    const cleanupResponse = setupNotificationResponseListener()

    return () => {
      socket.off('auth:session-revoked', handleSessionRevoked)
      disconnectSocket()
      cleanupResponse()
    }
  }, [accessToken, isAuthenticated, isLoading, logout, navigationReady, router, setUser, t])

  // Listen for new messages via socket and show local notifications
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    const s = getSocket()

    const handleMessageCreated = (msg: {
      id: string
      channelId: string
      content: string
      authorId?: string
      author?: { id?: string; displayName?: string; username?: string } | null
      channel?: { name?: string; server?: { slug?: string } } | null
    }) => {
      const { activeChannelId } = useChatStore.getState()
      const currentUserId = useAuthStore.getState().user?.id

      // Never notify for own messages
      const senderId = msg.authorId ?? msg.author?.id
      if (senderId && currentUserId && senderId === currentUserId) return

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
        size={iconSize['2xl']}
      />
    </HeaderButtonGroup>
  )

  return (
    <VoiceSessionProvider>
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
        <Stack.Screen name="friends" options={{ headerShown: false }} />
        <Stack.Screen name="friends/new-friends" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="create-server" options={{ headerShown: true, title: '', headerLeft }} />
        <Stack.Screen name="create-buddy" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="scan" options={{ headerShown: false }} />
        <Stack.Screen
          name="buddy-management"
          options={{ headerShown: true, title: '', headerLeft }}
        />
        <Stack.Screen
          name="webview-preview"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="profile/[userId]"
          options={{ headerShown: true, title: '', headerLeft }}
        />
        <Stack.Screen name="media-preview" options={{ headerShown: true, title: '', headerLeft }} />
        <Stack.Screen
          name="discover"
          options={{ headerShown: true, title: t('discover.title'), headerLeft }}
        />
        <Stack.Screen
          name="notifications"
          options={{ headerShown: true, title: '通知', headerLeft }}
        />
      </Stack>
    </VoiceSessionProvider>
  )
}
